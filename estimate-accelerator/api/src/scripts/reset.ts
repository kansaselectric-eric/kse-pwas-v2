import 'dotenv/config';
import { Client } from 'pg';
import { assertResetConfirmed, assertSafeEstaccDbUrl, getEstaccDatabaseUrl } from './dbGuard.js';
import { seed } from './seed.js';

async function main() {
  const dbUrl = getEstaccDatabaseUrl();
  assertSafeEstaccDbUrl(dbUrl);
  assertResetConfirmed();

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // Extra guard: if we detect obvious CRM tables, abort.
    const crmTableProbe = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('accounts','opportunities','activities') LIMIT 1;`
    );
    if (crmTableProbe.rowCount) {
      throw new Error('Refusing to reset: detected CRM-like tables in this database');
    }

    // Hard reset of this DB's public schema only.
    await client.query('BEGIN');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('COMMIT');

    // Re-apply migrations.
    // We run the compiled migrate script logic by importing it (it executes on import).
    await import('./migrate.js');

    // Seed minimal reference data.
    const seedClient = new Client({ connectionString: dbUrl });
    await seedClient.connect();
    try {
      await seed(seedClient);
    } finally {
      await seedClient.end();
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
