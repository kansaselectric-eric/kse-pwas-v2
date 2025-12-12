import { Router } from 'express';
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
aiRouter.post('/transcribe', upload.single('file'), async (req, res) => {
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
    }
    catch (error) {
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
        const systemPrompt = `You are a BD assistant. Extract structured data from a BD voice note or meeting transcript.

CRITICAL: Do NOT guess or hallucinate. Only fill a field if the value is explicitly present in the transcript.
If the transcript does not provide enough information, leave the field empty and add it to missingFields.

Return STRICT JSON only (no markdown). Use this schema and ALWAYS include all top-level objects:
{
  "confidence": 0.0,
  "warnings": [],
  "missingFields": [],
  "activity": {
    "subject": "",
    "notes": "",
    "outcome": "",
    "nextFollowUp": "",
    "tags": [],
    "sentimentScore": 3,
    "movementTriggered": false,
    "movementStage": "",
    "contactsMentioned": [],
    "accountInsights": []
  },
  "account": {
    "name": "",
    "industry": "",
    "city": "",
    "state": "",
    "entrenchment": "",
    "stage": "",
    "ownerName": "",
    "relationshipHealth": "",
    "nextStep": "",
    "notes": ""
  },
  "opportunity": {
    "description": "",
    "value": 0,
    "stage": "",
    "status": ""
  },
  "contact": {
    "name": "",
    "role": "",
    "email": "",
    "phone": ""
  },
  "lookup": {
    "accountName": ""
  }
}

Rules:
- Prefer exact values explicitly stated in transcript.
- If a field is unknown, leave it as empty string (or 0 / [] / false) AND include a string path in missingFields (e.g. "account.city").
- confidence: float 0.0-1.0 indicating how confident you are the structured fields are correct. If you used missingFields, confidence should usually be <= 0.85.
- nextFollowUp should be ISO date (YYYY-MM-DD) ONLY if a date is explicitly stated; otherwise empty string and include "activity.nextFollowUp" in missingFields.
- Location guardrail: Only populate account.city and account.state if BOTH are explicitly stated. If only one is mentioned, leave BOTH empty, add missingFields for both, and add a warning like "Location incomplete; city/state not explicitly provided together."
- entrenchment should be one of: "Low" | "Medium" | "High" when possible; otherwise empty and mark missing.
- account.relationshipHealth should be one of: "Balanced" | "Strong" | "Neutral" | "Weak" | "At Risk" when possible; otherwise empty.
- account.state should be a 2-letter uppercase state abbreviation when possible (e.g. "KS"); if unsure, leave blank.
- account.stage MUST be exactly one of the following (or empty string if unknown):
  "Discovery", "Gatekeeper Contact", "First Conversation", "Site Tour", "Pain Identified",
  "Technical Fit", "Pilot / First Project", "Expansion", "Embedded Partner"
- opportunity.status should be one of: "open" | "won" | "lost" | "declined" (or empty string).
- opportunity.stage should be one of: "lead" | "qualified" | "proposal" | "pilot" | "expansion" | "recurring" (or empty string).
- Keep 'notes' short but useful (1-4 sentences). If the transcript is short, keep notes short too.`;
        const payload = {
            model: config.openAi.model || 'gpt-4o-mini',
            temperature: 0.2,
            response_format: { type: 'json_object' },
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
        const normalized = normalizeExtraction(parsedJson);
        // Backwards compatible: keep legacy top-level activity keys used by older clients.
        const legacy = normalized.activity || {};
        return res.json({
            ok: true,
            aiConfidence: typeof normalized.confidence === 'number' ? normalized.confidence : null,
            // legacy activity keys
            subject: legacy.subject || '',
            notes: legacy.notes || '',
            outcome: legacy.outcome || '',
            nextFollowUp: legacy.nextFollowUp || '',
            tags: Array.isArray(legacy.tags) ? legacy.tags : [],
            sentimentScore: typeof legacy.sentimentScore === 'number' ? legacy.sentimentScore : 3,
            movementTriggered: Boolean(legacy.movementTriggered),
            movementStage: legacy.movementStage || '',
            accountInsights: Array.isArray(legacy.accountInsights) ? legacy.accountInsights : [],
            contactsMentioned: Array.isArray(legacy.contactsMentioned) ? legacy.contactsMentioned : [],
            // structured payload
            structured: normalized
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Extraction failed';
        return res.status(500).json({ ok: false, error: message });
    }
});
function normalizeExtraction(payload) {
    // If model returns legacy flat keys, wrap into new schema.
    if (payload && typeof payload === 'object' && !payload.activity && (payload.subject || payload.outcome || payload.tags)) {
        return {
            confidence: typeof payload.confidence === 'number' ? payload.confidence : 0.6,
            warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
            missingFields: Array.isArray(payload.missingFields) ? payload.missingFields : [],
            activity: {
                subject: payload.subject || '',
                notes: payload.notes || '',
                outcome: payload.outcome || '',
                nextFollowUp: payload.nextFollowUp || '',
                tags: Array.isArray(payload.tags) ? payload.tags : [],
                sentimentScore: typeof payload.sentimentScore === 'number' ? payload.sentimentScore : 3,
                movementTriggered: Boolean(payload.movementTriggered),
                movementStage: payload.movementStage || '',
                accountInsights: Array.isArray(payload.accountInsights) ? payload.accountInsights : [],
                contactsMentioned: Array.isArray(payload.contactsMentioned) ? payload.contactsMentioned : []
            },
            account: payload.account || {
                name: '',
                industry: '',
                city: '',
                state: '',
                entrenchment: '',
                stage: '',
                ownerName: '',
                relationshipHealth: '',
                nextStep: '',
                notes: ''
            },
            opportunity: payload.opportunity || { description: '', value: 0, stage: '', status: '' },
            contact: payload.contact || { name: '', role: '', email: '', phone: '' },
            lookup: payload.lookup || { accountName: '' }
        };
    }
    // Ensure shape even if model omitted sub-objects.
    return {
        confidence: typeof payload?.confidence === 'number' ? payload.confidence : 0.6,
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
        missingFields: Array.isArray(payload?.missingFields) ? payload.missingFields : [],
        activity: {
            subject: payload?.activity?.subject || '',
            notes: payload?.activity?.notes || '',
            outcome: payload?.activity?.outcome || '',
            nextFollowUp: payload?.activity?.nextFollowUp || '',
            tags: Array.isArray(payload?.activity?.tags) ? payload.activity.tags : [],
            sentimentScore: typeof payload?.activity?.sentimentScore === 'number' ? payload.activity.sentimentScore : 3,
            movementTriggered: Boolean(payload?.activity?.movementTriggered),
            movementStage: payload?.activity?.movementStage || '',
            contactsMentioned: Array.isArray(payload?.activity?.contactsMentioned) ? payload.activity.contactsMentioned : [],
            accountInsights: Array.isArray(payload?.activity?.accountInsights) ? payload.activity.accountInsights : []
        },
        account: {
            name: payload?.account?.name || '',
            industry: payload?.account?.industry || '',
            city: payload?.account?.city || '',
            state: payload?.account?.state || '',
            entrenchment: payload?.account?.entrenchment || '',
            stage: payload?.account?.stage || '',
            ownerName: payload?.account?.ownerName || '',
            relationshipHealth: payload?.account?.relationshipHealth || '',
            nextStep: payload?.account?.nextStep || '',
            notes: payload?.account?.notes || ''
        },
        opportunity: {
            description: payload?.opportunity?.description || '',
            value: typeof payload?.opportunity?.value === 'number' ? payload.opportunity.value : Number(payload?.opportunity?.value || 0),
            stage: payload?.opportunity?.stage || '',
            status: payload?.opportunity?.status || ''
        },
        contact: {
            name: payload?.contact?.name || '',
            role: payload?.contact?.role || '',
            email: payload?.contact?.email || '',
            phone: payload?.contact?.phone || ''
        },
        lookup: {
            accountName: payload?.lookup?.accountName || ''
        }
    };
}
function safeJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
