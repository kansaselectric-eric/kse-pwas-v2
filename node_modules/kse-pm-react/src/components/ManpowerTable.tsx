import React from 'react';

type Row = { date: string; foreman: number; journeyman: number; apprentices: number; total: number };

export function ManpowerTable({ rows }: { rows: Row[] }) {
  return (
    <section className="bg-white rounded-xl shadow p-4 md:col-span-2">
      <h2 className="text-lg font-semibold mb-2">Manpower Forecast (14 days)</h2>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Foremen</th>
              <th className="py-2 pr-4">Journeymen</th>
              <th className="py-2 pr-4">Apprentices</th>
              <th className="py-2 pr-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td className="py-1 pr-4">{r.date}</td>
                <td className="py-1 pr-4">{r.foreman}</td>
                <td className="py-1 pr-4">{r.journeyman}</td>
                <td className="py-1 pr-4">{r.apprentices}</td>
                <td className="py-1 pr-4 font-medium">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}




