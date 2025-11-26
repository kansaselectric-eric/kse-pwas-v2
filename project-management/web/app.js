/* global Chart */
// Fetch KPIs from Apps Script endpoint and render
const APPS_SCRIPT_PM_ENDPOINT = 'https://script.google.com/macros/s/YOUR_PM_APPS_SCRIPT_WEB_APP_URL/exec'; // TODO replace

async function loadKpis() {
  try {
    const [res, resHist] = await Promise.all([
      fetch(`${APPS_SCRIPT_PM_ENDPOINT}?action=kpis`),
      fetch(`${APPS_SCRIPT_PM_ENDPOINT}?action=kpis_history&n=30`)
    ]);
    const [data, hist] = await Promise.all([res.json(), resHist.json()]);
    if (!data || !data.kpis) return;
    const k = data.kpis;
    setText('frReports', k.fieldReports.reports7d);
    setText('frManpower', k.fieldReports.manpower7d);
    setText('frSafety', k.fieldReports.safety7d);
    setText('radarNew', k.radar.new7d);
    setText('radarHigh', k.radar.high7d);
    setText('radarTotal', k.radar.total);
    setText('crmTouches', k.crm.touches7d);
    setText('crmTop', (k.crm.topAccounts || []).map(t => `${t.name} (${t.touches})`).join(', ') || 'n/a');
    setText('forecast90', Number(k.forecast.weighted90d).toLocaleString());

    if (hist && hist.history) {
      renderCharts(hist.history);
    }
    // Load schedule health
    try {
      const resSched = await fetch(`${APPS_SCRIPT_PM_ENDPOINT}?action=schedule_health`);
      const dataSched = await resSched.json();
      if (dataSched && dataSched.schedule) renderSchedule(dataSched.schedule);
    } catch (err) {
      console.warn('Failed to load schedule health', err);
    }
    // Load manpower forecast
    try {
      const resMf = await fetch(`${APPS_SCRIPT_PM_ENDPOINT}?action=manpower_forecast&days=14`);
      const dataMf = await resMf.json();
      if (dataMf && dataMf.forecast) renderManpower(dataMf.forecast);
    } catch (err) {
      console.warn('Failed to load manpower forecast', err);
    }
    // Load manpower breakdown
    try {
      const resMb = await fetch(`${APPS_SCRIPT_PM_ENDPOINT}?action=manpower_breakdown&days=14`);
      const dataMb = await resMb.json();
      if (dataMb && dataMb.breakdown) {
        renderDivision(dataMb.breakdown.division || []);
        renderProjectTotals(dataMb.breakdown.project || []);
        renderHeatmap(dataMb.breakdown.heatmap || { dates: [], rows: [] });
      }
    } catch (err) {
      console.warn('Failed to load manpower breakdown', err);
    }
  } catch (err) {
    console.error('Failed to load PM KPIs', err);
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

loadKpis();

function renderCharts(history) {
  const labels = history.map(h => h.date);
  renderLine('frChart', labels, history.map(h => h.frReports), 'FR Reports');
  renderLine('radarChart', labels, history.map(h => h.radarNew), 'Radar New');
  renderLine('crmChart', labels, history.map(h => h.crmTouches), 'CRM Touches');
  renderLine('forecastChart', labels, history.map(h => h.forecast90), 'Forecast 90d');
}

function renderLine(canvasId, labels, data, label) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  new Chart(el, {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,0.15)', tension: 0.25, fill: true }] },
    options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 0, autoSkip: true } } } }
  });
}

function renderSchedule(rows) {
  const body = document.getElementById('scheduleBody');
  if (!body) return;
  body.innerHTML = '';
  rows.slice(-20).forEach(r => {
    const tr = document.createElement('tr');
    const spiClass = Number(r.spi) < 0.95 ? 'text-rose-600' : (Number(r.spi) > 1.05 ? 'text-emerald-600' : 'text-slate-800');
    tr.innerHTML = `<td class="py-1 pr-4">${r.date}</td><td class="py-1 pr-4">${r.project}</td><td class="py-1 pr-4">${(Number(r.planned)*100).toFixed(0)}%</td><td class="py-1 pr-4">${(Number(r.actual)*100).toFixed(0)}%</td><td class="py-1 pr-4">${(Number(r.variance)*100).toFixed(0)}%</td><td class="py-1 pr-4 ${spiClass}">${Number(r.spi).toFixed(2)}</td>`;
    body.appendChild(tr);
  });
}

function renderManpower(rows) {
  const body = document.getElementById('manpowerBody');
  if (!body) return;
  body.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="py-1 pr-4">${r.date}</td><td class="py-1 pr-4">${r.foreman}</td><td class="py-1 pr-4">${r.journeyman}</td><td class="py-1 pr-4">${r.apprentices}</td><td class="py-1 pr-4 font-medium">${r.total}</td>`;
    body.appendChild(tr);
  });
}

function renderDivision(rows) {
  const body = document.getElementById('divisionBody');
  if (!body) return;
  body.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="py-1 pr-4">${r.division}</td><td class="py-1 pr-4 font-medium">${r.total}</td>`;
    body.appendChild(tr);
  });
}

function renderProjectTotals(rows) {
  const body = document.getElementById('projectBody');
  if (!body) return;
  body.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="py-1 pr-4">${r.project}</td><td class="py-1 pr-4 font-medium">${r.total}</td>`;
    body.appendChild(tr);
  });
}

function renderHeatmap(heat) {
  const head = document.getElementById('heatmapHead');
  const body = document.getElementById('heatmapBody');
  if (!head || !body) return;
  head.innerHTML = '<th class="py-1 pr-2">Project</th>' + heat.dates.map(d => `<th class="py-1 px-2">${d.slice(5)}</th>`).join('');
  body.innerHTML = '';
  // find max to scale colors
  let max = 0;
  heat.rows.forEach(r => r.cells.forEach((v) => { if (v > max) max = v; }));
  const color = (val) => {
    if (max <= 0) return 'bg-slate-50';
    const p = Math.min(1, val / max);
    // interpolate from slate-50 to sky-500-ish using alpha
    const alpha = 0.15 + 0.6 * p;
    return `background-color: rgba(14,165,233,${alpha});`;
  };
  heat.rows.forEach(r => {
    const tr = document.createElement('tr');
    const cells = r.cells.map(v => `<td class="py-1 px-2 text-center" style="${color(v)}">${v}</td>`).join('');
    tr.innerHTML = `<td class="py-1 pr-2">${r.project}</td>${cells}`;
    body.appendChild(tr);
  });
}


