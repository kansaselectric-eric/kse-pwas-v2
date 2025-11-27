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
const takeoffPdfBtn = document.getElementById('takeoffPdfBtn');
const rfpFile = document.getElementById('rfpFile');
const fileStatus = document.getElementById('fileStatus');
const fileInsightPanel = document.getElementById('fileInsightPanel');
const fileInsightMeta = document.getElementById('fileInsightMeta');
const fileInsightList = document.getElementById('fileInsightList');
const fileWarnings = document.getElementById('fileWarnings');
const pagePreviewPanel = document.getElementById('pagePreviewPanel');
const pagePreviewSelect = document.getElementById('pagePreviewSelect');
const pagePreviewBody = document.getElementById('pagePreviewBody');
const dictSuggestionsPanel = document.getElementById('dictSuggestionsPanel');
const dictSuggestionsList = document.getElementById('dictSuggestionsList');
const refreshSuggestions = document.getElementById('refreshSuggestions');
const fileManifestList = document.getElementById('fileManifestList');
const fileManifestEmpty = document.getElementById('fileManifestEmpty');
const fileManifestSummary = document.getElementById('fileManifestSummary');
const marketPpiValue = document.getElementById('marketPpiValue');
const marketPpiMeta = document.getElementById('marketPpiMeta');
const marketSolarValue = document.getElementById('marketSolarValue');
const marketSolarMeta = document.getElementById('marketSolarMeta');
const marketEnergyValue = document.getElementById('marketEnergyValue');
const marketEnergyMeta = document.getElementById('marketEnergyMeta');
const marketInterconnectionValue = document.getElementById('marketInterconnectionValue');
const marketInterconnectionMeta = document.getElementById('marketInterconnectionMeta');
const marketNotes = document.getElementById('marketNotes');
const marketCommodityPanel = document.getElementById('marketCommodityPanel');
const marketCommodityList = document.getElementById('marketCommodityList');
const marketCommodityEmpty = document.getElementById('marketCommodityEmpty');
const marketCommodityTimestamp = document.getElementById('marketCommodityTimestamp');
const marketRecPanel = document.getElementById('marketRecPanel');
const marketRecommendations = document.getElementById('marketRecommendations');
const marketRecommendationsEmpty = document.getElementById('marketRecommendationsEmpty');
const marketRecTimestamp = document.getElementById('marketRecTimestamp');
const marketRefreshBtn = document.getElementById('marketRefresh');
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
const qaHighCount = document.getElementById('qaHighCount');
const qaMediumCount = document.getElementById('qaMediumCount');
const qaReviewCount = document.getElementById('qaReviewCount');
const qaReviewTotal = document.getElementById('qaReviewTotal');
const qaIssueList = document.getElementById('qaIssueList');
const qaIssueEmpty = document.getElementById('qaIssueEmpty');
const qaCopyIssues = document.getElementById('qaCopyIssues');
const itemInspectorEmpty = document.getElementById('itemInspectorEmpty');
const itemInspectorFields = document.getElementById('itemInspectorFields');
const itemInspectorSource = document.getElementById('itemInspectorSource');
const inspectorDescription = document.getElementById('inspectorDescription');
const inspectorNotes = document.getElementById('inspectorNotes');
const inspectorQuantity = document.getElementById('inspectorQuantity');
const inspectorUnit = document.getElementById('inspectorUnit');
const inspectorCategory = document.getElementById('inspectorCategory');
const inspectorSave = document.getElementById('inspectorSave');
const inspectorAccept = document.getElementById('inspectorAccept');
const feedbackLogEl = document.getElementById('feedbackLog');
const historicalGaps = document.getElementById('historicalGaps');

const CLOUD_OCR_ENDPOINT = '/api/ocr/documentai';
const historicalInsights = document.getElementById('historicalInsights');
const historicalScore = document.getElementById('historicalScore');
const historicalLeaderboard = document.getElementById('historicalLeaderboard');
const opportunityBanner = document.getElementById('opportunityBanner');
const opportunityTitleEl = document.getElementById('opportunityTitle');
const opportunitySummaryEl = document.getElementById('opportunitySummary');
const opportunityLinkEl = document.getElementById('opportunityLink');
const opportunityDismiss = document.getElementById('opportunityDismiss');

