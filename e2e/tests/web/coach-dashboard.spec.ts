import { expect, test } from '@playwright/test';

import { createAthlete, linkCoach } from '../../support/api';
import { signIn } from '../../support/browser';
import { trackPageProblems } from '../../support/page-health';

test.use({ storageState: { cookies: [], origins: [] } });

test('the coach dashboard flags athletes to watch and fits the screen', async ({
  page,
  request,
}) => {
  const coach = await createAthlete(request, {
    roles: ['ATHLETE', 'COACH'],
    firstName: 'Coach',
  });
  const athlete = await createAthlete(request, { firstName: 'Ines' });
  await linkCoach(request, coach, athlete);
  await signIn(page, coach);
  const problems = trackPageProblems(page);
  await page.setViewportSize({ width: 970, height: 800 });

  // Reachable from the athlete space, not only from the space switcher
  await page.goto('/dashboard/calendar');
  await page.getByRole('link', { name: 'Coach dashboard' }).click();
  await expect(page).toHaveURL(/\/dashboard\/coach$/);

  // An athlete without any activity is on the watchlist
  const watchlist = page.locator('[data-coach-watchlist]');
  await expect(watchlist.getByText('Ines Athlete')).toBeVisible();
  await expect(watchlist.locator('[data-coach-alert="inactive"]')).toHaveText(
    'No activity yet',
  );

  // Every column fits 970 px: the page does not scroll sideways
  await expect(page.locator('[data-coach-table]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  expect(problems).toEqual([]);
});
