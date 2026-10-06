import client, { routes } from '@/utils/axios';

import {
  BestRecordDto,
  GetRecordsQueryDto,
  SPORT_TYPE,
} from '@openathlete/shared';

export class RecordAPI {
  static async getRecords(query: GetRecordsQueryDto): Promise<BestRecordDto[]> {
    const res = await client.get(routes.record.getRecords, {
      params: {
        ...query,
        from: query.from?.toISOString(),
        to: query.to?.toISOString(),
      },
    });
    return res.data;
  }

  /** Sports that have records, the most frequent first. */
  static async getRecordSports(athleteId?: number): Promise<SPORT_TYPE[]> {
    const res = await client.get(routes.record.getRecordSports, {
      params: { athleteId },
    });
    return res.data;
  }
}
