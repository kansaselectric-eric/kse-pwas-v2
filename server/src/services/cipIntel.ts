import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import { prisma } from './db.js';
import { logger } from '../logger.js';

export type CipSourceSeed = {
  name: string;
  type: string;
  url: string;
  tags?: string[];
  city?: string;
  state?: string;
};

export type CipSearchParams = {
  q?: string;
  state?: string;
  city?: string;
  source?: string;
  minBudget?: number;
  maxBudget?: number;
  limit?: number;
  offset?: number;
  nearLat?: number;
  nearLng?: number;
  radiusMi?: number;
};

export const NEWTON_KS = { lat: 38.0467, lng: -97.3450 };

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const geocodeCache = new Map<string, { lat: number; lng: number }>();

const NEWTON_RADIUS_CITY_HINTS = [
  'Newton',
  'Wichita',
  'Hutchinson',
  'McPherson',
  'Derby',
  'Andover',
  'Maize',
  'Park City',
  'El Dorado',
  'Augusta',
  'Winfield',
  'Arkansas City',
  'Salina',
  'Great Bend',
  'Emporia',
  'Harper',
  'Halstead'
];

const rssParser = new Parser({
  headers: { 'User-Agent': 'KSE-CIP-Intel/1.0 (+https://kselectric.com)' },
  timeout: 12000
});

export async function searchCip(params: CipSearchParams) {
  const q = (params.q || '').trim();
  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 60;
  const offset = params.offset && params.offset >= 0 ? params.offset : 0;
  const where: any = {};
  if (params.state) where.state = params.state;
  if (params.city) where.city = params.city;
  if (params.source) where.source = params.source;
  if (params.minBudget != null || params.maxBudget != null) {
    where.budget = {};
    if (params.minBudget != null) where.budget.gte = params.minBudget;
    if (params.maxBudget != null) where.budget.lte = params.maxBudget;
  }
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { summary: { contains: q, mode: 'insensitive' } },
      { agency: { contains: q, mode: 'insensitive' } }
    ];
  }

  const [itemsRaw, total] = await Promise.all([
    prisma.capitalPlanItem.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { scrapedAt: 'desc' }],
      take: Math.min(limit * 3, 300),
      skip: offset
    }),
    prisma.capitalPlanItem.count({ where })
  ]);

  const items = await filterByRadius(itemsRaw, params.nearLat, params.nearLng, params.radiusMi);
  return { total, items: items.slice(0, limit), limit, offset };
}

export async function ingestCipSeeds(
  {
    maxPerSource = 25,
    nearLat,
    nearLng,
    radiusMi
  }: { maxPerSource?: number; nearLat?: number; nearLng?: number; radiusMi?: number } = {}
) {
  const seeds = loadSeeds();
  const all = [];
  for (const seed of seeds) {
    try {
      const harvested = await harvestFromSeed(seed, maxPerSource);
      all.push(...harvested);
    } catch (err) {
      logger.warn({ seed: seed.name, err }, 'CIP seed harvest failed');
    }
  }
  const filtered = await ensureCoordsAndFilter(all, nearLat, nearLng, radiusMi);
  const upserted = await upsertCipItems(filtered);
  return { seeds: seeds.length, harvested: all.length, upserted };
}

export async function ingestKansasEarlySignals(nearLat?: number, nearLng?: number, radiusMi?: number) {
  const items = [...(await harvestKansasSignals()), ...(await harvestPermitAndEngineeringSignals())];
  const filtered = await ensureCoordsAndFilter(items, nearLat, nearLng, radiusMi);
  const upserted = await upsertCipItems(filtered);
  return { harvested: items.length, upserted };
}

function loadSeeds(): CipSourceSeed[] {
  const file = path.resolve(process.cwd(), 'src', 'data', 'cip-seeds.json');
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn({ err }, 'Unable to load cip-seeds.json');
    return [];
  }
}

