/* KSE CRM Web App
 * - SSO (Google Identity), Authorization via ID token
 * - Fetch companies/contacts, list and log interactions
 * - Offline queue via IndexedDB + background sync
 * - Filters and exports
 */

const APPS_SCRIPT_ENDPOINT = 'https://script.google.com/macros/s/YOUR_APPS_SCRIPT_WEB_APP_URL/exec'; // TODO replace
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // TODO replace
const DB_NAME = 'kse-crm';
const QUEUE_STORE = 'touchesQueue';

const gsiSignIn = document.getElementById('gsiSignIn');
const authUser = document.getElementById('authUser');
const networkStatusEl = document.getElementById('networkStatus');
const lastSyncEl = document.getElementById('lastSync');
const statusEl = document.getElementById('status');
const companySel = document.getElementById('company');
const contactSel = document.getElementById('contact');
const filterCompany = document.getElementById('filterCompany');
const filterContact = document.getElementById('filterContact');
const filterType = document.getElementById('filterType');
const filterFrom = document.getElementById('filterFrom');
const filterTo = document.getElementById('filterTo');
const filterSearch = document.getElementById('filterSearch');
const applyFiltersBtn = document.getElementById('applyFilters');
const resetFiltersBtn = document.getElementById('resetFilters');
const refreshBtn = document.getElementById('refreshBtn');
const listEl = document.getElementById('interactions');
const countEl = document.getElementById('count');
const exportCsvBtn = document.getElementById('exportCsv');
const exportJsonBtn = document.getElementById('exportJson');
const touchForm = document.getElementById('touchForm');
const attachmentsInput = document.getElementById('attachments');
const dictateBtn = document.getElementById('dictateBtn');
const sttStatus = document.getElementById('sttStatus');
let recognition = null;
let recognizing = false;

let idToken = null;
let companies = [];
let contacts = [];
let interactions = [];

function setNetworkStatus() {
  networkStatusEl.textContent = navigator.onLine ? 'online' : 'offline';
}
setNetworkStatus();
window.addEventListener('online', () => { setNetworkStatus(); syncQueue(); });
window.addEventListener('offline', setNetworkStatus);

// IndexedDB
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueTouch(item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedTouches() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedTouch(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// SSO
function initSSO() {
  const tok = localStorage.getItem('kse_id_token');
  const email = localStorage.getItem('kse_user_email');
  if (tok && email) {
    idToken = tok;
    authUser.textContent = email;
  }
  if (!window.google || !window.google.accounts || !GOOGLE_CLIENT_ID.includes('.apps.googleusercontent.com')) return;
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse
  });
  window.google.accounts.id.renderButton(gsiSignIn, { theme: 'outline', size: 'medium' });
}
function handleCredentialResponse(resp) {
  idToken = resp.credential;
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
window.addEventListener('DOMContentLoaded', initSSO);

// API helpers
async function apiGet(path) {
  const url = `${APPS_SCRIPT_ENDPOINT}?${path}`;
  const res = await fetch(url, { headers: { ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) } });
  if (!res.ok) throw new Error(`GET ${path} failed ${res.status}`);
  return res.json();
}
async function apiPost(body) {
  const res = await fetch(APPS_SCRIPT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST failed ${res.status}`);
  return res.json();
}

// Load companies/contacts
async function loadCompaniesAndContacts() {
  const comp = await apiGet('action=companies');
  companies = comp.companies || [];
  const cont = await apiGet('action=contacts');
  contacts = cont.contacts || [];
  populateCompanyContactSelectors();
}

function populateCompanyContactSelectors() {
  function fillSelect(sel, items, valueKey, labelKey, includeAny) {
    sel.innerHTML = '';
    if (includeAny) {
      const any = document.createElement('option');
      any.value = '';
      any.textContent = 'Any';
      sel.appendChild(any);
    }
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it[valueKey];
      opt.textContent = it[labelKey];
      sel.appendChild(opt);
    }
  }
  fillSelect(companySel, companies, 'id', 'name', false);
  fillSelect(filterCompany, [{ id: '', name: 'Any' }, ...companies], 'id', 'name', false);
  updateContactOptions();
  updateFilterContactOptions();
}

function updateContactOptions() {
  const companyId = companySel.value;
  const options = contacts.filter(c => !companyId || c.companyId === companyId);
  contactSel.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None';
  contactSel.appendChild(none);
  for (const c of options) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.title || ''})`;
    contactSel.appendChild(opt);
  }
}
companySel.addEventListener('change', updateContactOptions);

