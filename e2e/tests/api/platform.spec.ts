import { expect, test } from '@playwright/test';

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
