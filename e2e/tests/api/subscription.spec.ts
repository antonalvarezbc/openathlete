import { expect, test } from '@playwright/test';

import { apiHeaders, createAthlete } from '../../support/api';
import { API_URL } from '../../support/env';

// The E2E stack runs like a self-hosted instance: no Stripe
test('an instance without billing sells nothing and limits nobody', async ({
  request,
}) => {
  const athlete = await createAthlete(request);
  const headers = apiHeaders(undefined, athlete.accessToken);

  const current = await request.get(`${API_URL}/subscription/current`, {
    headers,
  });
  expect(await current.json()).toMatchObject({
    plan: 'FREE',
    billingEnabled: false,
    maxAthletes: null,
  });

  const checkout = await request.post(`${API_URL}/subscription/checkout`, {
    headers,
    data: {
      interval: 'year',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/ko',
    },
  });
  expect(checkout.status()).toBe(503);
});
