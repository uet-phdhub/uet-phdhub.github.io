# TÀI LIỆU ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)
## Hệ thống Quản lý Nghiên cứu sinh — UET PhDHub
**Đơn vị sử dụng:** Phòng Công tác sinh viên — Trường Đại học Công nghệ, Đại học Quốc gia Hà Nội (UET-VNU)  
**Cơ sở pháp lý nghiệp vụ:** Quy chế đào tạo tiến sĩ của ĐHQGHN (Quyết định 3638/QĐ-ĐHQGHN và các phiên bản điều chỉnh về sau)  
**Phiên bản tài liệu:** 2.0 (Chốt phạm vi mở rộng Quản trị hệ thống, Phê duyệt điện tử & Tổng hợp thù lao)  

---

## 1. Giới thiệu & Phạm vi Hệ thống

### 1.1. Mục tiêu
Xây dựng hệ thống quản lý tập trung toàn bộ vòng đời Nghiên cứu sinh (NCS) và đội ngũ Nhà khoa học (Cán bộ hướng dẫn, Hội đồng Seminar, Phản biện độc lập, Hội đồng Đánh giá LATS) trên phạm vi toàn Trường Đại học Công nghệ — ĐHQGHN, thay thế quy trình theo dõi rời rạc bằng Excel/email thủ công, đảm bảo:
- **Theo dõi xuyên suốt 58+ trường thông tin vòng đời NCS** từ tuyển sinh đến cấp bằng Tiến sĩ.
- **Tự động hóa tính toán học thuật**: điểm công bố Quy chế 3638, định mức hướng dẫn (Quota), giờ chuẩn hướng dẫn (`1 / 0.5 / 0.3 / 0.5`), đếm ngược thời hạn và cảnh báo sớm.
- **Số hóa quy trình phê duyệt điện tử** (báo cáo tiến độ, gia hạn/bảo lưu, điều chỉnh đề tài/CBHD, đặc cách tăng định mức hướng dẫn).
- **Tổng hợp thù lao & giờ hướng dẫn** phục vụ thanh toán nhanh chóng, chính xác (gắn CCCD, MST TNCN, Số tài khoản, khấu trừ thuế TNCN 10% cho chuyên gia ngoài Trường).
- **Bảo mật tuyệt đối dữ liệu nhạy cảm** (Phản biện độc lập ẩn danh & thông tin tài chính cá nhân) và đầy đủ công cụ quản trị vận hành hệ thống lâu dài.

### 1.2. Hiện trạng & Phân kỳ Phạm vi
- **Giai đoạn 1 (v1 — Đã triển khai trực tuyến tại `https://uet-phdhub.github.io`)**: Hồ sơ NCS 58+ trường, 4 danh sách Cán bộ, bộ tính điểm 3638 & Quota/giờ chuẩn động, bảo mật PBĐL ở tầng API, Import/Export Excel đối soát, kho minh chứng Cloudflare R2/Drive, thông báo & cron nhắc hạn hằng ngày.
- **Giai đoạn 2 (v2 — Phạm vi bổ sung trong tài liệu này)**: Hợp nhất vận hành Quản trị viên/Chuyên viên CTSV với kiến trúc quyền chi tiết; Luồng phê duyệt điện tử; Quản lý Kỳ báo cáo tiến độ; Kiểm tra xung đột lợi ích (COI); Tổng hợp tính toán thù lao & khấu trừ thuế TNCN; Phiên bản hóa Quy chế theo Khóa tuyển sinh; Bộ công cụ Quản trị hệ thống toàn diện (Backup, Audit Diff, Secret Access Log, Email Templates, System Health, Maintenance Mode).

---

## 2. Tác nhân & Mô hình Phân quyền

### 2.1. Các Vai trò Chính thức (Áp dụng ngay)

