import client, { routes } from '@/utils/axios';

import {
  GetStatisticsForPeriodDto,
  WeeklyVolumeDto,
  weeklyVolumeSchema,
} from '@openathlete/shared';

export class StatisticsAPI {
  static async getStatisticsForPeriod(
    athleteId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<GetStatisticsForPeriodDto> {
    const res = await client.get(
      routes.statistics.getStatisticsForPeriod(
        athleteId,
        startDate.toISOString(),
        endDate.toISOString(),
      ),
    );
    return res.data;
  }

  /** Volume of each of the last `weeks` weeks, by sport. */
  static async getWeeklyVolume(
    athleteId: number,
    weeks: number,
  ): Promise<WeeklyVolumeDto[]> {
    const res = await client.get(routes.statistics.getWeeklyVolume, {
      params: { athleteId, weeks },
    });
    // weekStart arrives as an ISO string
    return weeklyVolumeSchema.array().parse(res.data);
  }
}
