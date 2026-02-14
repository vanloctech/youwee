# Youwee

<div align="center">

  [![English](https://img.shields.io/badge/lang-English-blue)](../README.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](README.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](README.zh-CN.md)
  [![Vote for next language](https://img.shields.io/badge/Vote-下一个语言-orange?logo=github)](https://github.com/vanloctech/youwee/discussions/18)

  <img src="../src-tauri/icons/icon.png" alt="Youwee Logo" width="128" height="128">
  
  **一款现代、美观的 YouTube 视频下载器，使用 Tauri 和 React 构建**

  [![Downloads](https://img.shields.io/github/downloads/vanloctech/youwee/total?label=Downloads)](https://github.com/vanloctech/youwee/releases)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Reddit](https://img.shields.io/badge/Reddit-r%2Fyouwee-FF4500?logo=reddit&logoColor=white)](https://www.reddit.com/r/youwee)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
</div>

---

## 功能特性

- **视频下载** — 支持 YouTube、TikTok、Facebook、Instagram 及 1800+ 网站
- **频道关注** — 关注 YouTube、Bilibili 和优酷频道，接收新视频通知，自动下载，通过系统托盘管理
- **AI 视频摘要** — 使用 Gemini、OpenAI 或 Ollama 进行视频摘要
- **AI 视频处理** — 使用自然语言编辑视频（剪切、转换、调整大小、提取音频）
- **时间范围下载（视频裁剪）** — 通过设置开始/结束时间只下载所需片段
- **批量下载与播放列表** — 下载多个视频或整个播放列表
- **音频提取** — 提取 MP3、M4A 或 Opus 格式的音频
- **字幕支持** — 下载或嵌入字幕
- **后处理** — 自动将元数据、缩略图和字幕（启用时）嵌入输出文件
- **SponsorBlock** — 自动跳过赞助段、片头片尾和自我推广片段，支持移除/标记/自定义模式
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
![Youwee - 下载](screenshots/youwee-8.png)
![Youwee - Universal](screenshots/youwee-9.png)
![Youwee - 元数据](screenshots/youwee-10.png)
![Youwee - 历史记录](screenshots/youwee-11.png)
![Youwee - 频道关注](screenshots/youwee-12.png)
![Youwee - 频道轮询](screenshots/youwee-13.png)
![Youwee - 队列与处理](screenshots/youwee-14.png)
![Youwee - 语言投票](screenshots/youwee-15.png)

</details>

## 演示视频

▶️ [在 YouTube 观看](https://www.youtube.com/watch?v=H7TtVZWxilU)


## 安装

### 下载适合您平台的版本

| 平台 | 下载 |
|------|------|
| **Windows** (x64) | [下载 .msi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows.msi) · [下载 .exe](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows-Setup.exe) |
| **macOS** (Apple Silicon) | [下载 .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Apple-Silicon.dmg) |
| **macOS** (Intel) | [下载 .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Intel.dmg) |
| **Linux** (x64) | [下载 .deb](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.deb) · [下载 .AppImage](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.AppImage) |

> 在 [Releases 页面](https://github.com/vanloctech/youwee/releases) 查看所有版本

> ⚠️ **注意**: 该应用尚未使用 Apple 开发者证书签名。如果 macOS 阻止应用运行，请执行：
> ```bash
> xattr -cr /Applications/Youwee.app
> ```

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

我们欢迎贡献！请查看我们的[贡献指南](CONTRIBUTING.zh-CN.md)了解：

- 开始开发
- 提交规范
- Pull Request 指南

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

## Star History

<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="
      https://api.star-history.com/svg?repos=vanloctech/youwee&type=Date&theme=dark
    "
  />
  <source
    media="(prefers-color-scheme: light)"
    srcset="
      https://api.star-history.com/svg?repos=vanloctech/youwee&type=Date
    "
  />
  <img
    alt="Star History Chart"
    src="https://api.star-history.com/svg?repos=vanloctech/youwee&type=Date"
  />
</picture>

<div align="center">
  Made with ❤️ by 越南
</div>