> **Quyết định tổ chức:** Tạm thời hợp nhất vai trò **Chuyên viên Phòng Công tác sinh viên** vào vai trò **Quản trị viên (`admin`)** để tinh gọn vận hành. Kiến trúc hệ thống vẫn tách quyền ở mức `permission_code` để có thể tách riêng *Chuyên viên thường*, *Chuyên viên phụ trách PBĐL*, *Lãnh đạo Phòng/BGH*, *Kế toán* hoặc *Trợ lý Khoa* ở các giai đoạn sau mà không cần viết lại phần lõi.

| Mã vai trò | Tên vai trò | Đối tượng sử dụng | Phạm vi & Đặc thù |
| --- | --- | --- | --- |
| `admin` | **Quản trị viên (Phòng Công tác sinh viên)** | Chuyên viên & Lãnh đạo Phòng CTSV, Quản trị hệ thống | Toàn quyền quản trị hồ sơ NCS toàn Trường, 4 danh sách Cán bộ, khu vực PBĐL mật, phê duyệt điện tử, tổng hợp thù lao, cấu hình Quy chế/Danh mục/Tài khoản và vận hành hệ thống. |
| `supervisor` | **Giảng viên / CBHD / Thành viên Hội đồng** | Giảng viên trong UET và Chuyên gia ngoài Trường có trong danh mục Cán bộ | Theo dõi NCS hướng dẫn, duyệt báo cáo tiến độ, quản lý công bố cá nhân & thông tin thanh toán của bản thân, gửi đề xuất tăng định mức/điều chỉnh NCS, xem tổng hợp giờ chuẩn & lịch sử tham gia Hội đồng Seminar/LATS. |
| `phd_student` | **Nghiên cứu sinh (NCS)** | NCS đang đào tạo hoặc đã tốt nghiệp có hồ sơ trong hệ thống | Xem hồ sơ & đồng hồ đếm ngược, nộp báo cáo tiến độ định kỳ, khai báo công bố & minh chứng, gửi yêu cầu điện tử (gia hạn, bảo lưu, điều chỉnh đề tài/CBHD) và theo dõi tiến trình duyệt. |

- **Cơ chế kiêm nhiệm (Đa vai trò / 1-click Switcher)**: Tài khoản `admin` có liên kết hồ sơ `scientist_id` được tự động chuyển đổi 1 chạm giữa không gian **Quản trị Phòng CTSV** và **Trang Cán bộ hướng dẫn**.
- **Vai trò dự phòng mở rộng trong kiến trúc (không bắt buộc bật ở v2.0)**: `staff` (chuyên viên tác nghiệp giới hạn theo Khoa/Khóa hoặc tách quyền `ir:manage`), `leader` (chỉ duyệt & xem Dashboard điều hành), `faculty_coordinator` (Trợ lý/Lãnh đạo Khoa chỉ xem NCS thuộc Khoa mình, ẩn PBĐL & tài chính), `accountant` (chỉ xuất bảng kê thanh toán thù lao).

### 2.2. Ma trận Phân quyền (RBAC Matrix)

