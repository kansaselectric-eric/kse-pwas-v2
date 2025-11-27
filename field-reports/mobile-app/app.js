/* Kansas Electric Field Reports PWA
 * - Captures photos/videos/audio
 * - Offline queue via IndexedDB
 * - Background Sync + online event to retry
 * - Uploads to Apps Script endpoint
 * TODO: OAuth login (optional), permissions, AI integration
 */

const APP_NAME = 'kse-field-reports';
const DB_NAME = 'kse-field-reports';
const STORE_NAME = 'reportsQueue';
// Feature flags
let enableImageCompression = true;
let enableChunkedUploads = true; // Chunked uploads enabled
const featureFlagHost = typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;
if (featureFlagHost) {
  Object.defineProperty(featureFlagHost, 'ENABLE_IMAGE_COMPRESSION', {
    configurable: true,
    get: () => enableImageCompression,
    set: (val) => {
      enableImageCompression = !!val;
    }
  });
  Object.defineProperty(featureFlagHost, 'ENABLE_CHUNKED_UPLOADS', {
    configurable: true,
    get: () => enableChunkedUploads,
    set: (val) => {
      enableChunkedUploads = !!val;
    }
  });
}
// TODO: Replace with your deployed Apps Script Web App URL
const APPS_SCRIPT_ENDPOINT = 'https://script.google.com/macros/s/YOUR_APPS_SCRIPT_WEB_APP_URL/exec';
// TODO: Replace with your Google Client ID
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const PROCUREMENT_EMAIL = 'procurement@kansaselectric.com';
const TECH_ROSTER_KEY = 'kse_field_roster';
const TECH_ASSIGNMENTS_KEY = 'kse_project_assignments';
const LAST_TECH_KEY = 'kse_last_field_tech';
const PROMPT_LIBRARY_KEY = 'kse_prompt_library';
const DEFAULT_CREW_RATE = 85;

if (typeof document !== 'undefined' && document.title === '') {
  document.title = APP_NAME;
}

