import { describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

describe('migrations', () => {
  test('initial migration includes required tables', async () => {
    const sql = await readFile(path.resolve('migrations/001_init.sql'), 'utf8');
    const required = [
      'projects',
      'plan_sets',
      'plan_set_sheets',
      'takeoff_items',
      'symbol_library',
      'labor_assemblies',
      'productivity_modifiers',
      'bids',
      'actuals',
      'variance_events',
      'extraction_sessions',
      'extraction_artifacts',
      'takeoff_labor_lines',
      'takeoff_edits'
    ];
    for (const name of required) {
      expect(sql.toLowerCase()).toContain(`create table if not exists ${name}`);
    }
  });
});