| Nhóm chức năng | Quản trị viên / Chuyên viên CTSV (`admin`) | Giảng viên / CBHD (`supervisor`) | Nghiên cứu sinh (`phd_student`) |
| --- | :---: | :---: | :---: |
| Dashboard tổng quan & Cảnh báo toàn Trường | Xem / Thao tác | — | — |
| Quản lý hồ sơ NCS (58+ trường) | Tạo / Xem / Sửa / Kết thúc | Xem NCS mình hướng dẫn | Xem hồ sơ bản thân |
| **Khu vực Phản biện độc lập (PBĐL 1–3, hạn, kết quả, tệp mật)** | Toàn quyền (ghi log truy cập) | **Ẩn hoàn toàn ở API** | **Ẩn hoàn toàn ở API** |
| Danh mục Cán bộ (CBHD, Seminar, PBĐL, HĐ LATS) | Toàn quyền | Xem & sửa thông tin cá nhân | Xem CBHD của mình |
| **Thông tin thanh toán (CCCD, MST, STK, Ngân hàng)** | Xem (che ký tự) / Sửa / Xuất bảng kê | Chỉ xem & sửa của bản thân | **Ẩn hoàn toàn ở API** |
| Báo cáo tiến độ định kỳ (`reporting_cycles`) | Mở kỳ / Nhắc / Chốt / Duyệt | **Duyệt báo cáo NCS mình HD** | **Nộp báo cáo theo kỳ** |
| Công bố khoa học Quy chế 3638 | Thêm / **Xác minh (khóa sửa)** / Xóa | Khai báo công bố của bản thân | Khai báo công bố của bản thân |
| **Luồng phê duyệt điện tử** (Gia hạn, Đổi đề tài/CBHD, Tăng Quota) | **Thẩm định & Phê duyệt + Nhập QĐ** | Tạo đề xuất (Quota/NCS) & Xác nhận yêu cầu của NCS | Tạo yêu cầu & Theo dõi trạng thái |
| **Tính toán & Xuất Bảng kê Thù lao / Giờ chuẩn** | Cấu hình đơn giá / Lập kỳ / Xuất thanh toán | Xem giờ chuẩn & lịch sử HĐ cá nhân | — |
| Import / Export Excel & Sinh biểu mẫu Word/PDF | Toàn quyền | Xuất Lý lịch khoa học 5 năm | — |
| **Quản trị Hệ thống** (Quy chế theo Khóa, Danh mục, Tài khoản, Mẫu Email, Audit Log, Backup D1/R2, Bảo trì) | **Toàn quyền** | — | — |

---

## 3. Yêu cầu Chức năng Chi tiết (Functional Requirements)

### FR-01. Quản lý Vòng đời Hồ sơ Nghiên cứu sinh (58+ trường)
1. Lưu trữ đầy đủ 7 phân khu theo yêu cầu gốc của Phòng CTSV:
   - *(1) Hồ sơ & Tuyển sinh*: Mã NCS, Họ tên, Ngày sinh, Email, SĐT, Khoa/Viện, Ngành đào tạo, Khóa/Đợt tuyển sinh, Đơn vị công tác, Đối tượng (từ ĐH / từ ThS / học bổng), CĐV Ngoại ngữ, Ngành tốt nghiệp dự thi, Học bổ sung, Xác minh văn bằng/CC, Ngày nhập học, QĐ công nhận NCS.
   - *(2) Thời hạn & Học phần*: Thời điểm bắt đầu tính TGĐT, Hạn chuẩn, Hạn tối đa (tự tính mặc định theo Khóa & Đối tượng khi tạo mới, cho phép ghi đè), Đếm ngược tự động, CĐR Ngoại ngữ & Hạn xét lại CĐR NN, Tổng tín chỉ & Danh sách học phần tích lũy, Chuyên đề tiến sĩ & TLTQ, Lịch sử thay đổi quá trình đào tạo.
   - *(3) Đề tài & CBHD*: Tên đề tài LATS, QĐ giao đề tài & CBHD, Công tác trợ giảng/sinh hoạt chuyên môn, Phân công CBHD theo 4 vai trò (Độc lập, Chính, Phụ, Đồng HD).
   - *(4) Tiến độ & Công bố 3638*: Tiến độ theo kỳ, Báo cáo tiến độ định kỳ, Danh mục bài báo/đề tài NCKH tự chấm điểm 3638 & trạng thái xác minh.
   - *(5) Seminar & Hội đồng LATS*: Số QĐ & Ngày Seminar tổng thể/cấp cơ sở, Kết quả đánh giá, Thành viên HĐ Seminar, QĐ điều chỉnh tên đề tài & Tên đề tài mới, Số QĐ & Ngày thành lập HĐ Đánh giá LATS, Thành viên HĐ LATS, Ngày bảo vệ, Ngày nộp lại theo quyết nghị HĐ, Minh chứng hoàn thiện hồ sơ, Ngày nộp hồ sơ cuối, Thẩm định & Kết quả thẩm định.
   - *(6) Phản biện độc lập (Mật)*: PBĐL 1/2/3 (chọn từ kho Cán bộ hoặc nhập tay) + Ngày gửi, Hạn nộp nhận xét PBĐL (có đếm ngược mật), Thông tin PBĐL từ chối, Kết quả & Ghi chú nội bộ PBĐL.
   - *(7) Cấp bằng & Kho minh chứng*: Số hiệu bằng, Số vào sổ, Số QĐ công nhận học vị & cấp bằng, Ngày ký, Năm tốt nghiệp, Ngày NCS nhận bằng, Đánh dấu `KẾT THÚC` (tự giải phóng Quota CBHD), Kho tệp PDF/Word/Ảnh (R2) và link Google Drive (hỗ trợ gắn cờ `Mật`).