const PRESETS = {
  general: {
    scope: [
      'conduit','cable','transformer','switchgear','panelboard','lighting','controls','trenching','ductbank','grounding','termination','testing','commissioning','raceway','pullbox','mcc','vfd','ats','generator','busway',
      'feeder','mc cable','tray','wireway','breaker','disconnect','ups','pdu','riser','gear lineup','branch circuit','cord drop','floor box','fa system','bms interface','pv combiner','dc homerun','ev charger','genset tank',
      'seismic brace','bonding jumper','earthing grid','surge protective device','cts','pts','yard lighting','bollard','temp power','tooling circuit','safety lighting','overhead rack','backbone cabling','fiber run','camera drop',
      'security device','access control','data cabinet','rack pdu','imbalance relay','load bank','battery cabinet','bus plug','bus duct tap','chiller feed','boiler feed','heat trace','snow melt','site lighting','parking canopy feed',
      'breaker','relay','transformer','bus','ct','pt','switchyard','ground grid','control building','relay panel','scada','mcc','disconnect switch','wave trap','coupling capacitor','station service','battery rack',
      'neutral reactor','line trap','oil containment','sf6 breaker','ring bus','transfer bus','switch structure','dead end structure','control cable','fiber patch','yard lighting','security fence','helical pier','equipment pad',
      'tap box','metering cabinet','iso-phase bus','surge arrester','line insulator','shield wire','cable trench','duct run','control house hvac','prefab panel','pv module','inverter','combiner','dc collection','ac collection',
      'tracker','string harness','fuse holder','racking pier','battery container','ems panel','weather station','recombiner','mv splice','ground ring','fence grounding','aux panel','lighting arrestor','meteorological mast','data cabinet',
      'dc disconnect','skid assembly','battery hv cabling','fire suppression tie-in','ups','pdu','generator','ats','hot aisle','cold aisle','emcp','rack pdu','starline bus','overhead tray','in-row cooler','battery string','static switch',
      'structured cabling','fiber backbone','security cabling','lighting control','access control','temp power','commissioning support','load bank','crac unit feed','chiller feed','pump feed','prefab skid','raised floor grounding',
      'bonding bar','dc plant','telecom ladder','smoke control','white space lighting','generator belly tank','fuel polish pump','heat trace','roof penetration','containment door power','control cabling','prefab rack drop','tts cabinet',
      'iot device','ems gateway','branch panel','battery monitoring','prefab control house','temp lighting','prefab raceway rack','prefab conductor','prefab cart','splicing vault','ductbank riser','sleeve bank','raceway support',
      'steel support','hanger','conduit stub','multicell duct','handhole','manhole'
    ],
    longLead: [
      'switchgear','transformer','generator','ats','mcc','vfd','panelboard','ups','pdu','busway','prefab skid','paralleling gear','emergency breaker','custom enclosure','arc flash relay','protective relay','control house',
      'medium voltage cable','dry type transformer','prefab rack','utility meter','surge suppressor','fa panel','bms controller','prefab ductbank','gear section','main breaker','meter center','double-ended substation',
      'breaker','relay','iso-phase bus','battery system','line trap','ccvt','neutral reactor','ring bus steel','sf6 gas','switch structure','line disconnect','bus support','prefab control house','inverter','tracker','battery container',
      'ems hardware','scada cabinet','switch station','pole-mounted disconnect','prefab inverter building','load bank','static switch','hv transformer','prefab conduit rack','fuel polish skid'
    ],
    risks: [
      'asbestos','lead-based','hazard','delay','interference','shutdown','outage','access','hazardous','permit','weather','constrained logistics','active facility','infectious control','night work','high bay access',
      'confined space','storm season','union jurisdiction','material escalation','supply chain','long import lead','owner furnished delays','utility coordination','soil contamination','underground unknowns','structural conflict',
      'ceiling congestion','late design','incomplete bim','security clearance','noise restriction','limited staging','hot work permit','phasing constraint','budget freeze','labor shortage','road closure','holiday moratorium',
      'energized work','outage window','switching plan','environmental','utility witness','storm coordination','soil resistivity unknown','crane access','state inspection','wildlife restrictions','corrosion allowance',
      'grid stability study','relay settings late','utility hold point','long outage lead','limited laydown','copper theft','hazmat disposal','blasting nearby','wind constraints','wildlife mitigation','dust storms',
      'tracker alignment','module damage','thermal derate','commissioning witness','security breach','wash water access','grade tolerance','wind uplift','flood plain','dust suppression','seasonal manpower','live site',
      'shutdown risk','tier certification','coincident outage','parallel workfronts','raised floor restrictions','smoke control interface','shipping delays','rack layout changes','owner furnished long lead','fuel system hazard',
      'sound limits','change freeze windows'
    ],
    clarifications: [
      'owner furnished','ofci','by others','allowance','exclude','exclusion','clarification','conflict','temp power by gc','controls by vendor','test by factory','commissioning by third party','patch/paint by trades',
      'sleeves by others','core drilling by electrician','fire caulk by electrician','access panels by others','boom lifts by owner','after-hours premium excluded','utility fees by owner','permits by gc','engineering by owner',
      'structural supports by others','seismic calcs by engineer','prefab rack shop drawings included','bim level 300 only','training included','closeout manuals included','onsite storage limited','weather delays excluded',
      'all outages by owner','relay settings by utility','test equipment by owner','sf6 handling by specialist','oil haul off by owner','civil permits by gc','geotech by owner','witness testing included','commissioning support included',
      'as-built relay files provided','fiber splicing by owner','iso-phase alignment by mfgr','battery system by vendor','dc testing by mfgr','tracker commissioning by vendor','stormwater controls by others','wash water by owner',
      'security cameras by owner','hv testing witnessed','spare parts included','tracker spares included','string level labeling included','cleaning by others','rack install by owner','containment by others','bms graphics by vendor',
      'controls by mfgr','factory testing included','level 5 commissioning assist included','temp cooling by owner','fuel tank by owner','fire alarm tie-in included','smoke control programming by owner','ceiling grid by gc','ladder racks by owner'
    ]
  },
  substation: {
    scope: [
      'breaker','relay','transformer','bus','ct','pt','switchyard','ground grid','control building','relay panel','scada','mcc','disconnect switch','wave trap','coupling capacitor','station service','battery rack',
      'neutral reactor','line trap','oil containment','sf6 breaker','ring bus','transfer bus','switch structure','dead end structure','control cable','fiber patch','yard lighting','security fence','helical pier','equipment pad',
      'tap box','metering cabinet','iso-phase bus','surge arrester','line insulator','shield wire','cable trench','duct run','control house hvac','prefab panel'
    ],
    longLead: [
      'transformer','breaker','relay','control building','iso-phase bus','battery system','line trap','ccvt','neutral reactor','ring bus steel','sf6 gas','switch structure','line disconnect','bus support','prefab control house'
    ],
    risks: [
      'energized work','outage window','switching plan','environmental','utility witness','storm coordination','soil resistivity unknown','crane access','state inspection','wildlife restrictions','corrosion allowance',
      'grid stability study','relay settings late','utility hold point','long outage lead','limited laydown','copper theft','hazmat disposal','blasting nearby','wind constraints'
    ],
    clarifications: [
      'by utility','owner furnished','isolation by others','all outages by owner','relay settings by utility','test equipment by owner','sf6 handling by specialist','oil haul off by owner','civil permits by gc',
      'geotech by owner','witness testing included','commissioning support included','as-built relay files provided','fiber splicing by owner','iso-phase alignment by mfgr'
    ]
  },
  solar: {
    scope: [
      'pv module','inverter','combiner','dc collection','ac collection','transformer','tracker','scada','mpt','mvt','string harness','fuse holder','racking pier','ht switch','station service','battery container','ems panel',
      'dc homerun','trenching','fiber run','weather station','soiling wash station','recombiner','mv splice','ground ring','fence grounding','mcc','aux panel','lighting arrestor','rtu','meteorological mast','data cabinet',
      'pv cable','dc disconnect','skid assembly','battery hv cabling','fire suppression tie-in'
    ],
    longLead: [
      'inverter','transformer','tracker','switchgear','battery container','ems hardware','prefab skid','mv cable','scada cabinet','mcc','switch station','pole-mounted disconnect','prefab inverter building'
    ],
    risks: [
      'weather','supply chain','soil conditions','environmental','wildlife mitigation','dust storms','permit delays','utility queue','tracker alignment','module damage','thermal derate','owner furnished delay',
      'commissioning witness','security breach','wash water access','grade tolerance','wind uplift','flood plain','dust suppression','seasonal manpower'
    ],
    clarifications: [
      'owner furnished modules','interconnect by utility','battery system by vendor','dc testing by mfgr','tracker commissioning by vendor','civil pads by gc','stormwater controls by others','wash water by owner',
      'security cameras by owner','hv testing witnessed','spare parts included','tracker spares included','string level labeling included'
    ]
  },
  'data-center': {
    scope: [
      'ups','pdu','generator','ats','busway','hot aisle','cold aisle','emcp','bms','ems','vfd','rack pdu','branch circuit','starline bus','overhead tray','in-row cooler','battery string','static switch','tie breaker',
      'fa system','clean agent','structured cabling','fiber backbone','security cabling','lighting control','access control','smart paf','temp power','commissioning support','load bank','crac unit feed','chiller feed',
      'pump feed','prefab skid','raised floor grounding','bonding bar','dc plant','telecom ladder','smoke control','white space lighting','generator belly tank','fuel polish pump','heat trace','roof penetration',
      'containment door power','control cabling','prefab rack drop','tts cabinet','iot device','ems gateway','branch panel','battery monitoring'
    ],
    longLead: [
      'ups','generator','ats','pdu','switchgear','busway','load bank','battery cabinet','prefab skid','static switch','hv transformer','prefab conduit rack','fuel polish skid','monitoring system','crac unit feed bus'
    ],
    risks: [
      'live site','schedule constraints','shutdown risk','commissioning','owner witness','tier certification','security clearance','coincident outage','parallel workfronts','ceiling congestion','raised floor restrictions',
      'smoke control interface','white space cleanliness','shipping delays','rack layout changes','late rack elevation','owner furnished long lead','fuel system hazard','sound limits','night work','change freeze windows'
    ],
    clarifications: [
      'by owner','furnished by others','factory witness','cleaning by others','rack install by owner','containment by others','bms graphics by vendor','controls by mfgr','factory testing included','Level 5 commissioning assist included',
      'temp cooling by owner','fuel tank by owner','fire alarm tie-in included','smoke control programming by owner','ceiling grid by gc','ladder racks by owner'
    ]
  }
};

