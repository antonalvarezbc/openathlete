import client, { routes } from '@/utils/axios';

import {
  AthleteInjury,
  CreateAthleteInjury,
  SaveAthleteInjury,
} from '@openathlete/shared';

export class InjuryAPI {
  static async create(data: CreateAthleteInjury): Promise<AthleteInjury> {
    return (await client.post('/injury', data)).data;
  }
  static async update(
    id: number,
    data: SaveAthleteInjury,
  ): Promise<AthleteInjury> {
    return (await client.patch(`/injury/${id}`, data)).data;
  }
  static async getInjuries(athleteId?: number): Promise<AthleteInjury[]> {
    const res = await client.get(routes.injury.getInjuries, {
      params: athleteId ? { athleteId } : undefined,
    });
    return res.data;
  }
}