function updateFilterContactOptions() {
  const companyId = filterCompany.value;
  const options = contacts.filter(c => !companyId || c.companyId === companyId);
  filterContact.innerHTML = '';
  const any = document.createElement('option');
  any.value = '';
  any.textContent = 'Any';
  filterContact.appendChild(any);
  for (const c of options) {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name} (${c.title || ''})`;
    filterContact.appendChild(opt);
  }
}
filterCompany.addEventListener('change', updateFilterContactOptions);

// List interactions
async function loadInteractions(applyFilter = true) {
  const params = new URLSearchParams({ action: 'interactions' });
  if (applyFilter) {
    if (filterCompany.value) params.set('companyId', filterCompany.value);
    if (filterContact.value) params.set('contactId', filterContact.value);
    if (filterType.value) params.set('type', filterType.value);
    if (filterFrom.value) params.set('from', filterFrom.value);
    if (filterTo.value) params.set('to', filterTo.value);
    if (filterSearch.value) params.set('q', filterSearch.value);
  }
  const data = await apiGet(params.toString());
  interactions = data.interactions || [];
  renderInteractions();
  renderTrendChart();
}

function renderInteractions() {
  listEl.innerHTML = '';
  countEl.textContent = `${interactions.length} interactions`;
  for (const it of interactions) {
    const li = document.createElement('li');
    li.className = 'py-3';
    li.innerHTML = `
      <div class="flex items-start justify-between">
        <div>
          <div class="font-medium">${escapeHtml(it.companyName || '')} ${it.contactName ? '· ' + escapeHtml(it.contactName) : ''}</div>
          <div class="text-sm text-slate-600">${escapeHtml(it.type || '')} via ${escapeHtml(it.channel || '')} — ${new Date(it.timestamp).toLocaleString()} — by ${escapeHtml(it.userEmail || '')}</div>
        </div>
        <div class="text-xs text-slate-500">${(it.tags || []).map(t => `<span class="inline-block bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5 ml-1">${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="mt-2 text-sm">${escapeHtml(it.subject || '')}</div>
      <div class="text-sm text-slate-700 whitespace-pre-wrap">${escapeHtml(it.notes || '')}</div>
    `;
    listEl.appendChild(li);
  }
}

// Trend chart (last 14 days)
function renderTrendChart() {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;
  const now = new Date();
  const days = [];
  const counts = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = d.toISOString().slice(0,10);
    days.push(key);
    counts.push(0);
  }
  const idxMap = Object.fromEntries(days.map((d,i) => [d, i]));
  for (const it of interactions) {
    const key = new Date(it.timestamp).toISOString().slice(0,10);
    if (idxMap[key] != null) counts[idxMap[key]] += 1;
  }
  new Chart(ctx, {
    type: 'line',
    data: { labels: days, datasets: [{ label: 'Interactions', data: counts, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.2)', tension: 0.25, fill: true }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } } }
  });
}

applyFiltersBtn.addEventListener('click', () => loadInteractions(true));
resetFiltersBtn.addEventListener('click', () => {
  filterCompany.value = '';
  filterContact.value = '';
  filterType.value = '';
  filterFrom.value = '';
  filterTo.value = '';
  filterSearch.value = '';
  updateFilterContactOptions();
  loadInteractions(true);
});
refreshBtn.addEventListener('click', () => loadInteractions(true));

// Submit interaction
touchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = await buildTouchPayload();
  if (navigator.onLine) {
    try {
      await apiPost({ action: 'interaction', ...payload });
      statusEl.textContent = 'Interaction logged.';
      lastSyncEl.textContent = new Date().toLocaleTimeString();
      touchForm.reset();
      await loadInteractions(true);
      return;
    } catch (err) {
      console.warn('Online post failed, queueing', err);
    }
  }
  await enqueueTouch({ createdAt: Date.now(), payload });
  statusEl.textContent = 'Offline. Interaction queued and will sync.';
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('crm-sync');
    } catch {}
  }
});

async function buildTouchPayload() {
  const companyId = companySel.value;
  const contactId = contactSel.value || '';
  const type = document.getElementById('type').value;
  const channel = document.getElementById('channel').value;
  const subject = document.getElementById('subject').value || '';
  const notes = document.getElementById('notes').value || '';
  const tags = (document.getElementById('tags').value || '').split(',').map(s => s.trim()).filter(Boolean);
  const nextFollowUp = document.getElementById('nextFollowUp').value || '';
  const outcome = document.getElementById('outcome').value || '';
  const sentiment = Number(document.getElementById('sentiment').value || 3);
  const duration = Number(document.getElementById('duration').value || 0);
  const timestamp = new Date().toISOString();
  const files = [];
  for (const f of attachmentsInput.files || []) {
    files.push({ filename: f.name, type: f.type, blob: await blobToBase64(f) });
  }
  return {
    idToken,
    companyId,
    contactId,
    type,
    channel,
    subject,
    notes,
    tags,
    nextFollowUp,
    outcome,
    sentiment,
    duration,
    timestamp,
    files
  };
}