const state = {
  lastResults: null,
  takeoff: [],
  historicalDataset: [],
  processingMode: localStorage.getItem('kse_ea_processing_mode') || 'auto',
  lastOcrConfidence: null,
  fileSummary: null,
  fileQueue: [],
  intakeSegments: [],
  dictSuggestions: [],
  selectedTakeoffId: null,
  feedbackLog: [],
  marketInsights: null
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
  renderFeedbackLog();
  loadMarketInsights(false);
  prefillOpportunityContext();
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
    const headers = ['Description','Quantity','Unit','Category','Complexity','Matched Terms','Confidence','Source','Price Hint'];
    const rows = state.takeoff.map((item) => [
      item.description,
      item.quantity,
      item.unit,
      item.category,
      item.complexity,
      (item.keywords || []).join('; '),
      `${item.qualityGrade || 'Medium'}${item.qualityScore != null ? ` ${(item.qualityScore * 100).toFixed(0)}%` : ''}`,
      item.sourceFile ? `${item.sourceFile}${item.sourcePage ? ` p.${item.sourcePage}` : ''}` : '',
      item.priceHint || ''
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    download(`kse-takeoff-${Date.now()}.csv`, new Blob([csv], { type: 'text/csv' }));
  });
  takeoffPdfBtn?.addEventListener('click', exportTakeoffPdf);
  presetSelect?.addEventListener('change', () => loadPreset(presetSelect.value));
  saveDict?.addEventListener('click', saveDictionaries);
  resetDict?.addEventListener('click', () => loadPreset(presetSelect.value));
  processingModeSelect?.addEventListener('change', () => {
    state.processingMode = processingModeSelect.value;
    localStorage.setItem('kse_ea_processing_mode', state.processingMode);
    if (state.fileSummary) {
      state.fileSummary.mode = state.processingMode;
      renderFileSummary();
    }
  });
  historicalCsv?.addEventListener('change', handleHistoricalCsvUpload);
  rfpFile?.addEventListener('change', handleFileInput);
  dictSuggestionsList?.addEventListener('click', (event) => {
    const btn = event.target.closest('.suggest-add');
    if (!btn) return;
    const term = btn.getAttribute('data-term');
    const target = btn.getAttribute('data-target');
    addSuggestionToDictionary(target, term);
  });
  refreshSuggestions?.addEventListener('click', () => generateDictionarySuggestions());
  qaCopyIssues?.addEventListener('click', copyQaIssues);
  inspectorSave?.addEventListener('click', handleInspectorSave);
  inspectorAccept?.addEventListener('click', handleInspectorAccept);
  marketRefreshBtn?.addEventListener('click', () => loadMarketInsights(true));
  opportunityDismiss?.addEventListener('click', clearOpportunityBanner);
}

function prefillOpportunityContext() {
  if (!opportunityBanner) return;
  const params = new URLSearchParams(window.location.search);
  const hasForward = ['rfpTitle', 'rfpSummary', 'rfpUrl', 'rfpDue', 'rfpLocation'].some((key) => params.get(key));
  if (!hasForward) return;
  const title = params.get('rfpTitle') || 'Forwarded opportunity';
  const summary = params.get('rfpSummary') || '';
  const url = params.get('rfpUrl') || '';
  const dueRaw = params.get('rfpDue') || '';
  const location = params.get('rfpLocation') || '';
  const dueLabel =
    dueRaw && !Number.isNaN(Date.parse(dueRaw)) ? new Date(dueRaw).toLocaleDateString() : dueRaw;

  const header = [
    `Forwarded opportunity: ${title}`,
    location ? `Location: ${location}` : '',
    dueLabel ? `Due: ${dueLabel}` : '',
    url ? `Source: ${url}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  const note = [header, summary].filter(Boolean).join('\n\n');
  if (rfpText) {
    const existing = rfpText.value?.trim();
    rfpText.value = existing ? `${note}\n\n${existing}` : note;
  }
  opportunityBanner.classList.remove('hidden');
  if (opportunityTitleEl) opportunityTitleEl.textContent = title;
  if (opportunitySummaryEl) {
    opportunitySummaryEl.textContent = summary || 'Summary forwarded from Opportunity Scout.';
  }
  if (opportunityLinkEl) {
    if (url) {
      opportunityLinkEl.href = url;
      opportunityLinkEl.classList.remove('hidden');
    } else {
      opportunityLinkEl.href = '#';
      opportunityLinkEl.classList.add('hidden');
    }
  }
  history.replaceState({}, document.title, window.location.pathname);
}

function clearOpportunityBanner() {
  opportunityBanner?.classList.add('hidden');
  if (opportunityLinkEl) opportunityLinkEl.href = '#';
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
  const displayText = stripInternalMarkers(sourceText);
  if (annotated) annotated.innerHTML = highlightAnnotated(displayText, dict, res);
  csvBtn.disabled = jsonBtn.disabled = copyBtn.disabled = false;
  updateTakeoffUI(res.takeoff || [], res.metrics || {});
  state.selectedTakeoffId = null;
  renderItemInspector();
  state.feedbackLog = [];
  renderFeedbackLog();
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
    if (takeoffPdfBtn) takeoffPdfBtn.disabled = true;
    renderQaSummary(items);
  } else {
    if (takeoffEmpty) takeoffEmpty.textContent = '';
    for (const item of items) {
      const tr = document.createElement('tr');
      const isSelected = state.selectedTakeoffId === item.id;
      tr.dataset.itemId = item.id;
      tr.className = isSelected ? 'bg-sky-50' : '';
      const sourceLabel = formatSourceLabel(item);
      const sourceButton = item.sourceFile
        ? `<button type="button" class="takeoff-source text-xs text-sky-600 underline" data-file="${encodeURIComponent(
            item.sourceFile
          )}" data-page="${item.sourcePage || ''}">${escapeHtml(sourceLabel)}</button>`
        : '—';
      tr.innerHTML = `
        <td class="py-2 pr-3 align-top">${item.description}</td>
        <td class="py-2 pr-3 text-right align-top font-semibold">${formatNumber(item.quantity)}</td>
        <td class="py-2 pr-3 align-top uppercase text-xs text-slate-500">${item.unit || 'ea'}</td>
        <td class="py-2 pr-3 align-top">${item.category || 'general'}</td>
        <td class="py-2 pr-3 align-top">${item.complexity || 'medium'}</td>
        <td class="py-2 pr-3 align-top text-xs text-slate-500">${(item.keywords || []).join(', ') || '—'}</td>
        <td class="py-2 pr-3 align-top">${qualityBadgeMarkup(item)}</td>
        <td class="py-2 pr-3 align-top">${sourceButton}</td>
        <td class="py-2 text-right align-top font-semibold">${item.priceHint || '—'}</td>
      `;
      takeoffTbody?.appendChild(tr);
    }
    takeoffCsvBtn.disabled = false;
    if (takeoffPdfBtn) takeoffPdfBtn.disabled = false;
    renderQaSummary(items);
    setupTakeoffInteractions();
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
  renderHistoricalGaps(matches, takeoffItems);
}

