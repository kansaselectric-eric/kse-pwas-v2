import * as Sentry from '@sentry/node';
import { RewriteFrames } from '@sentry/integrations';
export function initSentry() {
    const dsn = process.env.SENTRY_DSN;
    if (!dsn)
        return;
    Sentry.init({
        dsn,
        tracesSampleRate: 0.1,
        integrations: [new RewriteFrames({ root: process.cwd() })],
        environment: process.env.NODE_ENV || 'development'
    });
}
export { Sentry };
