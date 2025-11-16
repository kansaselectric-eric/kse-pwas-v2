/**
 * KSE Project Management KPIs (Apps Script)
 * - Aggregates KPIs across Field Reports, Opportunity Radar, CRM, BD Forecast
 * - Exposes /kpis endpoint
 * - Writes PM_KPIs sheet with snapshot
 * - Sends daily/weekly Teams digests
 */

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action || '';
    if (action === 'kpis') {
      var k = computeKpis_();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, kpis: k }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    } else if (action === 'kpis_history') {
      var n = Number(e.parameter.n || 30);
      var hist = getKpisHistory_(n);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, history: hist }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    } else if (action === 'schedule_health') {
      var sh = doGetScheduleHealth_();
      return ContentService.createTextOutput(JSON.stringify({ ok: true, schedule: sh }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    } else if (action === 'manpower_forecast') {
      var days = Number(e.parameter.days || 14);
      var mf = computeManpowerForecast_(days);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, forecast: mf }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    } else if (action === 'manpower_breakdown') {
      var days2 = Number(e.parameter.days || 14);
      var mb = computeManpowerBreakdown_(days2);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, breakdown: mb }))
        .setMimeType(ContentService.MimeType.JSON)
        .setHeader('Access-Control-Allow-Origin', '*');
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'pm-kpis' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (e2) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(e2) }))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader('Access-Control-Allow-Origin', '*')
      .setResponseCode(500);
  }
}

// Manpower forecast from Project_Schedule with optional crew mix columns:
// Expected columns in Project_Schedule:
// Project, TaskId, Code, TaskName, Start, End, (CrewF, CrewJ, CrewA) OR (CrewTotal, PctF, PctJ, PctA)
// Optional sheet Crew_Defaults: rows with Code, CrewF, CrewJ, CrewA as fallback by Code; last row 'DEFAULT' as global fallback.
function computeManpowerForecast_(days) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sched = ss.getSheetByName('Project_Schedule');
  if (!sched) return [];
  var v = sched.getDataRange().getValues();
  if (v.length <= 1) return [];
  var h = v[0];
  var idx = {
    proj: h.indexOf('Project'),
    code: h.indexOf('Code'),
    start: h.indexOf('Start'),
    end: h.indexOf('End'),
    crewF: h.indexOf('CrewF'),
    crewJ: h.indexOf('CrewJ'),
    crewA: h.indexOf('CrewA'),
    crewTotal: h.indexOf('CrewTotal'),
    pctF: h.indexOf('PctF'),
    pctJ: h.indexOf('PctJ'),
    pctA: h.indexOf('PctA')
  };
  var defaults = readCrewDefaults_();
  var today = new Date(); today.setHours(0,0,0,0);
  var horizon = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  var map = {}; // dateStr -> {F,J,A}
  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    var start = new Date(row[idx.start]);
    var end = new Date(row[idx.end]);
    if (!(start instanceof Date) || isNaN(start.getTime()) || !(end instanceof Date) || isNaN(end.getTime())) continue;
    var s = new Date(Math.max(start.getTime(), today.getTime()));
    var e = new Date(Math.min(end.getTime(), horizon.getTime()));
    if (e < today) continue;
    var code = String(row[idx.code] || '').trim();
    var crew = resolveCrew_(row, idx, defaults, code);
    if (!crew) continue;
    // Even distribution across active days
    var totalDays = Math.max(1, Math.round((end - start) / (24*60*60*1000)) + 1);
    var activeDays = Math.max(1, Math.round((e - s) / (24*60*60*1000)) + 1);
    var perDay = { F: crew.F / totalDays, J: crew.J / totalDays, A: crew.A / totalDays };
    for (var d = new Date(s); d <= e; d = new Date(d.getTime() + 24*60*60*1000)) {
      var key = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      map[key] = map[key] || { F: 0, J: 0, A: 0 };
      map[key].F += perDay.F;
      map[key].J += perDay.J;
      map[key].A += perDay.A;
    }
  }
  var keys = Object.keys(map).sort();
  return keys.map(function(k){
    var o = map[k];
    return { date: k, foreman: Math.round(o.F), journeyman: Math.round(o.J), apprentices: Math.round(o.A), total: Math.round(o.F + o.J + o.A) };
  });
}

