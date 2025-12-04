import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

type GenericRecord = Record<string, unknown>;

export type CrmState = {
  accounts: GenericRecord[];
  contacts: GenericRecord[];
  activities: GenericRecord[];
  movements: GenericRecord[];
  opportunities: GenericRecord[];
};

const DATA_PATH = path.resolve(process.cwd(), 'server', 'data', 'crm-state.json');

const DEFAULT_STATE: CrmState = {
  accounts: [],
  contacts: [],
  activities: [],
  movements: [],
  opportunities: []
};

let cache: CrmState | null = null;

function sanitizeState(state: Partial<CrmState> | null | undefined): CrmState {
  return {
    accounts: Array.isArray(state?.accounts) ? state!.accounts : [],
    contacts: Array.isArray(state?.contacts) ? state!.contacts : [],
    activities: Array.isArray(state?.activities) ? state!.activities : [],
    movements: Array.isArray(state?.movements) ? state!.movements : [],
    opportunities: Array.isArray(state?.opportunities) ? state!.opportunities : []
  };
}

async function ensureDataDir() {
  await fs.mkdir(path.dirname(DATA_PATH), { recursive: true });
}

async function loadState(): Promise<CrmState> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf8');
    cache = sanitizeState(JSON.parse(raw));
  } catch {
    cache = { ...DEFAULT_STATE };
    await persistState();
  }
  return cache;
}

async function persistState(next?: CrmState) {
  if (next) {
    cache = next;
  }
  if (!cache) cache = { ...DEFAULT_STATE };
  await ensureDataDir();
  await fs.writeFile(DATA_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function ensureId(record: GenericRecord, prefix: string) {
  if (!record.id) {
    record.id = `${prefix}-${randomUUID()}`;
  }
}

export async function getCrmState(): Promise<CrmState> {
  const state = await loadState();
  return clone(state);
}

export async function upsertAccount(account: GenericRecord) {
  const state = await loadState();
  const next = clone(state);
  const record = { ...account };
  ensureId(record, 'acct');
  const idx = next.accounts.findIndex((item) => item.id === record.id);
  if (idx >= 0) next.accounts[idx] = record;
  else next.accounts.push(record);
  await persistState(next);
  return record;
}

export async function upsertOpportunity(opportunity: GenericRecord) {
  const state = await loadState();
  const next = clone(state);
  const record = { ...opportunity };
  ensureId(record, 'opp');
  const idx = next.opportunities.findIndex((item) => item.id === record.id);
  if (idx >= 0) next.opportunities[idx] = record;
  else next.opportunities.push(record);
  await persistState(next);
  return record;
}

export async function recordActivity(activity: GenericRecord) {
  const state = await loadState();
  const next = clone(state);
  const record = { ...activity };
  ensureId(record, 'act');
  next.activities.push(record);
  await persistState(next);
  return record;
}

export async function recordMovement(movement: GenericRecord) {
  const state = await loadState();
  const next = clone(state);
  const record = { ...movement };
  ensureId(record, 'move');
  next.movements.push(record);
  await persistState(next);
  return record;
}

export async function upsertContact(contact: GenericRecord) {
  const state = await loadState();
  const next = clone(state);
  const record = { ...contact };
  ensureId(record, 'contact');
  const idx = next.contacts.findIndex((item) => item.id === record.id);
  if (idx >= 0) next.contacts[idx] = record;
  else next.contacts.push(record);
  await persistState(next);
  return record;
}

