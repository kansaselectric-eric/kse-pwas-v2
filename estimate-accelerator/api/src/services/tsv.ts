export type TakeoffExportRow = {
  category: string;
  item: string;
  qty: number;
  unit: string;
  sheet?: string | null;
  area?: string | null;
  baseHours: number;
  modifiers: string;
  totalHours: number;
  confidence: number;
  notes?: string | null;
};

export function toTsv(rows: TakeoffExportRow[]) {
  const header = [
    'Category',
    'Item',
    'Qty',
    'Unit',
    'Sheet',
    'Area',
    'BaseHours',
    'Modifiers',
    'TotalHours',
    'Confidence',
    'Notes'
  ];
  const lines = [header.join('\t')];
  for (const r of rows) {
    const line = [
      r.category ?? '',
      r.item ?? '',
      String(r.qty ?? ''),
      r.unit ?? '',
      r.sheet ?? '',
      r.area ?? '',
      String(round(r.baseHours)),
      r.modifiers ?? '',
      String(round(r.totalHours)),
      String(round(r.confidence, 3)),
      (r.notes ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ')
    ];
    lines.push(line.join('\t'));
  }
  return lines.join('\n');
}

function round(n: number, digits = 2) {
  const p = Math.pow(10, digits);
  return Math.round((Number(n) || 0) * p) / p;
}