2. Hỗ trợ lọc đa tiêu chí gọn (Popover Filter: Khoa/Viện, Ngành, Khóa, Tình trạng, Công bố 3638, Mốc hạn, Ẩn/Hiện đã kết thúc), sắp xếp cột, ẩn/hiện cột, xem nhanh Slide-over Drawer và khóa lạc quan `revision` chống ghi đè đồng thời.

### FR-02. Quản lý Kho Cán bộ & 4 Danh sách Chuyên biệt
1. Một hồ sơ nhà khoa học duy nhất (`scientists`) gắn cờ tham gia 1 hoặc nhiều trong 4 danh sách: **CBHD**, **HĐ Seminar tổng thể**, **Phản biện độc lập (Mật)**, **HĐ Đánh giá LATS**.
2. Lưu đầy đủ: Họ tên, Học hàm (`GS`, `PGS`), Học vị (`TSKH`, `TS`, `ThS`), Năm công nhận, Chuyên ngành, Đơn vị công tác (trong UET / ngoài Trường), Email, SĐT, Số tài khoản, Ngân hàng, Số CCCD, Mã số thuế TNCN.
3. Quản lý danh mục công bố khoa học của từng Cán bộ để tự tính điểm năng lực nghiên cứu trong cửa sổ 5 năm (theo Quy chế 3638) và đánh giá tự động điều kiện tham gia từng danh sách (CBHD / Seminar / PBĐL / HĐ LATS).
4. **Hỗ trợ nhập nhanh công bố từ DOI** *(v2)*: nhập mã DOI → tự tra cứu metadata (Tên bài, Tạp chí, Năm, Tác giả) từ Crossref/OpenAlex để giảm lỗi nhập liệu cho CBHD và CTSV.

### FR-03. Bộ Tính toán Quy chế 3638, Phiên bản Quy chế & Quota / Giờ chuẩn
1. **Phiên bản Quy chế theo Khóa (`regulation_versions` — v2)**:
   - Quản trị viên tạo/nhân bản nhiều phiên bản Quy chế (VD: `3638/QĐ-ĐHQGHN`, quy chế sửa đổi năm 2027...) với ngày hiệu lực và gắn vào từng **Khóa tuyển sinh (`cohorts`)**.
   - Các khóa cũ vẫn được đánh giá đúng theo Quy chế tại thời điểm trúng tuyển, không bị sai lệch khi ĐHQGHN ban hành quy chế mới.
   - Hỗ trợ **Xem trước tác động (What-if Preview)** trước khi lưu thay đổi ngưỡng điểm.
2. **Đánh giá công bố 3638**:
   - NCS: tự tính tổng điểm, điểm tác giả chính, số bài WoS/Scopus (mặc định đạt khi ≥ 2.0 điểm & ≥ 1 bài WoS/Scopus; chỉ tính bài đã xác minh hoặc hiển thị tách biệt *Tổng khai báo* / *Đã xác minh*).
   - Cán bộ: tự tính điểm trong cửa sổ 5 năm gần nhất, so sánh ngưỡng chuẩn CBHD / Seminar / PBĐL / HĐ LATS, và **tự nhận diện năng lực nghiên cứu xuất sắc** (tác giả chính ≥ 3 bài WoS/Scopus/năm liên tục 3 năm).
