/**
 * Variables a Garmin worker inherits from the API. The API's environment holds
 * the database URL, the JWT secret, the hash pepper and payment and AI keys:
 * a Python process that talks to Garmin must not receive them. Everything not
 * listed here is dropped, including PYTHONPATH and GARMINTOKENS, which could
 * load other code or another session.
 */
export const MANUAL_GARMIN_INHERITED_ENV = [
  'PATH',
  'HOME',
  'LANG',
  'LANGUAGE',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  // Servers that reach Garmin through a proxy or a private trust store
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  'CURL_CA_BUNDLE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
] as const;

/** Environment of a Garmin worker: the allow-list plus its own settings. */
export function manualGarminWorkerEnv(
  settings: Record<`OA_GARMIN_${string}`, string>,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const name of MANUAL_GARMIN_INHERITED_ENV) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  return { ...env, PYTHONUNBUFFERED: '1', ...settings };
}
