/**
 * Field Reports Ingest Service (Apps Script)
 * - Creates Drive folder structure: KSE Field Reports/<Project>/<YYYY-MM-DD>
 * - Accepts POST with JSON body and base64 file content
 * - Appends summary to Google Sheet 'KSE_Field_Reports'
 * - CORS enabled
 * TODO: AI summarization pipeline, auth, permission management
 */

var ROOT_DRIVE_FOLDER_NAME = 'KSE Field Reports';
var SUMMARY_SHEET_NAME = 'KSE_Field_Reports';
var USERS_SHEET_NAME = 'KSE_Users'; // email, role
var PROJECT_PM_SHEET_NAME = 'Project_PMs';
var ALLOWED_DOMAINS = ['kansaselectric.com']; // TODO: adjust for your org
var GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'; // must match PWA
var ENABLE_CHUNKED_UPLOADS = false; // flip to true when moving to chunk assembly
// Acumatica config (set via Script Properties)
// ACU_BASE_URL, ACU_TENANT, ACU_USERNAME, ACU_PASSWORD or ACU_TOKEN
// Teams config (set via Script Properties)
// TEAMS_WEBHOOK_URL
// Daily report time (set via Script Properties) OPTIONAL: DAILY_REPORT_HOUR (0-23), default 18

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action ? String(e.parameter.action) : '';
    if (action === 'jobs') {
      // AuthN check
      var authHeader = e && e.parameter && e.parameter.authorization ? e.parameter.authorization : (e && e.headers && (e.headers.Authorization || e.headers.authorization));
      var email = null;
      if (authHeader && String(authHeader).toLowerCase().indexOf('bearer ') === 0) {
        var token = String(authHeader).slice(7);
        var verified = verifyIdToken_(token);
        if (!verified || !verified.email || !verified.audOk || !verified.verified) {
          return createCorsResponse_({ ok: false, error: 'Unauthorized' }, 401);
        }
        email = verified.email;
        if (!isEmailAllowed_(email)) {
          return createCorsResponse_({ ok: false, error: 'Forbidden' }, 403);
        }
      } else {
        return createCorsResponse_({ ok: false, error: 'Missing Authorization' }, 401);
      }
      var jobs = fetchAcumaticaJobs_();
      return createCorsResponse_({ ok: true, jobs: jobs });
    } else if (action === 'tasks') {
      var authHeader2 = e && e.parameter && e.parameter.authorization ? e.parameter.authorization : (e && e.headers && (e.headers.Authorization || e.headers.authorization));
      if (!authHeader2 || String(authHeader2).toLowerCase().indexOf('bearer ') !== 0) {
        return createCorsResponse_({ ok: false, error: 'Missing Authorization' }, 401);
      }
      var token2 = String(authHeader2).slice(7);
      var v2 = verifyIdToken_(token2);
      if (!v2 || !v2.email || !v2.audOk || !v2.verified || !isEmailAllowed_(v2.email)) {
        return createCorsResponse_({ ok: false, error: 'Unauthorized' }, 401);
      }
      var projectName = e && e.parameter && e.parameter.project ? String(e.parameter.project) : '';
      var tasks = listProjectTasks_(projectName);
      return createCorsResponse_({ ok: true, tasks: tasks });
    }
    return createCorsResponse_({ status: 'ok', service: 'kse-field-reports' });
  } catch (err) {
    return createCorsResponse_({ ok: false, error: String(err) }, 500);
  }
}

function doOptions(e) {
  return createCorsResponse_({});
}

