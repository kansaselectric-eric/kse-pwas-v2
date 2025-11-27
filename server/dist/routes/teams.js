import { Router } from 'express';
import axios from 'axios';
import { config } from '../config.js';
import { z } from 'zod';
export const teamsRouter = Router();
const notifySchema = z.object({
    title: z.string().default('KSE Notification'),
    text: z.string().default(''),
    webhook: z.string().url().optional()
});
teamsRouter.post('/notify', async (req, res) => {
    try {
        const parse = notifySchema.safeParse(req.body || {});
        if (!parse.success)
            return res.status(400).json({ ok: false, error: 'Invalid payload' });
        const { title, text, webhook } = parse.data;
        const url = webhook || config.teamsWebhookUrl;
        if (!url)
            return res.status(400).json({ ok: false, error: 'Missing webhook' });
        const payload = {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            summary: title,
            themeColor: '0078D4',
            title,
            text
        };
        await axios.post(url, payload);
        res.json({ ok: true });
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        res.status(500).json({ ok: false, error: message });
    }
});
