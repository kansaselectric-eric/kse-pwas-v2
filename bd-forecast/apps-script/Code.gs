/**
 * BD Forecast (Apps Script)
 * - Maps stages to weighted probabilities
 * - Calculates next 90-day forecast
 * - Groups by division + stage
 * - Writes to 'Forecast' sheet
 * Assumes an 'Opportunities' sheet with: Division, Name, Stage, Value, CloseDate
 */

var STAGE_WEIGHTS = {
  'Lead': 0.1,
  'Prospect': 0.3,
  'Qualified': 0.5,
  'Proposed': 0.7,
  'Verbal': 0.85,
  'Won': 1.0,
  'Lost': 0.0
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KSE Tools')
    .addItem('Update Forecast', 'updateForecast')
    .addToUi();
}

function updateForecast() {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('KSE BD Forecast');
  var src = ss.getSheetByName('Opportunities');
  if (!src) {
    src = ss.insertSheet('Opportunities');
    src.getRange(1, 1, 1, 5).setValues([['Division','Name','Stage','Value','CloseDate']]).setFontWeight('bold');
  }
  var out = ss.getSheetByName('Forecast') || ss.insertSheet('Forecast');
  out.clear();

  var values = src.getDataRange().getValues();
  if (values.length <= 1) {
    out.getRange(1, 1).setValue('No data in Opportunities.');
    return;
  }

  var header = values[0];
  var idxDivision = header.indexOf('Division');
  var idxStage = header.indexOf('Stage');
  var idxValue = header.indexOf('Value');
  var idxClose = header.indexOf('CloseDate');

  var now = new Date();
  var horizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  var groups = {}; // { division: { stage: { count, sumValue, sumWeighted } } }
  var totalWeighted = 0;

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var division = String(row[idxDivision] || 'General');
    var stage = String(row[idxStage] || 'Lead');
    var value = Number(row[idxValue] || 0);
    var close = new Date(row[idxClose]);
    if (!(close instanceof Date) || isNaN(close.getTime())) continue;
    if (close > horizon || close < now) continue;
    var weight = STAGE_WEIGHTS[stage] == null ? 0.0 : STAGE_WEIGHTS[stage];
    var weighted = value * weight;
    totalWeighted += weighted;
    groups[division] = groups[division] || {};
    groups[division][stage] = groups[division][stage] || { count: 0, sumValue: 0, sumWeighted: 0 };
    groups[division][stage].count += 1;
    groups[division][stage].sumValue += value;
    groups[division][stage].sumWeighted += weighted;
  }

  var rows = [
    ['Division','Stage','Count','Sum Value','Weighted Sum (90d)','Period','Updated At'],
  ];
  Object.keys(groups).sort().forEach(function(div) {
    Object.keys(groups[div]).sort().forEach(function(stage) {
      var g = groups[div][stage];
      rows.push([
        div,
        stage,
        g.count,
        g.sumValue,
        g.sumWeighted,
        'Next 90 Days',
        new Date()
      ]);
    });
  });
  rows.push(['TOTAL','','','', totalWeighted, 'Next 90 Days', new Date()]);

  out.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}


