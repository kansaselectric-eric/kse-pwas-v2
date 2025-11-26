/* KSE Estimating Journal PWA
 * - Measurements, notes, media, bid info
 * - Offline queue via IndexedDB + Background Sync
 * - Chunked uploads to Apps Script
 */

const DB_NAME = 'kse-estimating';
const STORE_NAME = 'entriesQueue';
const ENABLE_IMAGE_COMPRESSION = true;
const ENABLE_CHUNKED_UPLOADS = true;
const APPS_SCRIPT_ENDPOINT = 'https://script.google.com/macros/s/YOUR_ESTIMATING_APPS_SCRIPT_URL/exec';
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

const form = document.getElementById('estimateForm');
const networkStatusEl = document.getElementById('networkStatus');
const statusEl = document.getElementById('status');
const queueSummary = document.getElementById('queueSummary');
const queueList = document.getElementById('queueList');
const retryAllBtn = document.getElementById('retryAllBtn');
const settingsBtn = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const settingsSave = document.getElementById('settingsSave');
const settingsCancel = document.getElementById('settingsCancel');
const flagCompression = document.getElementById('flagCompression');
const flagChunks = document.getElementById('flagChunks');
const lastSyncEl = document.getElementById('lastSync');
const measureBody = document.getElementById('measureBody');
const addMeasurementBtn = document.getElementById('addMeasurement');
const defaultUnitSel = document.getElementById('defaultUnit');
const templateSelect = document.getElementById('templateSelect');
const insertTemplateBtn = document.getElementById('insertTemplate');
const sectionSelect = document.getElementById('sectionSelect');
const addSectionBtn = document.getElementById('addSectionBtn');
const savePdfBtn = document.getElementById('savePdfBtn');
const dictateBtn = document.getElementById('dictateBtn');
const sttStatus = document.getElementById('sttStatus');
const recordBtn = document.getElementById('recordBtn');
const recordStatus = document.getElementById('recordStatus');
const audioList = document.getElementById('audioList');
const videoRecordBtn = document.getElementById('videoRecordBtn');
const videoRecordStatus = document.getElementById('videoRecordStatus');
const cameraPreview = document.getElementById('cameraPreview');
const videoList = document.getElementById('videoList');
const photoPreview = document.getElementById('photoPreview');
const annotateDialog = document.getElementById('annotateDialog');
const annotateCanvas = document.getElementById('annotateCanvas');
const annotateSave = document.getElementById('annotateSave');
const annotateCancel = document.getElementById('annotateCancel');
const gsiSignIn = document.getElementById('gsiSignIn');
const authUser = document.getElementById('authUser');

let idToken = null;
let mediaRecorder = null;
let audioChunks = [];
let capturedAudioBlobs = [];
let videoMediaRecorder = null;
let videoStream = null;
let videoChunks = [];
let capturedVideoBlobs = [];
let recognition = null;
let recognizing = false;
const capturedAnnotatedImageBlobs = [];

function setNetworkStatus() {
  const online = navigator.onLine;
  networkStatusEl.textContent = online ? 'online' : 'offline';
}
setNetworkStatus();
window.addEventListener('online', () => { setNetworkStatus(); syncQueue(); });
window.addEventListener('offline', setNetworkStatus);

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

async function enqueueEntry(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedEntries() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueuedEntry(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateQueueUI() {
  const items = await getQueuedEntries();
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
        <button data-id="${item.id}" class="retryBtn px-2 py-1 rounded btn-primary">Retry</button>
        <button data-id="${item.id}" class="removeBtn px-2 py-1 rounded btn-neutral">Remove</button>
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
    await removeQueuedEntry(id);
    await updateQueueUI();
  }));
}