const reportForm = document.getElementById('reportForm');
const networkStatusEl = document.getElementById('networkStatus');
const statusEl = document.getElementById('status');
const recordBtn = document.getElementById('recordBtn');
const recordStatus = document.getElementById('recordStatus');
const audioList = document.getElementById('audioList');
const gsiSignIn = document.getElementById('gsiSignIn');
const authUser = document.getElementById('authUser');
const addProjectBtn = document.getElementById('addProjectBtn');
const syncJobsBtn = document.getElementById('syncJobsBtn');
const photoPreview = document.getElementById('photoPreview');
const queueList = document.getElementById('queueList');
const queueSummary = document.getElementById('queueSummary');
const retryAllBtn = document.getElementById('retryAllBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const settingsSave = document.getElementById('settingsSave');
const settingsCancel = document.getElementById('settingsCancel');
const flagCompression = document.getElementById('flagCompression');
const flagChunks = document.getElementById('flagChunks');
const lastSyncEl = document.getElementById('lastSync');
const projectSelect = document.getElementById('project');
const dictateBtn = document.getElementById('dictateBtn');
const sttStatus = document.getElementById('sttStatus');
const videoRecordBtn = document.getElementById('videoRecordBtn');
const videoRecordStatus = document.getElementById('videoRecordStatus');
const cameraPreview = document.getElementById('cameraPreview');
const videoList = document.getElementById('videoList');
const annotateDialog = document.getElementById('annotateDialog');
const annotateCanvas = document.getElementById('annotateCanvas');
const annotateSave = document.getElementById('annotateSave');
const annotateCancel = document.getElementById('annotateCancel');
const taskSelect = document.getElementById('task');
const syncTasksBtn = document.getElementById('syncTasksBtn');
const qtyCompletedInput = document.getElementById('qtyCompleted');
const pctTodayInput = document.getElementById('pctToday');
const photosInput = document.getElementById('photos');
const videosInput = document.getElementById('videos');
const manpowerInput = document.getElementById('manpower');
const safetyCheckbox = document.getElementById('safetyIssues');
const notesInput = document.getElementById('notes');
const narrativeWorkInput = document.getElementById('narrativeWork');
const narrativeMaterialsInput = document.getElementById('narrativeMaterials');
const narrativeIssuesInput = document.getElementById('narrativeIssues');
const narrativeLookaheadInput = document.getElementById('narrativeLookahead');
const narrativeInputMap = {
  work: narrativeWorkInput,
  materials: narrativeMaterialsInput,
  issues: narrativeIssuesInput,
  lookahead: narrativeLookaheadInput
};
const summaryPreviewEl = document.getElementById('summaryPreview');
const summaryCopyBtn = document.getElementById('summaryCopy');
const fieldTechSelect = document.getElementById('fieldTechSelect');
const manageTechBtn = document.getElementById('manageTechBtn');
const metricQueuedReports = document.getElementById('metricQueuedReports');
const metricPhotos = document.getElementById('metricPhotos');
const metricVideos = document.getElementById('metricVideos');
const metricAudio = document.getElementById('metricAudio');
const crewHoursInput = document.getElementById('crewHours');
const crewCostLensEl = document.getElementById('crewCostLens');
const crewCostDetailEl = document.getElementById('crewCostDetail');
if (crewHoursInput && !crewHoursInput.value) crewHoursInput.value = '8';
const requestCard = document.getElementById('requestIntelligence');
const requestListEl = document.getElementById('requestList');
const requestSendBtn = document.getElementById('requestSendBtn');
const narrationOverlay = document.getElementById('narrationOverlay');
const promptPresetSelect = document.getElementById('promptPresetSelect');
const managePromptsBtn = document.getElementById('managePromptsBtn');
const promptChipRow = document.getElementById('promptChipRow');
const assignTechDialog = document.getElementById('assignTechDialog');
const assignTechList = document.getElementById('assignTechList');
const assignTechProjectLabel = document.getElementById('assignTechProjectLabel');
const newTechInput = document.getElementById('newTechInput');
const addTechBtn = document.getElementById('addTechBtn');
const assignTechSave = document.getElementById('assignTechSave');
const assignTechCancel = document.getElementById('assignTechCancel');
const promptManagerDialog = document.getElementById('promptManagerDialog');
const promptManagerList = document.getElementById('promptManagerList');
const promptManagerLabel = document.getElementById('promptManagerLabel');
const newPromptLabel = document.getElementById('newPromptLabel');
const newPromptText = document.getElementById('newPromptText');
const newPromptTarget = document.getElementById('newPromptTarget');
const addPromptBtn = document.getElementById('addPromptBtn');
const promptManagerSave = document.getElementById('promptManagerSave');
const promptManagerCancel = document.getElementById('promptManagerCancel');

let mediaRecorder = null;
let audioChunks = [];
let capturedAudioBlobs = [];
let idToken = null;
let acumaticaJobs = [];
let recognition = null;
let recognizing = false;
let interimTranscript = '';
let videoMediaRecorder = null;
let videoStream = null;
let videoChunks = [];
let capturedVideoBlobs = [];
let assignProjectKey = '';
let promptManagerProjectKey = '';
const capturedAnnotatedImageBlobs = [];
const insightMetrics = { queued: 0, photos: 0, videos: 0, audio: 0 };
const BUILT_IN_PROMPTS = {
  general: [
    { label: 'Feeder install', target: 'work', text: 'Pulled feeders between MH-12 and MH-15, terminated in gear.' },
    { label: 'Gear set', target: 'materials', text: 'Set and wired ATS, verified torque, labeled conductors.' },
    { label: 'Conflict', target: 'issues', text: 'Delayed finish on ductbank due to conflicting telecom, awaiting GC clearance.' },
    { label: 'Crew ask', target: 'lookahead', text: 'Need two additional journeymen tomorrow to pull Section B feeders.' }
  ],
  substation: [
    { label: 'Yard grounding', target: 'work', text: 'Completed new ground grid ties on the south bay and meggered connections.' },
    { label: 'Relay panels', target: 'materials', text: 'Mounted relay panels R1-R3, landed control wiring, labeled test switches.' },
    { label: 'Outage plan', target: 'issues', text: 'Coordinating cutover with utility ops — waiting on outage window confirmation.' },
    { label: 'Breaker delivery', target: 'lookahead', text: 'Need 161kV breaker #2 delivered by Friday to stay on energization track.' }
  ],
  solar: [
    { label: 'Tracker strings', target: 'work', text: 'Energized four tracker rows, torque-checked module clamps, verified polarity.' },
    { label: 'Inverter pads', target: 'materials', text: 'Placed precast inverter pads and staged combiner wiring harnesses.' },
    { label: 'Weather watch', target: 'issues', text: 'High winds halted string pull for 2 hours; resuming tomorrow morning.' },
    { label: 'Module drop', target: 'lookahead', text: 'Request truck #12 with 500 modules early AM to backfill Row 17 shortage.' }
  ],
  data: [
    { label: 'Busway run', target: 'work', text: 'Installed 2nd level busway and tied into UPS gallery, torque verified.' },
    { label: 'White space gear', target: 'materials', text: 'Staged PDUs + RPPs for Pod B, barcode scanned for QA handoff.' },
    { label: 'Access constraints', target: 'issues', text: 'Hot aisle containment delayed our lift; coordinating night shift access.' },
    { label: 'Owner change', target: 'lookahead', text: 'Need approval on revised whips length before prefabs ship Friday.' }
  ],
  service: [
    { label: 'Emergency call', target: 'work', text: 'Troubleshot loss of power to RTU-4, replaced failed breaker and restored service.' },
    { label: 'Parts swapped', target: 'materials', text: 'Used spare VFD from truck stock; need replacement ordered to restock.' },
    { label: 'Safety follow-up', target: 'issues', text: 'Panel had missing deadfront; notified customer and tagged out until fixed.' },
    { label: 'Next visit', target: 'lookahead', text: 'Schedule return visit Thursday with thermal camera to finish inspection.' }
  ],
  underground: [
    { label: 'Ductbank pour', target: 'work', text: 'Poured 80’ of 8-way ductbank with spacers, installed warning tape.' },
    { label: 'Vault set', target: 'materials', text: 'Set precast vault V-3, stubbed conduits, foamed penetrations.' },
    { label: 'Utility conflicts', target: 'issues', text: 'Encountered unmarked water service crossing at Sta. 14+50, awaiting relocation.' },
    { label: 'Pull schedule', target: 'lookahead', text: 'Need pulling rig + 6 crew on Monday to get feeders in before backfill.' }
  ]
};
let flaggedRequests = [];

function refreshInsightMetrics() {
  if (metricQueuedReports) metricQueuedReports.textContent = String(insightMetrics.queued);
  if (metricPhotos) metricPhotos.textContent = String(insightMetrics.photos);
  if (metricVideos) metricVideos.textContent = String(insightMetrics.videos);
  if (metricAudio) metricAudio.textContent = String(insightMetrics.audio);
}

function recomputeMediaMetrics() {
  insightMetrics.photos = (photosInput?.files?.length || 0) + capturedAnnotatedImageBlobs.length;
  insightMetrics.videos = (videosInput?.files?.length || 0) + capturedVideoBlobs.length;
  insightMetrics.audio = capturedAudioBlobs.length;
  refreshInsightMetrics();
}
refreshInsightMetrics();
updateCrewCostLens();

function getProjectKey() {
  if (!projectSelect) return '';
  const opt = projectSelect.options[projectSelect.selectedIndex];
  if (!opt) return '';
  if (opt.dataset?.jobid) return `job:${opt.dataset.jobid}`;
  if (opt.dataset?.custom) return `custom:${opt.textContent || opt.value}`;
  return opt.value || '';
}

function getProjectLabel() {
  if (!projectSelect) return '';
  const opt = projectSelect.options[projectSelect.selectedIndex];
  return opt ? (opt.textContent || opt.value || '') : '';
}

function loadTechRoster() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TECH_ROSTER_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTechRoster(list) {
  localStorage.setItem(TECH_ROSTER_KEY, JSON.stringify(list));
}

function loadTechAssignments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TECH_ASSIGNMENTS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveTechAssignments(assignments) {
  localStorage.setItem(TECH_ASSIGNMENTS_KEY, JSON.stringify(assignments));
}

function getAssignmentsForCurrentProject() {
  const key = getProjectKey();
  const assignments = loadTechAssignments();
  return key && assignments[key] ? assignments[key] : [];
}

function populateFieldTechDropdown() {
  if (!fieldTechSelect) return;
  const projectAssignments = getAssignmentsForCurrentProject();
  const roster = loadTechRoster();
  const candidates = projectAssignments.length ? projectAssignments : roster;
  fieldTechSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = candidates.length ? 'Tap to select your name...' : 'Roster not set yet';
  fieldTechSelect.appendChild(placeholder);
  candidates.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    fieldTechSelect.appendChild(opt);
  });
  const last = localStorage.getItem(LAST_TECH_KEY);
  if (last && candidates.includes(last)) {
    fieldTechSelect.value = last;
  }
}

function loadPromptLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PROMPT_LIBRARY_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function savePromptLibrary(library) {
  localStorage.setItem(PROMPT_LIBRARY_KEY, JSON.stringify(library));
}

function getProjectPrompts(projectKey) {
  if (!projectKey) return [];
  const lib = loadPromptLibrary();
  const prompts = lib[projectKey];
  return Array.isArray(prompts) ? prompts : [];
}

