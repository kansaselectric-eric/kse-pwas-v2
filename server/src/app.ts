import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { teamsRouter } from './routes/teams.js';
import { graphRouter } from './routes/graph.js';
import { healthRouter } from './routes/health.js';
import { acumaticaRouter } from './routes/acumatica.js';
import { authRouter } from './routes/auth.js';
import { aiRouter } from './routes/ai.js';
import { crmRouter } from './routes/crm.js';
import { ocrRouter } from './routes/ocr.js';
import { marketRouter } from './routes/market.js';
import { estimateRouter } from './routes/estimate.js';
import { marketingRouter } from './routes/marketing.js';
import { opportunitiesRouter } from './routes/opportunities.js';
import { nexusRouter } from './routes/nexus.js';
import { cipRouter } from './routes/cip.js';
import { customersRouter } from './routes/customers.js';
import { prospectsRouter } from './routes/prospects.js';
import { initSentry, Sentry } from './sentry.js';
import { config } from './config.js';

export const app = express();
app.set('trust proxy', 1);
// Disable HTTP caching for API responses to avoid 304s and ensure the CRM always receives fresh JSON.
app.set('etag', false);
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
initSentry();
const corsMiddleware = cors({
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    if (!config.auth.allowedOrigins.length) return callback(null, true);
    if (!origin) return callback(null, true);
    // Allow Netlify deploy previews / production Netlify app by default.
    try {
      const host = new URL(origin).hostname.toLowerCase();
      if (host.endsWith('.netlify.app')) return callback(null, true);
    } catch {
      // ignore URL parse errors
    }
    if (config.auth.allowedOrigins.includes(origin)) return callback(null, true);
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

// Serve static tool frontends (Estimate Accelerator, etc.) from the monorepo root.
// `process.cwd()` is `.../kse-pwa-repo/server` in both dev and production scripts.
const staticRoot = path.resolve(process.cwd(), '..');
app.use(
  '/estimate-accelerator/web',
  express.static(path.join(staticRoot, 'estimate-accelerator', 'web'))
);

app.use('/api/health', healthRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/graph', graphRouter);
app.use('/api/acumatica', acumaticaRouter);
app.use('/api/auth', authRouter);
app.use('/api/crm', crmRouter);
app.use('/api/ocr', ocrRouter);
app.use('/api/market', marketRouter);
app.use('/api/estimate', estimateRouter);
app.use('/api/marketing', marketingRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/nexus', nexusRouter);
app.use('/api/cip', cipRouter);
app.use('/api/customers', customersRouter);
app.use('/api/prospects', prospectsRouter);
// IMPORTANT: mount the AI router last. It is mounted at `/api` for backwards
// compatibility (CRM calls `/api/transcribe`, etc.) and applies auth middleware
// to all of its routes. If mounted earlier it will intercept other `/api/*`
// routes (e.g. market/ocr) and incorrectly require auth.
app.use('/api', aiRouter);

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'kse-tools-server' });
});

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}


