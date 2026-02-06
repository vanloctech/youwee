# 贡献指南

我们欢迎贡献！以下是参与方式。

## 开始

1. Fork 仓库
2. 创建功能分支：`git checkout -b feature/新功能`
3. 进行更改
4. 运行测试和代码检查：
   ```bash
   bun run lint
   bun run build
   cd src-tauri && cargo check
   ```
5. 提交更改：`git commit -m 'feat: 添加新功能'`
6. 推送到分支：`git push origin feature/新功能`
7. 创建 Pull Request

## 提交规范

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更改
- `style:` - 代码风格更改（格式化等）
- `refactor:` - 代码重构
- `test:` - 添加或更新测试
- `chore:` - 维护任务

## 开发提示

- 运行 `bun run tauri dev` 进行热重载开发
- 前端更改立即生效
- Rust 更改需要重新编译（开发模式下自动进行）

## 代码风格

- 前端代码使用 TypeScript
- 遵循现有的代码模式和约定
- 使用 Biome 进行代码检查和格式化
- 保持组件小巧专注

## Pull Request 指南

- PR 应专注于单个功能或修复
- 按照规范编写清晰的提交信息
- 如有需要，更新文档
- 提交前彻底测试您的更改
