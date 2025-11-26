export type Kpis = {
  fieldReports: { reports7d: number; manpower7d: number; safety7d: number };
  radar: { new7d: number; high7d: number; total: number };
  crm: { touches7d: number; topAccounts: Array<{ name: string; touches: number }> };
  forecast: { weighted90d: number };
};

const PM_ENDPOINT = import.meta.env.VITE_PM_ENDPOINT as string;

export async function fetchKpis(): Promise<Kpis> {
  const res = await fetch(`${PM_ENDPOINT}?action=kpis`);
  const data = await res.json();
  return data.kpis;
}

export async function fetchHistory(n = 30) {
  const res = await fetch(`${PM_ENDPOINT}?action=kpis_history&n=${n}`);
  const data = await res.json();
  return data.history as Array<any>;
}

export async function fetchScheduleHealth() {
  const res = await fetch(`${PM_ENDPOINT}?action=schedule_health`);
  const data = await res.json();
  return data.schedule as Array<any>;
}

export async function fetchManpowerForecast(days = 14) {
  const res = await fetch(`${PM_ENDPOINT}?action=manpower_forecast&days=${days}`);
  const data = await res.json();
  return data.forecast as Array<{ date: string; foreman: number; journeyman: number; apprentices: number; total: number }>;
}

export async function fetchManpowerBreakdown(days = 14) {
  const res = await fetch(`${PM_ENDPOINT}?action=manpower_breakdown&days=${days}`);
  const data = await res.json();
  return data.breakdown as { division: Array<{ division: string; total: number }>, project: Array<{ project: string; total: number }>, heatmap: { dates: string[]; rows: Array<{ project: string; cells: number[] }> } };
}


