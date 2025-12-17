import { describe, expect, test } from 'vitest';
import { computeLabor } from './labor.js';

describe('computeLabor', () => {
  test('applies multiplier modifiers in order', () => {
    const res = computeLabor({
      qty: 10,
      unit: 'ea',
      assembly: { id: 'a', assembly_code: 'GEN', description: 'x', hours_per_unit: 0.5, unit_basis: 'ea' },
      modifiers: [
        { code: 'CONG', factor: 1.2, type: 'multiplier' },
        { code: 'OFF', factor: 1.1, type: 'multiplier' }
      ]
    });
    expect(res.baseHours).toBeCloseTo(5);
    expect(res.totalHours).toBeCloseTo(5 * 1.2 * 1.1);
  });

  test('handles missing assembly', () => {
    const res = computeLabor({ qty: 10, unit: 'ea', assembly: null, modifiers: [] });
    expect(res.baseHours).toBe(0);
    expect(res.totalHours).toBe(0);
    expect(res.confidence).toBeLessThan(0.5);
  });
});
