import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 0,
    // Don't send errors in development
    enabled: import.meta.env.PROD,
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.error(error, context);
    return;
  }
  if (error instanceof Error) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } else {
    Sentry.captureMessage(String(error), { level: 'error', extra: context });
  }
}

export function captureWarning(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.warn(message, context);
    return;
  }
  Sentry.captureMessage(message, { level: 'warning', extra: context });
}
