import { expect, test } from '@playwright/test';

import { createAthlete } from '../../support/api';
import { signIn } from '../../support/browser';

test.use({ storageState: { cookies: [], origins: [] } });

// The chat opens where the finger lifts: the click the browser emulates
// after the touch must not land on its backdrop and close it again
test('a tap on the messages bubble opens the chat', async ({
  page,
  request,
}) => {
  const athlete = await createAthlete(request);
  await signIn(page, athlete);

  await page.goto('/dashboard/calendar');
  const bubble = page.locator('[data-chat-bubble]');
  await bubble.tap();

  const close = page.getByTitle('Close', { exact: true });
  await expect(close).toBeVisible();
  await page.waitForTimeout(500);
  await expect(close).toBeVisible();
  await expect(bubble).toBeHidden();
});
