import { expect, test } from '@playwright/test';

import { apiHeaders, createAthlete } from '../../support/api';
import { API_URL } from '../../support/env';

const draft = (athleteId: number) => ({
  athleteId,
  goal: { name: '10K', date: '2030-12-14', sport: 'RUNNING' },
  startDate: '2030-10-21',
  timeZone: 'Europe/Madrid',
  sports: ['RUNNING'],
  trainingDays: [2, 4, 6],
  weeklyHours: 5,
  language: 'en',
});

test('AI plan drafts are for coaches', async ({ request }) => {
  // An athlete-only account: the role guard answers before anything else.
  const athlete = await createAthlete(request);
  const response = await request.post(`${API_URL}/agent/ai/plans/draft`, {
    headers: apiHeaders(undefined, athlete.accessToken),
    data: draft(1),
  });
  expect(response.status()).toBe(403);
});

test('a draft can only be followed by whoever asked for it', async ({
  request,
}) => {
  const coach = await createAthlete(request, { selfCoached: true });
  const response = await request.get(
    `${API_URL}/agent/ai/plans/draft/6f1f4b8e-2f5a-4c1e-9d2b-0c6a1b7e8f90`,
    { headers: apiHeaders(undefined, coach.accessToken) },
  );
  expect(response.status()).toBe(404);
});