function doPost(e) {
  try {
    // AuthN: Verify ID token if provided
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
        return createCorsResponse_({ ok: false, error: 'Unauthorized' }, 401);
      }
      email = verified.email;
      if (!isEmailAllowed_(email)) {
        return createCorsResponse_({ ok: false, error: 'Forbidden' }, 403);
      }
    } else {
      // Require authentication
      return createCorsResponse_({ ok: false, error: 'Missing Authorization' }, 401);
    }

    var body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : null;
    // Chunked upload actions
    if (body && body.action === 'upload_chunk') {
      var repId = body.reportId;
      var fileId = body.fileId;
      var idx = Number(body.chunkIndex || 0);
      var total = Number(body.totalChunks || 0);
      var dataUrl = body.blob;
      if (!repId || !fileId || total <= 0 || !dataUrl) {
        return createCorsResponse_({ ok: false, error: 'Invalid chunk payload' }, 400);
      }
      var staging = getOrCreateStagingFolder_();
      var repFolder = getOrCreateSubFolder_(staging, repId);
      var fileFolder = getOrCreateSubFolder_(repFolder, fileId);
      var parsedChunk = parseDataUrl_(dataUrl, body.type || 'application/octet-stream');
      var chunkBytes = Utilities.base64Decode(parsedChunk.base64);
      var chunkBlob = Utilities.newBlob(chunkBytes, 'application/octet-stream', 'chunk_' + idx);
      fileFolder.createFile(chunkBlob);
      return createCorsResponse_({ ok: true });
    }
    if (body && body.action === 'finalize_upload') {
      var repId2 = body.reportId;
      var fileId2 = body.fileId;
      var filename = sanitize_(body.filename || ('upload-' + Date.now()));
      var mime = body.type || 'application/octet-stream';
      if (!repId2 || !fileId2) return createCorsResponse_({ ok: false, error: 'Invalid finalize' }, 400);
      var staging2 = getOrCreateStagingFolder_();
      var repFolder2 = getOrCreateSubFolder_(staging2, repId2);
      var fileFolder2 = getOrCreateSubFolder_(repFolder2, fileId2);
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
      var finalFile = repFolder2.createFile(finalBlob);
      return createCorsResponse_({ ok: true, stagedFileId: finalFile.getId(), filename: finalFile.getName(), type: mime });
    }

    if (!body || !body.project) {
      return createCorsResponse_({ ok: false, error: 'Missing body or project' }, 400);
    }

    // Idempotency: prevent duplicate report rows by reportId
    var reportId = body.reportId || '';
    if (reportId && isReportRecorded_(reportId)) {
      return createCorsResponse_({ ok: true, duplicate: true });
    }

    var project = sanitize_(body.project);
    var timestampIso = body.timestamp || new Date().toISOString();
    var dateFolder = Utilities.formatDate(new Date(timestampIso), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var notes = body.notes || '';
    var manpower = body.manpower || 0;
    var safetyFlags = !!body.safetyFlags;
    var files = body.files || [];
    var fileHashes = body.fileHashes || [];
    var stagedIds = body.stagedFileIds || [];
    var stagedFiles = body.stagedFiles || [];
    var acJobId = body.acumaticaJobId || '';
    var acJobNumber = body.acumaticaJobNumber || '';
    var acJobName = body.acumaticaJobName || '';
    var location = body.location || null;
    var task = body.task || null;
    var qtyCompleted = body.qtyCompleted || 0;
    var pctToday = body.pctToday || 0;
    var narrative = body.narrative || {};
    var summaryText = body.summaryText || '';
    var fieldTech = body.fieldTech || '';
    var crewHours = Number(body.crewHours || 0);
    var crewRate = Number(body.crewRate || 0);
    var crewCost = Number(body.crewCost || 0);
    var lookaheadRequests = Array.isArray(body.materialRequests) ? body.materialRequests : [];

    var rootFolder = getOrCreateRootFolder_();
    var projectFolder = getOrCreateSubFolder_(rootFolder, project);
    var dayFolder = getOrCreateSubFolder_(projectFolder, dateFolder);
    var dayFolderUrl = dayFolder.getUrl();

    var savedFilenames = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      try {
        var hash = (fileHashes && fileHashes.length > i) ? fileHashes[i] : null;
        var candidateName = sanitize_(f.filename || ('file-' + Date.now()));
        if (hash && isFileHashRecorded_(hash)) {
          savedFilenames.push('DUPLICATE:' + candidateName);
          continue;
        }
        var parsed = parseDataUrl_(f.blob, f.type);
        var decoded = Utilities.base64Decode(parsed.base64);
        var filename = candidateName;
        var blob = Utilities.newBlob(decoded, parsed.mimeType, filename);
        var created = dayFolder.createFile(blob);
        savedFilenames.push(created.getName());
        if (hash) recordFileHash_(hash, project, timestampIso, reportId);
      } catch (fileErr) {
        savedFilenames.push('ERROR:' + (f.filename || 'unknown'));
      }
    }
    // Move any staged files into the day folder (with hash de-dupe if provided)
    if (stagedFiles && stagedFiles.length) {
      for (var s = 0; s < stagedFiles.length; s++) {
        try {
          var sf = stagedFiles[s];
          var stagedFileId = sf.id;
          var stagedHash = sf.hash || null;
          var stagedFile = DriveApp.getFileById(stagedFileId);
          if (stagedHash && isFileHashRecorded_(stagedHash)) {
            stagedFile.setTrashed(true);
            savedFilenames.push('DUPLICATE:' + (sf.filename || stagedFile.getName()));
            continue;
          }
          dayFolder.addFile(stagedFile);
          var parentIt2 = stagedFile.getParents();
          while (parentIt2.hasNext()) {
            var p2 = parentIt2.next();
            if (p2.getId() !== dayFolder.getId()) {
              p2.removeFile(stagedFile);
            }
          }
          savedFilenames.push(stagedFile.getName());
          if (stagedHash) recordFileHash_(stagedHash, project, timestampIso, reportId);
        } catch (eSf) {}
      }
    } else if (stagedIds && stagedIds.length) {
      var moved = moveStagedFilesTo_(stagedIds, dayFolder);
      savedFilenames = savedFilenames.concat(moved);
    }

    appendSummaryRow_({
      project: project,
      timestamp: timestampIso,
      notes: notes,
      manpower: manpower,
      safetyFlags: safetyFlags,
      files: savedFilenames.join(', '),
      reportId: reportId,
      email: email,
      acumaticaJobId: acJobId,
      acumaticaJobNumber: acJobNumber,
      acumaticaJobName: acJobName,
      location: location,
      narrative: narrative,
      summaryText: summaryText,
      fieldTech: fieldTech,
      crewHours: crewHours,
      crewRate: crewRate,
      crewCost: crewCost,
      lookaheadRequests: lookaheadRequests
    });

    // Placeholder: enqueue AI summary (to be implemented)
    // TODO: AI integration for summarization, risk flags, materials
    maybeNotifyTeams_({
      project: project,
      timestamp: timestampIso,
      manpower: manpower,
      safetyFlags: safetyFlags,
      acumaticaJobNumber: acJobNumber,
      acumaticaJobName: acJobName,
      email: email
    });

    // Record schedule progress if provided
    if (task && (qtyCompleted || pctToday)) {
      appendProgressRow_({
        reportId: reportId,
        timestamp: timestampIso,
        project: project,
        taskId: task.id || '',
        taskCode: task.code || '',
        taskName: task.name || '',
        budgetedQty: task.budgetedQty || '',
        qtyCompleted: qtyCompleted,
        pctToday: pctToday,
        email: email
      });
    }

    sendProjectManagerEmail_({
      project: project,
      timestamp: timestampIso,
      manpower: manpower,
      safetyFlags: safetyFlags,
      narrative: narrative,
      summaryText: summaryText,
      notes: notes,
      task: task,
      qtyCompleted: qtyCompleted,
      pctToday: pctToday,
      folderUrl: dayFolderUrl,
      submittedBy: email,
      acumaticaJobNumber: acJobNumber,
      acumaticaJobName: acJobName,
      fieldTech: fieldTech,
      crewHours: crewHours,
      crewRate: crewRate,
      crewCost: crewCost,
      lookaheadRequests: lookaheadRequests
    });

    return createCorsResponse_({ ok: true });
  } catch (err) {
    return createCorsResponse_({ ok: false, error: String(err) }, 500);
  }
}

