import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import pLimit from 'p-limit';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { logger } from '../logger.js';

const seedPath = fileURLToPath(new URL('../data/opportunity-seeds.json', import.meta.url));
const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

export type OpportunityType = 'bid' | 'expansion';

export interface OpportunityRecord {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  type: OpportunityType;
  agency?: string;
  location?: string;
  postedDate?: string;
  dueDate?: string;
  value?: number | null;
  tags: string[];
  confidence: number;
  score: number;
}

export interface OpportunityFilters {
  keywords?: string;
  state?: string;
  type?: OpportunityType | 'all';
  minValue?: number;
  limit?: number;
}

export interface OpportunityStats {
  total: number;
  bids: number;
  expansions: number;
  avgValue: number | null;
  hotTags: string[];
}

export interface SourceHealth {
  name: string;
  status: 'ok' | 'partial' | 'error';
  records: number;
  fetchedAt: string;
  error?: string;
}

interface CacheBucket {
  items: OpportunityRecord[];
  sources: SourceHealth[];
  fetchedAt: number;
}

const rssParser = new Parser({
  headers: { 'User-Agent': 'KSE-Opportunity-Scout/1.0 (+https://kselectric.com)' },
  timeout: 10000
});

const CACHE_TTL_MS = 1000 * 60 * 10; // 10 minutes
const cache: CacheBucket = { items: [], sources: [], fetchedAt: 0 };

export async function getOpportunityFeed(filters: OpportunityFilters = {}) {
  const keywordList = normalizeKeywords(filters.keywords);
  const { items, sources } = await hydrateSources(keywordList);
  const filtered = applyFilters(items, filters, keywordList);
  const stats = buildStats(filtered);
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 60;
  return {
    items: filtered.slice(0, limit),
    stats,
    sources
  };
}

async function hydrateSources(keywords: string[]) {
  const now = Date.now();
  if (cache.items.length && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { items: cache.items, sources: cache.sources };
  }

  const pipelines: Array<{ name: string; loader: () => Promise<OpportunityRecord[]> }> = [
    { name: 'SAM.gov', loader: () => fetchSamGov(keywords) },
    { name: 'Kansas Procurement', loader: () => fetchKansasProcurement() },
    { name: 'Expansion Signals', loader: () => fetchExpansionNews(keywords) },
    { name: 'Energy.gov OE', loader: () => fetchEnergyOfficeAnnouncements() },
    { name: 'Utility Dive', loader: () => fetchUtilityDiveSignals() },
    { name: 'KSE Seeds', loader: () => fetchSeedSignals() }
  ];

  const results: OpportunityRecord[] = [];
  const sources: SourceHealth[] = [];
  const limit = pLimit(3);
  await Promise.allSettled(
    pipelines.map((pipe) =>
      limit(async () => {
        try {
          const records = await pipe.loader();
          results.push(...records);
          sources.push({
            name: pipe.name,
            status: records.length ? 'ok' : 'partial',
            records: records.length,
            fetchedAt: new Date().toISOString()
          });
        } catch (error) {
          const err = error instanceof Error ? error.message : String(error);
          logger.warn({ source: pipe.name, err }, 'Opportunity source failed');
          sources.push({
            name: pipe.name,
            status: 'error',
            records: 0,
            fetchedAt: new Date().toISOString(),
            error: err
          });
        }
      })
    )
  );

  const deduped = dedupe(results);
  cache.items = deduped;
  cache.sources = sources;
  cache.fetchedAt = now;
  return { items: deduped, sources };
}

function applyFilters(items: OpportunityRecord[], filters: OpportunityFilters, keywords: string[]) {
  return items.filter((item) => {
    if (filters.type && filters.type !== 'all' && item.type !== filters.type) return false;
    if (filters.minValue && item.value != null && item.value < filters.minValue) return false;
    if (filters.state && item.location && !item.location.toLowerCase().includes(filters.state.toLowerCase())) {
      return false;
    }
    if (keywords.length) {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      const hasMatch = keywords.every((kw) => text.includes(kw));
      if (!hasMatch) return false;
    }
    return true;
  });
}

