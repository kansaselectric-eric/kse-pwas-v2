import { URL } from 'node:url';

const REQUIRED_MARKERS = ['estacc', 'estimate', 'estimate_accelerator', 'estimate-accelerator'];
const FORBIDDEN_MARKERS = ['crm', 'kse-crm', 'customer-intel'];

export function getEstaccDatabaseUrl(): string {
  const url = process.env.ESTACC_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!url) throw new Error('ESTACC_DATABASE_URL is required');
  return url;
}

export function assertSafeEstaccDbUrl(dbUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch {
    throw new Error('ESTACC_DATABASE_URL is not a valid URL');
  }

  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const full = dbUrl.toLowerCase();

  if (FORBIDDEN_MARKERS.some((m) => full.includes(m) || dbName.includes(m))) {
    throw new Error(`Refusing to run: database URL appears CRM-related (${dbName || 'unknown-db'})`);
  }

  const allowed = REQUIRED_MARKERS.some((m) => full.includes(m) || dbName.includes(m));
  if (!allowed) {
    throw new Error(
      `Refusing to run: database name must include one of ${REQUIRED_MARKERS.join(', ')} (got: ${dbName || 'unknown-db'})`
    );
  }

  // Extra protection: require explicit confirm for destructive operations.
  // (migrations are also gated via guarded runners)
}

export function assertResetConfirmed() {
  const ok = String(process.env.ESTACC_DB_RESET_CONFIRM || '').toUpperCase();
  if (ok !== 'YES') {
    throw new Error('Refusing to reset DB: set ESTACC_DB_RESET_CONFIRM=YES to proceed');
  }
}
