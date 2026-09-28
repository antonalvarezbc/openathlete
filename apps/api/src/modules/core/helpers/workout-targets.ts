import { BadRequestException } from '@nestjs/common';

import type { MetricType, Prisma } from '@openathlete/database';
import {
  CreateWorkoutStepDto,
  SPORT_TYPE,
  WorkoutTargetError,
  mapWorkoutTargets,
  portableWorkoutTargets,
  resolveWorkoutTarget,
  validateWorkoutTarget,
} from '@openathlete/shared';

/** Call only after authorizing access to the event/template and destination athlete. */
export async function prepareWorkoutTargets<T extends CreateWorkoutStepDto>(
  db: Prisma.TransactionClient,
  steps: T[],
  options: {
    athleteId?: number | null;
    sport: `${SPORT_TYPE}`;
    portable?: boolean;
    absolute?: boolean;
    allowedLegacyZoneIds?: number[];
  },
): Promise<T[]> {
  try {
    const zoneIds: number[] = [];
    const metricTypes = new Set<string>();
    let needsZones = false;
    mapWorkoutTargets(steps, (target) => {
      validateWorkoutTarget(target);
      if (target.targetType === 'ZONE') {
        needsZones = true;
        if (!target.zoneReference && target.targetValue != null) {
          if (
            options.allowedLegacyZoneIds &&
            !options.allowedLegacyZoneIds.includes(target.targetValue)
          ) {
            throw new WorkoutTargetError(
              'WORKOUT_TARGET_MISSING_ZONE',
              String(target.targetValue),
            );
          }
          zoneIds.push(target.targetValue);
        }
      }
      if (target.metricType) {
        if (target.metricType === 'HR_RESERVE') {
          metricTypes.add('HR_MAX');
          metricTypes.add('HR_REST');
        } else metricTypes.add(target.metricType);
      }
      return target;
    });
    // An owned legacy template may still contain the source athlete's zone IDs.
    // Read only those stored references when making that template portable.
    const zones = needsZones
      ? await db.trainingZone.findMany({
          where: options.portable
            ? {
                trainingZoneId: { in: zoneIds },
                ...(options.athleteId ? { athleteId: options.athleteId } : {}),
              }
            : { athleteId: options.athleteId ?? -1 },
          include: { values: true },
        })
      : [];
    if (options.portable) return portableWorkoutTargets(steps, zones);
    const metrics: Record<string, { value: number }> = {};
    if (options.athleteId && metricTypes.size) {
      const rows = await db.athleteMetric.findMany({
        where: {
          athleteId: options.athleteId,
          type: { in: [...metricTypes] as MetricType[] },
        },
        orderBy: [{ date: 'desc' }, { athleteMetricId: 'desc' }],
        distinct: ['type'],
      });
      for (const row of rows) metrics[row.type] ??= { value: row.value };
    }
    return mapWorkoutTargets(steps, (target) =>
      resolveWorkoutTarget(
        target,
        { zones, metrics, sport: options.sport },
        options.absolute,
      ),
    );
  } catch (error) {
    if (error instanceof WorkoutTargetError) {
      throw new BadRequestException({
        code: error.code,
        reference: error.reference,
        message: error.message,
      });
    }
    throw error;
  }
}
