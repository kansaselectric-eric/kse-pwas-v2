import { GlowButton } from '@kse/ui';
import type { Mode } from '../types';

type Props = {
  mode: Mode;
  onChange: (mode: Mode) => void;
};

const labels: Record<Mode, string> = {
  ops: 'Ops Mode',
  executive: 'Executive Mode'
};

export function ModeToggle({ mode, onChange }: Props) {
  const next = mode === 'ops' ? 'executive' : 'ops';
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs uppercase tracking-[0.4em] text-slate-400">{labels[mode]}</span>
      <GlowButton variant="ghost" onClick={() => onChange(next)}>
        Switch to {labels[next]}
      </GlowButton>
    </div>
  );
}