3. **Tính Quota & Giờ chuẩn hướng dẫn**:
   - Trần chuẩn: GS = `7`, PGS/TSKH = `5`, TS = `3` NCS (chỉ tính trên NCS đang học, chưa `KẾT THÚC`).
   - Hệ số quy đổi: Độc lập = `1.0`, Chính = `0.5`, Phụ = `0.3`, Đồng HD = `0.5`.
   - Giờ chuẩn = `Tổng hệ số quy đổi × Định mức giờ chuẩn/1.0 đơn vị` (mặc định `50 giờ`, cấu hình được).
   - Nhận diện tự động CBHD đủ điều kiện trình GĐ ĐHQGHN tăng trần định mức (xuất sắc 3 năm liên tiếp hoặc chủ trì đề tài lớn cấp học bổng NCS).

### FR-04. Luồng Phê duyệt Điện tử (Electronic Approval Workflows — v2)
Hệ thống hỗ trợ vòng đời yêu cầu điện tử có trạng thái rõ ràng (`draft` → `submitted` → `supervisor_approved` → `approved` / `rejected` / `needs_revision`), lưu đầy đủ dấu thời gian, người duyệt, nhận xét và minh chứng đính kèm:

| Loại yêu cầu | Người khởi tạo | Bước xác nhận chuyên môn | Bước phê duyệt & Tác động tự động (`admin`) |
| --- | --- | --- | --- |
| **1. Gia hạn / Bảo lưu / Thôi học** | NCS hoặc Quản trị viên | CBHD xác nhận (đồng ý / yêu cầu sửa) | Quản trị viên kiểm tra quỹ thời gian `max_deadline`, nhập Số QĐ & ngày hạn mới → duyệt → **tự cập nhật `standard_deadline`, `study_status` và thêm dòng vào `training_changes`**. |
| **2. Điều chỉnh tên đề tài / Thay đổi CBHD** | NCS hoặc CBHD | CBHD hiện tại xác nhận (nếu NCS tạo) | Hệ thống **tự kiểm tra Quota CBHD mới**; Quản trị viên nhập Số QĐ → duyệt → **tự cập nhật tên đề tài / bảng `phd_supervisions` và `training_changes`**. |
| **3. Đề nghị tăng định mức Quota CBHD** | CBHD (khi đủ điều kiện xuất sắc / đề tài học bổng) | — | Quản trị viên thẩm tra minh chứng, trình GĐ ĐHQGHN; khi có QĐ nhập Số QĐ & trần mới → duyệt → **tự bật `special_quota_approved` & `special_quota_limit`**. |
| **4. Báo cáo tiến độ theo đợt (`reporting_cycles`)** | Quản trị viên mở kỳ; NCS nộp báo cáo | **CBHD duyệt / yêu cầu bổ sung** trên danh sách tập trung | Quản trị viên theo dõi tỷ lệ hoàn thành theo Khoa/Khóa, gửi nhắc hàng loạt nhóm chưa nộp hoặc CBHD chưa duyệt, chốt kỳ báo cáo. |
| **5. Xác minh công bố khoa học 3638** | NCS hoặc CBHD khai báo + gắn DOI/PDF | — | Quản trị viên đối chiếu minh chứng và bấm **Xác minh** → khóa bài báo không cho NCS/CBHD tự sửa xóa; chỉ Quản trị viên mới có quyền mở khóa. |

