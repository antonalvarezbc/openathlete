import { ApiEnvSchema } from '@openathlete/shared';

import { omitBlankEnv } from './env.util';

describe('omitBlankEnv', () => {
  it('drops blank strings and keeps other values', () => {
    expect(
      omitBlankEnv({ A: '', B: '  ', C: 'x', D: 0, E: false, F: undefined }),
    ).toEqual({ C: 'x', D: 0, E: false, F: undefined });
  });

  it('lets optional URL and email settings be blank, as compose passes them', () => {
    const blank = {
      GARMIN_REDIRECT_URI: '',
      SUUNTO_REDIRECT_URI: '',
      BREVO_FROM_EMAIL: '',
      FIREBASE_FUNCTIONS_URL: '',
      BETTER_STACK_DSN: '',
    };
    const fields = (config: Record<string, unknown>) => {
      const result = ApiEnvSchema.safeParse(config);
      return result.success
        ? []
        : result.error.errors.map((error) => String(error.path[0]));
    };
    for (const key of Object.keys(blank)) {
      expect(fields(blank)).toContain(key);
      expect(fields(omitBlankEnv(blank))).not.toContain(key);
    }
  });
});
