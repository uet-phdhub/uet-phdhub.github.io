# Hệ thống Quản lý Nghiên cứu sinh (UET PhDHub) — Trường Đại học Công nghệ, ĐHQGHN

Hệ thống quản lý tập trung toàn bộ vòng đời Nghiên cứu sinh (NCS) và đội ngũ Cán bộ/Nhà khoa học cho **Trường Đại học Công nghệ — Đại học Quốc gia Hà Nội (UET-VNU)**, vận hành bởi **Phòng Công tác sinh viên**, kế thừa kiến trúc và hệ thống nhận diện **UET Institutional UI Design System (`#034ea1`)** từ [`fit-uet/fit-uet.github.io`](https://github.com/fit-uet/fit-uet.github.io).

## Phân quyền & Vai trò
- **Quản trị viên Phòng CTSV (`admin`)**: Toàn quyền quản trị, cấu hình bảng điểm & định mức **Quy chế 3638/QĐ-ĐHQGHN**, quản lý danh mục Khoa/Viện, Ngành đào tạo, tài khoản Chuyên viên CTSV, xem Nhật ký kiểm toán.
- **Chuyên viên Phòng Công tác sinh viên (`staff`)**: Quản lý toàn bộ hồ sơ NCS toàn Trường (lọc theo Khoa/Viện, Ngành, Khóa, Trạng thái), 4 danh sách Cán bộ, Import/Export Excel đối soát, lưu trữ minh chứng PDF/Drive, xử lý khu vực **Phản biện độc lập (Mật)** và gửi thông báo/nhắc hạn.
- **Cán bộ hướng dẫn / Chuyên gia (`supervisor`)**: Theo dõi NCS phụ trách, Quota & Giờ hướng dẫn quy đổi (`1 / 0.5 / 0.3 / 0.5`), tự cập nhật Danh mục công bố cá nhân tính điểm chuẩn năng lực nghiên cứu 3638, duyệt báo cáo tiến độ NCS. Hỗ trợ **nút chuyển vai trò 1-click** khi Quản trị viên/Chuyên viên đồng thời là CBHD.
- **Nghiên cứu sinh (`phd_student`)**: Xem hồ sơ, đồng hồ đếm ngược hạn đào tạo chuẩn/tối đa, hạn xét lại CĐR Ngoại ngữ, tự nộp báo cáo tiến độ định kỳ, cập nhật công bố khoa học & tải minh chứng PDF/Drive.
- **Bảo mật dữ liệu nhạy cảm**: Thông tin **Phản biện độc lập (PBĐL 1–3, từ chối, hạn nộp, kết quả, tệp mật)** và thông tin thanh toán cá nhân (**CCCD, MST TNCN, Số tài khoản ngân hàng**) được bảo vệ ở tầng API.

## Tính năng cốt lõi
1. **Hồ sơ vòng đời NCS đầy đủ 58+ trường** chia 7 phân khu rõ ràng: Tuyển sinh & Xác minh văn bằng → Thời hạn đào tạo (đếm lùi) & Học phần/Chuyên đề/TLTQ/Thay đổi → Đề tài & Phân công CBHD → Tiến độ theo kỳ & Công bố 3638 → Seminar tổng thể, Điều chỉnh tên đề tài, Hội đồng đánh giá LATS & Thẩm định → Phản biện độc lập (Mật) → Cấp bằng, Kết thúc & Kho minh chứng PDF/Drive.
2. **Kho hồ sơ Cán bộ thống nhất với 4 danh sách riêng biệt**: *CBHD*, *CB Đánh giá tổng thể (Seminar)*, *CB Phản biện độc lập*, *CB Hội đồng Đánh giá LATS*.
3. **Bộ tính toán Quy chế 3638 & Quota / Giờ chuẩn động**:
   - Cấu hình trực tiếp bảng điểm các loại công trình (WoS/Scopus Q1–Q4, Hội nghị Scopus, Tạp chí HĐGSNN, Sách chuyên khảo, Sáng chế...), ngưỡng đạt NCS & Cán bộ trong 5 năm.
   - Tự động tính Quota hướng dẫn theo học hàm/học vị (**GS: 7**, **PGS/TSKH: 5**, **TS: 3**), nhận diện CBHD có năng lực nghiên cứu xuất sắc (**≥ 3 WoS/Scopus/năm liên tục 3 năm**) hoặc chủ trì đề tài lớn cấp học bổng NCS để trình Giám đốc ĐHQGHN tăng định mức, và tính giờ hướng dẫn theo hệ số **1 / 0.5 / 0.3 / 0.5**.
4. **Import / Export Excel chuẩn**: Import có xem trước & đối soát từng dòng; Export danh sách NCS (chuẩn / kèm PBĐL mật), bảng tổng hợp Quota & Giờ hướng dẫn, và bảng kê thanh toán thù lao (CCCD, MST, STK).
5. **Thông báo & Nhắc hạn tự động**: Hàng đợi email Brevo/Resend an toàn quota ngày + GitHub Actions cron quét hằng ngày lúc 07:05 giờ Việt Nam.

## Chạy cục bộ (Local Development)

Yêu cầu **Node.js 20+** (khuyến nghị Node 22 LTS).

```bash
npm install
cp .env.example .env
npm run dev
```

Mở trình duyệt tại `http://localhost:3000`. Khi khởi động lần đầu ở chế độ local, hệ thống tự khởi tạo CSDL SQLite (`phdhub-uet.db`), seed sẵn danh mục 8 Khoa/Viện, 9 Ngành đào tạo tiến sĩ của UET cùng dữ liệu mẫu và bật **Đăng nhập nhanh (Dev Mode)** cho đầy đủ các vai trò.

## Các lệnh kiểm thử & đóng gói

| Lệnh | Mục đích |
| --- | --- |
| `npm run lint` | Kiểm tra kiểu TypeScript (`tsc --noEmit`) |
| `npm test` | Chạy bộ kiểm thử tự động Quy chế 3638, Quota, Bảo mật PBĐL, Import/Export & Nhắc hạn |
| `npm run build` | Build frontend (`dist/`) và bundle Express server (`dist/server.cjs`) |
| `npm start` | Chạy bản production (`NODE_ENV=production`) |
| `npm run seed` | Khởi tạo / nạp dữ liệu mẫu |

## Triển khai Production (Cloudflare D1 + R2 + Render.com + GitHub Pages)
- **CSDL Cloudflare D1 (APAC)**: `uet-phdhub-db` (`23107947-b363-4a0f-acd0-32359db59884`), đã khởi tạo đầy đủ 15 bảng, 8 Khoa/Viện, 9 Ngành đào tạo và cấu hình mặc định Quy chế 3638.
- **Lưu trữ minh chứng Cloudflare R2 (APAC)**: bucket `uet-phdhub-documents`.
- **Backend API (Render.com — Singapore)**: Dùng Blueprint [`render.yaml`](render.yaml) kết nối trực tiếp Cloudflare D1 REST + R2 S3 API + Brevo/Resend email queue.
- **Frontend (GitHub Pages `<org>.github.io`)**: Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) tự động lint, test, build và deploy mỗi khi push lên `main`.
- **Nhắc hạn hằng ngày**: Workflow [`.github/workflows/daily-reminders.yml`](.github/workflows/daily-reminders.yml) tự đánh thức Render API và gọi `POST /api/cron/process-email-queue` lúc 07:05 giờ Việt Nam.
