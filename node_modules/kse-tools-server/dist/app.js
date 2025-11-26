import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { teamsRouter } from './routes/teams.js';
import { graphRouter } from './routes/graph.js';
import { healthRouter } from './routes/health.js';
import { acumaticaRouter } from './routes/acumatica.js';
import { authRouter } from './routes/auth.js';
import { aiRouter } from './routes/ai.js';
import { crmRouter } from './routes/crm.js';
import { initSentry, Sentry } from './sentry.js';
import { config } from './config.js';
export const app = express();
initSentry();
const corsOptions = config.auth.allowedOrigins.length
    ? { origin: config.auth.allowedOrigins, credentials: true }
    : undefined;
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60 * 1000, max: 100 }));
app.use(morgan('tiny'));
if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());
}
app.use('/api/health', healthRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/graph', graphRouter);
app.use('/api/acumatica', acumaticaRouter);
app.use('/api/auth', authRouter);
app.use('/api', aiRouter);
app.use('/api', crmRouter);
app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'kse-tools-server' });
});
if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
}