function renderHistoricalGaps(matches, takeoffItems) {
  if (!historicalGaps) return;
  if (!takeoffItems || !takeoffItems.length) {
    historicalGaps.innerHTML = '<li class="text-slate-500">Run an analysis to surface unmatched items.</li>';
    return;
  }
  const matched = new Set(matches.map((m) => m.item.description));
  const unmatched = (takeoffItems || []).filter((item) => !matched.has(item.description));
  if (!unmatched.length) {
    historicalGaps.innerHTML = '<li class="text-slate-500">All items are covered by historical benchmarks.</li>';
    return;
  }
  historicalGaps.innerHTML = unmatched
    .slice(0, 8)
    .map(
      (item) =>
        `<li>${escapeHtml(item.description)}${
          item.sourceFile ? `<span class="text-xs text-slate-400"> (${escapeHtml(item.sourceFile)}${item.sourcePage ? ` p.${item.sourcePage}` : ''})</span>` : ''
        }</li>`
    )
    .join('');
}

function setupTakeoffInteractions() {
  if (!takeoffTbody) return;
  takeoffTbody.querySelectorAll('.takeoff-source').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const file = decodeURIComponent(btn.getAttribute('data-file') || '');
      const page = Number(btn.getAttribute('data-page') || '1');
      focusSource(file, page);
    });
  });
  takeoffTbody.querySelectorAll('tr').forEach((row) => {
    row.addEventListener('click', (event) => {
      if (event.target.closest('.takeoff-source')) return;
      const id = row.getAttribute('data-item-id');
      selectTakeoffItem(id);
    });
  });
}

function qualityBadgeMarkup(item) {
  const grade = item.qualityGrade || 'Medium';
  const scoreText = item.qualityScore != null ? ` ${(item.qualityScore * 100).toFixed(0)}%` : '';
  const palette =
    grade === 'High'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
      : grade === 'Review'
      ? 'bg-amber-50 text-amber-700 border border-amber-100'
      : 'bg-sky-50 text-sky-700 border border-sky-100';
  return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${palette}">${escapeHtml(
    grade
  )}${scoreText}</span>`;
}

function renderQaSummary(items) {
  if (!qaHighCount || !qaMediumCount || !qaReviewCount) return;
  const totals = { High: 0, Medium: 0, Review: 0 };
  const flagged = collectFlaggedItemsList(items);
  for (const item of items) {
    const grade = item.qualityGrade || 'Medium';
    if (totals[grade] == null) totals[grade] = 0;
    totals[grade] += 1;
  }
  qaHighCount.textContent = totals.High ?? 0;
  qaMediumCount.textContent = totals.Medium ?? 0;
  qaReviewCount.textContent = totals.Review ?? 0;
  if (qaReviewTotal) qaReviewTotal.textContent = totals.Review ?? 0;
  if (!flagged.length) {
    if (qaIssueList) qaIssueList.innerHTML = '';
    if (qaIssueEmpty) {
      qaIssueEmpty.classList.remove('hidden');
      qaIssueEmpty.textContent = 'No issues detected. This take-off looks clean.';
    }
    return;
  }
  if (qaIssueList) {
    qaIssueList.innerHTML = flagged
      .slice(0, 6)
      .map((item) => {
        const issuesText = item.issues && item.issues.length ? item.issues.join('; ') : 'Needs review';
        return `<li><span class="font-semibold text-slate-800">${escapeHtml(item.description)}</span> — ${escapeHtml(issuesText)}</li>`;
      })
      .join('');
  }
  if (qaIssueEmpty) {
    qaIssueEmpty.classList.add('hidden');
  }
}

async function copyQaIssues() {
  if (!navigator.clipboard) return;
  const flagged = collectFlaggedItems();
  if (!flagged.length) return;
  const text = flagged
    .map((item) => `• ${item.description} (${item.qualityGrade || 'Review'}) - ${item.issues?.join('; ') || 'Needs review'}`)
    .join('\n');
  try {
    await navigator.clipboard.writeText(text);
    qaCopyIssues.textContent = 'Copied';
    setTimeout(() => (qaCopyIssues.textContent = 'Copy Issue List'), 1500);
  } catch {
    // ignore copy errors
  }
}

function collectFlaggedItems() {
  return collectFlaggedItemsList(state.takeoff);
}

function collectFlaggedItemsList(list) {
  return list.filter((item) => {
    if (item.qualityGrade === 'Review') return true;
    return item.issues && item.issues.length;
  });
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

async function handleFileInput(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  resetFileIntake();
  state.fileQueue = files.map((file, index) => createFileSummary(file, index));
  renderManifest();
  setActiveSummary(state.fileQueue[0] || null);
  fileStatus.textContent = `Preparing ${files.length} file${files.length === 1 ? '' : 's'}...`;
  for (const summary of state.fileQueue) {
    await ingestSingleFile(summary.file, summary);
    renderManifest();
  }
  const completed = state.fileQueue.filter((summary) => summary.status === 'Complete').length;
  fileStatus.textContent = `Loaded ${completed}/${state.fileQueue.length} files`;
  generateDictionarySuggestions();
}

function resetFileIntake() {
  state.fileQueue = [];
  state.fileSummary = null;
  state.intakeSegments = [];
  if (fileManifestList) fileManifestList.innerHTML = '';
  if (fileManifestSummary) fileManifestSummary.textContent = '0 files';
  if (fileManifestEmpty) fileManifestEmpty.classList.remove('hidden');
  if (fileInsightPanel) fileInsightPanel.classList.add('hidden');
  if (fileInsightList) fileInsightList.innerHTML = '';
  if (fileWarnings) {
    fileWarnings.textContent = '';
    fileWarnings.classList.add('hidden');
  }
  rfpText.value = '';
}

function createFileSummary(file, order) {
  const summary = {
    id: `${Date.now()}-${order}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    name: file.name || `File ${order + 1}`,
    size: Number(file.size || 0),
    typeLabel: detectFileKind(file),
    isImage: isImageFile(file),
    mode: state.processingMode,
    pipeline: 'Pending',
    warnings: [],
    steps: [],
    status: 'Pending',
    updatedAt: Date.now()
  };
  if (summary.size > 25 * 1024 * 1024) {
    summary.warnings.push('Large file (>25 MB). OCR may take longer.');
  }
  if (summary.isImage && state.processingMode === 'text') {
    summary.warnings.push('Text-first mode selected; consider Auto/OCR for drawings.');
  }
  return summary;
}

