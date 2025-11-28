import React, { useMemo } from 'react';
import { motionTokens, useParallaxHover } from './motion';

type BadgeProps = {
  children: React.ReactNode;
  tone?: 'primary' | 'secondary' | 'neutral';
};

const badgeToneMap: Record<NonNullable<BadgeProps['tone']>, string> = {
  primary: 'bg-sky-50 text-sky-700 border-sky-200',
  secondary: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-300'
};

export function Badge({ children, tone = 'primary' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] tracking-wide border rounded-full px-2 py-0.5 font-semibold ${badgeToneMap[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white/80 backdrop-blur rounded-2xl shadow-[0_20px_45px_rgba(15,23,42,.08)] p-4 border border-white/60">
      <h2 className="text-sm uppercase tracking-[0.3em] text-slate-500 font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

type CinematicCardProps = {
  accent?: string;
  children: React.ReactNode;
  className?: string;
};

export function CinematicCard({ accent = '#0ea5e9', children, className = '' }: CinematicCardProps) {
  const ref = useParallaxHover(18);
  const accentStyle = useMemo(
    () => ({
      backgroundImage: `linear-gradient(135deg, ${accent} 0%, rgba(14,165,233,0.35) 70%)`
    }),
    [accent]
  );
  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-3xl border border-white/15 bg-slate-900/80 text-white shadow-[0_25px_55px_rgba(15,23,42,.35)] p-6 transition-transform duration-200 ${className}`}
      style={{ willChange: 'transform' }}
    >
      <div className="absolute inset-0 opacity-40" style={accentStyle} />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

type GlowButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost';
  className?: string;
};

export function GlowButton({ children, onClick, variant = 'primary', className = '' }: GlowButtonProps) {
  const base =
    variant === 'primary'
      ? 'bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 text-white shadow-[0_15px_35px_rgba(59,130,246,.4)] hover:shadow-[0_25px_45px_rgba(99,102,241,.35)]'
      : 'bg-white/10 text-white border border-white/20 backdrop-blur hover:bg-white/20';
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-200 ${base} ${className}`}
      style={{ transitionTimingFunction: motionTokens.easings.standard }}
    >
      {children}
    </button>
  );
}

export { motionTokens, useParallaxHover, useAutoReveal } from './motion';
