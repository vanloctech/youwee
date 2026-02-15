# Tiện ích mở rộng Youwee (Chromium + Firefox)

Dùng extension để gửi trang hiện tại sang Youwee ngay lập tức, có chọn loại media/chất lượng và cách xử lý queue.

- [English](browser-extension.md)
- [简体中文](browser-extension.zh-CN.md)

## Tính Năng Chính

- **Nút nổi trên các trang được hỗ trợ** (YouTube, TikTok, Facebook, Instagram, X/Twitter, Vimeo, Twitch, Bilibili, Dailymotion, SoundCloud)
- **Popup gửi link trên mọi tab HTTP/HTTPS** (kể cả khi trang không hiện nút nổi)
- **Chọn loại media**: `Video` hoặc `Audio`
- **Chọn chất lượng**:
  - Video: `Best`, `8K`, `4K`, `2K`, `1080p`, `720p`, `480p`, `360p`
  - Audio: `Auto`, `128 kbps`
- **2 hành động trong cùng giao diện**:
  - `Download now`
  - `Add to queue`
- **Điều khiển nút nổi**:
  - Thu gọn thành tab nhỏ
  - Tắt hẳn nút nổi
  - Bật lại trong popup extension
- **Điều hướng thông minh trong app**:
  - URL YouTube -> trang `YouTube`
  - URL khác -> trang `Universal`
- **Chuẩn hóa URL YouTube**: tự bỏ `list`/`index` khi có `v` để tránh add cả playlist ngoài ý muốn
- **Chống trùng queue**: nếu URL đã có, app sẽ focus item cũ thay vì tạo item mới

## Cơ Chế Hoạt Động

1. Extension tạo deep link:
   - `youwee://download?v=1&url=...&target=...&action=...&media=...&quality=...&source=...`
2. Trình duyệt hỏi mở Youwee (lần đầu).
3. Youwee nhận request và:
   - Thêm URL vào queue
   - Chỉ tự tải ngay khi app đang rảnh (`Download now`)
   - Nếu đang bận hoặc chọn `Add to queue` thì giữ ở queue

## Danh Sách Trang Hỗ Trợ Nút Nổi

- `youtube.com`, `youtu.be`, `music.youtube.com`
- `tiktok.com`
- `instagram.com`
- `facebook.com`, `fb.watch`
- `x.com`, `twitter.com`
- `vimeo.com`
- `twitch.tv`, `clips.twitch.tv`
- `bilibili.com`, `b23.tv`
- `dailymotion.com`, `dai.ly`
- `soundcloud.com`

Popup vẫn gửi được trên mọi trang HTTP/HTTPS hợp lệ.

## Tải Gói Cài (Cho Người Dùng)

| Trình duyệt | Tải về |
|-------------|--------|
| **Chromium** (Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc) | [Tải .zip](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Chromium.zip) |
| **Firefox** | [Tải .xpi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Firefox-signed.xpi) |

## Hướng Dẫn Cài Đặt

### Chromium (Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc)

1. Giải nén `Youwee-Extension-Chromium.zip`.
2. Mở `chrome://extensions` (hoặc trang quản lý extension của trình duyệt).
3. Bật `Developer mode`.
4. Bấm `Load unpacked`.
5. Chọn thư mục đã giải nén.

### Firefox

1. Tải `Youwee-Extension-Firefox-signed.xpi`.
2. Kéo thả file `.xpi` vào Firefox (hoặc mở trực tiếp file).
3. Xác nhận cài đặt.

## Điều Kiện Cần Có

- Cần cài ứng dụng desktop Youwee.
- Mở Youwee ít nhất một lần để hệ thống đăng ký giao thức `youwee://`.

## Xử Lý Sự Cố

- **“scheme does not have a registered handler”**
  - Mở Youwee app một lần rồi thử lại.
- **Hộp thoại mở app đóng nhanh / app không mở**
  - Kiểm tra Youwee đã cài đúng vị trí chuẩn và đã đăng ký protocol.
  - Thử gửi lại bằng popup extension.
- **Không thấy nút nổi**
  - Kiểm tra trang có nằm trong allowlist hỗ trợ không.
  - Mở popup extension và bật lại `Floating button`.
- **Vẫn không gửi được**
  - Dùng nút copy URL trong popup và dán thủ công vào Youwee để khoanh vùng lỗi.

## Đóng Gói Cho Development

Chạy ở thư mục root repo:

```bash
bun run ext:build
bun run ext:package
```

Kết quả:

- Thư mục build:
  - `extensions/youwee-webext/dist/chromium`
  - `extensions/youwee-webext/dist/firefox`
- File đóng gói:
  - `extensions/youwee-webext/dist/packages/Youwee-Extension-Chromium.zip`
  - `extensions/youwee-webext/dist/packages/Youwee-Extension-Firefox-unsigned.zip`

File Firefox `.xpi` signed sẽ được tạo trong pipeline release CI.
