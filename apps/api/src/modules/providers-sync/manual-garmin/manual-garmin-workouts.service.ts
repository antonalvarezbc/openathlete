import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EventType, Prisma } from '@openathlete/database';
import {
  ManualGarminWorkoutResultDto,
  ManualGarminWorkoutStateDto,
  mapPrismaWorkoutToDto,
} from '@openathlete/shared';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { prepareWorkoutTargets } from '../../core/helpers/workout-targets';
import { PrismaService } from '../../prisma/services/prisma.service';
import { backfillActive, readBackfill } from './manual-garmin-backfill-state';
import { manualGarminWorkerEnv } from './manual-garmin-env';
import {
  GarminConnectWorkout,
  ManualGarminStep,
  mapSessionToGarminWorkout,
} from './manual-garmin-workout.mapper';
import { ManualGarminService } from './manual-garmin.service';

const execute = promisify(execFile);

const SESSION_INCLUDE = {
  training: {
    include: {
      workout: {
        include: {
          steps: {
            include: {
              targets: true,
              repeatBlock: {
                include: {
                  childSteps: {
                    include: { targets: true },
                    orderBy: { orderIndex: 'asc' },
                  },
                },
              },
            },
            orderBy: { orderIndex: 'asc' },
          },
        },
      },
    },
  },
  manualGarminWorkoutExport: true,
} satisfies Prisma.EventInclude;

type Session = Prisma.EventGetPayload<{ include: typeof SESSION_INCLUDE }>;
type Connection = NonNullable<
  Awaited<ReturnType<ManualGarminService['connection']>>
>;
type Built = { workout: GarminConnectWorkout; date: string; hash: string };

type Operation =
  | {
      key: string;
      action: 'upsert';
      workout: GarminConnectWorkout;
      date: string;
      workoutId?: string;
      scheduleId?: string;
      previousDate?: string;
    }
  | { key: string; action: 'delete'; workoutId: string; scheduleId: string };

type WorkerReply =
  | {
      ok: true;
      results: {
        key: string;
        ok: boolean;
        code?: string;
        workoutId?: string;
        scheduleId?: string;
      }[];
      stopCode?: string;
      retryAfterSeconds?: number;
    }
  | { ok: false; code: string; retryAfterSeconds?: number };

const RESULT_CODES: Record<string, string> = {
  Rejected: 'GARMIN_WORKOUT_REJECTED',
  NotAttempted: 'GARMIN_WORKOUT_NOT_ATTEMPTED',
  GARMIN_REMOTE_COOLDOWN: 'GARMIN_REMOTE_COOLDOWN',
  GARMIN_LOGIN_REQUIRED: 'GARMIN_LOGIN_REQUIRED',
};

