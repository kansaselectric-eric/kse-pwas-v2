/**
 * KSE Estimating Journal (Apps Script)
 * - Saves entries to Drive: KSE Estimating/<Project>/<YYYY-MM-DD>
 * - Appends summary rows to Google Sheet 'KSE_Estimating_Reports'
 * - Supports chunked upload staging/finalization
 * - CORS + optional Google ID token verification
 */

var ROOT_DRIVE_FOLDER_NAME = 'KSE Estimating';
var SUMMARY_SHEET_NAME = 'KSE_Estimating_Reports';
var GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

function doOptions(e) {
  return cors_({});
}

function doGet(e) {
  return cors_({ status: 'ok', service: 'kse-estimating' });
}

function doPost(e) {
  try {
    var authHeader = e && e.parameter && e.parameter.authorization ? e.parameter.authorization : (e && e.headers && (e.headers.Authorization || e.headers.authorization));
    if (!authHeader && e && e.postData && e.postData.type === 'application/json') {
      try {
        var parsed = JSON.parse(e.postData.contents || '{}');
        if (parsed && parsed.idToken) authHeader = 'Bearer ' + parsed.idToken;
      } catch (ignore) {}
    }
    var email = null;
    if (authHeader && String(authHeader).toLowerCase().indexOf('bearer ') === 0) {
      var token = String(authHeader).slice(7);
      var verified = verifyIdToken_(token);
      if (!verified || !verified.email || !verified.audOk || !verified.verified) {
        return cors_({ ok: false, error: 'Unauthorized' }, 401);
      }
      email = verified.email;
    } else {
      // You can relax this if needed:
      return cors_({ ok: false, error: 'Missing Authorization' }, 401);
    }

    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : null;
    if (!body) return cors_({ ok: false, error: 'Missing body' }, 400);

    // Chunked upload handling
    if (body.action === 'upload_chunk') {
      var entryId = body.entryId;
      var fileId = body.fileId;
      var idx = Number(body.chunkIndex || 0);
      var dataUrl = body.blob;
      if (!entryId || !fileId || !dataUrl) return cors_({ ok: false, error: 'Invalid chunk payload' }, 400);
      var staging = getOrCreateStagingFolder_();
      var entryFolder = getOrCreateSubFolder_(staging, entryId);
      var fileFolder = getOrCreateSubFolder_(entryFolder, fileId);
      var parsedChunk = parseDataUrl_(dataUrl, body.type || 'application/octet-stream');
      var chunkBytes = Utilities.base64Decode(parsedChunk.base64);
      var chunkBlob = Utilities.newBlob(chunkBytes, 'application/octet-stream', 'chunk_' + idx);
      fileFolder.createFile(chunkBlob);
      return cors_({ ok: true });
    }
    if (body.action === 'finalize_upload') {
      var entryId2 = body.entryId;
      var fileId2 = body.fileId;
      var filename = sanitize_(body.filename || ('upload-' + Date.now()));
      var mime = body.type || 'application/octet-stream';
      if (!entryId2 || !fileId2) return cors_({ ok: false, error: 'Invalid finalize' }, 400);
      var staging2 = getOrCreateStagingFolder_();
      var entryFolder2 = getOrCreateSubFolder_(staging2, entryId2);
      var fileFolder2 = getOrCreateSubFolder_(entryFolder2, fileId2);
      var chunks = [];
      var it = fileFolder2.getFiles();
      while (it.hasNext()) {
        var f = it.next();
        var n = f.getName();
        if (n.indexOf('chunk_') === 0) {
          var idxStr = n.split('_')[1];
          chunks.push({ idx: Number(idxStr), file: f });
        }
      }
      chunks.sort(function(a,b){ return a.idx - b.idx; });
      var combined = [];
      chunks.forEach(function(c){
        combined = combined.concat(Array.prototype.slice.call(c.file.getBlob().getBytes()));
      });
      var finalBlob = Utilities.newBlob(combined, mime, filename);
      var finalFile = entryFolder2.createFile(finalBlob);
      return cors_({ ok: true, stagedFileId: finalFile.getId(), filename: finalFile.getName(), type: mime });
    }

    if (body.action === 'generate_pdf') {
      var pdfInfo = generateSummaryPdf_(body);
      // Optional email to recipients from sheet
      emailSummaryIfConfigured_(pdfInfo, body);
      return cors_({ ok: true, pdfFileId: pdfInfo && pdfInfo.fileId ? pdfInfo.fileId : '' });
    }

    var project = sanitize_(body.project || '');
    if (!project) return cors_({ ok: false, error: 'Missing project' }, 400);

    var timestampIso = body.timestamp || new Date().toISOString();
    var tz = Session.getScriptTimeZone();
    var dateFolder = Utilities.formatDate(new Date(timestampIso), tz, 'yyyy-MM-dd');
    var client = body.client || '';
    var rfp = body.rfp || '';
    var bidDue = body.bidDue || '';
    var bidAmount = Number(body.bidAmount || 0);
    var probability = Number(body.probability || 0);
    var notes = body.notes || '';
    var measurements = JSON.stringify(body.measurements || []);
    var files = body.files || [];
    var stagedIds = body.stagedFileIds || [];
    var location = body.location || null;

    var rootFolder = getOrCreateRootFolder_();
    var projectFolder = getOrCreateSubFolder_(rootFolder, project);
    var dayFolder = getOrCreateSubFolder_(projectFolder, dateFolder);

    var savedFilenames = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var parsed = parseDataUrl_(f.blob, f.type);
        var decoded = Utilities.base64Decode(parsed.base64);
        var filename = sanitize_(f.filename || ('file-' + Date.now()));
        var blob = Utilities.newBlob(decoded, parsed.mimeType, filename);
        var created = dayFolder.createFile(blob);
        savedFilenames.push(created.getName());
      } catch (fileErr) {
        savedFilenames.push('ERROR:' + (f.filename || 'unknown'));
      }
    }
    if (stagedIds && stagedIds.length) {
      var moved = moveStagedFilesTo_(stagedIds, dayFolder);
      savedFilenames = savedFilenames.concat(moved);
    }

    appendSummaryRow_({
      timestamp: timestampIso,
      project: project,
      client: client,
      rfp: rfp,
      bidDue: bidDue,
      bidAmount: bidAmount,
      probability: probability,
      notes: notes,
      measurements: measurements,
      files: savedFilenames.join(', '),
      email: email,
      location: location
    });

    return cors_({ ok: true });
  } catch (err) {
    return cors_({ ok: false, error: String(err) }, 500);
  }
}

