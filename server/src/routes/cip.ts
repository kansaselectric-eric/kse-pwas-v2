import { Router } from 'express';
import { verifyAuthToken } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { ingestCipSeeds, ingestKansasEarlySignals, searchCip } from '../services/cipIntel.js';

export const cipRouter = Router();

cipRouter.use(verifyAuthToken);

cipRouter.get('/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const city = typeof req.query.city === 'string' ? req.query.city : undefined;
    const source = typeof req.query.source === 'string' ? req.query.source : undefined;
    const near = typeof req.query.near === 'string' ? req.query.near : undefined;
    const radiusMi = typeof req.query.radiusMi === 'string' ? Number(req.query.radiusMi) : undefined;
    const nearLat = typeof req.query.nearLat === 'string' ? Number(req.query.nearLat) : undefined;
    const nearLng = typeof req.query.nearLng === 'string' ? Number(req.query.nearLng) : undefined;
    const minBudget = typeof req.query.minBudget === 'string' ? Number(req.query.minBudget) : undefined;
    const maxBudget = typeof req.query.maxBudget === 'string' ? Number(req.query.maxBudget) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const offset = typeof req.query.offset === 'string' ? Number(req.query.offset) : undefined;

    const resolvedNear =
      near && near.toLowerCase().includes('newton')
        ? { nearLat: 38.0467, nearLng: -97.3450 }
        : { nearLat: nearLat != null && !Number.isNaN(nearLat) ? nearLat : undefined, nearLng: nearLng != null && !Number.isNaN(nearLng) ? nearLng : undefined };

    const data = await searchCip({
      q,
      state,
      city,
      source,
      nearLat: resolvedNear.nearLat,
      nearLng: resolvedNear.nearLng,
      radiusMi: radiusMi != null && !Number.isNaN(radiusMi) ? radiusMi : undefined,
      minBudget: minBudget != null && !Number.isNaN(minBudget) ? minBudget : undefined,
      maxBudget: maxBudget != null && !Number.isNaN(maxBudget) ? maxBudget : undefined,
      limit: limit != null && !Number.isNaN(limit) ? limit : undefined,
      offset: offset != null && !Number.isNaN(offset) ? offset : undefined
    });
    return res.json({ ok: true, ...data, generatedAt: new Date().toISOString() });
  } catch (error) {
    logger.error({ error }, 'CIP search failed');
    return res.status(500).json({ ok: false, error: 'CIP search failed' });
  }
});

cipRouter.post('/ingest', async (req, res) => {
  try {
    // Minimal safety gate: only admin can ingest.
    if (req.authUser?.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admin only' });
    }
    const maxPerSource = typeof req.body?.maxPerSource === 'number' ? req.body.maxPerSource : 25;
    const includeSignals = req.body?.includeSignals !== false;
    const radiusMi = typeof req.body?.radiusMi === 'number' ? req.body.radiusMi : 120;
    const near = typeof req.body?.near === 'string' ? req.body.near : undefined;
    const nearLat = typeof req.body?.nearLat === 'number' ? req.body.nearLat : undefined;
    const nearLng = typeof req.body?.nearLng === 'number' ? req.body.nearLng : undefined;
    const resolvedNear =
      !near || near.toLowerCase().includes('newton')
        ? { nearLat: 38.0467, nearLng: -97.3450 }
        : { nearLat, nearLng };

    const seedResult = await ingestCipSeeds({
      maxPerSource,
      nearLat: resolvedNear.nearLat,
      nearLng: resolvedNear.nearLng,
      radiusMi
    });
    const signalResult = includeSignals
      ? await ingestKansasEarlySignals(resolvedNear.nearLat, resolvedNear.nearLng, radiusMi)
      : { harvested: 0, upserted: 0 };
    return res.json({
      ok: true,
      seeds: seedResult,
      signals: signalResult,
      ingestedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'CIP ingest failed');
    return res.status(500).json({ ok: false, error: 'CIP ingest failed' });
  }
});

