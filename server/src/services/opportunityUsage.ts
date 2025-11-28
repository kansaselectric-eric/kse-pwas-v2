import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

type UsageEvent = {
  id: string;
  action: string;
  timestamp: string;
  payload?: Record<string, unknown>;
};

type TimelineEntry = {
  date: string;
  total: number;
  [action: string]: number | string;
};

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const DATA_FILE = path.join(DATA_DIR, 'opportunity-usage.json');

let events: UsageEvent[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;

loadFromDisk();

export function recordOpportunityUsage(action: string, payload: Record<string, unknown> = {}) {
  const event: UsageEvent = {
    id: randomUUID(),
    action,
    timestamp: new Date().toISOString(),
    payload
  };
  events.push(event);
  if (events.length > 10000) {
    events = events.slice(-5000);
  }
  scheduleSave();
  return event;
}

export function getOpportunityUsageReport(days = 14) {
  const windowMs = days * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const recent = events.filter((event) => new Date(event.timestamp).getTime() >= cutoff);
  const countsByAction = recent.reduce<Record<string, number>>((acc, event) => {
    acc[event.action] = (acc[event.action] || 0) + 1;
    return acc;
  }, {});

  const timelineMap = new Map<string, TimelineEntry>();
  recent.forEach((event) => {
    const dateKey = event.timestamp.slice(0, 10);
    const entry = timelineMap.get(dateKey) || { date: dateKey, total: 0 };
    entry.total += 1;
    entry[event.action] = (typeof entry[event.action] === 'number' ? (entry[event.action] as number) : 0) + 1;
    timelineMap.set(dateKey, entry);
  });

  const timeline = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  const latestEvents = [...events].slice(-20).reverse();

  return {
    totalEvents: events.length,
    windowEvents: recent.length,
    countsByAction,
    timeline,
    latestEvents,
    updatedAt: new Date().toISOString(),
    metrics: {
      scans: countsByAction.scan ?? 0,
      watchRuns: countsByAction.watch_run ?? 0,
      exports: countsByAction.export_csv ?? 0,
      estimatorSends: countsByAction.send_estimator ?? 0
    }
  };
}

function loadFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, '[]', 'utf8');
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      events = parsed as UsageEvent[];
    }
  } catch (error) {
    console.warn('Unable to load opportunity usage log', error);
    events = [];
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2), 'utf8');
    } catch (error) {
      console.warn('Unable to persist opportunity usage log', error);
    } finally {
      saveTimer = null;
    }
  }, 1000);
}

