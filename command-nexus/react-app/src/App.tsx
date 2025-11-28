import { useEffect, useMemo, useState } from 'react';
import { CinematicCard, GlowButton, useAutoReveal } from '@kse/ui';
import { CommandPalette } from './components/CommandPalette';
import { BriefingModal } from './components/BriefingModal';
import { TileWall } from './components/TileWall';
import { ModeToggle } from './components/ModeToggle';
import type { Mode, NexusSnapshot, PaletteAction, TileData } from './types';

const SNAPSHOT_ENDPOINT = '/api/nexus/snapshot';

export default function App() {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('kse_mode') as Mode) || 'ops');
  const [snapshot, setSnapshot] = useState<NexusSnapshot | null>(null);
  const [order, setOrder] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('kse_wall_order') || '[]');
    } catch {
      return [];
    }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    localStorage.setItem('kse_mode', mode);
  }, [mode]);

  useEffect(() => {
    fetch(SNAPSHOT_ENDPOINT)
      .then((res) => res.json())
      .then((data) => setSnapshot(data))
      .catch(() => {
        setSnapshot({
          fetchedAt: new Date().toISOString(),
          tiles: fallbackTiles,
          market: { notes: ['Snapshot service unavailable.'], commodities: [] },
          marketing: fallbackMarketing
        });
      });
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    setOrder((current) => {
      const tileIds = snapshot.tiles.map((tile) => tile.id);
      if (!current.length) {
        localStorage.setItem('kse_wall_order', JSON.stringify(tileIds));
        return tileIds;
      }
      const filtered = current.filter((id) => tileIds.includes(id));
      const missing = tileIds.filter((id) => !filtered.includes(id));
      if (missing.length || filtered.length !== current.length) {
        const next = [...filtered, ...missing];
        localStorage.setItem('kse_wall_order', JSON.stringify(next));
        return next;
      }
      return current;
    });
  }, [snapshot]);

  const actions = useMemo<PaletteAction[]>(() => {
    if (!snapshot) return [];
    return snapshot.tiles.map((tile) => ({
      id: tile.id,
      label: `Open ${tile.title}`,
      description: tile.summary,
      onSelect: () => window.open(tile.link, '_blank')
    }));
  }, [snapshot]);

  const revealRef = useAutoReveal();

  if (!snapshot) {
    return (
      <main className="min-h-screen flex items-center justify-center text-white">
        <p className="text-sm tracking-[0.4em] uppercase text-white/60">Calibrating command nexus…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-10 text-white space-y-10">
      <section ref={revealRef} className="grid lg:grid-cols-[1fr_auto] gap-8 items-center">
        <CinematicCard accent={mode === 'ops' ? '#0ea5e9' : '#7c3aed'} className="min-h-[260px]">
          <p className="text-xs uppercase tracking-[0.6em] text-white/60">Command Nexus</p>
          <h1 className="text-4xl lg:text-5xl font-semibold leading-tight mt-4">
            Direct every Kansas Electric play from one cinematic control wall.
          </h1>
          <p className="text-white/80 mt-4 max-w-2xl">
            Tiles pulse live data from Field Ops, Estimating, Market Intel, and Opportunity Radar. Drag to create your
            perfect wall, launch deep links, or generate an executive briefing in seconds.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <GlowButton onClick={() => setPaletteOpen(true)}>Command Palette ⌘K</GlowButton>
            <GlowButton variant="ghost" onClick={() => setBriefingOpen(true)}>
              Generate Briefing
            </GlowButton>
          </div>
        </CinematicCard>
        <ModeToggle
          mode={mode}
          onChange={(next) => {
            setMode(next);
            localStorage.setItem('kse_mode', next);
          }}
        />
      </section>

      <TileWall
        tiles={snapshot.tiles}
        order={order}
        onOrderChange={(next) => {
          setOrder(next);
          localStorage.setItem('kse_wall_order', JSON.stringify(next));
        }}
      />

      <section className="grid lg:grid-cols-2 gap-6">
        <CinematicCard accent="#22d3ee">
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">Market & Ops Notes</p>
          <ul className="mt-4 space-y-3 text-sm text-white/90">
            {snapshot.market.notes.map((note, idx) => (
              <li key={idx} className="flex gap-2">
                <span className="text-white/40">◆</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </CinematicCard>
        <CinematicCard accent="#ec4899">
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">Commodity Alerts</p>
          <div className="mt-4 space-y-3">
            {snapshot.market.commodities.map((item) => (
              <div key={item.name} className="flex items-start gap-3">
                <div
                  className={`text-xs uppercase tracking-[0.4em] ${
                    item.status === 'surging'
                      ? 'text-rose-200'
                      : item.status === 'elevated'
                      ? 'text-amber-200'
                      : 'text-emerald-200'
                  }`}
                >
                  {item.status}
                </div>
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-white/80">{item.message}</p>
                </div>
              </div>
            ))}
            {!snapshot.market.commodities.length && (
              <p className="text-sm text-white/70">No commodity disruptions flagged.</p>
            )}
          </div>
        </CinematicCard>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <CinematicCard accent="#f97316">
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">High-Intent Accounts</p>
          <ul className="mt-4 space-y-4 text-sm text-white/90">
            {snapshot.marketing.accounts.map((acct) => (
              <li key={acct.company} className="border border-white/15 rounded-2xl p-3 bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{acct.company}</p>
                    {acct.matchedProject && (
                      <p className="text-xs text-white/70">Linked to {acct.matchedProject}</p>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-white/20">
                    Intent {acct.intentScore}%
                  </span>
                </div>
                <p className="text-xs text-white/70 mt-2">
                  {acct.visits7d} visits · last {formatRelativeTime(acct.lastVisit)} · top page {acct.topPage}
                </p>
                {acct.spi && (
                  <p className="text-xs text-white/70">
                    Project SPI <span className={acct.spi < 1 ? 'text-amber-200' : 'text-emerald-200'}>{acct.spi.toFixed(2)}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </CinematicCard>
        <CinematicCard accent="#fb923c">
          <p className="text-xs uppercase tracking-[0.5em] text-white/70">Trending Pages</p>
          <div className="mt-4 space-y-3 text-sm text-white/90">
            {snapshot.marketing.trendingPages.map((page) => (
              <div key={page.path} className="border border-white/15 rounded-2xl px-3 py-2 flex items-center justify-between">
                <span className="font-semibold">{page.path}</span>
                <span className="text-xs text-white/70">{page.views} visits</span>
              </div>
            ))}
          </div>
        </CinematicCard>
      </section>

      <CommandPalette actions={actions} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <BriefingModal
        open={briefingOpen}
        onOpenChange={setBriefingOpen}
        notes={snapshot.market.notes}
        commodities={snapshot.market.commodities}
      />
    </main>
  );
}

const fallbackMarketing = {
  accounts: [
    {
      company: 'Red Hills Utility',
      domain: 'redhillsutility.com',
      intentScore: 82,
      visits7d: 4,
      lastVisit: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      topPage: '/solutions/substation-modernization',
      tags: ['utility'],
      matchedProject: 'Red Hills Substation Upgrade',
      matchedOpportunityId: 'fallback-utility',
      spi: 0.94
    },
    {
      company: 'Prairie Data',
      domain: 'prairiedata.io',
      intentScore: 74,
      visits7d: 3,
      lastVisit: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
      topPage: '/services/mission-critical',
      tags: ['data center']
    }
  ],
  trendingPages: [
    { path: '/solutions/substation-modernization', views: 7 },
    { path: '/services/mission-critical', views: 5 }
  ]
};

const fallbackTiles: TileData[] = [
  {
    id: 'field-reports',
    title: 'Field Ops Pulse',
    category: 'Field Reports',
    summary: 'Crew hours, narration health, SPI',
    accent: '#0ea5e9',
    metrics: [
      { label: 'SPI', value: '0.98', trend: '+0.02' },
      { label: 'Crew Hours', value: '482', trend: '+6%' }
    ],
    link: '/field-reports/mobile-app/index.html'
  },
  {
    id: 'estimate-accelerator',
    title: 'Estimate Accelerator',
    category: 'Estimating',
    summary: 'Document AI, QA backlog',
    accent: '#f97316',
    metrics: [
      { label: 'Active Bids', value: '18' },
      { label: 'Doc AI Conf.', value: '92%' }
    ],
    link: '/estimate-accelerator/web/index.html'
  },
  {
    id: 'opportunity-scout',
    title: 'Opportunity Scout',
    category: 'Growth',
    summary: 'Watchlist, new bids',
    accent: '#22c55e',
    metrics: [
      { label: 'New Signals', value: '41' },
      { label: 'Hot Tags', value: 'data center' }
    ],
    link: '/opportunity-radar/web/index.html'
  },
  {
    id: 'pm-kpis',
    title: 'Project Management',
    category: 'PM',
    summary: 'Schedule, manpower',
    accent: '#a855f7',
    metrics: [
      { label: 'Projects Green', value: '12/14' },
      { label: 'Critical Alerts', value: '2' }
    ],
    link: '/project-management/react-app/index.html'
  },
  {
    id: 'command-usage',
    title: 'Nexus Telemetry',
    category: 'Usage',
    summary: 'Scans, watch runs, estimator sends',
    accent: '#a855f7',
    metrics: [
      { label: 'Scans 14d', value: '18' },
      { label: 'Estimator Sends', value: '6' }
    ],
    link: '/project-management/react-app/index.html'
  },
  {
    id: 'market-intel',
    title: 'Market Intelligence',
    category: 'Market',
    summary: 'PPI, solar capex, energy pricing',
    accent: '#38bdf8',
    metrics: [
      { label: 'Electrical PPI', value: '1.2%' },
      { label: 'PV Capex', value: '$1.34/W' }
    ],
    link: '/estimate-accelerator/web/index.html#market'
  },
  {
    id: 'marketing-pulse',
    title: 'Marketing Pulse',
    category: 'Marketing',
    summary: 'Dealfront engagement + GA intent',
    accent: '#f97316',
    metrics: [
      { label: 'Accounts 7d', value: '4' },
      { label: 'Avg Intent', value: '78%' }
    ],
    link: '/smart-contacts/react-app/index.html'
  }
];

function formatRelativeTime(isoDate: string) {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? '1 day ago' : `${diffDays}d ago`;
}

