import { Router } from 'express';
import { config } from '../config.js';
import { z } from 'zod';

export const estimateRouter = Router();

const requestSchema = z.object({
  text: z.string().min(20),
  dict: z
    .object({
      scope: z.array(z.string()).optional(),
      longLead: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
      clarifications: z.array(z.string()).optional()
    })
    .optional()
});

const TAKEOFF_SCHEMA = {
  name: 'EstimateAcceleratorTakeoff',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['scope', 'longLead', 'risks', 'clarifications', 'takeoff', 'metrics'],
    properties: {
      scope: { type: 'array', items: { type: 'string' } },
      longLead: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
      clarifications: { type: 'array', items: { type: 'string' } },
      takeoff: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'description', 'quantity', 'unit', 'category', 'complexity', 'keywords', 'priorityScore'],
          properties: {
            id: { type: 'string' },
            description: { type: 'string' },
            quantity: { type: 'number' },
            unit: { type: 'string' },
            category: { type: 'string' },
            complexity: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
            priorityScore: { type: 'number' },
            sourceFile: { type: 'string' },
            sourcePage: { type: 'number' },
            issues: { type: 'array', items: { type: 'string' } },
            qualityScore: { type: 'number' },
            qualityGrade: { type: 'string' }
          }
        }
      },
      metrics: {
        type: 'object',
        additionalProperties: false,
        required: ['scopeCoverage', 'riskLoad', 'takeoffConfidence'],
        properties: {
          scopeCoverage: { type: 'number' },
          riskLoad: { type: 'number' },
          takeoffConfidence: { type: 'number' }
        }
      }
    }
  },
  strict: true
} as const;

estimateRouter.post('/takeoff', async (req, res) => {
  try {
    if (!config.openAi.apiKey) {
      return res.status(500).json({ ok: false, error: 'OpenAI API key not configured' });
    }
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: 'text (and optional dict) required' });
    }
    const { text, dict } = parsed.data;
    const baseUrl = config.openAi.baseUrl.replace(/\/+$/, '');

    const instructions =
      `You are an expert electrical estimator.\n` +
      `From the provided RFP/spec text, extract:\n` +
      `1) scope items, 2) long-lead items, 3) risks, 4) clarifications, and 5) a structured take-off.\n\n` +
      `CRITICAL RULES:\n` +
      `- Do NOT hallucinate. Only output items supported by the text.\n` +
      `- Prefer schedule/quantity tables and explicit quantities.\n` +
      `- If a quantity is unclear, OMIT the line item instead of guessing.\n` +
      `- Normalize units to one of: ea, lf, sf, set, pair, lot, hr, day, panel, circuit, fixture, floor, zone.\n` +
      `- category should be one of: distribution, raceway, lighting, controls, power, safety, civil, scope, long-lead, general.\n` +
      `- complexity should be one of: low, medium, high.\n` +
      `- priorityScore: 0-100 (higher = more material/critical).\n\n` +
      `Use this dictionary as hints (not requirements):\n` +
      `${JSON.stringify(dict || {}, null, 2)}\n\n` +
      `Return STRICT JSON that matches the provided schema.`;

    const payload = {
      model: config.openAi.model,
      max_output_tokens: Math.max(2500, config.openAi.maxOutputTokens || 2500),
      input: [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: `${instructions}\n\n---\nSOURCE TEXT:\n${text}` }]
        }
      ],
      text: {
        format: {
          type: 'json_schema' as const,
          json_schema: TAKEOFF_SCHEMA
        }
      }
    };

    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openAi.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json) {
      const reason = json?.error?.message || `Takeoff extraction failed (status ${response.status})`;
      return res.status(500).json({ ok: false, error: reason });
    }

    const structured = extractStructuredPayload(json);
    return res.json({ ok: true, ...structured });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Takeoff extraction failed';
    return res.status(500).json({ ok: false, error: message });
  }
});

function extractStructuredPayload(payload: any): any {
  if (Array.isArray(payload?.output)) {
    for (const message of payload.output) {
      if (!Array.isArray(message?.content)) continue;
      for (const chunk of message.content) {
        if (chunk?.type === 'json' && chunk?.json) return chunk.json;
        if (chunk?.type === 'output_text' && typeof chunk?.text === 'string') {
          try {
            return JSON.parse(chunk.text);
          } catch {
            // continue searching
          }
        }
      }
    }
  }
  if (Array.isArray(payload?.output_text) && payload.output_text.length) {
    try {
      return JSON.parse(payload.output_text.join('\n'));
    } catch {
      // fall through
    }
  }
  throw new Error('OpenAI response did not include valid JSON output.');
}

