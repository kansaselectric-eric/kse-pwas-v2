/* Smart Contacts (next-gen)
 * - Hero metrics + saved segments
 * - Fuzzy filters + tag slicing
 * - Pinned targets + contact preview
 * - Segment handoff to Opportunity Scout
 */

const fileInput = document.getElementById('contactsFile');
const searchInput = document.getElementById('search');
const tagFilter = document.getElementById('tagFilter');
const sortSelect = document.getElementById('sortSelect');
const exportCsvBtn = document.getElementById('exportCsv');
const exportJsonBtn = document.getElementById('exportJson');
const clearDataBtn = document.getElementById('clearData');
const resultsEl = document.getElementById('results');
const metricTotal = document.getElementById('metricTotal');
const metricFiltered = document.getElementById('metricFiltered');
const metricCompanies = document.getElementById('metricCompanies');
const metricPinned = document.getElementById('metricPinned');
const segmentNameInput = document.getElementById('segmentName');
const saveSegmentBtn = document.getElementById('saveSegmentBtn');
const segmentList = document.getElementById('segmentList');
const segmentEmpty = document.getElementById('segmentEmpty');
const pinnedList = document.getElementById('pinnedList');
const pinnedEmpty = document.getElementById('pinnedEmpty');
const clearPinnedBtn = document.getElementById('clearPinned');
const contactPreview = document.getElementById('contactPreview');
const lastLoad = document.getElementById('lastLoad');
const cacheStatus = document.getElementById('cacheStatus');

const state = {
  contacts: [],
  filtered: [],
  pinned: new Set(JSON.parse(localStorage.getItem('kse_pinned_contacts') || '[]')),
  segments: loadSegments()
};

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('JSON must be an array');
    state.contacts = data;
    localStorage.setItem('kse_contacts_cache', JSON.stringify(state.contacts));
    cacheStatus.textContent = 'cached';
    lastLoad.textContent = new Date().toLocaleString();
    applyAndRender();
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
});

