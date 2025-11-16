import React from 'react';
import { Card } from '@kse/ui';

export function BreakdownTables({ division, project }: { division: Array<{ division: string; total: number }>; project: Array<{ project: string; total: number }> }) {
  return (
    <>
      <Card title="Manpower by Division (14 days)">
        <table className="min-w-full text-sm">
          <thead className="text-left text-slate-500"><tr><th className="py-2 pr-4">Division</th><th className="py-2 pr-4">Total</th></tr></thead>
          <tbody>
            {division.map((d, idx) => (
              <tr key={idx}><td className="py-1 pr-4">{d.division}</td><td className="py-1 pr-4 font-medium">{d.total}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Manpower by Project (14 days)">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500"><tr><th className="py-2 pr-4">Project</th><th className="py-2 pr-4">Total</th></tr></thead>
            <tbody>
              {project.map((p, idx) => (
                <tr key={idx}><td className="py-1 pr-4">{p.project}</td><td className="py-1 pr-4 font-medium">{p.total}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}



