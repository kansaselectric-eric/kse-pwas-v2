import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
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

function buildPageTexts(document: any): string[] {
  const docText: string = document?.text || '';
  const pages = document?.pages || [];
  return pages.map((page: any) => {
    const layout = page.layout;
    if (!layout?.textAnchor?.textSegments?.length) return '';
    return layout.textAnchor.textSegments
      .map((segment: any) => {
        const start = Number(segment.startIndex || 0);
        const end = Number(segment.endIndex || 0);
        return docText.slice(start, end);
      })
      .join('');
  });
}

