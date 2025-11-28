const API_URL = '/api/opportunities';
const STORAGE_KEY = 'kse_watchlist_v1';

const keywordInput = document.getElementById('keywordInput');
const stateInput = document.getElementById('stateInput');
const typeSelect = document.getElementById('typeSelect');
const minValueInput = document.getElementById('minValue');
const limitSelect = document.getElementById('limitSelect');
const scanBtn = document.getElementById('scanBtn');
const resetBtn = document.getElementById('resetFilters');
const lastSynced = document.getElementById('lastSynced');

const statTotal = document.getElementById('statTotal');
const statBids = document.getElementById('statBids');
const statSignals = document.getElementById('statSignals');
const statAvgValue = document.getElementById('statAvgValue');

const bidRows = document.getElementById('bidRows');
const bidEmpty = document.getElementById('bidEmpty');
const exportCsvBtn = document.getElementById('exportCsv');
const copySummaryBtn = document.getElementById('copySummary');

const signalGrid = document.getElementById('signalGrid');
const signalEmpty = document.getElementById('signalEmpty');
const refreshSignalsBtn = document.getElementById('refreshSignals');

const watchlistEl = document.getElementById('watchlist');
const watchlistEmpty = document.getElementById('watchlistEmpty');
const addWatchBtn = document.getElementById('addWatchBtn');
const watchModal = document.getElementById('watchModal');
const watchLabel = document.getElementById('watchLabel');
const watchKeywords = document.getElementById('watchKeywords');
const watchStates = document.getElementById('watchStates');
const watchSave = document.getElementById('watchSave');
const watchCancel = document.getElementById('watchCancel');

const sourceList = document.getElementById('sourceList');
const sourceEmpty = document.getElementById('sourceEmpty');
const refreshSourcesBtn = document.getElementById('refreshSources');
const refreshUsageBtn = document.getElementById('refreshUsage');
const usageScans = document.getElementById('usageScans');
const usageWatch = document.getElementById('usageWatch');
const usageExports = document.getElementById('usageExports');
const usageEstimator = document.getElementById('usageEstimator');
const usageTimeline = document.getElementById('usageTimeline');
const usageTimelineEmpty = document.getElementById('usageTimelineEmpty');
const usageEvents = document.getElementById('usageEvents');
const usageEventsEmpty = document.getElementById('usageEventsEmpty');

const state = {
  loading: false,
  filters: {
    keywords: '',
    state: 'KS',
    type: 'all',
    minValue: null,
    limit: 60
  },
  results: [],
  stats: null,
  sources: [],
  watchlist: loadWatchlist(),
  usageReport: null,
  marketingHeat: null
};

init();

function init() {
  keywordInput.value = state.filters.keywords;
  stateInput.value = state.filters.state;
  typeSelect.value = state.filters.type;
  minValueInput.value = state.filters.minValue || '';
  limitSelect.value = state.filters.limit;

  scanBtn?.addEventListener('click', runScan);
  resetBtn?.addEventListener('click', resetFilters);
  exportCsvBtn?.addEventListener('click', exportCsv);
  copySummaryBtn?.addEventListener('click', copySummary);
  refreshSignalsBtn?.addEventListener('click', () => runScan({ keepFilters: true }));
  refreshSourcesBtn?.addEventListener('click', () => runScan({ keepFilters: true }));
  addWatchBtn?.addEventListener('click', openWatchModal);
  watchCancel?.addEventListener('click', closeWatchModal);
  watchSave?.addEventListener('click', saveWatchProfile);
  watchModal?.addEventListener('click', (event) => {
    if (event.target === watchModal) closeWatchModal();
  });
  refreshUsageBtn?.addEventListener('click', () => loadUsageReport(true));
  bidRows?.addEventListener('click', handleOpportunityAction);

  renderWatchlist();
  loadUsageReport();
  loadMarketingHeat();
  runScan();
  registerServiceWorker();
}

async function fetchJsonOrThrow(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const snippet = text.replace(/\s+/g, ' ').slice(0, 140);
    throw new Error(
      `Opportunity API returned non-JSON (status ${res.status}). ${
        snippet || 'Make sure the Node server is running (`npm -w server run dev`).'
      }`
    );
  }
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Opportunity API returned invalid JSON.');
  }
  return { res, data };
}

