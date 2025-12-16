import { config } from '../config.js';

type StructuredPage = {
  index: number;
  text: string;
};

type StructuredResult = {
  text: string;
  pages?: StructuredPage[];
};

type VisionResult = {
  text: string;
  pages: number | null;
  confidence: number | null;
  pageTexts: string[];
};

const JSON_SCHEMA = {
  name: 'DocumentOcrResult',
  schema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Complete textual content extracted from the document.'
      },
      pages: {
        type: 'array',
        description: 'Per-page snippets with 1-based page indexes.',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer', description: '1-based page index.' },
            text: { type: 'string', description: 'Text extracted from that page.' }
          },
          required: ['index', 'text'],
          additionalProperties: false
        }
      }
    },
    required: ['text'],
    additionalProperties: false
  },
  strict: true
} as const;

export async function processWithOpenAiVision(buffer: Buffer, mimeType: string): Promise<VisionResult> {
  if (!config.openAi.apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  const baseUrl = config.openAi.baseUrl.replace(/\/+$/, '');
  const upload = await uploadFile(buffer, mimeType, baseUrl);
  try {
    const payload = createResponsePayload(upload.id);
    const response = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openAi.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json) {
      const reason = json?.error?.message || `OpenAI vision request failed (status ${response.status})`;
      throw new Error(reason);
    }
    const structured = extractStructuredPayload(json);
    const pageTexts = Array.isArray(structured.pages)
      ? structured.pages
          .filter((entry) => typeof entry?.text === 'string' && entry.text.trim().length)
          .sort((a, b) => a.index - b.index)
          .map((entry) => entry.text.trim())
      : [];
    return {
      text: typeof structured.text === 'string' ? structured.text : '',
      pages: pageTexts.length || null,
      confidence: null,
      pageTexts
    };
  } finally {
    if (config.openAi.deleteUploads) {
      await deleteFile(upload.id, baseUrl).catch(() => {});
    }
  }
}

async function uploadFile(buffer: Buffer, mimeType: string, baseUrl: string) {
  const form = new FormData();
  form.append('purpose', 'vision');
  const extension = mimeTypeToExtension(mimeType);
  const blob = new Blob([bufferToArrayBuffer(buffer)], { type: mimeType || 'application/pdf' });
  form.append('file', blob, `estimate-${Date.now()}.${extension}`);

  const res = await fetch(`${baseUrl}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openAi.apiKey}`
    },
    body: form
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.id) {
    const reason = json?.error?.message || `OpenAI upload failed (status ${res.status})`;
    throw new Error(reason);
  }
  return { id: json.id as string };
}

async function deleteFile(fileId: string, baseUrl: string) {
  await fetch(`${baseUrl}/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${config.openAi.apiKey}` }
  });
}

function createResponsePayload(fileId: string) {
  const instructions =
    'Extract all legible text from the provided document. Return clean text without commentary. ' +
    'If possible, also provide per-page text snippets (omit empty pages).';
  return {
    model: config.openAi.model,
    max_output_tokens: config.openAi.maxOutputTokens,
    input: [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: instructions },
          { type: 'input_file' as const, file_id: fileId }
        ]
      }
    ],
    // OpenAI Responses API: structured output format lives under `text.format`
    // (older `response_format` is no longer supported).
    text: {
      format: {
        type: 'json_schema' as const,
        json_schema: JSON_SCHEMA
      }
    }
  };
}

function extractStructuredPayload(payload: any): StructuredResult {
  if (Array.isArray(payload?.output)) {
    for (const message of payload.output) {
      if (!Array.isArray(message?.content)) continue;
      for (const chunk of message.content) {
        if (chunk?.type === 'json' && chunk?.json) {
          return chunk.json as StructuredResult;
        }
        if (chunk?.type === 'output_text' && typeof chunk?.text === 'string') {
          try {
            return JSON.parse(chunk.text) as StructuredResult;
          } catch {
            // continue searching other chunks
          }
        }
      }
    }
  }
  if (Array.isArray(payload?.output_text) && payload.output_text.length) {
    try {
      return JSON.parse(payload.output_text.join('\n')) as StructuredResult;
    } catch {
      // fall through to default
    }
  }
  throw new Error('OpenAI response did not include valid JSON output.');
}

function mimeTypeToExtension(mimeType?: string) {
  if (!mimeType) return 'bin';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('tiff')) return 'tiff';
  return mimeType.split('/').pop() || 'bin';
}

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}


