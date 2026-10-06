import { type APIRequestContext, expect, test } from '@playwright/test';

import { type TestAthlete, apiHeaders, createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { API_URL } from '../../support/env';
import { trackPageProblems } from '../../support/page-health';

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Imports a straight GPX track of `minutes`, `daysAgo` days ago, at 3 m/s,
 * one point a minute.
 */
async function addActivity(
  request: APIRequestContext,
  athlete: TestAthlete,
  sport: string,
  daysAgo: number,
  minutes: number,
) {
  const start = new Date(Date.now() - daysAgo * 24 * 3600 * 1000);
  start.setUTCHours(7, 0, 0, 0);
  const points = Array.from({ length: minutes + 1 }, (_, i) => {
    const time = new Date(start.getTime() + i * 60_000).toISOString();
    // 180 m a minute, northward
    return `<trkpt lat="${(45 + (i * 180) / 111_195).toFixed(6)}" lon="5.000000"><time>${time}</time></trkpt>`;
  }).join('');
  const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="openathlete-e2e" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${sport}</name><trkseg>${points}</trkseg></trk></gpx>`;
  const response = await request.post(`${API_URL}/activity-import/gpx`, {
    headers: apiHeaders(undefined, athlete.accessToken),
    multipart: {
      file: {
        name: `${sport}-${daysAgo}.gpx`,
        mimeType: 'application/gpx+xml',
        buffer: Buffer.from(gpx),
      },
      name: `${sport} session`,
      sport,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
}

test('statistics open on the last seven days, with legends and weekly volume', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request);
  await addActivity(request, athlete, 'RUNNING', 1, 30);
  await addActivity(request, athlete, 'CYCLING', 3, 60);
  await addActivity(request, athlete, 'CYCLING', 40, 90);
  await signIn(page, athlete);
  const problems = trackPageProblems(page);

  await page.goto('/dashboard/statistics');

  // The last seven days, not a calendar week that may have just started
  await expect(page.getByRole('tab', { name: '7 days' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // Each pie names its sports without hovering
  await expect(
    page.locator('[data-sport-legend="CYCLING"]').first(),
  ).toContainText('67%');

  // Weeks before the selected period are part of the volume chart
  const volume = page.locator('[data-weekly-volume]');
  await expect(volume.getByText('Cycling')).toBeVisible();
  await expect(volume.getByText('Running')).toBeVisible();
  await expect(volume.locator('.recharts-rectangle').first()).toBeVisible();

  await expect(page.locator('[data-tsb-chart]')).toBeVisible();
  await expect(page.getByText('Daily load')).toBeVisible();

  expect(problems).toEqual([]);
});
