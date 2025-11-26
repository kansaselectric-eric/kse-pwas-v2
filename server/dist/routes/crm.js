import { Router } from 'express';
import { z } from 'zod';
import { verifyAuthToken } from '../middleware/auth.js';
import { logger } from '../logger.js';
const syncPayloadSchema = z.object({
    account: z.any(),
    contacts: z.array(z.any()).optional(),
    activities: z.array(z.any()).optional(),
    opportunities: z.array(z.any()).optional(),
    lastMovement: z.any().optional(),
    score: z.number().optional(),
    nextSteps: z.string().optional()
});
export const crmRouter = Router();
crmRouter.use(verifyAuthToken);
crmRouter.post('/syncToSheets', (req, res) => {
    logger.info({ route: 'syncToSheets', user: req.authUser, body: req.body }, 'Sync to Sheets invoked');
    res.json({ ok: true, status: 'queued' });
});
crmRouter.post('/acumaticaSync', (req, res) => {
    const parsed = syncPayloadSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ ok: false, error: 'Invalid payload' });
    logger.info({ route: 'acumaticaSync', user: req.authUser, payload: parsed.data }, 'Acumatica sync stub');
    res.json({ ok: true, status: 'logged', message: 'Payload accepted for future Acumatica integration.' });
});
