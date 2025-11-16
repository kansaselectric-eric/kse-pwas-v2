import React, { useEffect, useState } from 'react';
import { KpiCard } from './components/KpiCard';
import { ScheduleTable } from './components/ScheduleTable';
import { fetchHistory, fetchKpis, fetchScheduleHealth, fetchManpowerForecast, fetchManpowerBreakdown } from './lib/api';
import { ManpowerTable } from './components/ManpowerTable';
import { BreakdownTables } from './components/BreakdownTables';
import { Heatmap } from './components/Heatmap';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [manpower, setManpower] = useState<any[]>([]);
  const [breakdown, setBreakdown] = useState<any | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [k, h, s, m, b] = await Promise.all([fetchKpis(), fetchHistory(30), fetchScheduleHealth(), fetchManpowerForecast(14), fetchManpowerBreakdown(14)]);
        setKpis(k);
        setHistory(h);
        setSchedule(s);
        setManpower(m);
        setBreakdown(b);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 p-6">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Project Management KPIs</h1>
        <p className="text-sm text-slate-500">Daily snapshot across Field Reports, Opportunity Radar, CRM, and Forecast.</p>
      </header>
      <main className="grid md:grid-cols-2 gap-4">
        <KpiCard
          title="Field Reports (7d)"
          items={[
            { label: 'Reports', value: kpis.fieldReports.reports7d },
            { label: 'Manpower', value: kpis.fieldReports.manpower7d },
            { label: 'Safety Issues', value: kpis.fieldReports.safety7d }
          ]}
        />
        <KpiCard
          title="Opportunity Radar"
          items={[
            { label: 'New (7d)', value: kpis.radar.new7d },
            { label: 'High-score (7d)', value: kpis.radar.high7d },
            { label: 'Total', value: kpis.radar.total }
          ]}
        />
        <KpiCard
          title="CRM (7d)"
          items={[
            { label: 'Touches', value: kpis.crm.touches7d },
            { label: 'Top Accounts', value: (kpis.crm.topAccounts || []).map((t: any) => `${t.name} (${t.touches})`).join(', ') || 'n/a' }
          ]}
        />
        <KpiCard
          title="Forecast"
          items={[{ label: 'Weighted 90d', value: `$${Number(kpis.forecast.weighted90d).toLocaleString()}` }]}
        />
        <ScheduleTable rows={schedule} />
        <ManpowerTable rows={manpower} />
        {breakdown && <BreakdownTables division={breakdown.division} project={breakdown.project} />}
        {breakdown && <Heatmap dates={breakdown.heatmap.dates} rows={breakdown.heatmap.rows} />}
      </main>
    </div>
  );
}