// -------- File hash registry (duplicate prevention) --------
function getFileHashesSheet_() {
  return getOrCreateSheet_('KSE_File_Hashes');
}

function isFileHashRecorded_(hash) {
  if (!hash) return false;
  var s = getFileHashesSheet_();
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return false;
  var header = v[0];
  var idx = header.indexOf('Hash');
  if (idx === -1) return false;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][idx]) === String(hash)) return true;
  }
  return false;
}

function recordFileHash_(hash, project, timestampIso, reportId) {
  var s = getFileHashesSheet_();
  if (s.getLastRow() === 0) s.appendRow(['Hash','Project','Timestamp','ReportId']);
  s.appendRow([hash, project, timestampIso, reportId || '']);
}

function createCorsResponse_(payload, code) {
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
  var it = DriveApp.getFoldersByName('KSE Field Reports Incoming');
  return it.hasNext() ? it.next() : DriveApp.createFolder('KSE Field Reports Incoming');
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
    var meta = dataUrl.substring(5, comma); // e.g. image/png;base64
    var base64 = dataUrl.substring(comma + 1);
    var mime = meta.split(';')[0] || fallbackType || 'application/octet-stream';
    return { mimeType: mime, base64: base64 };
  }
  // Assume `dataUrl` is raw base64 without prefix
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

function ensureSummaryHeader_(sheet) {
  var expected = ['Timestamp', 'Project', 'Manpower', 'Safety Issues', 'Notes', 'Files', 'ReportId', 'SubmittedBy', 'AcumaticaJobId', 'AcumaticaJobNumber', 'AcumaticaJobName', 'Lat', 'Lng', 'Accuracy', 'NarrativeWork', 'NarrativeMaterials', 'NarrativeIssues', 'NarrativeLookahead', 'SummaryText', 'FieldTech', 'CrewHours', 'CrewRate', 'CrewCost', 'LookaheadRequests'];
  if (sheet.getMaxColumns() < expected.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), expected.length - sheet.getMaxColumns());
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(expected);
    return expected;
  }
  var current = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  var needsUpdate = false;
  for (var i = 0; i < expected.length; i++) {
    if (current[i] !== expected[i]) {
      needsUpdate = true;
      break;
    }
  }
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
  }
  return expected;
}

function appendSummaryRow_(entry) {
  var sheet = getOrCreateSheet_(SUMMARY_SHEET_NAME);
  ensureSummaryHeader_(sheet);
  sheet.appendRow([
    entry.timestamp,
    entry.project,
    entry.manpower,
    entry.safetyFlags ? 'Yes' : 'No',
    entry.notes,
    entry.files,
    entry.reportId || '',
    entry.email || '',
    entry.acumaticaJobId || '',
    entry.acumaticaJobNumber || '',
    entry.acumaticaJobName || '',
    entry.location && entry.location.lat ? entry.location.lat : '',
    entry.location && entry.location.lng ? entry.location.lng : '',
    entry.location && entry.location.accuracy ? entry.location.accuracy : '',
    entry.narrative && entry.narrative.workCompleted ? entry.narrative.workCompleted : '',
    entry.narrative && entry.narrative.materialsInstalled ? entry.narrative.materialsInstalled : '',
    entry.narrative && entry.narrative.issuesRisks ? entry.narrative.issuesRisks : '',
    entry.narrative && entry.narrative.lookahead ? entry.narrative.lookahead : '',
    entry.summaryText || '',
    entry.fieldTech || '',
    entry.crewHours || '',
    entry.crewRate || '',
    entry.crewCost || '',
    entry.lookaheadRequests && entry.lookaheadRequests.length ? entry.lookaheadRequests.join(' | ') : ''
  ]);
}