function renderManifest() {
  if (!fileManifestList) return;
  if (!state.fileQueue.length) {
    fileManifestList.innerHTML = '';
    if (fileManifestEmpty) fileManifestEmpty.classList.remove('hidden');
    if (fileManifestSummary) fileManifestSummary.textContent = '0 files';
    return;
  }
  if (fileManifestEmpty) fileManifestEmpty.classList.add('hidden');
  if (fileManifestSummary) fileManifestSummary.textContent = `${state.fileQueue.length} file${state.fileQueue.length === 1 ? '' : 's'}`;
  fileManifestList.innerHTML = state.fileQueue
    .map((summary) => {
      const badge = manifestStatusBadge(summary.status);
      const active = state.fileSummary && state.fileSummary.id === summary.id ? 'ring-1 ring-sky-400 bg-sky-50/50' : '';
      return `
        <li data-file-id="${summary.id}" class="flex items-center justify-between gap-3 rounded-lg px-3 py-2 border border-slate-200 hover:border-sky-300 cursor-pointer ${active}">
          <div>
            <p class="font-semibold">${escapeHtml(summary.name)}</p>
            <p class="text-xs text-slate-500">${summary.typeLabel || 'Unknown'} • ${formatBytes(summary.size)}${summary.pages ? ` • ${summary.pages}p` : ''}</p>
          </div>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${badge.class}">${badge.label}</span>
        </li>
      `;
    })
    .join('');
  fileManifestList.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => {
      const summary = state.fileQueue.find((item) => item.id === li.dataset.fileId);
      if (summary) {
        setActiveSummary(summary);
        renderManifest();
      }
    });
  });
}

function manifestStatusBadge(status) {
  switch (status) {
    case 'Processing':
      return { label: 'Processing', class: 'bg-sky-100 text-sky-800' };
    case 'Complete':
      return { label: 'Complete', class: 'bg-emerald-100 text-emerald-800' };
    case 'Error':
      return { label: 'Error', class: 'bg-rose-100 text-rose-700' };
    default:
      return { label: 'Pending', class: 'bg-slate-100 text-slate-700' };
  }
}

function setActiveSummary(summary) {
  state.fileSummary = summary || null;
  renderFileSummary();
  renderPagePreview(summary || null);
}

async function ingestSingleFile(file, summary) {
  setActiveSummary(summary);
  summary.status = 'Processing';
  updateFileStep('Intake', 'Preparing', summary);
  fileStatus.textContent = `Reading ${summary.name}...`;
  setOcrStatus('Preparing document');
  setOcrProgress(0);
  try {
    updateFileStep('Text extraction', 'Detecting file type', summary);
    const docAi = await requestDocumentAi(file, summary);
    summary.pageTexts = docAi.pageTexts || [];
    summary.pages = docAi.pages || summary.pageTexts.length || null;
    appendFileText(summary, docAi.text || '', summary.pageTexts);
    summary.status = 'Complete';
    updateFileStep('Text extraction', 'Completed', summary);
    updateFileSummary({ characterCount: (docAi.text || '').length, pages: docAi.pages || null }, summary);
  } catch (err) {
    summary.status = 'Error';
    console.error(`Failed to ingest ${summary.name}`, err);
    fileStatus.textContent = 'Could not parse one of the files. Check diagnostics.';
    updateFileStep('Text extraction', 'Failed', summary);
    noteFileWarning(err?.message || 'Unable to parse this file.', summary);
  } finally {
    setOcrStatus('Idle');
    setOcrProgress(0);
  }
}

function appendFileText(summary, text, pageTexts = []) {
  const header = `---\nSource: ${summary.name}\n`;
  let body = (text || '').trim();
  if (Array.isArray(pageTexts) && pageTexts.length) {
    body = pageTexts
      .map((pageText, idx) => {
        const marker = `[[PAGE:${encodeURIComponent(summary.name)}:${idx + 1}]]`;
        const trimmed = (pageText || '').trim();
        if (trimmed) state.intakeSegments.push(trimmed);
        return trimmed ? `${marker}\n${trimmed}` : marker;
      })
      .join('\n');
  } else if (body) {
    state.intakeSegments.push(body);
  }
  if (!body) return;
  rfpText.value = `${rfpText.value ? rfpText.value + '\n\n' : ''}${header}${body}`;
}



