/* Estimate Accelerator
 * - OCR-aware ingestion pipeline (text, PDF, DOCX, images)
 * - AI-style take-off extraction via Web Worker heuristics
 * - Historical pricing intelligence from curated JSON dataset
 * - Dictionary presets with persistence plus CSV/JSON exports
 */

const analyzeBtn = document.getElementById('analyzeBtn');
const csvBtn = document.getElementById('csvBtn');
const jsonBtn = document.getElementById('jsonBtn');
const copyBtn = document.getElementById('copyBtn');
const takeoffCsvBtn = document.getElementById('takeoffCsvBtn');
const rfpFile = document.getElementById('rfpFile');
const fileStatus = document.getElementById('fileStatus');
const rfpText = document.getElementById('rfpText');
const scopeList = document.getElementById('scopeList');
const leadList = document.getElementById('leadList');
const risksList = document.getElementById('risksList');
const clarificationsList = document.getElementById('clarificationsList');
const annotated = document.getElementById('annotated');
const presetSelect = document.getElementById('presetSelect');
const dictScope = document.getElementById('dictScope');
const dictLongLead = document.getElementById('dictLongLead');
const dictRisks = document.getElementById('dictRisks');
const dictClarifications = document.getElementById('dictClarifications');
const saveDict = document.getElementById('saveDict');
const resetDict = document.getElementById('resetDict');
const historicalCsv = document.getElementById('historicalCsv');
const historicalMatches = document.getElementById('historicalMatches');
const processingModeSelect = document.getElementById('processingMode');
const ocrStatus = document.getElementById('ocrStatus');
const ocrConfidenceEl = document.getElementById('ocrConfidence');
const ocrProgressBar = document.getElementById('ocrProgressBar');
const takeoffConfidence = document.getElementById('takeoffConfidence');
const takeoffTbody = document.getElementById('takeoffTbody');
const takeoffEmpty = document.getElementById('takeoffEmpty');
const historicalInsights = document.getElementById('historicalInsights');
const historicalScore = document.getElementById('historicalScore');
const historicalLeaderboard = document.getElementById('historicalLeaderboard');

const PRESETS = {
  'general': {
    scope: ['conduit','cable','transformer','switchgear','panelboard','lighting','controls','trenching','ductbank','grounding','termination','testing','commissioning','raceway','pullbox','mcc','vfd','ats','generator','busway'],
    longLead: ['switchgear','transformer','generator','ats','mcc','vfd','panelboard'],
    risks: ['asbestos','lead-based','hazard','delay','interference','shutdown','outage','access','hazardous','permit','weather'],
    clarifications: ['owner furnished','ofci','by others','allowance','exclude','exclusion','clarification','conflict']
  },
  'substation': {
    scope: ['breaker','relay','transformer','bus','ct','pt','switchyard','ground grid','control building','relay panel','scada','mcc'],
    longLead: ['transformer','breaker','relay','control building'],
    risks: ['energized work','outage window','switching plan','permits','environmental'],
    clarifications: ['by utility','owner furnished','isolation by others']
  },
  'solar': {
    scope: ['pv module','inverter','combiner','dc collection','ac collection','transformer','tracker','scada','mpt','mvt'],
    longLead: ['inverter','transformer','tracker','switchgear'],
    risks: ['weather','supply chain','soil conditions','environmental'],
    clarifications: ['owner furnished modules','interconnect by utility']
  },
  'data-center': {
    scope: ['ups','pdu','generator','ats','busway','hot aisle','cold aisle','emcp','bms','ems','vfd'],
    longLead: ['ups','generator','ats','pdu','switchgear'],
    risks: ['live site','schedule constraints','shutdown risk','commissioning'],
    clarifications: ['by owner','furnished by others','factory witness']
  }
};

const state = {
  lastResults: null,
  takeoff: [],
  historicalDataset: [],
  processingMode: localStorage.getItem('kse_ea_processing_mode') || 'auto',
  lastOcrConfidence: null
};

init();

function init() {
  const dict = loadDictionaries();
  if (!dict) saveDictionaries();
  presetSelect.value = dict?.preset || 'general';
  if (processingModeSelect) {
    processingModeSelect.value = state.processingMode;
  }
  attachEventListeners();
  loadHistoricalDataset();
}

