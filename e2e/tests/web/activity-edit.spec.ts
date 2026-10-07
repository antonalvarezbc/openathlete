import { expect, test } from '@playwright/test';

import { importRecentRun } from '../../support/activities';
import { apiHeaders, createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { API_URL } from '../../support/env';
import { trackPageProblems } from '../../support/page-health';

test.use({ storageState: { cookies: [], origins: [] } });

test('edits an activity over its details: equipment, race, then deletion', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request);
  const shoes = await request.post(`${API_URL}/equipment`, {
    headers: apiHeaders(undefined, athlete.accessToken),
    data: { name: 'Trail shoes', type: 'SHOE', sports: ['RUNNING'] },
  });
  expect(shoes.status(), await shoes.text()).toBe(201);
  await importRecentRun(request, athlete, 'RUNNING', 1, 30);
  await signIn(page, athlete);
  const problems = trackPageProblems(page);

  await page.goto('/dashboard/calendar');
  await page.getByText('RUNNING session').first().click();
  const details = page.getByRole('dialog');
  await details.getByRole('button', { name: 'Edit', exact: true }).click();

  // The form opens over the details instead of replacing them: both are in
  // the page, the details hidden from assistive tech while the form is up
  const form = page.getByRole('dialog', { name: 'Edit the activity' });
  await expect(form).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(2);

  await form.getByRole('combobox', { name: 'Equipment' }).click();
  await page.getByRole('option', { name: 'Trail shoes' }).click();
  await form.getByText('It was a race').click();
  await form.getByRole('button', { name: 'Save' }).click();

  await expect(form).toBeHidden();
  await expect(page.locator('[data-race-badge]')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Trail shoes');

  // Deleting from the form closes both dialogs and removes the card
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await form.locator('[data-event-delete]').click();
  await page
    .getByRole('dialog', { name: 'Delete Event' })
    .getByRole('button', { name: 'Delete' })
    .click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.getByText('RUNNING session')).toHaveCount(0);

  expect(problems).toEqual([]);
});
