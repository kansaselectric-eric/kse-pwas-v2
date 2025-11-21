import { Router } from 'express';
import axios from 'axios';
import { config } from '../config.js';

export const acumaticaRouter = Router();

acumaticaRouter.get('/projects', async (_req, res) => {
  try {
    const { baseUrl, token, tenant } = config.acumatica;
    if (!baseUrl || !token) return res.status(400).json({ ok: false, error: 'Missing Acumatica config' });
    const headers: any = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    if (tenant) headers['Tenant'] = tenant;
    const url = `${baseUrl.replace(/\/+$/, '')}/entity/Default/20.200.001/Project?$select=ProjectID,Description,Status&$top=200`;
    const r = await axios.get(url, { headers });
    res.json({ ok: true, items: r.data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});




