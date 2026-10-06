import { expect, test } from '@playwright/test';

import { apiHeaders, createAthlete } from '../../support/api';
import { API_URL } from '../../support/env';

test("refuses another athlete's statistics", async ({ request }) => {
  const [owner, stranger] = [
    await createAthlete(request),
    await createAthlete(request),
  ];
  const me = await request.get(`${API_URL}/athlete/me`, {
    headers: apiHeaders(undefined, owner.accessToken),
  });
  const { athleteId } = (await me.json()) as { athleteId: number };

  const headers = apiHeaders(undefined, stranger.accessToken);
  for (const path of [
    `/statistics/weekly-volume?athleteId=${athleteId}`,
    `/statistics?athleteId=${athleteId}&start=2026-01-01&end=2026-02-01`,
  ]) {
    const response = await request.get(`${API_URL}${path}`, { headers });
    expect(response.status(), path).toBe(403);
  }
});
