import { ApiEnvSchema, ApiEnvSchemaType } from '@openathlete/shared';

/**
 * Validates process environment against ApiEnvSchema for ConfigModule.
 *
 * Empty values are treated as unset: docker compose passes optional
 * variables as `${VAR:-}`, which yields empty strings that would otherwise
 * fail URL or email validation of optional settings.
 */
export function validateEnv(config: Record<string, unknown>): ApiEnvSchemaType {
  const withoutEmpty = Object.fromEntries(
    Object.entries(config).filter(
      ([, value]) => !(typeof value === 'string' && value.trim() === ''),
    ),
  );
  // ConfigService.get() reads process.env before the validated values, and
  // some code reads process.env directly: drop the empty ones there too, so
  // that an empty TRUST_PROXY, for example, means "not set" everywhere.
  for (const [key, value] of Object.entries(config)) {
    if (value === '' && process.env[key] === '') delete process.env[key];
  }

  const result = ApiEnvSchema.safeParse(withoutEmpty);
  if (!result.success) {
    const errors = result.error.errors.map(
      (err) => `  - ${err.path.join('.')}: ${err.message}`,
    );
    throw new Error(
      `Environment validation failed:\n${errors.join('\n')}\n\nPlease check your .env file and ensure all required variables are set.`,
    );
  }
  return result.data;
}
