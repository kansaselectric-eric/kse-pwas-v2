export type Kpis = {
  fieldReports: { reports7d: number; manpower7d: number; safety7d: number };
  radar: { new7d: number; high7d: number; total: number };
  crm: { touches7d: number; topAccounts: Array<{ name: string; touches: number }> };
  forecast: { weighted90d: number };
};

export type HistoryPoint = {
  date: string;
  frReports: number;
  radarNew: number;
  crmTouches: number;
  forecast90: number;
};

export type ScheduleRow = { date: string; project: string; planned: number; actual: number; variance: number; spi: number };

export type ManpowerForecastRow = { date: string; foreman: number; journeyman: number; apprentices: number; total: number };

export type ManpowerBreakdown = {
  division: Array<{ division: string; total: number }>;
  project: Array<{ project: string; total: number }>;
  heatmap: { dates: string[]; rows: Array<{ project: string; cells: number[] }> };
};

const PM_ENDPOINT = import.meta.env.VITE_PM_ENDPOINT as string;

export async function fetchKpis(): Promise<Kpis> {
  const res = await fetch(`${PM_ENDPOINT}?action=kpis`);
  const data = await res.json();
  return data.kpis;
}

export async function fetchHistory(n = 30): Promise<HistoryPoint[]> {
  const res = await fetch(`${PM_ENDPOINT}?action=kpis_history&n=${n}`);
  const data = await res.json();
  return Array.isArray(data.history) ? data.history as HistoryPoint[] : [];
}

export async function fetchScheduleHealth(): Promise<ScheduleRow[]> {
  const res = await fetch(`${PM_ENDPOINT}?action=schedule_health`);
  const data = await res.json();
  return Array.isArray(data.schedule) ? data.schedule as ScheduleRow[] : [];
}

export async function fetchManpowerForecast(days = 14): Promise<ManpowerForecastRow[]> {
  const res = await fetch(`${PM_ENDPOINT}?action=manpower_forecast&days=${days}`);
  const data = await res.json();
  return Array.isArray(data.forecast) ? data.forecast as ManpowerForecastRow[] : [];
}

export async function fetchManpowerBreakdown(days = 14): Promise<ManpowerBreakdown> {
  const res = await fetch(`${PM_ENDPOINT}?action=manpower_breakdown&days=${days}`);
  const data = await res.json();
  return data.breakdown as ManpowerBreakdown;
}


