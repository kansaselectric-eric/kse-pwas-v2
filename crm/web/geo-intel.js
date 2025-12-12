(() => {
  const DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1']);
  const API_HOST = resolveApiHost();
  const API_BASE = `${API_HOST}/api`;
  const ENDPOINTS = {
    customers: `${API_BASE}/customers`,
    prospects: `${API_BASE}/prospects`
  };

  const state = {
    map: null,
    layers: {
      customers: L.layerGroup(),
      prospects: L.layerGroup(),
      heat: L.layerGroup(),
      radius: []
    },
    data: { customers: [], prospects: [] },
    filters: { status: '', industry: '', revenue: '', distance: 0, search: '' },
    hq: { lat: 39.0997, lng: -94.5786 }
  };

  let db = null;

  init();

  async function init() {
    await initCache();
    initMap();
    attachUi();
    await loadData();
    renderMarkers();
  }

  function resolveApiHost() {
    if ('__CRM_API_HOST' in window && window.__CRM_API_HOST) return window.__CRM_API_HOST;
    if (DEV_HOSTNAMES.has(window.location.hostname)) return `http://${window.location.hostname}:8787`;
    return 'https://kse-tools-server.up.railway.app';
  }

  async function initCache() {
    db = await openDb('kse-geo-intel', 2, (db) => {
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
      if (!db.objectStoreNames.contains('geocode')) db.createObjectStore('geocode');
    });
  }

  function openDb(name, version, onUpgrade) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => onUpgrade(req.result);
      req.onsuccess = () => resolve(req.result);
    });
  }

  function putCache(key, value, store = 'cache') {
    if (!db) return;
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
  }

  function getCache(key, store = 'cache') {
    return new Promise((resolve) => {
      if (!db) return resolve(null);
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  function initMap() {
    state.map = L.map('map', { zoomControl: true }).setView([state.hq.lat, state.hq.lng], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);
    state.layers.customers.addTo(state.map);
    state.layers.prospects.addTo(state.map);
  }

  function attachUi() {
    const statusFilter = document.getElementById('statusFilter');
    const industryFilter = document.getElementById('industryFilter');
    const revenueFilter = document.getElementById('revenueFilter');
    const distanceFilter = document.getElementById('distanceFilter');
    const searchInput = document.getElementById('mapSearchInput');
    const toggleCustomers = document.getElementById('toggleCustomers');
    const toggleProspects = document.getElementById('toggleProspects');
    const refreshBtn = document.getElementById('mapRefreshBtn');
    const useGpsBtn = document.getElementById('useGpsBtn');
    const radius30 = document.getElementById('radius30');
    const radius60 = document.getElementById('radius60');
    const radius90 = document.getElementById('radius90');

    statusFilter?.addEventListener('change', (e) => {
      state.filters.status = e.target.value;
      renderMarkers();
    });
    industryFilter?.addEventListener('input', (e) => {
      state.filters.industry = e.target.value.toLowerCase();
      renderMarkers();
    });
    revenueFilter?.addEventListener('change', (e) => {
      state.filters.revenue = e.target.value;
      renderMarkers();
    });
    distanceFilter?.addEventListener('input', (e) => {
      state.filters.distance = Number(e.target.value || 0);
      document.getElementById('distanceValue').textContent = state.filters.distance ? `${state.filters.distance} mi` : 'Off';
      renderMarkers();
    });
    searchInput?.addEventListener('input', (e) => {
      state.filters.search = e.target.value.toLowerCase();
      renderMarkers();
    });
    toggleCustomers?.addEventListener('change', (e) => {
      if (e.target.checked) state.layers.customers.addTo(state.map);
      else state.map.removeLayer(state.layers.customers);
    });
    toggleProspects?.addEventListener('change', (e) => {
      if (e.target.checked) state.layers.prospects.addTo(state.map);
      else state.map.removeLayer(state.layers.prospects);
    });
    refreshBtn?.addEventListener('click', async () => {
      await loadData(true);
      renderMarkers();
    });
    useGpsBtn?.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition((pos) => {
        state.hq = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        state.map.setView([state.hq.lat, state.hq.lng], 8);
        renderRadiusLayers();
        renderMarkers();
      });
    });
    [radius30, radius60, radius90].forEach((input) => {
      input?.addEventListener('change', renderRadiusLayers);
    });
  }

  async function loadData(forceRefresh = false) {
    const status = document.getElementById('mapStatus');
    status && (status.textContent = 'Loading...');
    try {
      if (!forceRefresh) {
        const cachedCustomers = await getCache('customers');
        const cachedProspects = await getCache('prospects');
        if (cachedCustomers) state.data.customers = cachedCustomers;
        if (cachedProspects) state.data.prospects = cachedProspects;
      }
      const [customers, prospects] = await Promise.all([
        fetchJson(ENDPOINTS.customers),
        fetchJson(ENDPOINTS.prospects)
      ]);
      if (Array.isArray(customers)) {
        state.data.customers = await ensureCoordinates(customers);
        putCache('customers', customers);
      }
      if (Array.isArray(prospects)) {
        state.data.prospects = await ensureCoordinates(prospects);
        putCache('prospects', prospects);
      }
      status && (status.textContent = 'Online');
    } catch (err) {
      console.warn('Geo-Intel data load failed, using cache', err);
      status && (status.textContent = 'Offline cache');
    }
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: buildAuthHeaders() });
    if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
    return res.json();
  }

  function buildAuthHeaders() {
    const token = localStorage.getItem('kse_crm_session');
    if (!token) return {};
    try {
      const parsed = JSON.parse(token);
      if (parsed?.tokens?.accessToken) return { Authorization: `Bearer ${parsed.tokens.accessToken}` };
    } catch {
      return {};
    }
    return {};
  }

  function renderMarkers() {
    state.layers.customers.clearLayers();
    state.layers.prospects.clearLayers();
    renderRadiusLayers();
    state.data.customers.filter(applyFilters).forEach((cust) => state.layers.customers.addLayer(buildCustomerMarker(cust)));
    state.data.prospects.filter(applyFilters).forEach((pros) => state.layers.prospects.addLayer(buildProspectMarker(pros)));
  }

  function applyFilters(item) {
    if (state.filters.search && !item.name?.toLowerCase().includes(state.filters.search)) return false;
    if (state.filters.status && item.status && item.status !== state.filters.status) return false;
    if (state.filters.industry && !(item.industry || '').toLowerCase().includes(state.filters.industry)) return false;
    if (state.filters.revenue) {
      const value = Number(item.revenuePotential || item.projectedValue || 0);
      if (state.filters.revenue === 'lt1' && value >= 1_000_000) return false;
      if (state.filters.revenue === '1to5' && (value < 1_000_000 || value > 5_000_000)) return false;
      if (state.filters.revenue === 'gt5' && value <= 5_000_000) return false;
    }
    if (state.filters.distance && item.latitude && item.longitude) {
      const miles = haversineMiles(state.hq.lat, state.hq.lng, item.latitude, item.longitude);
      if (miles > state.filters.distance) return false;
    }
    return true;
  }

  function buildCustomerMarker(customer) {
    const color = getStatusColor(customer.status);
    const marker = L.circleMarker([customer.latitude, customer.longitude], {
      radius: 8,
      color,
      weight: 2,
      fillColor: color,
      fillOpacity: 0.7
    });
    marker.bindTooltip(customer.name);
    marker.on('click', () => openSidebar(customer, 'customer'));
    return marker;
  }

  function buildProspectMarker(prospect) {
    const marker = L.circleMarker([prospect.latitude, prospect.longitude], {
      radius: 7,
      color: '#2563eb',
      weight: 2,
      fillColor: '#93c5fd',
      fillOpacity: 0.7
    });
    marker.bindTooltip(`Prospect: ${prospect.name}`);
    marker.on('click', () => openSidebar(prospect, 'prospect'));
    return marker;
  }

  function openSidebar(item, type) {
    const sidebar = document.getElementById('detailSidebar');
    if (!sidebar) return;
    sidebar.innerHTML = `
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold">${escapeHtml(item.name || '')}</h3>
        <span class="text-xs px-2 py-1 rounded-full border ${type === 'customer' ? 'border-slate-300' : 'border-blue-300'}">${type === 'customer' ? (item.status || 'Customer') : 'Prospect'}</span>
      </div>
      <p class="text-sm text-slate-600 mt-1">${escapeHtml(item.industry || '')}</p>
      <p class="text-sm text-slate-500 mt-1">Revenue potential: ${formatCurrency(item.revenuePotential || item.projectedValue || 0)}</p>
      ${item.lastContact ? `<p class="text-xs text-slate-500">Last contact ${new Date(item.lastContact).toLocaleDateString()}</p>` : ''}
      <div class="mt-3 flex gap-2">
        <a class="text-xs rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-100" href="index.html?accountId=${encodeURIComponent(item.id)}">Open in CRM</a>
        <a class="text-xs rounded-full border border-slate-300 px-3 py-1 hover:bg-slate-100" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}">Directions</a>
      </div>
    `;
  }

  function getStatusColor(status = '') {
    const lower = status.toLowerCase();
    if (lower.includes('healthy')) return '#22c55e';
    if (lower.includes('stalled') || lower.includes('hold')) return '#f59e0b';
    if (lower.includes('risk') || lower.includes('at risk')) return '#ef4444';
    return '#0ea5e9';
  }

  function renderRadiusLayers() {
    state.layers.radius.forEach((c) => state.map.removeLayer(c));
    state.layers.radius = [];
    const toggles = [
      { el: document.getElementById('radius30'), miles: 30 },
      { el: document.getElementById('radius60'), miles: 60 },
      { el: document.getElementById('radius90'), miles: 90 }
    ];
    toggles.forEach((t) => {
      if (t.el?.checked) {
        const circle = L.circle([state.hq.lat, state.hq.lng], { radius: t.miles * 1609.34, color: '#94a3b8', weight: 1, fillOpacity: 0.05 });
        circle.addTo(state.map);
        state.layers.radius.push(circle);
      }
    });
  }

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function formatCurrency(value) {
    if (!value) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact' }).format(value);
  }

  function escapeHtml(str = '') {
    return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
  }

  async function ensureCoordinates(items = []) {
    const enriched = [];
    for (const item of items) {
      if (item.latitude && item.longitude) {
        enriched.push(item);
        continue;
      }
      const key = buildGeoKey(item);
      if (!key) {
        enriched.push(item);
        continue;
      }
      const cached = await getCache(key, 'geocode');
      if (cached?.lat && cached?.lng) {
        enriched.push({ ...item, latitude: cached.lat, longitude: cached.lng });
        continue;
      }
      const coords = await geocodeLocation(key).catch(() => null);
      if (coords?.lat && coords?.lng) {
        putCache(key, coords, 'geocode');
        enriched.push({ ...item, latitude: coords.lat, longitude: coords.lng });
      } else {
        enriched.push(item);
      }
    }
    return enriched;
  }

  function buildGeoKey(item) {
    const parts = [item.projectAddress, item.projectCity, item.projectState, item.city, item.state]
      .filter(Boolean)
      .map((s) => String(s).trim());
    if (!parts.length) return '';
    return parts.join(', ');
  }

  async function geocodeLocation(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'kse-geo-intel' } });
    if (!res.ok) throw new Error('geocode failed');
    const data = await res.json();
    if (Array.isArray(data) && data[0]) {
      return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
    }
    return null;
  }
})();
