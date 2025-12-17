import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { env } from '../env.js';
import { bufferToDataUrl } from './artifacts.js';
import { openAiResponsesJson, type JsonSchema } from './openai.js';

export type NormalizedBBox = { x: number; y: number; w: number; h: number };

export type Region = {
  label: string;
  bbox: NormalizedBBox;
  confidence: number;
};

export type VisionTakeoffItem = {
  description: string;
  qty: number;
  unit: string;
  category: string;
  notes?: string;
  confidence: number;
  evidence: {
    pageIndex: number;
    region?: { label: string; bbox: NormalizedBBox };
    tile?: { rows: number; cols: number; row: number; col: number };
    bbox?: NormalizedBBox;
  };
};

const REGION_SCHEMA: JsonSchema = {
  name: 'EstaccPageRegions',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['pageType', 'extract', 'regions', 'confidence'],
    properties: {
      pageType: { type: 'string' },
      extract: { type: 'boolean' },
      confidence: { type: 'number' },
      regions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'bbox', 'confidence'],
          properties: {
            label: { type: 'string' },
            confidence: { type: 'number' },
            bbox: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'w', 'h'],
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }
};

const TILE_SCHEMA: JsonSchema = {
  name: 'EstaccTileTakeoff',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['overallConfidence', 'items'],
    properties: {
      overallConfidence: { type: 'number' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'qty', 'unit', 'category', 'confidence'],
          properties: {
            description: { type: 'string' },
            qty: { type: 'number' },
            unit: { type: 'string' },
            category: { type: 'string' },
            notes: { type: 'string' },
            confidence: { type: 'number' },
            bbox: {
              type: 'object',
              additionalProperties: false,
              required: ['x', 'y', 'w', 'h'],
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }
};

export async function runVisionTakeoffFromPageArtifacts(args: {
  pages: Array<{ pageIndex: number; path: string; mimeType: string }>;
  maxPages: number;
}): Promise<{ items: VisionTakeoffItem[]; avgConfidence: number }>
{
  const pages = args.pages
    .filter((p) => Number.isFinite(p.pageIndex) && p.path)
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .slice(0, args.maxPages);

  const allItems: VisionTakeoffItem[] = [];
  const confidences: number[] = [];

  for (const page of pages) {
    const pageBytes = await readFile(page.path);
    const imageUrl = bufferToDataUrl(page.mimeType, pageBytes);

    const regionPrompt =
      'You are analyzing an electrical drawing sheet image.\n' +
      'Step 1: classify the page type (e.g., floor plan, single-line, panel schedule, fixture schedule, notes, legend).\n' +
      'Step 2: decide if this page likely contains TAKEOFF-RELEVANT quantities (schedules/tables/notes with explicit counts).\n' +
      'Step 3: if yes, return bounding boxes for the most relevant regions (tables/schedules/quantity callouts).\n\n' +
      'Bounding boxes must be normalized 0-1 relative to the full page image.';

    const regions = await openAiResponsesJson<{ pageType: string; extract: boolean; regions: Region[]; confidence: number }>({
      model: env.takeoffModel,
      instructions: regionPrompt,
      imageDataUrl: imageUrl,
      jsonSchema: REGION_SCHEMA,
      maxOutputTokens: 1200
    });

    if (!regions.extract || !regions.regions?.length) {
      // fallback: still attempt full page extraction if model isn't confident
      if ((regions.confidence ?? 0) < 0.55) {
        const extracted = await extractFromImageWithTiling({
          pageIndex: page.pageIndex,
          mimeType: page.mimeType,
          imageBytes: pageBytes,
          region: null
        });
        allItems.push(...extracted.items);
        confidences.push(extracted.confidence);
      }
      continue;
    }

    for (const region of regions.regions.slice(0, 6)) {
      if (!region?.bbox) continue;
      const cropped = await cropNormalized(pageBytes, region.bbox);
      const extracted = await extractFromImageWithTiling({
        pageIndex: page.pageIndex,
        mimeType: page.mimeType,
        imageBytes: cropped,
        region
      });
      allItems.push(...extracted.items);
      confidences.push(extracted.confidence);
    }
  }

  const avgConfidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0.5;

  return { items: dedupeItems(allItems), avgConfidence };
}

async function extractFromImageWithTiling(args: {
  pageIndex: number;
  mimeType: string;
  imageBytes: Buffer;
  region: Region | null;
}): Promise<{ items: VisionTakeoffItem[]; confidence: number }> {
  // Pass A: 2x2 tiles
  let { items, confidence } = await extractTiled(args, 2, 2);
  if (confidence < 0.65 || items.length < 4) {
    // Pass B: 3x3 tiles for higher recall
    const passB = await extractTiled(args, 3, 3);
    if (passB.confidence > confidence || passB.items.length > items.length) {
      items = passB.items;
      confidence = Math.max(confidence, passB.confidence);
    }
  }
  return { items, confidence };
}

async function extractTiled(args: {
  pageIndex: number;
  mimeType: string;
  imageBytes: Buffer;
  region: Region | null;
}, rows: number, cols: number) {
  const tiles = await tileImage(args.imageBytes, rows, cols);
  const out: VisionTakeoffItem[] = [];
  const scores: number[] = [];

  for (const tile of tiles) {
    const imageUrl = bufferToDataUrl('image/jpeg', tile.bytes);

    const prompt =
      'You are an expert electrical estimator extracting TAKEOFF line items from an image crop.\n' +
      'Extract only items with explicit quantities and units from schedules/tables/notes visible in this crop.\n' +
      'DO NOT guess. If unclear, omit.\n' +
      'Return concise descriptions, numeric qty, normalized unit, category, and confidence 0-1.\n' +
      'Units must be one of: ea, lf, sf, set, pair, lot, hr, day, panel, circuit, fixture, floor, zone.\n' +
      'category must be one of: distribution, raceway, lighting, controls, power, safety, civil, general.\n' +
      'Also include a bbox per item normalized to THIS TILE image.';

    const extracted = await openAiResponsesJson<{ overallConfidence: number; items: any[] }>({
      model: env.takeoffModel,
      instructions: prompt,
      imageDataUrl: imageUrl,
      jsonSchema: TILE_SCHEMA,
      maxOutputTokens: 2200
    });

    scores.push(Number(extracted.overallConfidence || 0.5));

    for (const it of extracted.items || []) {
      if (!it?.description || !Number.isFinite(it?.qty)) continue;
      out.push({
        description: String(it.description).trim(),
        qty: Number(it.qty),
        unit: normalizeUnit(String(it.unit || 'ea')),
        category: String(it.category || 'general'),
        notes: it.notes ? String(it.notes) : undefined,
        confidence: Number(it.confidence || 0.5),
        evidence: {
          pageIndex: args.pageIndex,
          region: args.region ? { label: args.region.label, bbox: args.region.bbox } : undefined,
          tile: { rows, cols, row: tile.row, col: tile.col },
          bbox: it.bbox && typeof it.bbox === 'object' ? it.bbox : undefined
        }
      });
    }
  }

  const confidence = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.5;
  return { items: dedupeItems(out), confidence };
}

async function cropNormalized(bytes: Buffer, bbox: NormalizedBBox): Promise<Buffer> {
  const img = sharp(bytes);
  const meta = await img.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h) return bytes;

  const left = clampInt(Math.floor(bbox.x * w), 0, w - 1);
  const top = clampInt(Math.floor(bbox.y * h), 0, h - 1);
  const width = clampInt(Math.floor(bbox.w * w), 1, w - left);
  const height = clampInt(Math.floor(bbox.h * h), 1, h - top);

  return await img.extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
}

async function tileImage(bytes: Buffer, rows: number, cols: number) {
  const img = sharp(bytes);
  const meta = await img.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;
  if (!w || !h) {
    return [{ row: 0, col: 0, bytes: await img.jpeg({ quality: 92 }).toBuffer() }];
  }

  const tileW = Math.floor(w / cols);
  const tileH = Math.floor(h / rows);
  const tiles: Array<{ row: number; col: number; bytes: Buffer }> = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const left = c * tileW;
      const top = r * tileH;
      const width = c === cols - 1 ? w - left : tileW;
      const height = r === rows - 1 ? h - top : tileH;
      const buf = await sharp(bytes)
        .extract({ left, top, width, height })
        .jpeg({ quality: 92 })
        .toBuffer();
      tiles.push({ row: r, col: c, bytes: buf });
    }
  }
  return tiles;
}

function normalizeUnit(unit: string) {
  const u = unit.toLowerCase().trim();
  const map: Record<string, string> = {
    each: 'ea',
    ea: 'ea',
    ft: 'lf',
    feet: 'lf',
    lf: 'lf',
    sf: 'sf',
    set: 'set',
    sets: 'set',
    hr: 'hr',
    hrs: 'hr',
    hour: 'hr',
    hours: 'hr',
    day: 'day',
    days: 'day',
    circuit: 'circuit',
    circuits: 'circuit',
    fixture: 'fixture',
    fixtures: 'fixture',
    panel: 'panel',
    panels: 'panel'
  };
  return map[u] || 'ea';
}

function dedupeItems(items: VisionTakeoffItem[]) {
  const seen = new Set<string>();
  const out: VisionTakeoffItem[] = [];
  for (const it of items) {
    const key = `${it.description.toLowerCase()}|${it.qty}|${it.unit}|${it.evidence.pageIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
