import client, { routes } from '@/utils/axios';

import { Record, SPORT_TYPE } from '@openathlete/shared';

export class RecordAPI {
  static async getRecords(
    sport?: SPORT_TYPE,
    athleteId?: number,
  ): Promise<Record[]> {
    const res = await client.get(routes.record.getRecords, {
      params: {
        sport,
        athleteId,
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
