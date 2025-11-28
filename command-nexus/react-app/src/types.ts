export type Mode = 'ops' | 'executive';

export type TileMetric = {
  label: string;
  value: string;
  trend?: string;
};

export type TileData = {
  id: string;
  title: string;
  category: string;
  summary: string;
  accent: string;
  metrics: TileMetric[];
  link: string;
};

export type NexusSnapshot = {
  fetchedAt: string;
  tiles: TileData[];
  market: {
    notes: string[];
    commodities: Array<{ name: string; status: string; message: string }>;
  };
  marketing: {
    accounts: MarketingAccount[];
    trendingPages: Array<{ path: string; views: number }>;
  };
};

export type PaletteAction = {
  id: string;
  label: string;
  description: string;
  onSelect: () => void;
};

export type MarketingAccount = {
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

