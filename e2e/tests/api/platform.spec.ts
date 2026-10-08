import { expect, test } from '@playwright/test';

import { apiHeaders, createAthlete } from '../../support/api';
import { API_URL } from '../../support/env';

test('reports healthy', async ({ request }) => {
  const response = await request.get(`${API_URL}/health`);
  expect(response.ok()).toBe(true);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('sends security headers', async ({ request }) => {
  const response = await request.get(`${API_URL}/health`);
  const headers = response.headers();

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['x-powered-by']).toBeUndefined();
});

test('serves the API reference', async ({ request }) => {
  const response = await request.get(`${API_URL}/docs`);
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain('swagger-ui');
});

test('refuses to connect a device service the instance has not set up', async ({
  request,
}) => {
  const athlete = await createAthlete(request);
  const response = await request.get(`${API_URL}/provider/strava/uri`, {
    headers: apiHeaders(undefined, athlete.accessToken),
  });
  expect(response.status()).toBe(503);
  expect(await response.text()).toContain('PROVIDER_NOT_CONFIGURED');
});
