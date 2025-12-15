import { Router } from 'express';
import { verifyAuthToken } from '../middleware/auth.js';
import { prisma } from '../services/db.js';

export const prospectsRouter = Router();

prospectsRouter.use(verifyAuthToken);

prospectsRouter.get('/', async (_req, res) => {
  // MVP: treat early CIP/signal items as "prospects" for mapping.
  const items = await prisma.capitalPlanItem.findMany({
    where: { state: 'KS' },
    orderBy: [{ publishedAt: 'desc' }, { scrapedAt: 'desc' }],
    take: 250
  });
  const prospects = items.map((i: any) => ({
    id: i.id,
    name: i.title,
    industry: '',
    revenuePotential: Number(i.budget || 0) || 0,
    latitude: i.latitude != null ? Number(i.latitude) : null,
    longitude: i.longitude != null ? Number(i.longitude) : null
  }));
  res.json(prospects);
});




