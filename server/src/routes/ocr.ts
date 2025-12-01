import type { Request, Response } from 'express';
import { Router } from 'express';
import { processWithOpenAiVision } from '../services/openAiVision.js';

export const ocrRouter = Router();

const visionHandler = async (req: Request, res: Response) => {
  try {
    const { fileBase64, mimeType } = req.body || {};
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ ok: false, error: 'fileBase64 is required' });
    }
    const buffer = Buffer.from(fileBase64, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ ok: false, error: 'Invalid base64 payload' });
    }
    const result = await processWithOpenAiVision(buffer, mimeType || 'application/pdf');
    return res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenAI vision request failed';
    return res.status(500).json({ ok: false, error: message });
  }
};

ocrRouter.post('/vision', visionHandler);
ocrRouter.post('/documentai', visionHandler);

