import { Router } from 'express';
import { getMarketInsights } from '../services/marketData.js';
import type { MarketInsights } from '../services/marketData.js';
import { getOpportunityFeed } from '../services/opportunityScout.js';
import type { OpportunityRecord } from '../services/opportunityScout.js';
import { getOpportunityUsageReport } from '../services/opportunityUsage.js';
import { getMarketingPulse } from '../services/marketingInsights.js';
import type { MarketingPulse } from '../services/marketingInsights.js';
import { logger } from '../logger.js';

export const nexusRouter = Router();

nexusRouter.get('/snapshot', async (_req, res) => {
  try {
    const [market, opportunities, usage, marketingPulse] = await Promise.all([
      getMarketInsights(),
      getOpportunityFeed({ limit: 12 }),
      Promise.resolve(getOpportunityUsageReport(14)),
      Promise.resolve(getMarketingPulse())
    ]);

    const tiles = buildTiles(market, opportunities.items, usage, marketingPulse);

    res.json({
      fetchedAt: new Date().toISOString(),
      tiles,
      market: {
        notes: market.notes,
        commodities: market.commodities.slice(0, 3)
      },
      marketing: {
        accounts: marketingPulse.accounts.slice(0, 5),
        trendingPages: marketingPulse.trendingPages
      }
    });
  } catch (error) {
    logger.error({ error }, 'nexus snapshot failed');
    res.status(500).json({ ok: false, error: 'Unable to build command snapshot' });
  }
});

type OpportunitySummary = Pick<OpportunityRecord, 'tags'>;

type UsageSummary = ReturnType<typeof getOpportunityUsageReport>;

function buildTiles(
  market: MarketInsights,
  opportunities: OpportunitySummary[],
  usage: UsageSummary,
  marketingPulse: MarketingPulse
) {
  const totalOpps = opportunities.length;
  const hotTags = new Set<string>();
  opportunities.slice(0, 6).forEach((opp) => opp.tags.forEach((tag) => hotTags.add(tag)));
  const fieldTile = {
    id: 'field-reports',
    title: 'Field Ops Pulse',
    category: 'Field Reports',
    summary: 'SPI, narration health, look-ahead alerts',
    accent: '#0ea5e9',
    metrics: [
      { label: 'SPI', value: '0.98', trend: '+0.02' },
      { label: 'Narration Health', value: '92%' }
    ],
    link: '/field-reports/mobile-app/index.html'
  };
  const estimatingTile = {
    id: 'estimate-accelerator',
    title: 'Estimate Accelerator',
    category: 'Estimating',
    summary: 'Doc AI confidence, QA backlog',
    accent: '#f97316',
    metrics: [
      { label: 'Active Bids', value: String(Math.max(8, Math.round(totalOpps / 2))) },
      { label: 'Doc AI Confidence', value: '93%' }
    ],
    link: '/estimate-accelerator/web/index.html'
  };
  const opportunityTile = {
    id: 'opportunity-scout',
    title: 'Opportunity Scout',
    category: 'Growth',
    summary: 'Fresh public bids + expansion signals',
    accent: '#22c55e',
    metrics: [
      { label: 'New Signals', value: String(totalOpps) },
      { label: 'Hot Tag', value: Array.from(hotTags)[0] || 'solar' }
    ],
    link: '/opportunity-radar/web/index.html'
  };
  const usageTile = {
    id: 'command-usage',
    title: 'Nexus Telemetry',
    category: 'Usage',
    summary: 'Scans, watch runs, estimator sends',
    accent: '#a855f7',
    metrics: [
      { label: 'Scans 14d', value: String(usage.metrics?.scans ?? 0) },
      { label: 'Estimator Sends', value: String(usage.metrics?.estimatorSends ?? 0) }
    ],
    link: '/project-management/react-app/index.html'
  };

  const marketTile = {
    id: 'market-intel',
    title: 'Market Intelligence',
    category: 'Market',
    summary: 'PPI, solar capex, energy pricing',
    accent: '#38bdf8',
    metrics: [
      { label: 'Electrical PPI', value: market.ppi.latestValue ? `${market.ppi.latestValue}` : 'n/a' },
      {
        label: 'PV Capex',
        value: market.solarCapex.value ? `$${market.solarCapex.value.toFixed(0)}` : 'n/a'
      }
    ],
    link: '/estimate-accelerator/web/index.html#market'
  };

  const marketingTile = {
    id: 'marketing-pulse',
    title: 'Marketing Pulse',
    category: 'Marketing',
    summary: 'Dealfront engagement + GA intent',
    accent: '#f97316',
    metrics: [
      { label: 'Accounts 7d', value: String(marketingPulse.summary.accounts) },
      { label: 'Avg Intent', value: `${marketingPulse.summary.avgIntent}%` },
      { label: 'Pipeline Overlap', value: String(marketingPulse.summary.pipelineOverlap) }
    ],
    link: '/smart-contacts/react-app/index.html'
  };

  return [fieldTile, estimatingTile, opportunityTile, usageTile, marketTile, marketingTile];
}