function getPromptSet(key) {
  if (key === 'project') {
    return getProjectPrompts(getProjectKey());
  }
  return BUILT_IN_PROMPTS[key] || BUILT_IN_PROMPTS.general;
}

function renderPromptChips(presetKey = (promptPresetSelect?.value || 'general')) {
  if (!promptChipRow) return;
  promptChipRow.innerHTML = '';
  const prompts = getPromptSet(presetKey) || [];
  if (!prompts.length) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-slate-500';
    empty.textContent = 'No prompts saved for this project yet.';
    promptChipRow.appendChild(empty);
    return;
  }
  prompts.forEach((prompt) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'guided-chip';
    btn.dataset.target = prompt.target;
    btn.dataset.text = prompt.text;
    btn.textContent = prompt.label;
    promptChipRow.appendChild(btn);
  });
}

function loadPromptManagerState(projectKey) {
  return getProjectPrompts(projectKey);
}

function saveProjectPrompts(projectKey, prompts) {
  if (!projectKey) return;
  const lib = loadPromptLibrary();
  lib[projectKey] = prompts;
  savePromptLibrary(lib);
}

function renderPromptManagerList(projectKey) {
  if (!promptManagerList) return;
  const prompts = loadPromptManagerState(projectKey);
  promptManagerList.innerHTML = '';
  if (!prompts.length) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-slate-500';
    empty.textContent = 'No project-specific prompts yet.';
    promptManagerList.appendChild(empty);
    return;
  }
  prompts.forEach((prompt) => {
    const row = document.createElement('div');
    row.className = 'border border-slate-200 rounded-lg p-2 text-sm flex items-start justify-between gap-2';
    const copy = document.createElement('div');
    copy.innerHTML = `<p class="font-semibold text-slate-700">${prompt.label}</p>
      <p class="text-xs text-slate-500 uppercase">${prompt.target}</p>
      <p class="text-xs text-slate-600">${prompt.text}</p>`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-xs text-rose-600 hover:text-rose-500';
    remove.dataset.removePrompt = prompt.id;
    remove.textContent = 'Remove';
    row.appendChild(copy);
    row.appendChild(remove);
    promptManagerList.appendChild(row);
  });
}

function getCrewCostSnapshot() {
  const manpowerVal = Number(manpowerInput?.value || 0);
  const hoursVal = Number(crewHoursInput?.value || 0);
  const rateVal = DEFAULT_CREW_RATE;
  const totalHours = manpowerVal * hoursVal;
  const dailyCost = totalHours * rateVal;
  return { manpower: manpowerVal, hours: hoursVal, rate: rateVal, totalHours, dailyCost };
}

function formatCurrency(val) {
  return Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function updateCrewCostLens() {
  if (!crewCostLensEl || !crewCostDetailEl) return;
  const snapshot = getCrewCostSnapshot();
  if (snapshot.dailyCost > 0) {
    crewCostLensEl.textContent = `≈ $${formatCurrency(snapshot.dailyCost)} burn today`;
    const totalHrs = Number.isFinite(snapshot.totalHours) ? snapshot.totalHours.toFixed(1) : '0';
    crewCostDetailEl.textContent = `${snapshot.manpower} crew × ${snapshot.hours || 0} hrs (${totalHrs} total hrs) • Rate handled automatically`;
  } else {
    crewCostLensEl.textContent = 'Set crew + hours to surface daily burn.';
    crewCostDetailEl.textContent = '';
  }
}

const REQUEST_KEYWORDS = ['need', 'request', 'deliver', 'ship', 'await', 'missing', 'crew', 'material', 'prefab', 'rental', 'tool', 'order'];

function extractActionableRequests(text) {
  if (!text) return [];
  return text
    .split(/[\n.]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const lower = line.toLowerCase();
      return REQUEST_KEYWORDS.some((kw) => lower.includes(kw));
    });
}

function updateRequestIntelligence() {
  if (!requestCard || !requestListEl) return;
  const narrative = getNarrativeState();
  flaggedRequests = extractActionableRequests(narrative.lookahead || '');
  requestListEl.innerHTML = '';
  if (!flaggedRequests.length) {
    requestCard.classList.add('hidden');
    if (requestSendBtn) requestSendBtn.disabled = true;
    return;
  }
  requestCard.classList.remove('hidden');
  if (requestSendBtn) requestSendBtn.disabled = false;
  flaggedRequests.forEach((req) => {
    const li = document.createElement('li');
    li.textContent = req;
    requestListEl.appendChild(li);
  });
}

const OVERLAY_FIELD_MAP = {
  work: 'workCompleted',
  materials: 'materialsInstalled',
  issues: 'issuesRisks',
  lookahead: 'lookahead'
};

function refreshOverlayStateFromNarratives() {
  if (!narrationOverlay) return;
  const narrative = getNarrativeState();
  narrationOverlay.querySelectorAll('.overlay-pill').forEach((pill) => {
    const key = pill.dataset.target;
    if (!key) return;
    const fieldKey = OVERLAY_FIELD_MAP[key];
    const hasText = fieldKey && narrative[fieldKey] && narrative[fieldKey].length > 0;
    pill.classList.toggle('is-complete', !!hasText);
  });
}

function resetNarrationOverlay() {
  if (!narrationOverlay) return;
  narrationOverlay.querySelectorAll('.overlay-pill').forEach((pill) => pill.classList.remove('is-complete'));
}

function notifyProcurementOfRequests() {
  if (!flaggedRequests.length) return;
  const projectName = getProjectLabel() || 'Field project';
  const summary = flaggedRequests.map((req) => `- ${req}`).join('\n');
  const subject = encodeURIComponent(`[Field Request] ${projectName}`);
  const body = encodeURIComponent(`Project: ${projectName}\n\nRequests:\n${summary}\n\nSent via Kansas Electric Field Reports PWA`);
  window.location.href = `mailto:${PROCUREMENT_EMAIL}?subject=${subject}&body=${body}`;
}

function renderAssignTechList(projectKey) {
  if (!assignTechList) return;
  const roster = loadTechRoster();
  const assigned = new Set(loadTechAssignments()[projectKey] || []);
  assignTechList.innerHTML = '';
  if (!roster.length) {
    const empty = document.createElement('p');
    empty.className = 'text-xs text-slate-500';
    empty.textContent = 'No roster yet. Add names below.';
    assignTechList.appendChild(empty);
    return;
  }
  roster.forEach((name) => {
    const row = document.createElement('label');
    row.className = 'flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm';
    row.innerHTML = `<span>${name}</span>`;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'rounded border-slate-300 text-sky-600 focus:ring-sky-500';
    checkbox.dataset.name = name;
    checkbox.checked = assigned.has(name);
    row.appendChild(checkbox);
    assignTechList.appendChild(row);
  });
}