async function requestDocumentAi(file, summary = state.fileSummary) {
  const sizeMb = Number(file.size || 0) / (1024 * 1024);
  if (sizeMb > 20) {
    noteFileWarning('File exceeds 20 MB; Google Document AI may reject it.', summary);
  }
  setFilePipeline('Uploading to Document AI', summary);
  setOcrStatus('Uploading to Google Document AI…');
  setOcrProgress(0.15);
  const base64 = await fileToBase64(file);
  setFilePipeline('Processing via Document AI', summary);
  setOcrStatus('Processing with Google Document AI…');
  setOcrProgress(0.35);
  const res = await fetch(CLOUD_OCR_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileBase64: base64,
      mimeType: file.type || 'application/pdf'
    })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const message = data?.error || `Document AI failed (status ${res.status})`;
    throw new Error(message);
  }
  setOcrProgress(0.9);
  state.lastOcrConfidence = data.confidence ?? null;
  updateFileSummary({ ocrConfidence: data.confidence ?? null, pages: data.pages ?? null }, summary);
  setFilePipeline('Document AI completed', summary);
  setOcrStatus('Google Document AI completed.');
  setOcrProgress(1);
  return {
    text: data.text || '',
    pages: data.pages || 0,
    confidence: data.confidence ?? null,
    pageTexts: Array.isArray(data.pageTexts) ? data.pageTexts : []
  };
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64);
      } else {
        resolve('');
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateFileSummary(patch = {}, summary = state.fileSummary) {
  if (!summary) return;
  Object.assign(summary, patch);
  summary.updatedAt = Date.now();
  if (summary === state.fileSummary) {
    renderFileSummary();
  }
}

function setFilePipeline(label, summary = state.fileSummary) {
  if (!summary || !label) return;
  updateFileSummary({ pipeline: label }, summary);
}

function noteFileWarning(message, summary = state.fileSummary) {
  if (!summary || !message) return;
  const warnings = summary.warnings || (summary.warnings = []);
  if (!warnings.includes(message)) {
    warnings.push(message);
    if (summary === state.fileSummary) {
      renderFileSummary();
    }
  }
}

function updateFileStep(label, status, summary = state.fileSummary) {
  if (!summary || !label) return;
  const steps = summary.steps || (summary.steps = []);
  const existing = steps.find((step) => step.label === label);
  if (existing) {
    existing.status = status;
  } else {
    steps.push({ label, status });
  }
  if (summary === state.fileSummary) {
    renderFileSummary();
  }
}

function renderFileSummary() {
  if (!fileInsightPanel || !fileInsightList || !fileInsightMeta) return;
  const summary = state.fileSummary;
  if (!summary) {
    fileInsightPanel.classList.add('hidden');
    fileInsightMeta.textContent = '';
    fileInsightList.innerHTML = '';
    if (fileWarnings) {
      fileWarnings.textContent = '';
      fileWarnings.classList.add('hidden');
    }
    return;
  }
  fileInsightPanel.classList.remove('hidden');
  const metaBits = [];
  if (summary.size) metaBits.push(formatBytes(summary.size));
  if (summary.updatedAt) metaBits.push(new Date(summary.updatedAt).toLocaleTimeString());
  fileInsightMeta.textContent = metaBits.join(' • ');
  const rows = [
    { label: 'File', value: summary.name },
    { label: 'Detected', value: summary.typeLabel || 'Unknown' },
    { label: 'Mode', value: modeLabel(summary.mode) },
    { label: 'Pipeline', value: summary.pipeline || 'Pending' },
    { label: 'Status', value: summary.status || 'Pending' }
  ];
  if (summary.characterCount) {
    rows.push({ label: 'Characters', value: summary.characterCount.toLocaleString() });
  }
  if (summary.pages != null) {
    rows.push({ label: 'Pages', value: summary.pages });
  }
  if (summary.ocrConfidence != null) {
    rows.push({ label: 'OCR confidence', value: `${Math.round(summary.ocrConfidence)}%` });
  }
  (summary.steps || []).forEach((step) => {
    rows.push({ label: step.label, value: step.status });
  });
  fileInsightList.innerHTML = rows
    .map(({ label, value }) => `<li><span class="text-slate-500">${escapeHtml(label)}:</span> ${escapeHtml(String(value ?? ''))}</li>`)
    .join('');
  if (fileWarnings) {
    if (summary.warnings && summary.warnings.length) {
      fileWarnings.textContent = summary.warnings.join(' ');
      fileWarnings.classList.remove('hidden');
    } else {
      fileWarnings.textContent = '';
      fileWarnings.classList.add('hidden');
    }
  }
}

function renderPagePreview(summary) {
  if (!pagePreviewPanel || !pagePreviewBody || !pagePreviewSelect) return;
  if (!summary || !Array.isArray(summary.pageTexts) || !summary.pageTexts.length) {
    pagePreviewPanel.classList.add('hidden');
    pagePreviewBody.textContent = '';
    pagePreviewSelect.innerHTML = '';
    return;
  }
  pagePreviewPanel.classList.remove('hidden');
  pagePreviewSelect.innerHTML = summary.pageTexts
    .map((_, idx) => `<option value="${idx}">${summary.name} — Page ${idx + 1}</option>`)
    .join('');
  pagePreviewSelect.onchange = () => {
    const pageIdx = Number(pagePreviewSelect.value) || 0;
    updatePagePreviewBody(summary, pageIdx);
  };
  pagePreviewSelect.value = '0';
  updatePagePreviewBody(summary, 0);
}

function updatePagePreviewBody(summary, pageIdx) {
  if (!pagePreviewBody) return;
  const text = summary?.pageTexts?.[pageIdx] || '';
  pagePreviewBody.textContent = text.trim() || '(No text extracted for this page)';
}

function detectFileKind(file) {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'PDF';
  if (name.endsWith('.docx') || type.includes('word')) return 'DOCX';
  if (type.includes('text') || name.endsWith('.txt')) return 'Text';
  if (isImageFile(file)) return 'Image';
  if (name.endsWith('.csv')) return 'CSV';
  return type ? type.toUpperCase() : 'Unknown';
}

function isImageFile(file) {
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return type.startsWith('image/') || /\.(png|jpg|jpeg|tif|tiff)$/i.test(name);
}

function modeLabel(mode) {
  switch (mode) {
    case 'text':
      return 'Text-first';
    case 'ocr':
      return 'OCR only';
    default:
      return 'Auto (text + OCR fallback)';
  }
}

function generateDictionarySuggestions() {
  if (!dictSuggestionsPanel || !dictSuggestionsList) return;
  const dict = dictionariesFromCurrent();
  const existing = new Set([...dict.scope, ...dict.longLead, ...dict.risks, ...dict.clarifications].map((t) => t.toLowerCase()));
  const text = state.intakeSegments.join('\n').toLowerCase();
  if (!text.trim()) {
    state.dictSuggestions = [];
    renderDictionarySuggestions();
    return;
  }
  const tokens = text.match(/[a-z]{5,}/g) || [];
  const counts = tokens.reduce((acc, token) => {
    if (!existing.has(token)) acc[token] = (acc[token] || 0) + 1;
    return acc;
  }, {});
  state.dictSuggestions = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term, count]) => ({ term, count }));
  renderDictionarySuggestions();
}

function renderDictionarySuggestions() {
  if (!dictSuggestionsPanel || !dictSuggestionsList) return;
  if (!state.dictSuggestions.length) {
    dictSuggestionsPanel.classList.add('hidden');
    dictSuggestionsList.innerHTML = '<li class="text-slate-500">Upload files to surface AI suggestions.</li>';
    return;
  }
  dictSuggestionsPanel.classList.remove('hidden');
  dictSuggestionsList.innerHTML = state.dictSuggestions
    .map(
      ({ term, count }) => `
        <li class="flex items-center justify-between gap-2">
          <span>${term} <span class="text-slate-400 text-xs">(${count})</span></span>
          <div class="flex gap-1">
            <button class="suggest-add text-xs px-2 py-0.5 rounded bg-slate-200" data-target="scope" data-term="${term}">Scope</button>
            <button class="suggest-add text-xs px-2 py-0.5 rounded bg-slate-200" data-target="longLead" data-term="${term}">Long-lead</button>
            <button class="suggest-add text-xs px-2 py-0.5 rounded bg-slate-200" data-target="risks" data-term="${term}">Risk</button>
          </div>
        </li>`
    )
    .join('');
}

function addSuggestionToDictionary(target, term) {
  if (!term) return;
  const clean = term.trim();
  if (!clean) return;
  const append = (textarea) => {
    if (!textarea) return;
    const existing = textarea.value ? `${textarea.value.trim()}, ${clean}` : clean;
    textarea.value = existing;
  };
  if (target === 'scope') append(dictScope);
  if (target === 'longLead') append(dictLongLead);
  if (target === 'risks') append(dictRisks);
  generateDictionarySuggestions();
}

function stripInternalMarkers(text) {
  return (text || '').replace(/\[\[PAGE:[^\]]+\]\]\s*/g, '').replace(/---\nSource:[^\n]+\n/g, '');
}

