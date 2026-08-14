# Kế hoạch chuyển đổi hạ tầng dữ liệu TOYOTAKI — Từ Google Sheet sang Database chuyên nghiệp

> Tài liệu này lập kế hoạch chi tiết để chuyển toàn bộ hệ thống MES nội bộ (đang dùng Google Sheet làm database) sang một database thật (PostgreSQL qua Supabase), giữ nguyên các dashboard/công cụ hiện có, giảm thiểu gián đoạn vận hành.

---

## 1. Hiện trạng hệ thống

| Hệ thống | Frontend | Nguồn dữ liệu hiện tại | Ghi dữ liệu |
|---|---|---|---|
| Dashboard Sản lượng & Giao hàng | `sanluong.html` (GitHub Pages) | Google Sheet publish-to-web CSV (6 tab: GiaoHang, KHSX, Capacity, Forecast, Comments, Config) | Apps Script Web App (comment) |
| Dashboard Chất lượng | `chatluong.html` (GitHub Pages) | Google Sheet publish-to-web CSV (13 tab: tongHop, theoKhachHang, theoCongDoan, qcDaily, qcRepaint, targets, comments, config, batThuongThang, batThuongKH, batThuongNB, batThuongChuaTraLoi, ngLan1) | Apps Script Web App (comment) |
| Dashboard Đúc | Apps Script Web App riêng (code: `D:\Project\MES\Dashboard Đúc`) | 3 file Sheet riêng: KHSX Master (dùng chung), Diecast (log phút), DB (9 sheet nghiệp vụ + 2 sheet IPQC) — **đã khảo sát, xem mục 9.1** | Apps Script, ghi trực tiếp |
| IPQC kiểm tra tuần kiểm + QC giám sát | Cùng Apps Script Web App với Dashboard Đúc ở trên, khác route `?view=ipqc` / `?view=qc-manager` (code: `Ipqc.html`, `QcManager.html`, `IpqcCheckpoint.js` trong cùng thư mục `Dashboard Đúc`) | Cùng file DB Đúc, 2 sheet mới `IPQC_Checkpoint`/`IPQC_TieuChuan` — **không phải hệ thống tách rời, xem nhận xét mục 9.1** | Apps Script, ghi trực tiếp + ghi xuyên bảng sang `BanGhi_SuCo`/`Van_De_Khuon` khi NG |
| In tem công đoạn Đúc | Apps Script Web App riêng (code: `D:\Project\MES\Intem QR`) | Sheet `DUC` — nằm **chung file** với Diecast log của Dashboard Đúc — **đã khảo sát, xem mục 9.2** | Apps Script, ghi trực tiếp |
| Đọc QR chuyển công đoạn | Apps Script Web App riêng (code: `D:\Project\MES\Chuyển công đoạn`) | File riêng "Dữ liệu chuyển công đoạn": 2 sheet (`ChuyenCongDoan` log + `ViTriHienTai` state) — **đã khảo sát, xem mục 9.3** | Apps Script, ghi trực tiếp |
| Quản lý tồn kho NVL | Trang riêng `Ton-kho-NVL` (GitHub Pages, code: `D:\Project\MES\Quản lý NVL`) | 1 file Sheet riêng, 6 tab (Tồn Đầu Kỳ, Kế Hoạch, Giao Dịch, Tem NVL, Cài Đặt, Tồn Hiện Tại) + đọc chung KHSX Master — **đã khảo sát, xem mục 9.5** | Apps Script, ghi trực tiếp |

**Vấn đề gặp phải:**
- Google Sheet giới hạn 10 triệu ô/spreadsheet — dữ liệu tích lũy theo ngày (QC daily, log QR chuyển công đoạn) sẽ chạm giới hạn.
- Apps Script có quota thực thi (6 phút/lần chạy, giới hạn số lần gọi/ngày cho tài khoản cá nhân) — dễ nghẽn khi nhiều người dùng cùng lúc.
- Không có kiểm soát truy cập chi tiết (đa số Web App đang set "Anyone can access").
- Không có audit trail (ai sửa, sửa lúc nào) ngoài lịch sử version thô của Sheet.
- Hiệu năng CSV publish-to-web giảm khi sheet lớn (độ trễ cache 5-15 phút, đôi khi lỗi khi Sheet đang được chỉnh sửa).

---

## 2. Kiến trúc đề xuất

```
┌─────────────────────┐        ┌──────────────────────┐        ┌────────────────────┐
│  Dashboards (front)  │ fetch  │   Supabase (backend)  │        │  Nguồn nhập liệu     │
│  sanluong.html        │──────▶│  - PostgreSQL          │◀───────│  - Web form nhập tay │
│  chatluong.html        │       │  - REST API tự sinh    │        │  - QR scan app        │
│  duc.html (mới)         │       │  - Auth (đăng nhập)     │        │  - Máy in tem          │
│  qr-chuyen-congdoan     │       │  - Row Level Security   │        │  - Apps Script (giai   │
│  ton-kho-nvl            │       │  - Realtime (tuỳ chọn)  │        │    đoạn chuyển tiếp)   │
└─────────────────────┘        └──────────────────────┘        └────────────────────┘
        (GitHub Pages, giữ nguyên hosting hiện tại — miễn phí)
```

**Vì sao chọn Supabase (Postgres):**
- Postgres thật: không giới hạn số dòng theo kiểu Sheet, hỗ trợ JOIN nhiều bảng (ví dụ đối chiếu sản lượng ↔ chất lượng ↔ tồn kho theo mã hàng/tháng).
- Tự sinh REST API (PostgREST) — dashboard chỉ cần đổi URL fetch, không cần viết backend riêng.
- Có Auth + Row Level Security — kiểm soát ai xem được, ai sửa được từng bảng.
- Free tier đủ để triển khai thử; gói Pro ~$25/tháng khi vào chạy chính thức (rẻ hơn thuê VPS + tự quản trị Postgres).
- Có thể tự host (self-host Supabase) sau này nếu công ty muốn giữ dữ liệu nội bộ hoàn toàn.

---

## 3. Danh sách việc cần làm — chia theo giai đoạn

### Giai đoạn 0 — Khảo sát & chuẩn bị (làm trước tiên)

- [x] Liệt kê cấu trúc cột của Đúc, In tem, QR chuyển công đoạn — xem mục 9.
- [ ] Liệt kê cấu trúc cột **Tồn kho NVL** (còn thiếu — chưa có code để đọc).
- [ ] Xác định khối lượng dữ liệu hiện tại và tốc độ tăng (bao nhiêu dòng/tháng cho mỗi tab) — để ước lượng thời gian sheet sẽ "đầy".
- [ ] Liệt kê toàn bộ người/bộ phận đang **nhập liệu trực tiếp** vào từng Sheet, và họ nhập bằng cách nào (gõ tay, dán từ Excel, qua Apps Script form...).
- [ ] Xác định ai cần **quyền xem**, ai cần **quyền sửa** cho từng loại dữ liệu (VD: QC chỉ sửa dữ liệu chất lượng, QLSX chỉ sửa sản lượng).
- [ ] Tạo tài khoản Supabase (hoặc nhà cung cấp Postgres khác), chọn region gần Việt Nam (Singapore) để giảm độ trễ.

### Giai đoạn 1 — Thiết kế schema database

