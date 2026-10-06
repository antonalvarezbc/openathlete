import { Injectable } from '@nestjs/common';

import { ActivityRecordsService } from '../../activity-records.service';
import { ActivityPipelineContext, ActivityProcessor } from '../types';

/** Every import path ends here, including streams that arrive later. */
@Injectable()
export class RecordsProcessor implements ActivityProcessor {
  name = 'records';

  constructor(private readonly records: ActivityRecordsService) {}

  async run(ctx: ActivityPipelineContext) {
    await this.records.refresh(ctx.eventActivityId);
  }
}
