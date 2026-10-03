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
    Object.entries(config).filter(([, value]) => value !== ''),
  );

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
