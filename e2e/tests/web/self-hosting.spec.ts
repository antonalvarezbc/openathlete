import { expect, test } from '@playwright/test';

import { WEB_URL } from '../../support/env';

// Without API_PUBLIC_URL, the web image proxies the API under /api
test('reaches the API through its own origin', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(`${WEB_URL}/api/`)) {
      apiCalls.push(request.url());
    }
  });

  await page.goto('/dashboard/calendar');
  await page.waitForLoadState('networkidle');

  await expect(
    page.locator('meta[name="openathlete-api-base-url"]'),
  ).toHaveAttribute('content', '/api');
  expect(apiCalls.some((url) => url.endsWith('/api/user/me'))).toBe(true);
});

// Self-hosted instances must not report to the hosted instance's analytics,
// error monitoring or session recording: those are opt-in build variables.
test('makes no third-party request', async ({ page }) => {
  const allowed = [new URL(WEB_URL).origin];
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
