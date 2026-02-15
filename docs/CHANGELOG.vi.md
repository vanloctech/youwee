# Nhật ký thay đổi

Tất cả thay đổi đáng chú ý của Youwee sẽ được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Thêm mới

### Thay đổi

### Sửa lỗi

## [0.10.0] - 2026-02-15

### Thêm mới
- **Xưởng phụ đề** - Thêm trang phụ đề tất cả trong một cho SRT/VTT/ASS với chỉnh sửa nội dung, công cụ thời gian, tìm/thay thế, tự sửa lỗi và các tác vụ AI (Whisper, Dịch, Sửa ngữ pháp)
- **Bộ công cụ phụ đề nâng cao** - Bổ sung timeline sóng âm/phổ tần, đồng bộ theo cảnh cắt, QC realtime theo style profile, công cụ tách/gộp, chế độ Dịch 2 cột (gốc/bản dịch), và công cụ batch cho project

### Thay đổi

### Sửa lỗi

## [0.9.4] - 2026-02-14

### Thêm mới
- **Chọn thư mục output cho Processing** - Thêm nút chọn thư mục lưu đầu ra trong khung chat Processing. Mặc định vẫn là thư mục của video chính, và output của AI/quick actions sẽ theo thư mục đã chọn
- **Đính kèm nhiều loại file trong chat AI Processing** - Chat Processing hỗ trợ đính kèm ảnh/video/phụ đề (chọn file + kéo thả), hiển thị preview và metadata phù hợp theo từng loại
- **Lối tắt đề xuất ngôn ngữ trong Cài đặt** - Thêm link nhanh trong Cài đặt → Chung để người dùng bình chọn/đề xuất ngôn ngữ tiếp theo trên GitHub Discussions
- **Kiểm tra cập nhật app từ system tray** - Thêm hành động mới trong tray để kiểm tra cập nhật Youwee trực tiếp

### Thay đổi
- **Sinh lệnh subtitle/merge ổn định hơn** - Luồng tạo lệnh Processing ưu tiên xử lý deterministic cho chèn phụ đề và ghép nhiều video (bao gồm gợi ý thứ tự intro/outro) trước khi fallback sang AI
- **Đổi tên mục kiểm tra kênh trong tray cho rõ nghĩa** - Đổi "Kiểm tra tất cả" thành "Kiểm tra kênh theo dõi ngay" để thể hiện đúng hành vi kiểm tra các kênh đã theo dõi
- **Đơn giản hóa tiêu đề trang** - Bỏ icon phía trước tiêu đề ở các trang Metadata, Processing và AI Summary để giao diện gọn hơn

### Sửa lỗi
- **Lỗi lấy thông tin video khi dùng xác thực/proxy** - Sửa thứ tự tham số yt-dlp để cờ cookie và proxy được chèn trước dấu phân tách URL `--`, tránh lỗi `Failed to fetch video info` trong khi luồng tải video vẫn hoạt động đúng
- **Kênh Stable luôn báo có bản cập nhật** - Sửa logic kiểm tra cập nhật yt-dlp cho stable/nightly để đọc phiên bản thực từ binary đã cài (`--version`) thay vì chỉ dựa vào metadata tồn tại file, giúp hiển thị đúng trạng thái "Đã cập nhật" sau khi cập nhật xong
- **Trạng thái cập nhật Bundled và binary đang dùng không đồng bộ** - Sửa luồng cập nhật bundled để hiển thị phiên bản mới có sẵn trong Settings và ưu tiên dùng binary `app_data/bin/yt-dlp` đã cập nhật khi có, giúp cập nhật bundled có hiệu lực thực tế
- **Làm mới phần thông tin video ở trang Processing** - Thiết kế lại khu vực dưới player theo kiểu YouTube với tiêu đề nổi bật và chip metadata hiện đại, đồng thời bỏ đổi màu hover và shadow ở badge codec để giao diện gọn hơn
- **Dropdown Prompt Templates không tự đóng** - Sửa dropdown Prompt Templates ở Processing để tự đóng khi click ra ngoài hoặc nhấn phím Escape
- **Hiển thị trùng số URL ở Universal** - Sửa badge số lượng URL trong ô nhập Universal bị lặp số (ví dụ `1 1 URL`)

## [0.9.3] - 2026-02-14

