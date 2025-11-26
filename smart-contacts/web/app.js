/* Smart Contacts (expanded)
 * - Fuzzy search and sorting
 * - Tag filter
 * - Export CSV/JSON
 * - Pin contacts (localStorage)
 */

const fileInput = document.getElementById('contactsFile');
const searchInput = document.getElementById('search');
const tagFilter = document.getElementById('tagFilter');
const sortSelect = document.getElementById('sortSelect');
const exportCsv = document.getElementById('exportCsv');
const exportJson = document.getElementById('exportJson');
const clearData = document.getElementById('clearData');
const resultsEl = document.getElementById('results');

let contacts = [];
let pinnedEmails = new Set(JSON.parse(localStorage.getItem('kse_pinned_contacts') || '[]'));

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('JSON must be an array');
    contacts = data;
    localStorage.setItem('kse_contacts_cache', JSON.stringify(contacts));
    renderResults(applyFilters(contacts));
  } catch (err) {
    alert('Invalid JSON: ' + err.message);
  }
});

function applyFilters(list) {
  const q = (searchInput.value || '').toLowerCase();
  const tag = (tagFilter.value || '').toLowerCase();
  let filtered = list;
  if (q) {
    filtered = filtered.filter(c => fuzzyMatchContact(c, q) > 0);
  }
  if (tag) {
    filtered = filtered.filter(c => (c.tags || []).some(t => String(t).toLowerCase().includes(tag)));
  }
  const sortKey = sortSelect.value;
  filtered.sort((a, b) => String(a[sortKey] || '').localeCompare(String(b[sortKey] || '')));
  return filtered;
}

searchInput.addEventListener('input', () => {
  renderResults(applyFilters(contacts));
});
tagFilter.addEventListener('input', () => {
  renderResults(applyFilters(contacts));
});
sortSelect.addEventListener('change', () => {
  renderResults(applyFilters(contacts));
});
clearData.addEventListener('click', () => {
  contacts = [];
  localStorage.removeItem('kse_contacts_cache');
  renderResults(contacts);
});

exportCsv.addEventListener('click', () => {
  if (!contacts.length) return;
  const headers = ['name','company','email','phone','title','tags'];
  const rows = contacts.map(c => [
    c.name || '', c.company || '', c.email || '', c.phone || '', c.title || '', (c.tags || []).join('|')
  ]);
  const csv = [headers, ...rows].map(r => r.map(s => `"${String(s).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kse-contacts-${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

exportJson.addEventListener('click', () => {
  if (!contacts.length) return;
  const blob = new Blob([JSON.stringify(contacts, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kse-contacts-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

function fuzzyMatchContact(c, q) {
  const hay = [
    c.name, c.company, c.email, c.phone, c.title,
    ...(Array.isArray(c.tags) ? c.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();
  // Very lightweight fuzzy: score based on presence of tokens
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
    li.textContent = 'No contacts to display.';
    resultsEl.appendChild(li);
    return;
  }
  for (const c of list) {
    const li = document.createElement('li');
    li.className = 'p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2';

    const left = document.createElement('div');
    left.innerHTML = `
      <div class="font-medium">${escapeHtml(c.name || '(no name)')}</div>
      <div class="text-sm text-slate-600">${escapeHtml(c.title || '')}${c.title && c.company ? ' · ' : ''}${escapeHtml(c.company || '')}</div>
      <div class="text-sm text-slate-600">${escapeHtml(c.email || '')}${c.email && c.phone ? ' · ' : ''}${escapeHtml(c.phone || '')}</div>
    `;

    const right = document.createElement('div');
    right.className = 'flex items-center gap-2';
    const tags = document.createElement('div');
    tags.className = 'flex flex-wrap gap-1';
    if (Array.isArray(c.tags)) {
      for (const t of c.tags) {
        const span = document.createElement('span');
        span.className = 'inline-block text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded px-2 py-0.5';
        span.textContent = t;
        tags.appendChild(span);
      }
    }

    const pin = document.createElement('button');
    pin.className = 'px-2 py-1 rounded text-xs ' + (pinnedEmails.has(c.email) ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-700');
    pin.textContent = pinnedEmails.has(c.email) ? 'Pinned' : 'Pin';
    pin.addEventListener('click', () => {
      if (!c.email) return;
      if (pinnedEmails.has(c.email)) {
        pinnedEmails.delete(c.email);
      } else {
        pinnedEmails.add(c.email);
      }
      localStorage.setItem('kse_pinned_contacts', JSON.stringify(Array.from(pinnedEmails)));
      renderResults(applyFilters(contacts));
    });

    right.appendChild(tags);
    right.appendChild(pin);
    li.appendChild(left);
    li.appendChild(right);
    resultsEl.appendChild(li);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

// Load cached contacts
try {
  const cached = JSON.parse(localStorage.getItem('kse_contacts_cache') || '[]');
  if (Array.isArray(cached) && cached.length) {
    contacts = cached;
    renderResults(applyFilters(contacts));
  }
} catch (err) {
  console.warn('Failed to load cached contacts', err);
}


