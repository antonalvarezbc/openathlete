import { expect, test as setup } from '@playwright/test';

import { createAthlete } from '../support/api';
import { AUTH_FILE } from '../support/env';

// One athlete logged in through the real login form; the desktop and
// mobile projects reuse its browser session (tokens in localStorage).
setup('log in the shared athlete', async ({ page, request }) => {
  const athlete = await createAthlete(request);

  await page.goto('/auth/login');
  await page.fill('input[name="email"]', athlete.email);
  await page.fill('input[name="password"]', athlete.password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: AUTH_FILE });
});
