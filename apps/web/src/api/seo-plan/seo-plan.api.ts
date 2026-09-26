import client, { routes } from '@/utils/axios';

import {
  CreateTemporaryPlanDto,
  ImportJsonPlanDto,
  ImportPlanDto,
  SEOPlanData,
} from '@openathlete/shared';

export class SeoPlanAPI {
  /**
   * Get a temporary training plan by token
   * Public endpoint, no authentication required
   */
  static async getTemporaryPlan(token: string): Promise<SEOPlanData> {
    const res = await client.get<SEOPlanData>(routes.seoPlan.getPlan(token));
    return res.data;
  }

  /**
   * Create a temporary training plan
   * Returns a unique token that can be used to retrieve and import the plan
   * Plans expire after 7 days
   */
  static async createTemporaryPlan(
    planData: CreateTemporaryPlanDto['planData'],
  ): Promise<{ token: string }> {
    const res = await client.post<{ token: string }>(routes.seoPlan.create, {
      planData,
    } satisfies CreateTemporaryPlanDto);
    return res.data;
  }

  /**
   * Import a temporary training plan into the authenticated user's account
   * Creates a TrainingPlan with all cycles, weeks, and events
   * Marks the temporary plan as imported
   */
  static async importPlan(
    data: ImportPlanDto,
  ): Promise<{ trainingPlanId: number; name: string }> {
    // The token stays in the URL; destination and scheduling options are in the body.
    const res = await client.post<{ trainingPlanId: number; name: string }>(
      routes.seoPlan.import(data.planToken),
      {
        startDate: data.startDate,
        athleteId: data.athleteId,
        timeZone: data.timeZone,
        replacePlanId: data.replacePlanId,
      },
    );
    return res.data;
  }

  static async importJson(
    data: ImportJsonPlanDto,
  ): Promise<{ trainingPlanId: number; name: string }> {
    return (await client.post('/seo-plan/import-json', data)).data;
  }
  static async listPlans(athleteId: number): Promise<
    Array<{
      trainingPlanId: number;
      name: string;
      startDate: string;
      endDate: string;
    }>
  > {
    return (await client.get(`/seo-plan/athletes/${athleteId}/plans`)).data;
  }
}
