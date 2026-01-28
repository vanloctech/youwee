# Youwee

<div align="center">
  <img src="../src-tauri/icons/icon.png" alt="Youwee Logo" width="128" height="128">
  
  **一款现代、美观的 YouTube 视频下载器，使用 Tauri 和 React 构建**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
  [![Reddit](https://img.shields.io/badge/Reddit-r%2Fyouwee-FF4500?logo=reddit&logoColor=white)](https://www.reddit.com/r/youwee)
  [![English](https://img.shields.io/badge/lang-English-blue)](../README.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](README.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](README.zh-CN.md)
</div>

---

## 功能特性

- **视频下载** — 支持 YouTube、TikTok、Facebook、Instagram 及 1800+ 网站
- **AI 视频摘要** — 使用 Gemini、OpenAI 或 Ollama 进行视频摘要
- **AI 视频处理** — 使用自然语言编辑视频（剪切、转换、调整大小、提取音频）
- **批量下载与播放列表** — 下载多个视频或整个播放列表
- **音频提取** — 提取 MP3、M4A 或 Opus 格式的音频
- **字幕支持** — 下载或嵌入字幕
- **后处理** — 自动将元数据和缩略图嵌入文件
- **下载库** — 跟踪和管理所有下载
- **6 款精美主题** — Midnight、Aurora、Sunset、Ocean、Forest、Candy
- **快速轻量** — 使用 Tauri 构建，资源占用最小

## 截图

![Youwee](screenshots/youwee-1.png)

<details>
<summary><strong>更多截图</strong></summary>

![Youwee - 媒体库](screenshots/youwee-2.png)
![Youwee - AI 摘要](screenshots/youwee-3.png)
![Youwee - 视频处理](screenshots/youwee-4.png)
![Youwee - 设置](screenshots/youwee-5.png)
![Youwee - 主题](screenshots/youwee-6.png)
![Youwee - 关于](screenshots/youwee-7.png)

</details>


## 安装

### 下载适合您平台的版本

| 平台 | 下载 |
|------|------|
| **Windows** (x64) | [下载 .msi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows.msi) · [下载 .exe](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows-Setup.exe) |
| **macOS** (Apple Silicon) | [下载 .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Apple-Silicon.dmg) |
| **macOS** (Intel) | [下载 .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Intel.dmg) |
| **Linux** (x64) | [下载 .deb](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.deb) · [下载 .AppImage](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.AppImage) |

> 在 [Releases 页面](https://github.com/vanloctech/youwee/releases) 查看所有版本

### 从源码构建

#### 环境要求

- [Bun](https://bun.sh/) (v1.3.5 或更高)
- [Rust](https://www.rust-lang.org/) (v1.70 或更高)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

#### 构建步骤

```bash
# 克隆仓库
git clone https://github.com/vanloctech/youwee.git
cd youwee

# 安装依赖
bun install

# 开发模式运行
bun run tauri dev

# 生产环境构建
bun run tauri build
```

## 技术栈

- **前端**: React 19、TypeScript、Tailwind CSS、shadcn/ui
- **后端**: Rust、Tauri 2.0
- **下载器**: yt-dlp（内置）
- **构建**: Bun、Vite

## 贡献

我们欢迎贡献！以下是参与方式：

### 开始

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

### 提交规范

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更改
- `style:` - 代码风格更改（格式化等）
- `refactor:` - 代码重构
- `test:` - 添加或更新测试
- `chore:` - 维护任务

### 开发提示

- 运行 `bun run tauri dev` 进行热重载开发
- 前端更改立即生效
- Rust 更改需要重新编译（开发模式下自动进行）

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](../LICENSE) 文件。

## 致谢

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - 强大的视频下载器
- [FFmpeg](https://ffmpeg.org/) - 音视频处理多媒体框架
- [Bun](https://bun.sh/) - 用于 YouTube 提取的快速 JavaScript 运行时
- [Tauri](https://tauri.app/) - 构建更小、更快、更安全的桌面应用
- [shadcn/ui](https://ui.shadcn.com/) - 精美的 UI 组件
- [Lucide Icons](https://lucide.dev/) - 精美的开源图标

## 联系方式

- **GitHub**: [@vanloctech](https://github.com/vanloctech)
- **Issues**: [GitHub Issues](https://github.com/vanloctech/youwee/issues)

---

<div align="center">
  Made with ❤️ by 越南
</div>
