import { useEffect, useMemo, useState } from 'react';
import type { PaletteAction } from '../types';
import { GlowButton } from '@kse/ui';

type Props = {
  actions: PaletteAction[];
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ actions, open, onClose }: Props) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return actions.filter((action) => action.label.toLowerCase().includes(q) || action.description.toLowerCase().includes(q));
  }, [actions, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-slate-900/70 backdrop-blur" onClick={onClose}>
      <div
        className="max-w-2xl mx-auto mt-24 glass-panel p-4"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center gap-3 border border-white/10 rounded-2xl px-4 py-3 bg-white/5">
          <span className="text-xs uppercase tracking-[0.5em] text-slate-400">Command</span>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to tool, run automation, generate briefing…"
            className="flex-1 bg-transparent text-white outline-none"
          />
          <GlowButton variant="ghost" className="text-xs" onClick={onClose}>
            Esc
          </GlowButton>
        </div>
        <div className="mt-4 max-h-[320px] overflow-y-auto space-y-1">
          {filtered.map((action) => (
            <button
              key={action.id}
              onClick={() => {
                action.onSelect();
                onClose();
              }}
              className="w-full text-left px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 transition"
            >
              <p className="text-sm font-semibold text-white">{action.label}</p>
              <p className="text-xs text-slate-300">{action.description}</p>
            </button>
          ))}
          {!filtered.length && <p className="text-xs text-slate-400 px-4 py-3">No actions match “{query}”.</p>}
        </div>
      </div>
    </div>
  );
}

