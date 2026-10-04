import { expect, test } from '@playwright/test';

import { apiHeaders, createAthlete, randomClientIp } from '../../support/api';
import { API_URL } from '../../support/env';

test('rejects passwords shorter than 8 characters', async ({ request }) => {
  const response = await request.post(`${API_URL}/user`, {
    headers: apiHeaders(),
    data: {
      email: 'short-password@example.com',
      password: 'short',
      firstName: 'Short',
      lastName: 'Password',
    },
  });
  expect(response.status()).toBe(400);
});

test('rejects a wrong password', async ({ request }) => {
  const athlete = await createAthlete(request);

  const response = await request.post(`${API_URL}/auth/login`, {
    headers: apiHeaders(),
    data: { email: athlete.email, password: 'Wrong-Passw0rd!' },
  });
  expect(response.status()).toBe(401);
});

test('rate limits login attempts per client', async ({ request }) => {
  const ip = randomClientIp();
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await request.post(`${API_URL}/auth/login`, {
      headers: apiHeaders(ip),
      data: { email: 'nobody@example.com', password: 'Wrong-Passw0rd!' },
    });
    statuses.push(response.status());
  }

  expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
  expect(statuses).toContain(429);
});

test('password reset does not reveal whether an account exists', async ({
  request,
}) => {
  const athlete = await createAthlete(request);
  const reset = (email: string) =>
    request.post(`${API_URL}/user/password-reset/request`, {
      headers: apiHeaders(),
      data: { email },
    });

  const existing = await reset(athlete.email);
  const unknown = await reset('nobody-here@example.com');

  expect(existing.status()).toBe(unknown.status());
  expect(await existing.text()).toBe(await unknown.text());
});

test('deleted accounts can no longer log in', async ({ request }) => {
  const athlete = await createAthlete(request);

  const deletion = await request.delete(`${API_URL}/user`, {
    headers: apiHeaders(undefined, athlete.accessToken),
  });
  expect(deletion.status()).toBe(200);
  expect(await deletion.json()).toEqual({ success: true });

  const relogin = await request.post(`${API_URL}/auth/login`, {
    headers: apiHeaders(),
    data: { email: athlete.email, password: athlete.password },
  });
  expect(relogin.status()).toBe(401);
});

test('a fresh athlete can read their dashboard data', async ({ request }) => {
  const athlete = await createAthlete(request);
  const headers = apiHeaders(undefined, athlete.accessToken);

  const me = await request.get(`${API_URL}/athlete/me`, { headers });
  expect(me.ok()).toBe(true);
  const { athleteId } = (await me.json()) as { athleteId: number };

  for (const path of [
    '/user/me',
    `/training-load/metrics?calculationType=TRIMP&athleteId=${athleteId}`,
    `/training-load/weekly-summary?athleteId=${athleteId}&startDate=2026-01-05&endDate=2026-02-01`,
  ]) {
    const response = await request.get(`${API_URL}${path}`, { headers });
    expect(response.status(), path).toBe(200);
  }
});