function getProjectManagerEmail_(project) {
  if (!project) return '';
  var sheet = getOrCreateSheet_(PROJECT_PM_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Project', 'ManagerEmail']);
    return '';
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(project).trim()) {
      return String(data[i][1] || '').trim();
    }
  }
  return '';
}

function buildSummaryTextFromEntry_(entry) {
  var parts = [];
  if (entry.narrative) {
    if (entry.narrative.workCompleted) parts.push('Work completed: ' + entry.narrative.workCompleted);
    if (entry.narrative.materialsInstalled) parts.push('Materials/gear: ' + entry.narrative.materialsInstalled);
    if (entry.narrative.issuesRisks) parts.push('Issues/Risks: ' + entry.narrative.issuesRisks);
    if (entry.narrative.lookahead) parts.push('Look-ahead / requests: ' + entry.narrative.lookahead);
  }
  if (entry.notes && entry.notes.trim()) {
    parts.push('Notes: ' + entry.notes);
  }
  if (!parts.length) {
    parts.push('No additional narrative captured.');
  }
  return parts.join('\n');
}

function sendProjectManagerEmail_(entry) {
  var pmEmail = getProjectManagerEmail_(entry.project);
  if (!pmEmail) return;
  var tz = Session.getScriptTimeZone();
  var stamp = Utilities.formatDate(new Date(entry.timestamp), tz, 'MMM d, yyyy HH:mm');
  var summary = entry.summaryText && entry.summaryText.trim() ? entry.summaryText : buildSummaryTextFromEntry_(entry);
  var spi = computeProjectSpiSnapshot_(entry.project);
  var lines = [];
  lines.push('Project: ' + entry.project);
  lines.push('Submitted: ' + stamp + ' by ' + (entry.submittedBy || 'Unknown'));
  lines.push('Manpower: ' + entry.manpower + ' • Safety: ' + (entry.safetyFlags ? 'Issue noted' : 'Clear'));
  if (entry.fieldTech) {
    lines.push('Field tech on report: ' + entry.fieldTech);
  }
  if (entry.crewHours || entry.crewCost) {
    var totalHours = (Number(entry.manpower || 0) || 0) * (Number(entry.crewHours || 0) || 0);
    var crewCostLine = 'Crew: ' + (entry.manpower || 0) + ' ppl × ' + (entry.crewHours || 0) + ' hrs';
    if (totalHours) crewCostLine += ' (' + totalHours + ' total hrs)';
    if (entry.crewRate) crewCostLine += ' @ $' + entry.crewRate + '/hr';
    if (entry.crewCost) crewCostLine += ' • est labor $' + Math.round(entry.crewCost);
    lines.push(crewCostLine);
  }
  if (entry.acumaticaJobNumber) {
    lines.push('Job: ' + entry.acumaticaJobNumber + (entry.acumaticaJobName ? ' — ' + entry.acumaticaJobName : ''));
  }
  if (entry.task && (entry.task.code || entry.task.name)) {
    lines.push('Task: ' + (entry.task.code ? entry.task.code + ' — ' : '') + (entry.task.name || ''));
  }
  if (entry.qtyCompleted || entry.pctToday) {
    lines.push('Progress: ' + (entry.qtyCompleted || 0) + ' units • ' + (entry.pctToday || 0) + '% reported today');
  }
  if (spi) {
    lines.push(
      'SPI Snapshot: ' +
        (spi.spi != null ? spi.spi.toFixed(2) : 'n/a') +
        ' (Planned ' +
        Math.round(spi.plannedPct * 100) +
        '% • Actual ' +
        Math.round(spi.actualPct * 100) +
        '%)'
    );
  }
  lines.push('');
  lines.push(summary);
  lines.push('');
  if (entry.lookaheadRequests && entry.lookaheadRequests.length) {
    lines.push('Requests flagged:');
    entry.lookaheadRequests.forEach(function(req) {
      lines.push(' - ' + req);
    });
    lines.push('');
  }
  if (entry.folderUrl) {
    lines.push('Report folder: ' + entry.folderUrl);
  }
  MailApp.sendEmail(pmEmail, '[Field Report] ' + entry.project + ' — ' + stamp, lines.join('\n'));
}