async function harvestFromSeed(seed: CipSourceSeed, maxPerSource: number) {
  const url = seed.url;
  if (!url) return [];
  if (url.toLowerCase().endsWith('.pdf')) {
    return [
      buildItem({
        source: seed.name,
        sourceType: seed.type,
        title: `${seed.name} capital improvement plan`,
        url,
        docUrl: url,
        city: seed.city,
        state: seed.state || 'KS',
        tags: seed.tags || [],
        raw: { seed }
      })
    ];
  }
  const { data } = await axios.get(url, {
    timeout: 12_000,
    headers: { 'User-Agent': 'KSE-CIP-Intel/1.0 (+https://kselectric.com)' }
  });
  const $ = cheerio.load(data);
  const links: Array<{ href: string; text: string }> = [];
  $('a').each((_idx, el) => {
    const href = ($(el).attr('href') || '').trim();
    const text = ($(el).text() || '').trim();
    if (!href) return;
    links.push({ href: absolutize(url, href), text });
  });
  const filtered = links
    .filter((l) => /\.(pdf|doc|docx)$/i.test(l.href) || /capital|cip|improvement/i.test(l.text))
    .filter((l) => /capital|cip|improvement|program|plan/i.test(`${l.text} ${l.href}`.toLowerCase()))
    .slice(0, maxPerSource);

  return filtered.map((l) =>
    buildItem({
      source: seed.name,
      sourceType: seed.type,
      title: l.text || `${seed.name} capital plan`,
      url: l.href,
      docUrl: /\.(pdf|doc|docx)$/i.test(l.href) ? l.href : undefined,
      city: seed.city,
      state: seed.state || 'KS',
      tags: seed.tags || [],
      raw: { seed, linkText: l.text }
    })
  );
}