async function syncQueue() {
  const queued = await getQueuedTouches();
  if (!queued.length) return;
  statusEl.textContent = `Syncing ${queued.length} item(s)...`;
  for (const item of queued) {
    try {
      await apiPost({ action: 'interaction', ...item.payload });
      await removeQueuedTouch(item.id);
      lastSyncEl.textContent = new Date().toLocaleTimeString();
    } catch (e) {
      // keep for later
    }
  }
  statusEl.textContent = 'Sync complete.';
  await loadInteractions(true);
}

function blobToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Exports
exportCsvBtn.addEventListener('click', () => {
  const headers = ['Timestamp','Company','Contact','Type','Channel','Subject','Notes','Tags','Outcome','Sentiment','Duration','User'];
  const rows = interactions.map(i => [
    i.timestamp, i.companyName || '', i.contactName || '', i.type || '', i.channel || '', i.subject || '',
    (i.notes || '').replace(/\n/g, ' '), (i.tags || []).join('|'), i.outcome || '', i.sentiment || '', i.duration || '', i.userEmail || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(s => `"${String(s).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kse-crm-interactions-${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
});
exportJsonBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(interactions, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kse-crm-interactions-${Date.now()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
});

// Initial load
(async function init() {
  try {
    await loadCompaniesAndContacts();
    await loadInteractions(true);
  } catch (e) {
    // ignore
  }
})();

// Speech to text + auto-fill
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  if (dictateBtn && sttStatus) {
    dictateBtn.disabled = true;
    sttStatus.textContent = 'Speech: not supported';
  }
} else if (dictateBtn) {
  dictateBtn.addEventListener('click', () => {
    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => { recognizing = true; sttStatus.textContent = 'Speech: listening...'; dictateBtn.textContent = 'Stop'; };
      recognition.onerror = () => { recognizing = false; sttStatus.textContent = 'Speech: error'; dictateBtn.textContent = 'Dictate'; };
      recognition.onend = () => { recognizing = false; sttStatus.textContent = 'Speech: idle'; dictateBtn.textContent = 'Dictate'; };
      recognition.onresult = (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += t + ' ';
        }
        if (finalText) {
          autoFillFromSpeech(finalText.trim());
        }
      };
    }
    if (recognizing) recognition.stop(); else recognition.start();
  });
}

function autoFillFromSpeech(text) {
  if (sttStatus) sttStatus.textContent = `Heard: "${text}"`;
  const lower = text.toLowerCase();
  // Infer type/channel
  let type = 'Other', channel = 'Other';
  if (/\b(call|called|phone)\b/.test(lower)) { type = 'Call'; channel = 'Phone'; }
  else if (/\b(meeting|met|in person|in-person|site visit)\b/.test(lower)) { type = 'Meeting'; channel = 'In-Person'; }
  else if (/\bemail|emailed\b/.test(lower)) { type = 'Email'; channel = 'Email'; }
  else if (/\bvideo|teams|zoom|google meet\b/.test(lower)) { type = 'Meeting'; channel = 'Video'; }
  document.getElementById('type').value = type;
  document.getElementById('channel').value = channel;

  // Extract "with <contact>" and "at <company>"
  let contactName = '';
  let companyName = '';
  const withMatch = text.match(/\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})/i);
  if (withMatch) contactName = withMatch[1].trim();
  const atMatch = text.match(/\bat\s+([A-Z0-9][A-Za-z0-9&\-\s]+?)(?:\s+(?:about|regarding|re|re:)|$)/i);
  if (atMatch) companyName = atMatch[1].trim();

  // Subject after "about ..."
  let subject = '';
  const aboutMatch = text.match(/\babout\s+(.+)$/i);
  if (aboutMatch) subject = aboutMatch[1].trim();

  // Fill subject and notes
  document.getElementById('subject').value = subject || text.slice(0, 120);
  const notesEl = document.getElementById('notes');
  notesEl.value = (notesEl.value ? notesEl.value + '\n' : '') + text;

  // Attempt to select company/contact by name (simple contains match)
  if (companyName) {
    const comp = companies.find(c => c.name.toLowerCase().includes(companyName.toLowerCase()));
    if (comp) {
      companySel.value = comp.id;
      updateContactOptions();
    }
  }
  if (contactName) {
    const contOpts = Array.from(contactSel.options);
    const found = contOpts.find(o => o.textContent.toLowerCase().includes(contactName.toLowerCase()));
    if (found) contactSel.value = found.value;
  }
}


