/**
 * Labor Planner (Apps Script)
 * Stub: Reads 'Labor_Plan' sheet and writes simple capacity summary into 'Labor_Summary'.
 * TODO: Integrate project schedules, skills matrix, availability, overtime policies.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KSE Tools')
    .addItem('Update Labor Summary', 'updateLaborSummary')
    .addToUi();
}

function updateLaborSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('KSE Labor Planner');
  var plan = ss.getSheetByName('Labor_Plan');
  if (!plan) {
    plan = ss.insertSheet('Labor_Plan');
    plan.getRange(1, 1, 1, 4).setValues([['Date','Project','Crew Size','Division']]).setFontWeight('bold');
  }
  var summary = ss.getSheetByName('Labor_Summary');
  if (!summary) summary = ss.insertSheet('Labor_Summary');
  summary.clear();

  var data = plan.getDataRange().getValues();
  if (data.length <= 1) {
    summary.getRange(1, 1).setValue('No data in Labor_Plan.');
    return;
  }

  var header = data[0];
  var idxDate = header.indexOf('Date');
  var idxCrew = header.indexOf('Crew Size');
  var idxDivision = header.indexOf('Division');

  var map = {}; // { date: { division: totalCrew } }
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var date = row[idxDate];
    var crew = Number(row[idxCrew] || 0);
    var div = String(row[idxDivision] || 'General');
    var key = Utilities.formatDate(new Date(date), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    map[key] = map[key] || {};
    map[key][div] = (map[key][div] || 0) + crew;
  }

  var out = [['Date','Division','Total Crew']];
  Object.keys(map).sort().forEach(function(d) {
    Object.keys(map[d]).sort().forEach(function(div) {
      out.push([d, div, map[d][div]]);
    });
  });

  summary.getRange(1, 1, out.length, out[0].length).setValues(out);
}


