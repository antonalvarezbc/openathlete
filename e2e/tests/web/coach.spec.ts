import { type Page, expect, test } from '@playwright/test';

import {
  type TestUser,
  apiHeaders,
  createCoachWithAthlete,
} from '../../support/api';
import { signIn } from '../../support/browser';
import { API_URL } from '../../support/env';
import { trackPageProblems } from '../../support/page-health';

test.use({ storageState: { cookies: [], origins: [] } });

// The browser remembers the coach space, as after switching to it once
async function signInAsCoach(page: Page, coach: TestUser) {
  await signIn(page, coach);
  await page.addInitScript(() => {
    localStorage.setItem('current_space', 'COACH');
  });
}

test('the coach dashboard lists a linked athlete and opens their calendar', async ({
  page,
  request,
}) => {
  const { coach, athlete, athleteId } = await createCoachWithAthlete(request);
  await signInAsCoach(page, coach);
  const problems = trackPageProblems(page);

  await page.goto('/dashboard/coach');
  await expect(page.getByText(athlete.email)).toBeVisible();
  await page.getByTitle('View calendar').click();

  await expect(page).toHaveURL(new RegExp(`/dashboard/calendar/${athleteId}$`));
  expect(problems).toEqual([]);
});

test('a coach deletes several planned workouts at once', async ({
  page,
  request,
}) => {
  const { coach, athleteId } = await createCoachWithAthlete(request);
  const headers = apiHeaders(undefined, coach.accessToken);
  // Mid-month as the browser sees it (playwright.config's time zone), so
  // the month the calendar opens on holds all three
  const [month, , year] = new Date()
    .toLocaleDateString('en-US', { timeZone: 'America/New_York' })
    .split('/')
    .map(Number);
  for (const [day, name] of [
    'Easy run A',
    'Easy run B',
    'Easy run C',
  ].entries()) {
    const start = new Date(Date.UTC(year, month - 1, 10 + day, 16));
    const planned = await request.post(`${API_URL}/event`, {
      headers,
      data: {
        type: 'TRAINING',
        athleteId,
        name,
        sport: 'RUNNING',
        description: '',
        startDate: start.toISOString(),
        endDate: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      },
    });
    expect(planned.status(), await planned.text()).toBe(201);
  }
  await signInAsCoach(page, coach);

  await page.goto(`/dashboard/calendar/${athleteId}`);
  await page.getByRole('button', { name: 'Select workouts' }).click();
  await page.getByRole('checkbox', { name: 'Select Easy run A' }).check();
  await page.getByRole('checkbox', { name: 'Select Easy run B' }).check();
  await expect(page.getByText('2 workouts selected')).toBeVisible();
  await page.getByRole('button', { name: 'Delete selected' }).click();

  // The names are reviewed before anything is deleted
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Easy run A');
  await expect(confirm).toContainText('Easy run B');
  await expect(confirm).not.toContainText('Easy run C');
  await confirm.locator('[data-bulk-delete-confirm]').click();

  await expect(page.getByText('Deleted 2 workouts.')).toBeVisible();
  const events = await request.get(
    `${API_URL}/event?coach=true&athleteId=${athleteId}`,
    { headers },
  );
  expect(events.status(), await events.text()).toBe(200);
  const names = ((await events.json()) as { name: string }[]).map(
    (event) => event.name,
  );
  expect(names).toEqual(['Easy run C']);
});
