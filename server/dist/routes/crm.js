import { Router } from 'express';
import { verifyAuthToken } from '../middleware/auth.js';
import { logger } from '../logger.js';
import { getCrmState, recordActivity, recordMovement, upsertAccount, upsertContact, upsertOpportunity } from '../services/crmStore.js';
export const crmRouter = Router();
crmRouter.use(verifyAuthToken);
crmRouter.get('/', async (req, res) => {
    const action = String(req.query.action || '').trim();
    if (!action) {
        return res.status(400).json({ ok: false, error: 'Missing action parameter' });
    }
    try {
        const state = await getCrmState();
        switch (action) {
            case 'enterpriseAccounts':
                return res.json({ ok: true, accounts: state.accounts });
            case 'contacts':
                return res.json({ ok: true, contacts: state.contacts });
            case 'activityLog':
                return res.json({ ok: true, activities: state.activities });
            case 'movementLog':
                return res.json({ ok: true, movements: state.movements });
            case 'opportunities':
                return res.json({ ok: true, opportunities: state.opportunities });
            default:
                return res.status(400).json({ ok: false, error: `Unknown action ${action}` });
        }
    }
    catch (error) {
        logger.error({ action, error }, 'CRM GET failed');
        return res.status(500).json({ ok: false, error: 'CRM fetch failed' });
    }
});
crmRouter.post('/', async (req, res) => {
    const { action, ...payload } = req.body || {};
    if (!action) {
        return res.status(400).json({ ok: false, error: 'Missing action in body' });
    }
    try {
        switch (action) {
            case 'accountCreate':
            case 'accountUpdate':
                await upsertAccount(payload);
                break;
            case 'interaction':
                await recordActivity(payload);
                break;
            case 'movement':
                await recordMovement(payload);
                break;
            case 'opportunity':
                await upsertOpportunity(payload);
                break;
            case 'contactUpsert':
                await upsertContact(payload);
                break;
            default:
                return res.status(400).json({ ok: false, error: `Unknown action ${action}` });
        }
        return res.json({ ok: true, status: 'stored' });
    }
    catch (error) {
        logger.error({ action, error }, 'CRM POST failed');
        return res.status(500).json({ ok: false, error: 'CRM write failed' });
    }
});