async function runScan(opts = {}) {
  if (state.loading) return;
  state.loading = true;
  scanBtn.textContent = 'Scanning...';
  scanBtn.disabled = true;
  const filters = opts.keepFilters ? { ...state.filters } : readFiltersFromForm();
  state.filters = filters;
  const params = new URLSearchParams();
  if (filters.keywords) params.set('keywords', filters.keywords);
  if (filters.state) params.set('state', filters.state);
  if (filters.type && filters.type !== 'all') params.set('type', filters.type);
  if (filters.minValue != null) params.set('minValue', String(filters.minValue));
  if (filters.limit) params.set('limit', String(filters.limit));
  try {
    const { res, data } = await fetchJsonOrThrow(`${API_URL}?${params.toString()}`);
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || `Opportunity API error (status ${res.status})`);
    }
    state.results = data.results || [];
    state.stats = data.stats || null;
    state.sources = data.sources || [];
    lastSynced.textContent = new Date(data.generatedAt || Date.now()).toLocaleString();
    renderStats();
    renderBidTable();
    renderSignals();
    renderSources();
    trackUsage('scan', { resultCount: state.results.length, filters });
    loadUsageReport();
  } catch (error) {
    console.error('Scan failed', error);
    alert(error instanceof Error ? error.message : 'Scan failed');
  } finally {
    state.loading = false;
    scanBtn.textContent = 'Run Scan';
    scanBtn.disabled = false;
  }
}

function readFiltersFromForm() {
  return {
    keywords: keywordInput.value.trim(),
    state: stateInput.value.trim(),
    type: typeSelect.value,
    minValue: minValueInput.value ? Number(minValueInput.value) : null,
    limit: Number(limitSelect.value) || 60
  };
}

function resetFilters() {
  keywordInput.value = '';
  stateInput.value = 'KS';
  typeSelect.value = 'all';
  minValueInput.value = '';
  limitSelect.value = '60';
  runScan();
}

function renderStats() {
  if (!state.stats) {
    statTotal.textContent = statBids.textContent = statSignals.textContent = statAvgValue.textContent = '--';
    return;
  }
  statTotal.textContent = state.stats.total ?? '--';
  statBids.textContent = state.stats.bids ?? '--';
  statSignals.textContent = state.stats.expansions ?? '--';
  statAvgValue.textContent = state.stats.avgValue ? formatCurrency(state.stats.avgValue) : '--';
}

function renderBidTable() {
  if (!bidRows) return;
  bidRows.innerHTML = '';
  const bids = state.results.filter((item) => item.type === 'bid');
  bidEmpty.classList.toggle('hidden', Boolean(bids.length));
  bids.forEach((item) => {
    const row = document.createElement('tr');
    row.className = 'feed-row border-b border-slate-100';
    const heat = getMarketingHeatForOpportunity(item);
    const marketingBadge = heat
      ? `
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            Dealfront intent ${heat.intentScore}%
          </span>
          <span class="text-slate-400">Top page ${escapeHtml(heat.topPage)}</span>
          <span class="text-slate-400">Last visit ${formatRelativeTime(heat.lastVisit)}</span>
        </div>
      `
      : '';
    row.innerHTML = `
      <td class="px-4 py-3">
        <a href="${item.url || '#'}" target="_blank" rel="noopener" class="font-semibold text-slate-900 hover:text-sky-600">${escapeHtml(item.title)}</a>
        <div class="text-xs text-slate-500 mt-1">${escapeHtml(item.summary || '')}</div>
        <div class="flex flex-wrap gap-1 mt-2">
          ${item.tags.slice(0, 4).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
        </div>
        ${marketingBadge}
      </td>
      <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(item.agency || '—')}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${escapeHtml(item.location || '—')}</td>
      <td class="px-4 py-3 text-sm text-slate-600">${formatDate(item.dueDate)}</td>
      <td class="px-4 py-3 text-right text-sm font-semibold text-slate-900">${item.value ? formatCurrency(item.value) : '—'}</td>
      <td class="px-4 py-3 text-center">
        <div class="score-ring ${scoreClass(item.score)}">${item.score ?? 0}</div>
      </td>
      <td class="px-4 py-3">
        <div class="flex flex-wrap gap-2">
          <button class="text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800" data-action="send-estimator" data-id="${item.id}">Send to Estimator</button>
          <button class="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100" data-action="copy-link" data-id="${item.id}">Copy Link</button>
        </div>
      </td>
    `;
    bidRows.appendChild(row);
  });
}

