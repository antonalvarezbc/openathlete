"""Explicit FIT backfill worker. NDJSON progress + per-file stdin acknowledgements."""
import json
import logging
import os
import re
import select
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fit_files import MAX_FIT_BYTES, fit_bytes
from request_safety import (OperationStopped, RequestSafety, classify_error,
                            manual_client, operation_lock)

ROOT = Path(__file__).resolve().parent
MAX_REVIEWS = 100
MAX_DOWNLOADS = 20
REQUEST_INTERVAL_SECONDS = 15


def output(message):
    print(json.dumps(message, allow_nan=False), flush=True)


def read_ack(cancelled):
    # The parent must persist/import each file before permitting the next one.
    while not cancelled():
        ready, _, _ = select.select([sys.stdin], [], [], 1)
        if ready:
            return sys.stdin.readline(32).strip() == 'continue'
    return False


def run(private, ids, run_id, lock_directory=None, emit=output, acknowledge=None,
        client_factory=manual_client, safety_factory=RequestSafety):
    if (not isinstance(ids, list) or len(ids) > MAX_REVIEWS or
            any(not isinstance(item, str) or not re.fullmatch(r'[1-9]\d*', item) for item in ids) or
            not isinstance(run_id, str) or not re.fullmatch(r'[a-fA-F0-9-]{36}', run_id)):
        raise ValueError('InvalidInput')
    private = Path(private)
    parent_pid = os.getppid()
    # If the API dies before the first ACK, an orphan must not keep querying.
    cancelled = lambda: (os.getppid() != parent_pid or
                         (private / ('backfill-' + run_id + '.cancel')).exists())
    acknowledge = acknowledge or (lambda: read_ack(cancelled))
    lock_directory = Path(lock_directory or private)
    with operation_lock(lock_directory):
        safety = safety_factory(lock_directory, interval=REQUEST_INTERVAL_SECONDS,
                                cancelled=cancelled, emit=emit)
        connection = json.loads((private / 'connection.json').read_text())
        profile = str(connection['garminUserProfileId'])
        if not re.fullmatch(r'[1-9]\d*', profile):
            raise ValueError('AccountMismatch')
        directory = private / 'fits' / profile
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        client = None
        downloads = 0
        try:
            for activity_id in dict.fromkeys(ids):
                safety.check_cancelled()
                target = directory / (activity_id + '.fit')
                cached = target.exists()
                if not cached:
                    if downloads >= MAX_DOWNLOADS:
                        emit({'type': 'done', 'reason': 'BUDGET'})
                        return
                    if client is None:
                        client = client_factory(safety)
                        client.login(str(private / 'tokens'))
                        today = datetime.now(ZoneInfo(connection['timezone'])).date().isoformat()
                        identity = client.get_rhr_day(today)
                        if str((identity or {}).get('userProfileId')) != profile:
                            raise ValueError('AccountMismatch')
                try:
                    if cached:
                        if target.stat().st_size > MAX_FIT_BYTES:
                            raise ValueError('FitSize')
                        fit_bytes(target.read_bytes())
                    else:
                        safety.check_cancelled()
                        downloads += 1
                        data = fit_bytes(client.download_activity(activity_id, dl_fmt=client.ActivityDownloadFormat.ORIGINAL))
                        temporary = target.with_suffix('.tmp')
                        with open(temporary, 'wb') as handle:
                            os.chmod(temporary, 0o600)
                            handle.write(data)
                        temporary.replace(target)
                except Exception as exc:
                    reason, retry_after = safety.fail(exc)
                    if cached:
                        target.unlink(missing_ok=True)
                    # Provider errors stop immediately; no other ID is attempted.
                    emit({'type': 'fit', 'id': activity_id, 'ready': False, 'cached': cached})
                    acknowledge()
                    message = {'type': 'done', 'reason': reason}
                    if retry_after is not None:
                        message['retryAfterSeconds'] = retry_after
                    emit(message)
                    return
                emit({'type': 'fit', 'id': activity_id, 'ready': True, 'cached': cached})
                if not acknowledge():
                    raise OperationStopped('CANCELLED')
            emit({'type': 'done', 'reason': 'COMPLETE'})
        except Exception as exc:
            reason, retry_after = safety.fail(exc)
            message = {'type': 'done', 'reason': reason}
            if retry_after is not None:
                message['retryAfterSeconds'] = retry_after
            emit(message)


def main():
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    try:
        private = Path(os.environ.get('OA_GARMIN_PRIVATE_DIR', str(ROOT / '.private')))
        run(private, json.loads(os.environ['OA_GARMIN_BACKFILL_IDS']),
            os.environ['OA_GARMIN_BACKFILL_RUN_ID'],
            os.environ.get('OA_GARMIN_LOCK_DIRECTORY'))
    except Exception as exc:
        reason, retry_after = classify_error(exc)
        message = {'type': 'done', 'reason': reason}
        if retry_after is not None:
            message['retryAfterSeconds'] = retry_after
        output(message)


if __name__ == '__main__':
    main()
