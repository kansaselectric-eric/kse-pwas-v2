import { describe, expect, test } from 'vitest';
import { toTsv } from './tsv.js';

describe('toTsv', () => {
  test('renders header and rows', () => {
    const tsv = toTsv([
      {
        category: 'raceway',
        item: '1" EMT',
        qty: 100,
        unit: 'lf',
        sheet: 'E1.0',
        area: 'Level 1',
        baseHours: 12.5,
        modifiers: '[{"code":"CONG","factor":1.2}]',
        totalHours: 15,
        confidence: 0.8,
        notes: 'test'
      }
    ]);
    const lines = tsv.split('\n');
    expect(lines[0]).toContain('Category');
    expect(lines[1]).toContain('raceway');
    expect(lines[1].split('\t').length).toBe(11);
  });
});
