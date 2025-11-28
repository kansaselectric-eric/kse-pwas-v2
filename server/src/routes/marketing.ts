import { Router } from 'express';
import { getMarketingPulse } from '../services/marketingInsights.js';

export const marketingRouter = Router();

marketingRouter.get('/pulse', (_req, res) => {
  const pulse = getMarketingPulse();
  res.json({ ok: true, pulse });
});

marketingRouter.get('/heat', (_req, res) => {
  const pulse = getMarketingPulse();
  res.json({
    ok: true,
    generatedAt: pulse.generatedAt,
    heat: pulse.heat,
    accounts: pulse.accounts
  });
});