/** YYYY-MM-DD of an instant in the athlete's Garmin time zone. */
export function localDay(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Sends planned sessions to Garmin Connect through the manual connector.
 * Nothing here runs automatically: every send or removal is a user action,
 * and one batch is one Garmin operation (one login, paced requests).
 */
@Injectable()
export class ManualGarminWorkoutsService {
  private readonly logger = new Logger(ManualGarminWorkoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly garmin: ManualGarminService,
  ) {}

  protected async runWorker(
    directory: string,
    operations: Operation[],
  ): Promise<WorkerReply> {
    const root = this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY');
    const running = execute(
      join(root, '.venv/bin/python'),
      [join(root, 'export_workout.py')],
      {
        timeout: 180_000,
        maxBuffer: 1024 * 1024,
        env: manualGarminWorkerEnv({
          OA_GARMIN_PRIVATE_DIR: join(directory, '.private'),
          OA_GARMIN_LOCK_DIRECTORY: join(root, '.private'),
        }),
      },
    );
    running.child.stdin?.end(JSON.stringify({ operations }) + '\n');
    const { stdout } = await running;
    return JSON.parse(stdout) as WorkerReply;
  }

  private async connected(user: AuthUser, athleteId?: number) {
    const connection = await this.garmin.connection(user, athleteId);
    if (!connection?.garminUserProfileId) throw new ForbiddenException();
    return connection as Connection & {
      garminUserProfileId: string;
      timezone: string;
    };
  }

  private sessions(athleteId: number, eventIds: number[]) {
    return this.prisma.event.findMany({
      where: {
        eventId: { in: eventIds },
        athleteId,
        type: EventType.TRAINING,
        training: { isNot: null },
      },
      include: SESSION_INCLUDE,
    });
  }

  private async build(session: Session, timezone: string): Promise<Built> {
    const training = session.training!;
    const steps = training.workout
      ? await prepareWorkoutTargets(
          this.prisma,
          mapPrismaWorkoutToDto(training.workout).steps,
          {
            athleteId: session.athleteId,
            sport: training.sport,
            absolute: true,
          },
        )
      : [];
    const workout = mapSessionToGarminWorkout({
      name: session.name,
      description: training.description,
      sport: training.sport,
      steps: steps as ManualGarminStep[],
      goalDuration: training.goalDuration,
      goalDistance: training.goalDistance,
    });
    const date = localDay(session.startDate, timezone);
    const hash = createHash('sha256')
      .update(JSON.stringify({ date, workout }))
      .digest('hex');
    return { workout, date, hash };
  }

  async list(
    user: AuthUser,
    athleteId: number | undefined,
    eventIds: number[],
  ): Promise<ManualGarminWorkoutStateDto[]> {
    const connection = await this.garmin.connection(user, athleteId);
    if (!connection?.garminUserProfileId) return [];
    const sessions = await this.sessions(connection.athleteId, eventIds);
    const states: ManualGarminWorkoutStateDto[] = [];
    for (const session of sessions) {
      const sent = session.manualGarminWorkoutExport;
      if (!sent || sent.garminUserProfileId !== connection.garminUserProfileId)
        continue;
      let upToDate = false;
      try {
        upToDate =
          (await this.build(session, connection.timezone!)).hash ===
          sent.contentHash;
      } catch {
        // Targets that no longer resolve cannot match what was sent.
      }
      states.push({
        eventId: session.eventId,
        plannedDate: sent.plannedDate,
        sentAt: sent.sentAt.toISOString(),
        upToDate,
      });
    }
    return states;
  }

  /** One Garmin operation at a time per athlete, as for activity syncs. */
  private async exclusive<T>(
    connection: Connection,
    task: () => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(714203, ${connection.athleteId}::int) AS locked`;
        if (
          !lock.locked ||
          backfillActive(await readBackfill(connection.directory))
        )
          throw new ConflictException({
            code: 'GARMIN_BACKFILL_BUSY',
            message: 'Another Garmin operation is running.',
          });
        return task();
      },
      { timeout: 210_000, maxWait: 5000 },
    );
  }

  private async call(directory: string, operations: Operation[]) {
    let reply: WorkerReply;
    try {
      reply = await this.runWorker(directory, operations);
    } catch (error) {
      this.logger.warn(
        `Garmin workout export failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      throw new ServiceUnavailableException({
        code: 'GARMIN_EXPORT_FAILED',
        message: 'Garmin did not answer correctly.',
      });
    }
    if (!reply.ok) {
      const code =
        reply.code === 'Busy'
          ? 'GARMIN_BACKFILL_BUSY'
          : ['Cooldown', 'RateLimited'].includes(reply.code)
            ? 'GARMIN_REMOTE_COOLDOWN'
            : reply.code === 'AuthenticationFailed'
              ? 'GARMIN_LOGIN_REQUIRED'
              : 'GARMIN_EXPORT_FAILED';
      if (code === 'GARMIN_EXPORT_FAILED')
        this.logger.warn(`Garmin workout export stopped: ${reply.code}`);
      throw new ServiceUnavailableException({
        code,
        message: 'The Garmin operation stopped.',
        retryAfterSeconds: reply.retryAfterSeconds,
      });
    }
    // A batch stopped by throttling or the session explains its unsent items.
    const stopped =
      reply.stopCode === 'RateLimited'
        ? 'GARMIN_REMOTE_COOLDOWN'
        : reply.stopCode === 'AuthenticationFailed'
          ? 'GARMIN_LOGIN_REQUIRED'
          : undefined;
    if (reply.stopCode)
      this.logger.warn(`Garmin workout export interrupted: ${reply.stopCode}`);
    return new Map(
      reply.results.map((result) => [
        result.key,
        !result.ok && stopped && result.code !== 'Rejected'
          ? { ...result, code: stopped }
          : result,
      ]),
    );
  }

  async send(
    user: AuthUser,
    athleteId: number | undefined,
    eventIds: number[],
  ): Promise<ManualGarminWorkoutResultDto[]> {
    const connection = await this.connected(user, athleteId);
    const sessions = await this.sessions(connection.athleteId, eventIds);
    const today = localDay(new Date(), connection.timezone);
    const results = new Map<number, ManualGarminWorkoutResultDto>(
      eventIds.map((eventId) => [
        eventId,
        { eventId, ok: false, code: 'GARMIN_SESSION_NOT_FOUND' },
      ]),
    );
    const operations: Operation[] = [];
    const built = new Map<number, Built>();
    for (const session of sessions) {
      const eventId = session.eventId;
      let item: Built;
      try {
        item = await this.build(session, connection.timezone);
      } catch {
        results.set(eventId, {
          eventId,
          ok: false,
          code: 'GARMIN_TARGETS_UNRESOLVED',
        });
        continue;
      }
      if (item.date < today) {
        results.set(eventId, {
          eventId,
          ok: false,
          code: 'GARMIN_PAST_SESSION',
        });
        continue;
      }
      // Copies written to another Garmin account are never touched.
      const sent =
        session.manualGarminWorkoutExport?.garminUserProfileId ===
        connection.garminUserProfileId
          ? session.manualGarminWorkoutExport
          : null;
      if (sent?.contentHash === item.hash) {
        results.set(eventId, { eventId, ok: true });
        continue;
      }
      built.set(eventId, item);
      operations.push({
        key: String(eventId),
        action: 'upsert',
        workout: item.workout,
        date: item.date,
        ...(sent
          ? {
              workoutId: sent.garminWorkoutId,
              scheduleId: sent.garminScheduleId,
              previousDate: sent.plannedDate,
            }
          : {}),
      });
    }
    if (!operations.length) return [...results.values()];

    await this.exclusive(connection, async () => {
      const replies = await this.call(connection.directory, operations);
      const sentAt = new Date();
      for (const [eventId, item] of built) {
        const reply = replies.get(String(eventId));
        if (!reply?.ok || !reply.workoutId || !reply.scheduleId) {
          results.set(eventId, {
            eventId,
            ok: false,
            code: RESULT_CODES[reply?.code ?? ''] ?? 'GARMIN_EXPORT_FAILED',
          });
          continue;
        }
        const data = {
          athleteId: connection.athleteId,
          garminUserProfileId: connection.garminUserProfileId,
          garminWorkoutId: reply.workoutId,
          garminScheduleId: reply.scheduleId,
          plannedDate: item.date,
          contentHash: item.hash,
          sentAt,
        };
        await this.prisma.manualGarminWorkoutExport.upsert({
          where: { eventId },
          create: { eventId, ...data },
          update: data,
        });
        results.set(eventId, { eventId, ok: true });
      }
    });
    return [...results.values()];
  }

  async remove(
    user: AuthUser,
    athleteId: number | undefined,
    eventIds: number[],
  ): Promise<ManualGarminWorkoutResultDto[]> {
    const connection = await this.connected(user, athleteId);
    const exports = await this.prisma.manualGarminWorkoutExport.findMany({
      where: {
        eventId: { in: eventIds },
        athleteId: connection.athleteId,
        garminUserProfileId: connection.garminUserProfileId,
      },
    });
    const results = new Map<number, ManualGarminWorkoutResultDto>(
      eventIds.map((eventId) => [eventId, { eventId, ok: true }]),
    );
    if (!exports.length) return [...results.values()];
    await this.exclusive(connection, async () => {
      const replies = await this.call(
        connection.directory,
        exports.map((sent) => ({
          key: String(sent.eventId),
          action: 'delete' as const,
          workoutId: sent.garminWorkoutId,
          scheduleId: sent.garminScheduleId,
        })),
      );
      for (const sent of exports) {
        const reply = replies.get(String(sent.eventId));
        if (reply?.ok) {
          await this.prisma.manualGarminWorkoutExport.delete({
            where: { eventId: sent.eventId },
          });
        } else {
          results.set(sent.eventId, {
            eventId: sent.eventId,
            ok: false,
            code: RESULT_CODES[reply?.code ?? ''] ?? 'GARMIN_EXPORT_FAILED',
          });
        }
      }
    });
    return [...results.values()];
  }
}
