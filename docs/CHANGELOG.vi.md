# Nhật ký thay đổi

Tất cả thay đổi đáng chú ý của Youwee sẽ được ghi lại trong file này.

Định dạng dựa trên [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
và dự án tuân theo [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Thêm mới
- **Tải từ xa qua Telegram** - Thêm mục cài đặt Remote Download với điều khiển Telegram bằng long polling, nhập chat ID được phép dạng tag, popup hướng dẫn lệnh, hỗ trợ `/add`, `/download`, `/status`, `/queue`, `/stop`, `/help`, cùng cú pháp chất lượng ngắn như `720`, `audio`, và `mp3`

### Thay đổi
- **Chọn định dạng YouTube** - Đổi codec video mặc định của YouTube sang Auto để lượt tải mới không còn ép chọn riêng H.264 và đồng nhất hơn với Universal khi video không có stream AVC phù hợp

## [0.15.1] - 2026-05-27

### Thay đổi
- **Cải tiến UI và UX** - Hoàn thiện giao diện và trải nghiệm trên AI Features, metadata, phần cài đặt plugin, dialog guide, và hệ thống thông báo dùng chung để trải nghiệm Youwee đồng nhất hơn
- **Hỗ trợ Plugin SDK v2.0.0** - Nâng cấp phần plugin lên `youwee-sdk` `v2.0.0`, gồm permission `read/write/AI` chặt chẽ hơn và hỗ trợ workspace plugin ưu tiên TypeScript

## [0.14.1] - 2026-05-24

### Thay đổi
- **Luồng hướng dẫn plugin và cấp quyền** - Tinh chỉnh luồng import plugin, duyệt quyền, hướng dẫn workspace, và giao diện cấu hình để việc cài plugin, gán workflow, và đọc guide trong Settings rõ ràng hơn
- **Tăng độ linh hoạt cho plugin author** - Cập nhật tích hợp workspace và SDK để hỗ trợ icon Lucide linh hoạt hơn và luồng test Deno gọn hơn cho người viết plugin

### Sửa lỗi
- **Log runtime plugin và tóm tắt output** - Giảm log plugin bị lặp, bỏ lưu raw protocol output của kết quả plugin, và hiển thị rõ hơn các đường dẫn file đầu ra sẽ được dùng cho step tiếp theo trong log post-processing
- **Hiển thị guide plugin và tài liệu đa ngôn ngữ** - Sửa lỗi dialog guide bị tràn nội dung và giữ lại các file `README.<locale>.md` cho plugin đã cài
- **Hoàn thiện giao diện cấu hình plugin** - Cải thiện control multi-select, thời điểm hiển thị validation, và các prompt khi import/bật plugin để đồng bộ hơn với giao diện chung của ứng dụng

## [0.14.0] - 2026-05-24

### Thêm mới
- **Tag và bộ sưu tập cho Thư viện** - Thêm tag tự do và bộ sưu tập ảo cho các mục trong Thư viện, bao gồm gán ngay trên từng item, filter nhanh bằng chip, quản lý bộ sưu tập và lọc nâng cao theo tag hoặc bộ sưu tập
- **Hệ thống plugin có ký và luồng SDK** - Thêm plugin `.ywp` có chữ ký với luồng attach/debug workspace, field cấu hình có kiểu dữ liệu rõ ràng, hướng dẫn plugin đa ngôn ngữ, duyệt quyền, gán vào workflow, xem log, và hỗ trợ đóng gói/ký bằng `youwee-sdk`

### Thay đổi
- **Đồng bộ ô nhập URL của Gallery** - Cập nhật ô nhập Gallery để bám sát hơn luồng single/multiple của YouTube, gồm style nút Add, layout batch, hint URL và wording đa ngôn ngữ

### Sửa lỗi
- **Crash khởi động trên Arch Linux với GBM EGL display** - Thêm fallback cho WebKitGTK trên Linux, mặc định tắt GBM renderer để tránh app bị abort khi khởi động trên một số hệ Arch-based

## [0.13.3] - 2026-05-14

### Thêm mới

### Thay đổi

### Sửa lỗi
- **Vòng lặp tải video ở kênh đã theo dõi** - Sửa regression từ tính năng phân trang khiến kênh đã theo dõi có thể bị kẹt trong trạng thái tải liên tục và không lấy danh sách video ổn định
- **Race condition ở progress khi tải kênh** - Progress duyệt kênh giờ bỏ qua event cũ từ request trước khi người dùng đổi kênh hoặc bấm tải lại liên tục
- **Tải thêm làm tăng sai số video mới** - Các video cũ được nạp từ những trang bổ sung của kênh sẽ không còn bị lưu là video mới, tránh sai badge và tray count

## [0.13.2] - 2026-05-10

### Thêm mới
- **Phân trang video kênh với Tải thêm** - Trang Kênh giờ tải mặc định 100 video đầu tiên và cho phép tải thêm theo từng đợt trong cả màn hình duyệt và màn hình chi tiết
- **Hỗ trợ tiếng Thái** - Bổ sung bản địa hóa đầy đủ tiếng Thái cho toàn bộ ứng dụng, bao gồm màn hình giao diện, cài đặt, công cụ phụ đề, luồng tải xuống và bộ chọn ngôn ngữ
- **Hỗ trợ tiếng Ả Rập** - Bổ sung bản địa hóa đầy đủ tiếng Ả Rập cho toàn bộ ứng dụng, bao gồm màn hình giao diện, cài đặt, công cụ phụ đề, luồng tải xuống, đồng thời thêm xử lý hướng chữ RTL

### Thay đổi

### Sửa lỗi
- **Giới hạn duyệt kênh ở 50 video** - Sửa lỗi duyệt kênh và playlist bị dừng sai ở 50 video dù vẫn còn thêm video
- **Phân loại sai dialog lỗi cookie** - Sửa lỗi yêu cầu cookie đăng nhập mới bị hiển thị nhầm như lỗi khóa DB cookie của trình duyệt; giờ app tách riêng dialog cho lỗi DB lock và lỗi cần cookie xác thực

## [0.13.1] - 2026-04-26

### Thêm mới
- **Nhà cung cấp AI LM Studio** - Thêm LM Studio làm nhà cung cấp AI nội bộ tương thích OpenAI, có endpoint local tùy chỉnh và không yêu cầu khóa API

### Thay đổi

### Sửa lỗi
- **Hậu xử lý WebM 4K** - Sửa lỗi tải WebM có thể chọn nhầm stream tương thích MP4/H.264 khiến FFmpeg thất bại ở bước post-processing conversion

## [0.13.0] - 2026-04-15

### Thêm mới
- **Trình phát nhạc nổi** - Thêm player âm thanh trong ứng dụng với hàng đợi, điều khiển phát, tốc độ và âm lượng
- **Tích hợp Aria2 làm trình tải ngoài** - Bổ sung hỗ trợ `aria2c` làm external downloader với tham số tùy chỉnh và xử lý lỗi đã bản địa hóa
- **Đổi tên file đã tải từ Queue và Thư viện** - Thêm thao tác đổi tên sau khi tải xong (queue YouTube + Universal và Thư viện), đồng bộ đường dẫn/tên trong DB và giao diện đa ngôn ngữ
- **Bộ lọc nâng cao và sắp xếp trong Thư viện** - Thêm panel Advanced Filters (loại media, khoảng ngày, định dạng, chất lượng), tìm kiếm theo `title + filepath`, và sắp xếp lịch sử có ghi nhớ lựa chọn sort
- **Trang tải Gallery riêng** - Thêm menu `Gallery` mới nằm dưới Universal, có ô nhập URL riêng, import hàng loạt, hàng đợi, chọn thư mục lưu và luồng Start/Stop dành cho các nguồn kiểu gallery chạy bằng `gallery-dl`

### Thay đổi
- **Xử lý queue động khi đang tải** - Worker queue giờ claim item theo thời gian thực, nên video thêm mới sẽ vào cuối hàng đợi và tự tải tiếp mà không cần bấm Start lại

### Sửa lỗi
- **Ổn định test đổi tên lịch sử trên CI** - Serialize các test dùng chung DB in-memory để tránh lỗi flaky `History entry not found` khi `cargo test` chạy song song
## [0.12.0] - 2026-03-04

### Thêm mới
- **Bộ chọn nguồn dependency (yt-dlp/FFmpeg)** - Thêm tùy chọn trong Cài đặt → Phụ thuộc để chọn dùng binary do ứng dụng quản lý hoặc do hệ thống quản lý
- **Xác nhận an toàn khi chuyển sang nguồn hệ thống** - Thêm hộp thoại xác nhận khi đổi yt-dlp/FFmpeg sang nguồn hệ thống để tránh bấm nhầm

### Thay đổi
- **Nhãn nguồn hệ thống theo hệ điều hành** - Nhãn nguồn hệ thống giờ hiển thị theo nền tảng (`Homebrew` trên macOS, `PATH` trên Windows, trình quản lý gói trên Linux)
- **Tự động tạo ghi chú phát hành GitHub trong luồng build** - Bật `generate_release_notes` trong workflow phát hành để bản phát hành có ghi chú tự sinh
- **Tích hợp thanh tiêu đề tùy chỉnh trên Windows** - Thay title bar native của Windows bằng control tùy chỉnh theo theme ứng dụng (vùng kéo cửa sổ, thu nhỏ/phóng to/đóng)

### Sửa lỗi
- **Ghi lịch sử tải xuống trên Windows** - Bắt chính xác đường dẫn file đầu ra cuối cùng trên Windows để bản tải hoàn tất luôn được thêm vào lịch sử Thư viện
- **Phân tích đường dẫn tải lại trên Windows** - Sửa tách thư mục output khi tải lại để xử lý đúng đường dẫn dùng dấu `\`
- **Xử lý output yt-dlp không phải UTF-8 trên Windows** - Thêm fallback decode GBK/ANSI và xử lý `--print-to-file` để vẫn lấy đúng đường dẫn file ở locale không UTF-8
- **Tự động làm mới Thư viện khi tải xong** - Lịch sử Thư viện giờ tự refresh khi trạng thái tải chuyển sang `finished`
- **Tương thích URL Douyin dạng modal** - Chuẩn hóa URL `douyin.com` có `modal_id` về dạng chuẩn `/video/{id}` trong backend yt-dlp và parser deep-link phía frontend

## [0.11.1] - 2026-03-01

### Thêm mới
- **Hỗ trợ tiếng Pháp, Bồ Đào Nha và Nga** - Bản địa hóa đầy đủ Français, Português và Русский cho toàn bộ giao diện, cài đặt, thông báo lỗi và nhãn metadata
- **Bản địa hóa thông báo lỗi backend** - Các thông báo lỗi từ backend (lỗi tải, lỗi mạng, v.v.) giờ được dịch theo ngôn ngữ người dùng đã chọn thay vì luôn hiển thị tiếng Anh

### Thay đổi
- **Tái cấu trúc chuỗi fallback transcript** - Thống nhất logic fallback transcript giữa AI summary và processing để hành vi nhất quán hơn

### Sửa lỗi
- **Fallback transcript cho Douyin và TikTok** - Cải thiện trích xuất transcript cho video Douyin và TikTok trước đây bị thất bại im lặng
- **Lỗi transcript và caption ngắn** - Lỗi transcript giờ được giữ lại để chẩn đoán thay vì bị nuốt im lặng; caption ngắn được chấp nhận là transcript hợp lệ thay vì bị từ chối
- **Cài đặt mặc định TikTok** - Điều chỉnh cài đặt tải mặc định của TikTok cho phù hợp với quy ước nền tảng

## [0.11.0] - 2026-02-20

### Thêm mới
- **Browser Extension tải nhanh (Chromium + Firefox)** - Giờ đây bạn có thể gửi trang video đang mở từ trình duyệt sang Youwee và chọn `Download now` hoặc `Add to queue`
- **Thiết lập Extension trong Cài đặt** - Thêm mục mới Cài đặt → Extension với nút tải trực tiếp và hướng dẫn cài đơn giản cho Chromium và Firefox

### Thay đổi
- **Làm mới UI/UX cho trang YouTube và Universal** - Tối giản thao tác nhập link, card preview, hàng đợi và phần title bar để giao diện gọn và đồng nhất hơn

### Sửa lỗi
- **Đồng bộ resolve dependency giữa các tính năng** - Chuẩn hóa luồng chọn yt-dlp/FFmpeg trong download, metadata, channels và polling nền để luôn tôn trọng nguồn đã chọn
- **Chế độ system fail rõ ràng khi thiếu binary** - Khi chọn nguồn hệ thống mà thiếu binary, ứng dụng giờ báo lỗi rõ ràng thay vì fallback ngầm

## [0.10.1] - 2026-02-15

### Thêm mới
- **Thiết lập font ASS** - Thêm tùy chỉnh font và cỡ chữ phụ đề cho xuất ASS và preview
- **Luồng xuống dòng phụ đề** - Thêm thao tác auto xuống dòng nhanh và hỗ trợ Shift+Enter khi chỉnh nội dung
- **Tự động thử lại có thể cấu hình** - Thêm cài đặt Auto Retry cho tải YouTube và Universal, cho phép đặt số lần thử lại và thời gian chờ để tự phục hồi khi mạng không ổn định hoặc live stream bị ngắt

### Thay đổi

### Sửa lỗi
- **Thông báo lỗi tải xuống rõ hơn** - Cải thiện thông báo lỗi yt-dlp với nguyên nhân cụ thể hơn để hỗ trợ nhận diện lỗi tạm thời và thử lại tự động chính xác hơn

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