function exportTakeoffPdf() {
  if (!state.takeoff.length) return;
  const win = window.open('', '_blank', 'width=1000,height=800');
  if (!win) return;
  const generated = new Date().toLocaleString();
  const metrics = state.lastResults?.metrics;
  const coverage = metrics?.scopeCoverage != null ? `${(metrics.scopeCoverage * 100).toFixed(0)}%` : '--';
  const confidence = metrics?.takeoffConfidence != null ? `${(metrics.takeoffConfidence * 100).toFixed(0)}%` : '--';
  const rows = state.takeoff
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.description || '')}</td>
        <td>${formatNumber(item.quantity)}</td>
        <td>${escapeHtml(item.unit || '')}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td>${escapeHtml(item.complexity || '')}</td>
        <td>${escapeHtml((item.keywords || []).join(', ') || '—')}</td>
        <td>${escapeHtml(item.qualityGrade || 'Medium')}${item.qualityScore != null ? ` ${(item.qualityScore * 100).toFixed(0)}%` : ''}</td>
        <td>${escapeHtml(item.sourceFile ? `${item.sourceFile}${item.sourcePage ? ` p.${item.sourcePage}` : ''}` : '')}</td>
        <td class="align-right">${escapeHtml(item.priceHint || '—')}</td>
      </tr>`
    )
    .join('');
  win.document.write(`
    <html>
      <head>
        <title>Take-off Export</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; padding: 24px; }
          h1 { margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #cbd5f5; padding: 6px 8px; text-align: left; }
          th { background: #e2e8f0; text-transform: uppercase; font-size: 10px; letter-spacing: .05em; }
          .meta { margin-bottom: 16px; font-size: 12px; }
          .meta span { display: inline-block; margin-right: 16px; color: #475569; }
          .align-right { text-align: right; }
        </style>
      </head>
      <body>
        <h1>KSE Estimate Accelerator</h1>
        <div class="meta">
          <span>Generated: ${generated}</span>
          <span>Scope coverage: ${coverage}</span>
          <span>Overall confidence: ${confidence}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit</th>
              <th>Category</th>
              <th>Complexity</th>
              <th>Matched Terms</th>
              <th>Confidence</th>
              <th>Source</th>
              <th>Price Hint</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 300);
}

async function loadMarketInsights(forceRefresh = false) {
  if (marketRefreshBtn) {
    marketRefreshBtn.disabled = true;
    marketRefreshBtn.textContent = 'Refreshing...';
  }
  try {
    if (!forceRefresh && state.marketInsights) {
      renderMarketPanel(state.marketInsights);
      return;
    }
    const res = await fetch('/api/market/insights');
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'Unable to fetch market insights');
    state.marketInsights = data.insights;
    renderMarketPanel(state.marketInsights);
  } catch (error) {
    renderMarketPanel(null, error instanceof Error ? error.message : String(error));
  } finally {
    if (marketRefreshBtn) {
      marketRefreshBtn.disabled = false;
      marketRefreshBtn.textContent = 'Refresh';
    }
  }
}

function renderMarketPanel(insights, errorMessage) {
  if (!marketPpiValue || !marketNotes) return;
  if (!insights) {
    marketPpiValue.textContent = '--';
    marketPpiMeta.textContent = errorMessage || 'Unavailable';
    marketSolarValue.textContent = '--';
    marketSolarMeta.textContent = '';
    marketEnergyValue.textContent = '--';
    marketEnergyMeta.textContent = '';
    marketInterconnectionValue.textContent = '--';
    marketInterconnectionMeta.textContent = '';
    marketNotes.innerHTML = `<li class="text-slate-500">${escapeHtml(errorMessage || 'Unable to load market feeds.')}</li>`;
    renderCommodityAlerts([]);
    renderMarketRecommendations([]);
    return;
  }
  if (insights.ppi.latestValue != null) {
    marketPpiValue.textContent = `${insights.ppi.latestValue.toFixed(1)}`;
    const change =
      insights.ppi.changePercent != null
        ? `${insights.ppi.changePercent >= 0 ? '+' : ''}${insights.ppi.changePercent.toFixed(1)}%`
        : '--';
    marketPpiMeta.textContent = `${insights.ppi.periodName || ''} ${change}`;
  } else {
    marketPpiValue.textContent = '--';
    marketPpiMeta.textContent = 'BLS PPI';
  }

  if (insights.solarCapex.value != null) {
    marketSolarValue.textContent = `$${insights.solarCapex.value.toFixed(0)} ${insights.solarCapex.unit}`;
    marketSolarMeta.textContent = insights.solarCapex.source;
  } else {
    marketSolarValue.textContent = '--';
    marketSolarMeta.textContent = insights.solarCapex.source;
  }

  if (insights.energyPrice.value != null) {
    marketEnergyValue.textContent = `${insights.energyPrice.value.toFixed(2)} ${insights.energyPrice.unit}`;
    marketEnergyMeta.textContent = insights.energyPrice.source;
  } else {
    marketEnergyValue.textContent = '--';
    marketEnergyMeta.textContent = insights.energyPrice.source;
  }

  if (insights.interconnection.backlogMonths != null) {
    marketInterconnectionValue.textContent = `${insights.interconnection.backlogMonths.toFixed(1)} mo`;
  } else {
    marketInterconnectionValue.textContent = '--';
  }
  marketInterconnectionMeta.textContent = insights.interconnection.region || insights.interconnection.note;

  marketNotes.innerHTML = (insights.notes || [])
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join('') || '<li class="text-slate-500">No market notes.</li>';
  renderCommodityAlerts(insights.commodities || [], insights.updatedAt);
  renderMarketRecommendations(buildMarketRecommendations(insights), insights.updatedAt);
}

function renderCommodityAlerts(commodities = [], updatedAt) {
  if (!marketCommodityPanel || !marketCommodityList || !marketCommodityEmpty) return;
  if (!commodities.length) {
    marketCommodityList.innerHTML = '';
    marketCommodityEmpty.classList.remove('hidden');
    marketCommodityPanel.classList.add('opacity-60');
    if (marketCommodityTimestamp) marketCommodityTimestamp.textContent = '';
    return;
  }
  marketCommodityPanel.classList.remove('opacity-60');
  marketCommodityEmpty.classList.add('hidden');
  marketCommodityList.innerHTML = commodities
    .map((alert) => {
      const palette =
        alert.status === 'surging'
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : alert.status === 'elevated'
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800';
      const change =
        alert.changePercent != null
          ? `${alert.changePercent >= 0 ? '+' : ''}${alert.changePercent.toFixed(1)}% vs prior`
          : 'Change unavailable';
      const value = alert.latestValue != null ? alert.latestValue.toFixed(1) : '--';
      return `
        <article class="rounded-lg border ${palette} p-3 shadow-sm">
          <p class="text-xs uppercase font-semibold tracking-wide">${escapeHtml(alert.name)}</p>
          <p class="text-2xl font-bold">${value}</p>
          <p class="text-xs">${escapeHtml(change)}</p>
          <p class="text-xs mt-1">${escapeHtml(alert.message || '')}</p>
        </article>
      `;
    })
    .join('');
  if (marketCommodityTimestamp) {
    marketCommodityTimestamp.textContent = updatedAt ? new Date(updatedAt).toLocaleString() : '';
  }
}

