/**
 * Apps Script Web App thay thế "Publish to web" cho file Sản lượng.
 * Deploy: mở Extensions > Apps Script trong chính spreadsheet Sản lượng,
 * dán file này, rồi Deploy > New deployment > Web app.
 *   - Execute as: Me
 *   - Who has access: Anyone (hoặc Anyone with the link)
 * Sau khi deploy sẽ có URL dạng:
 *   https://script.google.com/macros/s/XXXXX/exec
 *
 * Gọi CSV của từng tab bằng query ?sheet=<tên tab>, ví dụ:
 *   .../exec?sheet=GiaoHang
 *   .../exec?sheet=KHSX
 */

// Map tên tham số (giữ đúng key cũ trong sanluong.html) -> tên tab thật trong Sheet.
const SHEET_MAP = {
  giaoHang: 'GiaoHang',
  khsx: 'KHSX',
  capacity: 'Capacity',
  forecast: 'Forecast',
  comments: 'Comments',
  config: 'Config',
};

function doGet(e) {
  const key = (e.parameter.sheet || '').trim();
  const sheetName = SHEET_MAP[key] || key; // cho phép gọi thẳng bằng tên tab thật

  if (!sheetName) {
    return ContentService.createTextOutput(
      'Thiếu tham số ?sheet=. Các giá trị hợp lệ: ' + Object.keys(SHEET_MAP).join(', ')
    ).setMimeType(ContentService.MimeType.TEXT);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return ContentService.createTextOutput('Không tìm thấy tab: ' + sheetName)
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const csv = sheetToCsv(sheet);

  return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
}

function sheetToCsv(sheet) {
  const data = sheet.getDataRange().getDisplayValues(); // giữ định dạng hiển thị (ngày, số) giống publish-to-web
  return data
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n');
}

function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
