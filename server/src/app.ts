import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { teamsRouter } from './routes/teams.js';
import { graphRouter } from './routes/graph.js';
import { healthRouter } from './routes/health.js';
import { acumaticaRouter } from './routes/acumatica.js';
import { initSentry, Sentry } from './sentry.js';

export const app = express();
initSentry();
app.use(cors());
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

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'kse-tools-server' });
});

if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}