function cors_(payload, code) {
  if (code == null) code = 200;
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type')
    .setHeader('Cache-Control', 'no-store')
    .setHeader('Vary', 'Origin')
    .setResponseCode(code);
}

function getOrCreateRootFolder_() {
  var it = DriveApp.getFoldersByName(ROOT_DRIVE_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_DRIVE_FOLDER_NAME);
}
function getOrCreateStagingFolder_() {
  var it = DriveApp.getFoldersByName('KSE Estimating Incoming');
  return it.hasNext() ? it.next() : DriveApp.createFolder('KSE Estimating Incoming');
}
function getOrCreateSubFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function sanitize_(name) {
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
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
function moveStagedFilesTo_(stagedIds, destFolder) {
  var names = [];
  stagedIds.forEach(function(id){
    try {
      var f = DriveApp.getFileById(id);
      destFolder.addFile(f);
      var parentIt = f.getParents();
      while (parentIt.hasNext()) {
        var p = parentIt.next();
        if (p.getId() !== destFolder.getId()) {
          p.removeFile(f);
        }
      }
      names.push(f.getName());
    } catch (e) {}
  });
  return names;
}

function appendSummaryRow_(entry) {
  var sheet = getOrCreateSheet_(SUMMARY_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp','Project','Client','RFP','BidDue','BidAmount','WinProbability','Notes','MeasurementsJSON','Files','SubmittedBy','Lat','Lng','Accuracy']);
  }
  sheet.appendRow([
    entry.timestamp,
    entry.project,
    entry.client,
    entry.rfp,
    entry.bidDue,
    entry.bidAmount,
    entry.probability,
    entry.notes,
    entry.measurements,
    entry.files,
    entry.email || '',
    entry.location && entry.location.lat ? entry.location.lat : '',
    entry.location && entry.location.lng ? entry.location.lng : '',
    entry.location && entry.location.accuracy ? entry.location.accuracy : ''
  ]);
}

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) ss = SpreadsheetApp.create('KSE Estimating Data');
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function verifyIdToken_(idToken) {
  try {
    var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    var audOk = (info.aud === GOOGLE_CLIENT_ID);
    var verified = info.email_verified === 'true' || info.email_verified === true;
    return { email: info.email, audOk: audOk, verified: verified, iss: info.iss };
  } catch (e) {
    return null;
  }
}

