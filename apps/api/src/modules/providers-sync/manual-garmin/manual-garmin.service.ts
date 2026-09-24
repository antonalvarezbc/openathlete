import { execFile } from 'node:child_process';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ConnectorProvider, EventType } from '@openathlete/database';

import { AuthUser } from '../../auth/decorators/user.decorator';
import { mapGarminActivityType } from '../../core/helpers/garmin';
import { PrismaService } from '../../prisma/services/prisma.service';
import { QueueService } from '../../queue/queue.service';
import { hasActivityStream, readManualFit } from './manual-garmin-fit';
import { loginGarmin } from './manual-garmin-login';
import {
  manualGarminConnection,
  manualGarminPayload,
} from './manual-garmin.schema';

const execute = promisify(execFile);
const COOLDOWN_MS = 120_000;
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
  };
  error?: string;
  processingPending?: { eventActivityId: number; eventId: number }[];
};

@Injectable()
export class ManualGarminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly queue: QueueService,
  ) {}

  protected async fetchPayload(
    directory: string,
    completedFits: string[],
  ): Promise<unknown> {
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
          OA_GARMIN_COMPLETED_FITS: JSON.stringify(completedFits),
        },
      },
    );
    const result = JSON.parse(stdout);
    if (result?.ok === false) {
      const messages: Record<string, string> = {
        AccountMismatch:
          'La sesión Garmin pertenece a otra cuenta. Revisa la vinculación local.',
        GarminConnectAuthenticationError:
          'La sesión Garmin ha caducado. Ejecuta la prueba local con --login.',
        GarminConnectTooManyRequestsError:
          'Garmin ha limitado las consultas. Espera antes de volver a intentarlo.',
        ModuleNotFoundError:
          'Falta instalar la dependencia Python del conector Garmin.',
      };
      throw new ServiceUnavailableException(
        messages[result.code] ??
          'Garmin no respondió correctamente. Inténtalo más tarde.',
      );
    }
    return result;
  }

  protected parseFit(directory: string, profile: string, id: string) {
    return readManualFit(directory, profile, id);
  }

  private async connection(user: AuthUser, requestedAthleteId?: number) {
    const root = this.config.get<string>('GARMIN_UNOFFICIAL_DIRECTORY');
    if (!this.config.get<boolean>('SELF_HOSTED') || !root || !isAbsolute(root))
      return null;
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
      throw new ServiceUnavailableException(
        'No se puede leer el estado de Garmin manual.',
      );
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
            throw new ConflictException(
              'Ya hay una actualización Garmin en curso.',
            );
          const previous = await this.state(directory);
          if (
            Date.now() - Date.parse(previous.lastAttempt ?? '') <
            COOLDOWN_MS
          ) {
            throw new ConflictException(
              'Espera dos minutos entre actualizaciones de Garmin.',
            );
          }
          const state: SyncState = {
            ...previous,
            lastAttempt: new Date().toISOString(),
            running: true,
            error: undefined,
          };
          await this.save(directory, state);
          try {
            const known = await tx.eventActivity.findMany({
              where: {
                provider: ConnectorProvider.GARMIN,
                event: { athleteId },
              },
              select: { externalId: true, stream: true },
            });
            const prefix = `garmin-manual:${connection.garminUserProfileId}:`;
            const completedFits = known
              .filter((a) => hasActivityStream(a.stream))
              .map((a) =>
                a.externalId?.startsWith(prefix)
                  ? a.externalId.slice(prefix.length)
                  : a.externalId,
              )
              .filter((id): id is string => !!id && /^\d+$/.test(id));
            const payload = manualGarminPayload.parse(
              await this.fetchPayload(directory, completedFits),
            );
            const processingPending = [...(previous.processingPending ?? [])];
            let imported = 0;
            let skipped = 0;
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
              if (existing || sameTime) {
                skipped++;
                if (!existing) warnings.push('ExistingActivityAtSameTime');
                continue;
              }
              const {
                id: _id,
                name,
                startDate,
                endDate,
                sport,
                ...activity
              } = item;
              await tx.event.create({
                data: {
                  athleteId,
                  name,
                  type: EventType.ACTIVITY,
                  startDate: new Date(startDate),
                  endDate: new Date(endDate),
                  activity: {
                    create: {
                      ...activity,
                      externalId,
                      provider: ConnectorProvider.GARMIN,
                      sport: mapGarminActivityType(sport),
                    },
                  },
                },
              });
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
            let fitsImported = 0;
            const fitsFailed: string[] = [];
            for (const fit of payload.fits) {
              if (!payload.activities.some((item) => item.id === fit.id))
                throw new Error('FIT is not part of this sync');
              if (!fit.ready) {
                fitsFailed.push(fit.id);
                continue;
              }
              const activity = await tx.eventActivity.findFirst({
                where: {
                  event: { athleteId },
                  provider: ConnectorProvider.GARMIN,
                  externalId: { in: [prefix + fit.id, fit.id] },
                },
                include: { segments: { select: { activitySegmentId: true } } },
              });
              // Never guess based on start time or overwrite existing detailed data.
              if (!activity || hasActivityStream(activity.stream)) continue;
              let parsed: Awaited<ReturnType<typeof readManualFit>>;
              try {
                parsed = await this.parseFit(
                  directory,
                  connection.garminUserProfileId,
                  fit.id,
                );
              } catch {
                // A corrupt cached download may be fetched again on a later click.
                await unlink(
                  join(
                    directory,
                    '.private',
                    'fits',
                    connection.garminUserProfileId,
                    fit.id + '.fit',
                  ),
                ).catch(() => undefined);
                fitsFailed.push(fit.id);
                continue;
              }
              await tx.eventActivity.update({
                where: { eventActivityId: activity.eventActivityId },
                data: { stream: parsed.stream as unknown as object },
              });
              // Preserve manual segments and workout associations.
              if (!activity.segments.length && parsed.segments.length) {
                await tx.activitySegment.createMany({
                  data: parsed.segments.map((segment) => ({
                    ...segment,
                    eventActivityId: activity.eventActivityId,
                  })),
                });
              }
              if (parsed.incomplete) warnings.push('FitIncompleteChannels');
              processingPending.push({
                eventActivityId: activity.eventActivityId,
                eventId: activity.eventId,
              });
              fitsImported++;
            }
            const result = {
              imported,
              fitsImported,
              fitsFailed,
              fitsPending: payload.fitsPending + fitsFailed.length,
              skipped,
              metrics: payload.metrics.length,
              warnings: [...new Set(warnings)],
            };
            return {
              directory,
              state: {
                ...state,
                running: false,
                lastSuccess: new Date().toISOString(),
                result,
                processingPending,
              },
            };
          } catch (error) {
            const message =
              error instanceof ServiceUnavailableException
                ? error.message
                : 'La actualización Garmin falló. No se han guardado cambios.';
            await this.save(directory, {
              ...state,
              running: false,
              error: message,
            });
            throw new ServiceUnavailableException(message);
          }
        },
        { timeout: 210_000, maxWait: 5000 },
      )
      .then(async ({ directory, state }) => {
        // Queue work only after commit; retain failed submissions for the next manual sync.
        await this.save(directory, state);
        const pending = [];
        for (const job of state.processingPending) {
          try {
            await this.queue.addActivityProcessingJob(
              job.eventActivityId,
              job.eventId,
              false,
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
}
