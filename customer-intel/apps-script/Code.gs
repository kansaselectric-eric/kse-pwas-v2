/**
 * Customer Intel (Apps Script)
 * Stub: Creates/updates a 'Customer_Intel' sheet.
 * TODO: Integrate CRM/OSINT sources, scoring, and freshness indicators.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('KSE Tools')
    .addItem('Refresh Customer Intel', 'refreshCustomerIntel')
    .addToUi();
}

function refreshCustomerIntel() {
  var sheet = getOrCreateSheet_('Customer_Intel');
  sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([['Company','Contact','Email','Notes','Updated At']]).setFontWeight('bold');
  var now = new Date();
  var rows = [
    ['SunBright Energy','Jane Doe','jane@sunbright.com','Renewables EPC contact','' + now],
    ['City Utilities','Mark West','mwest@cityutilities.gov','Substation upgrades','' + now]
  ];
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function getOrCreateSheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.create('KSE Customer Intel');
  var s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  return s;
}