function renderMarketRecommendations(recs = [], updatedAt) {
  if (!marketRecPanel || !marketRecommendations || !marketRecommendationsEmpty) return;
  if (!recs.length) {
    marketRecPanel.classList.add('opacity-60');
    marketRecommendations.innerHTML = '';
    marketRecommendationsEmpty.classList.remove('hidden');
    if (marketRecTimestamp) marketRecTimestamp.textContent = '';
    return;
  }
  marketRecPanel.classList.remove('opacity-60');
  marketRecommendationsEmpty.classList.add('hidden');
  marketRecommendations.innerHTML = recs.map((rec) => `<li class="flex items-start gap-2 text-slate-800"><span class="text-sky-500">•</span><span>${escapeHtml(rec)}</span></li>`).join('');
  if (marketRecTimestamp) {
    marketRecTimestamp.textContent = updatedAt ? new Date(updatedAt).toLocaleString() : '';
  }
}

function buildMarketRecommendations(insights) {
  if (!insights) return [];
  const recs = [];
  if (insights.ppi?.changePercent != null) {
    recs.push(
      `Electrical equipment PPI is ${insights.ppi.changePercent.toFixed(
        1
      )}% vs prior period – rebid any vendor quotes older than 30 days.`
    );
  }
  if (insights.solarCapex?.value != null) {
    recs.push(`Benchmark PV/lv energy work around $${insights.solarCapex.value.toFixed(0)} per ${insights.solarCapex.unit}.`);
  }
  if (insights.energyPrice?.trend === 'up') {
    recs.push('Wholesale energy prices trending upward; lean into efficiency/value-add alternates.');
  }
  if (insights.interconnection?.backlogMonths && insights.interconnection.backlogMonths > 12) {
    recs.push(
      `${insights.interconnection.region} interconnection backlog ~${insights.interconnection.backlogMonths.toFixed(
        0
      )} months – pad schedules and release long-leads early.`
    );
  }
  (insights.commodities || []).forEach((alert) => {
    if (alert.status !== 'stable' && alert.message) {
      recs.push(alert.message);
    }
  });
  return Array.from(new Set(recs)).slice(0, 6);
}

function selectTakeoffItem(id) {
  if (!id) {
    state.selectedTakeoffId = null;
    renderItemInspector();
    updateTakeoffUI(state.takeoff, state.lastResults?.metrics || {});
    return;
  }
  if (state.selectedTakeoffId === id) {
    renderItemInspector();
    return;
  }
  state.selectedTakeoffId = id;
  renderItemInspector();
  updateTakeoffUI(state.takeoff, state.lastResults?.metrics || {});
}

function renderItemInspector() {
  if (!itemInspectorEmpty || !itemInspectorFields || !itemInspectorSource) return;
  const item = state.takeoff.find((entry) => entry.id === state.selectedTakeoffId);
  if (!item) {
    itemInspectorEmpty.classList.remove('hidden');
    itemInspectorFields.classList.add('hidden');
    itemInspectorSource.classList.add('hidden');
    return;
  }
  itemInspectorEmpty.classList.add('hidden');
  itemInspectorFields.classList.remove('hidden');
  inspectorDescription.value = item.description || '';
  inspectorNotes.value = item.userNotes || '';
  inspectorQuantity.value = item.quantity ?? '';
  inspectorUnit.value = item.unit || '';
  inspectorCategory.value = item.category || '';
  const sourceLabel = formatSourceLabel(item);
  itemInspectorSource.textContent = `Source: ${sourceLabel}`;
  itemInspectorSource.classList.remove('hidden');
}

function handleInspectorSave(event) {
  event?.preventDefault();
  const item = state.takeoff.find((entry) => entry.id === state.selectedTakeoffId);
  if (!item) return;
  const updated = {
    ...item,
    description: inspectorDescription.value.trim() || item.description,
    quantity: Number(inspectorQuantity.value || item.quantity || 0),
    unit: inspectorUnit.value.trim() || item.unit,
    category: inspectorCategory.value.trim() || item.category,
    userNotes: inspectorNotes.value.trim(),
    userEdited: true
  };
  updateTakeoffItem(updated);
  logFeedback(`Edited ${updated.description}${updated.userNotes ? ` — ${updated.userNotes}` : ''}`);
  renderItemInspector();
}

function handleInspectorAccept(event) {
  event?.preventDefault();
  const item = state.takeoff.find((entry) => entry.id === state.selectedTakeoffId);
  if (!item) return;
  const updated = { ...item, reviewed: true };
  updateTakeoffItem(updated);
  logFeedback(`Marked ${updated.description} as reviewed.`);
  renderItemInspector();
}

function updateTakeoffItem(updatedItem) {
  state.takeoff = state.takeoff.map((entry) => (entry.id === updatedItem.id ? updatedItem : entry));
  if (state.lastResults?.takeoff) {
    state.lastResults.takeoff = state.lastResults.takeoff.map((entry) =>
      entry.id === updatedItem.id ? { ...entry, ...updatedItem } : entry
    );
  }
  renderItemInspector();
  updateTakeoffUI(state.takeoff, state.lastResults?.metrics || {});
}

function logFeedback(message) {
  if (!message) return;
  const entry = { message, at: new Date().toLocaleTimeString() };
  state.feedbackLog.unshift(entry);
  state.feedbackLog = state.feedbackLog.slice(0, 20);
  renderFeedbackLog();
}

function renderFeedbackLog() {
  if (!feedbackLogEl) return;
  if (!state.feedbackLog.length) {
    feedbackLogEl.innerHTML = '<li class="text-slate-500">No edits yet.</li>';
    return;
  }
  feedbackLogEl.innerHTML = state.feedbackLog
    .map((entry) => `<li>${escapeHtml(entry.message)} <span class="text-slate-400">(${entry.at})</span></li>`)
    .join('');
}

function focusSource(fileName, page) {
  if (!fileName) return;
  const summary = state.fileQueue.find((entry) => entry.name === fileName);
  if (!summary) return;
  setActiveSummary(summary);
  renderManifest();
  const li = fileManifestList?.querySelector(`li[data-file-id="${summary.id}"]`);
  if (li) {
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    li.classList.add('ring-2', 'ring-sky-500');
    setTimeout(() => li.classList.remove('ring-2', 'ring-sky-500'), 2000);
  }
  if (summary.pageTexts?.length && pagePreviewSelect) {
    const idx = Math.max(0, Math.min(summary.pageTexts.length - 1, (Number(page) || 1) - 1));
    pagePreviewSelect.value = String(idx);
    updatePagePreviewBody(summary, idx);
  }
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

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (match) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[match]));
}

function formatSourceLabel(item) {
  if (!item.sourceFile) return 'Unknown source';
  return `${item.sourceFile}${item.sourcePage ? ` • Page ${item.sourcePage}` : ''}`;
}

