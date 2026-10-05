/**
 * Where to go once signed in: the page a signed-out visitor asked for, or a
 * `returnTo` link from the website. Kept in sessionStorage so it survives
 * moving between login and sign-up, OAuth, and onboarding.
 */
const STORAGE_KEY = 'openathlete-return-to';

/** Query parameter of the login and sign-up pages. */
export const RETURN_TO_PARAM = 'returnTo';

/**
 * A path of this app, or null. Anything else (another origin, `//host`,
 * `/\host`, the auth pages themselves) is refused, so the parameter cannot
 * send users to another site.
 */
export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || /^\/[/\\]/.test(value)) return null;
  // Resolving against a dummy origin catches encoded tricks like /%2F%2Fhost
  const url = new URL(value, 'https://app.invalid');
  if (url.origin !== 'https://app.invalid') return null;
  if (url.pathname === '/auth' || url.pathname.startsWith('/auth/')) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function rememberReturnTo(path: string | null | undefined) {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, safe);
  } catch {
    // Storage can be blocked: users then land on the dashboard
  }
}

/** The remembered page, forgotten once read, or the fallback. */
export function takeReturnTo(fallback: string): string {
  try {
    const stored = safeReturnPath(sessionStorage.getItem(STORAGE_KEY));
    sessionStorage.removeItem(STORAGE_KEY);
    return stored ?? fallback;
  } catch {
    return fallback;
  }
}
