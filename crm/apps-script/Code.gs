/**
 * KSE CRM (Apps Script)
 * - Auth via Google ID token (same GOOGLE_CLIENT_ID as PWAs)
 * - Sheets: CRM_Companies, CRM_Contacts, CRM_Interactions
 * - GET actions: companies, contacts, interactions (with filters)
 * - POST action: interaction (log touch) with optional attachments saved to Drive
 * - Teams webhook optional via TEAMS_WEBHOOK_URL
 */

var CRM_COMP_SHEET = 'CRM_Companies';
var CRM_CONT_SHEET = 'CRM_Contacts';
var CRM_INTR_SHEET = 'CRM_Interactions';
var GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action || '';
    // Microsoft Graph webhook validation (no auth; responds with validation token)
    if (action === 'graph' && e && e.parameter && e.parameter.validationToken) {
      return ContentService.createTextOutput(e.parameter.validationToken).setMimeType(ContentService.MimeType.TEXT);
    }
    var auth = getAuthEmail_(e);
    if (!auth) return cors_({ ok: false, error: 'Unauthorized' }, 401);
    if (action === 'companies') {
      return cors_({ ok: true, companies: listCompanies_() });
    } else if (action === 'contacts') {
      return cors_({ ok: true, contacts: listContacts_() });
    } else if (action === 'interactions') {
      var filters = {
        companyId: e.parameter.companyId || '',
        contactId: e.parameter.contactId || '',
        type: e.parameter.type || '',
        from: e.parameter.from || '',
        to: e.parameter.to || '',
        q: e.parameter.q || ''
      };
      return cors_({ ok: true, interactions: listInteractions_(filters) });
    }
    return cors_({ ok: true, status: 'crm-alive' });
  } catch (err) {
    return cors_({ ok: false, error: String(err) }, 500);
  }
}

// -------- Weekly CRM digest --------
function weeklyCrmDigest() {
  try {
    var props = PropertiesService.getScriptProperties();
    var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
    if (!webhook) return;
    var s = sheet_(CRM_INTR_SHEET);
    var v = s.getDataRange().getValues();
    if (v.length <= 1) return;
    var idxTs = 1, idxCompany = 3, idxType = 6, idxUser = 14;
    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    var count = 0;
    var perCompany = {};
    var perUser = {};
    for (var i = 1; i < v.length; i++) {
      var row = v[i];
      var ts = new Date(row[idxTs]);
      if (ts < weekAgo || ts > now) continue;
      count++;
      var comp = row[idxCompany] || 'Unknown';
      perCompany[comp] = (perCompany[comp] || 0) + 1;
      var user = row[idxUser] || 'Unknown';
      perUser[user] = (perUser[user] || 0) + 1;
    }
    var topCompanies = Object.keys(perCompany).sort(function(a,b){return perCompany[b]-perCompany[a];}).slice(0,5).map(function(k){return k + ' (' + perCompany[k] + ')';}).join(', ');
    var topUsers = Object.keys(perUser).sort(function(a,b){return perUser[b]-perUser[a];}).slice(0,5).map(function(k){return k + ' (' + perUser[k] + ')';}).join(', ');
    var text = '- Total interactions: ' + count + '\n' + '- Top accounts: ' + (topCompanies || 'n/a') + '\n' + '- Top contributors: ' + (topUsers || 'n/a');
    UrlFetchApp.fetch(webhook, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: 'Weekly CRM Summary',
        themeColor: '0078D4',
        title: 'Weekly CRM Summary',
        text: text
      })
    });
  } catch (e) {}
}

function installWeeklyCrmDigestTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'weeklyCrmDigest') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('weeklyCrmDigest')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