function buildStats(items: OpportunityRecord[]): OpportunityStats {
  const bids = items.filter((i) => i.type === 'bid');
  const expansions = items.filter((i) => i.type === 'expansion');
  const numericValues = items.map((i) => i.value).filter((v): v is number => typeof v === 'number');
  const avgValue = numericValues.length
    ? Math.round(numericValues.reduce((acc, val) => acc + val, 0) / numericValues.length)
    : null;
  const tagCounts = new Map<string, number>();
  items.forEach((item) => {
    item.tags.forEach((tag) => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  const hotTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag);

  return {
    total: items.length,
    bids: bids.length,
    expansions: expansions.length,
    avgValue,
    hotTags
  };
}

function dedupe(items: OpportunityRecord[]): OpportunityRecord[] {
  const seen = new Map<string, OpportunityRecord>();
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.set(item.id, item);
      continue;
    }
    const existing = seen.get(item.id)!;
    if (existing.confidence < item.confidence) {
      seen.set(item.id, item);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.score - a.score);
}

async function fetchSamGov(keywords: string[]): Promise<OpportunityRecord[]> {
  if (!config.opportunities.samApiKey) {
    logger.debug('SAM_API_KEY missing, skipping SAM.gov fetch');
    return [];
  }
  const query = keywords.length ? keywords.join(' ') : config.opportunities.defaultKeywords.join(' ');
  const params = {
    api_key: config.opportunities.samApiKey,
    limit: 25,
    postedFrom: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString().split('T')[0],
    q: query
  };
  const { data } = await axios.get('https://api.sam.gov/opportunities/v2/search', { params, timeout: 10000 });
  const rows: any[] =
    data?.opportunitiesData?.opportunities || data?.opportunitiesData || data?.searchResult?.searchResults || [];
  return rows.map((row: any) => {
    const noticeId = row.noticeId || row.solnbr || row.id || row.notice_id;
    const url = row.uiLink || row.url || (noticeId ? `https://sam.gov/opp/${noticeId}/view` : '');
    const tags: string[] = ([] as string[])
      .concat(row.naics ? row.naics : [])
      .concat(row.naicsCodes ? row.naicsCodes : [])
      .filter(Boolean);
    const confidence = scoreConfidence(row, keywords);
    return {
      id: `sam-${noticeId}`,
      title: row.title || row.noticeTitle || row.subject || 'Untitled federal opportunity',
      summary: row.description || row.summary || '',
      source: 'SAM.gov',
      url,
      type: 'bid',
      agency: row.organizationHierarchy || row.agency || row.department || undefined,
      location: row.placeOfPerformanceFullAddress || row.city || row.placeOfPerformance || 'Various',
      postedDate: row.postedDate || row.publish_date,
      dueDate: row.responseDeadLine || row.responseDate || row.dueDate,
      value: row.estimatedValue ? Number(row.estimatedValue) : null,
      tags,
      confidence,
      score: scoreOpportunity(row, confidence)
    };
  });
}

async function fetchKansasProcurement(): Promise<OpportunityRecord[]> {
  const { data } = await axios.get(
    'https://admin.ks.gov/offices/procurement-and-contracts/bid-solicitations',
    { timeout: 10000 }
  );
  const $ = cheerio.load(data);
  const rows: OpportunityRecord[] = [];
  $('table tbody tr').each((_idx, el) => {
    const cells = $(el).find('td');
    if (!cells.length) return;
    const bid = {
      number: $(cells[0]).text().trim(),
      title: $(cells[1]).text().trim(),
      due: $(cells[2]).text().trim(),
      buyer: $(cells[3]).text().trim(),
      link: $(cells[1]).find('a').attr('href')
    };
    const id = bid.number || bid.title;
    const summary = `${bid.title} — Buyer: ${bid.buyer || 'Kansas Procurement'}`;
    rows.push({
      id: `ks-${id}`,
      title: bid.title || 'Kansas procurement',
      summary,
      source: 'Kansas Procurement',
      url: bid.link || 'https://admin.ks.gov/offices/procurement-and-contracts/bid-solicitations',
      type: 'bid',
      agency: bid.buyer || 'State of Kansas',
      location: 'KS statewide',
      postedDate: undefined,
      dueDate: bid.due || undefined,
      value: null,
      tags: ['state procurement', 'Kansas'],
      confidence: 72,
      score: 68
    });
  });
  return rows;
}

async function fetchExpansionNews(keywords: string[]): Promise<OpportunityRecord[]> {
  const feeds = config.opportunities.rssFeeds.length
    ? config.opportunities.rssFeeds
    : ['https://news.google.com/rss/search?q=Kansas%20expansion%20construction&hl=en-US&gl=US&ceid=US:en'];
  const allItems: OpportunityRecord[] = [];
  for (const feed of feeds) {
    try {
      const parsed = await rssParser.parseURL(feed);
      parsed.items.forEach((entry) => {
        const id = entry.guid || entry.link || entry.title || `feed-${Math.random().toString(36).slice(2)}`;
        const text = `${entry.title || ''} ${entry.contentSnippet || ''}`.toLowerCase();
        const matches = keywords.filter((kw) => text.includes(kw));
        const confidence = Math.min(90, 40 + matches.length * 15);
        const tags = matches.length ? matches : extractTags(entry.title || '');
        allItems.push({
          id: `rss-${id}`,
          title: entry.title || 'Expansion signal',
          summary: entry.contentSnippet || entry.content || '',
          source: parsed.title || 'Industry News',
          url: entry.link || feed,
          type: 'expansion',
          location: inferLocation(entry.title || ''),
          postedDate: entry.isoDate || entry.pubDate || undefined,
          dueDate: undefined,
          value: null,
          tags,
          confidence,
          score: confidence + 10
        });
      });
    } catch (error) {
      logger.warn({ feed, error }, 'RSS feed failed');
    }
  }
  return allItems;
}

async function fetchEnergyOfficeAnnouncements(): Promise<OpportunityRecord[]> {
  const feeds = [
    'https://www.energy.gov/rss/office-electricity',
    'https://www.energy.gov/rss/office-policy'
  ];
  return gatherRssSignals(feeds, 'DOE Announcements');
}

async function fetchUtilityDiveSignals(): Promise<OpportunityRecord[]> {
  const feeds = ['https://www.utilitydive.com/feeds/news/'];
  return gatherRssSignals(feeds, 'Utility Dive');
}

async function gatherRssSignals(feeds: string[], label: string): Promise<OpportunityRecord[]> {
  const items: OpportunityRecord[] = [];
  for (const feed of feeds) {
    try {
      const parsed = await rssParser.parseURL(feed);
      parsed.items.forEach((entry) => {
        const id = entry.guid || entry.link || `rss-${Math.random().toString(36).slice(2)}`;
        items.push({
          id: `${label}-${id}`,
          title: entry.title || `${label} update`,
          summary: entry.contentSnippet || entry.content || '',
          source: label,
          url: entry.link || feed,
          type: 'expansion',
          location: inferLocation(entry.title || ''),
          postedDate: entry.isoDate || entry.pubDate || undefined,
          tags: extractTags(entry.title || ''),
          confidence: 70,
          score: 75
        });
      });
    } catch (error) {
      logger.warn({ feed, label, error }, 'RSS signal feed failed');
    }
  }
  return items;
}

async function fetchSeedSignals(): Promise<OpportunityRecord[]> {
  return (seedData as OpportunityRecord[]).map((seed) => ({
    ...seed,
    score: seed.score || 80,
    confidence: seed.confidence || 85,
    tags: seed.tags || []
  }));
}

function scoreConfidence(row: any, keywords: string[]) {
  const text = `${row.title || ''} ${row.description || ''}`.toLowerCase();
  if (!keywords.length) return 75;
  const hits = keywords.reduce((acc, kw) => (text.includes(kw) ? acc + 1 : acc), 0);
  return Math.min(95, 55 + hits * 10);
}

function scoreOpportunity(row: any, confidence: number) {
  let score = confidence;
  if (row.responseDeadLine) {
    const due = Date.parse(row.responseDeadLine);
    if (!Number.isNaN(due)) {
      const daysOut = (due - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysOut < 0) score -= 10;
      else if (daysOut < 7) score += 10;
      else if (daysOut < 21) score += 5;
    }
  }
  if (row.estimatedValue) {
    score += Math.min(15, Math.log10(Number(row.estimatedValue) + 1) * 5);
  }
  return Math.max(30, Math.min(100, Math.round(score)));
}

function normalizeKeywords(input?: string) {
  if (!input) return [];
  return input
    .split(',')
    .map((kw) => kw.trim().toLowerCase())
    .filter(Boolean);
}

function extractTags(text: string): string[] {
  const tokens = text
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9-]/gi, '').toLowerCase())
    .filter((t) => t.length > 3);
  return Array.from(new Set(tokens)).slice(0, 4);
}

function inferLocation(text: string) {
  const matches = text.match(/\b[A-Z]{2}\b/g);
  if (matches && matches.length) return matches[0];
  if (text.toLowerCase().includes('kansas')) return 'KS';
  return 'National';
}