function openAssignTechManager() {
  const projectKey = getProjectKey();
  if (!projectKey) {
    alert('Select a project first.');
    return;
  }
  assignProjectKey = projectKey;
  if (assignTechProjectLabel) {
    assignTechProjectLabel.textContent = `Project: ${getProjectLabel()}`;
  }
  renderAssignTechList(projectKey);
  assignTechDialog?.showModal();
}

function openPromptManager() {
  const projectKey = getProjectKey();
  if (!projectKey) {
    alert('Select a project first.');
    return;
  }
  promptManagerProjectKey = projectKey;
  if (promptManagerLabel) {
    promptManagerLabel.textContent = `Project: ${getProjectLabel()}`;
  }
  renderPromptManagerList(projectKey);
  promptManagerDialog?.showModal();
}

function addProjectPromptFromDialog() {
  if (!promptManagerProjectKey) return;
  const label = (newPromptLabel?.value || '').trim();
  const text = (newPromptText?.value || '').trim();
  const target = newPromptTarget?.value || 'work';
  if (!label || !text) return;
  const current = getProjectPrompts(promptManagerProjectKey);
  current.push({
    id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    text,
    target
  });
  saveProjectPrompts(promptManagerProjectKey, current);
  newPromptLabel.value = '';
  newPromptText.value = '';
  renderPromptManagerList(promptManagerProjectKey);
  if ((promptPresetSelect?.value || '') === 'project') {
    renderPromptChips('project');
  }
}

function removeProjectPrompt(projectKey, promptId) {
  if (!projectKey || !promptId) return;
  const current = getProjectPrompts(projectKey).filter((prompt) => prompt.id !== promptId);
  saveProjectPrompts(projectKey, current);
  renderPromptManagerList(projectKey);
  if ((promptPresetSelect?.value || '') === 'project') {
    renderPromptChips('project');
  }
}

function getNarrativeState() {
  return {
    workCompleted: (narrativeWorkInput?.value || '').trim(),
    materialsInstalled: (narrativeMaterialsInput?.value || '').trim(),
    issuesRisks: (narrativeIssuesInput?.value || '').trim(),
    lookahead: (narrativeLookaheadInput?.value || '').trim()
  };
}

function buildSummaryText() {
  const projectName = (projectSelect?.value || '').trim() || 'Unassigned Project';
  const manpowerVal = parseInt(manpowerInput?.value || '0', 10) || 0;
  const safety = !!(safetyCheckbox && safetyCheckbox.checked);
  const taskMeta = getSelectedTaskMeta() || {};
  const qty = Number(qtyCompletedInput?.value || 0);
  const pct = Number(pctTodayInput?.value || 0);
  const notes = (notesInput?.value || '').trim();
  const narrative = getNarrativeState();
  const fieldTechName = (fieldTechSelect?.value || '').trim();
  const crewSnapshot = getCrewCostSnapshot();
  const requests = extractActionableRequests(narrative.lookahead || '');
  const lines = [
    `Project: ${projectName}`,
    `Crew: ${manpowerVal} • Safety: ${safety ? 'Issue noted' : 'Clear'}`,
    fieldTechName ? `Field tech: ${fieldTechName}` : '',
    taskMeta && (taskMeta.code || taskMeta.name)
      ? `Task: ${taskMeta.code ? taskMeta.code + ' — ' : ''}${taskMeta.name || ''}`
      : '',
    qty ? `Qty completed today: ${qty}${taskMeta && taskMeta.budgetedQty ? ` / ${taskMeta.budgetedQty}` : ''}` : '',
    pct ? `Reported progress today: ${pct.toFixed(1)}%` : '',
    crewSnapshot.manpower && crewSnapshot.hours
      ? `Crew hours: ${crewSnapshot.manpower} crew × ${crewSnapshot.hours} hrs`
      : '',
    crewSnapshot.dailyCost > 0 ? `Est. labor burn: $${formatCurrency(crewSnapshot.dailyCost)}` : '',
    narrative.workCompleted ? `Work completed: ${narrative.workCompleted}` : '',
    narrative.materialsInstalled ? `Materials/gear: ${narrative.materialsInstalled}` : '',
    narrative.issuesRisks ? `Issues/Risks: ${narrative.issuesRisks}` : '',
    narrative.lookahead ? `Look-ahead / requests: ${narrative.lookahead}` : '',
    notes ? `Additional notes: ${notes}` : ''
  ];
  if (requests.length) {
    lines.push('Requests flagged:');
    requests.forEach((req) => lines.push(` • ${req}`));
  }
  return lines.filter(Boolean).join('\n').trim();
}

function updateSummaryPreview() {
  if (!summaryPreviewEl) return;
  const summary = buildSummaryText();
  summaryPreviewEl.textContent = summary || 'Provide updates in the guided prompts above to generate a summary.';
  updateRequestIntelligence();
  refreshOverlayStateFromNarratives();
}

function insertPromptText(targetKey, text) {
  const target = narrativeInputMap[targetKey];
  if (!target) return;
  target.value = target.value ? `${target.value.trim()}\n${text}` : text;
  updateSummaryPreview();
}

promptChipRow?.addEventListener('click', (event) => {
  const chip = event.target.closest('.guided-chip');
  if (!chip) return;
  const target = chip.dataset.target || '';
  const text = chip.dataset.text || '';
  insertPromptText(target, text);
});

promptPresetSelect?.addEventListener('change', () => {
  renderPromptChips(promptPresetSelect.value);
});

managePromptsBtn?.addEventListener('click', openPromptManager);
addPromptBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  addProjectPromptFromDialog();
});
promptManagerList?.addEventListener('click', (event) => {
  const removeBtn = event.target.closest('[data-remove-prompt]');
  if (!removeBtn) return;
  event.preventDefault();
  const promptId = removeBtn.getAttribute('data-remove-prompt');
  removeProjectPrompt(promptManagerProjectKey, promptId);
});
promptManagerSave?.addEventListener('click', (event) => {
  event.preventDefault();
  promptManagerDialog?.close();
});
promptManagerCancel?.addEventListener('click', (event) => {
  event.preventDefault();
  promptManagerDialog?.close();
});

fieldTechSelect?.addEventListener('change', () => {
  if (fieldTechSelect.value) {
    localStorage.setItem(LAST_TECH_KEY, fieldTechSelect.value);
  }
  updateSummaryPreview();
});
manageTechBtn?.addEventListener('click', openAssignTechManager);
addTechBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  const name = (newTechInput?.value || '').trim();
  if (!name) return;
  const roster = loadTechRoster();
  if (!roster.includes(name)) {
    roster.push(name);
    saveTechRoster(roster);
  }
  newTechInput.value = '';
  if (assignProjectKey) {
    renderAssignTechList(assignProjectKey);
  }
  populateFieldTechDropdown();
});
assignTechSave?.addEventListener('click', (event) => {
  event.preventDefault();
  if (!assignProjectKey) {
    assignTechDialog?.close();
    return;
  }
  const selections = Array.from(assignTechList?.querySelectorAll('input[data-name]') || [])
    .filter((input) => input.checked)
    .map((input) => input.dataset.name);
  const assignments = loadTechAssignments();
  assignments[assignProjectKey] = selections;
  saveTechAssignments(assignments);
  assignTechDialog?.close();
  populateFieldTechDropdown();
});
assignTechCancel?.addEventListener('click', (event) => {
  event.preventDefault();
  assignTechDialog?.close();
});