### FR-05. Kiểm tra Xung đột lợi ích (COI) & Chuẩn Hội đồng (v2)
Khi Quản trị viên lập **HĐ Seminar**, chọn **PBĐL 1–3**, hoặc lập **HĐ Đánh giá LATS**:
1. **Cảnh báo / Chặn xung đột lợi ích (COI)**:
   - Chặn chọn chính CBHD của NCS làm Phản biện độc lập hoặc làm Phản biện/Chủ tịch trong HĐ Đánh giá LATS (trái Quy chế).
   - Cảnh báo nếu chuyên gia đã từng nằm trong mục *PBĐL từ chối* của hồ sơ này.
   - Cảnh báo nếu chuyên gia là đồng tác giả công bố khoa học gần đây với NCS/CBHD (nếu có dữ liệu tên tác giả trùng khớp).
2. **Kiểm tra điều kiện 3638 & cơ cấu Hội đồng**:
   - Hiển thị trực tiếp trên danh sách chọn: điểm 3638 (5 năm), trạng thái `Đạt` / `Thiếu`, đơn vị `Trong UET` / `Ngoài Trường`.
   - Kiểm tra tự động quy tắc cơ cấu HĐ Đánh giá LATS (số lượng thành viên, số thành viên ngoài cơ sở đào tạo theo cấu hình Quy chế).

### FR-06. Tính toán & Tổng hợp Thù lao, Thuế TNCN & Giờ hướng dẫn (v2)
1. **Quản trị Bảng đơn giá thù lao (`fee_rates`)**:
   - Cấu hình đơn giá theo năm học / quy chế chi tiêu nội bộ cho từng vai trò:
     - *Hội đồng Seminar tổng thể*: Chủ tịch, Thư ký, Phản biện, Ủy viên.
     - *Phản biện độc lập*: Đơn giá nhận xét 1 luận án.
     - *Hội đồng Đánh giá LATS*: Chủ tịch, Thư ký, Phản biện (1/2/3), Ủy viên.
     - *Quy đổi giờ chuẩn hướng dẫn*: Đơn giá tham chiếu (tùy chọn) & tổng hợp giờ chuẩn `1 / 0.5 / 0.3 / 0.5`.
   - Cấu hình quy tắc **khấu trừ thuế TNCN** (mặc định `10%` áp dụng cho chuyên gia ngoài Trường `is_internal = 0` khi tổng chi trả ≥ ngưỡng cấu hình, VD `2.000.000đ`/lần, có thể tắt/bật hoặc ghi đè từng dòng khi có cam kết miễn khấu trừ mẫu 08/CK-TNCN).
2. **Tạo Đợt thanh toán / Tổng hợp (`payment_batches`)**:
   - Chọn khoảng thời gian (từ ngày – đến ngày / học kỳ / năm học) và loại hoạt động (HĐ Seminar, PBĐL, HĐ Đánh giá LATS, Tổng hợp tất cả).
   - Hệ thống tự tổng hợp từ bảng `phd_committee_members`, `phd_students` (các cột `ir1/ir2/ir3_scientist_id` + `ir_result`), và `phd_supervisions`:
     - Tính tự động: **Số lượt**, **Đơn giá**, **Thành tiền (Tổng thu nhập)**, **Thuế TNCN 10%**, **Thực nhận**.
     - **Bảo mật thanh toán PBĐL**: cho phép tùy chọn *"Ẩn mã & tên NCS đối với dòng PBĐL"* khi xuất bảng kê gửi Phòng Kế hoạch – Tài chính (chỉ ghi `Nhận xét phản biện độc lập LATS — Mã hồ sơ ẩn danh` + số lượt).
   - Cho phép rà soát, đánh dấu trạng thái đợt thanh toán (`draft` → `confirmed` → `paid` kèm mã chứng từ) để **chống chi trả trùng lặp** cho cùng 1 hội đồng/lượt PBĐL ở các đợt sau!
3. **Xuất Bảng kê Thanh toán Excel chuẩn kế toán**:
   - Gồm 2 sheet: *(Sheet 1) Bảng kê chi tiết thanh toán theo Cán bộ* (STT, Họ tên, Học hàm/HV, Đơn vị công tác, Trong/Ngoài UET, Nội dung chi, Số lượt, Đơn giá, Thành tiền, Thuế TNCN, Thực nhận, Số CCCD, Mã số thuế TNCN, Số tài khoản, Ngân hàng) và *(Sheet 2) Bảng tổng hợp Giờ chuẩn hướng dẫn CBHD*.