function computeProjectSpiSnapshot_(project) {
  if (!project) return null;
  var schedule = getOrCreateSheet_('Project_Schedule').getDataRange().getValues();
  if (schedule.length <= 1) return null;
  var header = schedule[0];
  var idxProj = header.indexOf('Project');
  var idxId = header.indexOf('TaskId');
  var idxStart = header.indexOf('Start');
  var idxEnd = header.indexOf('End');
  if (idxProj === -1 || idxId === -1) return null;
  var tasks = [];
  for (var i = 1; i < schedule.length; i++) {
    var row = schedule[i];
    if (String(row[idxProj]) !== String(project)) continue;
    var start = row[idxStart] ? new Date(row[idxStart]) : null;
    var end = row[idxEnd] ? new Date(row[idxEnd]) : null;
    tasks.push({ id: String(row[idxId] || ''), start: start, end: end });
  }
  if (!tasks.length) return null;
  var today = new Date();
  var plannedSum = 0;
  tasks.forEach(function(task) {
    if (!task.start || !task.end) {
      plannedSum += 0;
      return;
    }
    var total = Math.max(1, Math.round((task.end - task.start) / (24 * 60 * 60 * 1000)) + 1);
    var elapsed = Math.max(0, Math.min(total, Math.round((today - task.start) / (24 * 60 * 60 * 1000)) + 1));
    var planned = 0;
    if (today < task.start) planned = 0;
    else if (today > task.end) planned = 1;
    else planned = elapsed / total;
    plannedSum += planned;
  });
  var plannedAvg = plannedSum / tasks.length;
  var progress = getOrCreateSheet_('Schedule_Progress').getDataRange().getValues();
  var actualPctByTask = {};
  if (progress.length > 1) {
    var h = progress[0];
    var idxTask = h.indexOf('TaskId');
    var idxPct = h.indexOf('PctToday');
    var idxQty = h.indexOf('QtyCompleted');
    var idxBudget = h.indexOf('BudgetedQty');
    var idxTs = h.indexOf('Timestamp');
    for (var r = 1; r < progress.length; r++) {
      var prow = progress[r];
      if (String(prow[idxTask]) === '') continue;
      var when = idxTs >= 0 ? new Date(prow[idxTs]) : null;
      if (when && when > today) continue;
      var tid = String(prow[idxTask]);
      var pctRow = idxPct >= 0 ? Number(prow[idxPct] || 0) / 100 : 0;
      var qtyRow = idxQty >= 0 ? Number(prow[idxQty] || 0) : 0;
      var budgetRow = idxBudget >= 0 ? Number(prow[idxBudget] || 0) : 0;
      var inc = pctRow || (budgetRow ? qtyRow / budgetRow : 0);
      actualPctByTask[tid] = Math.min(1, (actualPctByTask[tid] || 0) + inc);
    }
  }
  var actualSum = 0;
  tasks.forEach(function(task) {
    actualSum += actualPctByTask[task.id] || 0;
  });
  var actualAvg = Math.min(1, actualSum / tasks.length);
  var variance = actualAvg - plannedAvg;
  var spi = plannedAvg > 0 ? actualAvg / plannedAvg : (actualAvg >= 0 ? 1 : 0);
  return {
    plannedPct: plannedAvg,
    actualPct: actualAvg,
    variancePct: variance,
    spi: spi
  };
}

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('KSE Field Reports Data');
  }
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

// -------- Schedule: tasks listing and progress logging --------
function listProjectTasks_(projectName) {
  var s = getOrCreateSheet_('Project_Schedule');
  var v = s.getDataRange().getValues();
  if (v.length <= 1) return [];
  var header = v[0];
  var idxProject = header.indexOf('Project');
  var idxId = header.indexOf('TaskId');
  var idxCode = header.indexOf('Code');
  var idxName = header.indexOf('TaskName');
  var idxBudget = header.indexOf('BudgetedQty');
  var out = [];
  for (var i = 1; i < v.length; i++) {
    var row = v[i];
    if (projectName && String(row[idxProject]) !== projectName) continue;
    out.push({
      id: String(row[idxId] || ''),
      code: String(row[idxCode] || ''),
      name: String(row[idxName] || ''),
      budgetedQty: Number(row[idxBudget] || 0)
    });
  }
  return out;
}

function appendProgressRow_(p) {
  var s = getOrCreateSheet_('Schedule_Progress');
  if (s.getLastRow() === 0) {
    s.appendRow(['ReportId','Timestamp','Project','TaskId','TaskCode','TaskName','BudgetedQty','QtyCompleted','PctToday','User']);
  }
  s.appendRow([p.reportId, p.timestamp, p.project, p.taskId, p.taskCode, p.taskName, p.budgetedQty, p.qtyCompleted, p.pctToday, p.email]);
}