function attachEventListeners() {
  analyzeBtn?.addEventListener('click', handleAnalyzeClick);
  csvBtn?.addEventListener('click', () => {
    if (!state.lastResults) return;
    const csv = toCsv(state.lastResults);
    download(`kse-estimate-accelerator-${Date.now()}.csv`, new Blob([csv], { type: 'text/csv' }));
  });
  jsonBtn?.addEventListener('click', () => {
    if (!state.lastResults) return;
    const json = toJson(state.lastResults);
    download(`kse-estimate-accelerator-${Date.now()}.json`, new Blob([json], { type: 'application/json' }));
  });
  copyBtn?.addEventListener('click', async () => {
    if (!state.lastResults) return;
    const results = state.lastResults;
    const text = [
      'Scope:',
      ...results.scope.map((s) => `- ${s}`),
      '',
      'Long-Lead:',
      ...results.longLead.map((s) => `- ${s}`),
      '',
      'Risks:',
      ...results.risks.map((s) => `- ${s}`),
      '',
      'Clarifications:',
      ...results.clarifications.map((s) => `- ${s}`)
    ].join('\n');
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied';
    setTimeout(() => (copyBtn.textContent = 'Copy Summary'), 1200);
  });
  takeoffCsvBtn?.addEventListener('click', () => {
    if (!state.takeoff.length) return;
    const headers = ['Description','Quantity','Unit','Category','Complexity','Matched Terms','Price Hint'];
    const rows = state.takeoff.map((item) => [
      item.description,
      item.quantity,
      item.unit,
      item.category,
      item.complexity,
      (item.keywords || []).join('; '),
      item.priceHint || ''
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    download(`kse-takeoff-${Date.now()}.csv`, new Blob([csv], { type: 'text/csv' }));
  });
  presetSelect?.addEventListener('change', () => loadPreset(presetSelect.value));
  saveDict?.addEventListener('click', saveDictionaries);
  resetDict?.addEventListener('click', () => loadPreset(presetSelect.value));
  processingModeSelect?.addEventListener('change', () => {
    state.processingMode = processingModeSelect.value;
    localStorage.setItem('kse_ea_processing_mode', state.processingMode);
  });
  historicalCsv?.addEventListener('change', handleHistoricalCsvUpload);
  rfpFile?.addEventListener('change', handleRfpFileUpload);
}

function handleAnalyzeClick() {
  const text = (rfpText?.value || '').trim();
  if (!text) {
    alert('Please paste or upload spec content before analyzing.');
    return;
  }
  const dict = dictionariesFromCurrent();
  saveDictionaries();
  try {
    const worker = new Worker('parser-worker.js');
    worker.onmessage = (ev) => {
      worker.terminate();
      handleAnalysisResult(ev.data || {}, text, dict);
    };
    worker.onerror = () => {
      worker.terminate();
      fallbackAnalysis(text, dict);
    };
    worker.postMessage({ text, dict });
  } catch (err) {
    console.error('Worker failed, using fallback', err);
    fallbackAnalysis(text, dict);
  }
}

function handleAnalysisResult(res, sourceText, dict) {
  state.lastResults = res;
  renderList(scopeList, res.scope || []);
  renderList(leadList, res.longLead || []);
  renderList(risksList, res.risks || []);
  renderList(clarificationsList, res.clarifications || []);
  if (annotated) annotated.innerHTML = highlightAnnotated(sourceText, dict, res);
  csvBtn.disabled = jsonBtn.disabled = copyBtn.disabled = false;
  updateTakeoffUI(res.takeoff || [], res.metrics || {});
  const historicalMatches = matchHistoricalData(res.takeoff || []);
  renderHistoricalInsights(historicalMatches, res.takeoff || []);
}

function fallbackAnalysis(text, dict) {
  const res = extractItems(text, dict);
  res.takeoff = [];
  res.metrics = {};
  handleAnalysisResult(res, text, dict);
}

function renderList(el, items) {
  if (!el) return;
  el.innerHTML = '';
  if (!items.length) {
    const li = document.createElement('li');
    li.textContent = 'None detected';
    li.className = 'text-slate-400';
    el.appendChild(li);
    return;
  }
  for (const it of items) {
    const li = document.createElement('li');
    li.textContent = it;
    el.appendChild(li);
  }
}

function updateTakeoffUI(items, metrics = {}) {
  state.takeoff = items;
  if (takeoffTbody) takeoffTbody.innerHTML = '';
  if (!items.length) {
    if (takeoffEmpty) takeoffEmpty.textContent = 'Run an analysis to generate a structured take-off.';
    takeoffCsvBtn.disabled = true;
  } else {
    if (takeoffEmpty) takeoffEmpty.textContent = '';
    for (const item of items) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="py-2 pr-3 align-top">${item.description}</td>
        <td class="py-2 pr-3 text-right align-top font-semibold">${formatNumber(item.quantity)}</td>
        <td class="py-2 pr-3 align-top uppercase text-xs text-slate-500">${item.unit || 'ea'}</td>
        <td class="py-2 pr-3 align-top">${item.category || 'general'}</td>
        <td class="py-2 pr-3 align-top">${item.complexity || 'medium'}</td>
        <td class="py-2 pr-3 align-top text-xs text-slate-500">${(item.keywords || []).join(', ') || '—'}</td>
        <td class="py-2 text-right align-top font-semibold">${item.priceHint || '—'}</td>
      `;
      takeoffTbody?.appendChild(tr);
    }
    takeoffCsvBtn.disabled = false;
  }
  const confidence = metrics.takeoffConfidence ?? deriveConfidenceFallback(items.length);
  takeoffConfidence.textContent = confidence ? formatPercent(confidence) : '--';
}

function renderHistoricalInsights(matches, takeoffItems) {
  if (!historicalInsights) return;
  historicalInsights.innerHTML = '';
  if (!matches.length) {
    const li = document.createElement('li');
    li.className = 'text-slate-500';
    li.textContent = takeoffItems.length
      ? 'No historical benchmarks matched the current take-off yet.'
      : 'Run an analysis to surface historical pricing intelligence.';
    historicalInsights.appendChild(li);
    historicalScore.textContent = '--';
    return;
  }
  for (const match of matches.slice(0, 5)) {
    const li = document.createElement('li');
    const extended = match.record.avgUnitPrice && match.item.quantity
      ? `$${formatCurrency(match.record.avgUnitPrice * match.item.quantity)} est.`
      : 'n/a';
    li.innerHTML = `
      <div class="flex items-start justify-between gap-4 border border-slate-100 rounded-lg p-3">
        <div>
          <p class="font-semibold">${match.item.description}</p>
          <p class="text-xs text-slate-500">Matched ${match.record.item} • ${match.record.segments.join(', ')}</p>
          <p class="text-xs text-slate-500">Win rate ${formatPercent(match.record.winRate)}</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-semibold">$${formatCurrency(match.record.avgUnitPrice)} / ${match.record.unit}</p>
          <p class="text-xs text-slate-500">${extended}</p>
        </div>
      </div>
    `;
    historicalInsights.appendChild(li);
  }
  const coverage = takeoffItems.length ? matches.length / takeoffItems.length : 0;
  historicalScore.textContent = formatPercent(coverage);
}

function loadPreset(preset) {
  const p = PRESETS[preset] || PRESETS.general;
  dictScope.value = p.scope.join(', ');
  dictLongLead.value = p.longLead.join(', ');
  dictRisks.value = p.risks.join(', ');
  dictClarifications.value = p.clarifications.join(', ');
}

function saveDictionaries() {
  const obj = dictionariesFromCurrent();
  localStorage.setItem('kse_ea_dict', JSON.stringify(obj));
  return obj;
}

function loadDictionaries() {
  const raw = localStorage.getItem('kse_ea_dict');
  if (!raw) {
    loadPreset('general');
    presetSelect.value = 'general';
    return dictionariesFromCurrent();
  }
  try {
    const obj = JSON.parse(raw);
    presetSelect.value = obj.preset || 'general';
    dictScope.value = (obj.scope || []).join(', ');
    dictLongLead.value = (obj.longLead || []).join(', ');
    dictRisks.value = (obj.risks || []).join(', ');
    dictClarifications.value = (obj.clarifications || []).join(', ');
    return obj;
  } catch {
    loadPreset('general');
    return dictionariesFromCurrent();
  }
}

function parseDict(text) {
  return text.split(',').map((s) => s.trim()).filter(Boolean);
}

function dictionariesFromCurrent() {
  return {
    preset: presetSelect.value || 'general',
    scope: parseDict(dictScope.value),
    longLead: parseDict(dictLongLead.value),
    risks: parseDict(dictRisks.value),
    clarifications: parseDict(dictClarifications.value)
  };
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
}

function uniqueList(list) {
  return Array.from(new Set(list)).filter(Boolean);
}

function extractItems(text, dict) {
  const n = normalize(text);
  const words = n.split(/\s+/).filter(Boolean);
  const joined = ' ' + words.join(' ') + ' ';
  const pick = (arr) => arr.filter((k) => joined.includes(' ' + k.toLowerCase() + ' '));
  return {
    scope: uniqueList(pick(dict.scope)),
    longLead: uniqueList(pick(dict.longLead)),
    risks: uniqueList(pick(dict.risks)),
    clarifications: uniqueList(pick(dict.clarifications))
  };
}

function toCsv(results) {
  const headers = ['Scope','Long-Lead Items','Risks','Clarifications'];
  const row = [
    results.scope.join('; '),
    results.longLead.join('; '),
    results.risks.join('; '),
    results.clarifications.join('; ')
  ];
  return [headers, row]
    .map((r) => r.map((s) => `"${String(s).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

function toJson(results) {
  return JSON.stringify(results, null, 2);
}

function highlightAnnotated(text, dict, results) {
  let html = text;
  const wrap = (word, cls) => `<mark class="${cls}">${word}</mark>`;
  const categories = [
    { list: results.scope, cls: 'bg-amber-100' },
    { list: results.longLead, cls: 'bg-emerald-100' },
    { list: results.risks, cls: 'bg-rose-100' },
    { list: results.clarifications, cls: 'bg-sky-100' }
  ];
  for (const cat of categories) {
    for (const term of cat.list) {
      const re = new RegExp(`\\b(${escapeRegExp(term)})\\b`, 'gi');
      html = html.replace(re, (_, w) => wrap(w, cat.cls));
    }
  }
  return html.replace(/\n/g, '<br>');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  a.remove();
}

async function handleRfpFileUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  fileStatus.textContent = 'Reading file...';
  setOcrStatus('Preparing document');
  setOcrProgress(0);
  try {
    const text = await extractTextFromFile(file, state.processingMode);
    rfpText.value = text || '';
    const sizeKb = Math.round((file.size || 0) / 1024);
    fileStatus.textContent = `Loaded ${file.name} (${sizeKb} KB)`;
  } catch (err) {
    console.error(err);
    fileStatus.textContent = 'Could not parse file. Supported: .txt, .pdf, .docx, images';
  } finally {
    setOcrStatus('Idle');
    setOcrProgress(0);
  }
}

async function extractTextFromFile(file, mode = 'auto') {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const isImage = type.startsWith('image/') || /\.(png|jpg|jpeg|tif|tiff)$/i.test(name);
  if (mode === 'ocr' || isImage) {
    return await runOcr(file);
  }
  if (type.includes('text') || name.endsWith('.txt')) {
    return await file.text();
  }
  if (type.includes('pdf') || name.endsWith('.pdf')) {
    const text = await extractPdfText(file);
    if (mode === 'text') return text;
    if (text.trim().length < 120) {
      const ocrText = await ocrPdfDocument(file);
      return ocrText || text;
    }
    return text;
  }
  if (name.endsWith('.docx')) {
    if (!window.mammoth) throw new Error('Mammoth not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    return result.value || '';
  }
  if (mode !== 'text') {
    return await runOcr(file);
  }
  throw new Error('Unsupported file type');
}

async function extractPdfText(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  if (window.pdfjsLib.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => it.str);
    text += strings.join(' ') + '\n';
  }
  return text;
}

async function ocrPdfDocument(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.2 });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) {
      setOcrStatus(`OCR page ${i}/${pdf.numPages}`);
      text += '\n' + (await runOcr(blob));
    }
  }
  return text;
}

