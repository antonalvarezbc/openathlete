import { expect, test } from '@playwright/test';

import { createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';
import { importRunWithRecords } from '../../support/records';

test.use({ storageState: { cookies: [], origins: [] } });

test('the records page fits a phone screen', async ({ page, request }) => {
  const athlete = await createAthlete(request);
  await importRunWithRecords(request, athlete);
  await signIn(page, athlete);

  await page.goto('/dashboard/records');
  await expect(page.locator('[data-records-metric="SPEED"]')).toBeVisible();

  // Wide tables scroll inside their card, the page itself does not
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
