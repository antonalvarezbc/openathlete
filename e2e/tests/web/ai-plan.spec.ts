import { expect, test } from '@playwright/test';

import { createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { trackPageProblems } from '../../support/page-health';

// Planning is for coaches in this fork: the athlete coaches their own profile.
// The draft itself runs on the instance AI keys, which this stack does not
// have, so the flow is followed up to the answers being checked.
test.use({ storageState: { cookies: [], origins: [] } });

test('asks for the plan goal in Planning and checks its length', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request, { selfCoached: true });
  await signIn(page, athlete);
  const problems = trackPageProblems(page);

  await page.goto('/dashboard/planning');
  await page.getByLabel('Athlete').selectOption({ label: 'Test Athlete' });
  await page.getByRole('button', { name: 'Create plan with AI' }).click();
  const dialog = page.getByRole('dialog');

  await dialog.getByLabel('Goal race').fill('Spring marathon');
  // Thirty weeks away: longer than the 24 weeks a draft can cover.
  const race = new Date(Date.now() + 30 * 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  await dialog.getByLabel('Race date').fill(race);
  await dialog.getByRole('button', { name: 'Generate draft' }).click();
  await expect(
    dialog.getByText('The race must be 2 to 24 weeks after the plan start.'),
  ).toBeVisible();

  expect(problems).toEqual([]);
});