async function runOcr(fileOrBlob) {
  if (!window.Tesseract) throw new Error('Tesseract not loaded');
  const res = await window.Tesseract.recognize(fileOrBlob, 'eng', {
    logger: ({ status, progress }) => {
      if (status) setOcrStatus(status);
      if (typeof progress === 'number') setOcrProgress(progress);
    }
  });
  state.lastOcrConfidence = res?.data?.confidence || null;
  setOcrConfidence(state.lastOcrConfidence);
  setOcrProgress(1);
  return (res?.data?.text || '').trim();
}

function setOcrStatus(text) {
  if (ocrStatus) ocrStatus.textContent = text;
}

function setOcrProgress(value) {
  if (ocrProgressBar) {
    const pct = Math.min(100, Math.max(0, Number(value) * 100));
    ocrProgressBar.style.width = `${pct}%`;
  }
}

function setOcrConfidence(value) {
  if (!ocrConfidenceEl) return;
  if (!value && value !== 0) {
    ocrConfidenceEl.textContent = '--';
    return;
  }
  ocrConfidenceEl.textContent = `${Math.round(value)} OCR confidence`;
}

async function loadHistoricalDataset() {
  try {
    const res = await fetch('data/historical-bids.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch historical dataset');
    state.historicalDataset = await res.json();
    renderHistoricalLeaderboard();
  } catch (err) {
    console.warn('Historical dataset unavailable yet', err);
  }
}

