import { expect, test } from '@playwright/test';

import { trackPageProblems } from '../../support/page-health';

test('navigates through the drawer menu', async ({ page }) => {
  const problems = trackPageProblems(page);
  await page.goto('/dashboard/calendar');

  const menu = page.locator('[data-mobile-menu-trigger]');
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('link', { name: 'Statistics' }).click();

  await expect(page).toHaveURL(/\/dashboard\/statistics/);
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  expect(problems).toEqual([]);
});

test('fits the screen without horizontal scrolling', async ({ page }) => {
  for (const name of ['calendar', 'statistics', 'settings']) {
    await page.goto(`/dashboard/${name}`);
    await page.waitForLoadState('networkidle');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows, name).toBe(false);
  }
});