requestSendBtn?.addEventListener('click', notifyProcurementOfRequests);

narrationOverlay?.addEventListener('click', (event) => {
  const pill = event.target.closest('.overlay-pill');
  if (!pill) return;
  event.preventDefault();
  const targetKey = pill.dataset.target || '';
  const targetInput = narrativeInputMap[targetKey];
  if (targetInput) {
    targetInput.focus();
    targetInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  pill.classList.add('is-complete');
});

[narrativeWorkInput, narrativeMaterialsInput, narrativeIssuesInput, narrativeLookaheadInput, notesInput].forEach((el) => {
  el?.addEventListener('input', updateSummaryPreview);
});
[projectSelect, manpowerInput, safetyCheckbox, qtyCompletedInput, pctTodayInput].forEach((el) => {
  el?.addEventListener('input', updateSummaryPreview);
  el?.addEventListener('change', updateSummaryPreview);
});

projectSelect?.addEventListener('change', () => {
  populateFieldTechDropdown();
  if ((promptPresetSelect?.value || '') === 'project') {
    renderPromptChips('project');
  }
});

[manpowerInput, crewHoursInput].forEach((el) => {
  el?.addEventListener('input', updateCrewCostLens);
  el?.addEventListener('change', updateCrewCostLens);
});

summaryCopyBtn?.addEventListener('click', async () => {
  const summary = buildSummaryText();
  if (!summary) return;
  try {
    await navigator.clipboard.writeText(summary);
    const original = summaryCopyBtn.textContent;
    summaryCopyBtn.textContent = 'Copied';
    setTimeout(() => {
      summaryCopyBtn.textContent = original || 'Copy Summary';
    }, 1200);
  } catch (err) {
    console.warn('Failed to copy summary', err);
  }
});

updateSummaryPreview();

function setNetworkStatus() {
  const online = navigator.onLine;
  networkStatusEl.textContent = online ? 'online' : 'offline';
}
setNetworkStatus();
window.addEventListener('online', () => {
  setNetworkStatus();
  syncQueue();
});
window.addEventListener('offline', setNetworkStatus);

// IndexedDB helpers
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueReport(report) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(report);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedReports() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedReport(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateQueueUI() {
  const items = await getQueuedReports();
  queueSummary.textContent = `${items.length} queued`;
  insightMetrics.queued = items.length;
  refreshInsightMetrics();
  queueList.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'py-2 flex items-center justify-between text-sm';
    const next = item.nextAttempt ? new Date(item.nextAttempt).toLocaleString() : 'now';
    li.innerHTML = `
      <div class="flex-1">
        <div class="font-medium">${item.payload.project}</div>
        <div class="text-slate-500 text-xs">Created ${new Date(item.createdAt).toLocaleString()} • Attempts ${item.attempts || 0} • Next ${next}</div>
      </div>
      <div class="flex items-center gap-2">
        <button data-id="${item.id}" class="retryBtn px-2 py-1 rounded bg-sky-600 text-white">Retry</button>
        <button data-id="${item.id}" class="removeBtn px-2 py-1 rounded bg-slate-100 text-slate-700">Remove</button>
      </div>
    `;
    queueList.appendChild(li);
  }
  queueList.querySelectorAll('.retryBtn').forEach(b => b.addEventListener('click', async (e) => {
    const id = Number(e.currentTarget.getAttribute('data-id'));
    await retrySingle(id);
  }));
  queueList.querySelectorAll('.removeBtn').forEach(b => b.addEventListener('click', async (e) => {
    const id = Number(e.currentTarget.getAttribute('data-id'));
    await removeQueuedReport(id);
    await updateQueueUI();
  }));
}

function jitter(ms) {
  return Math.floor(ms * (0.8 + Math.random() * 0.4));
}

function computeNextBackoff(attempts) {
  const base = Math.min(60 * 60 * 1000, 2000 * Math.pow(2, attempts)); // cap at 1h
  return Date.now() + jitter(base);
}

async function retrySingle(id) {
  const db = await openDb();
  const item = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!item) return;
  try {
    await sendReport(item.payload);
    await removeQueuedReport(id);
    statusEl.textContent = 'Retry succeeded.';
  } catch {
    const attempts = (item.attempts || 0) + 1;
    const nextAttempt = computeNextBackoff(attempts);
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ ...item, attempts, nextAttempt });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    statusEl.textContent = 'Retry scheduled.';
  }
  await updateQueueUI();
}

// Media capture - audio
recordBtn.addEventListener('click', async () => {
  if (!mediaRecorder) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        capturedAudioBlobs.push({ blob, filename: `voice-memo-${Date.now()}.webm`, type: 'audio/webm' });
        const li = document.createElement('li');
        li.textContent = `${capturedAudioBlobs[capturedAudioBlobs.length - 1].filename}`;
        audioList.appendChild(li);
        recordStatus.textContent = 'Idle';
        mediaRecorder = null;
        recomputeMediaMetrics();
      };
      mediaRecorder.start();
      recordStatus.textContent = 'Recording...';
      recordBtn.textContent = 'Stop Recording';
    } catch (err) {
      console.error(err);
      alert('Microphone access is required for voice memos.');
    }
  } else {
    mediaRecorder.stop();
    recordBtn.textContent = 'Start Recording';
  }
});

// Utility: convert File/Blob to base64 data URL
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Previews
photosInput?.addEventListener('change', async (e) => {
  photoPreview.innerHTML = '';
  const files = e.target.files || [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(f);
    const img = document.createElement('img');
    img.src = url;
    img.className = 'w-full h-20 object-cover rounded border border-slate-200';
    img.addEventListener('click', () => openAnnotateModal(url));
    photoPreview.appendChild(img);
  }
  recomputeMediaMetrics();
});

videosInput?.addEventListener('change', (e) => {
  const files = e.target.files || [];
  videoList.innerHTML = '';
  Array.from(files).forEach((file) => {
    const li = document.createElement('li');
    li.className = 'text-xs text-slate-600';
    li.textContent = `${file.name} (${Math.round(file.size / (1024 * 1024))} MB)`;
    videoList.appendChild(li);
  });
  recomputeMediaMetrics();
});

