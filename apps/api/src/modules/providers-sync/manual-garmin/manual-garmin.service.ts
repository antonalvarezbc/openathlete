import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';

import {
  ConnectorProvider,
  EventType,
  Prisma,
  SportType,
} from '@openathlete/database';

import { CoachActivityNoticeEvent } from '../../../events/coach-activity-notice.event';
import { AuthUser } from '../../auth/decorators/user.decorator';
import { mapGarminActivityType } from '../../core/helpers/garmin';
import { getInstallationFeatures } from '../../core/helpers/installation-features';
import { PrismaService } from '../../prisma/services/prisma.service';
import { QueueService } from '../../queue/queue.service';
import {
  BackfillProgress,
  backfillActive,
  cancelPath,
  readBackfill,
  remoteBlockedUntil,
  saveBackfill,
} from './manual-garmin-backfill-state';
import {
  BackfillWorkerMessage,
  BackfillWorkerResult,
  runManualGarminBackfill,
} from './manual-garmin-backfill-worker';
import { mergeManualGarminStreams } from './manual-garmin-enrichment';
import { hasActivityStream, readManualFit } from './manual-garmin-fit';
import { loginGarmin } from './manual-garmin-login';
import {
  manualGarminConnection,
  manualGarminPayload,
} from './manual-garmin.schema';

const execute = promisify(execFile);
const COOLDOWN_MS = 120_000;
// A time series alone does not prove that its FIT was fully inspected. Bump
// this version when newly supported FIT fields need a one-off local recheck.
const FIT_REVIEW_VERSION = 1;
const SUMMARY_FIELDS = [
  'averageCadence',
  'averageWatts',
  'maxWatts',
  'weightedAverageWatts',
  'averageHeartrate',
  'maxHeartrate',
  'kilojoules',
] as const;

function missingSummary(
  existing: Partial<Record<(typeof SUMMARY_FIELDS)[number], number | null>>,
  incoming: Partial<Record<(typeof SUMMARY_FIELDS)[number], number | null>>,
) {
  const update: Partial<Record<(typeof SUMMARY_FIELDS)[number], number>> = {};
  for (const field of SUMMARY_FIELDS) {
    const value = incoming[field];
    if (
      existing[field] == null &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0
    )
      update[field] = value;
  }
  return update;
}
type SyncState = {
  lastAttempt?: string;
  lastSuccess?: string;
  running?: boolean;
  result?: {
    imported: number;
    skipped: number;
    metrics: number;
    fitsImported: number;
    fitsFailed: string[];
    fitsPending: number;
    warnings: string[];
    updated?: number;
    fitsChecked?: number;
    fitsIncompatible?: string[];
  };
  error?: string;
  processingPending?: {
    eventActivityId: number;
    eventId: number;
    bulkImport?: boolean;
  }[];
  fitPending?: number;
  fitAttempts?: Record<string, string>;
  fitReviews?: Record<string, { version: number; eventActivityId: number }>;
};

@Injectable()
export class ManualGarminService implements OnModuleDestroy {
  private readonly logger = new Logger(ManualGarminService.name);
  private readonly backfillControllers = new Map<string, AbortController>();

  onModuleDestroy() {
    for (const controller of this.backfillControllers.values())
      controller.abort();
  }

  protected launchBackfill(task: () => Promise<void>) {
    // Completion/errors are persisted by processBackfill; no scheduled restart.
    void task().catch(() => undefined);
  }

  protected runBackfillWorker(
    directory: string,
    ids: string[],
    runId: string,
    onMessage: (message: BackfillWorkerMessage) => Promise<boolean>,
    signal: AbortSignal,
  ): Promise<BackfillWorkerResult> {
    return runManualGarminBackfill(
      this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY'),
      directory,
      ids,
      runId,
      onMessage,
      signal,
    );
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly queue: QueueService,
    @Optional() private readonly emitter?: EventEmitter2,
  ) {}

