import { Pool } from 'pg';
import { env } from './env.js';
import { assertSafeEstaccDbUrl } from './scripts/dbGuard.js';

if (!env.dbUrl) {
  throw new Error('ESTACC_DATABASE_URL is required');
}
assertSafeEstaccDbUrl(env.dbUrl);

export const pool = new Pool({ connectionString: env.dbUrl });
