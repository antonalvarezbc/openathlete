"""Non-interactive worker: send planned OA workouts to Garmin Connect; stdout is JSON.

stdin carries one JSON line: {"operations": [...]}, built by the OA API.
- upsert: {"key", "action": "upsert", "workout", "date", "workoutId"?, "scheduleId"?, "previousDate"?}
  Updates the Garmin workout in place when it still exists, otherwise creates it,
  and (re)schedules it on "date".
- delete: {"key", "action": "delete", "workoutId"?, "scheduleId"?}
  Removes the calendar entry and the workout; already missing items count as removed.
One login and one identity check cover the whole batch. A workout Garmin rejects
does not stop the others; throttling, authentication and transport errors do.
"""
import json
import logging
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from request_safety import RequestSafety, classify_error, manual_client, operation_lock

ROOT = Path(__file__).resolve().parent
MAX_OPERATIONS = 14
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
ID = re.compile(r'^\d{1,20}$')


def read_operations():
    line = sys.stdin.readline(2_000_000)
    if not line or len(line) >= 2_000_000:
        raise ValueError('InvalidInput')
    operations = json.loads(line).get('operations')
    if not isinstance(operations, list) or not 0 < len(operations) <= MAX_OPERATIONS:
        raise ValueError('InvalidInput')
    for op in operations:
        if not isinstance(op, dict) or not isinstance(op.get('key'), str):
            raise ValueError('InvalidInput')
        for field in ('workoutId', 'scheduleId'):
            if op.get(field) is not None and not ID.match(str(op[field])):
                raise ValueError('InvalidInput')
        if op.get('action') == 'upsert':
            if not isinstance(op.get('workout'), dict) or not DATE.match(str(op.get('date'))):
                raise ValueError('InvalidInput')
        elif op.get('action') != 'delete':
            raise ValueError('InvalidInput')
    return operations


def is_missing(error):
    return type(error).__name__ == 'GarminConnectNotFoundError'


def rejected(error):
    """A 4xx about this workout's content, not about the session or the rate."""
    response = getattr(error, 'response', None)
    status = getattr(response, 'status_code', None)
    if status is None:
        match = re.match(r'API Error (\d{3})', str(error))
        status = int(match.group(1)) if match else None
    return status is not None and 400 <= status < 500 and status not in (401, 403, 429)


def upsert(client, op):
    workout_id = op.get('workoutId')
    updated = False
    if workout_id:
        try:
            client.update_workout(workout_id, op['workout'])
            updated = True
        except Exception as exc:
            if not is_missing(exc):
                raise
            workout_id = None  # deleted in Garmin: create it again
    if not workout_id:
        created = client.upload_workout(op['workout'])
        workout_id = str(created['workoutId'])
    schedule_id = op.get('scheduleId')
    if not (updated and schedule_id and op.get('previousDate') == op['date']):
        if schedule_id:
            try:
                client.unschedule_workout(schedule_id)
            except Exception as exc:
                if not is_missing(exc):
                    raise
        scheduled = client.schedule_workout(workout_id, op['date']) or {}
        schedule_id = scheduled.get('workoutScheduleId')
        if schedule_id is None:
            raise ValueError('MissingSchedule')
    return {'workoutId': str(workout_id), 'scheduleId': str(schedule_id)}


def delete(client, op):
    for remove, value in ((client.unschedule_workout, op.get('scheduleId')),
                          (client.delete_workout, op.get('workoutId'))):
        if not value:
            continue
        try:
            remove(value)
        except Exception as exc:
            if not is_missing(exc):
                raise
    return {}


def run(client, safety, operations):
    results = []
    stopped = None
    for op in operations:
        if stopped:
            results.append({'key': op['key'], 'ok': False, 'code': 'NotAttempted'})
            continue
        try:
            action = upsert if op['action'] == 'upsert' else delete
            results.append({'key': op['key'], 'ok': True, **action(client, op)})
        except Exception as exc:
            if rejected(exc) and classify_error(exc)[0] == 'ERROR':
                # The payload was refused; the session is fine for the next one.
                safety.stopped = None
                results.append({'key': op['key'], 'ok': False, 'code': 'Rejected'})
                continue
            safety.fail(exc)
            stopped = exc
            results.append({'key': op['key'], 'ok': False, 'code': 'ProviderError'})
    return results, stopped


def main():
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    try:
        operations = read_operations()
        private = Path(os.environ.get('OA_GARMIN_PRIVATE_DIR', str(ROOT / '.private')))
        lock_directory = Path(os.environ.get('OA_GARMIN_LOCK_DIRECTORY', str(private)))
        with operation_lock(lock_directory):
            safety = RequestSafety(lock_directory)
            try:
                connection = json.loads((private / 'connection.json').read_text())
                client = manual_client(safety)
                client.login(str(private / 'tokens'))
                # Never write to a Garmin account other than the linked one.
                today = datetime.now(ZoneInfo(connection['timezone'])).date().isoformat()
                if str((client.get_rhr_day(today) or {}).get('userProfileId')) != str(connection['garminUserProfileId']):
                    raise ValueError('AccountMismatch')
            except Exception as exc:
                safety.fail(exc)
                raise
            results, stopped = run(client, safety, operations)
            message = {'ok': True, 'results': results}
            if stopped is not None:
                reason, retry_after = classify_error(stopped)
                message['stopCode'] = {'RATE_LIMIT': 'RateLimited', 'AUTH': 'AuthenticationFailed'}.get(reason, 'ProviderError')
                if retry_after is not None:
                    message['retryAfterSeconds'] = retry_after
            print(json.dumps(message))
    except Exception as exc:
        # No credentials, exception messages, traces or raw Garmin payloads on stdout.
        reason, retry_after = classify_error(exc)
        code = {'RATE_LIMIT': 'RateLimited', 'AUTH': 'AuthenticationFailed',
                'BUSY': 'Busy', 'COOLDOWN': 'Cooldown'}.get(reason, 'ProviderError')
        if isinstance(exc, ValueError) and str(exc) == 'InvalidInput':
            code = 'InvalidInput'
        message = {'ok': False, 'code': code}
        if retry_after is not None:
            message['retryAfterSeconds'] = retry_after
        print(json.dumps(message))


if __name__ == '__main__':
    main()
