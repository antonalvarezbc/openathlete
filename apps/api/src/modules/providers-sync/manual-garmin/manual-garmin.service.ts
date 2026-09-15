import { execFile } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
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
    warnings: string[];
  };
  error?: string;
};

@Injectable()
export class ManualGarminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  protected async fetchPayload(directory: string): Promise<unknown> {
    const { stdout } = await execute(
      join(directory, '.venv/bin/python'),
      [join(directory, 'sync.py')],
      {
        timeout: 120_000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
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

  private async connection(user: AuthUser) {
    const directory = this.config.get<string>('GARMIN_UNOFFICIAL_DIRECTORY');
    if (
      !this.config.get<boolean>('SELF_HOSTED') ||
      !directory ||
      !isAbsolute(directory)
    )
      return null;
    let connection;
    try {
      connection = manualGarminConnection.parse(
        JSON.parse(
          await readFile(join(directory, '.private/connection.json'), 'utf8'),
        ),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Garmin manual: configuración local incompleta.',
      );
    }
    const athlete = await this.prisma.athlete.findUnique({
      where: { athleteId: connection.athleteId },
    });
    const coach = await this.prisma.coachAthlete.findFirst({
      where: { athleteId: connection.athleteId, userId: user.userId },
    });
    if (!athlete || (athlete.userId !== user.userId && !coach)) return null;
    return { ...connection, directory };
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

  async status(user: AuthUser) {
    const connection = await this.connection(user);
    if (!connection) return { enabled: false };
    const state = await this.state(connection.directory);
    return {
      enabled: true,
      athleteId: connection.athleteId,
      ...state,
      running:
        !!state.running &&
        Date.now() - Date.parse(state.lastAttempt ?? '') < 150_000,
    };
  }

  async sync(user: AuthUser) {
    const connection = await this.connection(user);
    if (!connection) throw new ForbiddenException();
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
            const payload = manualGarminPayload.parse(
              await this.fetchPayload(directory),
            );
            let imported = 0;
            let skipped = 0;
            const warnings = [...payload.warnings];
            for (const item of payload.activities) {
              const externalId = `garmin-manual:${connection.garminUserProfileId}:${item.id}`;
              const existing = await tx.eventActivity.findFirst({
                where: {
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
            const result = {
              imported,
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
        { timeout: 150_000, maxWait: 5000 },
      )
      .then(async ({ directory, state }) => {
        await this.save(directory, state);
        return state;
      });
  }
}
