import { Router } from 'express';
import axios from 'axios';
import { config } from '../config.js';

export const graphRouter = Router();

graphRouter.post('/token', async (_req, res) => {
  try {
    const { tenantId, clientId, clientSecret } = config.graph;
    if (!tenantId || !clientId || !clientSecret) return res.status(400).json({ ok: false, error: 'Missing Graph config' });
    const form = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    });
    const tokenRes = await axios.post(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, form);
    res.json({ ok: true, token: tokenRes.data.access_token, expires_in: tokenRes.data.expires_in });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});



