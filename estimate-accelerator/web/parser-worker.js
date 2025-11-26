self.onmessage = (event) => {
  const { text = '', dict = {} } = event.data || {};
  const { joined } = tokenize(text);
  const pick = (arr) => Array.from(new Set((arr || []).filter((k) => joined.includes(` ${String(k).toLowerCase()} `))));
  const scope = pick(dict.scope);
  const longLead = pick(dict.longLead);
  const risks = pick(dict.risks);
  const clarifications = pick(dict.clarifications);
  const takeoff = buildTakeoff(text, dict);
  const metrics = computeMetrics(scope, takeoff, risks);
  self.postMessage({ scope, longLead, risks, clarifications, takeoff, metrics });
};

const CATEGORY_KEYWORDS = {
  distribution: ['switchgear', 'panel', 'panelboard', 'mcc', 'busway', 'pdu', 'ups'],
  raceway: ['conduit', 'ductbank', 'tray', 'raceway', 'pullbox'],
  lighting: ['lighting', 'fixture', 'strip', 'aisle'],
  controls: ['controls', 'bms', 'ems', 'scada', 'relay'],
  power: ['transformer', 'generator', 'feeder', 'breaker', 'gear'],
  safety: ['fire alarm', 'fire alarm riser', 'notification', 'initiating'],
  civil: ['trenching', 'manhole', 'vault', 'pad', 'pier']
};

const COMPLEXITY_RULES = [
  { key: 'prefab', value: 'low' },
  { key: 'retrofit', value: 'high' },
  { key: 'mission critical', value: 'high' },
  { key: 'temporary', value: 'medium' }
];

const UNIT_NORMALIZATION = {
  lf: ['lf', 'lf.', 'ft', 'feet'],
  sf: ['sf', 'sf.'],
  ea: ['ea', 'each', 'unit'],
  set: ['set', 'sets'],
  pair: ['pair', 'pairs'],
  lot: ['lot'],
  hr: ['hr', 'hrs', 'hour', 'hours'],
  day: ['day', 'days'],
  panel: ['panel', 'panels'],
  circuit: ['circuit', 'circuits'],
  fixture: ['fixture', 'fixtures'],
  floor: ['floor', 'floors'],
  zone: ['zone', 'zones']
};

function tokenize(text) {
  const normalized = (text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  return { normalized, words, joined: ` ${words.join(' ')} ` };
}

function buildTakeoff(raw, dict = {}) {
  const lines = (raw || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const items = [];
  for (const line of lines) {
    const qtyMatch = line.match(/(?:^|\s)(?:qty|quantity|q\/ty|q:|#)?\s*(\d{1,6}(?:\.\d{1,2})?)/i);
    if (!qtyMatch) continue;
    const quantity = Number(qtyMatch[1]);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const unitMatch = line.match(/\b(lf|lf\.|sf|sf\.|ea|each|unit|set|sets|pair|pairs|lot|hr|hrs|hour|hours|day|days|ft|feet|panel|panels|circuit|circuits|fixture|fixtures|floor|floors|zone|zones)\b/i);
    const unit = normalizeUnit(unitMatch?.[1]);
    const description = cleanupDescription(line, qtyMatch[0], unitMatch?.[0]);
    if (!description || description.length < 3) continue;
    const category = categorizeDescription(description, dict);
    const keywords = matchKeywords(description, dict);
    const complexity = computeComplexity(description);
    const priorityScore = computePriority(quantity, keywords.length, complexity);
    items.push({
      id: `item-${items.length + 1}`,
      description,
      quantity,
      unit,
      category,
      keywords,
      complexity,
      priorityScore
    });
  }
  return consolidateItems(items);
}

function cleanupDescription(line, qtySlice, unitSlice) {
  let desc = line;
  if (qtySlice) desc = desc.replace(qtySlice, ' ');
  if (unitSlice) desc = desc.replace(unitSlice, ' ');
  return desc.replace(/[-•:*]/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeUnit(unitRaw = '') {
  const lower = unitRaw.toLowerCase();
  for (const [unit, aliases] of Object.entries(UNIT_NORMALIZATION)) {
    if (aliases.includes(lower)) return unit;
  }
  return 'ea';
}

function categorizeDescription(description, dict = {}) {
  const lower = description.toLowerCase();
  for (const [category, tokens] of Object.entries(CATEGORY_KEYWORDS)) {
    if (tokens.some((token) => lower.includes(token))) return category;
  }
  if ((dict.scope || []).some((term) => lower.includes(term.toLowerCase()))) return 'scope';
  if ((dict.longLead || []).some((term) => lower.includes(term.toLowerCase()))) return 'long-lead';
  return 'general';
}

function matchKeywords(description, dict = {}) {
  const lower = description.toLowerCase();
  const pools = [dict.scope || [], dict.longLead || [], dict.risks || [], dict.clarifications || []];
  const set = new Set();
  for (const pool of pools) {
    for (const term of pool) {
      if (lower.includes(term.toLowerCase())) set.add(term);
    }
  }
  return Array.from(set);
}

function computeComplexity(description) {
  const lower = description.toLowerCase();
  for (const rule of COMPLEXITY_RULES) {
    if (lower.includes(rule.key)) return rule.value;
  }
  if (lower.includes('retrofit') || lower.includes('shutdown')) return 'high';
  if (lower.includes('kit') || lower.includes('prefab')) return 'low';
  return 'medium';
}

function computePriority(quantity, keywordCount, complexity) {
  const complexityMultiplier = complexity === 'high' ? 1.4 : complexity === 'low' ? 0.8 : 1;
  return Math.round(Math.min(100, quantity * complexityMultiplier + keywordCount * 5));
}

function consolidateItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.description.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!map.has(key)) {
      map.set(key, { ...item });
    } else {
      const existing = map.get(key);
      existing.quantity += item.quantity;
      existing.keywords = Array.from(new Set([...(existing.keywords || []), ...(item.keywords || [])]));
      existing.priorityScore = Math.max(existing.priorityScore, item.priorityScore);
      map.set(key, existing);
    }
  }
  return Array.from(map.values()).slice(0, 60);
}

function computeMetrics(scope, takeoff, risks) {
  const coverage = scope.length ? Math.min(1, takeoff.length / scope.length) : Math.min(1, takeoff.length / 8);
  const riskLoad = takeoff.length ? Math.min(1, risks.length / (takeoff.length || 1)) : 0;
  const takeoffConfidence = Math.min(0.98, 0.45 + coverage * 0.4 + (takeoff.length ? Math.min(0.15, takeoff.length * 0.01) : 0));
  return {
    scopeCoverage: Number(coverage.toFixed(2)),
    riskLoad: Number(riskLoad.toFixed(2)),
    takeoffConfidence: Number(takeoffConfidence.toFixed(2))
  };
}
