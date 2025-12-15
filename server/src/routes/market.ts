import { Router } from 'express';
import { getMarketInsights } from '../services/marketData.js';

export const marketRouter = Router();

marketRouter.get('/insights', async (_req, res) => {
  try {
    const data = await getMarketInsights();
    // Back-compat: older clients expect `data`, newer clients (Estimate Accelerator)
    // expect `insights`. Return both to keep everything working.
    res.json({ ok: true, insights: data, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load market insights';
    res.status(500).json({ ok: false, error: message });
  }
});