function jitter(ms) {
  return Math.floor(ms * (0.8 + Math.random() * 0.4));
}
function computeNextBackoff(attempts) {
  const base = Math.min(60 * 60 * 1000, 2000 * Math.pow(2, attempts));
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
    await sendEntry(item.payload);
    await removeQueuedEntry(id);
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

function addMeasurementRow(prefill = { label: '', value: '', unit: '' }) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="py-1 pr-2"><input type="text" class="w-full rounded border-slate-300 focus:border-sky-500 focus:ring-sky-500" value="${prefill.label}"></td>
    <td class="py-1 pr-2"><input type="number" step="any" class="w-full rounded border-slate-300 focus:border-sky-500 focus:ring-sky-500" value="${prefill.value}"></td>
    <td class="py-1 pr-2">
      <select class="w-full rounded border-slate-300 focus:border-sky-500 focus:ring-sky-500">
        <option${(prefill.unit||defaultUnitSel.value)==='ft'?' selected':''}>ft</option>
        <option${(prefill.unit||defaultUnitSel.value)==='in'?' selected':''}>in</option>
        <option${(prefill.unit||defaultUnitSel.value)==='yd'?' selected':''}>yd</option>
        <option${(prefill.unit||defaultUnitSel.value)==='m'?' selected':''}>m</option>
        <option${(prefill.unit||defaultUnitSel.value)==='mm'?' selected':''}>mm</option>
        <option${(prefill.unit||defaultUnitSel.value)==='ea'?' selected':''}>ea</option>
      </select>
    </td>
    <td class="py-1 pr-2 text-right"><button type="button" class="px-2 py-1 rounded btn-neutral text-xs removeRow">Remove</button></td>
  `;
  measureBody.appendChild(tr);
  tr.querySelector('.removeRow').addEventListener('click', () => tr.remove());
}
addMeasurementBtn.addEventListener('click', () => addMeasurementRow());

const MEASUREMENT_TEMPLATES = {
  conduit: [
    { label: 'Conduit length', unit: 'ft' },
    { label: 'Conduit size', unit: 'in' },
    { label: 'Bends', unit: 'ea' },
    { label: 'Pull boxes', unit: 'ea' }
  ],
  lighting: [
    { label: 'Fixtures', unit: 'ea' },
    { label: 'Switches', unit: 'ea' },
    { label: 'Dimmers', unit: 'ea' }
  ],
  trenching: [
    { label: 'Trench length', unit: 'ft' },
    { label: 'Depth', unit: 'ft' },
    { label: 'Width', unit: 'in' }
  ],
  panel: [
    { label: 'Main breaker (A)', unit: 'ea' },
    { label: 'Spaces', unit: 'ea' },
    { label: 'Feeder length', unit: 'ft' }
  ],
  cableTray: [
    { label: 'Tray length', unit: 'ft' },
    { label: 'Tray width', unit: 'in' },
    { label: 'Supports', unit: 'ea' }
  ],
  grounding: [
    { label: 'Ground rods', unit: 'ea' },
    { label: 'Bonding conductor length', unit: 'ft' },
    { label: 'Copper size (mm²)', unit: 'mm' }
  ]
};
insertTemplateBtn.addEventListener('click', () => {
  const key = templateSelect.value;
  if (!key || !MEASUREMENT_TEMPLATES[key]) return;
  for (const row of MEASUREMENT_TEMPLATES[key]) addMeasurementRow(row);
});

const SECTION_PRESETS = {
  roughIn: {
    notes: 'Rough-in: walls open, routing, boxes, rough wire pulls, coordination.',
    measures: [
      { label: 'Boxes', unit: 'ea' },
      { label: 'Home runs', unit: 'ea' },
      { label: 'MC/BX length', unit: 'ft' },
      { label: 'Conduit length', unit: 'ft' }
    ]
  },
  siteWork: {
    notes: 'Site Work: trenching, duct bank, vaults, site lighting, grounding.',
    measures: [
      { label: 'Trench length', unit: 'ft' },
      { label: 'Ducts (qty)', unit: 'ea' },
      { label: 'Vaults/handholes', unit: 'ea' },
      { label: 'Ground rods', unit: 'ea' }
    ]
  },
  gear: {
    notes: 'Gear & Equipment: switchboards, panels, transformers, feeders, terminations.',
    measures: [
      { label: 'Switchboards', unit: 'ea' },
      { label: 'Panels', unit: 'ea' },
      { label: 'Transformers', unit: 'ea' },
      { label: 'Feeder length', unit: 'ft' }
    ]
  },
  lighting: {
    notes: 'Lighting: fixtures, controls, sensors, emergency circuits.',
    measures: [
      { label: 'Fixtures', unit: 'ea' },
      { label: 'Controls devices', unit: 'ea' },
      { label: 'Sensors', unit: 'ea' }
    ]
  },
  lowVoltage: {
    notes: 'Low Voltage: data, access, cameras, fire alarm, pathways.',
    measures: [
      { label: 'Data drops', unit: 'ea' },
      { label: 'Cameras', unit: 'ea' },
      { label: 'Access doors', unit: 'ea' },
      { label: 'LV conduit length', unit: 'ft' }
    ]
  }
};

addSectionBtn.addEventListener('click', () => {
  const key = sectionSelect.value;
  if (!key || !SECTION_PRESETS[key]) return;
  const preset = SECTION_PRESETS[key];
  const notesEl = document.getElementById('notes');
  const heading = `\n\n— ${sectionSelect.options[sectionSelect.selectedIndex].text} —\n`;
  notesEl.value = (notesEl.value ? notesEl.value + heading : heading) + preset.notes;
  for (const m of preset.measures) addMeasurementRow(m);
});

document.getElementById('photos').addEventListener('change', async (e) => {
  photoPreview.innerHTML = '';
  const files = e.target.files || [];
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(f);
    const wrap = document.createElement('div');
    wrap.className = 'relative group';
    wrap.innerHTML = `
      <img src="${url}" class="w-full h-20 object-cover rounded border border-slate-200">
      <button type="button" class="annotateBtn absolute inset-0 flex items-center justify-center bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 rounded">Annotate</button>
    `;
    photoPreview.appendChild(wrap);
    wrap.querySelector('.annotateBtn').addEventListener('click', () => openAnnotateModal(url));
  }
});

function openAnnotateModal(url) {
  const ctx = annotateCanvas.getContext('2d');
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0,0,annotateCanvas.width, annotateCanvas.height);
    const r = Math.min(annotateCanvas.width / img.width, annotateCanvas.height / img.height);
    const w = img.width * r, h = img.height * r;
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
  annotateCanvas.toBlob(async (blob) => {
    if (!blob) return;
    const filename = `annotated-${Date.now()}.png`;
    capturedAnnotatedImageBlobs.push({ blob, filename, type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    img.className = 'w-full h-20 object-cover rounded border border-slate-200';
    photoPreview.appendChild(img);
    annotateDialog.close();
  }, 'image/png', 0.95);
});
annotateCancel?.addEventListener('click', (e) => { e.preventDefault(); annotateDialog.close(); });

recordBtn.addEventListener('click', async () => {
  if (!mediaRecorder) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        const name = `voice-memo-${Date.now()}.webm`;
        capturedAudioBlobs.push({ blob, filename: name, type: 'audio/webm' });
        const li = document.createElement('li');
        li.textContent = name;
        audioList.appendChild(li);
        recordStatus.textContent = 'Idle';
        mediaRecorder = null;
      };
      mediaRecorder.start();
      recordStatus.textContent = 'Recording...';
      recordBtn.textContent = 'Stop Recording';
    } catch (err) {
      alert('Microphone access is required for voice memos.');
    }
  } else {
    mediaRecorder.stop();
    recordBtn.textContent = 'Start Recording';
  }
});

async function startVideoRecording() {
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
  } catch (err) {
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch {
      alert('Camera/microphone access is required for video capture.');
      return;
    }
  }
  cameraPreview.srcObject = videoStream;
  videoChunks = [];
  try {
    videoMediaRecorder = new MediaRecorder(videoStream, { mimeType: 'video/webm;codecs=vp9' });
  } catch {
    videoMediaRecorder = new MediaRecorder(videoStream);
  }
  videoMediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) videoChunks.push(e.data); };
  videoMediaRecorder.onstart = () => {
    if (videoRecordStatus) videoRecordStatus.textContent = 'Recording...';
    if (videoRecordBtn) videoRecordBtn.textContent = 'Stop Video';
  };
  videoMediaRecorder.onstop = () => {
    const blob = new Blob(videoChunks, { type: videoMediaRecorder.mimeType || 'video/webm' });
    const name = `estimate-video-${Date.now()}.webm`;
    capturedVideoBlobs.push({ blob, filename: name, type: blob.type || 'video/webm' });
    const li = document.createElement('li');
    li.textContent = name;
    videoList.appendChild(li);
    if (videoRecordStatus) videoRecordStatus.textContent = 'Idle';
    if (videoRecordBtn) videoRecordBtn.textContent = 'Start Video';
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
videoRecordBtn.addEventListener('click', async () => {
  if (!videoMediaRecorder || videoMediaRecorder.state === 'inactive') {
    await startVideoRecording();
  } else {
    stopVideoRecording();
  }
});

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function compressImageFile(file, { maxWidth = 1600, quality = 0.8 } = {}) {
  const bitmap = await createImageBitmap(file);
  const ratio = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const targetW = Math.round(bitmap.width * ratio);
  const targetH = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = targetW; canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, file.type || 'image/jpeg', quality));
  return new File([blob], file.name, { type: blob.type, lastModified: Date.now() });
}

async function getLocationSafe() {
  if (!('geolocation' in navigator)) return null;
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 });
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch {
    return null;
  }
}

async function buildPayloadFromForm() {
  const project = document.getElementById('project').value;
  const client = document.getElementById('client').value || '';
  const rfp = document.getElementById('rfp').value || '';
  const bidDue = document.getElementById('bidDue').value || '';
  const bidAmount = Number(document.getElementById('bidAmount').value || 0);
  const probability = Number(document.getElementById('probability').value || 0);
  const notes = document.getElementById('notes').value || '';
  const timestamp = new Date().toISOString();
  const entryId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const location = await getLocationSafe();

  const measurements = [];
  measureBody.querySelectorAll('tr').forEach(tr => {
    const tds = tr.querySelectorAll('td');
    const label = tds[0].querySelector('input').value || '';
    const value = Number(tds[1].querySelector('input').value || 0);
    const unit = tds[2].querySelector('select').value || '';
    if (label) measurements.push({ label, value, unit });
  });

  const files = [];
  const stagedFileIds = [];
  const photos = document.getElementById('photos').files;
  for (const f of photos) {
    if (ENABLE_CHUNKED_UPLOADS && f.size > 5 * 1024 * 1024) {
      const ref = await uploadFileChunked(f, entryId);
      if (ref) stagedFileIds.push(ref);
    } else if (ENABLE_IMAGE_COMPRESSION && f.type && f.type.startsWith('image/')) {
      const compressed = await compressImageFile(f, { maxWidth: 1600, quality: 0.8 });
      files.push({ blob: await blobToBase64(compressed), filename: f.name, type: compressed.type || f.type });
    } else {
      files.push({ blob: await blobToBase64(f), filename: f.name, type: f.type || 'application/octet-stream' });
    }
  }
  for (const a of capturedAnnotatedImageBlobs) {
    files.push({ blob: await blobToBase64(a.blob), filename: a.filename, type: a.type || 'image/png' });
  }
  const videos = document.getElementById('videos').files;
  for (const f of videos) {
    if (ENABLE_CHUNKED_UPLOADS && f.size > 5 * 1024 * 1024) {
      const ref = await uploadFileChunked(f, entryId);
      if (ref) stagedFileIds.push(ref);
    } else {
      files.push({ blob: await blobToBase64(f), filename: f.name, type: f.type || 'video/*' });
    }
  }
  for (const a of capturedAudioBlobs) {
    files.push({ blob: await blobToBase64(a.blob), filename: a.filename, type: a.type || 'audio/webm' });
  }
  for (const v of capturedVideoBlobs) {
    files.push({ blob: await blobToBase64(v.blob), filename: v.filename, type: v.type || 'video/webm' });
  }

  return {
    entryId,
    project,
    client,
    rfp,
    bidDue,
    bidAmount,
    probability,
    notes,
    measurements,
    timestamp,
    location,
    files,
    stagedFileIds,
    ...(idToken ? { idToken } : {})
  };
}

async function uploadFileChunked(file, entryId) {
  const chunkSize = 1024 * 1024 * 2;
  const totalChunks = Math.ceil(file.size / chunkSize);
  const fileId = `${file.name}-${Math.random().toString(36).slice(2,8)}`;
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const slice = file.slice(start, end);
    const blob64 = await blobToBase64(slice);
    const body = {
      action: 'upload_chunk',
      entryId,
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
    body: JSON.stringify({ action: 'finalize_upload', entryId, fileId, filename: file.name, type: file.type })
  });
  if (!finalizeRes.ok) throw new Error('Finalize upload failed');
  const data = await finalizeRes.json();
  return data && data.stagedFileId ? data.stagedFileId : null;
}

async function sendEntry(payload) {
  const res = await fetch(APPS_SCRIPT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Upload failed ${res.status}`);
  return res.json();
}

