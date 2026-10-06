import { expect, test } from '@playwright/test';

import { importRecentRun } from '../../support/activities';
import { createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { trackPageProblems } from '../../support/page-health';

test.use({ storageState: { cookies: [], origins: [] } });

test('statistics open on the last seven days, with legends and weekly volume', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request);
  await importRecentRun(request, athlete, 'RUNNING', 1, 30);
  await importRecentRun(request, athlete, 'CYCLING', 3, 60);
  await importRecentRun(request, athlete, 'CYCLING', 40, 90);
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
