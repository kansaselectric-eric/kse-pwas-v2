import { Router } from 'express';
import { getOpportunityFeed } from '../services/opportunityScout.js';
import { recordOpportunityUsage, getOpportunityUsageReport } from '../services/opportunityUsage.js';
import { logger } from '../logger.js';

export const opportunitiesRouter = Router();

opportunitiesRouter.get('/', async (req, res) => {
  try {
    const { keywords, state, type, minValue, limit } = req.query;
    const data = await getOpportunityFeed({
      keywords: typeof keywords === 'string' ? keywords : undefined,
      state: typeof state === 'string' ? state : undefined,
      type: typeof type === 'string' ? (type as any) : undefined,
      minValue: typeof minValue === 'string' ? Number(minValue) : undefined,
      limit: typeof limit === 'string' ? Number(limit) : undefined
    });
    res.json({
      ok: true,
      results: data.items,
      stats: data.stats,
      sources: data.sources,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error }, 'Opportunity feed error');
    res.status(500).json({ ok: false, error: message });
  }
});

opportunitiesRouter.post('/usage', (req, res) => {
  const { action, payload } = req.body || {};
  if (!action || typeof action !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing action' });
  }
  const event = recordOpportunityUsage(action, typeof payload === 'object' ? payload : {});
  res.json({ ok: true, event });
});

opportunitiesRouter.get('/usage', (req, res) => {
  const days = typeof req.query.days === 'string' ? Number(req.query.days) : undefined;
  const report = getOpportunityUsageReport(days && !Number.isNaN(days) ? days : 14);
  res.json({ ok: true, report });
});

