import client from '@/utils/axios';

import {
  CreateManagedPlan,
  LinkPlanRace,
  PlanRaceInput,
  SPORT_TYPE,
  UpdateManagedPlan,
} from '@openathlete/shared';

export interface ManagedPlanRace {
  trainingPlanId: number;
  eventCompetitionId: number;
  priority: 'TARGET' | 'PREPARATORY';
  competition: {
    sport: SPORT_TYPE;
    description: string;
    goalDistance: number | null;
    goalElevationGain: number | null;
    goalDuration: number | null;
    relatedActivityId: number | null;
    event: {
      eventId: number;
      name: string;
      startDate: string;
      endDate: string;
    };
  };
}
export interface ManagedPlan {
  trainingPlanId: number;
  athleteId: number;
  name: string;
  goal: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: UpdateManagedPlan['status'];
  races: ManagedPlanRace[];
  cycles: Array<{
    cycleId: number;
    name: string;
    phase: string | null;
    color: string | null;
    weeks: Array<{
      trainingWeekId: number;
      weekNumber: number;
      startDate: string;
      endDate: string;
      theme: string | null;
      targetVolume: number | null;
      targetLoad: number | null;
      _count: { sessions: number };
    }>;
  }>;
}
export const PlanWorkspaceAPI = {
  list: async (athleteId: number): Promise<ManagedPlan[]> =>
    (await client.get('/training-plan', { params: { athleteId } })).data,
  get: async (id: number): Promise<ManagedPlan> =>
    (await client.get(`/training-plan/${id}`)).data,
  create: async (data: CreateManagedPlan): Promise<ManagedPlan> =>
    (await client.post('/training-plan', data)).data,
  update: async (id: number, data: UpdateManagedPlan): Promise<ManagedPlan> =>
    (await client.patch(`/training-plan/${id}`, data)).data,
  saveRace: async (id: number, data: PlanRaceInput, raceId?: number) =>
    raceId
      ? (await client.patch(`/training-plan/${id}/races/${raceId}`, data)).data
      : (await client.post(`/training-plan/${id}/races`, data)).data,
  linkRace: async (id: number, data: LinkPlanRace) =>
    (await client.post(`/training-plan/${id}/races/link`, data)).data,
  unlinkRace: async (id: number, raceId: number) =>
    (await client.delete(`/training-plan/${id}/races/${raceId}`)).data,
  competitions: async (
    id: number,
  ): Promise<Array<{ eventId: number; name: string; startDate: string }>> =>
    (await client.get(`/training-plan/${id}/competitions`)).data,
};
