import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ocrRouter } from './routes/ocr.js';
import { sessionsRouter } from './routes/sessions.js';
import { takeoffRouter } from './routes/takeoff.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
        if (!origin) return cb(null, true);
        try {
          const host = new URL(origin).hostname.toLowerCase();
          if (host.endsWith('.netlify.app')) return cb(null, true);
        } catch {
          // ignore
        }
        return cb(null, true);
      },
      credentials: true
    })
  );
  app.use(helmet());
  app.use(express.json({ limit: '35mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'estimate-accelerator-api' }));

  // Market endpoint (optional UI panel). Provide a safe placeholder.
  app.get('/api/market/insights', (_req, res) => {
    res.json({
      ok: true,
      insights: {
        updatedAt: new Date().toISOString(),
        ppi: { seriesId: 'n/a', latestValue: null, changePercent: null, periodName: null, label: 'Electrical equipment' },
        solarCapex: { label: 'PV capex median', value: null, unit: 'USD/kW', source: 'n/a' },
        energyPrice: { label: 'Energy price', value: null, unit: 'cents/kWh', source: 'n/a' },
        interconnection: { region: 'n/a', backlogMonths: null, note: 'n/a' },
        commodities: [],
        notes: ['Market feeds not configured for Estimate Accelerator API.']
      }
    });
  });

  app.use('/api/ocr', ocrRouter);
  app.use('/api/estacc/sessions', sessionsRouter);
  app.use('/api/estimate', takeoffRouter);

  return app;
}
