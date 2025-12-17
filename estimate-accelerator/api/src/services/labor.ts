export type LaborAssembly = {
  id: string;
  assembly_code: string;
  description: string;
  hours_per_unit: number;
  unit_basis: string;
};

export type Modifier = {
  code: string;
  factor: number;
  type: 'multiplier' | 'additive';
  description?: string;
};

export function computeLabor(args: {
  qty: number;
  unit: string;
  assembly: LaborAssembly | null;
  modifiers: Modifier[];
}) {
  const qty = Number(args.qty || 0);
  const baseHours = args.assembly ? qty * Number(args.assembly.hours_per_unit) : 0;

  let total = baseHours;
  const breakdown: Array<{ code: string; type: string; factor: number; deltaHours: number }> = [];

  for (const mod of args.modifiers || []) {
    if (mod.type === 'additive') {
      const delta = Number(mod.factor || 0);
      total += delta;
      breakdown.push({ code: mod.code, type: 'additive', factor: delta, deltaHours: delta });
    } else {
      const factor = Number(mod.factor || 1);
      const before = total;
      total = total * factor;
      breakdown.push({ code: mod.code, type: 'multiplier', factor, deltaHours: total - before });
    }
  }

  return {
    baseHours,
    totalHours: total,
    breakdown,
    confidence: args.assembly ? 0.75 : 0.35
  };
}
