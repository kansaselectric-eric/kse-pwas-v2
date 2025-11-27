import { Router } from 'express';
import { processWithDocumentAi } from '../services/docAi.js';

export const ocrRouter = Router();

ocrRouter.post('/documentai', async (req, res) => {
  try {
    const { fileBase64, mimeType } = req.body || {};
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ ok: false, error: 'fileBase64 is required' });
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: 'Invalid base64 payload' });
    }
    const result = await processWithDocumentAi(buffer, mimeType || 'application/pdf');
    return res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Document AI request failed';
    return res.status(500).json({ ok: false, error: message });
  }
});

