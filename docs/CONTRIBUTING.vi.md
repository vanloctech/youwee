# Đóng góp cho Youwee

Chúng tôi hoan nghênh mọi đóng góp! Đây là cách bạn có thể giúp.

## Bắt đầu

1. Fork repository
2. Tạo nhánh tính năng: `git checkout -b feature/tinh-nang-moi`
3. Thực hiện thay đổi
4. Chạy tests và linting:
   ```bash
   bun run lint
   bun run build
   cd src-tauri && cargo check
   ```
5. Commit thay đổi: `git commit -m 'feat: thêm tính năng mới'`
6. Push lên nhánh: `git push origin feature/tinh-nang-moi`
7. Mở Pull Request

## Quy ước Commit

Chúng tôi tuân theo [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - Tính năng mới
- `fix:` - Sửa lỗi
- `docs:` - Thay đổi tài liệu
- `style:` - Thay đổi style code (formatting, v.v.)
- `refactor:` - Tái cấu trúc code
- `test:` - Thêm hoặc cập nhật tests
- `chore:` - Công việc bảo trì

## Mẹo phát triển

- Chạy `bun run tauri dev` để hot-reload khi phát triển
- Thay đổi Frontend phản ánh ngay lập tức
- Thay đổi Rust cần biên dịch lại (tự động ở chế độ dev)

## Code Style

- Sử dụng TypeScript cho code frontend
- Tuân theo các pattern và convention hiện có
- Sử dụng Biome để lint và format
- Giữ component nhỏ và tập trung

## Hướng dẫn Pull Request

- Giữ PR tập trung vào một tính năng hoặc sửa lỗi
- Viết commit message rõ ràng theo quy ước
- Cập nhật tài liệu nếu cần
- Test kỹ các thay đổi trước khi submit
