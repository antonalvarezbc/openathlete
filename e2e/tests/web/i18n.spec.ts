import { expect, test } from '@playwright/test';

import { WEB_URL } from '../../support/env';

// Paraglide reads the locale from its cookie before rendering
for (const [locale, calendar] of [
  ['en', 'Calendar'],
  ['fr', 'Calendrier'],
  ['it', 'Calendario'],
  ['es', 'Calendario'],
]) {
  test(`renders the dashboard in ${locale}`, async ({ page, context }) => {
    await context.addCookies([
      { name: 'PARAGLIDE_LOCALE', value: locale, url: WEB_URL },
    ]);

    await page.goto('/dashboard/calendar');

    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(
      page.getByText(calendar, { exact: true }).first(),
    ).toBeVisible();
  });
}