function openAnnotateModal(url) {
  const ctx = annotateCanvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    // fit into canvas
    ctx.clearRect(0,0,annotateCanvas.width, annotateCanvas.height);
    const ratio = Math.min(annotateCanvas.width / img.width, annotateCanvas.height / img.height);
    const w = img.width * ratio, h = img.height * ratio;
    ctx.drawImage(img, (annotateCanvas.width - w)/2, (annotateCanvas.height - h)/2, w, h);
  };
  img.src = url;
  setupDrawing(annotateCanvas);
  annotateDialog.showModal();
}

function setupDrawing(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let last = null;
  const start = (x,y) => { drawing = true; last = {x,y}; };
  const move = (x,y) => {
    if (!drawing || !last) return;
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last = {x,y};
  };
  const stop = () => { drawing = false; last = null; };
  canvas.onmousedown = (e) => start(e.offsetX, e.offsetY);
  canvas.onmousemove = (e) => move(e.offsetX, e.offsetY);
  canvas.onmouseup = stop;
  canvas.onmouseleave = stop;
  canvas.ontouchstart = (e) => { const r=canvas.getBoundingClientRect(); start(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); };
  canvas.ontouchmove = (e) => { const r=canvas.getBoundingClientRect(); move(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); e.preventDefault(); };
  canvas.ontouchend = stop;
}

annotateSave?.addEventListener('click', async () => {
  annotateDialog.close();
  annotateCanvas.toBlob(async (blob) => {
    if (!blob) return;
    capturedAnnotatedImageBlobs.push({ blob, filename: `annotated-${Date.now()}.png`, type: 'image/png' });
    statusEl.textContent = 'Annotated image added.';
    recomputeMediaMetrics();
  }, 'image/png', 0.95);
});
annotateCancel?.addEventListener('click', (e) => { e.preventDefault(); annotateDialog.close(); });

async function buildPayloadFromForm() {
  const project = document.getElementById('project').value;
  const notes = document.getElementById('notes').value || '';
  const manpower = parseInt(document.getElementById('manpower').value || '0', 10);
  const safetyFlags = !!document.getElementById('safetyIssues').checked;
  const timestamp = new Date().toISOString();
  const reportId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; // idempotency
  const location = await getLocationSafe();
  const taskMeta = getSelectedTaskMeta();
  const qtyCompleted = Number(qtyCompletedInput && qtyCompletedInput.value || 0);
  const pctToday = Number(pctTodayInput && pctTodayInput.value || 0);
  const narrative = getNarrativeState();
  const summaryText = buildSummaryText();
  const fieldTechName = fieldTechSelect?.value || '';
  const crewSnapshot = getCrewCostSnapshot();
  const materialRequests = extractActionableRequests(narrative.lookahead || '');
  const assignedRoster = getAssignmentsForCurrentProject();

  const files = [];
  const stagedFileIds = [];
  // Photos
  const photos = document.getElementById('photos').files;
  for (const f of photos) {
    if (enableChunkedUploads && f.size > 5 * 1024 * 1024) {
      const ref = await uploadFileChunked(f, reportId);
      if (ref) stagedFileIds.push(ref);
    } else if (enableImageCompression && f.type && f.type.startsWith('image/')) {
      const compressed = await compressImageFile(f, { maxWidth: 1600, quality: 0.8 });
      files.push({ blob: await blobToBase64(compressed), filename: f.name, type: compressed.type || f.type });
    } else {
      files.push({ blob: await blobToBase64(f), filename: f.name, type: f.type || 'image/*' });
    }
  }
  // Annotated images
  for (const a of capturedAnnotatedImageBlobs) {
    files.push({ blob: await blobToBase64(a.blob), filename: a.filename, type: a.type || 'image/png' });
  }
  // Videos
  const videos = document.getElementById('videos').files;
  for (const f of videos) {
    if (enableChunkedUploads && f.size > 5 * 1024 * 1024) {
      const ref = await uploadFileChunked(f, reportId);
      if (ref) stagedFileIds.push(ref);
    } else {
      files.push({ blob: await blobToBase64(f), filename: f.name, type: f.type || 'video/*' });
    }
  }
  // Audio blobs captured via MediaRecorder
  for (const a of capturedAudioBlobs) {
    files.push({ blob: await blobToBase64(a.blob), filename: a.filename, type: a.type || 'audio/webm' });
  }
  // Video blobs captured via MediaRecorder
  for (const v of capturedVideoBlobs) {
    files.push({ blob: await blobToBase64(v.blob), filename: v.filename, type: v.type || 'video/webm' });
  }

  return {
    reportId,
    project,
    timestamp,
    notes,
    manpower,
    safetyFlags,
    location,
    task: taskMeta,
    qtyCompleted,
    pctToday,
    files,
    stagedFileIds,
    narrative,
    summaryText,
    fieldTech: fieldTechName,
    crewHours: crewSnapshot.hours,
    crewRate: crewSnapshot.rate,
    crewCost: crewSnapshot.dailyCost,
    materialRequests,
    assignedRoster,
    // include token for SW background sync path (server supports reading from body)
    ...(idToken ? { idToken } : {}),
    // Include Acumatica linkage if selected from synced list
    ...getSelectedAcumaticaJobMeta()
  };
}

async function uploadFileChunked(file, reportId) {
  const chunkSize = 1024 * 1024 * 2; // 2MB
  const totalChunks = Math.ceil(file.size / chunkSize);
  const fileId = `${file.name}-${Math.random().toString(36).slice(2,8)}`;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const slice = file.slice(start, end);
    const blob64 = await blobToBase64(slice);
    const body = {
      action: 'upload_chunk',
      reportId,
      fileId,
      chunkIndex: i,
      totalChunks,
      blob: blob64,
      type: file.type
    };
    const res = await fetch(APPS_SCRIPT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Chunk upload failed');
  }
  const finalizeRes = await fetch(APPS_SCRIPT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ action: 'finalize_upload', reportId, fileId, filename: file.name, type: file.type })
  });
  if (!finalizeRes.ok) throw new Error('Finalize upload failed');
  const data = await finalizeRes.json();
  return data && data.stagedFileId ? data.stagedFileId : null;
}