function computeDailyScheduleHealth_() {
  var tz = Session.getScriptTimeZone();
  var today = new Date();
  var dateStr = Utilities.formatDate(today, tz, 'yyyy-MM-dd');

  var schedule = getOrCreateSheet_('Project_Schedule').getDataRange().getValues();
  var progress = getOrCreateSheet_('Schedule_Progress').getDataRange().getValues();
  if (schedule.length <= 1) return;

  var hS = schedule[0];
  var idxProj = hS.indexOf('Project');
  var idxId = hS.indexOf('TaskId');
  var idxStart = hS.indexOf('Start');
  var idxEnd = hS.indexOf('End');
  var idxBudget = hS.indexOf('BudgetedQty');

  var plannedPctByTask = {};
  for (var i = 1; i < schedule.length; i++) {
    var row = schedule[i];
    var id = String(row[idxId] || '');
    var start = new Date(row[idxStart]);
    var end = new Date(row[idxEnd]);
    var total = Math.max(1, Math.round((end - start) / (24*60*60*1000)) + 1);
    var elapsed = Math.max(0, Math.min(total, Math.round((today - start) / (24*60*60*1000)) + 1));
    var planned = 0;
    if (today < start) planned = 0; else if (today > end) planned = 1; else planned = elapsed / total;
    plannedPctByTask[id] = planned;
  }

  var hP = progress[0];
  var pIdxTaskId = hP.indexOf('TaskId');
  var pIdxPct = hP.indexOf('PctToday');
  var pIdxQty = hP.indexOf('QtyCompleted');
  var pIdxBudgeted = hP.indexOf('BudgetedQty');
  var pIdxTs = hP.indexOf('Timestamp');

  var actualPctByTask = {};
  for (var j = 1; j < progress.length; j++) {
    var prow = progress[j];
    var d = new Date(prow[pIdxTs]);
    if (d > today) continue; // only cumulative up to today
    var tid = String(prow[pIdxTaskId] || '');
    var pct = Number(prow[pIdxPct] || 0) / 100;
    var qty = Number(prow[pIdxQty] || 0);
    var budget = Number(prow[pIdxBudgeted] || 0);
    var inc = pct || (budget ? (qty / budget) : 0);
    actualPctByTask[tid] = Math.min(1, (actualPctByTask[tid] || 0) + inc);
  }

  // Aggregate by project
  var projectSet = {};
  for (var i2 = 1; i2 < schedule.length; i2++) projectSet[schedule[i2][idxProj]] = 1;
  var projects = Object.keys(projectSet);

  var outSheet = getOrCreateSheet_('Schedule_Health');
  outSheet.clear();
  outSheet.appendRow(['Date','Project','Planned %','Actual %','Variance %','SPI']);
  projects.forEach(function(proj) {
    var taskRows = schedule.filter(function(r, idx) { return idx > 0 && String(r[idxProj]) === proj; });
    if (!taskRows.length) return;
    var plannedSum = 0, actualSum = 0;
    taskRows.forEach(function(r) {
      var id = String(r[idxId] || '');
      plannedSum += (plannedPctByTask[id] || 0);
      actualSum += (actualPctByTask[id] || 0);
    });
    var plannedAvg = plannedSum / taskRows.length;
    var actualAvg = Math.min(1, actualSum / taskRows.length);
    var variance = (actualAvg - plannedAvg);
    var spi = plannedAvg > 0 ? (actualAvg / plannedAvg) : (actualAvg >= 0 ? 1 : 0);
    outSheet.appendRow([dateStr, proj, plannedAvg, actualAvg, variance, spi]);
  });

  // Teams alerts for lagging or leading
  var props = PropertiesService.getScriptProperties();
  var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
  if (webhook) {
    var values = outSheet.getDataRange().getValues();
    if (values.length > 1) {
      var lines = [];
      for (var r = 1; r < values.length; r++) {
        var row = values[r];
        var proj = row[1], spi = Number(row[5]);
        if (spi < 0.95) lines.push('- ' + proj + ' is behind (SPI ' + spi.toFixed(2) + ')');
        if (spi > 1.05) lines.push('- ' + proj + ' is ahead (SPI ' + spi.toFixed(2) + ')');
      }
      if (lines.length) {
        postTeamsCard_(webhook, 'Schedule Health Alerts', lines.join('\n'));
      }
    }
  }
}

function installScheduleHealthTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'computeDailyScheduleHealth_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('computeDailyScheduleHealth_')
    .timeBased()
    .atHour(6)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

// -------- RBAC & Token Verification --------
function verifyIdToken_(idToken) {
  try {
    var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    var info = JSON.parse(res.getContentText());
    var audOk = (info.aud === GOOGLE_CLIENT_ID);
    var verified = info.email_verified === 'true' || info.email_verified === true;
    return {
      email: info.email,
      audOk: audOk,
      verified: verified,
      iss: info.iss
    };
  } catch (e) {
    return null;
  }
}

function isEmailAllowed_(email) {
  if (!email) return false;
  var domain = String(email).split('@')[1] || '';
  if (ALLOWED_DOMAINS.indexOf(domain) === -1) return false;
  // Optional: enforce roles via KSE_Users sheet
  var role = getUserRole_(email);
  return !!role; // any role grants access; refine as needed
}

function getUserRole_(email) {
  var sheet = getOrCreateSheet_(USERS_SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  if (data.length === 0) {
    sheet.appendRow(['email','role']); // header
    return null;
  }
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(email).toLowerCase()) {
      return data[i][1] || null;
    }
  }
  return null;
}

