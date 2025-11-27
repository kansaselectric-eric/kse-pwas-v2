import { DocumentProcessorServiceClient, protos } from '@google-cloud/documentai';
import { config } from '../config.js';

type ProcessResult = {
  text: string;
  pages: number;
  confidence: number | null;
  pageTexts: string[];
};

const client = new DocumentProcessorServiceClient();

export async function processWithDocumentAi(rawContent: Buffer, mimeType: string): Promise<ProcessResult> {
  if (!config.docAi.projectId || !config.docAi.location || !config.docAi.processorId) {
    throw new Error('Document AI is not configured');
  }
  const name = client.processorPath(config.docAi.projectId, config.docAi.location, config.docAi.processorId);
  const request = {
    name,
    rawDocument: {
      content: rawContent,
      mimeType
    }
  };
  const [result] = await client.processDocument(request);
  const document = result.document;
  const pages = document?.pages || [];
  const pageTexts = buildPageTexts(document);
  const confidences = pages
    .map((page) => page.layout?.confidence)
    .filter((value): value is number => typeof value === 'number');
  const avgConfidence = confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null;
  return {
    text: document?.text || '',
    pages: pages.length,
    confidence: avgConfidence,
    pageTexts
  };
}

type DocumentPayload =
  | protos.google.cloud.documentai.v1.IDocument
  | protos.google.cloud.documentai.v1.Document
  | null
  | undefined;

function buildPageTexts(document?: DocumentPayload): string[] {
  if (!document) return [];
  const docText = document.text || '';
  const pages = document.pages || [];
  return pages.map((page) => {
    const segments = page?.layout?.textAnchor?.textSegments;
    if (!segments?.length) return '';
    return segments
      .map((segment) => {
        const start = Number(segment?.startIndex ?? 0);
        const end = Number(segment?.endIndex ?? 0);
        return docText.slice(start, end);
      })
      .join('');
  });
}

