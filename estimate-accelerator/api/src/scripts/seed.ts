import { Client } from 'pg';

export async function seed(client: Client) {
  // Minimal labor assembly baseline
  await client.query(
    `INSERT INTO labor_assemblies (assembly_code, description, hours_per_unit, unit_basis, crew_size, jw_ratio, source)
     VALUES ('GEN-ELEC', 'Generic electrical allowance (fallback)', 0.5, 'ea', 2, 0.7, 'internal')
     ON CONFLICT (assembly_code) DO NOTHING;`
  );

  // Minimal productivity modifiers catalog
  const modifiers: Array<[string, string, number, string]> = [
    ['BASE', 'Baseline conditions', 1.0, 'multiplier'],
    ['CONGESTION_MED', 'Moderate congestion', 1.15, 'multiplier'],
    ['CONGESTION_HIGH', 'High congestion', 1.3, 'multiplier'],
    ['HEIGHT_0_12', 'Work at 0-12 ft', 1.0, 'multiplier'],
    ['HEIGHT_12_25', 'Work at 12-25 ft', 1.1, 'multiplier'],
    ['OFF_HOURS', 'Night/off-hours premium', 1.15, 'multiplier']
  ];

  for (const [code, desc, factor, type] of modifiers) {
    await client.query(
      `INSERT INTO productivity_modifiers (modifier_code, description, default_factor, factor_type)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (modifier_code) DO NOTHING;`,
      [code, desc, factor, type]
    );
  }
}