### FR-07. Bảo mật Khu vực Phản biện Độc lập & Thông tin Tài chính
1. **Bảo mật PBĐL**: Toàn bộ 13 trường PBĐL, cảnh báo hạn PBĐL, tài liệu có `is_confidential = 1` và dòng thanh toán PBĐL bị loại bỏ tuyệt đối ở tầng API đối với `supervisor` và `phd_student`.
2. **Che ký tự dữ liệu tài chính (UI Masking — v2)**: Số CCCD, MST TNCN và Số tài khoản hiển thị dạng che (`********1234`) trên danh sách/drawer; chỉ hiện đầy đủ khi bấm nút **Hiện** hoặc **Sao chép** và tự ghi nhận vào `secret_access_logs`.

### FR-08. Kho Minh chứng, Import/Export Excel & Sinh Biểu mẫu Hành chính
1. **Kho minh chứng**: Tải tệp trực tiếp (PDF, Word, Excel, Ảnh, ZIP ≤ 15MB) lên Cloudflare R2 (`uet-phdhub-documents`) hoặc gắn link Google Drive; stream tệp qua Backend có kiểm tra phiên JWT và quyền mật.
2. **Import/Export Excel**: Import 2 bước (*Xem trước đối soát từng dòng → Xác nhận nhập*), xuất danh sách NCS (chuẩn / kèm PBĐL mật), xuất Quota & Giờ chuẩn, xuất Bảng kê thanh toán.
3. **Sinh biểu mẫu hành chính tự động (`.docx` / `.pdf` — v2)**: Từ hồ sơ NCS/Cán bộ xuất sẵn các mẫu chuẩn UET: *Phiếu kiểm tra điều kiện bảo vệ 3638*, *Dự thảo Tờ trình lập Hội đồng*, *Giấy mời Phản biện độc lập*, *Lý lịch khoa học 5 năm*.

### FR-09. Thông báo, Mẫu Email động & Nhắc hạn Tự động
1. **Quét hạn tự động hằng ngày** (07:05 giờ Việt Nam): hạn đào tạo chuẩn (90/30 ngày), hạn tối đa, hạn xét lại CĐR NN (60 ngày), hạn PBĐL (7 ngày — chỉ gửi nội bộ `admin`), hạn nộp báo cáo tiến độ theo đợt.
2. **Quản trị Mẫu Email (`email_templates` — v2)**: Quản trị viên chỉnh trực tiếp tiêu đề/nội dung mẫu email với biến động (`{{full_name}}`, `{{phd_code}}`, `{{deadline}}`, `{{days_left}}`), gửi email test tới bản thân, và thử gửi lại nhóm email `failed`.
3. **Hàng đợi an toàn hạn mức ngày**: giới hạn `EMAIL_DAILY_SEND_CAP` (250 email/ngày) và `EMAIL_BATCH_SIZE` (25 email/lần), chống trùng lặp bằng `dedupe_key`.

### FR-10. Quản trị Hệ thống (System Administration & Governance — v2)
1. **Quản lý Danh mục gốc (Master Data — Soft Delete)**:
   - CRUD + bật/tắt `active` (không xóa cứng nếu đang có tham chiếu) cho: *Khoa/Viện*, *Ngành TS*, *Khóa/Đợt tuyển sinh (`cohorts`)*, *Danh mục Học phần tiến sĩ chuẩn*, *Bảng đơn giá thù lao (`fee_rates`)*.
2. **Quản lý Tài khoản, Whitelist & Phiên đăng nhập (IAM)**:
   - Thêm/sửa/khóa tài khoản, liên kết `scientist_id` / `phd_student_id`, thiết lập ngày hết hạn `expires_at` cho tài khoản khách ngoài Trường.
   - **Thu hồi phiên tức thì (`token_version`)**: khóa tài khoản hoặc đổi quyền sẽ hủy hiệu lực JWT cũ ngay lập tức.
   - **Nhật ký đăng nhập (`auth_events`)**: thống kê lịch sử đăng nhập thành công / bị từ chối.
