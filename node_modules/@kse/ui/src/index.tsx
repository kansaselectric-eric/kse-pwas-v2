import React from 'react';

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="inline-block text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5">{children}</span>;
}

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl shadow p-4">
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}




