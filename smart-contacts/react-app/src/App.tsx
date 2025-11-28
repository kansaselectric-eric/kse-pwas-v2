import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Card } from '@kse/ui';

type Contact = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  title?: string;
  tags?: string[];
};

type SortKey = 'name' | 'company' | 'title';
type Mode = 'ops' | 'executive';

export default function App() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'ops';
    return (localStorage.getItem('kse_mode') as Mode) || 'ops';
  });

  const filtered = useMemo(() => {
    let list = contacts.slice();
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(c => {
        const hay = [c.name, c.company, c.email, c.phone, c.title, ...(c.tags || [])].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    if (tag) {
      const t = tag.toLowerCase();
      list = list.filter(c => (c.tags || []).some(x => String(x).toLowerCase().includes(t)));
    }
    const sortKey: SortKey = sort;
    list.sort((a, b) => {
      const left = String(a[sortKey] || '');
      const right = String(b[sortKey] || '');
      return left.localeCompare(right);
    });
    return list;
  }, [contacts, query, tag, sort]);

  const uniqueCompanies = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => {
      if (c.company) set.add(c.company);
    });
    return set.size;
  }, [contacts]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then(t => {
      const data = JSON.parse(t);
      if (!Array.isArray(data)) throw new Error('JSON must be an array');
      setContacts(data);
      localStorage.setItem('kse_contacts_cache', JSON.stringify(data));
    }).catch(err => alert('Invalid JSON: ' + err.message));
  }

  function exportCsv() {
    const headers = ['name','company','email','phone','title','tags'];
    const rows = filtered.map(c => [c.name||'', c.company||'', c.email||'', c.phone||'', c.title||'', (c.tags||[]).join('|')]);
    const csv = [headers, ...rows].map(r => r.map(s => `"${String(s).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kse-contacts-${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove();
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kse-contacts-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove();
  }

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.mode = mode;
    localStorage.setItem('kse_mode', mode);
  }, [mode]);

  React.useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('kse_contacts_cache') || '[]');
      if (Array.isArray(cached)) setContacts(cached);
    } catch (err) {
      console.warn('Failed to load cached contacts', err);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-5xl mx-auto space-y-5">
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
        <header className="hero-gradient space-y-4 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/70">Kansas Electric · Relationship Graph</p>
              <h1 className="text-3xl font-semibold mt-2">Smart Contacts</h1>
              <p className="text-sm text-white/80 max-w-2xl">
                Load any contact dataset, slice it instantly, and feed the hottest targets straight into Opportunity Scout or the Command Nexus wall.
              </p>
            </div>
            <div className="text-right text-xs text-white/80">
              <p>Total contacts: {contacts.length}</p>
              <p>Filtered view: {filtered.length}</p>
              <p>Unique companies: {uniqueCompanies}</p>
            </div>
          </div>
        </header>
        <main className="grid gap-4">
          <Card title="Controls">
            <div className="flex flex-wrap gap-3 items-center">
              <input type="file" accept="application/json" onChange={onFile} className="text-sm" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, company, tag, email, phone..." className="rounded-lg border-slate-300 focus:border-sky-500 focus:ring-sky-500 text-sm px-3 py-2 flex-1 min-w-[180px]" />
              <input value={tag} onChange={e => setTag(e.target.value)} placeholder="Filter tag..." className="rounded-lg border-slate-300 focus:border-sky-500 focus:ring-sky-500 text-sm px-3 py-2" />
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} className="rounded border-slate-300 text-sm px-2 py-2">
                <option value="name">Sort: Name</option>
                <option value="company">Sort: Company</option>
                <option value="title">Sort: Title</option>
              </select>
              <button onClick={exportCsv} className="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm">Export CSV</button>
              <button onClick={exportJson} className="px-3 py-1.5 rounded bg-slate-800 text-white text-sm">Export JSON</button>
            </div>
          </Card>
          <Card title={`Results (${filtered.length})`}>
            <ul className="divide-y divide-slate-200">
              {filtered.map((c, i) => (
                <li key={i} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="font-medium">{c.name || '(no name)'}</div>
                    <div className="text-sm text-slate-600">{c.title || ''}{c.title && c.company ? ' · ' : ''}{c.company || ''}</div>
                    <div className="text-sm text-slate-600">{c.email || ''}{c.email && c.phone ? ' · ' : ''}{c.phone || ''}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(c.tags || []).map((t, j) => <Badge key={j}>{t}</Badge>)}
                  </div>
                </li>
              ))}
              {!filtered.length && (
                <li className="py-6 text-center text-sm text-slate-500">No contacts match the current filters.</li>
              )}
            </ul>
          </Card>
        </main>
      </div>
    </div>
  );
}