// -------- Zero-touch accounts digest --------
function zeroTouchAccountsDigest_() {
  var props = PropertiesService.getScriptProperties();
  var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
  if (!webhook) return;
  var days = Number(props.getProperty('ZERO_TOUCH_DAYS') || 14);
  var cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  var companies = listCompanies_();
  var interactions = sheet_(CRM_INTR_SHEET).getDataRange().getValues();
  var lastTouchByCompany = {};
  if (interactions.length > 1) {
    for (var i = 1; i < interactions.length; i++) {
      var row = interactions[i];
      var ts = new Date(row[1]);
      var companyName = String(row[3] || '');
      if (!companyName) continue;
      if (!lastTouchByCompany[companyName] || ts > lastTouchByCompany[companyName]) {
        lastTouchByCompany[companyName] = ts;
      }
    }
  }
  var zero = [];
  companies.forEach(function(c) {
    var last = lastTouchByCompany[c.name];
    if (!last || last < cutoff) {
      zero.push({ name: c.name, lastTouch: last ? Utilities.formatDate(last, Session.getScriptTimeZone(), 'yyyy-MM-dd') : 'never' });
    }
  });
  if (!zero.length) return;
  zero.sort(function(a,b){ return a.name.localeCompare(b.name); });
  var lines = zero.slice(0, 25).map(function(z){ return '- ' + z.name + ' (last: ' + z.lastTouch + ')'; }).join('\n');
  UrlFetchApp.fetch(webhook, {
    method: 'post',
    muteHttpExceptions: true,
    contentType: 'application/json',
    payload: JSON.stringify({
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: 'Zero-touch accounts',
      themeColor: 'E81123',
      title: 'Zero-touch Accounts (' + days + 'd)',
      text: lines
    })
  });
}

function installZeroTouchAccountsTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'zeroTouchAccountsDigest_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('zeroTouchAccountsDigest_')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    // Microsoft Graph webhook notifications (no auth header; uses app secret to fetch message)
    if (body && body.action === 'graph') {
      handleGraphNotifications_(body);
      return cors_({ ok: true });
    }
    var auth = getAuthEmail_(e);
    if (!auth) return cors_({ ok: false, error: 'Unauthorized' }, 401);
    if (body.action === 'interaction') {
      var rec = saveInteraction_(auth, body);
      maybeNotifyTeams_(rec);
      return cors_({ ok: true, id: rec.id });
    }
    return cors_({ ok: false, error: 'Unknown action' }, 400);
  } catch (err) {
    return cors_({ ok: false, error: String(err) }, 500);
  }
}

function cors_(payload, code) {
  if (code == null) code = 200;
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .setResponseCode(code);
}

function getAuthEmail_(e) {
  var header = e && e.headers && (e.headers.Authorization || e.headers.authorization);
  if (!header || String(header).toLowerCase().indexOf('bearer ') !== 0) return null;
  var token = String(header).slice(7);
  var info = verifyIdToken_(token);
  if (!info || !info.email || !info.audOk || !info.verified) return null;
  return info.email;
}

function verifyIdToken_(idToken) {
  try {
    var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    return {
      email: info.email,
      audOk: (info.aud === GOOGLE_CLIENT_ID),
      verified: info.email_verified === 'true' || info.email_verified === true
    };
  } catch (e) {
    return null;
  }
}

function listCompanies_() {
  var s = sheet_(CRM_COMP_SHEET);
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return [];
  var out = [];
  for (var i = 1; i < v.length; i++) {
    out.push({ id: String(v[i][0]), name: String(v[i][1]), domain: String(v[i][2] || '') });
  }
  return out;
}

function listContacts_() {
  var s = sheet_(CRM_CONT_SHEET);
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return [];
  var out = [];
  for (var i = 1; i < v.length; i++) {
    out.push({ id: String(v[i][0]), companyId: String(v[i][1]), name: String(v[i][2]), title: String(v[i][3] || '') });
  }
  return out;
}