async function generatePdf(payload) {
  const res = await fetch(APPS_SCRIPT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}) },
    body: JSON.stringify({ action: 'generate_pdf', ...payload })
  });
  if (!res.ok) throw new Error('PDF generation failed');
  return res.json();
}

async function syncQueue() {
  try {
    if (!navigator.onLine) return;
    const all = await getQueuedEntries();
    if (!all.length) return;
    statusEl.textContent = `Syncing ${all.length} entr${all.length>1?'ies':'y'}...`;
    for (const item of all) {
      if (item.nextAttempt && Date.now() < item.nextAttempt) continue;
      try {
        await sendEntry(item.payload);
        await removeQueuedEntry(item.id);
        lastSyncEl.textContent = new Date().toLocaleTimeString();
      } catch {
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
  } catch {
    statusEl.textContent = 'Sync error. Will retry.';
  }
  await updateQueueUI();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Preparing entry...';
  const payload = await buildPayloadFromForm();
  if (navigator.onLine) {
    try {
      await sendEntry(payload);
      statusEl.textContent = 'Entry saved.';
      form.reset();
      measureBody.innerHTML = '';
      capturedAudioBlobs = [];
      audioList.innerHTML = '';
      capturedVideoBlobs = [];
      videoList.innerHTML = '';
      photoPreview.innerHTML = '';
      lastSyncEl.textContent = new Date().toLocaleTimeString();
      return;
    } catch (err) {
      console.error('Online save failed, queueing offline', err);
    }
  }
  await enqueueEntry({ createdAt: Date.now(), attempts: 0, nextAttempt: Date.now(), payload });
  statusEl.textContent = 'No connection. Entry saved offline and will sync automatically.';
  await updateQueueUI();
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.sync.register('estimating-sync');
    } catch (err) {
      console.warn('Failed to register background sync', err);
    }
  }
});

