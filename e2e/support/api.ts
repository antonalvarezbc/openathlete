import { type APIRequestContext, expect } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';

import { API_URL } from './env';

export interface TestAthlete {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * A private address for X-Forwarded-For. The API trusts it from the Docker
 * network, so each caller gets its own rate limit budget instead of sharing
 * the 10 logins per minute of the test runner's IP.
 */
export function randomClientIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

export function apiHeaders(ip = randomClientIp(), accessToken?: string) {
  return {
    'X-Forwarded-For': ip,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}

export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
  ip = randomClientIp(),
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await request.post(`${API_URL}/auth/login`, {
    headers: apiHeaders(ip),
    data: { email, password },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as {
    accessToken: string;
    refreshToken: string;
  };
}

/**
 * Signs up a new user and completes the athlete onboarding. With
 * `selfCoached`, the account is athlete and coach of its own profile: in this
 * fork planning (AI generation, templates) is reserved for coaches.
 */
export async function createAthlete(
  request: APIRequestContext,
  { selfCoached = false }: { selfCoached?: boolean } = {},
): Promise<TestAthlete> {
  const ip = randomClientIp();
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'E2e-Test-Passw0rd!';

  const signup = await request.post(`${API_URL}/user`, {
    headers: apiHeaders(ip),
    data: { email, password, firstName: 'Test', lastName: 'Athlete' },
  });
  expect(signup.status(), await signup.text()).toBe(201);

  const { accessToken, refreshToken } = await login(
    request,
    email,
    password,
    ip,
  );

  const onboarding = await request.post(`${API_URL}/user/complete-onboarding`, {
    headers: apiHeaders(ip, accessToken),
    data: {
      roles: selfCoached ? ['ATHLETE', 'COACH'] : ['ATHLETE'],
      ...(selfCoached ? { coachSelf: true } : {}),
      gender: 'MALE',
      hrMax: 190,
      hrRest: 50,
    },
  });
  expect(onboarding.status(), await onboarding.text()).toBe(201);

  return { email, password, accessToken, refreshToken };
}

/** The OpenAI-compatible service of docker-compose.yml, seen from the API. */
export const FAKE_LLM_URL = 'http://fake-llm:8080/v1';

/**
 * Gives the user their own AI key on the fake-llm service and makes it the
 * default for every AI task, so the AI features are available to them.
 */
export async function setUpFakeLlm(
  request: APIRequestContext,
  accessToken: string,
): Promise<{ aiCredentialId: number }> {
  const headers = apiHeaders(undefined, accessToken);
  const credential = await request.post(`${API_URL}/ai/credentials`, {
    headers,
    data: {
      provider: 'custom',
      apiKey: 'e2e-secret-key-1234',
      baseUrl: FAKE_LLM_URL,
    },
  });
  expect(credential.status(), await credential.text()).toBe(201);
  const { aiCredentialId } = (await credential.json()) as {
    aiCredentialId: number;
  };

  const models = await request.put(`${API_URL}/ai/models`, {
    headers,
    data: {
      preferences: [{ task: 'DEFAULT', aiCredentialId, modelId: 'fake-coach' }],
    },
  });
  expect(models.ok(), await models.text()).toBe(true);
  return { aiCredentialId };
}
