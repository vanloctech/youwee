# Plugin Youwee

<div align="center">

  [![English](https://img.shields.io/badge/lang-English-blue)](../PLUGINS.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](PLUGINS.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](PLUGINS.zh-CN.md)

</div>

Youwee hỗ trợ plugin `.ywp` đã ký cho workflow sau khi tải xong. Plugin có thể phản hồi theo sự kiện tải xuống, yêu cầu quyền rõ ràng, cung cấp field cấu hình có kiểu dữ liệu và chạy các tác vụ tùy chỉnh như gửi thông báo, upload file hoặc tích hợp dịch vụ bên thứ ba.

Plugin cũng có thể cung cấp hướng dẫn đa ngôn ngữ, field cấu hình có kiểu dữ liệu rõ ràng, quyền truy cập cần duyệt và các bước workflow theo trigger ngay trong ứng dụng.

## Plugin được hỗ trợ

| Plugin | Chức năng | Trigger | Quyền | Liên kết |
| --- | --- | --- | --- | --- |
| **Notification Webhooks** | Gửi thông báo tải xuống tới Telegram hoặc Discord khi tải xong hoặc thất bại. | `download.completed`, `download.failed` | Truy cập mạng | [Repository](https://github.com/vanloctech/youwee-plugin-notification-webhooks) · [Bản mới nhất](https://github.com/vanloctech/youwee-plugin-notification-webhooks/releases/latest) |
| **Google Drive Upload** | Upload file đã tải xong lên thư mục Google Drive đã cấu hình. | `download.completed` | Truy cập mạng, đọc file đã tải xong từ trigger payload | [Repository](https://github.com/vanloctech/youwee-plugin-gg-drive-upload) · [Bản mới nhất](https://github.com/vanloctech/youwee-plugin-gg-drive-upload/releases/latest) |

## Cài plugin

1. Mở repository plugin hoặc trang bản phát hành mới nhất.
2. Tải gói `.ywp` đã ký và checksum nếu có.
3. Trong Youwee, mở **Settings** -> **Plugins**.
4. Import gói `.ywp`.
5. Kiểm tra quyền được yêu cầu và các field cấu hình trước khi bật plugin trong workflow.

## Tự viết plugin

Developer có thể tạo plugin workspace từ Youwee, attach để debug trực tiếp, rồi build và ký gói cuối cùng bằng `youwee-sdk`.

- Hướng dẫn SDK: [sdk-js/README.md](../sdk-js/README.md)
- Gói SDK: [youwee-sdk](https://www.npmjs.com/package/youwee-sdk)