function listInteractions_(f) {
  var s = sheet_(CRM_INTR_SHEET);
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return [];
  var header = v[0];
  var idx = {
    id: 0, timestamp: 1, companyId: 2, companyName: 3, contactId: 4, contactName: 5,
    type: 6, channel: 7, subject: 8, notes: 9, tags: 10, outcome: 11, sentiment: 12, duration: 13, userEmail: 14
  };
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    if (f.companyId && String(row[idx.companyId]) !== f.companyId) continue;
    if (f.contactId && String(row[idx.contactId]) !== f.contactId) continue;
    if (f.type && String(row[idx.type]) !== f.type) continue;
    if (f.from && new Date(row[idx.timestamp]) < new Date(f.from)) continue;
    if (f.to && new Date(row[idx.timestamp]) > new Date(f.to)) continue;
    var hay = (row[idx.subject] + ' ' + row[idx.notes] + ' ' + row[idx.tags]).toLowerCase();
    if (f.q && hay.indexOf(String(f.q).toLowerCase()) === -1) continue;
    out.push({
      id: row[idx.id],
      timestamp: row[idx.timestamp],
      companyId: row[idx.companyId],
      companyName: row[idx.companyName],
      contactId: row[idx.contactId],
      contactName: row[idx.contactName],
      type: row[idx.type],
      channel: row[idx.channel],
      subject: row[idx.subject],
      notes: row[idx.notes],
      tags: String(row[idx.tags] || '').split('|').filter(Boolean),
      outcome: row[idx.outcome],
      sentiment: row[idx.sentiment],
      duration: row[idx.duration],
      userEmail: row[idx.userEmail]
    });
  }
  return out;
}

function saveInteraction_(email, body) {
  var companies = listCompanies_();
  var contacts = listContacts_();
  var comp = companies.find(function(c) { return String(c.id) === String(body.companyId); });
  var cont = contacts.find(function(c) { return String(c.id) === String(body.contactId); });

  var s = sheet_(CRM_INTR_SHEET);
  if (s.getLastRow() === 0) {
    s.appendRow(['Id','Timestamp','CompanyId','CompanyName','ContactId','ContactName','Type','Channel','Subject','Notes','Tags','Outcome','Sentiment','Duration','UserEmail']);
  }
  var id = 'INT-' + Date.now();
  var ts = body.timestamp || new Date().toISOString();
  var tags = (body.tags || []).join('|');
  s.appendRow([id, ts, (comp && comp.id) || body.companyId, (comp && comp.name) || '', (cont && cont.id) || body.contactId, (cont && cont.name) || '', body.type || '', body.channel || '', body.subject || '', body.notes || '', tags, body.outcome || '', body.sentiment || '', body.duration || '', email || '']);

  // Attachments (optional): save to Drive under CRM/Attachments/<id>
  var files = body.files || [];
  if (files && files.length) {
    var base = DriveApp.getFoldersByName('KSE CRM Attachments');
    var root = base.hasNext() ? base.next() : DriveApp.createFolder('KSE CRM Attachments');
    var folder = root.createFolder(id);
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var parsed = parseDataUrl_(f.blob, f.type);
        var decoded = Utilities.base64Decode(parsed.base64);
        var blob = Utilities.newBlob(decoded, parsed.mimeType, f.filename || ('file-' + (i + 1)));
        folder.createFile(blob);
      } catch (e) {}
    }
  }
  return { id: id, project: (comp && comp.name) || '', email: email };
}