function resolveCrew_(row, idx, defaults, code) {
  var hasDirect = idx.crewF >= 0 || idx.crewJ >= 0 || idx.crewA >= 0;
  if (hasDirect) {
    var F = Number(row[idx.crewF] || 0);
    var J = Number(row[idx.crewJ] || 0);
    var A = Number(row[idx.crewA] || 0);
    if (F + J + A > 0) return { F: F, J: J, A: A };
  }
  var hasPct = idx.crewTotal >= 0 && (idx.pctF >= 0 || idx.pctJ >= 0 || idx.pctA >= 0);
  if (hasPct) {
    var tot = Number(row[idx.crewTotal] || 0);
    if (tot > 0) {
      var pF = Number(row[idx.pctF] || 0) / 100;
      var pJ = Number(row[idx.pctJ] || 0) / 100;
      var pA = Number(row[idx.pctA] || 0) / 100;
      return { F: tot * pF, J: tot * pJ, A: tot * pA };
    }
  }
  // defaults by code or global
  var d = defaults[code] || defaults['DEFAULT'];
  if (d) return { F: d.F, J: d.J, A: d.A };
  return null;
}

function readCrewDefaults_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName('Crew_Defaults');
  var out = {};
  if (!s) return out;
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return out;
  var h = v[0];
  var iCode = h.indexOf('Code');
  var iF = h.indexOf('CrewF');
  var iJ = h.indexOf('CrewJ');
  var iA = h.indexOf('CrewA');
  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    var code = String(row[iCode] || '').trim() || 'DEFAULT';
    out[code] = { F: Number(row[iF] || 0), J: Number(row[iJ] || 0), A: Number(row[iA] || 0) };
  }
  return out;
}

// Breakdown: totals by division and by project over the next N days, and heatmap matrix by project x date
function computeManpowerBreakdown_(days) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sched = ss.getSheetByName('Project_Schedule');
  if (!sched) return { division: [], project: [], heatmap: { dates: [], rows: [] } };
  var v = sched.getDataRange().getValues();
  if (v.length <= 1) return { division: [], project: [], heatmap: { dates: [], rows: [] } };
  var h = v[0];
  var idx = {
    proj: h.indexOf('Project'),
    div: h.indexOf('Division'),
    code: h.indexOf('Code'),
    start: h.indexOf('Start'),
    end: h.indexOf('End'),
    crewF: h.indexOf('CrewF'),
    crewJ: h.indexOf('CrewJ'),
    crewA: h.indexOf('CrewA'),
    crewTotal: h.indexOf('CrewTotal'),
    pctF: h.indexOf('PctF'),
    pctJ: h.indexOf('PctJ'),
    pctA: h.indexOf('PctA')
  };
  var defaults = readCrewDefaults_();
  var today = new Date(); today.setHours(0,0,0,0);
  var horizon = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
  var dates = [];
  for (var d = new Date(today); d <= horizon; d = new Date(d.getTime() + 24*60*60*1000)) {
    dates.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
  }
  var heat = {}; // project -> dateStr -> total
  var divTotals = {}; // division -> total
  var projTotals = {}; // project -> total

  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    var start = new Date(row[idx.start]);
    var end = new Date(row[idx.end]);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    var s = new Date(Math.max(start.getTime(), today.getTime()));
    var e = new Date(Math.min(end.getTime(), horizon.getTime()));
    if (e < today) continue;
    var code = String(row[idx.code] || '').trim();
    var crew = resolveCrew_(row, idx, defaults, code);
    if (!crew) continue;
    var project = String(row[idx.proj] || 'Unknown');
    var division = idx.div >= 0 ? String(row[idx.div] || 'General') : 'General';
    var totalCrew = crew.F + crew.J + crew.A;
    var totalDays = Math.max(1, Math.round((end - start) / (24*60*60*1000)) + 1);
    var perDay = totalCrew / totalDays;
    // accumulate per day
    for (var d2 = new Date(s); d2 <= e; d2 = new Date(d2.getTime() + 24*60*60*1000)) {
      var key = Utilities.formatDate(d2, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      heat[project] = heat[project] || {};
      heat[project][key] = (heat[project][key] || 0) + perDay;
      divTotals[division] = (divTotals[division] || 0) + perDay;
      projTotals[project] = (projTotals[project] || 0) + perDay;
    }
  }

  var divisionArr = Object.keys(divTotals).sort().map(function(name){ return { division: name, total: Math.round(divTotals[name]) }; });
  var projectArr = Object.keys(projTotals).sort().map(function(name){ return { project: name, total: Math.round(projTotals[name]) }; });
  var heatRows = Object.keys(heat).sort().map(function(project){
    var cells = dates.map(function(dt){ return Math.round(heat[project][dt] || 0); });
    return { project: project, cells: cells };
  });
  return { division: divisionArr, project: projectArr, heatmap: { dates: dates, rows: heatRows } };
}