function renderHistoricalLeaderboard() {
  if (!historicalLeaderboard) return;
  if (!state.historicalDataset.length) {
    historicalLeaderboard.innerHTML = '<p class="text-sm text-slate-500">Historical dataset loads when online.</p>';
    return;
  }
  const segmentMap = {};
  for (const record of state.historicalDataset) {
    for (const segment of record.segments || []) {
      if (!segmentMap[segment]) {
        segmentMap[segment] = { segment, winRateTotal: 0, items: 0, priceTotal: 0 };
      }
      segmentMap[segment].items += 1;
      segmentMap[segment].winRateTotal += record.winRate || 0;
      segmentMap[segment].priceTotal += record.avgUnitPrice || 0;
    }
  }
  const rows = Object.values(segmentMap)
    .map((row) => ({
      segment: row.segment,
      winRate: row.items ? row.winRateTotal / row.items : 0,
      avgUnitPrice: row.items ? row.priceTotal / row.items : 0,
      items: row.items
    }))
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 4);
  historicalLeaderboard.innerHTML = rows
    .map((row) => `
      <div class="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
        <div>
          <p class="font-semibold">${row.segment}</p>
          <p class="text-xs text-slate-500">${row.items} benchmark items</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-semibold">${formatPercent(row.winRate)}</p>
          <p class="text-xs text-slate-500">Avg $${formatCurrency(row.avgUnitPrice)}</p>
        </div>
      </div>
    `)
    .join('');
}

