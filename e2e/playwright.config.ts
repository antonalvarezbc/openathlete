import { defineConfig, devices } from '@playwright/test';

import { AUTH_FILE, WEB_URL } from './support/env';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'api', testMatch: /api\/.*\.spec\.ts/ },
    {
      name: 'desktop',
      testMatch: /web\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      testMatch: /mobile\/.*\.spec\.ts/,
      // The iPhone viewport and touch input, rendered by Chromium
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        storageState: AUTH_FILE,
      },
      dependencies: ['setup'],
    },
    {
      // The same phone tests on an Android phone: its own viewport, screen
      // density and user agent
      name: 'android',
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices['Pixel 8'], storageState: AUTH_FILE },
      dependencies: ['setup'],
    },
  ],
});