### Thêm mới
- **Tải phụ đề trong Metadata** - Thêm nút chuyển đổi phụ đề trong thanh cài đặt Metadata để tải phụ đề (thủ công + tự động tạo) cùng với metadata. Bao gồm popover để chọn ngôn ngữ và định dạng (SRT/VTT/ASS)

### Thay đổi
- **Cải thiện UX nhập thời gian cắt video** - Thay thế ô nhập text thường bằng ô nhập tự động định dạng, tự chèn `:` khi gõ (ví dụ `1030` → `10:30`, `10530` → `1:05:30`). Placeholder thông minh hiển thị `M:SS` hoặc `H:MM:SS` dựa theo độ dài video. Kiểm tra realtime với viền đỏ khi định dạng sai hoặc thời gian bắt đầu >= kết thúc. Hiện tổng thời lượng video khi có

## [0.9.2] - 2026-02-13

### Thêm mới
- **Tải video theo phân đoạn thời gian** - Chỉ tải một đoạn video bằng cách đặt thời gian bắt đầu và kết thúc (ví dụ: 10:30 đến 14:30). Có thể cài đặt cho từng video trên cả hàng đợi YouTube và Universal qua biểu tượng kéo. Sử dụng `--download-sections` của yt-dlp
- **Tự động kiểm tra cập nhật FFmpeg khi khởi động** - Kiểm tra cập nhật FFmpeg giờ chạy tự động khi mở app (cho bản cài đặt tích hợp). Nếu có bản cập nhật, sẽ hiển thị trong Cài đặt > Phụ thuộc mà không cần bấm nút làm mới

## [0.9.1] - 2026-02-13

### Sửa lỗi
- **Ứng dụng crash trên macOS không có Homebrew** - Sửa lỗi crash khi khởi động do thiếu thư viện động `liblzma`. Crate `xz2` giờ dùng static linking, giúp ứng dụng hoàn toàn độc lập không cần Homebrew hay thư viện hệ thống
- **Tự động tải bỏ qua cài đặt người dùng** - Tự động tải kênh giờ áp dụng cài đặt riêng cho mỗi kênh (chế độ Video/Âm thanh, chất lượng, định dạng, codec, bitrate) thay vì dùng giá trị mặc định. Mỗi kênh có cài đặt tải riêng có thể cấu hình trong bảng cài đặt kênh
- **Tăng cường bảo mật** - FFmpeg giờ dùng mảng tham số thay vì parse chuỗi shell, chặn command injection. Thêm validate URL scheme và `--` separator cho mọi lệnh yt-dlp để chặn option injection. Bật Content Security Policy, xóa quyền shell thừa, và thêm `isSafeUrl` cho các link hiển thị
- **Lỗi preview video với container MKV/AVI/FLV/TS** - Phát hiện preview giờ kiểm tra cả container và codec. Video trong container không hỗ trợ (MKV, AVI, FLV, WMV, TS, WebM, OGG) được tự động transcode sang H.264. HEVC trong MP4/MOV không còn bị transcode thừa trên macOS
- **Hẹn giờ tải không hiển thị khi thu nhỏ vào tray** - Thông báo desktop giờ hiển thị khi tải hẹn giờ bắt đầu, dừng hoặc hoàn thành trong khi ứng dụng thu nhỏ vào system tray. Menu tray hiển thị trạng thái hẹn giờ (vd: "YouTube: 23:00"). Hẹn giờ hoạt động trên cả trang YouTube và Universal
- **Thoát từ tray hủy download đang chạy** - Nút "Thoát" trên tray giờ dùng tắt an toàn thay vì kill process, cho phép download đang chạy hoàn tất cleanup và tránh file bị hỏng
- **Cài đặt ẩn Dock bị mất khi khởi động lại (macOS)** - Tùy chọn "Ẩn biểu tượng Dock khi đóng" giờ được đồng bộ với native layer khi khởi động app, không chỉ khi vào trang Cài đặt
- **Hàng đợi Universal hiện skeleton thay vì URL khi đang tải** - Thay thế placeholder skeleton nhấp nháy bằng URL thực tế và badge spinner "Đang tải thông tin...". Khi lấy metadata thất bại, item giờ thoát trạng thái loading thay vì hiện skeleton mãi mãi

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
