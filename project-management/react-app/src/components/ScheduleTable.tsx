import React from 'react';

type Row = { date: string; project: string; planned: number; actual: number; variance: number; spi: number };

export function ScheduleTable({ rows }: { rows: Row[] }) {
  return (
    <section className="bg-white rounded-xl shadow p-4 md:col-span-2">
      <h2 className="text-lg font-semibold mb-2">Schedule Health</h2>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Project</th>
              <th className="py-2 pr-4">Planned %</th>
              <th className="py-2 pr-4">Actual %</th>
              <th className="py-2 pr-4">Variance %</th>
              <th className="py-2 pr-4">SPI</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(-20).map((r, idx) => {
              const spiClass = r.spi < 0.95 ? 'text-rose-600' : r.spi > 1.05 ? 'text-emerald-600' : 'text-slate-800';
              return (
                <tr key={idx}>
                  <td className="py-1 pr-4">{r.date}</td>
                  <td className="py-1 pr-4">{r.project}</td>
                  <td className="py-1 pr-4">{(r.planned * 100).toFixed(0)}%</td>
                  <td className="py-1 pr-4">{(r.actual * 100).toFixed(0)}%</td>
                  <td className="py-1 pr-4">{(r.variance * 100).toFixed(0)}%</td>
                  <td className={`py-1 pr-4 ${spiClass}`}>{r.spi.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}




