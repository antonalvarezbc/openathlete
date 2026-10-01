/**
 * Treats blank environment variables as unset. Compose files pass optional
 * variables as `${VAR:-}`, which yields "" and would otherwise fail URL or
 * email validation of optional settings.
 */
export function omitBlankEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) => !(typeof value === 'string' && value.trim() === ''),
    ),
  );
}