function matchHistoricalData(takeoffItems) {
  if (!state.historicalDataset.length || !takeoffItems.length) return [];
  const matches = [];
  for (const item of takeoffItems) {
    const normalized = normalize(item.description);
    let best = null;
    let bestScore = 0.2;
    for (const record of state.historicalDataset) {
      const score = computeRecordScore(normalized, record);
      if (score > bestScore) {
        bestScore = score;
        best = record;
      }
    }
    if (best) {
      const priceHint = best.avgUnitPrice && item.quantity
        ? `$${formatCurrency(best.avgUnitPrice * item.quantity)} est.`
        : best.avgUnitPrice ? `$${formatCurrency(best.avgUnitPrice)}` : '';
      matches.push({ item: { ...item, priceHint }, record: best, score: bestScore });
    }
  }
  // enrich table price hints
  state.takeoff = state.takeoff.map((item) => {
    const match = matches.find((m) => m.item.description === item.description);
    return match ? { ...item, priceHint: match.item.priceHint } : item;
  });
  if (state.lastResults) state.lastResults.takeoff = state.takeoff;
  updateTakeoffUI(state.takeoff, state.lastResults?.metrics || {});
  return matches;
}

function computeRecordScore(normalizedDesc, record) {
  const keywords = record.keywords || [];
  if (!keywords.length) return 0;
  let hits = 0;
  for (const keyword of keywords) {
    if (normalizedDesc.includes(keyword.toLowerCase())) hits += 1;
  }
  return hits ? hits / keywords.length : 0;
}

function handleHistoricalCsvUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !state.lastResults) return;
  file.text().then((text) => {
    const rows = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    const flat = rows.join(' ').toLowerCase();
    const hits = [];
    for (const term of state.lastResults.scope) {
      if (flat.includes(term.toLowerCase())) hits.push(term);
    }
    historicalMatches.innerHTML = '';
    if (!hits.length) {
      const li = document.createElement('li');
      li.textContent = 'No overlaps detected.';
      li.className = 'text-slate-400';
      historicalMatches.appendChild(li);
    } else {
      hits.forEach((h) => {
        const li = document.createElement('li');
        li.textContent = h;
        historicalMatches.appendChild(li);
      });
    }
  });
}

function formatNumber(value) {
  if (value == null || value === '') return '0';
  return Number(value).toLocaleString();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatPercent(value) {
  if (value == null || Number.isNaN(value)) return '--';
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

function deriveConfidenceFallback(totalItems) {
  if (!totalItems && state.lastOcrConfidence) {
    return Math.min(0.9, 0.4 + state.lastOcrConfidence / 200);
  }
  if (!totalItems) return null;
  const base = 0.55 + Math.min(0.35, totalItems * 0.03);
  return Math.min(0.98, base + (state.lastOcrConfidence ? state.lastOcrConfidence / 400 : 0));
}

