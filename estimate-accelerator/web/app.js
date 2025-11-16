/* Estimate Accelerator (expanded)
 * - Custom per-category dictionaries with presets and persistence
 * - Annotated highlights in text
 * - CSV/JSON export and copy-to-clipboard
 * - Historical comparison (upload CSV)
 * TODO: AI NLP pipeline and glossary tuning.
 */

const analyzeBtn = document.getElementById('analyzeBtn');
const csvBtn = document.getElementById('csvBtn');
const jsonBtn = document.getElementById('jsonBtn');
const copyBtn = document.getElementById('copyBtn');
const rfpFile = document.getElementById('rfpFile');
const fileStatus = document.getElementById('fileStatus');
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

let lastResults = null;

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

function loadPreset(preset) {
  const p = PRESETS[preset] || PRESETS.general;
  dictScope.value = p.scope.join(', ');
  dictLongLead.value = p.longLead.join(', ');
  dictRisks.value = p.risks.join(', ');
  dictClarifications.value = p.clarifications.join(', ');
}

function saveDictionaries() {
  const obj = {
    preset: presetSelect.value,
    scope: parseDict(dictScope.value),
    longLead: parseDict(dictLongLead.value),
    risks: parseDict(dictRisks.value),
    clarifications: parseDict(dictClarifications.value)
  };
  localStorage.setItem('kse_ea_dict', JSON.stringify(obj));
}

function loadDictionaries() {
  const raw = localStorage.getItem('kse_ea_dict');
  if (!raw) {
    loadPreset('general');
    presetSelect.value = 'general';
    return dictionariesFromCurrent();
  }
  const obj = JSON.parse(raw);
  presetSelect.value = obj.preset || 'general';
  dictScope.value = (obj.scope || []).join(', ');
  dictLongLead.value = (obj.longLead || []).join(', ');
  dictRisks.value = (obj.risks || []).join(', ');
  dictClarifications.value = (obj.clarifications || []).join(', ');
  return obj;
}

