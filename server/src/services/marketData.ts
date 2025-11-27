import { config } from '../config.js';

type PpiInsight = {
  seriesId: string;
  latestValue: number | null;
  changePercent: number | null;
  periodName: string | null;
  label: string;
};

type RenewableInsight = {
  label: string;
  value: number | null;
  unit: string;
  source: string;
};

type InterconnectionInsight = {
  region: string;
  backlogMonths: number | null;
  note: string;
};

type CommodityAlert = {
  name: string;
  latestValue: number | null;
  changePercent: number | null;
  status: 'stable' | 'elevated' | 'surging';
  message: string;
};

export type MarketInsights = {
  updatedAt: string;
  ppi: PpiInsight;
  solarCapex: RenewableInsight;
  energyPrice: RenewableInsight;
  interconnection: InterconnectionInsight;
  commodities: CommodityAlert[];
  notes: string[];
};

const cache: { data: MarketInsights | null; timestamp: number } = {
  data: null,
  timestamp: 0
};

type BlsSeriesDataPoint = {
  value?: string;
  periodName?: string;
};

type BlsSeries = {
  seriesID?: string;
  data?: BlsSeriesDataPoint[];
};

type BlsResponse = {
  Results?: {
    series?: BlsSeries[];
  };
};

type NrelProject = {
  cost_per_kw?: string | number;
};

type NrelResponse = {
  projects?: NrelProject[];
};

type EiaSeries = {
  data?: [string, string | number][];
  units?: string;
  name?: string;
};

type EiaResponse = {
  series?: EiaSeries[];
};

const ONE_HOUR = 60 * 60 * 1000;

export async function getMarketInsights(): Promise<MarketInsights> {
  if (cache.data && Date.now() - cache.timestamp < ONE_HOUR) {
    return cache.data;
  }
  const [ppiMap, solarCapex, energyPrice, interconnection] = await Promise.all([
    fetchBlsSeries(),
    fetchNrelSolarCapex(),
    fetchEiaEnergyPrice(),
    fetchFercInterconnection()
  ]);
  const ppi = ppiMap.electrical;
  const commodities = buildCommodityAlerts(ppiMap);
  const insights: MarketInsights = {
    updatedAt: new Date().toISOString(),
    ppi,
    solarCapex,
    energyPrice,
    interconnection,
    commodities,
    notes: buildNotes(ppi, solarCapex, energyPrice, interconnection, commodities)
  };
  cache.data = insights;
  cache.timestamp = Date.now();
  return insights;
}

async function fetchBlsSeries(): Promise<Record<string, PpiInsight>> {
  try {
    const seriesMap: Record<string, { id: string; label: string }> = {
      electrical: { id: 'PCU335A335A', label: 'Electrical equipment' },
      copper: { id: 'WPU102', label: 'Copper base scrap' },
      steel: { id: 'PCU331110331110', label: 'Steel mills' }
    };
    const body: Record<string, unknown> = {
      seriesid: Object.values(seriesMap).map((s) => s.id),
      startyear: (new Date().getFullYear() - 1).toString(),
      endyear: new Date().getFullYear().toString()
    };
    if (config.market.blsApiKey) body.registrationKey = config.market.blsApiKey;
    const res = await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`BLS responded ${res.status}`);
    const json = (await res.json()) as BlsResponse;
    const out: Record<string, PpiInsight> = {};
    for (const series of json?.Results?.series || []) {
      const meta = Object.entries(seriesMap).find(([, value]) => value.id === series.seriesID);
      const latest = series?.data?.[0];
      const prior = series?.data?.[1];
      const latestValue = latest ? Number(latest.value) : null;
      const changePercent =
        latest && prior ? ((Number(latest.value) - Number(prior.value)) / Number(prior.value)) * 100 : null;
      const key = (meta?.[0] ?? series.seriesID ?? 'unknown') as string;
      out[key] = {
        seriesId: series.seriesID,
        latestValue,
        changePercent,
        periodName: latest?.periodName || null,
        label: meta?.[1].label || series.seriesID
      };
    }
    return out;
  } catch (error) {
    return {
      electrical: {
        seriesId: 'PCU335A335A',
        latestValue: null,
        changePercent: null,
        periodName: null,
        label: 'Electrical equipment'
      },
      copper: {
        seriesId: 'WPU102',
        latestValue: null,
        changePercent: null,
        periodName: null,
        label: 'Copper base scrap'
      },
      steel: {
        seriesId: 'PCU331110331110',
        latestValue: null,
        changePercent: null,
        periodName: null,
        label: 'Steel mills'
      }
    };
  }
}

