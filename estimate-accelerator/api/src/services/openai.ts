import { env } from '../env.js';

export type JsonSchema = {
  name: string;
  schema: unknown;
  strict?: boolean;
};

export async function openAiResponsesJson<T>(args: {
  model: string;
  instructions: string;
  inputText?: string;
  imageDataUrl?: string;
  jsonSchema: JsonSchema;
  maxOutputTokens?: number;
}): Promise<T> {
  if (!env.openAiApiKey) throw new Error('OpenAI API key not configured');

  const content: any[] = [{ type: 'input_text', text: args.instructions }];
  if (args.inputText) content.push({ type: 'input_text', text: args.inputText });
  if (args.imageDataUrl) content.push({ type: 'input_image', image_url: args.imageDataUrl });

  const payload: any = {
    model: args.model,
    max_output_tokens: args.maxOutputTokens ?? 2000,
    input: [{ role: 'user', content }],
    text: {
      format: {
        type: 'json_schema',
        json_schema: {
          name: args.jsonSchema.name,
          strict: args.jsonSchema.strict ?? true,
          schema: args.jsonSchema.schema
        }
      }
    }
  };

  const res = await fetch(`${env.openAiBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.openAiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json: any = await res.json().catch(() => null);
  if (!res.ok || !json) {
    const msg = json?.error?.message || `OpenAI Responses failed (status ${res.status})`;
    throw new Error(msg);
  }

  return extractJsonFromResponses<T>(json);
}

function extractJsonFromResponses<T>(payload: any): T {
  if (Array.isArray(payload?.output)) {
    for (const message of payload.output) {
      if (!Array.isArray(message?.content)) continue;
      for (const chunk of message.content) {
        if (chunk?.type === 'json' && chunk?.json) return chunk.json as T;
        if (chunk?.type === 'output_text' && typeof chunk?.text === 'string') {
          try {
            return JSON.parse(chunk.text) as T;
          } catch {
            // keep searching
          }
        }
      }
    }
  }
  if (Array.isArray(payload?.output_text) && payload.output_text.length) {
    try {
      return JSON.parse(payload.output_text.join('\n')) as T;
    } catch {
      // fall through
    }
  }
  throw new Error('OpenAI response did not include valid JSON output');
}
