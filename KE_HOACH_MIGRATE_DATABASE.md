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

**Việc cần làm tiếp theo (thứ tự):**
1. Chạy 5 file `supabase/schema_*.sql` (Sản lượng, Chất lượng, NVL, Chuyển công đoạn, Đúc) trong SQL Editor của Supabase.
2. Set biến môi trường `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, chạy 4 script `supabase/import-*.mjs` (sanluong/chatluong/nvl/chuyencongdoan) để nạp dữ liệu.
3. Với riêng Đúc: tạo Google Cloud service account, bật Sheets API, share 3 file Sheet (KHSX Master/Diecast/DB) cho service account quyền Viewer, rồi chạy `supabase/import-duc.mjs` với thêm biến `GOOGLE_SERVICE_ACCOUNT_KEY_FILE` (hướng dẫn chi tiết ở đầu file script).
4. Mở 5 trang pilot (`sanluong-supabase.html`, `chatluong-supabase.html`, `index-supabase.html`, `chuyencongdoan-supabase.html`, `duc-supabase.html`), đối chiếu số liệu với bản gốc.
5. Push các trang pilot lên repo GitHub tương ứng (`Toyotaki` cho 4 trang trong repo này, `Ton-kho-NVL` cho `index-supabase.html`) để có link công khai chạy song song — **các trang gốc giữ nguyên, không đổi**.
6. Sau khi đối chiếu ổn định (khuyến nghị 1 tuần/module), mới cân nhắc đổi link chính thức trên `index.html` trang chủ trỏ sang bản Supabase, và tắt dần nguồn CSV/GAS cũ.
7. Kiểm tra/sửa giao dịch lỗi 1050 "tấn" của `ADC12-DAK` trong Sheet NVL gốc (không phụ thuộc migrate).