async function sendReport(payload) {
  const res = await fetch(APPS_SCRIPT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Upload failed ${res.status}`);
  return res.json();
}

async function syncQueue() {
  try {
    if (!navigator.onLine) return;
    const all = await getQueuedReports();
    if (!all.length) return;
    statusEl.textContent = `Syncing ${all.length} report(s)...`;
    for (const item of all) {
      // respect backoff
      if (item.nextAttempt && Date.now() < item.nextAttempt) continue;
      try {
        await sendReport(item.payload);
        await removeQueuedReport(item.id);
        lastSyncEl.textContent = new Date().toLocaleTimeString();
      } catch (err) {
        console.warn('Retry later for id', item.id, err);
        const attempts = (item.attempts || 0) + 1;
        const nextAttempt = computeNextBackoff(attempts);
        const db = await openDb();
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).put({ ...item, attempts, nextAttempt });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
    statusEl.textContent = 'Sync complete.';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Sync error. Will retry.';
  }
  await updateQueueUI();
}

async function getLocationSafe() {
  if (!('geolocation' in navigator)) return null;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 });
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy
    };
  } catch {
    return null;
  }
}
reportForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Preparing report...';
  const payload = await buildPayloadFromForm();
  const attemptOnline = navigator.onLine;

  if (attemptOnline) {
    try {
      await sendReport(payload);
      statusEl.textContent = 'Report submitted successfully.';
      reportForm.reset();
      capturedAudioBlobs = [];
      capturedVideoBlobs = [];
      audioList.innerHTML = '';
      photoPreview.innerHTML = '';
      videoList.innerHTML = '';
      resetNarrationOverlay();
      populateFieldTechDropdown();
      updateCrewCostLens();
      updateSummaryPreview();
      lastSyncEl.textContent = new Date().toLocaleTimeString();
      return;
    } catch (err) {
      console.warn('Online send failed; queueing offline', err);
    }
  }

  await enqueueReport({ createdAt: Date.now(), attempts: 0, nextAttempt: Date.now(), payload });
  statusEl.textContent = 'No connection. Report saved offline and will sync automatically.';
  await updateQueueUI();

  // Try background sync if available
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('field-reports-sync');
    } catch (err) {
      // ignore
    }
  }
});

// Expose queue operations to Service Worker via postMessage if needed
// Not used right now; SW reads IndexedDB directly in same origin scope.

// -------- Image compression helpers --------
async function compressImageFile(file, { maxWidth = 1600, quality = 0.8 } = {}) {
  const bitmap = await createImageBitmap(file);
  const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const targetW = Math.round(bitmap.width * ratio);
  const targetH = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type || 'image/jpeg', quality));
  return new File([blob], file.name, { type: blob.type, lastModified: Date.now() });
}

// -------- Google Identity Services --------
function initGoogleSignIn() {
  const token = localStorage.getItem('kse_id_token');
  const email = localStorage.getItem('kse_user_email');
  if (token && email) {
    idToken = token;
    authUser.textContent = email;
  }
  if (!window.google || !window.google.accounts || !GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com')) return;
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
  window.google.accounts.id.renderButton(gsiSignIn, { theme: 'outline', size: 'medium' });
}

function handleCredentialResponse(response) {
  // response.credential is a JWT ID token
  idToken = response.credential;
  // Optionally decode to show email (not verifying signature here)
  try {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    const email = payload.email || 'Signed in';
    authUser.textContent = email;
    localStorage.setItem('kse_id_token', idToken);
    localStorage.setItem('kse_user_email', email);
  } catch {
    authUser.textContent = 'Signed in';
  }
}

window.addEventListener('DOMContentLoaded', initGoogleSignIn);

// -------- Projects list (favorites) --------
const DEFAULT_PROJECTS = [
  'Substation Upgrade - North',
  'Solar Farm Interconnect',
  'Data Center Fit-Out',
  'Hospital Expansion'
];

function loadProjects() {
  const saved = JSON.parse(localStorage.getItem('kse_projects') || '[]');
  const list = [...new Set([...DEFAULT_PROJECTS, ...saved])];
  projectSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a project...';
  projectSelect.appendChild(placeholder);
  if (list.length) {
    const groupFav = document.createElement('optgroup');
    groupFav.label = 'Favorites';
    for (const p of list) {
      const opt = document.createElement('option');
      opt.value = `custom:${p}`;
      opt.textContent = p;
      opt.dataset.custom = '1';
      groupFav.appendChild(opt);
    }
    projectSelect.appendChild(groupFav);
  }
  const jobs = loadAcumaticaJobsFromCache();
  if (jobs.length) {
    const groupJobs = document.createElement('optgroup');
    groupJobs.label = 'Acumatica Jobs';
    for (const j of jobs) {
      const opt = document.createElement('option');
      opt.value = `job:${j.id}`;
      opt.textContent = `${j.number || j.id} — ${j.name || ''}`;
      opt.dataset.jobid = j.id;
      opt.dataset.jobnumber = j.number || '';
      opt.dataset.jobname = j.name || '';
      groupJobs.appendChild(opt);
    }
    projectSelect.appendChild(groupJobs);
  }
  populateFieldTechDropdown();
}

addProjectBtn.addEventListener('click', () => {
  const name = prompt('New project name');
  if (!name) return;
  const saved = JSON.parse(localStorage.getItem('kse_projects') || '[]');
  if (!saved.includes(name)) {
    saved.push(name);
    localStorage.setItem('kse_projects', JSON.stringify(saved));
  }
  loadProjects();
  projectSelect.value = `custom:${name}`;
});

// -------- Acumatica jobs sync --------
function loadAcumaticaJobsFromCache() {
  try {
    const raw = JSON.parse(localStorage.getItem('kse_acu_jobs') || '[]');
    if (Array.isArray(raw)) {
      acumaticaJobs = raw;
      return raw;
    }
  } catch (err) {
    console.warn('Failed to parse cached Acumatica jobs', err);
  }
  return [];
}

async function syncAcumaticaJobs() {
  if (!idToken) {
    alert('Please sign in first.');
    return;
  }
  try {
    const url = `${APPS_SCRIPT_ENDPOINT}?action=jobs`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      }
    });
    if (!res.ok) throw new Error('Failed to fetch jobs');
    const data = await res.json();
    if (!data || !Array.isArray(data.jobs)) throw new Error('Invalid jobs response');
    acumaticaJobs = data.jobs;
    localStorage.setItem('kse_acu_jobs', JSON.stringify(acumaticaJobs));
    loadProjects();
    statusEl.textContent = `Synced ${acumaticaJobs.length} jobs from Acumatica.`;
  } catch (err) {
    console.error(err);
    alert('Could not sync jobs. Check connection and settings.');
  }
}

function getSelectedAcumaticaJobMeta() {
  const opt = projectSelect.options[projectSelect.selectedIndex] || {};
  if (opt && opt.dataset && opt.dataset.jobid) {
    return {
      acumaticaJobId: opt.dataset.jobid,
      acumaticaJobNumber: opt.dataset.jobnumber || '',
      acumaticaJobName: opt.dataset.jobname || ''
    };
  }
  return {};
}

if (typeof syncJobsBtn !== 'undefined' && syncJobsBtn) {
  syncJobsBtn.addEventListener('click', syncAcumaticaJobs);
}

// -------- Tasks sync & helpers --------
async function syncTasks() {
  const opt = projectSelect.options[projectSelect.selectedIndex] || {};
  // prefer Acumatica job number/name; otherwise project text
  const projectName = opt && opt.dataset && opt.dataset.jobname ? opt.dataset.jobname : (projectSelect.value || '');
  if (!projectName) {
    alert('Select a project first.');
    return;
  }
  if (!idToken) {
    alert('Please sign in first.');
    return;
  }
  try {
    const url = `${APPS_SCRIPT_ENDPOINT}?action=tasks&project=${encodeURIComponent(projectName)}`;
    const res = await fetch(url, { headers: { ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) } });
    if (!res.ok) throw new Error('Failed to fetch tasks');
    const data = await res.json();
    fillTasks(data.tasks || []);
  } catch (e) {
    alert('Could not sync tasks for this project.');
  }
}

function fillTasks(tasks) {
  if (!taskSelect) return;
  taskSelect.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None';
  taskSelect.appendChild(none);
  for (const t of tasks) {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = `${t.code ? t.code + ' — ' : ''}${t.name}`;
    opt.dataset.code = t.code || '';
    opt.dataset.name = t.name || '';
    opt.dataset.budgetedQty = t.budgetedQty != null ? String(t.budgetedQty) : '';
    taskSelect.appendChild(opt);
  }
}

function getSelectedTaskMeta() {
  if (!taskSelect) return {};
  const opt = taskSelect.options[taskSelect.selectedIndex] || {};
  if (!opt || !opt.value) return {};
  return {
    id: opt.value,
    code: opt.dataset.code || '',
    name: opt.dataset.name || '',
    budgetedQty: opt.dataset.budgetedQty ? Number(opt.dataset.budgetedQty) : null
  };
}

if (syncTasksBtn) {
  syncTasksBtn.addEventListener('click', syncTasks);
}

retryAllBtn?.addEventListener('click', () => {
  syncQueue().catch((err) => console.error('Retry all failed', err));
});

// -------- Settings dialog --------
function loadFlags() {
  const flags = JSON.parse(localStorage.getItem('kse_flags') || '{}');
  if (typeof flags.compression === 'boolean') enableImageCompression = flags.compression;
  if (typeof flags.chunks === 'boolean') enableChunkedUploads = flags.chunks;
  flagCompression.checked = enableImageCompression;
  flagChunks.checked = enableChunkedUploads;
}
settingsBtn.addEventListener('click', () => {
  loadFlags();
  settingsDialog.showModal();
});
settingsCancel.addEventListener('click', (e) => {
  e.preventDefault();
  settingsDialog.close();
});
settingsSave.addEventListener('click', (e) => {
  e.preventDefault();
  const flags = {
    compression: !!flagCompression.checked,
    chunks: !!flagChunks.checked
  };
  localStorage.setItem('kse_flags', JSON.stringify(flags));
  enableImageCompression = flags.compression;
  enableChunkedUploads = flags.chunks;
  settingsDialog.close();
});

// Initial populate
loadProjects();
populateFieldTechDropdown();
renderPromptChips(promptPresetSelect?.value || 'general');
updateQueueUI();


// -------- Speech-to-Text (Web Speech API) --------
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  if (dictateBtn && sttStatus) {
    dictateBtn.disabled = true;
    sttStatus.textContent = 'Speech: not supported';
  }
} else {
  if (dictateBtn) {
    dictateBtn.addEventListener('click', () => {
      if (!recognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onstart = () => {
          recognizing = true;
          if (sttStatus) sttStatus.textContent = 'Speech: listening...';
          dictateBtn.textContent = 'Stop Dictation';
        };
        recognition.onerror = () => {
          recognizing = false;
          if (sttStatus) sttStatus.textContent = 'Speech: error';
          dictateBtn.textContent = 'Dictate';
        };
        recognition.onend = () => {
          recognizing = false;
          if (sttStatus) sttStatus.textContent = 'Speech: idle';
          dictateBtn.textContent = 'Dictate';
        };
        recognition.onresult = (event) => {
          let finalText = '';
          interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalText += transcript + ' ';
            } else {
              interimTranscript += transcript;
            }
          }
          if (finalText) {
            const notesEl = document.getElementById('notes');
            const existing = notesEl.value;
            notesEl.value = (existing ? existing + ' ' : '') + finalText.trim();
          }
          if (sttStatus) sttStatus.textContent = interimTranscript ? `Speech: ${interimTranscript}` : 'Speech: listening...';
        };
      }
      if (recognizing) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch {
          // start may throw if already started; ignore
        }
      }
    });
  }
}

// -------- In-app Video Recording --------
async function startVideoRecording() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
  } catch (err) {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      alert('Camera/microphone access is required for video capture.');
      return;
    }
  }
  cameraPreview.srcObject = videoStream;
  videoChunks = [];
  try {
    videoMediaRecorder = new MediaRecorder(videoStream, { mimeType: 'video/webm;codecs=vp9' });
  } catch (e) {
    try {
      videoMediaRecorder = new MediaRecorder(videoStream, { mimeType: 'video/webm' });
    } catch {
      videoMediaRecorder = new MediaRecorder(videoStream);
    }
  }
  videoMediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) videoChunks.push(e.data); };
  videoMediaRecorder.onstart = () => {
    if (videoRecordStatus) videoRecordStatus.textContent = 'Recording...';
    if (videoRecordBtn) videoRecordBtn.textContent = 'Stop Video';
  };
  videoMediaRecorder.onstop = () => {
    const blob = new Blob(videoChunks, { type: videoMediaRecorder.mimeType || 'video/webm' });
    capturedVideoBlobs.push({ blob, filename: `field-video-${Date.now()}.webm`, type: blob.type || 'video/webm' });
    const li = document.createElement('li');
    li.textContent = capturedVideoBlobs[capturedVideoBlobs.length - 1].filename;
    videoList.appendChild(li);
    if (videoRecordStatus) videoRecordStatus.textContent = 'Idle';
    if (videoRecordBtn) videoRecordBtn.textContent = 'Start Video';
    // stop tracks and clear preview
    if (cameraPreview && cameraPreview.srcObject) {
      const tracks = cameraPreview.srcObject.getTracks();
      tracks.forEach(t => t.stop());
      cameraPreview.srcObject = null;
    }
    videoStream = null;
  };
  videoMediaRecorder.start();
}

function stopVideoRecording() {
  if (videoMediaRecorder && videoMediaRecorder.state !== 'inactive') {
    videoMediaRecorder.stop();
  }
}

if (videoRecordBtn) {
  videoRecordBtn.addEventListener('click', async () => {
    if (!videoMediaRecorder || videoMediaRecorder.state === 'inactive') {
      await startVideoRecording();
    } else {
      stopVideoRecording();
    }
  });
}
