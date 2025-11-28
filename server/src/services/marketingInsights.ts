type MarketingAccount = {
  company: string;
  domain: string;
  intentScore: number;
  visits7d: number;
  lastVisit: string;
  topPages: Array<{ path: string; views: number }>;
  tags: string[];
  matchedOpportunityId?: string;
  matchedProject?: string;
  spi?: number;
  location?: string;
};

type MarketingHeatEntry = {
  company: string;
  domain: string;
  intentScore: number;
  visits7d: number;
  lastVisit: string;
  topPage: string;
  tags: string[];
  matchedOpportunityId?: string;
  matchedProject?: string;
  spi?: number;
};

export type MarketingPulse = {
  generatedAt: string;
  accounts: MarketingAccount[];
  summary: {
    accounts: number;
    avgIntent: number;
    pipelineOverlap: number;
  };
  trendingPages: Array<{ path: string; views: number }>;
  heat: {
    byCompany: Record<string, MarketingHeatEntry>;
    byDomain: Record<string, MarketingHeatEntry>;
    byTag: Record<string, MarketingHeatEntry[]>;
  };
};

const SAMPLE_ACCOUNTS: MarketingAccount[] = [
  {
    company: 'High Plains Utility',
    domain: 'highplainsutility.com',
    intentScore: 88,
    visits7d: 5,
    lastVisit: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    tags: ['utility', 'transmission', 'kansas'],
    topPages: [
      { path: '/solutions/substation-modernization', views: 3 },
      { path: '/projects/smoky-hill', views: 2 }
    ],
    matchedOpportunityId: 'sam-utility-ks',
    matchedProject: 'Smoky Hill Substation',
    spi: 0.93,
    location: 'KS'
  },
  {
    company: 'Prairie Data Centers',
    domain: 'prairiedc.io',
    intentScore: 76,
    visits7d: 4,
    lastVisit: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    tags: ['data center', 'tier4', 'nebraska'],
    topPages: [
      { path: '/services/mission-critical', views: 2 },
      { path: '/field-reports', views: 1 }
    ],
    matchedOpportunityId: 'seed-datahall',
    matchedProject: 'Hyperscale data hall fit-out',
    spi: 0.97,
    location: 'NE'
  },
  {
    company: 'Frontier Renewables Cooperative',
    domain: 'frontierrenewables.coop',
    intentScore: 69,
    visits7d: 3,
    lastVisit: new Date(Date.now() - 32 * 60 * 60 * 1000).toISOString(),
    tags: ['solar', 'battery', 'regional coop'],
    topPages: [
      { path: '/solutions/battery-storage', views: 2 },
      { path: '/insights/opportunity-radar', views: 1 }
    ],
    matchedOpportunityId: 'seed-lab-battery',
    matchedProject: 'Midwest utility-scale battery yard',
    spi: 0.95,
    location: 'KS/MO'
  },
  {
    company: 'Metro Grid Services',
    domain: 'metrogridservices.com',
    intentScore: 61,
    visits7d: 2,
    lastVisit: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    tags: ['service', 'industrial', 'oklahoma'],
    topPages: [
      { path: '/services/emergency-response', views: 2 }
    ],
    matchedProject: undefined,
    location: 'OK'
  }
];

let cachedPulse: MarketingPulse | null = null;
let lastBuild = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeKey(input: string | undefined | null) {
  if (!input) return '';
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildPulse(): MarketingPulse {
  const accounts = SAMPLE_ACCOUNTS;
  const totalIntent = accounts.reduce((sum, acct) => sum + acct.intentScore, 0);
  const pipelineOverlap = accounts.filter((acct) => acct.matchedOpportunityId).length;

  const pageMap = new Map<string, number>();
  accounts.forEach((acct) => {
    acct.topPages.forEach((page) => {
      pageMap.set(page.path, (pageMap.get(page.path) || 0) + page.views);
    });
  });
  const trendingPages = Array.from(pageMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, views]) => ({ path, views }));

  const heatByCompany: Record<string, MarketingHeatEntry> = {};
  const heatByDomain: Record<string, MarketingHeatEntry> = {};
  const heatByTag: Record<string, MarketingHeatEntry[]> = {};

  accounts.forEach((acct) => {
    const entry: MarketingHeatEntry = {
      company: acct.company,
      domain: acct.domain,
      intentScore: acct.intentScore,
      visits7d: acct.visits7d,
      lastVisit: acct.lastVisit,
      topPage: acct.topPages[0]?.path || '/',
      tags: acct.tags,
      matchedOpportunityId: acct.matchedOpportunityId,
      matchedProject: acct.matchedProject,
      spi: acct.spi
    };
    const companyKey = normalizeKey(acct.company);
    if (companyKey) heatByCompany[companyKey] = entry;
    const domainKey = normalizeKey(acct.domain);
    if (domainKey) heatByDomain[domainKey] = entry;
    acct.tags.forEach((tag) => {
      const tagKey = normalizeKey(tag);
      if (!tagKey) return;
      if (!heatByTag[tagKey]) heatByTag[tagKey] = [];
      heatByTag[tagKey].push(entry);
    });
  });

  const pulse: MarketingPulse = {
    generatedAt: new Date().toISOString(),
    accounts,
    summary: {
      accounts: accounts.length,
      avgIntent: accounts.length ? Math.round(totalIntent / accounts.length) : 0,
      pipelineOverlap
    },
    trendingPages,
    heat: {
      byCompany: heatByCompany,
      byDomain: heatByDomain,
      byTag: heatByTag
    }
  };
  return pulse;
}

export function getMarketingPulse(): MarketingPulse {
  if (!cachedPulse || Date.now() - lastBuild > CACHE_TTL_MS) {
    cachedPulse = buildPulse();
    lastBuild = Date.now();
  }
  return cachedPulse;
}

export function getMarketingHeat() {
  const pulse = getMarketingPulse();
  return pulse.heat;
}


