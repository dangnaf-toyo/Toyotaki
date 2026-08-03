/**
 * TOYOTAKI Dashboard — Comments Write-back Web App
 * ---------------------------------------------------
 * Cho phép dashboard (index.html) LƯU nội dung comment thẳng vào tab "Comments"
 * của Google Sheet này, thay vì chỉ lưu tạm trong trình duyệt.
 *
 * CÀI ĐẶT:
 * 1. Mở Google Sheet dữ liệu dashboard (file bạn đã Publish to web).
 * 2. Vào menu Extensions → Apps Script.
 * 3. Xoá code mẫu (myFunction() rỗng), dán toàn bộ nội dung file này vào.
 * 4. Bấm Deploy → New deployment.
 *    - Loại chọn: Web app
 *    - Description: tuỳ ý, ví dụ "Dashboard comments API"
 *    - Execute as: Me (tài khoản của bạn)
 *    - Who has access: Anyone
 *    → Bấm Deploy.
 * 5. Lần đầu sẽ hiện màn hình xin cấp quyền (Authorize access) — chọn tài khoản
 *    Google của bạn, bấm "Advanced" → "Go to ... (unsafe)" → Allow.
 *    (Đây là cảnh báo mặc định của Google cho script tự viết, không phải lỗi.)
 * 6. Sau khi Deploy xong, copy đường link dạng:
 *    https://script.google.com/macros/s/XXXXXXXXXXXXXXXXXXXX/exec
 * 7. Gửi link đó lại cho Claude để dán vào file index.html (biến APPS_SCRIPT_URL).
 *
 * LƯU Ý KHI SỬA SHEET SAU NÀY:
 * Nếu bạn sửa lại code này và Deploy lại, phải chọn "New deployment" (không phải
 * "Manage deployments" sửa bản cũ) NẾU muốn giữ nguyên link cũ thì dùng
 * "Manage deployments" → biểu tượng bút chì → chọn version mới → Deploy.
 */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var key = (body.key || '').toString().trim();
    var noiDung = (body.noiDung || '').toString();
    if (!key) throw new Error('Thiếu "key"');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Comments');
    if (!sheet) throw new Error('Không tìm thấy tab "Comments" trong Sheet này');

    var data = sheet.getDataRange().getValues();
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === key) { rowIndex = i + 1; break; }
    }

    if (rowIndex === -1) {
      sheet.appendRow([key, noiDung]);
    } else {
      sheet.getRange(rowIndex, 2).setValue(noiDung);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, key: key }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, message: 'TOYOTAKI Dashboard Comments API đang hoạt động.' }))
    .setMimeType(ContentService.MimeType.JSON);
}