function renderSignals() {
  if (!signalGrid || !signalEmpty) return;
  const signals = state.results.filter((item) => item.type === 'expansion');
  signalGrid.innerHTML = '';
  signalEmpty.classList.toggle('hidden', Boolean(signals.length));
  signals.slice(0, 8).forEach((signal) => {
    const card = document.createElement('article');
    card.className = 'border border-slate-200 rounded-xl p-3 bg-white shadow-sm flex flex-col gap-2';
    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-semibold text-sky-600 uppercase tracking-wide">${escapeHtml(signal.source || 'Signal')}</span>
        <span class="text-xs text-slate-400">${formatDate(signal.postedDate)}</span>
      </div>
      <a href="${signal.url || '#'}" target="_blank" rel="noopener" class="font-semibold text-slate-900 hover:text-sky-600">${escapeHtml(signal.title)}</a>
      <p class="text-sm text-slate-600">${escapeHtml(signal.summary || '')}</p>
      <div class="flex flex-wrap gap-1 mt-auto">
        ${signal.tags.slice(0, 5).map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join('')}
      </div>
    `;
    signalGrid.appendChild(card);
  });
}

function renderSources() {
  if (!sourceList || !sourceEmpty) return;
  sourceList.innerHTML = '';
  sourceEmpty.classList.toggle('hidden', Boolean(state.sources.length));
  state.sources.forEach((src) => {
    const li = document.createElement('li');
    const statusColor =
      src.status === 'ok' ? 'text-emerald-600' : src.status === 'partial' ? 'text-amber-600' : 'text-rose-600';
    li.className = 'border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3';
    li.innerHTML = `
      <div>
        <p class="font-semibold">${escapeHtml(src.name)}</p>
        <p class="text-xs text-slate-500">Records: ${src.records}</p>
        <p class="text-xs text-slate-400">${new Date(src.fetchedAt).toLocaleTimeString()}</p>
        ${src.error ? `<p class="text-xs text-rose-600 mt-1">${escapeHtml(src.error)}</p>` : ''}
      </div>
      <span class="text-xs font-semibold uppercase ${statusColor}">${src.status}</span>
    `;
    sourceList.appendChild(li);
  });
}

function handleOpportunityAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.getAttribute('data-id');
  const action = button.getAttribute('data-action');
  const opportunity = state.results.find((entry) => entry.id === id);
  if (!opportunity || !action) return;
  if (action === 'send-estimator') {
    sendToEstimator(opportunity);
  } else if (action === 'copy-link') {
    copyOpportunityLink(opportunity, button);
  }
}

function sendToEstimator(item) {
  const estimatorUrl = new URL('../estimate-accelerator/web/index.html', window.location.href);
  estimatorUrl.searchParams.set('rfpTitle', item.title || '');
  if (item.summary) estimatorUrl.searchParams.set('rfpSummary', item.summary);
  if (item.url) estimatorUrl.searchParams.set('rfpUrl', item.url);
  if (item.dueDate) estimatorUrl.searchParams.set('rfpDue', item.dueDate);
  if (item.location) estimatorUrl.searchParams.set('rfpLocation', item.location);
  trackUsage('send_estimator', { id: item.id, title: item.title, url: item.url });
  loadUsageReport();
  window.open(estimatorUrl.toString(), '_blank', 'noopener');
}

async function copyOpportunityLink(item, button) {
  const link = item.url || window.location.href;
  try {
    await navigator.clipboard.writeText(link);
    if (button) {
      const original = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(() => {
        button.textContent = original || 'Copy Link';
      }, 1200);
    }
    trackUsage('copy_link', { id: item.id, url: item.url });
    loadUsageReport();
  } catch (error) {
    console.warn('Copy failed', error);
  }
}

function exportCsv() {
  if (!state.results.length) return;
  const rows = [['Title','Type','Agency','Location','Due','Value','Source','URL','Tags']];
  state.results.forEach((item) => {
    rows.push([
      item.title,
      item.type,
      item.agency || '',
      item.location || '',
      item.dueDate || '',
      item.value || '',
      item.source || '',
      item.url || '',
      (item.tags || []).join('; ')
    ]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kse-opportunity-scout-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  trackUsage('export_csv', { count: state.results.length });
  loadUsageReport();
}

async function copySummary() {
  if (!state.results.length) return;
  const lines = state.results.slice(0, 20).map((item) => {
    return `• [${item.type?.toUpperCase()}] ${item.title} (${item.location || 'N/A'}) — ${formatDate(item.dueDate)} — ${item.url}`;
  });
  await navigator.clipboard.writeText(lines.join('\n'));
  copySummaryBtn.textContent = 'Copied';
  setTimeout(() => (copySummaryBtn.textContent = 'Copy Summary'), 1200);
  trackUsage('copy_summary', { sample: lines.length });
  loadUsageReport();
}

function renderWatchlist() {
  if (!watchlistEl) return;
  watchlistEl.innerHTML = '';
  watchlistEmpty.classList.toggle('hidden', Boolean(state.watchlist.length));
  state.watchlist.forEach((profile, idx) => {
    const li = document.createElement('li');
    li.className = 'border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3 bg-white';
    li.innerHTML = `
      <div>
        <p class="font-semibold">${escapeHtml(profile.label)}</p>
        <p class="text-xs text-slate-500">Keywords: ${escapeHtml(profile.keywords || '—')}</p>
        <p class="text-xs text-slate-500">States: ${escapeHtml(profile.states || 'Any')}</p>
      </div>
      <div class="flex gap-2">
        <button data-index="${idx}" class="watch-run text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white">Run</button>
        <button data-index="${idx}" class="watch-delete text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600">Delete</button>
      </div>
    `;
    watchlistEl.appendChild(li);
  });
  watchlistEl.querySelectorAll('.watch-run').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const idx = Number(event.currentTarget?.getAttribute('data-index'));
      const profile = state.watchlist[idx];
      if (!profile) return;
      keywordInput.value = profile.keywords || '';
      stateInput.value = profile.states || '';
      typeSelect.value = 'all';
      minValueInput.value = '';
      trackUsage('watch_run', { label: profile.label });
      runScan();
    });
  });
  watchlistEl.querySelectorAll('.watch-delete').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const idx = Number(event.currentTarget?.getAttribute('data-index'));
      const [removed] = state.watchlist.splice(idx, 1);
      persistWatchlist();
      renderWatchlist();
      if (removed) trackUsage('watch_delete', { label: removed.label });
    });
  });
}

function openWatchModal() {
  watchLabel.value = '';
  watchKeywords.value = keywordInput.value || '';
  watchStates.value = stateInput.value || '';
  watchModal.classList.remove('hidden');
  watchModal.classList.add('flex');
}

function closeWatchModal() {
  watchModal.classList.remove('flex');
  watchModal.classList.add('hidden');
}

function saveWatchProfile() {
  const label = watchLabel.value.trim();
  const keywords = watchKeywords.value.trim();
  const states = watchStates.value.trim();
  if (!label) {
    alert('Watch profile needs a label.');
    return;
  }
  state.watchlist.push({ label, keywords, states });
  persistWatchlist();
  renderWatchlist();
  closeWatchModal();
  trackUsage('watch_saved', { label, keywords, states });
}

async function trackUsage(action, payload = {}) {
  try {
    await fetch('/api/opportunities/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload })
    });
  } catch (error) {
    console.warn('Usage log failed', error);
  }
}

async function loadUsageReport(manual = false) {
  if (manual && refreshUsageBtn) {
    refreshUsageBtn.disabled = true;
    refreshUsageBtn.textContent = 'Refreshing...';
  }
  try {
    const { res, data } = await fetchJsonOrThrow('/api/opportunities/usage');
    if (!res.ok || !data?.ok) throw new Error(data?.error || `Usage feed error (${res.status})`);
    state.usageReport = data.report || null;
    renderUsageReport();
  } catch (error) {
    console.warn('Usage report unavailable', error);
  } finally {
    if (manual && refreshUsageBtn) {
      refreshUsageBtn.disabled = false;
      refreshUsageBtn.textContent = 'Refresh Report';
    }
  }
}

function renderUsageReport() {
  if (!usageTimeline) return;
  const setText = (el, value) => {
    if (el) el.textContent = value;
  };
  if (!state.usageReport) {
    setText(usageScans, '--');
    setText(usageWatch, '--');
    setText(usageExports, '--');
    setText(usageEstimator, '--');
    usageTimeline.innerHTML = '';
    usageTimelineEmpty?.classList.remove('hidden');
    if (usageEvents) usageEvents.innerHTML = '';
    usageEventsEmpty?.classList.remove('hidden');
    return;
  }
  const counts = state.usageReport.countsByAction || {};
  setText(usageScans, counts.scan ?? 0);
  setText(usageWatch, counts.watch_run ?? 0);
  setText(usageExports, counts.export_csv ?? 0);
  setText(usageEstimator, counts.send_estimator ?? 0);

  const timeline = state.usageReport.timeline || [];
  if (!timeline.length) {
    usageTimeline.innerHTML = '';
    usageTimelineEmpty?.classList.remove('hidden');
  } else {
    usageTimelineEmpty?.classList.add('hidden');
    usageTimeline.innerHTML = timeline
      .map(
        (entry) => `
        <article class="border border-slate-200 rounded-xl p-2">
          <p class="text-xs uppercase text-slate-500 font-semibold">${entry.date}</p>
          <p class="text-lg font-semibold text-slate-900">${entry.total}</p>
          <p class="text-[11px] text-slate-500">Scans: ${entry.scan || 0} · Sends: ${entry['send_estimator'] || 0}</p>
        </article>
      `
      )
      .join('');
  }

  if (usageEvents) {
    const latest = state.usageReport.latestEvents || [];
    if (!latest.length) {
      usageEvents.innerHTML = '';
      usageEventsEmpty?.classList.remove('hidden');
    } else {
      usageEventsEmpty?.classList.add('hidden');
      usageEvents.innerHTML = latest
        .map(
          (event) => `
          <li class="flex items-center justify-between border border-slate-200 rounded-lg px-3 py-1.5">
            <span class="text-xs font-semibold uppercase text-slate-500">${event.action}</span>
            <span class="text-xs text-slate-400">${new Date(event.timestamp).toLocaleTimeString()}</span>
          </li>
        `
        )
        .join('');
    }
  }
}

async function loadMarketingHeat() {
  try {
    const res = await fetch('/api/marketing/heat');
    const data = await res.json();
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error || `Marketing feed error (${res.status})`);
    }
    state.marketingHeat = data.heat || null;
    renderBidTable();
  } catch (error) {
    console.warn('Marketing heat unavailable', error);
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  });
}

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function persistWatchlist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.watchlist));
}

function scoreClass(score) {
  if (score >= 85) return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  if (score >= 65) return 'bg-sky-100 text-sky-700 border border-sky-200';
  return 'bg-amber-100 text-amber-700 border border-amber-200';
}

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMarketingHeatForOpportunity(item) {
  const heat = state.marketingHeat;
  if (!heat) return null;
  const companyKey = normalizeHeatKey(item.agency || item.title);
  if (companyKey && heat.byCompany?.[companyKey]) {
    return heat.byCompany[companyKey];
  }
  if (Array.isArray(item.tags)) {
    for (const tag of item.tags) {
      const tagKey = normalizeHeatKey(tag);
      const matches = heat.byTag?.[tagKey];
      if (matches?.length) {
        return matches[0];
      }
    }
  }
  return null;
}

function normalizeHeatKey(value) {
  if (!value) return '';
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function formatRelativeTime(dateString) {
  if (!dateString) return 'recently';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return 'recently';
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? '1 day ago' : `${diffDays}d ago`;
}

