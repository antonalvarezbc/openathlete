import type { Page } from '@playwright/test';

import type { TestAthlete } from './api';

/**
 * Logs the page in as the athlete with the tokens the API returned, before
 * any app script runs. Only tests about the login form go through it:
 * browser logins share the runner's IP and its 10 logins per minute.
 */
export async function signIn(page: Page, athlete: TestAthlete) {
  await page.addInitScript(
    ({ accessToken, refreshToken }) => {
      if (!localStorage.getItem('access_token')) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
      }
    },
    { accessToken: athlete.accessToken, refreshToken: athlete.refreshToken },
  );
}