- [ ] Thiết kế bảng cho module **Sản lượng & Giao hàng** (map từ 6 tab hiện tại: `giao_hang`, `khsx`, `capacity`, `forecast`, `comments`, `config`).
- [ ] Thiết kế bảng cho module **Chất lượng** (map từ 13 tab: `qc_tong_hop`, `qc_theo_khach_hang`, `qc_theo_cong_doan`, `qc_daily`, `qc_repaint`, `qc_targets`, `qc_comments`, `qc_config`, `bat_thuong_thang`, `bat_thuong_kh`, `bat_thuong_nb`, `bat_thuong_chua_tra_loi`, `ng_lan1`).
- [ ] Thiết kế bảng cho module **Đúc** — map từ 9 bảng liệt kê ở mục 9.1 (`duc_ca_hien_tai`, `duc_su_co_log`, `duc_bao_cao_ca`, `duc_shot_khuon`, `duc_tangca_log`, `duc_van_de_khuon`, `duc_lich_su_san_xuat`), bỏ `Access_Control`/`Audit_Log` (thay bằng Auth + trigger).
- [ ] Thiết kế bảng **In tem** (`duc_tem`, 21 cột — xem mục 9.2), tách hẳn khỏi log Diecast.
- [ ] Thiết kế bảng **log chuyển công đoạn** (`chuyen_cong_doan_log`, 19 cột — xem mục 9.3) — đây là bảng sẽ tăng nhanh nhất, cần đánh index theo `tag_no`, `thoi_gian_chuyen`, `cong_doan_giao`/`cong_doan_nhan`. Bỏ hẳn sheet `ViTriHienTai` — thay bằng 1 VIEW `SELECT DISTINCT ON (tag_no) ...` (chi tiết ở mục 9.3).
- [ ] Thiết kế bảng cho module **Tồn kho NVL** — map từ 6 bảng liệt kê ở mục 9.5 (`nvl_ton_dau_ky`, `nvl_ke_hoach_ngay`, `nvl_giao_dich`, `nvl_tem`, `nvl_cai_dat`, và bỏ `nvl_ton_hien_tai` — thay bằng VIEW cộng dồn). Tạo 1 bảng danh mục `nvl_materials` chung, khắc phục tình trạng 2 nguồn danh mục lệch nhau hiện tại (mục 9.5, nhận xét #2).
- [ ] Thêm khoá ngoại `tag_no` giữa `duc_tem` ↔ `chuyen_cong_doan_log`, và cân nhắc thêm `id_dong` (ca sản xuất) vào `duc_tem` để nối 3 hệ thống Đúc/In tem/Chuyển công đoạn thành 1 chuỗi truy vết — xem mục 9.4.
- [ ] Tạo bảng danh mục `master_materials`/`master_products`/`master_machines`/`master_employees` dùng chung, thay cho việc 4 hệ thống (Đúc, In tem, Chuyển công đoạn, Tồn kho NVL) mỗi hệ thống tự đọc lại cùng 1 file KHSX Master như hiện tại.
- [ ] Chuẩn hoá kiểu dữ liệu: ngày tháng dùng `date`/`timestamp` thay vì text, số liệu dùng `numeric` thay vì text có dấu phẩy/chấm lẫn lộn (đang là nguồn lỗi phổ biến trong code hiện tại — hàm `toNum()` phải tự đoán định dạng số).
- [ ] Thiết lập quan hệ khoá ngoại giữa các bảng (VD: `khsx.ma_hang` tham chiếu bảng danh mục mã hàng dùng chung).
- [ ] Viết migration SQL (file `.sql`) cho toàn bộ schema, lưu trong repo để version control.

### Giai đoạn 2 — Thiết lập Supabase

- [ ] Tạo project Supabase, chạy migration SQL ở Giai đoạn 1.
- [ ] Bật **Row Level Security (RLS)** cho từng bảng, viết policy theo vai trò (`qlsx_read`, `qlsx_write`, `qc_read`, `qc_write`, `admin`...).
- [ ] Thiết lập Auth: tạo tài khoản đăng nhập cho từng nhân viên/bộ phận cần nhập liệu (email/password hoặc Google SSO nếu công ty dùng Google Workspace).
- [ ] Tạo API key riêng cho "chỉ đọc" (dùng cho dashboard public trong mạng nội bộ) và key riêng cho "ghi" (dùng trong app nhập liệu, không public ra frontend tĩnh).
- [ ] Cấu hình backup tự động (Supabase có point-in-time recovery ở gói Pro).

### Giai đoạn 3 — Di chuyển dữ liệu (migration)

- [ ] Viết script (Node.js hoặc Python) đọc CSV publish-to-web hiện tại → import vào bảng Postgres tương ứng.
- [ ] Chạy thử với dữ liệu **Sản lượng** trước (module đơn giản nhất, ít bảng nhất) — đối chiếu số liệu sau import với Sheet gốc để đảm bảo không sai lệch.
- [ ] Lặp lại cho **Chất lượng**, **Đúc**, **Tồn kho NVL**, **log QR chuyển công đoạn**.
- [ ] Giữ Google Sheet gốc ở chế độ **chỉ đọc** làm bản lưu trữ/đối chiếu ít nhất 1-2 tháng sau khi chuyển xong.

### Giai đoạn 4 — Chuyển từng dashboard sang API mới (làm tuần tự, không đồng loạt)

- [ ] **Sản lượng** (`sanluong.html`): đổi `CSV_URLS`/`fetchCSV()` thành gọi Supabase REST API, giữ nguyên toàn bộ phần giao diện/biểu đồ. Test song song với bản Sheet cũ 1 tuần trước khi tắt hẳn CSV cũ.
- [ ] **Chất lượng** (`chatluong.html`): tương tự.
- [ ] **Đúc**: tương tự (có thể cần viết lại nhiều hơn nếu dashboard Đúc hiện tại được build hoàn toàn trong Apps Script HTML Service).
- [ ] **In tem công đoạn Đúc**: đổi nguồn dữ liệu mã hàng/thông số tem sang đọc từ Supabase.
- [ ] **QR chuyển công đoạn**: đổi từ ghi vào Sheet sang ghi thẳng vào bảng log Postgres qua Supabase API (module này nên chuyển sớm vì đây là bảng tăng nhanh nhất, hưởng lợi nhiều nhất từ việc bỏ Sheet).
- [ ] **Tồn kho NVL**: đổi nguồn dữ liệu tương tự.
- [ ] Cập nhật nút điều hướng ở trang chủ `index.html` nếu link truy cập của các dashboard thay đổi domain.

### Giai đoạn 5 — Vận hành & giám sát dài hạn

- [ ] Thiết lập cảnh báo (email/Slack) khi có lỗi API hoặc gần chạm giới hạn gói Supabase.
- [ ] Định kỳ (hàng quý) rà soát dữ liệu cũ — cân nhắc archive dữ liệu >2 năm sang bảng "lịch sử" riêng để bảng chính luôn nhẹ, truy vấn nhanh.
- [ ] Viết tài liệu vận hành nội bộ: cách cấp quyền cho nhân viên mới, cách backup/restore, cách xử lý khi Supabase gặp sự cố (fallback tạm về nhập Sheet nếu cần).
- [ ] Đánh giá lại chi phí sau 3-6 tháng vận hành thật để quyết định giữ Supabase managed hay chuyển sang self-host.

---

## 4. Ưu tiên đề xuất (nếu không thể làm hết cùng lúc)

1. **Sản lượng & Giao hàng** — đang làm thí điểm (xem tiến độ ở mục 10). Đơn giản nhất, dashboard sẵn để đối chiếu số liệu, dùng để kiểm chứng quy trình/công cụ import trước khi áp dụng cho các module phức tạp hơn.
2. **Chất lượng** (`chatluong.html`) — theo sau, tái sử dụng quy trình đã làm ở bước 1.
3. **QR chuyển công đoạn** — bảng log tăng nhanh nhất, rủi ro đầy Sheet sớm nhất trong toàn hệ thống, ưu tiên cao dù không phải module đầu tiên (làm sau khi quy trình đã kiểm chứng qua bước 1-2, vì đây là module ghi trực tiếp — rủi ro cao hơn module chỉ đọc).
4. **Đúc + IPQC (gộp chung 1 khối, xem mục 9.1)** — phức tạp nhất (nhiều hook nghiệp vụ, ghi xuyên bảng, real-time polling 60s) — cần schema ổn định + kinh nghiệm từ các bước trên trước khi làm. Trong khối này, In tem công đoạn Đúc nên đi kèm vì sống chung file Diecast (mục 9.2), và QR chuyển công đoạn nối `tag_no` sang khối này (mục 9.4) nên cân nhắc làm nối tiếp nhau, không cách quãng quá xa.
5. **Tồn kho NVL** — chuyển sau cùng, ít phụ thuộc thời gian nhất trong 4 module hiện trường (không tăng dữ liệu nhanh như QR/IPQC).

---

## 5. Ước tính chi phí (tham khảo, có thể thay đổi theo giá nhà cung cấp)

| Hạng mục | Chi phí ước tính |
|---|---|
| Supabase Free tier (giai đoạn thử nghiệm) | 0đ |
| Supabase Pro (khi vận hành chính thức, 1 project) | ~25 USD/tháng (~620.000đ) |
| GitHub Pages (hosting dashboard tĩnh) | 0đ (đang dùng) |
| Domain riêng (tuỳ chọn, không bắt buộc) | ~200.000-400.000đ/năm |
| Thời gian phát triển (nếu thuê ngoài/nội bộ làm) | Tính theo số ngày công thực tế theo từng module ở Giai đoạn 3-4 |

---

## 6. Rủi ro cần lưu ý

- **Nhân viên quen nhập liệu qua Sheet** — cần đào tạo lại nếu chuyển sang web form nhập liệu mới, hoặc cân nhắc giữ Sheet làm giao diện nhập liệu và dùng Apps Script trigger đồng bộ sang Postgres (giải pháp trung gian, ít xáo trộn hơn nhưng vẫn phụ thuộc một phần vào Sheet).
- **Dữ liệu song song trong giai đoạn chuyển tiếp** — cần quy trình rõ ràng để tránh nhập liệu 2 nơi gây lệch số liệu.
- **Phụ thuộc nhà cung cấp (vendor lock-in)** — giảm thiểu bằng cách dùng Postgres chuẩn (Supabase chỉ là lớp quản lý, có thể export toàn bộ database và tự host bất kỳ lúc nào).

---

## 7. Việc cần làm ngay để bắt đầu

- [ ] Xác nhận ngân sách hàng tháng chấp nhận được cho hạ tầng (ảnh hưởng việc chọn gói Supabase).
- [x] ~~Cung cấp thêm thông tin về 4 hệ thống chưa khảo sát~~ — đã khảo sát xong cả 4: Đúc, In tem, QR chuyển công đoạn, Tồn kho NVL (xem mục 9). Không còn hệ thống nào thiếu thông tin.
- [ ] Quyết định module nào làm thí điểm trước (đề xuất: Sản lượng, vì đã có dashboard chuẩn để đối chiếu).
- [ ] Cân nhắc gộp `Ca_hien_tai` (Đúc) và `khsx`/`giao_hang` (Sản lượng) khi thiết kế schema thật — cả 2 hệ thống đọc chung nhiều dữ liệu Master (mã SP, máy, nhân sự) từ cùng file KHSX (`1WMF1EoGsmKNVaYIQwEe9i9tw6k_dZC1gSbHJp7RNsC0`), nên khi migrate nên dùng chung 1 bảng `master_products`/`master_machines`/`master_employees` thay vì đọc lặp lại như hiện tại. **Lưu ý: Tồn kho NVL cũng đọc chung file KHSX Master này** (mục 9.5) — tổng cộng 4 hệ thống (Đúc, In tem, Chuyển công đoạn, Tồn kho NVL) cùng phụ thuộc 1 file Sheet duy nhất, nên khi file đó lỗi/chậm sẽ ảnh hưởng dây chuyền cả 4 — thêm 1 lý do nên ưu tiên tách Master data ra database thật sớm.
- [ ] Repo `Ton-kho-NVL` trên GitHub hiện đã dọn xong (xoá file `Index.html` trùng tên cũ, xem mục 9.5 note), nhưng phần backend `code.js` (Apps Script) đang chỉ có ở local (`D:\Project\MES\Quản lý NVL`), **chưa từng được commit/push lên GitHub** — cân nhắc bổ sung vào repo để không bị mất nếu máy local có sự cố.

---

## 8. Domain riêng cho công ty (mes.toyotaki.vn) — KẾ HOẠCH, CHƯA TRIỂN KHAI

> **Trạng thái hiện tại:** hệ thống vẫn đang chạy ở link mặc định `https://dangnaf-toyo.github.io/Toyotaki/`. Mục này chỉ là kế hoạch cho tương lai — đã thử thêm file `CNAME` vào repo nhưng đã **gỡ lại** vì DNS phía `toyotaki.vn` chưa được cấu hình nên domain riêng chưa thể dùng được trong thực tế. Khi nào sẵn sàng triển khai thật, làm lại theo đúng các bước dưới đây.

Mục tiêu: thay vì dùng link mặc định `dangnaf-toyo.github.io/Toyotaki`, hệ thống chạy trên domain riêng của công ty để trông chuyên nghiệp và dễ nhớ hơn cho nhân viên.

**Quyết định đã chốt (khi triển khai):** dùng subdomain **`mes.toyotaki.vn`**, không dùng domain gốc `toyotaki.vn` vì domain gốc đang chạy website công ty hiện tại — trỏ domain gốc sang GitHub Pages sẽ ghi đè mất website đó.

**Các bước cần làm khi triển khai thật (chưa làm bước nào):**

- [ ] Thêm lại file `CNAME` ở root repo với nội dung `mes.toyotaki.vn`.
- [ ] Vào trang quản lý DNS của `toyotaki.vn`, thêm bản ghi:
  | Loại | Host/Tên | Giá trị |
  |---|---|---|
  | CNAME | `mes` | `dangnaf-toyo.github.io` |

  (Nếu nhà cung cấp không hỗ trợ CNAME cho subdomain, dùng loại `ALIAS`/`ANAME` trỏ tới cùng giá trị trên.)
- [ ] Vào GitHub repo `Toyotaki` → **Settings → Pages** → xác nhận ô "Custom domain" hiện `mes.toyotaki.vn` → bấm **Save**.
- [ ] Đợi DNS lan truyền (thường 5-30 phút, đôi khi vài giờ) đến khi GitHub hiện dấu ✓ xác nhận domain hợp lệ.
- [ ] Tick chọn **"Enforce HTTPS"** trong Settings → Pages sau khi có dấu ✓, để trang chạy an toàn qua `https://mes.toyotaki.vn`.
- [ ] Thông báo lại địa chỉ mới cho toàn bộ nhân viên đang dùng link cũ; có thể giữ link GitHub Pages cũ chạy song song một thời gian (không xung đột, cả 2 domain đều trỏ về cùng 1 trang).
- [ ] Sau khi domain công ty hoạt động ổn định, cân nhắc đặt thêm subdomain tương tự cho các module khác nếu tách riêng dashboard Đúc/Tồn kho NVL ra domain (ví dụ `duc.toyotaki.vn`, `nvl.toyotaki.vn`) thay vì gộp chung vào trang chủ `mes.toyotaki.vn`.

---

## 9. Chi tiết dữ liệu đã khảo sát (đọc trực tiếp từ code)

> Khảo sát ngày dựa trên code thật tại `D:\Project\MES\Dashboard Đúc`, `D:\Project\MES\Intem QR`, `D:\Project\MES\Chuyển công đoạn`. Lưu ý: bộ tài liệu `01_ARCHITECTURE...md` → `05_V2_ROADMAP.md` trong thư mục Dashboard Đúc mô tả kiến trúc **V1**, nhưng code thật (`Config.js`) đã lên **V3** với nhiều sheet/cột hơn — bảng dưới đây lấy theo `Config.js` (code thật) làm chuẩn.

### 9.1. Dashboard Đúc

**File Google Sheet đang dùng:**

| File | ID | Vai trò |
|---|---|---|
| KHSX Master | `1WMF1EoGsmKNVaYIQwEe9i9tw6k_dZC1gSbHJp7RNsC0` | Master data dùng chung: máy (Q7:Q), SP (C7:D), cavity khuôn (G7:G), cycle time (I7:I), nhân sự (R7:R), trưởng ca (AE7:AE) |
| Diecast | `1mxsjmez6UXvG5O7WjklZ8_l_RmUa2EEczis12On7_4s` | Log sản lượng thực tế theo phút (đọc để tính TT_ca/TT_tuần, poll 60s). **Cũng chính là file chứa sheet `DUC` của hệ thống In tem (mục 9.2)** |
| DB | `1OFuCuaZtprKlgmuNc9Fag_S0ZWBT-S2Hz4Y7R0NQ0D4` | 9 sheet nghiệp vụ, chi tiết bên dưới |

**11 sheet trong file DB → đề xuất bảng Postgres tương ứng** (đã cập nhật 2026-08-12, đọc lại toàn bộ `Config.js` — phát hiện thêm 2 sheet chưa từng ghi trong bản kế hoạch trước: `Shot_May` và `SP_Khong_Phu_Hop`):

| Sheet hiện tại | Số cột | Vai trò | Bảng Postgres đề xuất |
|---|---|---|---|
| `Ca_hien_tai` | 34 | State ca đang chạy (mỗi dòng = 1 máy + 1 SP đang chạy trong ca) | `duc_ca_hien_tai` |
| `BanGhi_SuCo` | 19 | Lịch sử sự cố đã xử lý xong (append-only) | `duc_su_co_log` |
| `BaoCao_Ca` | 24 | Tổng kết mỗi ca (KH/TT, OEE, NG, số sự cố...) | `duc_bao_cao_ca` |
| `Shot_Khuon` | 10 | Shot cộng dồn từng khuôn — cảnh báo bảo dưỡng/thay khuôn | `duc_shot_khuon` |
| `TangCa_Log` | 12 | Audit log các lần tăng ca máy đơn lẻ | `duc_tangca_log` |
| `Van_De_Khuon` | 18 | Vấn đề khuôn nhẹ theo dõi xuyên nhiều ca đến khi đóng | `duc_van_de_khuon` |
| `Lich_Su_SanXuat` | 11 | 1 dòng/(ngày,ca,máy,SP) lưu lại sau kết ca — nguồn cho báo cáo tuần/tháng | `duc_lich_su_san_xuat` |
| `Shot_May` | 3 | 1 dòng/máy — carry số đọc shot counter cuối ca sang "shot đầu ca" của dòng kế tiếp | `duc_shot_may` |
| `SP_Khong_Phu_Hop` | 48 | **Mới phát hiện 2026-08-12** — quy trình đầy đủ xử lý SP không phù hợp: cách ly → lọc → sửa/báo phế → duyệt phế → phân tích nguyên nhân & đối sách (Phát sinh/Lưu xuất × Tạm thời/Lâu dài). Có thể liên kết ngược tới `IPQC_Checkpoint` qua `id_checkpoint_goc`. | `duc_ncp` |
| `Access_Control` | — | Phân quyền (hiện `SECURITY_ENABLED: false` — mọi user coi như Admin) | → thay bằng Supabase Auth + RLS, bỏ hẳn sheet này |
| `Audit_Log` | — | Audit chung | → có thể thay bằng Postgres trigger tự ghi audit, không cần bảng riêng thủ công |

**+ 2 sheet mới (module IPQC/QC giám sát, đã code xong và đang chạy thật qua `?view=ipqc` / `?view=qc-manager`, xem `06_IPQC_DASHBOARD_PLAN.md` + `IpqcCheckpoint.js`) — cùng file DB, cùng Web App, KHÔNG phải hệ thống tách rời:**

| Sheet hiện tại | Số cột | Vai trò | Bảng Postgres đề xuất |
|---|---|---|---|
| `IPQC_Checkpoint` | 20 | Hàng đợi + lịch sử điểm kiểm IPQC (định kỳ 2h / sau sự cố / đổi khuôn), append + update-in-place theo `trang_thai` | `duc_ipqc_checkpoint` |
| `IPQC_TieuChuan` | 5 | Checklist chuẩn + PDF theo mã SP (fallback checklist mặc định nếu SP chưa cấu hình) | `duc_ipqc_tieuchuan` |

**Nhận xét quan trọng — vì sao IPQC phải migrate CÙNG lúc với Đúc, không tách riêng:**
- `requestIpqcCheck_()` được gọi từ 3 hook đặt thẳng trong code nghiệp vụ Đúc (`resolveIncident_`, `upsertPlan_`, `changeProduct_`, `assignPairedPlan_` trong `CaHienTai.js`) — nếu 2 hệ thống nằm 2 database khác nhau trong giai đoạn chuyển tiếp, các hook này sẽ ghi xuyên database (Postgres gọi ngược lại Sheet hoặc ngược lại), rất dễ vỡ.
- Khi IPQC nộp kết quả `NG`, code tự **append thẳng vào `BanGhi_SuCo`** (mở sự cố loại F1) và **`Van_De_Khuon`** (qua `reportMoldIssue_()`) — 2 bảng lõi của Đúc. Đây là ghi xuyên bảng trong cùng 1 transaction nghiệp vụ, nên khi thiết kế Postgres nên gói trong 1 DB transaction thật (Postgres hỗ trợ, Sheet hiện tại không có).
- `_getActiveIdDongSet_()` đọc trực tiếp `Ca_hien_tai` để lọc checkpoint còn hiệu lực — phụ thuộc dữ liệu real-time của Đúc.
- **Kết luận:** khi thiết kế bảng `duc_ipqc_checkpoint`/`duc_ipqc_tieuchuan`, thêm khoá ngoại `id_dong` → `duc_ca_hien_tai.id_dong` và `id_su_co_goc`/`id_van_de_lien_quan` → `duc_su_co_log.id_ban_ghi`/`duc_van_de_khuon.id_van_de`. Đưa "Đúc" (mục 9.1 + IPQC) vào **migrate như 1 khối duy nhất**, không tách IPQC ra module riêng dù giao diện là 2 URL khác nhau.
- Ảnh bằng chứng IPQC hiện lưu trên Google Drive (folder `1n67DSfHEUMA7M0wV7KASwF41arvwc-bV`, đặt tên `ddMMyyyy_HHmm_MaMay_MaSP_KetQua.jpg`) — khi migrate, giữ nguyên lưu trên Drive (chỉ lưu URL trong Postgres ở cột `anh_bang_chung_urls`), không cần chuyển ảnh sang Supabase Storage trừ khi có nhu cầu kiểm soát truy cập chặt hơn.
- Cột `checklist_json` là snapshot JSON (cố ý không tham chiếu động tới `IPQC_TieuChuan`, tránh lệch nếu tiêu chuẩn đổi sau) — trong Postgres nên giữ nguyên là cột `jsonb`, không chuẩn hoá thành bảng con.

**Nhận xét khi thiết kế schema thật:**
- `Ca_hien_tai` là bảng "state" bị xoá dòng sau khi kết ca (dữ liệu chuyển sang `BaoCao_Ca`/`Lich_Su_SanXuat`) — trong Postgres nên giữ nguyên cách này (bảng state riêng + bảng lịch sử riêng), tránh gộp chung vì sẽ làm chậm truy vấn "ca đang chạy" theo thời gian.
- `Diecast` (log theo phút) là bảng tăng nhanh nhất trong hệ Đúc — nên đánh index theo `(ma_may, datetime)` và cân nhắc partition theo tháng ngay từ đầu.
- Nhiều cột đang là formula trong Sheet (`ty_le_hoan_thanh`, `trang_thai`, `thoi_gian_dung_phut`) — khi chuyển sang Postgres nên tính bằng `GENERATED ALWAYS AS` hoặc tính ở tầng API, không lưu cứng để tránh lệch dữ liệu.
- Code hiện dùng `LockService` (khoá ghi cấp file) để tránh race — Postgres có transaction/row lock chuẩn hơn nhiều, đây là một trong những lợi ích rõ nhất của việc migrate module này.

### 9.2. In tem công đoạn Đúc

Ghi vào sheet **`DUC`** — nằm trong **cùng file Diecast** ở trên (`1mxsjmez6UXvG5O7WjklZ8_l_RmUa2EEczis12On7_4s`), không phải file riêng.

**21 cột:** TagNo, TenSP, MaSP, SoLuong, Ngay, Lot, SoKhuon, NguyenLieu, MayDucChiThi, GhiChu, NgayGioIn, SoKhuonTT, SoLuongTT, MayTT, NguoiTT, NgayGioXuat, NguoiNhan, TrangThai, GhiChu2, NG, GhiChuSL.

→ Đề xuất bảng Postgres `duc_tem` (PK = `tag_no`, dạng `TKD{yyyyMMdd}-{seq}` hoặc `D-TKD{yyyyMMdd}-{seq}` cho SP đang phát triển).

**Nhận xét:** vì `DUC` (tem) và `Diecast` (log sản lượng) đang sống chung 1 file Sheet nhưng phục vụ 2 mục đích khác nhau (tem/lot vs log sản lượng theo phút), khi migrate nên **tách hẳn thành 2 bảng riêng** trong Postgres (đã tách theo đề xuất trên) — loại bỏ luôn rủi ro 1 file Sheet vừa phải chịu tải ghi tem vừa chịu tải ghi log liên tục.

### 9.3. Đọc QR chuyển công đoạn

File riêng "Dữ liệu chuyển công đoạn" (`1r6tq_LWBhqpWollry2LeBQmlWoxKsiXi4R-UGG6G0Xk`), tách khỏi file DUC từ v1.2 (đúng hướng — tránh file DUC nặng dần).

**Sheet `ChuyenCongDoan`** (lịch sử, mỗi lượt chuyển 1 dòng, append-only) — 19 cột: ID Phiếu, Thời gian chuyển, Tag No, Mã SP, Tên SP, SL trên tem, SL thực chuyển, Chênh lệch (hao hụt), Lot No, Số khuôn, Nguyên liệu, Máy đúc, Ngày đúc, Công đoạn giao, Công đoạn nhận, Người giao, Người nhận, Trạng thái xác nhận, Thời gian xác nhận.

→ Đề xuất bảng `chuyen_cong_doan_log`, PK = `id_phieu` (`CD{yyyyMMdd}-{seq}`), khoá ngoại `tag_no` → `duc_tem.tag_no`.

**Sheet `ViTriHienTai`** (state — mỗi Tag No 1 dòng, ghi đè liên tục) — 2 cột: Tag No, Công đoạn hiện tại.

**Nhận xét quan trọng:** đây chính là ví dụ điển hình cho lý do nên chuyển sang database thật — `ViTriHienTai` hiện phải được code Apps Script **tự tay upsert** (đọc hết cột A tìm dòng trùng Tag No, có thì update, không thì append) mỗi lần có lượt chuyển, tốn 1 vòng lặp quét toàn sheet mỗi lần ghi. Trong Postgres, "vị trí hiện tại của 1 Tag No" chỉ cần là 1 **VIEW**:
```sql
SELECT DISTINCT ON (tag_no) tag_no, cong_doan_nhan AS vi_tri_hien_tai, thoi_gian_chuyen
FROM chuyen_cong_doan_log
ORDER BY tag_no, thoi_gian_chuyen DESC;
```
→ không cần bảng `ViTriHienTai` riêng, không cần logic upsert thủ công, không bao giờ bị lệch dữ liệu giữa 2 sheet.

Đây cũng là bảng tăng nhanh nhất trong toàn hệ thống (mỗi lượt chuyển hàng giữa 5 công đoạn = 1 dòng mới) — nên là **module ưu tiên chuyển đầu tiên** (đã ghi ở mục 4).

### 9.4. Liên kết dữ liệu giữa 3 hệ thống (hiện tại RỜI RẠC — cơ hội khi migrate)

```
[Intem QR]  → sinh Tag No, ghi sheet DUC
     │  (Tag No in trên tem, người vận hành quét QR)
     ▼
[Chuyển công đoạn] → log mỗi lượt chuyển theo Tag No, câp nhật ViTriHienTai
     │
     ×  (KHÔNG có liên kết ngược lại Ca_hien_tai/BanGhi_SuCo của Dashboard Đúc)
     ▼
[Dashboard Đúc] → Ca_hien_tai/BaoCao_Ca tính theo (ngày, ca, máy, SP) — không biết Tag No nào sinh ra từ ca nào
```

Hiện 3 hệ thống chia sẻ file KHSX Master nhưng **không** liên kết dữ liệu nghiệp vụ với nhau bằng khoá chung — mỗi hệ thống tự sinh ID riêng (`id_dong` kiểu `ddMMyyyy_Ca_MaMay_MaSP` ở Đúc, `TagNo` ở In tem, `id_phieu` ở Chuyển công đoạn). Sau khi có database thật, đây là cơ hội tốt để **thêm khoá ngoại thật sự** — ví dụ thêm cột `id_dong` (tham chiếu ca sản xuất) vào bảng `duc_tem`, cho phép truy vết: 1 tem được in ra từ ca/máy nào → tem đó đã đi qua bao nhiêu công đoạn → hiện đang ở đâu, tất cả bằng 1 câu JOIN thay vì tra cứu thủ công qua nhiều file Sheet như hiện tại.

### 9.5. Quản lý tồn kho NVL

**File Google Sheet:** `1sFRigbmMAKdKX2spRrq6IPjPeNA3hDaOECobqaXMa-8`, 6 tab. Cũng đọc chung file **KHSX Master** (cùng file `1WMF1EoGsmKNVaYIQwEe9i9tw6k_dZC1gSbHJp7RNsC0` mà Đúc/In tem/Chuyển công đoạn đang dùng) — cột **V:W** (Tên NVL, Mã NVL) từ dòng 7, cache 10 phút. Đây là **hệ thống thứ 4** đọc chung file KHSX Master này.

| Sheet hiện tại | Cột | Vai trò | Bảng Postgres đề xuất |
|---|---|---|---|
| `Tồn Đầu Kỳ` | A=Mã, B=NgàyĐầuKỳ, C=TồnĐầuKỳ | Điểm mốc tồn đầu kỳ mỗi mã NVL | `nvl_ton_dau_ky` |
| `Kế Hoạch` | 3 dòng/mã (Nhập, Tiêu hao, Tồn dự kiến) × 30 cột ngày | Kế hoạch nhập/tiêu hao 30 ngày tới, tồn dự kiến tự tính | `nvl_ke_hoach_ngay` (dạng dài: 1 dòng = 1 mã + 1 ngày, thay vì 1 dòng = 1 mã × 30 cột ngày) |
| `Giao Dịch` | A-G: Ngày, Loại(IN/OUT), Mã, Số lượng, Ghi chú, TồnSau, Timestamp | Lịch sử nhập/xuất (append-only) | `nvl_giao_dich` |
| `Tem NVL` | A-I: TagNo, Mã, Tên, NgàyNhập, SốLượng, ĐơnVị, GhiChú, Timestamp, TrạngThái | Tem QR cho pallet NVL, TagNo dạng `TYK-yyyyMMdd-XXXX`, hỗ trợ tra cứu FIFO | `nvl_tem` |
| `Cài Đặt` | A=Mã, B=Bề rộng | Tham số cấu hình theo mã NVL | `nvl_cai_dat` |
| `Tồn Hiện Tại` | A=Mã, B=Tồn, C=CậpNhậtLúc | Số tồn hiện tại theo mã (state, ghi đè liên tục) | `nvl_ton_hien_tai` (có thể thay bằng VIEW tính từ `nvl_ton_dau_ky` + SUM `nvl_giao_dich`, xem nhận xét bên dưới) |

**Nhận xét quan trọng — rủi ro thiết kế cần khắc phục khi migrate:**

1. **4 sheet (`Tồn Đầu Kỳ`, `Kế Hoạch`, `Cài Đặt`, `Tồn Hiện Tại`) dùng "dòng cố định theo vị trí"** — code định nghĩa cứng mảng `MATERIALS` (7 mã NVL) trong `Config.js`, và dòng thứ N trong các sheet này PHẢI ứng đúng với mã thứ N trong mảng đó (comment trong code: *"Nếu thêm mã mới, phải: 1. Thêm mã vào cuối list. 2. Thêm 1 dòng tương ứng ở cuối mỗi sheet"*). Đây là kiểu thiết kế dễ vỡ — thêm/sửa/xoá mã NVL sai thứ tự ở 1 trong 4 sheet là dữ liệu bị lệch hàng loạt mà không có cảnh báo. **Khi migrate, đây là điểm value lớn nhất**: thay bằng bảng Postgres có PK = `ma_nvl` (không phụ thuộc vị trí dòng), thêm mã mới chỉ cần `INSERT` 1 dòng, không phải sửa code + đồng bộ tay 4 sheet.
2. **Hai nguồn danh mục mã NVL không đồng nhất**: 4 sheet trên dùng mảng `MATERIALS` cứng (7 mã), còn `Tem NVL`/`Giao Dịch` lại validate theo KHSX Master (cột V:W, có thể nhiều hơn 7 mã). Nghĩa là 1 mã NVL mới thêm vào KHSX Master có thể **tạo tem/giao dịch được nhưng không có dòng tồn đầu kỳ/tồn hiện tại tương ứng** → tồn kho sai mà không báo lỗi rõ ràng. Khi thiết kế schema thật, dùng **1 bảng danh mục `nvl_materials` duy nhất** (đồng bộ từ KHSX Master hoặc quản lý trực tiếp trong Postgres), mọi bảng khác tham chiếu khoá ngoại tới đây — loại bỏ hẳn tình trạng 2 nguồn lệch nhau.
3. **`Tồn Hiện Tại` là dữ liệu suy ra được** (= tồn đầu kỳ + tổng nhập − tổng xuất từ `Giao Dịch`), nhưng hiện phải ghi đè thủ công mỗi lần có giao dịch (`updateStockForMaterial`). Trong Postgres nên cân nhắc bỏ hẳn bảng này, thay bằng 1 VIEW cộng dồn từ `nvl_ton_dau_ky` + `nvl_giao_dich` — tự động đúng, không bao giờ lệch so với lịch sử giao dịch gốc (khác với cách làm hiện tại, vốn có thể lệch nếu 1 giao dịch bị sửa/xoá tay mà quên cập nhật lại tồn).
4. **Đơn vị lẫn lộn kg/tấn**: sheet `Tem NVL` lưu số lượng theo đơn vị gốc (`kg` hoặc `pcs`), nhưng khi ghi vào `Giao Dịch`/`Tồn Hiện Tại` lại tự quy đổi sang **tấn** (`qtyInTons = soLuong/1000` nếu đơn vị kg). Nên chuẩn hoá 1 đơn vị lưu trữ duy nhất trong Postgres (khuyến nghị: **kg**, chính xác hơn tấn cho số lượng nhỏ) và chỉ quy đổi hiển thị ở tầng frontend, tránh riêng bảng dùng riêng đơn vị như hiện tại.

---

## 10. Tiến độ thực tế (cập nhật liên tục)

> Mục này ghi lại trạng thái thật của việc migrate, khác với mục 3 (kế hoạch lý thuyết) — cập nhật mỗi khi có bước hoàn thành.

- **2026-08-12** — Đã tạo project Supabase (`fgghikpzcxjqzahfiiil`). Đã viết `supabase/schema_sanluong.sql` (6 bảng module Sản lượng: `sl_giao_hang`, `sl_khsx`, `sl_capacity`, `sl_forecast`, `sl_comments`, `sl_config`, cột lấy đúng từ header CSV thật, có RLS đọc công khai). **Chưa chạy** trên Supabase, chưa import dữ liệu, chưa đổi `sanluong.html` sang gọi Supabase.
- **2026-08-12** — Khảo sát thêm module IPQC/QC giám sát (xem mục 9.1) — xác nhận đây là phần mở rộng của Dashboard Đúc, không tách module riêng khi migrate.
- **2026-08-12** — Xây song song 3 module (Sản lượng, Chất lượng, Tồn kho NVL) bằng agent chạy nền, mỗi module chỉ tạo **file/link mới**, không sửa trang đang chạy thật. Kết quả:
  - **Sản lượng**: `supabase/schema_sanluong.sql`, `supabase/import-sanluong.mjs`, trang pilot `sanluong-supabase.html`.
  - **Chất lượng**: `supabase/schema_chatluong.sql` (13 bảng `cl_*`), `supabase/import-chatluong.mjs`, trang pilot `chatluong-supabase.html`.
  - **Tồn kho NVL**: `supabase/schema_nvl.sql`, `supabase/import-nvl.mjs`, trang pilot `D:\Project\MES\Quản lý NVL\index-supabase.html` (repo GitHub riêng `Ton-kho-NVL`, đã có remote sẵn — chỉ cần push để có link công khai).
  - **Phát hiện quan trọng khi khảo sát NVL** (không phải giả định trong tài liệu, đã xác nhận qua dữ liệu thật): (1) đơn vị lưu trữ phức tạp hơn mô tả ban đầu — `Tồn Đầu Kỳ`/`Cài Đặt`/`Giao Dịch`/`Tồn Hiện Tại` đều đang lưu bằng **tấn**, riêng `Kế Hoạch` lưu bằng **kg**; (2) action `getTemList` của Web App hiện tại chỉ trả 100 tem gần nhất — không có cách lấy toàn bộ lịch sử tem qua API công khai; (3) **có 1 giao dịch NHẬP ngày 2026-07-13 với số lượng 1050 "tấn" cho mã `ADC12-DAK`** gần như chắc chắn là lỗi nhập liệu (tem đơn vị `pcs` bị ghi thẳng vào Giao Dịch mà không quy đổi) — đang làm sai lệch số tồn hiện tại hiển thị trên dashboard NVL **ngay cả ở bản Sheet đang chạy thật**, không liên quan gì đến việc migrate. Nên kiểm tra/sửa lại giao dịch này trong Sheet gốc sớm, độc lập với tiến độ migrate.

- **2026-08-13** — Mở rộng migrate sang 2 module còn lại (Chuyển công đoạn, Đúc+IPQC+In tem), theo đúng yêu cầu "migrate toàn bộ dự án":
  - **Chuyển công đoạn**: `supabase/schema_chuyencongdoan.sql` + `supabase/import-chuyencongdoan.mjs` đã có sẵn từ trước (đọc CSV publish-to-web như các module khác). Mới thêm trang pilot `chuyencongdoan-supabase.html` (tab "Vị trí hiện tại" đọc từ VIEW `cd_v_vi_tri_hien_tai`, tab "Nhật ký" đọc `cd_chuyen_cong_doan_log`).
  - **Đúc + IPQC + In tem**: xác nhận `supabase/schema_duc.sql` (đã có sẵn, 16 bảng) khớp 100% với `Config.js` thật (đối chiếu lại toàn bộ COL_* — không phát hiện sai lệch). Module này **KHÔNG có publish-to-web/API JSON công khai** như các module khác — `doGet` của `WebApp.js` chỉ trả HTML có kiểm tra đăng nhập, dữ liệu đọc qua `google.script.run` nội bộ (không fetch được từ ngoài). Giải pháp chọn: đọc trực tiếp qua **Google Sheets API + service account** (không đụng code Apps Script đang chạy thật). Mới viết `supabase/import-duc.mjs` (tự ký JWT bằng `node:crypto`, không thêm dependency npm) và trang pilot `duc-supabase.html` (4 tab: Ca đang chạy, Sự cố, Báo cáo ca, Shot khuôn — 4/16 bảng lõi, các bảng còn lại như IPQC_Checkpoint/SP_Khong_Phu_Hop/Van_De_Khuon chưa có tab riêng, để bổ sung sau).
  - Ghi chú: `SUPABASE_ANON_KEY` (public theo thiết kế, được bảo vệ bằng RLS) đã điền sẵn trong tất cả trang pilot, không còn placeholder `PASTE_...` — không cần điền tay khi mở trang.

- **2026-08-13** — Đã chạy xong cả 5 file `supabase/schema_*.sql` và nạp dữ liệu qua các script `import-*.mjs` (xác nhận qua REST API bằng anon key, đếm dòng từng bảng):
  - Sản lượng (`sl_*`, 6 bảng): có dữ liệu (2-12 dòng/bảng).
  - Chất lượng (`cl_*`, 13 bảng): có dữ liệu (2-60 dòng/bảng).
  - Tồn kho NVL (`nvl_*`, 6 bảng): có dữ liệu (7-210 dòng/bảng).
  - Chuyển công đoạn (`cd_chuyen_cong_doan_log`): 10 dòng.
  - Đúc+IPQC+In tem (`duc_*`, 12 bảng): có dữ liệu ở hầu hết bảng (`duc_tem` 602 dòng, `duc_ipqc_checkpoint` 323 dòng, `duc_su_co_log` 285 dòng...), **riêng 2 bảng đang 0 dòng: `duc_tangca_log` và `duc_ipqc_tieuchuan`** — cần xác nhận là hợp lý (chưa có log tăng ca / chưa cấu hình checklist IPQC theo mã SP nào) hay import bị sót, việc này chưa kiểm tra.

- **2026-08-13** — Đã push xong cả 4 trang pilot trong repo `Toyotaki` (`sanluong-supabase.html`, `chatluong-supabase.html`, `chuyencongdoan-supabase.html`, `duc-supabase.html`, restyle theo đúng UI Đúc thật) và trang `index-supabase.html` trong repo `Ton-kho-NVL` lên GitHub (đều "up to date with origin/main") — mục "push 5 trang pilot" coi như **xong**, có link công khai chạy song song với bản gốc.

- **2026-08-13** — Người dùng xác nhận yêu cầu: **cutover thật** (không chỉ đọc thử) — chuyển hẳn cả 5 module sang dùng Supabase làm database chính, **giữ nguyên 100% chức năng/giao diện/logic nghiệp vụ** (không viết lại business logic, chỉ đổi nơi lưu trữ bên dưới). Đã khảo sát kỹ (3 agent) toàn bộ đường **ghi** dữ liệu hiện tại (trước đó tài liệu này mới khảo sát đường đọc) — xem mục 11 để có bản đồ đầy đủ hàm ghi/khoá/chuỗi xuyên bảng của từng module. Đã lập kế hoạch cutover chi tiết theo 6 phase (0-5), user chọn: có sẵn `clasp` để push/deploy trực tiếp, làm tuần tự theo đúng thứ tự ưu tiên cũ, mỗi module chạy song song đối chiếu trước khi làm module tiếp theo. Kế hoạch đầy đủ + tiến độ từng phase: xem **mục 11** bên dưới (mục đó là nguồn tiến độ chính từ nay cho việc cutover ghi; mục 10 này giữ lại làm lịch sử giai đoạn khảo sát/đọc-thử).

**Việc còn treo, độc lập với migrate (chưa làm, không chặn cutover):**
1. Xác nhận 2 bảng 0 dòng (`duc_tangca_log`, `duc_ipqc_tieuchuan`) là hợp lý hay cần chạy lại import.
2. Đối chiếu số liệu đọc giữa các trang pilot và bản gốc (vẫn nên làm song song trong lúc cutover ghi ở mục 11).
3. Kiểm tra/sửa giao dịch lỗi 1050 "tấn" của `ADC12-DAK` trong Sheet NVL gốc (không phụ thuộc migrate).

---

## 11. Kế hoạch & tiến độ CUTOVER GHI DỮ LIỆU sang Supabase (nguồn tiến độ chính — cập nhật mỗi khi làm xong 1 việc)

> Mục này là bản sao có cập nhật liên tục của kế hoạch đã được duyệt (lưu tại `C:\Users\DELL\.claude\plans\indexed-hugging-candle.md` trên máy người thực hiện). Đọc mục này để biết **đang làm tới đâu** và **làm tiếp gì** — không cần đọc lại toàn bộ hội thoại cũ.

### 11.0. Lưu ý quan trọng đã rút ra khi test thật (đọc trước khi cấu hình key)

**Phải dùng key `service_role` kiểu CŨ (JWT, chuỗi dài bắt đầu bằng `eyJ...`), KHÔNG dùng key kiểu mới `sb_secret_...`.** Key `sb_secret_...` (hệ thống key mới của Supabase) bị chặn khi gọi qua HTTP thô từ Apps Script (`UrlFetchApp`), báo lỗi `401 Forbidden use of secret API key in browser` — không phải do dán sai chỗ hay do User-Agent, mà do key kiểu mới hiện chỉ hoạt động qua thư viện chính thức của Supabase, không hoạt động qua lệnh gọi REST trực tiếp kiểu Apps Script/Node đang dùng trong toàn bộ dự án này. Lấy key đúng: Supabase Dashboard → Settings → API → tìm mục **"Legacy API keys"** → key `service_role` (JWT). Đây cũng là key mà các script `import-*.mjs` trước đó đã dùng thành công.

**`clasp run` để tự set Script Properties không hoạt động được** (báo "Unable to run script function... permission") — cần bật 1 cài đặt tài khoản Google (Apps Script API) mà không thao tác qua CLI được. Giải pháp thực tế: cài đặt `SUPABASE_SERVICE_ROLE_KEY` bằng tay qua Apps Script Editor → ⚙️ Project Settings → Script Properties (4 bước, không cần biết code) — đã làm cách này cho Dashboard Đúc + Intem QR.

**`.claspignore` có sẵn trong project Dashboard Đúc là danh sách CHO PHÉP (deny-all + allowlist từng file)** — file mới tạo (`Supabase.js`) bị bỏ sót khi push cho đến khi thêm dòng `!Supabase.js` vào `.claspignore`. Cần nhớ việc này khi tạo file `.js` mới trong project đã có `.claspignore` kiểu allowlist.

**@HEAD deployment vs deployment production**: mỗi project Apps Script luôn có sẵn 1 deployment `@HEAD` tự động (theo dõi code mới nhất) — đây thường KHÔNG phải link production thật (link "Anyone" mà người dùng bookmark thường là 1 deployment có phiên bản cố định, tạo qua "Manage deployments"). `clasp push` cập nhật `@HEAD` ngay lập tức nhưng KHÔNG đụng tới deployment production đã có phiên bản cố định — an toàn để push code mới mà không sợ ảnh hưởng người dùng thật, miễn là không chủ động sửa deployment production. Muốn có link riêng để test, dùng `clasp deploy --description "..."` — tạo deployment MỚI, độc lập, không đụng bản cũ.

### 11.1. Kiến trúc đã chốt

- **Đọc**: dashboard fetch thẳng Supabase REST (`/rest/v1/<table>`, anon key, RLS chỉ cho `select`) — pattern đã có sẵn ở các trang `*-supabase.html`.
- **Ghi**: Apps Script **giữ nguyên vai trò thực thi business logic** (validate, rẽ nhánh, sinh ID...) — chỉ thay lệnh `SpreadsheetApp...appendRow/setValue` bằng `fetch` tới Supabase REST, dùng **service_role key lưu trong Script Properties** (không hardcode, không commit).
- **Chuỗi ghi xuyên nhiều bảng** (vd `resolveIncident_`, `submitIpqcCheck_`, `changeProduct_`): viết thành **1 hàm Postgres `plpgsql` (`SECURITY DEFINER`)**, thực hiện trong 1 transaction thật, Apps Script gọi qua `/rest/v1/rpc/<ten_ham>` — giữ nguyên hành vi, loại bỏ rủi ro ghi nửa-vời.
- **Sinh ID tuần tự** (`id_dong`, `TagNo`, `id_phieu`...): thay "quét cột tìm max + Lock" bằng hàm Postgres dùng `sequence`, gọi qua RPC.
- **LockService**: giữ nguyên trong Apps Script làm lớp bảo vệ bổ sung — an toàn thật sự giờ đến từ Postgres transaction/sequence.
- **Sheet gốc**: giữ ở chế độ đọc, làm bản đối chiếu/lưu trữ 1-2 tuần sau mỗi module cutover, không tắt ngay.
- **Ảnh IPQC/PDF tiêu chuẩn**: giữ nguyên trên Google Drive, chỉ đổi nơi lưu URL từ Sheet sang cột Postgres.

### 11.2. Bản đồ đường ghi hiện tại (đã khảo sát 2026-08-13, dùng làm checklist khi sửa)

**Sản lượng/Chất lượng** — ghi duy nhất 1 thứ: comment, qua `doPost(e)` của 1 Apps Script Web App riêng (2 deployment: `AKfycbz-vAFxrBA1...` cho sanluong, `AKfycbwQ9w-w2...` cho chatluong) — tìm dòng theo cột A trong sheet `Comments`, `setValue`/`appendRow`. Vị trí source thật **chưa xác định** (repo này chỉ có bản copy tay `sanluong.js`/`chatluong.js`, không phải clasp project).

**Chuyển công đoạn** (`D:\Project\MES\Chuyển công đoạn`): `WA_ChuyenCongDoan` (`ChuyenCongDoan.gs:256`) append `ChuyenCongDoan` sheet, gọi `_upsertViTriHienTai` (:182, vòng lặp quét cột A) và `_genTransferId` (:231, quét max), có `LockService`. Có route `doPost(e)` ngoài domain (trang quét mobile) gọi cùng hàm. `XacNhanChuyenCongDoan.gs` (`ChuyenCongDoan()` :88-142) — 3 `setValue` xác nhận, dưới cùng lock.

**Đúc + IPQC + In tem** (`D:\Project\MES\Dashboard Đúc` + `D:\Project\MES\Intem QR`) — khối phức tạp nhất:
- `CaHienTai.js`: `upsertPlan_`(:122), `assignPairedPlan_`(:242), `setIncidentOpen_`(:337), `clearIncidentOpen_`(:420), `changeProduct_`(:516), `changeProductPaired_`(:662), `extendMachineShift_`(:1080)... đều ghi `Ca_hien_tai`.
- `BanGhiSuCo.js`: `resolveIncident_`(:58, chuỗi: append `BanGhi_SuCo` → clear `Ca_hien_tai` → gọi `requestIpqcCheck_`), `editIncident_`(:248).
- `IpqcCheckpoint.js`: `requestIpqcCheck_`(:94, append `IPQC_Checkpoint`), `submitIpqcCheck_`(:365, chuỗi: update `IPQC_Checkpoint` → rẽ nhánh NG mở incident F1 trên `Ca_hien_tai` + `reportMoldIssue_`; CẢNH BÁO chỉ `reportMoldIssue_`; OK đóng F1), `_uploadIpqcEvidence_`(:318, Drive), `saveTieuChuan_`/`uploadTieuChuanPdf_`(:670/711).
- `VanDeKhuon.js`: `reportMoldIssue_`(:93), `resolveMoldIssuePending_`(:139), `confirmMoldIssueOutcome_`(:173).
- `Ncp.js`: 10 hàm ghi có lock, sheet `SP_Khong_Phu_Hop`.
- `ShotKhuon.js`, `Diecast.js`, `BaoCao.js`/`BaoCaoTuan.js`: ghi đơn giản hơn.
- `Intem QR/Code.gs`: `WA_InTem`(:92) → `_genTagNo` (lock, quét max) → `_ghiDUC`(:280, append sheet `DUC` — **cùng file Diecast mà Đúc dùng chung**).
- 33 chỗ `LockService.getScriptLock()` tổng cộng trong khối này. `Index.html` 4143 dòng, 149 điểm `google.script.run`.

**Tồn kho NVL** (`D:\Project\MES\Quản lý NVL\code.js`, 1020 dòng): `addTransaction`(:231), `createTem`(:434, chuỗi phức tạp nhất — tạo tem + tự ghi giao dịch IN + cập nhật tồn), `updateStockForMaterial`(:983), `processMultiTransaction`(:724, quét giỏ QR hàng loạt), `updateOpening`/`updateStock`/`updateSettings`/`updatePlanNhap`/`recalcAllPlanStock` — **phụ thuộc vị trí dòng** theo mảng cứng `MATERIALS` (:34-37, 7 mã) cho 4 sheet (`Tồn Đầu Kỳ`, `Kế Hoạch`, `Cài Đặt`, `Tồn Hiện Tại`). **Không có `LockService` ở đâu cả** — rủi ro race có sẵn, độc lập với migrate.

### 11.3. Trạng thái clasp (đầu vào bắt buộc để deploy)

| Project | `.clasp.json` | Trạng thái |
|---|---|---|
| Dashboard Đúc | có (`scriptId` đã biết) | sẵn sàng |
| Intem QR | có (`scriptId` đã biết) | sẵn sàng |
| Chuyển công đoạn | **chưa có** | cần user lấy `scriptId` từ Apps Script Editor → `clasp clone` |
| Quản lý NVL (`code.js`) | **chưa có** | cần user lấy `scriptId` → `clasp clone` |
| Comment-backend sanluong/chatluong | **chưa xác định được project** | cần user tìm 2 project (deployment `AKfycbz-vAFxrBA1...`, `AKfycbwQ9w-w2...`) → lấy `scriptId` → `clasp clone` |

### 11.4. Tiến độ theo phase (cập nhật mỗi khi làm xong 1 việc — thêm dòng mới, không xoá dòng cũ)

**Phase 0 — Chuẩn bị**
- [ ] 0.1 Lấy `scriptId` + `clasp clone` cho: comment-backend sanluong/chatluong, Chuyển công đoạn, Quản lý NVL. **⏳ ĐANG CHỜ USER** — user đang tự mở Apps Script Editor để lấy (2026-08-13). Đây là việc chặn **deploy** (không chặn việc sửa code local) cho 3 project này — Dashboard Đúc/Intem QR đã có clasp sẵn nên Phase 4 không bị chặn.
- [ ] 0.2 Set `service_role` key vào Script Properties của từng project (sau khi có clasp) — code đã viết sẵn để đọc key qua `PropertiesService.getScriptProperties().getProperty("SUPABASE_SERVICE_ROLE_KEY")`, chỉ cần điền giá trị thật trong Apps Script Editor.
- [~] 0.3 Bổ sung sequence + hàm RPC vào schema Supabase — làm **theo từng phase** (không làm 1 lần cho cả 5 module) để giữ đúng tinh thần cutover tuần tự. Đã xong phần của Chuyển công đoạn (xem Phase 3 bên dưới); Sản lượng/Chất lượng/Đúc/NVL sẽ làm khi tới lượt.

**Phase 1 — Sản lượng**: chưa bắt đầu (chặn deploy bởi 0.1 — chưa xác định được project comment-backend).

**Phase 2 — Chất lượng**: chưa bắt đầu (chặn bởi 0.1, và bởi Phase 1 xong trước theo thứ tự ưu tiên).

**Phase 3 — Chuyển công đoạn**: **code đã sửa xong ở local, chưa deploy** (2026-08-13):
  - `supabase/migration_phase3_chuyencongdoan.sql` (mới, trong repo `Dashboard_SL_CL`) — bảng đếm `cd_transfer_id_counter`, hàm `cd_next_transfer_id()`, `cd_ghi_chuyen_cong_doan(...)` (gói sinh ID + insert log trong 1 transaction), `cd_xac_nhan_chuyen(...)` (thay 3 setValue xác nhận). **Chưa chạy trên Supabase** — cần chạy trong SQL Editor trước khi deploy code Apps Script mới.
  - `D:\Project\MES\Chuyển công đoạn\ChuyenCongDoan.gs` — đã thêm helper `_sbRpc_`/`_sbSelect_` (gọi Supabase REST bằng service_role key từ Script Properties); `WA_ChuyenCongDoan` đổi sang gọi RPC `cd_ghi_chuyen_cong_doan` thay `appendRow`; `WA_LayViTriHienTai` đổi sang đọc VIEW `cd_v_vi_tri_hien_tai` qua REST thay vì sheet `ViTriHienTai`; đã xoá hẳn `_upsertViTriHienTai`, `_ensureViTriSheet`, `_ensureTransferSheet`, `_genTransferId` (không còn dùng). Validate nghiệp vụ giữ nguyên 100%.
  - `D:\Project\MES\Chuyển công đoạn\XacNhanChuyenCongDoan.gs` — đổi từ đọc/ghi trực tiếp sheet `ChuyenCongDoan` sang: `_sbSelect_` tra cứu hàng loạt theo `id_phieu=in.(...)`, rồi gọi RPC `cd_xac_nhan_chuyen` cho từng phiếu hợp lệ. Logic quyết định (khớp bộ phận, trạng thái chờ, danh sách bỏ qua) giữ nguyên y hệt bản cũ.
  - **Còn thiếu để deploy được**: `scriptId` của project Chuyển công đoạn (chưa có `.clasp.json`) + set `SUPABASE_SERVICE_ROLE_KEY` vào Script Properties của **cả 2 project** (Web App chính + script gắn vào sheet "Theo dõi chuyển công đoạn" — đây là 2 project Apps Script riêng biệt, phải set key ở cả 2).
  - `doGet`/`doPost` (route ngoài domain cho trang quét mobile) không cần sửa gì thêm — đã tự động dùng lại `WA_ChuyenCongDoan`/`WA_LayViTriHienTai` đã sửa.

**Phase 4 — Đúc + IPQC + In tem** (7 bước con, xem chi tiết trong plan file) — **không bị chặn bởi 0.1** (đã có clasp sẵn cho cả Dashboard Đúc và Intem QR), đang làm trong lúc chờ scriptId của các phase khác.

**Bước con 1/7 ("bảng đơn giản, không có chuỗi xuyên bảng trước") — CODE XONG, CHƯA DEPLOY (2026-08-13)**:
  - `D:\Project\MES\Dashboard Đúc\Supabase.js` (**mới**) — helper dùng chung cho cả project: `sbSelect`/`sbInsert`/`sbUpsert`/`sbUpdate`/`sbRpc`, đọc `SUPABASE_SERVICE_ROLE_KEY` từ Script Properties. Mọi file khác trong dự án này tái dùng file này thay vì tự viết fetch riêng.
  - `ShotMay.js` — xong, đổi `getLastMachineShot_`/`setLastMachineShot_` sang `sbSelect`/`sbUpsert` bảng `duc_shot_may`. Logic carry-over giữ nguyên 100%.
  - `VanDeKhuon.js` — xong, `reportMoldIssue_`/`resolveMoldIssuePending_`/`confirmMoldIssueOutcome_`/`readOpenMoldIssuesByMold_`/`getAllMoldIssuesFull_` đổi sang `duc_van_de_khuon` qua Supabase, giữ nguyên `LockService`, `CacheService` (cache 60s không đổi), state machine trạng thái/đếm tái phát y hệt bản Sheet cũ.
  - `ShotKhuon.js` — xong, `readAllMolds`/`updateMoldShotsFromShift_` (kể cả logic khuôn kép `pairSkipIds` — giữ nguyên y hệt)/`recordMoldMaintenance_`/`configureMold_`/`ensureMoldProductMapping_`/`cleanupMoldProductNames_` đổi sang `duc_shot_khuon` qua Supabase. `_computeMoldStatus` (JS thuần, không đụng Sheet/DB) giữ nguyên không đổi.
  - `CaHienTai.js` hàm `extendMachineShift_` — **chỉ phần ghi `TangCa_Log` đổi sang Supabase** (`sbInsert('duc_tangca_log', ...)`). Phần ghi 4 cột `sp_end_time`/`version`/`last_updated_by`/`last_updated_at` vào `Ca_hien_tai` **CỐ Ý giữ nguyên trên Sheet** — bảng `Ca_hien_tai` sẽ migrate trọn khối ở bước con 3 (`changeProduct_`), đổi dở dang bây giờ sẽ làm dashboard đọc từ Sheet thấy dữ liệu cũ trong khi Supabase có dữ liệu mới → lệch hiển thị. `TangCa_Log` an toàn tách riêng vì chỉ ghi (audit log), không có hàm nào trong codebase đọc lại từ Sheet.
  - **Chưa deploy** — cần: (1) set `SUPABASE_SERVICE_ROLE_KEY` vào Script Properties của project Dashboard Đúc (Project Settings trong Apps Script Editor), (2) `clasp push`, (3) test thật: bảo dưỡng khuôn, báo vấn đề khuôn, kết ca (trigger `updateMoldShotsFromShift_`), tăng ca máy đơn lẻ — đối chiếu dữ liệu xuất hiện đúng trong Supabase.
**Bước con 3/7 (khối Ca_hien_tai — CaHienTai.js + Diecast.js + IpqcCheckpoint.js + BanGhiSuCo.js + Ncp.js + BaoCao.js) — CODE XONG, CHƯA DEPLOY (2026-08-14)**:
  - Khảo sát trước khi code phát hiện phạm vi thật rộng hơn dự kiến ban đầu — không chỉ 13 hàm trong `CaHienTai.js` mà còn 6 file khác đọc/ghi trực tiếp bảng này (`Diecast.js` trigger mỗi phút, `IpqcCheckpoint.js` 5 hàm, `BanGhiSuCo.js`, `Ncp.js`, `BaoCao.js` khối carry-over kết ca) — tất cả đã chuyển đồng bộ trong 1 lượt để tránh dashboard đọc lẫn lộn Sheet cũ/Supabase mới.
  - **Phát hiện quan trọng khi khảo sát**: `_getActiveIdDongSet_()` (IpqcCheckpoint.js) dựa vào **thứ tự chèn dòng trong Sheet** (rowIndex) để biết dòng SP nào đang active trên 1 máy (vì `changeProduct_` giữ nguyên dòng SP cũ, không xoá) — Supabase không có khái niệm này. Đã thêm cột `row_seq bigserial` (tự tăng, không đổi sau khi ghi — an toàn hơn dùng `last_updated_at` vì cột đó có thể bị `trigger_pollDiecast_` cập nhật nhầm cho dòng cũ).
  - `supabase/migration_phase4_step3_ca_hien_tai.sql` (mới) — cột `row_seq`, hàm RPC `duc_bulk_update_actuals(updates jsonb)` (gộp N lần PATCH của `Diecast.js` polling mỗi phút thành 1 lệnh gọi, giữ đúng ngữ nghĩa version/last_updated_by='system@poll', bỏ qua êm re id_dong không còn tồn tại). **Chưa chạy trên Supabase.**
  - `CaHienTai.js` — viết lại hoàn toàn: `trang_thai`/`ty_le_hoan_thanh` không còn lưu (trước là formula Sheet sống theo NOW()) — tính lại ở tầng đọc qua `_computeTrangThai_`/`_computeTyLeHoanThanh_` (đúng quyết định đã chọn, giống cách `ShotKhuon.js` làm với `trang_thai_khuon`). `findRowByIdDong` **giữ nguyên hợp đồng cũ** (chỉ trả về có/không tồn tại) để không phá vỡ các nơi khác đang gọi nó — thêm hàm mới `_chtFetchOne_`/`_chtFetchAll_`/`_chtFetchByShift_` cho việc lấy đầy đủ dữ liệu. Toàn bộ 13 hàm (`upsertPlan_`, `assignPairedPlan_`, `setIncidentOpen_`/Bulk, `clearIncidentOpen_`, `acquireLock_`/`releaseLock_`, `clearCaHienTai_`, `changeProduct_`, `changeProductPaired_`, `updateShiftInputs_`, `deletePlan_`, `editOpenIncident_`, `extendMachineShift_`) đã chuyển, giữ nguyên validate/rẽ nhánh/chuỗi gọi IPQC-shot-master data.
  - `Diecast.js` (`updateAllActuals_`, trigger mỗi phút) — đổi sang `_chtFetchAll_()` + RPC `duc_bulk_update_actuals`. Giữ nguyên `tryLock` (bỏ qua nếu bận, không đợi như các hàm khác).
  - `IpqcCheckpoint.js` — `requestIpqcCheck_`, `_scanAndCreateDinhKyCheckpoints_`, `submitIpqcCheck_` (phần liên kết ngược `Ca_hien_tai`), `_getActiveIdDongSet_` (dùng `row_seq`), `_closeF1IncidentIfOpen_` (đổi tham số từ `rowIndex/rowData` sang `chtRow` object) — đều đã chuyển. Phần ghi `IPQC_Checkpoint`/`Van_De_Khuon` (qua `reportMoldIssue_` đã chuyển từ bước con 1) giữ nguyên không đổi thêm.
  - `BanGhiSuCo.js` (`resolveIncident_`) — đổi phần đọc `Ca_hien_tai` sang `_chtFetchOne_`, giữ nguyên `splitIncidentByShift_` và toàn bộ logic chia đoạn qua ca. Ghi `BanGhi_SuCo` vẫn qua Sheet (chưa migrate — không phải vấn đề, đây vốn đã là 2 lệnh ghi tách rời không transaction trong bản gốc).
  - `Ncp.js` (`getAvailableNgCheckpointsForNcp_`) — đổi 1 chỗ đọc `so_khuon` sang `_chtFetchOne_`.
  - `BaoCao.js` (`endShift_`, khối carry-over) — đổi `appendRow`/`setFormula` sang `sbInsert`/`sbUpdate`, bỏ formula (tính ở tầng đọc).
  - **Chưa deploy** — cần: (1) chạy `migration_phase4_step3_ca_hien_tai.sql`, (2) `SUPABASE_SERVICE_ROLE_KEY` đã set từ bước con 1 (dùng chung 1 project Dashboard Đúc), (3) `clasp push`, (4) **khuyến nghị tạo deployment TEST riêng** (khác URL `/exec` production đang chạy thật trên xưởng) để thử trước khi trỏ traffic thật sang — đây là khối rủi ro cao nhất trong toàn bộ migrate, cần test kỹ từng luồng (lưu KH, mở/đóng sự cố, đổi SP, khuôn kép, tăng ca, kết ca có carry-over, IPQC scan định kỳ, poll Diecast) trước khi coi là xong.

**Bước con 2/7 (In tem công đoạn Đúc) — CODE XONG, CHƯA DEPLOY (2026-08-13)**:
  - `supabase/migration_phase4_step2_intem.sql` (mới, repo `Dashboard_SL_CL`) — bảng đếm `duc_tag_no_counter` (đếm riêng theo từng prefix+ngày, đúng hành vi `TKD`/`D-TKD` cũ), hàm `duc_next_tag_no(p_loai_sp)`, `duc_ghi_tem(...)` (gói sinh TagNo + insert `duc_tem` trong 1 transaction). **Chưa chạy trên Supabase.**
  - `D:\Project\MES\Intem QR\Supabase.js` (**mới**) — helper riêng cho project này (project Apps Script khác với Dashboard Đúc nên không share code được, phải có bản riêng): `sbSelect`/`sbUpdate`/`sbDelete`/`sbRpc`.
  - `D:\Project\MES\Intem QR\Code.gs` — `WA_InTem` gọi RPC `duc_ghi_tem` thay `_genTagNo`+`_ghiDUC` (đã xoá 2 hàm này, không còn dùng); `WA_FindTem`/`WA_ReprintTem` đổi sang `sbSelect` với filter `ilike` (giữ đúng hành vi so khớp không phân biệt hoa/thường của bản cũ); `WA_UpdateTem`/`WA_DeleteTem` đổi sang `sbUpdate`/`sbDelete`. `WA_LoadMaster` **CỐ Ý giữ nguyên đọc trực tiếp KHSX Master qua `SpreadsheetApp`** — đây là master data đọc dùng chung giữa 4 hệ thống (Đúc/In tem/Chuyển công đoạn/NVL), chưa gộp về Supabase (việc gộp master data là hạng mục riêng ở mục 7 của kế hoạch, không thuộc phạm vi "ghi của In tem").
  - **Chưa deploy** — cần: (1) chạy `migration_phase4_step2_intem.sql` trong Supabase SQL Editor, (2) set `SUPABASE_SERVICE_ROLE_KEY` vào Script Properties của project Intem QR, (3) `clasp push`, (4) test in tem thật (in mới, tra cứu, in lại, sửa, xoá) — đối chiếu `duc_tem` trên Supabase.
  - **Việc cần làm tiếp theo trong Phase 4**: bước con 3 (`changeProduct_`/`changeProductPaired_`, cả khối `Ca_hien_tai` — bước rủi ro cao hơn hẳn 2 bước trước, cần cẩn thận).

**Phase 5 — Tồn kho NVL**: chưa bắt đầu (chặn bởi 0.1).

**✅ 2026-08-14 — Bước con 1 + 2 + 3 (Dashboard Đúc + Intem QR) đã TEST OK trên deployment test**: gán kế hoạch, mở/đóng sự cố, tạo tem QR (qua Intem QR test link `AKfycbx2vXn6uR-dCJUl13poYI2bLbE9U829_dmV9jW0qhbrO-QZlexDc-GeXEevHVPhXw33`), sản lượng TT ca tự động cập nhật (trigger `trigger_pollDiecast_` chạy đúng), trigger `trigger_ipqcScanDinhKy_` hết báo đỏ. Dashboard Đúc test link: `AKfycbzIFpN4B9pNYLwJdyzXo0NtzO_QaeBthBTRR8r4hMKDrGRpcAJhQi8mjraqgLLKnwh05Q` (@79). **Chưa chuyển deployment production sang bản mới** — vẫn đang dùng link test song song, link production cũ (Sheet) chưa đổi.

**Các lỗi đã gặp và cách sửa trong quá trình test (ghi lại để không lặp lại)**:
1. `.claspignore` kiểu allowlist trong Dashboard Đúc bỏ sót file `Supabase.js` mới tạo → phải thêm `!Supabase.js` mới push được.
2. Key `sb_secret_...` (Supabase key thế hệ mới) bị chặn khi gọi qua `UrlFetchApp` (lỗi 401 "Forbidden use of secret API key in browser") — phải đổi sang key `service_role` kiểu CŨ (JWT, `eyJ...`) lấy từ mục "Legacy API keys" trong Settings → API.
3. Intem QR cần khai báo `oauthScopes` (bao gồm `script.external_request`) trong `appsscript.json` + người deploy phải tự chạy 1 hàm trong Editor để cấp quyền lại (bước bảo mật của Google, không tự động qua clasp được).
4. `Diecast.js` (`getDiecastData`) ban đầu vẫn đọc sheet "DUC" cũ — phát hiện qua test thật ("tạo tem OK nhưng sản lượng không cập nhật") — đã sửa sang đọc `duc_tem` trên Supabase (đúng 4 cột: ma_sp/ngay_gio_in/so_luong_tt/may_tt).
5. `trigger_pollDiecast_`/`trigger_ipqcScanDinhKy_` báo đỏ (Executions) → do file `migration_phase4_step3_ca_hien_tai.sql` (cột `row_seq` + RPC `duc_bulk_update_actuals`) ban đầu chưa chạy trên Supabase — chạy xong hết đỏ.
6. **Quan trọng**: `clasp push` cập nhật ngay lập tức mọi **trigger chạy theo thời gian** (`ScriptApp.newTrigger`, không gắn với deployment cụ thể) — khác với Web App URL (mỗi deployment có source cố định riêng). Nghĩa là từ lúc push, các trigger nền ĐÃ chạy code mới dù chưa đổi deployment production — may mắn là các trigger này (poll Diecast, IPQC scan định kỳ) chỉ đọc/ghi Supabase, không đụng lại Sheet gốc, nên không làm hỏng dữ liệu Sheet đang phục vụ production thật.

Checklist deploy dưới đây (mục cũ) coi như bước 1/3/4 đã xong; giữ lại để tham khảo lịch sử.

### Checklist deploy/test (việc của user, trước khi AI làm tiếp)

**1. Chuyển công đoạn (Phase 3)** — cần scriptId (chưa có `.clasp.json`):
   - Chạy `supabase/migration_phase3_chuyencongdoan.sql` trong Supabase SQL Editor.
   - Lấy `scriptId` từ Apps Script Editor của Web App "Chuyển công đoạn" → `clasp clone <scriptId>`.
   - Set `SUPABASE_SERVICE_ROLE_KEY` vào Script Properties.
   - `clasp push`, deploy, test quét QR thật + luồng xác nhận (sheet "Theo dõi chuyển công đoạn" — set Script Properties ở CẢ project này nữa, đây là 2 project riêng).

**2. In tem (Phase 4 bước con 2)** — Dashboard Đúc/Intem QR đã có `.clasp.json` sẵn:
   - Chạy `supabase/migration_phase4_step2_intem.sql`.
   - Set `SUPABASE_SERVICE_ROLE_KEY` vào Script Properties của project **Intem QR**.
   - `cd "D:\Project\MES\Intem QR" && clasp push`, deploy, test in tem/tra cứu/in lại/sửa/xoá.

**3. Đúc bước con 1 (Shot_Khuon/Shot_May/TangCa_Log/Van_De_Khuon)** — cùng project Dashboard Đúc:
   - Set `SUPABASE_SERVICE_ROLE_KEY` vào Script Properties của project **Dashboard Đúc** (dùng chung cho bước con 1 + 3).
   - `cd "D:\Project\MES\Dashboard Đúc" && clasp push` (sẽ đẩy luôn cả bước con 3 vì cùng project — không tách được).

**4. Đúc bước con 3 (khối Ca_hien_tai)** — RỦI RO CAO NHẤT, cần cẩn thận:
   - Chạy `supabase/migration_phase4_step3_ca_hien_tai.sql`.
   - Cùng lần `clasp push` ở mục 3 (không tách deploy được vì chung project).
   - **Khuyến nghị**: tạo 1 bản deploy MỚI (Deploy → Manage deployments → New deployment) thay vì ghi đè deployment production đang chạy thật trên xưởng — lấy URL test riêng, tự thao tác thử: lưu kế hoạch, mở/đóng sự cố, đổi SP (cả khuôn kép), tăng ca, kết ca (carry-over sang ca sau), để 1 lúc xem `trigger_pollDiecast_`/`trigger_ipqcScanDinhKy_` có chạy đúng không. Chỉ khi ổn mới trỏ deployment production sang bản mới.
   - Đối chiếu số liệu Supabase (`duc_ca_hien_tai`, `duc_tangca_log`) với kỳ vọng thực tế.

**Việc cần làm ngay tiếp theo (khi quay lại với AI)**: sau khi user deploy/test xong 4 mục trên và xác nhận ổn, tiếp tục bước con 4 (chuỗi IPQC checkpoint đầy đủ: `requestIpqcCheck_`/`submitIpqcCheck_` viết thành RPC transaction) → bước con 5 (`resolveIncident_` RPC) → bước con 6 (`Ncp.js`) → bước con 7 (còn lại) → Phase 5 (NVL). Nếu deploy/test phát hiện lỗi ở phần đã làm, báo lại để sửa trước khi làm tiếp, không nên chồng thêm việc mới lên nền chưa xác nhận đúng.

---

## 12. Giai đoạn bỏ hẳn Google (Apps Script + Drive + Docs) — chuyển sang web tĩnh tại mes.toyotaki.vn

> **Quyết định lớn 2026-08-14**: sau khi so sánh tốc độ, người dùng chọn đi thẳng tới kiến trúc cuối — không chỉ đổi database (mục 1-11 ở trên) mà bỏ hẳn Google Apps Script (cả business logic lẫn giao diện), Google Drive, Google Docs. Chi tiết kế hoạch đầy đủ lưu ở `C:\Users\DELL\.claude\plans\indexed-hugging-candle.md` (máy thực hiện) — mục này là bản tóm tắt + tiến độ để tiếp tục giữa các phiên.

**Quyết định đã chốt**:
- Thêm đăng nhập (Supabase Auth, email/mật khẩu) — bắt buộc vì web tĩnh gọi thẳng Supabase sẽ lộ URL/anon key ra trình duyệt, không có Apps Script làm cổng chặn như trước.
- Báo cáo kết ca: bỏ Google Docs, đổi sang HTML/CSS + xuất PDF bằng tính năng in của trình duyệt.
- Thứ tự module: giữ nguyên (Sản lượng → Chất lượng → Chuyển công đoạn → Đúc+IPQC+In tem → NVL).
- Mỗi module: giữ Apps Script cũ chạy song song vài ngày/tuần sau khi trang tĩnh thay thế test OK, rồi mới tắt hẳn (không cắt ngay).
- DNS `mes.toyotaki.vn`: chưa có quyền — tạm dùng link GitHub Pages mặc định, đổi domain sau.
- Danh sách nhân viên cần tài khoản: chưa cung cấp — làm nền tảng Auth trước bằng tài khoản test, hỏi danh sách thật khi cần tạo tài khoản hàng loạt.

**Tiến độ Giai đoạn 0 (nền tảng dùng chung)**:
- [x] `supabase/migration_phase_D0_foundation.sql` (mới) — tạo Storage bucket `ipqc-evidence`/`report-files` (thay Drive), RLS đọc công khai/ghi cần đăng nhập, bật extension `pg_cron` (thay trigger Apps Script). **Chưa chạy trên Supabase.**
- [x] `shared/supabase-client.js` (mới) — khởi tạo `supabase-js` client dùng chung, `MesAuth.requireAuth()`/`signOut()`/`getCurrentUserEmail()`.
- [x] `shared/login.html` (mới) — trang đăng nhập dùng chung, tự chuyển hướng về `returnTo` sau khi đăng nhập.
- [ ] Chưa thiết kế CSS/layout khung dùng chung (tái dùng phong cách `sanluong.html`/`chatluong.html`).
- [ ] Chưa thiết kế template báo cáo kết ca HTML/CSS thay Google Docs.
- [ ] Chưa cấu hình domain `mes.toyotaki.vn` (chờ DNS).

**✅ Giai đoạn 1 (Sản lượng) — CODE XONG, CHƯA TEST (2026-08-14)**:
- `sanluong-supabase.html` — bỏ khai báo `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`APPS_SCRIPT_URL` riêng, dùng chung `shared/supabase-client.js` (nhúng qua `<script src="shared/supabase-client.js">`, đặt trước bởi CDN `@supabase/supabase-js`). `saveComment()` viết lại: gọi `sb.from('sl_comments').upsert(...)` thẳng, nếu chưa đăng nhập thì lưu tạm nội dung đang gõ vào `localStorage` rồi chuyển sang `shared/login.html` (khôi phục lại khi quay về, không mất nội dung). Thêm chỉ báo đăng nhập góc trên phải (email + nút Đăng xuất, hoặc link Đăng nhập).
- `supabase/migration_phase_D1_sanluong_write.sql` (mới) — RLS cho phép INSERT/UPDATE `sl_comments` khi `auth.role() = 'authenticated'`. **Chưa chạy trên Supabase.**
- **Lưu ý cấu trúc file quan trọng**: `shared/supabase-client.js` dùng đường dẫn tương đối `shared/login.html` (không có `../`) — điều này đúng vì mọi trang module hiện đang nằm phẳng ở gốc repo (không có thư mục con). Nếu sau này tạo trang mới trong thư mục con, phải tự điều chỉnh đường dẫn.
- **Việc cần làm để test**: (1) chạy `migration_phase_D1_sanluong_write.sql`, (2) đăng nhập bằng tài khoản test đã tạo, (3) mở `sanluong-supabase.html`, thử lưu 1 comment, xác nhận thấy trong bảng `sl_comments` trên Supabase.

**Việc cần làm tiếp theo (đang làm dở — 2026-08-14)**:
1. **User cần làm**: chạy `migration_phase_D0_foundation.sql` trong Supabase SQL Editor; tạo 1 tài khoản test qua Supabase Dashboard → Authentication → Users → Add user (email/mật khẩu bất kỳ) để thử đăng nhập.
2. **AI đang làm — Giai đoạn 1 (Sản lượng)**: đích đến là sửa `sanluong-supabase.html` (file đã có sẵn từ trước, đang đọc Supabase nhưng phần ghi comment vẫn gọi `APPS_SCRIPT_URL` cũ) để: (a) thêm `MesAuth.requireAuth()` ở đầu trang hoặc chỉ chặn khi bấm nút lưu comment (cân nhắc UX — có thể KHÔNG bắt đăng nhập để xem, chỉ bắt khi ghi), (b) đổi `saveComment()` từ `fetch(APPS_SCRIPT_URL, ...)` sang gọi thẳng Supabase REST/`supabase-js` lên bảng `sl_comments`, (c) cần thêm RLS policy INSERT/UPDATE cho `sl_comments` (hiện chỉ có policy đọc — xem `supabase/schema_sanluong.sql` dòng 74-81, chưa có policy ghi) — sẽ viết trong 1 file migration mới `migration_phase_D1_sanluong_write.sql`.
3. Sau khi xong Sản lượng, làm tương tự cho Chất lượng (`chatluong-supabase.html`, bảng `cl_comments`), rồi mới sang Chuyển công đoạn/Đúc/NVL theo đúng thứ tự đã chốt.
4. **Lưu ý quan trọng cho các bước ghi RLS sau này**: pattern chuẩn là `for insert/update with check (auth.role() = 'authenticated')` — xem ví dụ đã viết trong `migration_phase_D0_foundation.sql` (phần Storage policies) để theo đúng mẫu.

---

**Việc cần làm ngay tiếp theo (lịch sử, đã gộp vào checklist trên)**:
1. Nhận 3 `scriptId` còn thiếu từ user (mục 11.3) → `clasp clone` → set Script Properties → `clasp push` + deploy bản test cho Phase 3, test quét thật.
2. Chạy `supabase/migration_phase3_chuyencongdoan.sql` trong Supabase SQL Editor (độc lập, không cần chờ scriptId — có thể làm ngay).
3. Trong lúc chờ, có thể tiếp tục soạn code Phase 1 (Sản lượng) một khi xác định được project comment-backend, hoặc bắt đầu Phase 4 bước con đầu tiên (không bị chặn scriptId).