function computeKpis_() {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var k = {
    date: Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    fieldReports: { reports7d: 0, manpower7d: 0, safety7d: 0 },
    radar: { new7d: 0, high7d: 0, total: 0 },
    crm: { touches7d: 0, topAccounts: [] },
    forecast: { weighted90d: 0 }
  };

  // Field Reports
  var fr = ss.getSheetByName('KSE_Field_Reports');
  if (fr) {
    var v = fr.getDataRange().getValues();
    var h = v[0];
    var iTs = h.indexOf('Timestamp'), iMan = h.indexOf('Manpower'), iSaf = h.indexOf('Safety Issues');
    for (var i = 1; i < v.length; i++) {
      var row = v[i];
      var ts = new Date(row[iTs]);
      if (ts >= weekAgo && ts <= now) {
        k.fieldReports.reports7d++;
        k.fieldReports.manpower7d += Number(row[iMan] || 0);
        if (String(row[iSaf]).toLowerCase().indexOf('yes') !== -1) k.fieldReports.safety7d++;
      }
    }
  }

  // Opportunity Radar
  var op = ss.getSheetByName('Opportunities');
  if (op) {
    var v2 = op.getDataRange().getValues();
    k.radar.total = Math.max(0, v2.length - 1);
    for (var j = 1; j < v2.length; j++) {
      var r = v2[j];
      var fetched = new Date(r[8]);
      if (fetched >= weekAgo && fetched <= now) {
        k.radar.new7d++;
        if (Number(r[7]) >= 75) k.radar.high7d++;
      }
    }
  }

  // CRM
  var crm = ss.getSheetByName('CRM_Interactions');
  if (crm) {
    var v3 = crm.getDataRange().getValues();
    var cc = {};
    for (var x = 1; x < v3.length; x++) {
      var rr = v3[x];
      var ts3 = new Date(rr[1]);
      if (ts3 >= weekAgo && ts3 <= now) {
        k.crm.touches7d++;
        var comp = rr[3] || 'Unknown';
        cc[comp] = (cc[comp] || 0) + 1;
      }
    }
    k.crm.topAccounts = Object.keys(cc).sort(function(a,b){return cc[b]-cc[a];}).slice(0,5).map(function(n){return { name: n, touches: cc[n] };});
  }

  // Forecast
  var fc = ss.getSheetByName('Forecast');
  if (fc) {
    var v4 = fc.getDataRange().getValues();
    for (var y = 1; y < v4.length; y++) {
      var name = v4[y][0];
      if (String(name).toUpperCase() === 'TOTAL') {
        k.forecast.weighted90d = Number(v4[y][4] || 0);
        break;
      }
    }
  }

  writeKpisSheet_(k);
  return k;
}