  protected async fetchPayload(directory: string): Promise<unknown> {
    const { stdout } = await execute(
      join(
        this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY'),
        '.venv/bin/python',
      ),
      [
        join(
          this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY'),
          'sync.py',
        ),
      ],
      {
        timeout: 180_000,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: '1',
          OA_GARMIN_PRIVATE_DIR: join(directory, '.private'),
          OA_GARMIN_LOCK_DIRECTORY: join(
            this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY'),
            '.private',
          ),
        },
      },
    );
    const result = JSON.parse(stdout);
    if (result?.ok === false) {
      const messages: Record<string, string> = {
        Busy: 'Hay otra operación Garmin en curso.',
        Cooldown: 'Espera antes de volver a consultar Garmin.',
        RateLimited:
          'Garmin ha limitado las consultas. La operación se ha detenido.',
        AuthenticationFailed:
          'Revisa la conexión Garmin del atleta antes de continuar.',
        AccountMismatch:
          'La sesión Garmin pertenece a otra cuenta. Revisa la vinculación local.',
        GarminConnectAuthenticationError:
          'La sesión Garmin ha caducado. Ejecuta la prueba local con --login.',
        GarminConnectTooManyRequestsError:
          'Garmin ha limitado las consultas. Espera antes de volver a intentarlo.',
        ModuleNotFoundError:
          'Falta instalar la dependencia Python del conector Garmin.',
      };
      throw new ServiceUnavailableException({
        code:
          result.code === 'Busy'
            ? 'GARMIN_BACKFILL_BUSY'
            : ['Cooldown', 'RateLimited'].includes(result.code)
              ? 'GARMIN_REMOTE_COOLDOWN'
              : [
                    'AuthenticationFailed',
                    'AccountMismatch',
                    'GarminConnectAuthenticationError',
                  ].includes(result.code)
                ? 'GARMIN_LOGIN_REQUIRED'
                : 'GARMIN_BACKFILL_FAILED',
        message:
          messages[result.code] ??
          'Garmin no respondió correctamente. Inténtalo más tarde.',
      });
    }
    return result;
  }

  protected parseFit(directory: string, profile: string, id: string) {
    return readManualFit(directory, profile, id);
  }

  /** Access-checked manual Garmin connection of an athlete, or null. */
  async connection(user: AuthUser, requestedAthleteId?: number) {
    if (!getInstallationFeatures(this.config).manualGarminSync) return null;
    const root = this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY');
    let legacy: ReturnType<typeof manualGarminConnection.parse> | undefined;
    try {
      legacy = manualGarminConnection.parse(
        JSON.parse(
          await readFile(join(root, '.private/connection.json'), 'utf8'),
        ),
      );
    } catch {}
    const athleteId =
      requestedAthleteId ??
      (user.roles?.includes('ATHLETE')
        ? user.athlete?.athleteId
        : legacy?.athleteId);
    if (!athleteId) return null;
    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId },
    });
    const owner =
      !!athlete &&
      athlete.userId === user.userId &&
      !!user.roles?.includes('ATHLETE');
    const coach =
      user.roles?.includes('COACH') &&
      (await this.prisma.coachAthlete.findFirst({
        where: { athleteId, userId: user.userId },
      }));
    if (!athlete || (!owner && !coach)) return null;
    const directory = join(root, 'accounts', String(athleteId));
    try {
      const connection = manualGarminConnection.parse(
        JSON.parse(
          await readFile(join(directory, '.private/connection.json'), 'utf8'),
        ),
      );
      if (connection.athleteId !== athleteId)
        throw new Error('Identity mismatch');
      return { ...connection, directory, canConfigure: owner };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw new ServiceUnavailableException(
          'Garmin manual: configuración local incompleta.',
        );
    }
    if (legacy?.athleteId === athleteId)
      return { ...legacy, directory: root, canConfigure: owner };
    return {
      athleteId,
      directory,
      canConfigure: owner,
      garminUserProfileId: undefined,
    };
  }

  async connect(
    user: AuthUser,
    input: {
      email?: string;
      password?: string;
      code?: string;
      timezone: string;
    },
  ) {
    if (!user.roles?.includes('ATHLETE') || !user.athlete)
      throw new ForbiddenException();
    const connection = await this.connection(user, user.athlete.athleteId);
    if (!connection?.canConfigure) throw new ForbiddenException();
    if (backfillActive(await readBackfill(connection.directory)))
      throw new ConflictException({
        code: 'GARMIN_BACKFILL_BUSY',
        message: 'Detén la descarga de FIT antes de cambiar la conexión.',
      });
    const syncState = await this.state(connection.directory);
    if (
      syncState.running &&
      Date.now() - Date.parse(syncState.lastAttempt ?? '') < 240_000
    )
      throw new ConflictException({
        code: 'GARMIN_BACKFILL_BUSY',
        message: 'Espera a que termine la actualización Garmin.',
      });
    const root = this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY');
    // Keep existing legacy tokens untouched; new connections belong to the authenticated athlete.
    return loginGarmin(
      user.userId,
      root,
      join(root, 'accounts', String(connection.athleteId), '.private'),
      {
        ...input,
        athleteId: connection.athleteId,
      },
    );
  }

  private async state(directory: string): Promise<SyncState> {
    try {
      return JSON.parse(
        await readFile(join(directory, '.private/sync-state.json'), 'utf8'),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new ServiceUnavailableException({
        code: 'GARMIN_STATE_UNREADABLE',
        message: 'The manual Garmin state cannot be read.',
      });
    }
  }

  private async save(directory: string, state: SyncState) {
    const file = join(directory, '.private/sync-state.json');
    await writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
  }

  async status(user: AuthUser, athleteId?: number) {
    const connection = await this.connection(user, athleteId);
    if (!connection) return { enabled: false };
    const state = await this.state(connection.directory);
    return {
      enabled: true,
      connected: !!connection.garminUserProfileId,
      canConfigure: connection.canConfigure,
      athleteId: connection.athleteId,
      ...state,
      backfill: await readBackfill(connection.directory),
      backfillPending: state.fitPending ?? state.result?.fitsPending,
      remoteBlockedUntil: await remoteBlockedUntil(
        this.config.getOrThrow<string>('GARMIN_UNOFFICIAL_DIRECTORY'),
      ),
      running:
        !!state.running &&
        Date.now() - Date.parse(state.lastAttempt ?? '') < 240_000,
    };
  }

  async sync(user: AuthUser, requestedAthleteId?: number) {
    const connection = await this.connection(user, requestedAthleteId);
    if (!connection?.garminUserProfileId) throw new ForbiddenException();
    const { directory, athleteId } = connection;
    // PostgreSQL lock serializes all API workers; automatically released on rollback/crash.
    return this.prisma
      .$transaction(
        async (tx) => {
          const [lock] = await tx.$queryRaw<
            { locked: boolean }[]
          >`SELECT pg_try_advisory_xact_lock(714203, ${athleteId}::int) AS locked`;
          if (!lock.locked)
            throw new ConflictException({
              code: 'GARMIN_BACKFILL_BUSY',
              message: 'A Garmin update is already running.',
            });
          if (backfillActive(await readBackfill(directory)))
            throw new ConflictException({
              code: 'GARMIN_BACKFILL_BUSY',
              message: 'Ya se están completando actividades Garmin.',
            });
          const previous = await this.state(directory);
          if (
            Date.now() - Date.parse(previous.lastAttempt ?? '') <
            COOLDOWN_MS
          ) {
            throw new ConflictException({
              code: 'GARMIN_SYNC_COOLDOWN',
              message: 'Espera dos minutos entre actualizaciones de Garmin.',
            });
          }
          const state: SyncState = {
            ...previous,
            lastAttempt: new Date().toISOString(),
            running: true,
            error: undefined,
          };
          await this.save(directory, state);
          try {
            const payload = manualGarminPayload.parse(
              await this.fetchPayload(directory),
            );
            const processingPending = [...(previous.processingPending ?? [])];
            const createdEventIds: number[] = [];
            let imported = 0;
            let skipped = 0;
            const updated = new Set<number>();
            const warnings = [...payload.warnings];
            for (const item of payload.activities) {
              const externalId = `garmin-manual:${connection.garminUserProfileId}:${item.id}`;
              const existing = await tx.eventActivity.findFirst({
                where: {
                  event: { athleteId },
                  provider: ConnectorProvider.GARMIN,
                  OR: [
                    { externalId },
                    {
                      externalId: item.id,
                      provider: ConnectorProvider.GARMIN,
                      event: { athleteId },
                    },
                  ],
                },
              });
              // Cross-provider matching is deliberately conservative: flag rather than duplicate.
              const sameTime = await tx.event.findFirst({
                where: {
                  athleteId,
                  type: EventType.ACTIVITY,
                  startDate: new Date(item.startDate),
                },
              });
              if (existing) {
                const data: Prisma.EventActivityUpdateInput = missingSummary(
                  existing,
                  item,
                );
                if (!existing.description?.trim() && item.description?.trim())
                  data.description = item.description;
                // Garmin mobility used to be imported as Pilates.
                if (
                  existing.sport === SportType.PILATES &&
                  mapGarminActivityType(item.sport) === SportType.MOBILITY
                )
                  data.sport = SportType.MOBILITY;
                if (Object.keys(data).length) {
                  await tx.eventActivity.update({
                    where: { eventActivityId: existing.eventActivityId },
                    data,
                  });
                  updated.add(existing.eventActivityId);
                  if (
                    SUMMARY_FIELDS.some((field) => field in data) &&
                    !processingPending.some(
                      (job) => job.eventActivityId === existing.eventActivityId,
                    )
                  )
                    processingPending.push({
                      eventActivityId: existing.eventActivityId,
                      eventId: existing.eventId,
                      bulkImport: true,
                    });
                } else {
                  skipped++;
                }
                continue;
              }
              if (sameTime) {
                skipped++;
                warnings.push('ExistingActivityAtSameTime');
                continue;
              }
              // externalId is unique across athletes. If the same Garmin account
              // is linked to another athlete who already owns this activity,
              // skip it instead of failing the whole sync.
              const ownedElsewhere = await tx.eventActivity.findUnique({
                where: { externalId },
                select: { eventActivityId: true },
              });
              if (ownedElsewhere) {
                skipped++;
                warnings.push('ActivityOwnedByAnotherAthlete');
                continue;
              }
              const {
                id: _id,
                name,
                startDate,
                endDate,
                sport,
                description,
                ...activity
              } = item;
              const created = await tx.event.create({
                data: {
                  athleteId,
                  name,
                  type: EventType.ACTIVITY,
                  startDate: new Date(startDate),
                  endDate: new Date(endDate),
                  activity: {
                    create: {
                      ...activity,
                      description: description ?? '',
                      externalId,
                      provider: ConnectorProvider.GARMIN,
                      sport: mapGarminActivityType(sport),
                    },
                  },
                },
              });
              createdEventIds.push(created.eventId);
              imported++;
            }
            for (const metric of payload.metrics) {
              const date = new Date(`${metric.date}T00:00:00Z`);
              await tx.athleteMetric.upsert({
                where: {
                  athleteId_type_date: { athleteId, type: metric.type, date },
                },
                create: {
                  athleteId,
                  type: metric.type,
                  date,
                  value: metric.value,
                },
                update: { value: metric.value },
              });
            }
            const pending = await this.pendingFits(
              tx,
              athleteId,
              connection.garminUserProfileId,
              previous,
            );
            const result = {
              imported,
              fitsImported: 0,
              fitsFailed: [],
              fitsPending: pending.length,
              fitsChecked: 0,
              fitsIncompatible: [],
              updated: updated.size,
              skipped,
              metrics: payload.metrics.length,
              warnings: [...new Set(warnings)],
            };
            return {
              directory,
              createdEventIds,
              state: {
                ...state,
                running: false,
                lastSuccess: new Date().toISOString(),
                result,
                processingPending,
                fitPending: pending.length,
              },
            };
          } catch (error) {
            // Store a code, not a sentence: the web shows it in the user's language.
            const response =
              error instanceof ServiceUnavailableException
                ? (error.getResponse() as { code?: unknown })
                : undefined;
            const code =
              typeof response?.code === 'string'
                ? response.code
                : 'GARMIN_SYNC_FAILED';
            // Server-side diagnosis only: error type and message, no payload.
            this.logger.warn(
              `Manual Garmin sync failed for athlete ${athleteId} (${code}): ${
                error instanceof Error
                  ? `${error.name}: ${error.message}`.slice(0, 500)
                  : String(error).slice(0, 500)
              }`,
            );
            await this.save(directory, {
              ...state,
              running: false,
              error: code,
            });
            if (error instanceof ServiceUnavailableException) throw error;
            throw new ServiceUnavailableException({
              code,
              message: 'The Garmin update failed. No changes were saved.',
            });
          }
        },
        { timeout: 210_000, maxWait: 5000 },
      )
      .then(async ({ directory, state, createdEventIds }) => {
        for (const eventId of createdEventIds)
          this.emitter?.emit(
            CoachActivityNoticeEvent.SLUG,
            new CoachActivityNoticeEvent({
              eventId,
              kind: 'ACTIVITY',
              deliveryKey: `import:${eventId}`,
            }),
          );
        // Queue work only after commit; retain failed submissions for the next manual sync.
        await this.save(directory, { ...state, running: true });
        const pending = [];
        for (const job of state.processingPending) {
          try {
            await this.queue.addActivityProcessingJob(
              job.eventActivityId,
              job.eventId,
              job.bulkImport ?? true,
            );
          } catch {
            pending.push(job);
          }
        }
        state.processingPending = pending;
        if (pending.length) state.result.warnings.push('FitProcessingPending');
        await this.save(directory, state);
        return state;
      });
  }

  private async pendingFits(
    tx: Prisma.TransactionClient,
    athleteId: number,
    profile: string,
    state: SyncState,
  ) {
    const known = await tx.eventActivity.findMany({
      where: { provider: ConnectorProvider.GARMIN, event: { athleteId } },
      select: {
        eventActivityId: true,
        externalId: true,
        stream: true,
        event: { select: { startDate: true } },
      },
      orderBy: { eventActivityId: 'asc' },
    });
    const prefix = `garmin-manual:${profile}:`;
    const seen = new Set<string>();
    const startedAt = new Map<string, number>();
    const pending = known.flatMap((activity) => {
      const id = activity.externalId.startsWith(prefix)
        ? activity.externalId.slice(prefix.length)
        : activity.externalId;
      if (!/^\d+$/.test(id) || seen.has(id)) return [];
      seen.add(id);
      startedAt.set(id, activity.event.startDate.getTime());
      const review = state.fitReviews?.[prefix + id];
      return hasActivityStream(activity.stream) &&
        review?.version === FIT_REVIEW_VERSION &&
        review.eventActivityId === activity.eventActivityId
        ? []
        : [id];
    });
    const attemptedAt = (id: string) =>
      Date.parse(state.fitAttempts?.[prefix + id] ?? '') || 0;
    // A failed original must not starve the rest or be downloaded again before
    // files that have never been attempted. Retries still require a new click.
    // Otherwise the most recent activities come first, so they can be reviewed
    // while older ones are still being completed. Import order is not a date:
    // later syncs add the newest activities at the end.
    return pending.sort(
      (a, b) =>
        attemptedAt(a) - attemptedAt(b) ||
        (startedAt.get(b) ?? 0) - (startedAt.get(a) ?? 0),
    );
  }

  async backfill(user: AuthUser, requestedAthleteId?: number) {
    const connection = await this.connection(user, requestedAthleteId);
    if (!connection?.garminUserProfileId) throw new ForbiddenException();
    const { directory, athleteId, garminUserProfileId: profile } = connection;
    const prepared = await this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(714203, ${athleteId}::int) AS locked`;
        if (!lock.locked || backfillActive(await readBackfill(directory)))
          throw new ConflictException({
            code: 'GARMIN_BACKFILL_BUSY',
            message: 'Ya hay una operación Garmin en curso.',
          });
        const state = await this.state(directory);
        if (
          state.running &&
          Date.now() - Date.parse(state.lastAttempt ?? '') < 240_000
        )
          throw new ConflictException({
            code: 'GARMIN_BACKFILL_BUSY',
            message: 'Ya hay una actualización Garmin en curso.',
          });
        const ids = await this.pendingFits(tx, athleteId, profile, state);
        const now = new Date().toISOString();
        const progress: BackfillProgress = {
          runId: randomUUID(),
          status: ids.length ? 'RUNNING' : 'COMPLETED',
          ...(ids.length ? {} : { reason: 'COMPLETE' as const }),
          total: ids.length,
          checked: 0,
          updated: 0,
          cached: 0,
          downloaded: 0,
          failed: [],
          incompatible: [],
          remaining: ids.length,
          startedAt: now,
          updatedAt: now,
        };
        await saveBackfill(directory, progress);
        await this.save(directory, { ...state, fitPending: ids.length });
        return { ids: ids.slice(0, 100), progress };
      },
      { timeout: 15000, maxWait: 5000 },
    );
    if (prepared.ids.length)
      this.launchBackfill(() =>
        this.processBackfill(user, connection, prepared.ids, prepared.progress),
      );
    return prepared.progress;
  }

  async stopBackfill(user: AuthUser, requestedAthleteId?: number) {
    const connection = await this.connection(user, requestedAthleteId);
    if (!connection?.garminUserProfileId) throw new ForbiddenException();
    const progress = await readBackfill(connection.directory);
    if (!progress || !backfillActive(progress)) return progress ?? null;
    // Cross-worker cancellation: the downloader checks this marker before any
    // new request and during pauses. An in-flight request may finish first.
    await writeFile(cancelPath(connection.directory, progress.runId), '', {
      mode: 0o600,
    });
    const stopping: BackfillProgress = {
      ...progress,
      status: 'STOPPING',
      updatedAt: new Date().toISOString(),
    };
    // The marker is the cross-process source of truth. Do not overwrite a
    // completion/progress write that may have raced this request.
    return stopping;
  }

  private async enrichBackfillFit(
    connection: {
      directory: string;
      athleteId: number;
      garminUserProfileId: string;
    },
    id: string,
  ) {
    const { directory, athleteId, garminUserProfileId: profile } = connection;
    let parsed: Awaited<ReturnType<typeof readManualFit>>;
    try {
      parsed = await this.parseFit(directory, profile, id);
    } catch {
      await unlink(
        join(directory, '.private/fits', profile, id + '.fit'),
      ).catch(() => undefined);
      throw new Error('FIT_PARSE_FAILED');
    }
    const applied = await this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<
          { locked: boolean }[]
        >`SELECT pg_try_advisory_xact_lock(714203, ${athleteId}::int) AS locked`;
        if (!lock.locked) throw new Error('FIT_BUSY');
        const activity = await tx.eventActivity.findFirst({
          where: {
            event: { athleteId },
            provider: ConnectorProvider.GARMIN,
            externalId: { in: [`garmin-manual:${profile}:${id}`, id] },
          },
          include: { segments: { select: { activitySegmentId: true } } },
          orderBy: { eventActivityId: 'asc' },
        });
        if (!activity) throw new Error('FIT_ACTIVITY_UNAVAILABLE');
        const merged = mergeManualGarminStreams(activity.stream, parsed.stream);
        const data: Prisma.EventActivityUpdateInput = missingSummary(
          activity,
          parsed.summary ?? {},
        );
        if (merged.changed)
          data.stream = merged.stream as Prisma.InputJsonObject;
        if (Object.keys(data).length)
          await tx.eventActivity.update({
            where: { eventActivityId: activity.eventActivityId },
            data,
          });
        const addSegments =
          !merged.conflict &&
          !activity.segments.length &&
          parsed.segments.length > 0;
        if (addSegments)
          await tx.activitySegment.createMany({
            data: parsed.segments.map((segment) => ({
              ...segment,
              eventActivityId: activity.eventActivityId,
            })),
          });
        return {
          eventActivityId: activity.eventActivityId,
          eventId: activity.eventId,
          changed: Object.keys(data).length > 0 || addSegments,
          incompatible: merged.conflict,
        };
      },
      { timeout: 15000, maxWait: 5000 },
    );
    // Record review only after commit. All enrichment uses historical processing:
    // no fresh-activity push, AI feedback or external weather lookups.
    const state = await this.state(directory);
    state.fitReviews = {
      ...state.fitReviews,
      [`garmin-manual:${profile}:${id}`]: {
        version: FIT_REVIEW_VERSION,
        eventActivityId: applied.eventActivityId,
      },
    };
    if (
      applied.changed &&
      !state.processingPending?.some(
        (job) => job.eventActivityId === applied.eventActivityId,
      )
    )
      state.processingPending = [
        ...(state.processingPending ?? []),
        {
          eventActivityId: applied.eventActivityId,
          eventId: applied.eventId,
          bulkImport: true,
        },
      ];
    state.fitPending = Math.max(0, (state.fitPending ?? 1) - 1);
    await this.save(directory, state);
    if (applied.changed) {
      try {
        await this.queue.addActivityProcessingJob(
          applied.eventActivityId,
          applied.eventId,
          true,
        );
        state.processingPending = state.processingPending?.filter(
          (job) => job.eventActivityId !== applied.eventActivityId,
        );
        await this.save(directory, state);
      } catch {
        /* Retain the pending submission for the next manual operation. */
      }
    }
    return applied;
  }

  private async processBackfill(
    user: AuthUser,
    connection: {
      directory: string;
      athleteId: number;
      garminUserProfileId: string;
    },
    ids: string[],
    progress: BackfillProgress,
  ) {
    const { directory } = connection;
    const controller = new AbortController();
    this.backfillControllers.set(progress.runId, controller);
    // Serialize progress writes, including heartbeat/cancellation, so a late
    // heartbeat cannot overwrite a terminal result or race its temporary file.
    let writes = Promise.resolve();
    const publish = (terminal = false) => {
      const snapshot = {
        ...progress,
        failed: [...progress.failed],
        incompatible: [...progress.incompatible],
      };
      writes = writes.then(async () => {
        const current = await readBackfill(directory);
        if (current?.runId !== snapshot.runId)
          throw new Error('BACKFILL_REPLACED');
        if (!terminal && current.status === 'STOPPING') {
          snapshot.status = 'STOPPING';
          if (backfillActive(progress)) progress.status = 'STOPPING';
        }
        snapshot.updatedAt = new Date().toISOString();
        await saveBackfill(directory, snapshot);
      });
      return writes;
    };
    const heartbeat = setInterval(() => {
      void publish().catch(() => controller.abort());
    }, 15000);
    heartbeat.unref();
    const seen = new Set<string>();
    let localFailure = false;
    try {
      const result = await this.runBackfillWorker(
        directory,
        ids,
        progress.runId,
        async (message) => {
          if (message.type === 'waiting') {
            progress.nextRequestAt = message.nextRequestAt;
            await publish();
            return true;
          }
          if (!ids.includes(message.id) || seen.has(message.id))
            throw new Error('UNEXPECTED_FIT');
          seen.add(message.id);
          const state = await this.state(directory);
          state.fitAttempts = {
            ...state.fitAttempts,
            [`garmin-manual:${connection.garminUserProfileId}:${message.id}`]:
              new Date().toISOString(),
          };
          await this.save(directory, state);
          progress.checked++;
          progress.nextRequestAt = undefined;
          if (message.cached) progress.cached++;
          else if (message.ready) progress.downloaded++;
          if (!message.ready) {
            progress.failed.push(message.id);
            await publish();
            return true; // The worker emits its stop reason next; it never retries.
          }
          try {
            const currentConnection = await this.connection(
              user,
              connection.athleteId,
            );
            if (
              currentConnection?.garminUserProfileId !==
              connection.garminUserProfileId
            )
              throw new ForbiddenException();
            const applied = await this.enrichBackfillFit(
              connection,
              message.id,
            );
            if (applied.changed) progress.updated++;
            if (applied.incompatible) progress.incompatible.push(message.id);
            progress.remaining--;
          } catch {
            progress.failed.push(message.id);
            localFailure = true;
          }
          await publish();
          return !localFailure && progress.status !== 'STOPPING';
        },
        controller.signal,
      );
      progress.reason = controller.signal.aborted
        ? 'INTERRUPTED'
        : localFailure
          ? 'ERROR'
          : result.reason;
      if (progress.reason === 'COMPLETE' && progress.remaining > 0)
        progress.reason = 'BUDGET';
      progress.status =
        progress.reason === 'COMPLETE'
          ? 'COMPLETED'
          : ['ERROR', 'AUTH'].includes(progress.reason)
            ? 'FAILED'
            : 'PAUSED';
    } catch {
      progress.reason = controller.signal.aborted ? 'INTERRUPTED' : 'ERROR';
      progress.status = controller.signal.aborted ? 'PAUSED' : 'FAILED';
    } finally {
      clearInterval(heartbeat);
      this.backfillControllers.delete(progress.runId);
      progress.nextRequestAt = undefined;
      await publish(true).catch(() => undefined);
      await unlink(cancelPath(directory, progress.runId)).catch(
        () => undefined,
      );
    }
  }
}
