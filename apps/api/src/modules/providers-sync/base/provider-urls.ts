/**
 * Where a provider sends users back after they authorize OpenAthlete: the
 * web app's callback page. Unless set explicitly, it follows APP_URL, so a
 * self-hosted instance only configures its own address.
 */
export function providerRedirectUri(
  configured: string | undefined,
  appUrl: string | undefined,
  provider: string,
): string {
  if (configured) return configured;
  return appUrl
    ? `${appUrl.replace(/\/+$/, '')}/auth/callback/${provider}`
    : '';
}

/**
 * Where a provider posts its webhooks. Unless set explicitly, the API is
 * reached through the web app under /api, as in the Docker Compose setup.
 */
export function providerWebhookUrl(
  configured: string | undefined,
  appUrl: string | undefined,
  provider: string,
): string {
  if (configured) return configured;
  return appUrl
    ? `${appUrl.replace(/\/+$/, '')}/api/provider/${provider}/webhook`
    : '';
}
