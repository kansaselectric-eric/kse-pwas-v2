import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { verifyAuthToken } from '../middleware/auth.js';

const transcriptSchema = z.object({
  transcript: z.string().min(10)
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max audio
});

export const aiRouter = Router();

aiRouter.use(verifyAuthToken);

aiRouter.post('/transcribe', upload.single('file') as any, async (req: Request, res: Response) => {
  try {
    if (!config.openAi.apiKey) {
      return res.status(500).json({ ok: false, error: 'OpenAI API key not configured' });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ ok: false, error: 'Audio file is required (field: file)' });
    }
    const baseUrl = config.openAi.baseUrl.replace(/\/+$/, '');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'audio/webm' }), file.originalname || 'audio.webm');
    form.append('model', 'whisper-1');
    form.append('response_format', 'json');

    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.openAi.apiKey}` },
      body: form
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const message = data?.error?.message || `Transcription failed (status ${response.status})`;
      return res.status(500).json({ ok: false, error: message });
    }
    return res.json({ ok: true, text: data.text || data.transcript || '' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Transcription failed';
    return res.status(500).json({ ok: false, error: message });
  }
});

aiRouter.post('/extractBD', async (req, res) => {
  try {
    if (!config.openAi.apiKey) {
      return res.status(500).json({ ok: false, error: 'OpenAI API key not configured' });
    }
    const parsed = transcriptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'Transcript required' });
    }
    const { transcript } = parsed.data;
    const baseUrl = config.openAi.baseUrl.replace(/\/+$/, '');

    const systemPrompt = `You are a BD assistant. Extract concise structured data from a meeting transcript. 
Return JSON with keys:
- subject (short summary)
- outcome
- nextFollowUp (ISO date if mentioned, else empty string)
- tags (array of short tags)
- sentimentScore (1-5 integer)
- movementTriggered (boolean)
- movementStage (string, optional)
- accountInsights (array of short insights)
- contactsMentioned (array of names, optional)
Keep it terse and factual.`;

    const payload = {
      model: config.openAi.model || 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' as const },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: transcript }
      ]
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openAi.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      const message = data?.error?.message || `Extraction failed (status ${response.status})`;
      return res.status(500).json({ ok: false, error: message });
    }

    const content = data.choices?.[0]?.message?.content;
    const parsedJson = typeof content === 'string' ? safeJson(content) : content;
    if (!parsedJson) {
      return res.status(500).json({ ok: false, error: 'Extraction returned invalid JSON' });
    }

    return res.json({
      ok: true,
      ...parsedJson
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed';
    return res.status(500).json({ ok: false, error: message });
  }
});

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