function writeKpisSheet_(k) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PM_KPIs') || SpreadsheetApp.getActiveSpreadsheet().insertSheet('PM_KPIs');
  if (s.getLastRow() === 0) {
    s.appendRow(['Date','FR Reports 7d','FR Manpower 7d','FR Safety 7d','Radar New 7d','Radar High 7d','Radar Total','CRM Touches 7d','Forecast Weighted 90d']);
  }
  s.appendRow([k.date, k.fieldReports.reports7d, k.fieldReports.manpower7d, k.fieldReports.safety7d, k.radar.new7d, k.radar.high7d, k.radar.total, k.crm.touches7d, k.forecast.weighted90d]);
}

function getKpisHistory_(n) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PM_KPIs');
  if (!s) return [];
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return [];
  var rows = v.slice(1).slice(-n);
  return rows.map(function(r) {
    return { date: r[0], frReports: r[1], frManpower: r[2], frSafety: r[3], radarNew: r[4], radarHigh: r[5], radarTotal: r[6], crmTouches: r[7], forecast90: r[8] };
  });
}

function doGetScheduleHealth_() {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Schedule_Health');
  if (!s) return [];
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return [];
  // Return last 30 rows
  var rows = v.slice(1).slice(-30).map(function(r) {
    return { date: r[0], project: r[1], planned: r[2], actual: r[3], variance: r[4], spi: r[5] };
  });
  return rows;
}

function pmDailyDigest() {
  var props = PropertiesService.getScriptProperties();
  var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
  if (!webhook) return;
  var k = computeKpis_();
  var text = ''
    + '**Field Reports (7d):** ' + k.fieldReports.reports7d + ' reports, manpower ' + k.fieldReports.manpower7d + ', safety ' + k.fieldReports.safety7d + '\n'
    + '**Radar:** new ' + k.radar.new7d + ', high ' + k.radar.high7d + ', total ' + k.radar.total + '\n'
    + '**CRM touches (7d):** ' + k.crm.touches7d + '\n'
    + '**Forecast 90d (weighted):** $' + Number(k.forecast.weighted90d).toLocaleString();
  postTeams_(webhook, 'Daily Project Management KPIs', text);
}

function pmWeeklyDigest() {
  var props = PropertiesService.getScriptProperties();
  var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
  if (!webhook) return;
  var k = computeKpis_();
  var top = (k.crm.topAccounts || []).map(function(t){ return t.name + ' (' + t.touches + ')'; }).join(', ');
  var text = ''
    + '**Field Reports (7d):** ' + k.fieldReports.reports7d + ' reports, manpower ' + k.fieldReports.manpower7d + ', safety ' + k.fieldReports.safety7d + '\n'
    + '**Radar:** new ' + k.radar.new7d + ', high ' + k.radar.high7d + ', total ' + k.radar.total + '\n'
    + '**CRM top accounts:** ' + (top || 'n/a') + '\n'
    + '**Forecast 90d (weighted):** $' + Number(k.forecast.weighted90d).toLocaleString();
  postTeams_(webhook, 'Weekly Project Management KPIs', text);
}

function postTeams_(url, title, text) {
  try {
    UrlFetchApp.fetch(url, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: title,
        themeColor: '0078D4',
        title: title,
        text: text
      })
    });
  } catch (e) {}
}

function installPmDigestTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var f = t.getHandlerFunction && t.getHandlerFunction();
    if (f === 'pmDailyDigest' || f === 'pmWeeklyDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('pmDailyDigest').timeBased().atHour(8).everyDays(1).inTimezone(Session.getScriptTimeZone()).create();
  ScriptApp.newTrigger('pmWeeklyDigest').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone(Session.getScriptTimeZone()).create();
}


