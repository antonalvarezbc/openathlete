import { z } from 'zod';

const nonnegative = z.number().finite().nonnegative();
export const manualGarminPayload = z.object({
  ok: z.literal(true),
  activities: z
    .array(
      z
        .object({
          id: z.string().regex(/^\d+$/),
          name: z.string().min(1).max(1000),
          startDate: z.string().datetime({ offset: true }),
          endDate: z.string().datetime({ offset: true }),
          sport: z.string(),
          distance: nonnegative,
          elevationGain: nonnegative,
          movingTime: nonnegative.int().max(2147483647),
          averageSpeed: nonnegative,
          maxSpeed: nonnegative,
          averageHeartrate: nonnegative.nullable(),
          maxHeartrate: nonnegative.nullable(),
        })
        .refine((a) => new Date(a.endDate) >= new Date(a.startDate)),
    )
    .max(100),
  metrics: z
    .array(
      z.object({
        date: z.string().date(),
        type: z.enum([
          'HR_REST',
          'PULSE_OX_AVG',
          'PULSE_OX_MIN',
          'FITNESS_AGE',
          'HR_MIN_DAILY',
          'HR_MAX_DAILY',
          'STRESS_AVERAGE',
          'STRESS_MAX',
          'STRESS_DURATION',
          'STRESS_REST_DURATION',
          'STRESS_ACTIVITY_DURATION',
          'STRESS_LOW_DURATION',
          'STRESS_MEDIUM_DURATION',
          'STRESS_HIGH_DURATION',
          'BODY_BATTERY_CHARGED',
          'BODY_BATTERY_DRAINED',
          'DAILY_CALORIES',
          'DAILY_ACTIVE_CALORIES',
          'DAILY_BMR_CALORIES',
          'DAILY_STEPS',
          'DAILY_DISTANCE',
          'DAILY_ACTIVE_MINUTES',
          'DAILY_MODERATE_MINUTES',
          'DAILY_VIGOROUS_MINUTES',
          'DAILY_FLOORS',
          'SLEEP_RESPIRATION_AVG',
          'NAP_DURATION',
          'WEIGHT',
          'BMI',
          'BODY_FAT',
          'BODY_WATER',
          'BONE_MASS',
          'MUSCLE_MASS',
          'VO2MAX',
          'VO2MAX_CYCLING',
          'BLOOD_PRESSURE_SYSTOLIC',
          'BLOOD_PRESSURE_DIASTOLIC',
          'BLOOD_PRESSURE_PULSE',
          'HRV_LAST_NIGHT_AVG',
          'HRV_LAST_NIGHT_5MIN_HIGH',
          'SLEEP_DURATION',
          'SLEEP_DEEP_DURATION',
          'SLEEP_LIGHT_DURATION',
          'SLEEP_REM_DURATION',
          'SLEEP_AWAKE_DURATION',
          'SLEEP_SCORE',
        ]),
        value: nonnegative,
      }),
    )
    .max(350),
  warnings: z.array(z.string().max(100)).max(101),
});

export const manualGarminConnection = z.object({
  athleteId: z.number().int().positive(),
  garminUserProfileId: z.string().regex(/^\d+$/),
  timezone: z.string().min(1),
});