function applyFilters(list) {
  const q = (searchInput.value || '').toLowerCase();
  const tag = (tagFilter.value || '').toLowerCase();
  let filtered = list;
  if (q) {
    filtered = filtered.filter((c) => fuzzyMatchContact(c, q) > 0);
  }
  if (tag) {
    filtered = filtered.filter((c) => (c.tags || []).some((t) => String(t).toLowerCase().includes(tag)));
  }
  const sortKey = sortSelect.value;
  filtered = [...filtered].sort((a, b) => String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')));
  return filtered;
}

function applyAndRender() {
  state.filtered = applyFilters(state.contacts);
  renderResults(state.filtered);
  renderPinned();
  updateMetrics();
}

searchInput.addEventListener('input', applyAndRender);
tagFilter.addEventListener('input', applyAndRender);
sortSelect.addEventListener('change', applyAndRender);
clearDataBtn.addEventListener('click', () => {
  state.contacts = [];
  state.filtered = [];
  localStorage.removeItem('kse_contacts_cache');
  cacheStatus.textContent = 'empty';
  applyAndRender();
});

exportCsvBtn.addEventListener('click', () => {
  if (!state.contacts.length) return;
  const headers = ['name', 'company', 'email', 'phone', 'title', 'tags'];
  const rows = state.contacts.map((c) => [
    c.name || '',
    c.company || '',
    c.email || '',
    c.phone || '',
    c.title || '',
    (c.tags || []).join('|')
  ]);
  const csv = [headers, ...rows].map((r) => r.map((s) => `"${String(s).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(csv, 'text/csv', `kse-contacts-${Date.now()}.csv`);
});

exportJsonBtn.addEventListener('click', () => {
  if (!state.contacts.length) return;
  downloadBlob(JSON.stringify(state.contacts, null, 2), 'application/json', `kse-contacts-${Date.now()}.json`);
});

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fuzzyMatchContact(c, q) {
  const hay = [c.name, c.company, c.email, c.phone, c.title, ...(Array.isArray(c.tags) ? c.tags : [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
  }
  return score;
}

function renderResults(list) {
  resultsEl.innerHTML = '';
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'p-3 text-sm text-slate-500';
    li.textContent = 'No contacts to display. Load a JSON dataset or adjust the filters.';
    resultsEl.appendChild(li);
    return;
  }
  list.forEach((c) => {
    const li = document.createElement('li');
    li.className =
      'p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-slate-50 cursor-pointer transition-colors';
    li.addEventListener('click', () => showContactPreview(c));

    const left = document.createElement('div');
    left.innerHTML = `
      <div class="font-semibold">${escapeHtml(c.name || '(no name)')}</div>
      <div class="text-sm text-slate-600">${escapeHtml(c.title || '')}${c.title && c.company ? ' · ' : ''}${escapeHtml(
        c.company || ''
      )}</div>
      <div class="text-sm text-slate-600">${escapeHtml(c.email || '')}${
      c.email && c.phone ? ' · ' : ''
    }${escapeHtml(c.phone || '')}</div>
    `;

    const right = document.createElement('div');
    right.className = 'flex items-center gap-2';

    const tags = document.createElement('div');
    tags.className = 'flex flex-wrap gap-1';
    (c.tags || []).forEach((t) => {
      const span = document.createElement('span');
      span.className = 'inline-block text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5';
      span.textContent = t;
      tags.appendChild(span);
    });

    const pin = document.createElement('button');
    pin.className =
      'px-2 py-1 rounded text-xs ' +
      (state.pinned.has(c.email) ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-700');
    pin.textContent = state.pinned.has(c.email) ? 'Pinned' : 'Pin';
    pin.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!c.email) return;
      if (state.pinned.has(c.email)) state.pinned.delete(c.email);
      else state.pinned.add(c.email);
      localStorage.setItem('kse_pinned_contacts', JSON.stringify(Array.from(state.pinned)));
      applyAndRender();
    });

    right.appendChild(tags);
    right.appendChild(pin);
    li.appendChild(left);
    li.appendChild(right);
    resultsEl.appendChild(li);
  });
}

function showContactPreview(c) {
  if (!contactPreview) return;
  const tags = (c.tags || []).map((t) => `<span class="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-xs">${escapeHtml(t)}</span>`).join(' ');
  contactPreview.innerHTML = `
    <div class="space-y-2">
      <div>
        <p class="text-lg font-semibold">${escapeHtml(c.name || '(no name)')}</p>
        <p class="text-sm text-slate-600">${escapeHtml(c.title || '')}${c.title && c.company ? ' · ' : ''}${escapeHtml(c.company || '')}</p>
        <p class="text-sm text-slate-600">${escapeHtml(c.email || '')}${c.email && c.phone ? ' · ' : ''}${escapeHtml(c.phone || '')}</p>
      </div>
      <div class="flex flex-wrap gap-1">${tags || '<span class="text-xs text-slate-400">No tags</span>'}</div>
      <div class="flex flex-wrap gap-2">
        ${c.email ? `<a href="mailto:${encodeURIComponent(c.email)}" class="px-3 py-1.5 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-700">Email</a>` : ''}
        <button id="previewCopy" class="px-3 py-1.5 rounded bg-slate-100 text-slate-700 text-xs hover:bg-slate-200">Copy contact</button>
        <button id="previewScout" class="px-3 py-1.5 rounded bg-slate-900 text-white text-xs hover:bg-slate-800">Send to Opportunity Scout</button>
      </div>
    </div>
  `;
  document.getElementById('previewCopy')?.addEventListener('click', async () => {
    const text = `${c.name || ''}\n${c.title || ''}${c.title && c.company ? ' · ' : ''}${c.company || ''}\n${c.email || ''}\n${
      c.phone || ''
    }\nTags: ${(c.tags || []).join(', ')}`;
    await navigator.clipboard.writeText(text.trim());
  });
  document.getElementById('previewScout')?.addEventListener('click', () => {
    const url = new URL('../opportunity-radar/web/index.html', window.location.href);
    const keywords = [c.company, ...(c.tags || [])].filter(Boolean).join(', ');
    if (keywords) url.searchParams.set('keywords', keywords);
    window.open(url.toString(), '_blank', 'noopener');
  });
}

function updateMetrics() {
  metricTotal.textContent = state.contacts.length;
  metricFiltered.textContent = state.filtered.length;
  const companies = new Set(state.filtered.map((c) => c.company).filter(Boolean));
  metricCompanies.textContent = companies.size;
  metricPinned.textContent = state.pinned.size;
}

saveSegmentBtn.addEventListener('click', () => {
  const name = segmentNameInput.value.trim();
  if (!name) {
    alert('Segment name required.');
    return;
  }
  const segment = {
    id: crypto.randomUUID(),
    name,
    search: searchInput.value || '',
    tag: tagFilter.value || '',
    sort: sortSelect.value
  };
  state.segments.push(segment);
  persistSegments();
  renderSegments();
  segmentNameInput.value = '';
});

function renderSegments() {
  if (!segmentList) return;
  segmentList.innerHTML = '';
  if (!state.segments.length) {
    segmentEmpty?.classList.remove('hidden');
    return;
  }
  segmentEmpty?.classList.add('hidden');
  state.segments.forEach((seg) => {
    const li = document.createElement('li');
    li.className =
      'border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between gap-2 hover:bg-slate-50';
    li.innerHTML = `
      <div>
        <p class="font-semibold">${escapeHtml(seg.name)}</p>
        <p class="text-xs text-slate-500">Search: ${escapeHtml(seg.search || '—')} | Tag: ${escapeHtml(
      seg.tag || '—'
    )} | Sort: ${escapeHtml(seg.sort)}</p>
      </div>
      <div class="flex gap-2">
        <button data-action="apply" data-id="${seg.id}" class="text-xs px-2 py-1 rounded bg-slate-900 text-white">Apply</button>
        <button data-action="delete" data-id="${seg.id}" class="text-xs px-2 py-1 rounded bg-slate-100 text-slate-700">Delete</button>
      </div>
    `;
    segmentList.appendChild(li);
  });
  segmentList.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const id = event.currentTarget.getAttribute('data-id');
      const action = event.currentTarget.getAttribute('data-action');
      if (action === 'apply') {
        const seg = state.segments.find((s) => s.id === id);
        if (!seg) return;
        searchInput.value = seg.search;
        tagFilter.value = seg.tag;
        sortSelect.value = seg.sort;
        applyAndRender();
      } else if (action === 'delete') {
        state.segments = state.segments.filter((s) => s.id !== id);
        persistSegments();
        renderSegments();
      }
    });
  });
}

function loadSegments() {
  try {
    const raw = JSON.parse(localStorage.getItem('kse_contact_segments') || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persistSegments() {
  localStorage.setItem('kse_contact_segments', JSON.stringify(state.segments));
}

function renderPinned() {
  if (!pinnedList) return;
  const pinnedContacts = state.contacts.filter((c) => c.email && state.pinned.has(c.email));
  pinnedList.innerHTML = '';
  if (!pinnedContacts.length) {
    pinnedEmpty?.classList.remove('hidden');
  } else {
    pinnedEmpty?.classList.add('hidden');
    pinnedContacts.slice(0, 6).forEach((c) => {
      const li = document.createElement('li');
      li.className = 'border border-slate-200 rounded-xl px-3 py-2 text-sm';
      li.innerHTML = `<p class="font-semibold">${escapeHtml(c.name || '(no name)')}</p><p class="text-slate-500">${escapeHtml(
        c.company || ''
      )}</p>`;
      li.addEventListener('click', () => showContactPreview(c));
      pinnedList.appendChild(li);
    });
  }
}

clearPinnedBtn.addEventListener('click', () => {
  state.pinned.clear();
  localStorage.setItem('kse_pinned_contacts', JSON.stringify([]));
  applyAndRender();
});

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

// Load cached contacts on boot
try {
  const cached = JSON.parse(localStorage.getItem('kse_contacts_cache') || '[]');
  if (Array.isArray(cached) && cached.length) {
    state.contacts = cached;
    cacheStatus.textContent = 'cached';
    lastLoad.textContent = 'cached locally';
  }
} catch (err) {
  console.warn('Failed to load cached contacts', err);
}

renderSegments();
applyAndRender();
