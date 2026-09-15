"""Non-interactive worker for the optional OA manual connector; stdout is JSON."""
import json
import logging
import os
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from health_metrics import (number, metric, map_fields, DAILY_FIELDS, map_body, map_vo2,
                            map_blood_pressure, optional_read)

ROOT = Path(__file__).resolve().parent


def collect_sync(client, connection, today):
    # Validate identity before fetching or returning any importable data.
    rhr_today = client.get_rhr_day(today.isoformat())
    if str(rhr_today.get('userProfileId')) != str(connection['garminUserProfileId']):
        raise ValueError('AccountMismatch')
    activities = client.get_activities(0, 100)
    if not isinstance(activities, list):
        raise ValueError('InvalidActivities')
    result = {'activities': [], 'metrics': [], 'warnings': []}
    if len(activities) == 100:
        result['warnings'].append('ActivityLimit100')
    cutoff = (today - timedelta(days=30)).isoformat()
    for item in activities:
        if str(item.get('ownerId')) != str(connection['garminUserProfileId']):
            raise ValueError('AccountMismatch')
        start = item.get('startTimeGMT')
        if not isinstance(start, str) or start[:10] < cutoff:
            continue
        start_dt = datetime.fromisoformat(start.replace('Z', '+00:00'))
        if start_dt.tzinfo is None:
            from datetime import timezone
            start_dt = start_dt.replace(tzinfo=timezone.utc)
        duration = number(item.get('duration'))
        if duration is None:
            result['warnings'].append('ActivityMissingDuration')
            continue
        result['activities'].append({
            'id': str(item['activityId']), 'name': item.get('activityName') or 'Garmin activity',
            'startDate': start_dt.isoformat(),
            'endDate': (start_dt + timedelta(seconds=number(item.get('elapsedDuration')) or duration)).isoformat(),
            'sport': item.get('activityType', {}).get('typeKey', 'other').upper(),
            'distance': number(item.get('distance')) or 0,
            'elevationGain': number(item.get('elevationGain')) or 0,
            'movingTime': round(number(item.get('movingDuration')) if number(item.get('movingDuration')) is not None else duration),
            'averageSpeed': number(item.get('averageSpeed')) or 0,
            'maxSpeed': number(item.get('maxSpeed')) or 0,
            'averageHeartrate': number(item.get('averageHR')),
            'maxHeartrate': number(item.get('maxHR')),
        })
    for offset in range(6, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        daily = client.get_stats(day) or {}
        if daily.get('calendarDate') == day:
            map_fields(result['metrics'], day, daily, DAILY_FIELDS)
        hrv = (client.get_hrv_data(day) or {}).get('hrvSummary') or {}
        if hrv.get('calendarDate') == day:
            metric(result['metrics'], day, 'HRV_LAST_NIGHT_AVG', hrv.get('lastNightAvg'))
            metric(result['metrics'], day, 'HRV_LAST_NIGHT_5MIN_HIGH', hrv.get('lastNight5MinHigh'))
        sleep = (client.get_sleep_data(day) or {}).get('dailySleepDTO') or {}
        if sleep.get('calendarDate') == day:
            for field, kind in [('sleepTimeSeconds', 'SLEEP_DURATION'), ('deepSleepSeconds', 'SLEEP_DEEP_DURATION'),
                                ('lightSleepSeconds', 'SLEEP_LIGHT_DURATION'), ('remSleepSeconds', 'SLEEP_REM_DURATION'),
                                ('awakeSleepSeconds', 'SLEEP_AWAKE_DURATION')]:
                metric(result['metrics'], day, kind, sleep.get(field), 3600)
            metric(result['metrics'], day, 'SLEEP_SCORE', ((sleep.get('sleepScores') or {}).get('overall') or {}).get('value'))
            metric(result['metrics'], day, 'SLEEP_RESPIRATION_AVG', sleep.get('averageRespirationValue'))
            metric(result['metrics'], day, 'NAP_DURATION', sleep.get('napTimeSeconds'), 3600)
    start, end = (today - timedelta(days=6)).isoformat(), today.isoformat()
    for label, method, mapper in [
        ('body', client.get_body_composition, map_body),
        ('vo2', client.get_max_metrics_range, map_vo2),
        ('blood_pressure', client.get_blood_pressure, map_blood_pressure),
    ]:
        data = optional_read(result, label, method, start, end)
        if data is not None:
            mapper(result['metrics'], data, start, end)
    age = optional_read(result, 'fitness_age', client.get_fitnessage_data, end)
    if isinstance(age, dict):
        metric(result['metrics'], end, 'FITNESS_AGE', age.get('fitnessAge'))
    # A single row per type/date; preserve the last actual measurement of the day.
    result['metrics'] = list({(m['date'], m['type']): m for m in result['metrics']}.values())
    return result


def main():
    logging.disable(logging.CRITICAL)
    os.umask(0o077)
    try:
        from garminconnect import Garmin
        connection = json.loads((ROOT / '.private/connection.json').read_text())
        client = Garmin(retry_attempts=0)
        client.login(str(ROOT / '.private/tokens'))
        result = collect_sync(client, connection, datetime.now(ZoneInfo(connection['timezone'])).date())
        print(json.dumps({'ok': True, **result}, allow_nan=False))
    except Exception as exc:
        # No credentials, exception messages, traces or raw Garmin payloads on stdout.
        code = 'AccountMismatch' if isinstance(exc, ValueError) and str(exc) == 'AccountMismatch' else type(exc).__name__
        print(json.dumps({'ok': False, 'code': code}))


if __name__ == '__main__':
    main()
