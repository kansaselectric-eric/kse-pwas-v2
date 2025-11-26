import React, { useMemo } from 'react';
import { Card } from '@kse/ui';

export function Heatmap({ dates, rows }: { dates: string[]; rows: Array<{ project: string; cells: number[] }> }) {
  const max = useMemo(() => {
    let m = 0;
    rows.forEach(r => r.cells.forEach(v => { if (v > m) m = v; }));
    return m || 1;
  }, [rows]);

  function cellStyle(val: number) {
    const p = Math.min(1, val / max);
    const alpha = 0.15 + 0.6 * p;
    return { backgroundColor: `rgba(14,165,233,${alpha})` };
  }

  return (
    <Card title="Project Manpower Heatmap">
      <div className="overflow-auto">
        <table className="text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1 pr-2">Project</th>
              {dates.map((d, i) => <th key={i} className="py-1 px-2">{d.slice(5)}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td className="py-1 pr-2">{r.project}</td>
                {r.cells.map((v, j) => (
                  <td key={j} className="py-1 px-2 text-center" style={cellStyle(v)}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}




