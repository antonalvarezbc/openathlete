import { type APIRequestContext, expect } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';

import { API_URL } from './env';

export interface TestUser {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

export type TestAthlete = TestUser;

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

/** Signs up a new user and completes the onboarding with the given roles. */
async function createUser(
  request: APIRequestContext,
  roles: ('ATHLETE' | 'COACH')[],
  { firstName = 'Test', lastName = 'Athlete', coachSelf = false } = {},
): Promise<TestUser> {
  const ip = randomClientIp();
  const email = `e2e-${randomUUID()}@example.com`;
  const password = 'E2e-Test-Passw0rd!';

  const signup = await request.post(`${API_URL}/user`, {
    headers: apiHeaders(ip),
    data: { email, password, firstName, lastName },
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
      roles,
      ...(coachSelf && { coachSelf: true }),
      ...(roles.includes('ATHLETE') && {
        gender: 'MALE',
        hrMax: 190,
        hrRest: 50,
      }),
    },
  });
  expect(onboarding.status(), await onboarding.text()).toBe(201);

  return { email, password, accessToken, refreshToken };
}

/**
 * Signs up a new user and completes the athlete onboarding. With
 * `selfCoached`, the account is athlete and coach of its own profile: in this
 * fork planning (AI generation, templates) is reserved for coaches.
 */
export function createAthlete(
  request: APIRequestContext,
  {
    roles = ['ATHLETE'],
    firstName = 'Test',
    selfCoached = false,
  }: {
    roles?: ('ATHLETE' | 'COACH')[];
    firstName?: string;
    selfCoached?: boolean;
  } = {},
): Promise<TestAthlete> {
  return createUser(request, selfCoached ? ['ATHLETE', 'COACH'] : roles, {
    firstName,
    coachSelf: selfCoached,
  });
}

/** The coach invites the athlete, who accepts: the coach then sees them. */
export async function linkCoach(
  request: APIRequestContext,
  coach: TestUser,
  athlete: TestUser,
) {
  const invite = await request.post(`${API_URL}/athlete/invite/athlete`, {
    headers: apiHeaders(undefined, coach.accessToken),
    data: { email: athlete.email },
  });
  expect(invite.status(), await invite.text()).toBe(201);

  const athleteHeaders = apiHeaders(undefined, athlete.accessToken);
  const pending = await request.get(`${API_URL}/athlete/invitations/pending`, {
    headers: athleteHeaders,
  });
  expect(pending.status(), await pending.text()).toBe(200);
  const [invitation] = (await pending.json()) as {
    athleteInvitationId: number;
  }[];
  const accept = await request.post(
    `${API_URL}/athlete/invitations/${invitation.athleteInvitationId}/accept`,
    { headers: athleteHeaders },
  );
  expect(accept.status(), await accept.text()).toBe(201);
}

/**
 * A coach and an athlete linked the way people do it: the coach invites the
 * athlete, who accepts. athleteId is the athlete profile the coach manages.
 */
export async function createCoachWithAthlete(request: APIRequestContext) {
  const athlete = await createAthlete(request);
  const coach = await createUser(request, ['COACH'], { lastName: 'Coach' });
  await linkCoach(request, coach, athlete);

  const coached = await request.get(`${API_URL}/athlete/coached`, {
    headers: apiHeaders(undefined, coach.accessToken),
  });
  expect(coached.status(), await coached.text()).toBe(200);
  const [{ athleteId }] = (await coached.json()) as { athleteId: number }[];

  return { coach, athlete, athleteId };
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
