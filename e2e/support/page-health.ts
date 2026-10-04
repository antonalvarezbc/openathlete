import type { Page } from '@playwright/test';

/** Third-party noise that says nothing about the app itself. */
const IGNORED = [/favicon/i, /ERR_BLOCKED_BY_CLIENT/];

/**
 * Collects what a user would experience as a broken page: uncaught errors,
 * console errors and failed requests. Assert the list is empty after the
 * interaction under test.
 */
export function trackPageProblems(page: Page): string[] {
  const problems: string[] = [];

  page.on('pageerror', (error) =>
    problems.push(`page error: ${error.message}`),
  );
  page.on('console', (message) => {
    const text = message.text();
    // Failed requests are reported with their URL by the response listener
    if (
      message.type() === 'error' &&
      !text.startsWith('Failed to load resource') &&
      !IGNORED.some((pattern) => pattern.test(text))
    ) {
      problems.push(`console error: ${text.slice(0, 300)}`);
    }
  });
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      !IGNORED.some((pattern) => pattern.test(response.url()))
    ) {
      problems.push(
        `HTTP ${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });

  return problems;
}

/** The text React Router and the app's error boundaries render on a crash. */
export const ERROR_BOUNDARY_TEXT =
  /something went wrong|unexpected application error/i;
