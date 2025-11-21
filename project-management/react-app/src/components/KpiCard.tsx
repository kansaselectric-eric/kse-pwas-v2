import React from 'react';

export function KpiCard(props: { title: string; items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <section className="bg-white rounded-xl shadow p-4">
      <h2 className="text-lg font-semibold mb-2">{props.title}</h2>
      <ul className="text-sm">
        {props.items.map((it, idx) => (
          <li key={idx} className="flex items-center justify-between gap-3 py-0.5">
            <span className="text-slate-600">{it.label}</span>
            <span className="font-medium">{it.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}




