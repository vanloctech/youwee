# Nhật ký thay đổi

Tất cả thay đổi đáng chú ý của Youwee sẽ được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Sửa lỗi
- **Ứng dụng crash trên macOS không có Homebrew** - Sửa lỗi crash khi khởi động do thiếu thư viện động `liblzma`. Crate `xz2` giờ dùng static linking, giúp ứng dụng hoàn toàn độc lập không cần Homebrew hay thư viện hệ thống
- **Tự động tải bỏ qua cài đặt người dùng** - Tự động tải kênh giờ áp dụng cài đặt riêng cho mỗi kênh (chế độ Video/Âm thanh, chất lượng, định dạng, codec, bitrate) thay vì dùng giá trị mặc định. Mỗi kênh có cài đặt tải riêng có thể cấu hình trong bảng cài đặt kênh
- **Tăng cường bảo mật** - FFmpeg giờ dùng mảng tham số thay vì parse chuỗi shell, chặn command injection. Thêm validate URL scheme và `--` separator cho mọi lệnh yt-dlp để chặn option injection. Bật Content Security Policy, xóa quyền shell thừa, và thêm `isSafeUrl` cho các link hiển thị
- **Lỗi preview video với container MKV/AVI/FLV/TS** - Phát hiện preview giờ kiểm tra cả container và codec. Video trong container không hỗ trợ (MKV, AVI, FLV, WMV, TS, WebM, OGG) được tự động transcode sang H.264. HEVC trong MP4/MOV không còn bị transcode thừa trên macOS

## [0.9.0] - 2026-02-12

### Thêm mới
- **Theo dõi kênh & Tải tự động** - Theo dõi các kênh YouTube, duyệt video, chọn và tải hàng loạt với đầy đủ tùy chọn chất lượng/codec/định dạng. Polling nền phát hiện video mới với thông báo desktop và badge đếm video mới theo kênh. Panel kênh theo dõi thu gọn được, hỗ trợ thu nhỏ xuống system tray
- **Xác nhận xem trước file lớn** - Ngưỡng kích thước file có thể cấu hình (mặc định 300MB) hiển thị hộp thoại xác nhận trước khi tải video lớn trong trang Xử lý. Điều chỉnh ngưỡng tại Cài đặt → Chung → Xử lý
- **Tìm kiếm cài đặt đa ngôn ngữ** - Tìm kiếm trong cài đặt giờ hoạt động với mọi ngôn ngữ. Tìm bằng tiếng Việt (ví dụ "giao diện") hoặc tiếng Trung đều cho kết quả. Từ khóa tiếng Anh vẫn hoạt động như dự phòng

### Sửa lỗi
- **Trang Xử lý bị trắng màn hình với video 4K VP9/AV1/HEVC (Linux)** - Bộ giải mã AAC của GStreamer gây crash WebKitGTK khi phát video VP9/AV1/HEVC. Preview giờ dùng phương pháp dual-element: video H.264 không âm thanh + file WAV riêng biệt đồng bộ qua JavaScript, hoàn toàn bỏ qua đường dẫn AAC bị lỗi. Nếu phát video vẫn thất bại, tự động chuyển sang ảnh thu nhỏ JPEG tĩnh. Hoạt động trên macOS, Windows và Linux

## [0.8.2] - 2026-02-11

### Thêm mới
- **Ghi chú cập nhật đa ngôn ngữ** - Hộp thoại cập nhật hiển thị ghi chú phát hành theo ngôn ngữ người dùng (Tiếng Anh, Tiếng Việt, Tiếng Trung). CI tự động trích xuất nhật ký thay đổi từ các file CHANGELOG theo ngôn ngữ
- **Tùy chọn chất lượng 8K/4K/2K cho Universal** - Dropdown chất lượng giờ có thêm 8K Ultra HD, 4K Ultra HD và 2K QHD, giống như tab YouTube. Tự động chuyển sang chất lượng cao nhất có sẵn nếu nguồn không hỗ trợ
- **Nút bật/tắt "Phát từ đầu" cho Universal** - Nút mới trong Cài đặt nâng cao để ghi live stream từ đầu thay vì từ thời điểm hiện tại. Sử dụng flag `--live-from-start` của yt-dlp
- **Xem trước video cho Universal** - Tự động hiển thị thumbnail, tiêu đề, thời lượng và kênh khi thêm URL từ TikTok, Bilibili, Facebook, Instagram, Twitter và các trang khác. Thumbnail cũng được lưu vào Thư viện
- **Nhận diện nền tảng thông minh hơn** - Thư viện giờ nhận diện và gắn nhãn chính xác hơn 1800 trang web được yt-dlp hỗ trợ (Bilibili, Dailymotion, SoundCloud, v.v.) thay vì hiển thị "Khác". Thêm tab lọc Bilibili

### Sửa lỗi
- **Trang Xử lý bị treo khi upload video (Linux)** - File video được đọc toàn bộ vào RAM qua `readFile()`, gây tràn bộ nhớ và màn hình trắng. Giờ sử dụng giao thức asset của Tauri để stream video trực tiếp mà không cần tải vào bộ nhớ. Thêm Error Boundary để ngăn màn hình trắng, xử lý lỗi video với thông báo cụ thể theo codec, dọn dẹp blob URL chống rò rỉ bộ nhớ, và nhận dạng MIME type đúng cho các định dạng không phải MP4
- **Thumbnail bị lỗi trong Thư viện** - Sửa thumbnail từ các trang như Bilibili sử dụng URL HTTP. Thumbnail giờ hiển thị biểu tượng thay thế khi không tải được
- **Thư viện không làm mới khi chuyển trang** - Thư viện giờ tự động tải dữ liệu mới nhất khi chuyển đến trang thay vì phải làm mới thủ công