function isReportRecorded_(reportId) {
  if (!reportId) return false;
  var sheet = getOrCreateSheet_(SUMMARY_SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return false;
  var header = data[0];
  var idx = header.indexOf('ReportId');
  if (idx === -1) return false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idx]) === String(reportId)) return true;
  }
  return false;
}

// -------- Acumatica integration (stubbed if not configured) --------
function fetchAcumaticaJobs_() {
  var props = PropertiesService.getScriptProperties();
  var base = props.getProperty('ACU_BASE_URL');
  var token = props.getProperty('ACU_TOKEN');
  var tenant = props.getProperty('ACU_TENANT');
  // If not configured, return demo data
  if (!base) {
    return [
      { id: 'JOB-1001', number: 'JOB-1001', name: 'Substation Upgrade - North', status: 'Open' },
      { id: 'JOB-1002', number: 'JOB-1002', name: 'Solar Farm Interconnect', status: 'Open' },
      { id: 'JOB-1003', number: 'JOB-1003', name: 'Data Center Fit-Out', status: 'Planning' }
    ];
  }
  try {
    var url = base.replace(/\/+$/, '') + '/entity/Default/20.200.001/Project?$select=ProjectID,Description,Status&$top=200';
    var headers = { Accept: 'application/json' };
    if (tenant) headers['Tenant'] = tenant;
    var options = { method: 'get', muteHttpExceptions: true, headers: headers };
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    var res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() !== 200) {
      // Fallback to empty list on error
      return [];
    }
    var json = JSON.parse(res.getContentText());
    var items = Array.isArray(json) ? json : (json.value || []);
    return items.map(function(it) {
      var id = it.ProjectID && it.ProjectID.value ? it.ProjectID.value : (it.ProjectID || '');
      var name = it.Description && it.Description.value ? it.Description.value : (it.Description || '');
      var status = it.Status && it.Status.value ? it.Status.value : (it.Status || '');
      return { id: String(id), number: String(id), name: String(name), status: String(status) };
    });
  } catch (e) {
    return [];
  }
}

// -------- Microsoft Teams notifications --------
function maybeNotifyTeams_(entry) {
  var props = PropertiesService.getScriptProperties();
  var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
  if (!webhook) return;
  var title = 'New Field Report Submitted';
  var text = ''
    + '**Project:** ' + entry.project + '\n'
    + (entry.acumaticaJobNumber ? ('**Job:** ' + entry.acumaticaJobNumber + ' — ' + (entry.acumaticaJobName || '') + '\n') : '')
    + '**Submitted by:** ' + (entry.email || 'Unknown') + '\n'
    + '**Manpower:** ' + entry.manpower + '\n'
    + '**Safety Issues:** ' + (entry.safetyFlags ? 'Yes' : 'No') + '\n'
    + '**Timestamp:** ' + entry.timestamp;
  postTeamsCard_(webhook, title, text);
}

function postTeamsCard_(webhookUrl, title, text) {
  try {
    var payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: title,
      themeColor: '0078D4',
      title: title,
      text: text
    };
    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      muteHttpExceptions: true,
      contentType: 'application/json',
      payload: JSON.stringify(payload)
    });
  } catch (e) {
    // swallow
  }
}

// -------- Daily PDF report packet --------
function generateDailyReportPdfs_() {
  var props = PropertiesService.getScriptProperties();
  var tz = Session.getScriptTimeZone();
  var dateStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var pdfRoot = getOrCreateSubFolder_(getOrCreateRootFolder_(), 'Daily PDFs');
  var dayFolder = getOrCreateSubFolder_(pdfRoot, dateStr);

  var sheet = getOrCreateSheet_(SUMMARY_SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var header = data[0];
  var idxTs = header.indexOf('Timestamp');
  var idxProject = header.indexOf('Project');
  var idxNotes = header.indexOf('Notes');
  var idxFiles = header.indexOf('Files');
  var idxMan = header.indexOf('Manpower');
  var idxSafety = header.indexOf('Safety Issues');
  var idxEmail = header.indexOf('SubmittedBy');
  var idxLat = header.indexOf('Lat');
  var idxLng = header.indexOf('Lng');

  // group by project for today
  var groups = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = new Date(row[idxTs]);
    var rowDate = Utilities.formatDate(new Date(ts), tz, 'yyyy-MM-dd');
    if (rowDate !== dateStr) continue;
    var project = row[idxProject];
    groups[project] = groups[project] || [];
    groups[project].push(row);
  }
  Object.keys(groups).forEach(function(project) {
    var doc = DocumentApp.create('Daily Report - ' + project + ' - ' + dateStr);
    var body = doc.getBody();
    body.appendParagraph('Kansas Electric - Daily Report').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph(project).setHeading(DocumentApp.ParagraphHeading.HEADING2);
    groups[project].forEach(function(row) {
      var ts = Utilities.formatDate(new Date(row[idxTs]), tz, 'HH:mm');
      var man = row[idxMan];
      var safety = row[idxSafety];
      var notes = row[idxNotes] || '';
      var files = row[idxFiles] || '';
      var email = row[idxEmail] || '';
      var lat = (idxLat >= 0) ? row[idxLat] : '';
      var lng = (idxLng >= 0) ? row[idxLng] : '';
      body.appendParagraph('Time: ' + ts + ' • By: ' + email);
      body.appendParagraph('Manpower: ' + man + ' • Safety Issues: ' + safety);
      if (lat && lng) body.appendParagraph('Location: ' + lat + ', ' + lng);
      body.appendParagraph('Notes: ' + notes);
      if (files) body.appendParagraph('Files: ' + files);
      body.appendHorizontalRule();
    });
    doc.saveAndClose();
    var blob = DriveApp.getFileById(doc.getId()).getAs('application/pdf');
    var pdf = dayFolder.createFile(blob).setName(doc.getName() + '.pdf');
    // Optional: delete temp doc
    DriveApp.getFileById(doc.getId()).setTrashed(true);
  });
}

