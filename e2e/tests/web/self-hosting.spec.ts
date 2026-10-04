import { expect, test } from '@playwright/test';

import { API_URL, WEB_URL } from '../../support/env';

test('calls the API URL set when the container started', async ({ page }) => {
  await page.goto('/dashboard/calendar');

  await expect(
    page.locator('meta[name="openathlete-api-base-url"]'),
  ).toHaveAttribute('content', API_URL);
});

// Self-hosted instances must not report to the hosted instance's analytics,
// error monitoring or session recording: those are opt-in build variables.
test('makes no third-party request', async ({ page }) => {
  const allowed = [new URL(WEB_URL).origin, new URL(API_URL).origin];
  const thirdParty = new Set<string>();
  page.on('request', (request) => {
    const { origin, protocol } = new URL(request.url());
    if (protocol.startsWith('http') && !allowed.includes(origin)) {
      thirdParty.add(origin);
    }
  });

  await page.goto('/dashboard/calendar');
  await page.waitForLoadState('networkidle');
  await page.goto('/dashboard/statistics');
  await page.waitForLoadState('networkidle');

  expect([...thirdParty]).toEqual([]);
});
