import * as Sentry from '@sentry/react';

let isInitialized = false;

// Set at build time by each deployment; unset disables error monitoring, so
// self-hosted instances never report to the OpenAthlete cloud project.
const ERROR_MONITORING_DSN = import.meta.env.VITE_ERROR_MONITORING_DSN;

export function initErrorMonitoring() {
  if (isInitialized || import.meta.env.DEV || !ERROR_MONITORING_DSN) {
    return;
  }

  Sentry.init({
    dsn: ERROR_MONITORING_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate: 0.25,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
  });

  isInitialized = true;
}