retryAllBtn.addEventListener('click', syncQueue);

savePdfBtn.addEventListener('click', async () => {
  statusEl.textContent = 'Saving entry and generating PDF...';
  const payload = await buildPayloadFromForm();
  try {
    await sendEntry(payload);
    const pdf = await generatePdf(payload);
    statusEl.textContent = pdf && pdf.ok ? 'Saved and PDF generated.' : 'Saved; PDF failed.';
    form.reset();
    measureBody.innerHTML = '';
    capturedAudioBlobs = []; audioList.innerHTML = '';
    capturedVideoBlobs = []; videoList.innerHTML = '';
    photoPreview.innerHTML = '';
    lastSyncEl.textContent = new Date().toLocaleTimeString();
  } catch (e) {
    statusEl.textContent = 'Online save/PDF failed; saving offline.';
    await enqueueEntry({ createdAt: Date.now(), attempts: 0, nextAttempt: Date.now(), payload });
    await updateQueueUI();
  }
});

function loadFlags() {
  const flags = JSON.parse(localStorage.getItem('kse_est_flags') || '{}');
  if (typeof flags.compression === 'boolean') window.ENABLE_IMAGE_COMPRESSION = flags.compression;
  if (typeof flags.chunks === 'boolean') window.ENABLE_CHUNKED_UPLOADS = flags.chunks;
  flagCompression.checked = window.ENABLE_IMAGE_COMPRESSION;
  flagChunks.checked = window.ENABLE_CHUNKED_UPLOADS;
}
settingsBtn.addEventListener('click', () => { loadFlags(); settingsDialog.showModal(); });
settingsCancel.addEventListener('click', (e) => { e.preventDefault(); settingsDialog.close(); });
settingsSave.addEventListener('click', (e) => {
  e.preventDefault();
  const flags = { compression: !!flagCompression.checked, chunks: !!flagChunks.checked };
  localStorage.setItem('kse_est_flags', JSON.stringify(flags));
  window.ENABLE_IMAGE_COMPRESSION = flags.compression;
  window.ENABLE_CHUNKED_UPLOADS = flags.chunks;
  settingsDialog.close();
});

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
    callback: (response) => {
      idToken = response.credential;
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
  });
  window.google.accounts.id.renderButton(gsiSignIn, { theme: 'outline', size: 'medium' });
}
window.addEventListener('DOMContentLoaded', () => {
  initGoogleSignIn();
  updateQueueUI();
});

// Speech-to-Text
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  if (dictateBtn && sttStatus) {
    dictateBtn.disabled = true;
    sttStatus.textContent = 'Speech: not supported';
  }
} else {
  dictateBtn.addEventListener('click', () => {
    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onstart = () => { recognizing = true; sttStatus.textContent = 'Speech: listening...'; dictateBtn.textContent = 'Stop Dictation'; };
      recognition.onerror = () => { recognizing = false; sttStatus.textContent = 'Speech: error'; dictateBtn.textContent = 'Dictate'; };
      recognition.onend = () => { recognizing = false; sttStatus.textContent = 'Speech: idle'; dictateBtn.textContent = 'Dictate'; };
      recognition.onresult = (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalText += transcript + ' ';
        }
        if (finalText) {
          const notesEl = document.getElementById('notes');
          const existing = notesEl.value;
          notesEl.value = (existing ? existing + ' ' : '') + finalText.trim();
        }
      };
    }
    if (recognizing) {
      recognition.stop();
    } else {
      try {
        recognition.start();
      } catch (err) {
        console.error('Speech recognition start failed', err);
      }
    }
  });
}