3. **Nhật ký Kiểm toán nâng cao & Nhật ký Truy cập Mật**:
   - Lọc Audit Log theo *Người thao tác*, *Hành động*, *Đối tượng*, *Khoảng thời gian*, xem **Diff Trước / Sau** trực quan từ `before_json` / `after_json`, xuất Excel phục vụ thanh tra.
   - Ghi nhận riêng **`secret_access_logs`** cho mọi lượt xem/sao chép/xuất Excel dữ liệu PBĐL và CCCD/MST/STK.
4. **Sao lưu, Khôi phục & Quản trị Kho lưu trữ R2**:
   - Tự động sao lưu snapshot CSDL Cloudflare D1 định kỳ hằng tuần sang bucket R2 sao lưu (`uet-phdhub-backups`, giữ 30–90 ngày) + nút **Tạo bản sao lưu ngay** & **Tải bản sao lưu**.
   - Công cụ thống kê dung lượng R2 và **quét/dọn tệp mồ côi** (object trên R2 không còn bản ghi DB).
5. **Giám sát Sức khỏe Hệ thống & Chế độ Bảo trì**:
   - Bảng trạng thái live: kết nối D1 (độ trễ ms), kết nối R2, hạn mức email hôm nay, lần chạy gần nhất của Cron nhắc hạn & Backup.
   - Công tắc **Chế độ Bảo trì (Maintenance Mode)** kèm thông báo banner toàn hệ thống (chỉ cho phép `admin` thao tác khi đang import dữ liệu lớn hoặc nâng cấp).

---

## 4. Yêu cầu Phi chức năng (Non-Functional Requirements)

| Nhóm | Yêu cầu cụ thể |
| --- | --- |
| **Bảo mật & Phân loại dữ liệu** | HTTPS bắt buộc; Google OAuth xác thực chữ ký `idToken` ở server (`ALLOW_DEV_LOGIN=false` trên production); phân loại 3 mức dữ liệu (Công khai nội bộ / Tài chính cá nhân / Tuyệt mật PBĐL); không công khai trực tiếp URL bucket R2; chống IDOR bằng kiểm tra quyền sở hữu trên mọi API `/:id`. |
| **Tính toàn vẹn & Đồng thời** | Khóa lạc quan (`revision`) chống ghi đè khi nhiều chuyên viên mở cùng hồ sơ; không chi trùng đợt thanh toán thù lao (ràng buộc unique theo `source_type + source_id` đã thanh toán); soft-delete cho danh mục gốc. |
| **Hiệu năng & Tin cậy** | Thời gian phản hồi API đọc danh sách < 800ms (tối ưu `db.batch()` và cache danh mục 5 phút trên Render Singapore kết nối D1 APAC); các tác vụ nặng (Import lớn, Backup D1→R2) xử lý bất đồng bộ qua hàng đợi `background_jobs`; cron GitHub Actions tự đánh thức Render trước khi chạy. |
| **Khả năng sử dụng (UX)** | Tuân thủ chuẩn `uet-academic-ui`: nhận diện xanh UET (`#034ea1`), 1 thanh menu ngang gọn, ít chữ thừa, lọc bằng Popover, bảng dữ liệu TanStack Table v8, Drawer xem nhanh, tìm nhanh `Ctrl+K`, định dạng ngày `DD/MM/YYYY`, responsive tốt trên desktop & laptop 1366px–1920px. |
| **Khả năng mở rộng** | Phân quyền nội bộ theo `permission_code` cho phép kích hoạt vai trò `staff`, `leader`, `faculty_coordinator`, `accountant` về sau chỉ bằng cấu hình bảng `roles` mà không phải thay đổi kiến trúc. |
