import { Router } from 'express';
import { z } from 'zod';
import { verifyAuthToken } from '../middleware/auth.js';

const transcriptSchema = z.object({
  transcript: z.string().min(10)
});

export const aiRouter = Router();

aiRouter.use(verifyAuthToken);

aiRouter.post('/transcribe', async (_req, res) => {
  // Placeholder response – production should call Whisper/OpenAI.
  res.json({
    ok: true,
    text: 'Transcription placeholder — connect to Whisper for production use.',
    model: 'placeholder-local'
  });
});

aiRouter.post('/extractBD', async (req, res) => {
  const parsed = transcriptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Transcript required' });
  }
  const { transcript } = parsed.data;
  const lower = transcript.toLowerCase();
  const sentiment = lower.includes('concern') || lower.includes('delay') ? 2 : lower.includes('excited') ? 5 : 3;
  const tags = [];
  if (lower.includes('pilot')) tags.push('pilot');
  if (lower.includes('pain')) tags.push('pain-point');
  if (lower.includes('authentic')) tags.push('authentic-touch');
  const movementTriggered = lower.includes('ready to move') || lower.includes('next phase');
  const movementStage = movementTriggered ? 'Pilot / First Project' : null;
  res.json({
    ok: true,
    subject: transcript.slice(0, 80),
    notes: transcript,
    sentiment,
    tags,
    outcome: movementTriggered ? 'Stage advanced discussion' : 'Touch logged',
    nextFollowUp: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    movementTriggered,
    movementStage,
    contactsMentioned: [],
    accountInsights: movementTriggered ? ['Account primed for pilot discussions'] : [],
    aiConfidence: movementTriggered ? 0.91 : 0.77
  });
});

