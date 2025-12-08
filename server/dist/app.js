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
import { ocrRouter } from './routes/ocr.js';
import { marketRouter } from './routes/market.js';
import { marketingRouter } from './routes/marketing.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { nexusRouter } from './routes/nexus.js';
import { initSentry, Sentry } from './sentry.js';
import { config } from './config.js';
export const app = express();
app.set('trust proxy', 1);
initSentry();
const corsMiddleware = cors({
    origin(origin, callback) {
        if (!config.auth.allowedOrigins.length)
            return callback(null, true);
        if (!origin)
            return callback(null, true);
        if (config.auth.allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error(`Origin ${origin} not allowed`));
    },
    credentials: true
});
app.use(corsMiddleware);
app.use(express.json({ limit: '30mb' }));
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
app.use('/api/crm', crmRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/market', marketRouter);
app.use('/api/marketing', marketingRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/nexus', nexusRouter);
app.get('/', (_req, res) => {
    res.json({ ok: true, service: 'kse-tools-server' });
});
if (process.env.SENTRY_DSN) {
    app.use(Sentry.Handlers.errorHandler());
}
