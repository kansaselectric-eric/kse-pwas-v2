import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

type GenericRecord = Record<string, unknown>;

export type CrmState = {
  accounts: GenericRecord[];
  contacts: GenericRecord[];
  activities: GenericRecord[];
  movements: GenericRecord[];
  opportunities: GenericRecord[];
};

const prisma = new PrismaClient();

function ensureId(record: GenericRecord, prefix: string) {
  if (!record.id) {
    record.id = `${prefix}-${randomUUID()}`;
  }
}

export async function getCrmState(): Promise<CrmState> {
  const [accounts, contacts, activities, movements, opportunities] = await Promise.all([
    prisma.account.findMany(),
    prisma.contact.findMany(),
    prisma.activity.findMany(),
    prisma.movement.findMany(),
    prisma.opportunity.findMany()
  ]);
  return {
    accounts,
    contacts,
    activities,
    movements,
    opportunities
  };
}

export async function upsertAccount(account: GenericRecord) {
  const record = pickAccount(account);
  ensureId(record, 'acct');
  await prisma.account.upsert({
    where: { id: record.id as string },
    update: record,
    create: record
  });
  return record;
}

export async function upsertOpportunity(opportunity: GenericRecord) {
  const record = pickOpportunity(opportunity);
  ensureId(record, 'opp');
  await prisma.opportunity.upsert({
    where: { id: record.id as string },
    update: record,
    create: record
  });
  return record;
}

export async function recordActivity(activity: GenericRecord) {
  const record = pickActivity(activity);
  ensureId(record, 'act');
  await prisma.activity.upsert({
    where: { id: record.id as string },
    update: record,
    create: record
  });
  return record;
}

export async function recordMovement(movement: GenericRecord) {
  const record = pickMovement(movement);
  ensureId(record, 'move');
  await prisma.movement.upsert({
    where: { id: record.id as string },
    update: record,
    create: record
  });
  return record;
}

export async function upsertContact(contact: GenericRecord) {
  const record = pickContact(contact);
  ensureId(record, 'contact');
  await prisma.contact.upsert({
    where: { id: record.id as string },
    update: record,
    create: record
  });
  return record;
}

const ACCOUNT_FIELDS = [
  'id',
  'userId',
  'name',
  'industry',
  'city',
  'state',
  'annualPotential',
  'projectedValue',
  'entrenchment',
  'stage',
  'relationshipHealth',
  'nextStep',
  'notes',
  'lastContact',
  'createdAt',
  'updatedAt',
  'stalled',
  'ownerId',
  'ownerName',
  'ownerEmail',
  'createdById',
  'createdByName',
  'updatedById',
  'updatedByName',
  'score'
] as const;

const CONTACT_FIELDS = [
  'id',
  'userId',
  'accountId',
  'name',
  'email',
  'phone',
  'role',
  'segment',
  'location',
  'influence',
  'createdAt',
  'updatedAt'
] as const;

const ACTIVITY_FIELDS = [
  'id',
  'userId',
  'userName',
  'accountId',
  'contactId',
  'type',
  'channel',
  'subject',
  'notes',
  'tags',
  'nextFollowUp',
  'outcome',
  'sentimentScore',
  'duration',
  'date',
  'files',
  'aiConfidence'
] as const;

const MOVEMENT_FIELDS = [
  'id',
  'userId',
  'userName',
  'accountId',
  'opportunityId',
  'context',
  'oldStage',
  'newStage',
  'movementType',
  'notes',
  'date'
] as const;

const OPPORTUNITY_FIELDS = [
  'id',
  'userId',
  'accountId',
  'type',
  'description',
  'value',
  'status',
  'stage',
  'createdAt',
  'updatedAt',
  'projectName',
  'ecdStageKey',
  'ecdStageLabel',
  'bidStatus',
  'bidDueDate',
  'budgetaryOnly',
  'assignedEstimator',
  'gcList',
  'projectAddress',
  'projectCity',
  'projectState',
  'projectLat',
  'projectLng',
  'projectLocationAccuracy',
  'lastStageChange'
] as const;

function pick<T extends readonly string[]>(record: GenericRecord, fields: T) {
  const next: GenericRecord = {};
  fields.forEach((field) => {
    if (record[field] !== undefined) {
      next[field] = record[field];
    }
  });
  return next;
}

function pickAccount(record: GenericRecord) {
  return pick(record, ACCOUNT_FIELDS);
}

function pickContact(record: GenericRecord) {
  return pick(record, CONTACT_FIELDS);
}

function pickActivity(record: GenericRecord) {
  const next = pick(record, ACTIVITY_FIELDS);
  if (Array.isArray(next.tags)) next.tags = next.tags;
  if (Array.isArray(next.files)) next.files = next.files;
  return next;
}

function pickMovement(record: GenericRecord) {
  return pick(record, MOVEMENT_FIELDS);
}

function pickOpportunity(record: GenericRecord) {
  const next = pick(record, OPPORTUNITY_FIELDS);
  if (Array.isArray(next.gcList)) next.gcList = next.gcList;
  return next;
}