function parseDict(text) {
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

function dictionariesFromCurrent() {
  return {
    preset: presetSelect.value,
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

  const scopeHits = dict.scope.filter(k => joined.includes(' ' + k.toLowerCase() + ' '));
  const longLead = dict.longLead.filter(k => joined.includes(' ' + k.toLowerCase() + ' '));
  const risks = dict.risks.filter(k => joined.includes(' ' + k.toLowerCase() + ' '));
  const clarifications = dict.clarifications.filter(k => joined.includes(' ' + k.toLowerCase() + ' '));

  return {
    scope: uniqueList(scopeHits),
    longLead: uniqueList(longLead),
    risks: uniqueList(risks),
    clarifications: uniqueList(clarifications)
  };
}

function renderList(el, items) {
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

function toCsv(results) {
  const headers = ['Scope','Long-Lead Items','Risks','Clarifications'];
  const row = [
    results.scope.join('; '),
    results.longLead.join('; '),
    results.risks.join('; '),
    results.clarifications.join('; ')
  ];
  return [headers, row].map(r => r.map(s => `"${String(s).replace(/"/g, '""')}"`).join(',')).join('\n');
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
  // Simple highlight: iterate lists and replace raw occurrences (case-insensitive)
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

analyzeBtn.addEventListener('click', () => {
  const text = document.getElementById('rfpText').value || '';
  const dict = dictionariesFromCurrent();
  saveDictionaries();
  // Use worker to offload analysis
  try {
    const worker = new Worker('parser-worker.js');
    worker.onmessage = (ev) => {
      const res = ev.data || {};
      lastResults = res;
      renderList(scopeList, res.scope || []);
      renderList(leadList, res.longLead || []);
      renderList(risksList, res.risks || []);
      renderList(clarificationsList, res.clarifications || []);
      annotated.innerHTML = highlightAnnotated(text, dict, res);
      csvBtn.disabled = false;
      jsonBtn.disabled = false;
      copyBtn.disabled = false;
      worker.terminate();
    };
    worker.postMessage({ text, dict });
  } catch (e) {
    // Fallback to main thread
    const res = extractItems(text, dict);
    lastResults = res;
    renderList(scopeList, res.scope);
    renderList(leadList, res.longLead);
    renderList(risksList, res.risks);
    renderList(clarificationsList, res.clarifications);
    annotated.innerHTML = highlightAnnotated(text, dict, res);
    csvBtn.disabled = false;
    jsonBtn.disabled = false;
    copyBtn.disabled = false;
  }
});

csvBtn.addEventListener('click', () => {
  if (!lastResults) return;
  const csv = toCsv(lastResults);
  download(`kse-estimate-accelerator-${Date.now()}.csv`, new Blob([csv], { type: 'text/csv' }));
});

jsonBtn.addEventListener('click', () => {
  if (!lastResults) return;
  const json = toJson(lastResults);
  download(`kse-estimate-accelerator-${Date.now()}.json`, new Blob([json], { type: 'application/json' }));
});

copyBtn.addEventListener('click', async () => {
  if (!lastResults) return;
  const text = `Scope:\n- ${lastResults.scope.join('\n- ')}\n\nLong-Lead:\n- ${lastResults.longLead.join('\n- ')}\n\nRisks:\n- ${lastResults.risks.join('\n- ')}\n\nClarifications:\n- ${lastResults.clarifications.join('\n- ')}`;
  await navigator.clipboard.writeText(text);
  copyBtn.textContent = 'Copied';
  setTimeout(() => (copyBtn.textContent = 'Copy Summary'), 1200);
});

presetSelect.addEventListener('change', () => {
  loadPreset(presetSelect.value);
});

saveDict.addEventListener('click', () => {
  saveDictionaries();
});

resetDict.addEventListener('click', () => {
  loadPreset(presetSelect.value);
});

historicalCsv.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file || !lastResults) return;
  const text = await file.text();
  const rows = text.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  const flat = rows.join(' ').toLowerCase();
  const hits = [];
  for (const term of lastResults.scope) {
    if (flat.includes(term.toLowerCase())) hits.push(term);
  }
  historicalMatches.innerHTML = '';
  if (!hits.length) {
    const li = document.createElement('li');
    li.textContent = 'No overlaps detected.';
    li.className = 'text-slate-400';
    historicalMatches.appendChild(li);
  } else {
    for (const h of hits) {
      const li = document.createElement('li');
      li.textContent = h;
      historicalMatches.appendChild(li);
    }
  }
});

// init
loadDictionaries();
if (!localStorage.getItem('kse_ea_dict')) {
  saveDictionaries();
}

// -------- File upload parsing (txt, pdf, docx) --------
if (rfpFile) {
  rfpFile.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    fileStatus.textContent = 'Reading file...';
    try {
      const text = await extractTextFromFile(f);
      document.getElementById('rfpText').value = text || '';
      fileStatus.textContent = `Loaded ${f.name} (${Math.round(f.size/1024)} KB)`;
    } catch (err) {
      console.error(err);
      fileStatus.textContent = 'Could not parse file. Supported: .txt, .pdf, .docx';
    }
  });
}

async function extractTextFromFile(file) {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (type.includes('text') || name.endsWith('.txt')) {
    return await file.text();
  }
  if (type.includes('pdf') || name.endsWith('.pdf')) {
    if (!window['pdfjsLib']) throw new Error('PDF.js not loaded');
    const arrayBuffer = await file.arrayBuffer();
    // Configure worker
    if (window['pdfjsLib'] && window['pdfjsLib'].GlobalWorkerOptions) {
      window['pdfjsLib'].GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf = await window['pdfjsLib'].getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map(it => it.str);
      text += strings.join(' ') + '\n';
    }
    return text;
  }
  if (name.endsWith('.docx')) {
    if (!window['mammoth']) throw new Error('Mammoth not loaded');
    const arrayBuffer = await file.arrayBuffer();
    const result = await window['mammoth'].extractRawText({ arrayBuffer });
    return result.value || '';
  }
  throw new Error('Unsupported file type');
}


