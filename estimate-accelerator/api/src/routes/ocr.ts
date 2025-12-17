import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { pool } from '../db.js';
import { env } from '../env.js';
import { base64ToBuffer, bufferToDataUrl, persistArtifact } from '../services/artifacts.js';
import { openAiResponsesJson } from '../services/openai.js';

export const ocrRouter = Router();

const requestSchema = z.object({
  fileBase64: z.string().min(10),
  mimeType: z.string().min(3),
  sessionId: z.string().uuid().optional(),
  pageIndex: z.number().int().min(1).optional(),
  fileName: z.string().optional()
});

const OCR_SCHEMA = {
  name: 'EstaccOcrResult',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'confidence'],
    properties: {
      text: { type: 'string' },
      confidence: { type: 'number' }
    }
  }
} as const;

ocrRouter.post('/vision', async (req, res) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'fileBase64 + mimeType required' });
    }

    const { fileBase64, mimeType, sessionId, pageIndex } = parsed.data;
    const bytes = base64ToBuffer(fileBase64);
    if (!bytes.length) {
      return res.status(400).json({ ok: false, error: 'Invalid base64 payload' });
    }

    const artifactsRoot = path.resolve(process.cwd(), 'data', 'artifacts');

    let artifactPath: string | undefined;
    let sha256: string | undefined;

    if (sessionId) {
      const ext = mimeType.includes('png') ? 'png' : 'jpg';
      const stored = await persistArtifact({
        rootDir: artifactsRoot,
        sessionId,
        kind: 'page_render',
        pageIndex: pageIndex ?? null,
        ext,
        bytes
      });
      artifactPath = stored.path;
      sha256 = stored.sha256;

      await pool.query(
        `INSERT INTO extraction_artifacts (session_id, kind, page_index, sha256, path, meta)
         VALUES ($1, 'page_render', $2, $3, $4, $5)
         ON CONFLICT DO NOTHING;`,
        [sessionId, pageIndex ?? null, sha256, artifactPath, JSON.stringify({ mimeType })]
      );
    }

    const imageUrl = bufferToDataUrl(mimeType, bytes);

    const instructions =
      'You are an OCR engine for construction drawings and schedules. ' +
      'Extract all legible text. Preserve line breaks where possible. ' +
      'Return confidence 0-1 (lower if the page is blurry or mostly unreadable).';

    const result = await openAiResponsesJson<{ text: string; confidence: number }>({
      model: env.ocrModel,
      instructions,
      imageDataUrl: imageUrl,
      jsonSchema: OCR_SCHEMA,
      maxOutputTokens: 3000
    });

    if (sessionId) {
      await pool.query(
        `INSERT INTO extraction_artifacts (session_id, kind, page_index, sha256, path, meta)
         VALUES ($1, 'ocr_json', $2, $3, $4, $5)
         ON CONFLICT DO NOTHING;`,
        [
          sessionId,
          pageIndex ?? null,
          sha256 ?? null,
          artifactPath ?? null,
          JSON.stringify({ ocrConfidence: result.confidence, length: result.text?.length || 0 })
        ]
      );
    }

    return res.json({ ok: true, text: result.text || '', confidence: result.confidence ?? 0.5 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'OCR failed';
    return res.status(500).json({ ok: false, error: msg });
  }
});
