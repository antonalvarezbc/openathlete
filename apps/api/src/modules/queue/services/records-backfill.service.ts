import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';

import { Prisma } from '@openathlete/database';

import {
  ActivityRecordsService,
  RECORDS_VERSION,
} from '../../core/services/activity-records.service';
import { PrismaService } from '../../prisma/services/prisma.service';

const BATCH_SIZE = 50;

/**
 * Recomputes the records of activities computed by an older version of
 * computeRecords. Runs in the background on the containers that process
 * activities, a batch at a time, and resumes after a restart.
 */
@Injectable()
export class RecordsBackfillService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecordsBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly records: ActivityRecordsService,
  ) {}

  onApplicationBootstrap() {
    // Not awaited: the backfill must not delay startup
    void this.run().catch((error: unknown) =>
      this.logger.error(
        `Records backfill stopped: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  async run(): Promise<number> {
    let done = 0;
    for (;;) {
      const batch = await this.prisma.eventActivity.findMany({
        where: {
          recordsVersion: { lt: RECORDS_VERSION },
          stream: { not: Prisma.DbNull },
        },
        select: { eventActivityId: true },
        orderBy: { eventActivityId: 'asc' },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;
      for (const { eventActivityId } of batch) {
        try {
          await this.records.refresh(eventActivityId);
        } catch (error) {
          this.logger.warn(
            `Records of activity ${eventActivityId} could not be recomputed: ${error instanceof Error ? error.message : String(error)}`,
          );
          // Skip it rather than retrying it forever
          await this.prisma.eventActivity.update({
            where: { eventActivityId },
            data: { recordsVersion: RECORDS_VERSION },
          });
        }
        done++;
        // The worker also runs import jobs: let them through
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    if (done > 0)
      this.logger.log(`Recomputed the records of ${done} activities`);
    return done;
  }
}
