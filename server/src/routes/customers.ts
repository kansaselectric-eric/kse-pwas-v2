import { Router } from 'express';
import { verifyAuthToken } from '../middleware/auth.js';
import { prisma } from '../services/db.js';

export const customersRouter = Router();

customersRouter.use(verifyAuthToken);

customersRouter.get('/', async (_req, res) => {
  const accounts = await prisma.account.findMany();
  const customers = accounts.map((a: any) => {
    const stalled = Boolean(a.stalled);
    const atRisk = String(a.relationshipHealth || '').toLowerCase().includes('risk');
    const status = atRisk ? 'At Risk' : stalled ? 'Stalled' : 'Healthy';
    const revenuePotential = Number(a.projectedValue || a.annualPotential || 0) || 0;
    return {
      id: a.id,
      name: a.name,
      status,
      industry: a.industry || '',
      revenuePotential,
      latitude: a.latitude ? Number(a.latitude) : null,
      longitude: a.longitude ? Number(a.longitude) : null,
      lastContact: a.lastContact || null
    };
  });
  res.json(customers);
});