function generateSummaryPdf_(entry) {
  var tz = Session.getScriptTimeZone();
  var timestampIso = entry.timestamp || new Date().toISOString();
  var dateFolder = Utilities.formatDate(new Date(timestampIso), tz, 'yyyy-MM-dd');
  var project = sanitize_(entry.project || 'Unknown Project');
  var root = getOrCreateRootFolder_();
  var projFolder = getOrCreateSubFolder_(root, project);
  var dayFolder = getOrCreateSubFolder_(projFolder, dateFolder);

  var doc = DocumentApp.create('Estimate Summary - ' + project + ' - ' + dateFolder);
  var body = doc.getBody();
  body.appendParagraph('Estimate Summary').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph(project).setHeading(DocumentApp.ParagraphHeading.HEADING2);

  var table = body.appendTable([
    ['Client', String(entry.client || '')],
    ['RFP / Ref', String(entry.rfp || '')],
    ['Bid Due', String(entry.bidDue || '')],
    ['Bid Amount (USD)', String(entry.bidAmount || '')],
    ['Win Probability (%)', String(entry.probability || '')],
    ['Submitted By', String(entry.email || '')],
    ['Timestamp', Utilities.formatDate(new Date(timestampIso), tz, 'yyyy-MM-dd HH:mm')]
  ]);
  table.setBorderWidth(0.5);
  body.appendParagraph('Notes').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph(String(entry.notes || ''));

  // Measurements
  body.appendParagraph('Measurements').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  var measurements = entry.measurements || [];
  if (typeof measurements === 'string') {
    try { measurements = JSON.parse(measurements); } catch (e) { measurements = []; }
  }
  if (measurements.length) {
    var mTable = body.appendTable([['Label','Value','Unit']]);
    for (var i = 0; i < measurements.length; i++) {
      var m = measurements[i];
      mTable.appendTableRow([String(m.label||''), String(m.value||''), String(m.unit||'')]);
    }
    mTable.setBorderWidth(0.5);
  } else {
    body.appendParagraph('No measurements.');
  }

  // Files listing (from day folder)
  body.appendParagraph('Files').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  var it = dayFolder.getFiles();
  var any = false;
  while (it.hasNext()) {
    any = true;
    var f = it.next();
    body.appendParagraph('• ' + f.getName());
  }
  if (!any) body.appendParagraph('No files attached.');

  doc.saveAndClose();
  var pdfBlob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
  var pdf = dayFolder.createFile(pdfBlob).setName(doc.getName() + '.pdf');
  DriveApp.getFileById(doc.getId()).setTrashed(true);
  return { fileId: pdf.getId(), name: pdf.getName(), folderId: dayFolder.getId() };
}

function emailSummaryIfConfigured_(pdfInfo, entry) {
  if (!pdfInfo || !pdfInfo.fileId) return;
  var sheet = getOrCreateSheet_('KSE_Estimating_Emails'); // one email per row, column A
  var v = sheet.getDataRange().getValues();
  if (v.length <= 1) return; // header or empty = skip emailing for now
  var emails = [];
  for (var i = 0; i < v.length; i++) {
    var cell = String(v[i][0] || '').trim();
    if (cell && cell.indexOf('@') !== -1) emails.push(cell);
  }
  if (!emails.length) return;
  try {
    var file = DriveApp.getFileById(pdfInfo.fileId);
    var subject = 'Estimate Summary: ' + (entry.project || '');
    var body = 'Automated summary PDF attached.\n\nProject: ' + (entry.project || '') + '\nRFP: ' + (entry.rfp || '') + '\nBid Due: ' + (entry.bidDue || '');
    MailApp.sendEmail({
      to: emails.join(','),
      subject: subject,
      body: body,
      attachments: [file.getAs('application/pdf')]
    });
  } catch (e) {}
}