// -------- Microsoft Graph integration --------
function handleGraphNotifications_(payload) {
  try {
    var props = PropertiesService.getScriptProperties();
    var tenant = props.getProperty('MS_TENANT_ID');
    var clientId = props.getProperty('MS_CLIENT_ID');
    var clientSecret = props.getProperty('MS_CLIENT_SECRET');
    if (!tenant || !clientId || !clientSecret) return;
    var token = getGraphToken_(tenant, clientId, clientSecret);
    if (!token) return;
    var oursDomain = (props.getProperty('OUR_EMAIL_DOMAIN') || 'kansaselectric.com').toLowerCase();
    var companies = listCompanies_();
    var domainToCompany = {};
    companies.forEach(function(c) {
      if (c.domain) domainToCompany[c.domain.toLowerCase()] = c;
    });
    var notifications = payload.value || [];
    notifications.forEach(function(n) {
      // n.resource example: users/{id}/messages/{messageId}
      var resource = n.resource;
      if (!resource) return;
      var msg = graphGet_(token, 'https://graph.microsoft.com/v1.0/' + resource);
      if (!msg || !msg.sender || !msg.toRecipients) return;
      var senderEmail = (msg.sender.emailAddress && msg.sender.emailAddress.address || '').toLowerCase();
      var recipients = (msg.toRecipients || []).map(function(r){ return (r.emailAddress && r.emailAddress.address || '').toLowerCase(); });
      // only process sent by our domain
      if (senderEmail.indexOf('@' + oursDomain) === -1) return;
      var matchedCompany = null;
      for (var i = 0; i < recipients.length; i++) {
        var dom = recipients[i].split('@')[1] || '';
        if (dom && dom !== oursDomain && domainToCompany[dom]) { matchedCompany = domainToCompany[dom]; break; }
      }
      if (!matchedCompany) return;
      // Log interaction
      saveInteraction_((msg.sender.emailAddress && msg.sender.emailAddress.address) || '', {
        companyId: matchedCompany.id,
        contactId: '',
        type: 'Email',
        channel: 'Email',
        subject: msg.subject || '',
        notes: 'Email logged via Microsoft 365 (auto-touch).',
        tags: ['auto','email'],
        outcome: '',
        sentiment: '',
        duration: '',
        timestamp: msg.sentDateTime || new Date().toISOString(),
        files: []
      });
    });
  } catch (e) {}
}

function getGraphToken_(tenant, clientId, clientSecret) {
  try {
    var res = UrlFetchApp.fetch('https://login.microsoftonline.com/' + tenant + '/oauth2/v2.0/token', {
      method: 'post',
      payload: {
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
      },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    var json = JSON.parse(res.getContentText());
    return json.access_token;
  } catch (e) { return null; }
}

function graphGet_(token, url) {
  try {
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText());
  } catch (e) { return null; }
}

function installGraphSubscriptions() {
  var props = PropertiesService.getScriptProperties();
  var tenant = props.getProperty('MS_TENANT_ID');
  var clientId = props.getProperty('MS_CLIENT_ID');
  var clientSecret = props.getProperty('MS_CLIENT_SECRET');
  var usersCsv = props.getProperty('MS_USERS'); // comma-separated emails to monitor
  var callback = props.getProperty('MS_WEBHOOK_URL'); // this web app URL: .../exec?action=graph
  if (!tenant || !clientId || !clientSecret || !usersCsv || !callback) throw new Error('Missing Graph config.');
  var token = getGraphToken_(tenant, clientId, clientSecret);
  var users = usersCsv.split(',').map(function(s){return s.trim();}).filter(Boolean);
  var expiration = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(); // 48h; must renew before expiry
  users.forEach(function(upn) {
    var body = {
      changeType: 'created',
      notificationUrl: callback,
      resource: "/users('" + upn + "')/mailFolders('SentItems')/messages",
      expirationDateTime: expiration,
      clientState: 'ksecrm'
    };
    try {
      UrlFetchApp.fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });
    } catch (e) {}
  });
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('KSE CRM Data');
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  return s;
}

function parseDataUrl_(dataUrl, fallbackType) {
  if (dataUrl && dataUrl.indexOf('data:') === 0) {
    var comma = dataUrl.indexOf(',');
    var meta = dataUrl.substring(5, comma);
    var base64 = dataUrl.substring(comma + 1);
    var mime = meta.split(';')[0] || fallbackType || 'application/octet-stream';
    return { mimeType: mime, base64: base64 };
  }
  return { mimeType: fallbackType || 'application/octet-stream', base64: dataUrl };
}

function maybeNotifyTeams_(entry) {
  try {
    var props = PropertiesService.getScriptProperties();
    var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
    if (!webhook) return;
    var title = 'New CRM Interaction Logged';
    var text = '**Company:** ' + (entry.project || '') + '\n' + '**By:** ' + (entry.email || '');
    UrlFetchApp.fetch(webhook, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: title, themeColor: '0078D4', title: title, text: text
      })
    });
  } catch (e) {}
}


