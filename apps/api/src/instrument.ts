import * as Sentry from '@sentry/nestjs';

// Ensure to call this before requiring any other modules!
// Without BETTER_STACK_DSN, Sentry stays disabled.
Sentry.init({
  dsn: process.env.BETTER_STACK_DSN || undefined,
  // Share of requests traced; tracing every request is costly in production
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  environment: process.env.NODE_ENV || 'production',
});