function installDailyTrigger() {
  // Remove existing triggers for idempotency
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'generateDailyReportPdfs_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  var props = PropertiesService.getScriptProperties();
  var hour = Number(props.getProperty('DAILY_REPORT_HOUR') || 18);
  ScriptApp.newTrigger('generateDailyReportPdfs_')
    .timeBased()
    .atHour(hour)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

// -------- Weekly digest (7-day summary) --------
function weeklyFieldReportsDigest_() {
  var props = PropertiesService.getScriptProperties();
  var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
  if (!webhook) return;
  var tz = Session.getScriptTimeZone();
  var sheet = getOrCreateSheet_(SUMMARY_SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var header = data[0];
  var idxTs = header.indexOf('Timestamp');
  var idxProject = header.indexOf('Project');
  var idxMan = header.indexOf('Manpower');
  var idxSafety = header.indexOf('Safety Issues');
  var now = new Date();
  var start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var byProject = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var ts = new Date(row[idxTs]);
    if (ts < start || ts > now) continue;
    var proj = row[idxProject];
    byProject[proj] = byProject[proj] || { reports: 0, manpower: 0, safety: 0 };
    byProject[proj].reports += 1;
    byProject[proj].manpower += Number(row[idxMan] || 0);
    if (String(row[idxSafety]).toLowerCase().indexOf('yes') !== -1) byProject[proj].safety += 1;
  }
  var lines = Object.keys(byProject).sort().map(function(p) {
    var v = byProject[p];
    return '- ' + p + ': ' + v.reports + ' reports, manpower ' + v.manpower + ', safety issues ' + v.safety;
  });
  if (!lines.length) return;
  postTeamsCard_(webhook, 'Weekly Field Reports Summary', lines.join('\n'));
}

function installWeeklyFieldReportsDigestTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'weeklyFieldReportsDigest_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('weeklyFieldReportsDigest_')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}

// -------- Daily alert: projects with no report today --------
function dailyNoReportProjects_() {
  var props = PropertiesService.getScriptProperties();
  var webhook = props.getProperty('TEAMS_WEBHOOK_URL');
  if (!webhook) return;
  var tz = Session.getScriptTimeZone();
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  // Projects expected today: from Project_Schedule rows whose Start <= today <= End
  var sched = getOrCreateSheet_('Project_Schedule').getDataRange().getValues();
  if (sched.length <= 1) return;
  var h = sched[0];
  var idxProj = h.indexOf('Project'), idxStart = h.indexOf('Start'), idxEnd = h.indexOf('End');
  var expected = {};
  for (var i = 1; i < sched.length; i++) {
    var row = sched[i];
    var start = new Date(row[idxStart]), end = new Date(row[idxEnd]);
    var today = new Date(todayStr);
    if (today >= start && today <= end) expected[String(row[idxProj])] = 1;
  }
  var expList = Object.keys(expected);
  if (!expList.length) return;
  // Projects reported today from KSE_Field_Reports
  var fr = getOrCreateSheet_(SUMMARY_SHEET_NAME).getDataRange().getValues();
  var idxTs = fr[0].indexOf('Timestamp'), idxProject = fr[0].indexOf('Project');
  var reported = {};
  for (var j = 1; j < fr.length; j++) {
    var ts = new Date(fr[j][idxTs]);
    var dateStr = Utilities.formatDate(ts, tz, 'yyyy-MM-dd');
    if (dateStr === todayStr) reported[String(fr[j][idxProject])] = 1;
  }
  var missing = expList.filter(function(p){ return !reported[p]; });
  if (!missing.length) return;
  postTeamsCard_(webhook, 'No Field Report Today', missing.map(function(p){ return '- ' + p; }).join('\n'));
}

function installDailyNoReportTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === 'dailyNoReportProjects_') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('dailyNoReportProjects_')
    .timeBased()
    .atHour(17)
    .everyDays(1)
    .inTimezone(Session.getScriptTimeZone())
    .create();
}