async function fetchNrelSolarCapex(): Promise<RenewableInsight> {
  try {
    const url = `https://developer.nrel.gov/api/solar/open_pv/projects.json?api_key=${encodeURIComponent(
      config.market.nrelApiKey || 'DEMO_KEY'
    )}&size=1&sort=cost_per_kw&order=desc`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NREL responded ${res.status}`);
    const json = (await res.json()) as NrelResponse;
    const project = json?.projects?.[0];
    return {
      label: 'PV capex median',
      value: project?.cost_per_kw ? Number(project.cost_per_kw) : null,
      unit: 'USD/kW',
      source: 'NREL OpenPV'
    };
  } catch {
    return {
      label: 'PV capex median',
      value: null,
      unit: 'USD/kW',
      source: 'NREL OpenPV'
    };
  }
}

async function fetchEiaEnergyPrice(): Promise<RenewableInsight> {
  try {
    const seriesId = 'ELEC.PRICE.US-RES.A';
    const url = `https://api.eia.gov/series/?api_key=${encodeURIComponent(
      config.market.eiaApiKey || 'DEMO_KEY'
    )}&series_id=${seriesId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`EIA responded ${res.status}`);
    const json = (await res.json()) as EiaResponse;
    const series = json?.series?.[0];
    const latest = series?.data?.[0];
    return {
      label: 'US residential electricity price',
      value: latest ? Number(latest[1]) : null,
      unit: series?.units || 'cents/kWh',
      source: series?.name || seriesId
    };
  } catch {
    return {
      label: 'US residential electricity price',
      value: null,
      unit: 'cents/kWh',
      source: 'EIA'
    };
  }
}

async function fetchFercInterconnection(): Promise<InterconnectionInsight> {
  // FERC does not expose a simple public API, so we surface a placeholder with guidance.
  // In production, integrate with your interconnection queue dataset or ISO data feed.
  return {
    region: 'ISO / Utility queue',
    backlogMonths: null,
    note: 'Provide ISO queue feed to populate backlog automatically.'
  };
}

function buildNotes(
  ppi: PpiInsight,
  solarCapex: RenewableInsight,
  energyPrice: RenewableInsight,
  interconnection: InterconnectionInsight,
  commodities: CommodityAlert[]
): string[] {
  const notes: string[] = [];
  if (ppi.changePercent != null) {
    notes.push(
      `Electrical equipment PPI is ${ppi.changePercent >= 0 ? '+' : ''}${ppi.changePercent.toFixed(
        1
      )}% vs prior period.`
    );
  }
  if (solarCapex.value != null) {
    notes.push(`Median PV capex snapshot: $${solarCapex.value.toFixed(0)} ${solarCapex.unit}.`);
  }
  if (energyPrice.value != null) {
    notes.push(`EIA ${energyPrice.label.toLowerCase()}: ${energyPrice.value.toFixed(2)} ${energyPrice.unit}.`);
  }
  if (interconnection.backlogMonths == null) {
    notes.push(interconnection.note);
  }
  commodities.forEach((alert) => {
    if (alert.status !== 'stable') {
      notes.push(alert.message);
    }
  });
  if (!notes.length) {
    notes.push('Market feeds reachable but no data available yet.');
  }
  return notes;
}

function buildCommodityAlerts(seriesMap: Record<string, PpiInsight>): CommodityAlert[] {
  const alerts: CommodityAlert[] = [];
  const mappings: Array<{ key: string; threshold: number; label: string }> = [
    { key: 'copper', threshold: 5, label: 'Copper' },
    { key: 'steel', threshold: 4, label: 'Steel' }
  ];
  for (const entry of mappings) {
    const series = seriesMap[entry.key];
    if (!series) continue;
    const change = series.changePercent;
    let status: CommodityAlert['status'] = 'stable';
    if (change != null) {
      if (change >= entry.threshold * 2) status = 'surging';
      else if (change >= entry.threshold) status = 'elevated';
      else if (change <= -entry.threshold) status = 'stable';
    }
    const direction = change != null ? (change >= 0 ? 'up' : 'down') : 'flat';
    const message =
      change != null
        ? `${entry.label} pricing ${direction === 'up' ? 'up' : 'down'} ${change >= 0 ? '+' : ''}${change.toFixed(
            1
          )}% vs prior period.`
        : `${entry.label} pricing unavailable; monitor supplier quotes closely.`;
    alerts.push({
      name: entry.label,
      latestValue: series.latestValue,
      changePercent: change,
      status,
      message
    });
  }
  return alerts;
}

