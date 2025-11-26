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
const ENABLE_IMAGE_COMPRESSION = true;
const ENABLE_CHUNKED_UPLOADS = true; // Chunked uploads enabled
// TODO: Replace with your deployed Apps Script Web App URL
const APPS_SCRIPT_ENDPOINT = 'https://script.google.com/macros/s/YOUR_APPS_SCRIPT_WEB_APP_URL/exec';
// TODO: Replace with your Google Client ID
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

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
document.getElementById('photos').addEventListener('change', async (e) => {
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
  }, 'image/png', 0.95);
});
annotateCancel?.addEventListener('click', (e) => { e.preventDefault(); annotateDialog.close(); });

const capturedAnnotatedImageBlobs = [];
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

  const files = [];
  const stagedFileIds = [];
  // Photos
  const photos = document.getElementById('photos').files;
  for (const f of photos) {
    if (ENABLE_CHUNKED_UPLOADS && f.size > 5 * 1024 * 1024) {
      const ref = await uploadFileChunked(f, reportId);
      if (ref) stagedFileIds.push(ref);
    } else if (ENABLE_IMAGE_COMPRESSION && f.type && f.type.startsWith('image/')) {
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
    if (ENABLE_CHUNKED_UPLOADS && f.size > 5 * 1024 * 1024) {
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
      audioList.innerHTML = '';
      photoPreview.innerHTML = '';
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
  projectSelect.value = name;
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
  if (typeof flags.compression === 'boolean') window.ENABLE_IMAGE_COMPRESSION = flags.compression;
  if (typeof flags.chunks === 'boolean') window.ENABLE_CHUNKED_UPLOADS = flags.chunks;
  flagCompression.checked = window.ENABLE_IMAGE_COMPRESSION;
  flagChunks.checked = window.ENABLE_CHUNKED_UPLOADS;
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
  window.ENABLE_IMAGE_COMPRESSION = flags.compression;
  window.ENABLE_CHUNKED_UPLOADS = flags.chunks;
  settingsDialog.close();
});

// Initial populate
loadProjects();
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