async function harvestKansasSignals() {
  // Early “get in front of it” signals: capital plans, pre-RFP, engineering/design, permits, planning approvals.
  const geoTerms = `(${NEWTON_RADIUS_CITY_HINTS.map((c) => `"${c}"`).join(' OR ')})`;
  const signalTerms =
    '("capital improvement" OR "capital program" OR CIP OR "design services" OR "engineering services" OR RFQ OR "request for qualifications" OR "feasibility study" OR "site plan" OR "planning commission" OR "building permit" OR "permit issued" OR "permit filed" OR "facility expansion" OR "new facility" OR "manufacturing expansion" OR "new plant")';
  const query = `${geoTerms} AND ${signalTerms}`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=10&sort=hybridrel`;
  const response = await fetch(url, { headers: { 'User-Agent': 'kse-tools-server' } as any });
  if (!response.ok) return [];
  const data: any = await response.json().catch(() => null);
  const articles = data?.articles || [];
  return articles.slice(0, 10).map((a: any) =>
    buildItem({
      source: 'GDELT',
      sourceType: 'signal',
      agency: a.sourceCommonName || a.sourceCountry || '',
      title: a.title || 'Kansas capital project signal',
      summary: a.snippet || '',
      url: a.url || '',
      city: inferCity(`${a.title || ''} ${a.snippet || ''}`),
      state: 'KS',
      tags: ['Kansas', 'signal', 'capital', 'pre-rfp'],
      publishedAt: a.seendate || a.datetime || '',
      raw: { gdelt: a }
    })
  );
}

async function harvestPermitAndEngineeringSignals() {
  // Google News RSS is a good “early signal” source (permits, engineering RFQs, planning approvals).
  const phrases = [
    '"capital improvement plan"',
    '"building permit"',
    '"permit issued"',
    '"permit filed"',
    '"planning commission"',
    '"site plan"',
    '"engineering services"',
    '"design services"',
    'RFQ',
    '"request for qualifications"',
    '"feasibility study"'
  ];
  const cityQueries = NEWTON_RADIUS_CITY_HINTS.slice(0, 10); // keep it light
  const feeds = cityQueries.map((city) => {
    const q = `${city} Kansas (${phrases.join(' OR ')})`;
    return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  });

  const out: any[] = [];
  for (const feed of feeds) {
    try {
      const parsed = await rssParser.parseURL(feed);
      for (const entry of parsed.items.slice(0, 8)) {
        const title = entry.title || 'Signal';
        const snippet = entry.contentSnippet || entry.content || '';
        const text = `${title} ${snippet}`;
        const city = inferCity(text);
        if (!city) continue; // keep only within our Newton-radius city hints
        const id = entry.guid || entry.link || `${title}-${Math.random().toString(36).slice(2)}`;
        out.push(
          buildItem({
            source: parsed.title || 'Google News',
            sourceType: 'signal',
            title,
            summary: snippet,
            url: entry.link || feed,
            city,
            state: 'KS',
            tags: ['Kansas', 'signal', 'permits', 'engineering'],
            publishedAt: entry.isoDate || entry.pubDate || '',
            raw: { feed, entryId: id }
          })
        );
      }
    } catch (err) {
      // keep going
    }
  }
  return out;
}

async function upsertCipItems(items: any[]) {
  if (!items.length) return 0;
  let upserted = 0;
  for (const item of items) {
    const record = item;
    if (!record.id) record.id = `cip-${crypto.randomUUID()}`;
    try {
      // Prefer dedupe via hash when available.
      if (record.hash) {
        const existing = await prisma.capitalPlanItem.findUnique({ where: { hash: record.hash } });
        if (existing?.id) record.id = existing.id;
      }
      await prisma.capitalPlanItem.upsert({
        where: { id: record.id },
        update: record,
        create: record
      });
      upserted += 1;
    } catch (err) {
      logger.warn({ err, id: record.id }, 'CIP upsert failed');
    }
  }
  return upserted;
}

async function filterByRadius(items: any[], nearLat?: number, nearLng?: number, radiusMi?: number) {
  if (!radiusMi || nearLat == null || nearLng == null) return items;
  const out = [];
  for (const item of items) {
    const lat = item.latitude;
    const lng = item.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') {
      const d = haversineMiles(nearLat, nearLng, lat, lng);
      if (d <= radiusMi) out.push(item);
      continue;
    }
    // Try lightweight geocode using city/state if available.
    const geo = await geocodeItem(item);
    if (geo) {
      const d = haversineMiles(nearLat, nearLng, geo.lat, geo.lng);
      if (d <= radiusMi) out.push({ ...item, latitude: geo.lat, longitude: geo.lng });
    }
  }
  return out;
}

async function ensureCoordsAndFilter(items: any[], nearLat?: number, nearLng?: number, radiusMi?: number) {
  if (!radiusMi || nearLat == null || nearLng == null) return items;
  const out = [];
  for (const item of items) {
    const existingLat = item.latitude;
    const existingLng = item.longitude;
    if (typeof existingLat === 'number' && typeof existingLng === 'number') {
      const d = haversineMiles(nearLat, nearLng, existingLat, existingLng);
      if (d <= radiusMi) out.push(item);
      continue;
    }
    const geo = await geocodeItem(item);
    if (!geo) continue;
    const d = haversineMiles(nearLat, nearLng, geo.lat, geo.lng);
    if (d <= radiusMi) out.push({ ...item, latitude: geo.lat, longitude: geo.lng });
  }
  return out;
}

async function geocodeItem(item: any) {
  const city = (item.city || '').trim();
  const state = (item.state || '').trim();
  if (!city || !state) return null;
  const key = `${city}, ${state}`.toLowerCase();
  const cached = geocodeCache.get(key);
  if (cached) return cached;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(`${city}, ${state}`)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'kse-tools-server' } as any });
  if (!res.ok) return null;
  const data: any = await res.json().catch(() => null);
  const first = Array.isArray(data) ? data[0] : null;
  if (!first?.lat || !first?.lon) return null;
  const geo = { lat: Number(first.lat), lng: Number(first.lon) };
  if (Number.isNaN(geo.lat) || Number.isNaN(geo.lng)) return null;
  geocodeCache.set(key, geo);
  return geo;
}

function inferCity(text: string) {
  const hay = (text || '').toLowerCase();
  for (const city of NEWTON_RADIUS_CITY_HINTS) {
    if (hay.includes(city.toLowerCase())) return city;
  }
  return '';
}

function buildItem(partial: any) {
  const now = new Date().toISOString();
  const title = String(partial.title || '').trim() || 'Capital plan item';
  const url = String(partial.url || partial.docUrl || '').trim();
  const hash = partial.hash || hashItem(`${partial.source || ''}|${title}|${partial.fiscalYear || ''}|${url}`);
  return {
    id: partial.id || `cip-${hash.slice(0, 24)}`,
    hash,
    source: partial.source || 'Unknown',
    sourceType: partial.sourceType || null,
    agency: partial.agency || null,
    title,
    summary: partial.summary || null,
    url: url || null,
    docUrl: partial.docUrl || null,
    city: partial.city || null,
    state: partial.state || null,
    county: partial.county || null,
    latitude: partial.latitude ?? null,
    longitude: partial.longitude ?? null,
    fiscalYear: partial.fiscalYear || null,
    budget: partial.budget ?? null,
    status: partial.status || null,
    stage: partial.stage || (partial.sourceType === 'signal' ? 'early-signal' : null),
    tags: partial.tags || [],
    publishedAt: partial.publishedAt || null,
    scrapedAt: now,
    createdAt: partial.createdAt || now,
    updatedAt: now,
    raw: partial.raw || {}
  };
}

function hashItem(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function absolutize(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

