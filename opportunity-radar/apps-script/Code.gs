/**
 * KSE Tools - Opportunity Radar (Apps Script)
 * Creates a custom menu, provides stubbed fetchers, sheet population, and placeholder scoring.
 * TODO: Integrate real data sources and authentication as needed.
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('KSE Tools')
    .addItem('Refresh Opportunities', 'kseRefreshOpportunities')
    .addToUi();
}

function kseRefreshOpportunities() {
  const sheet = getOrCreateSheetByName_('Opportunities');
  sheet.clear();

  const headers = [
    'Source',
    'Opportunity Name',
    'Company',
    'Location',
    'Value',
    'Stage',
    'URL',
    'Score',
    'Fetched At'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  const rows = [];
  const fetchedAt = new Date();

  const sources = [
    fetchStubbedSource_('EnergyBoard'),
    fetchStubbedSource_('LocalGovBids')
  ];

  sources.forEach(source => {
    source.forEach(item => {
      const score = scoreOpportunity_(item);
      rows.push([
        item.source,
        item.name,
        item.company,
        item.location,
        item.value,
        item.stage,
        item.url,
        score,
        fetchedAt
      ]);
    });
  });

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }

  // Notify Teams for high-score items
  const highScore = rows.filter(r => Number(r[7]) >= 75);
  if (highScore.length) {
    notifyTeamsHighScore_(highScore);
  }
  enqueueForecast_(highScore);
}

/**
 * Demo stub fetcher - replace with real HTTP calls later.
 * TODO: Replace with UrlFetchApp.fetch calls to real sources and parse results.
 */
function fetchStubbedSource_(sourceName) {
  return [
    {
      source: sourceName,
      name: 'Substation Upgrade - North',
      company: 'City Utilities',
      location: 'Wichita, KS',
      value: 1200000,
      stage: 'Lead',
      url: 'https://example.com/opportunity/123',
      tags: ['substation', 'upgrade', 'medium-voltage']
    },
    {
      source: sourceName,
      name: 'Solar Farm Interconnect',
      company: 'SunBright Energy',
      location: 'Topeka, KS',
      value: 3200000,
      stage: 'Prospect',
      url: 'https://example.com/opportunity/456',
      tags: ['solar', 'interconnect', 'renewable']
    }
  ];
}

/**
 * Placeholder scoring function based on value and tags.
 * TODO: Replace with AI model or more sophisticated heuristic later.
 */
function scoreOpportunity_(item) {
  var base = 0;
  if (item.value >= 3000000) base += 40;
  if (item.value >= 1000000 && item.value < 3000000) base += 25;
  if (item.tags && item.tags.indexOf('renewable') !== -1) base += 15;
  if (item.tags && item.tags.indexOf('upgrade') !== -1) base += 10;
  if (item.location && item.location.toLowerCase().includes('ks')) base += 10;
  return Math.min(100, base);
}

function getOrCreateSheetByName_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// -------- Microsoft Teams notification for high-score opportunities --------
function notifyTeamsHighScore_(items) {
  try {
    const props = PropertiesService.getScriptProperties();
    const webhook = props.getProperty('TEAMS_WEBHOOK_URL');
    if (!webhook) return;
    const title = 'High-Score Opportunities';
    const lines = items.slice(0, 5).map(r => {
      const name = r[1], company = r[2], value = r[4], url = r[6], score = r[7];
      return `- ${name} (${company}) — $${Number(value).toLocaleString()} — Score ${score}${url ? ' — [Link](' + url + ')' : ''}`;
    }).join('\n');
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: title,
      themeColor: '0078D4',
      title: title,
      text: lines || 'No items.'
    };
    UrlFetchApp.fetch(webhook, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });
  } catch (e) {
    // ignore
  }
}

// -------- Forecast queue writer --------
function enqueueForecast_(items) {
  if (!items || !items.length) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('ForecastQueue') || ss.insertSheet('ForecastQueue');
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 7).setValues([['Division','Name','Stage','Value','CloseDate','Source','CreatedAt']]).setFontWeight('bold');
  }
  const now = new Date();
  const out = items.map(r => [ 'General', r[1], 'Prospect', r[4], '', r[0], now ]);
  sheet.getRange(sheet.getLastRow() + 1, 1, out.length, out[0].length).setValues(out);
}

// -------- Daily trigger --------
function dailyRefresh() {
  kseRefreshOpportunities();
}

function installDailyRefreshTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'dailyRefresh') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('dailyRefresh')
    .timeBased()
    .atHour(7)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

function weeklyRadarDigest() {
  try {
    const props = PropertiesService.getScriptProperties();
    const webhook = props.getProperty('TEAMS_WEBHOOK_URL');
    if (!webhook) return;
    const sheet = getOrCreateSheetByName_('Opportunities');
    const v = sheet.getDataRange().getValues();
    if (v.length <= 1) return;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    // Assume last col is 'Fetched At'
    let added = 0, high = 0, total = v.length - 1;
    for (let i = 1; i < v.length; i++) {
      const row = v[i];
      const fetched = new Date(row[8]);
      if (fetched >= weekAgo && fetched <= now) {
        added++;
        if (Number(row[7]) >= 75) high++;
      }
    }
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: 'Weekly Opportunity Radar',
      themeColor: '0078D4',
      title: 'Weekly Opportunity Radar Summary',
      text: `- New opportunities: ${added}\n- High-score (>=75): ${high}\n- Total in sheet: ${total}`
    };
    UrlFetchApp.fetch(webhook, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });
  } catch (e) {}
}

function installWeeklyRadarDigestTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'weeklyRadarDigest') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('weeklyRadarDigest')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}


