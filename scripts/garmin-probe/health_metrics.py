"""Garmin Connect field mappings. No inferred physiological values.

Sources: garminconnect.typed.DailyStats; garminconnect get_* range methods;
https://github.com/cyberjunky/ha-garmin (client.py: unit conversions, BP);
OpenAthlete official Garmin mapper (destination units).
"""
from datetime import date
import math


def number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0 else None


def metric(target, day, kind, value, divisor=1):
    value = number(value)
    if value is not None:
        target.append({'date': day, 'type': kind, 'value': value / divisor})


DAILY_FIELDS = {
    'restingHeartRate': ('HR_REST', 1),
    'averageSpo2': ('PULSE_OX_AVG', 1),
    'lowestSpo2': ('PULSE_OX_MIN', 1),
    'minHeartRate': ('HR_MIN_DAILY', 1),
    'maxHeartRate': ('HR_MAX_DAILY', 1),
    'averageStressLevel': ('STRESS_AVERAGE', 1),
    'maxStressLevel': ('STRESS_MAX', 1),
    'stressDuration': ('STRESS_DURATION', 60),
    'restStressDuration': ('STRESS_REST_DURATION', 60),
    'activityStressDuration': ('STRESS_ACTIVITY_DURATION', 60),
    'lowStressDuration': ('STRESS_LOW_DURATION', 60),
    'mediumStressDuration': ('STRESS_MEDIUM_DURATION', 60),
    'highStressDuration': ('STRESS_HIGH_DURATION', 60),
    'bodyBatteryChargedValue': ('BODY_BATTERY_CHARGED', 1),
    'bodyBatteryDrainedValue': ('BODY_BATTERY_DRAINED', 1),
    'totalKilocalories': ('DAILY_CALORIES', 1),
    'activeKilocalories': ('DAILY_ACTIVE_CALORIES', 1),
    'bmrKilocalories': ('DAILY_BMR_CALORIES', 1),
    'totalSteps': ('DAILY_STEPS', 1),
    'totalDistanceMeters': ('DAILY_DISTANCE', 1000),
    'activeSeconds': ('DAILY_ACTIVE_MINUTES', 60),
    'moderateIntensityMinutes': ('DAILY_MODERATE_MINUTES', 1),
    'vigorousIntensityMinutes': ('DAILY_VIGOROUS_MINUTES', 1),
    'floorsAscended': ('DAILY_FLOORS', 1),
}
BODY_FIELDS = {
    'weight': ('WEIGHT', 1000), 'bmi': ('BMI', 1),
    'bodyFat': ('BODY_FAT', 1), 'bodyWater': ('BODY_WATER', 1),
    'boneMass': ('BONE_MASS', 1000), 'muscleMass': ('MUSCLE_MASS', 1000),
}


def map_fields(target, day, data, fields):
    for field, (kind, divisor) in fields.items():
        metric(target, day, kind, data.get(field), divisor)


def valid_day(value, start, end):
    if not isinstance(value, str):
        return None
    try:
        day = date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None
    return day if start <= day <= end else None


def map_body(target, data, start, end):
    # Use dated measurements, never the multi-day totalAverage as today's value.
    rows = list(data.get('dateWeightList') or [])
    rows += [(s.get('latestWeight') or {}) for s in data.get('dailyWeightSummaries') or []]
    for row in sorted(rows, key=lambda r: str(r.get('date', ''))):
        day = valid_day(row.get('calendarDate'), start, end)
        if day:
            map_fields(target, day, row, BODY_FIELDS)


def map_vo2(target, data, start, end):
    # get_max_metrics_range returns dated generic/cycling entries.
    for row in data if isinstance(data, list) else []:
        for key, kind in [('generic', 'VO2MAX'), ('cycling', 'VO2MAX_CYCLING')]:
            entry = row.get(key) or {}
            day = valid_day(entry.get('calendarDate'), start, end)
            if day:
                value = entry.get('vo2MaxPreciseValue')
                if number(value) is None:
                    value = entry.get('vo2MaxValue')
                metric(target, day, kind, value)


def map_blood_pressure(target, data, start, end):
    rows = [m for s in data.get('measurementSummaries') or [] for m in s.get('measurements') or []]
    # OA stores one value/day: retain latest dated measurement, not a range high.
    for row in sorted(rows, key=lambda r: str(r.get('measurementTimestampLocal', ''))):
        day = valid_day(row.get('measurementTimestampLocal'), start, end)
        if day:
            map_fields(target, day, row, {
                'systolic': ('BLOOD_PRESSURE_SYSTOLIC', 1),
                'diastolic': ('BLOOD_PRESSURE_DIASTOLIC', 1),
                'pulse': ('BLOOD_PRESSURE_PULSE', 1),
            })


def optional_read(result, label, method, *args):
    """Missing capabilities do not discard activities; auth/rate limits still abort."""
    try:
        return method(*args)
    except Exception as exc:
        status = getattr(getattr(exc, 'response', None), 'status_code', None)
        if type(exc).__name__ in ('GarminConnectAuthenticationError', 'GarminConnectTooManyRequestsError') or status in (401, 403, 429):
            raise
        if type(exc).__name__ == 'GarminConnectNotFoundError' or status in (404, 501):
            result['warnings'].append(f'Unavailable:{label}')
            return None
        raise
