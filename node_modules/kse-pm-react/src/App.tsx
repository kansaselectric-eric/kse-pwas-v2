import React, { useEffect, useState } from 'react';
import { KpiCard } from './components/KpiCard';
import { ScheduleTable } from './components/ScheduleTable';
import { fetchHistory, fetchKpis, fetchScheduleHealth, fetchManpowerForecast, fetchManpowerBreakdown } from './lib/api';
import type { Kpis, HistoryPoint, ScheduleRow, ManpowerForecastRow, ManpowerBreakdown } from './lib/api';
import { ManpowerTable } from './components/ManpowerTable';
import { BreakdownTables } from './components/BreakdownTables';
import { Heatmap } from './components/Heatmap';

type Mode = 'ops' | 'executive';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [, setHistory] = useState<HistoryPoint[]>([]);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [manpower, setManpower] = useState<ManpowerForecastRow[]>([]);
  const [breakdown, setBreakdown] = useState<ManpowerBreakdown | null>(null);
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'ops';
    return (localStorage.getItem('kse_mode') as Mode) || 'ops';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.mode = mode;
    localStorage.setItem('kse_mode', mode);
  }, [mode]);

  useEffect(() => {
    (async () => {
      try {
        const [k, h, s, m, b] = await Promise.all([
          fetchKpis(),
          fetchHistory(30),
          fetchScheduleHealth(),
          fetchManpowerForecast(14),
          fetchManpowerBreakdown(14)
        ]);
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

  const shell = (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-end">
          <button
            type="button"
            className="mode-switcher"
            data-mode={mode}
            onClick={() => setMode(mode === 'ops' ? 'executive' : 'ops')}
          >
            <span className="mode-label">{mode === 'ops' ? 'Ops mode' : 'Executive mode'}</span>
            <span className="mode-next">{mode === 'ops' ? 'Flip to executive' : 'Flip to ops'}</span>
          </button>
        </div>
        <header className="brand-hero space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/70">Kansas Electric · Performance Wall</p>
          <h1 className="text-3xl font-semibold">Project Management KPIs</h1>
          <p className="text-sm text-white/80 max-w-3xl">
            Daily pulse across Field Reports, Opportunity Radar, CRM, and the 90-day projection lens—styled to mirror the Command Nexus.
          </p>
        </header>
        <main className="grid md:grid-cols-2 gap-4">
          {kpis ? (
            <>
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
                  {
                    label: 'Top Accounts',
                    value: (kpis.crm.topAccounts || []).map((t) => `${t.name} (${t.touches})`).join(', ') || 'n/a'
                  }
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
            </>
          ) : (
            <div className="col-span-2 rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-sm text-slate-500">
              Unable to load dashboard data.
            </div>
          )}
        </main>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        Calibrating dashboard…
      </div>
    );
  }

  return shell;
}


