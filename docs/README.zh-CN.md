# Youwee

<div align="center">

  [![English](https://img.shields.io/badge/lang-English-blue)](../README.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](README.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](README.zh-CN.md)
  ![Français](https://img.shields.io/badge/lang-Français-0055A4)
  ![Русский](https://img.shields.io/badge/lang-Русский-1F5FBF)
  ![العربية](https://img.shields.io/badge/lang-%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-0A8F6A)
  ![ไทย](https://img.shields.io/badge/lang-%E0%B9%84%E0%B8%97%E0%B8%A2-7B1FA2)
  ![Português](https://img.shields.io/badge/lang-Português-009C3B)
  [![Vote for next language](https://img.shields.io/badge/Vote-下一个语言-orange?logo=github)](https://github.com/vanloctech/youwee/discussions/18)

  <img src="../src-tauri/icons/icon.png" alt="Youwee Logo" width="128" height="128">
  
  **美观强大的 yt-dlp GUI、视频下载与处理工具 - 免费开源**

  [![Downloads](https://img.shields.io/github/downloads/vanloctech/youwee/total?label=Downloads)](https://github.com/vanloctech/youwee/releases)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Reddit](https://img.shields.io/badge/Reddit-r%2Fyouwee-FF4500?logo=reddit&logoColor=white)](https://www.reddit.com/r/youwee)
  [![Website](https://img.shields.io/badge/Website-youwee.app-0EA5E9)](https://youwee.app)
  [![Discord](https://img.shields.io/badge/Discord-Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/yCrs9hcw)
</div>

---

## 功能特性

- **视频下载** — 支持 YouTube、TikTok、Facebook、Instagram、Bilibili、Youku 及 1800+ 网站
- **浏览器扩展桥接** — Chromium + Firefox 扩展，支持悬浮按钮、媒体/清晰度选择，以及 `Download now` / `Add to queue` 一键发送到 Youwee
- **远程下载** — Youwee 运行时可通过 Telegram 命令远程控制下载
- **插件与工作流自动化** — 安装已签名插件、配置自定义字段、将其加入下载工作流，并用通知、上传或下载后自动化扩展 Youwee
- **频道关注** — 关注 YouTube、Bilibili 和优酷频道，接收新视频通知，自动下载，通过系统托盘管理
- **AI 视频摘要** — 使用 Gemini、OpenAI 或 Ollama 进行视频摘要
- **AI 视频处理** — 使用自然语言编辑视频（剪切、转换、调整大小、提取音频）
- **时间范围下载（视频裁剪）** — 通过设置开始/结束时间只下载所需片段
- **批量下载与播放列表** — 下载多个视频或整个播放列表
- **音频提取** — 提取 MP3、M4A 或 Opus 格式的音频
- **字幕支持** — 下载或嵌入字幕
- **字幕工坊** — 创建、编辑并优化字幕（SRT/VTT/ASS），集成时间轴工具、查找替换、自动修复、AI 翻译、AI 语法修正与 Whisper 生成
- **字幕页面核心能力** — 波形/频谱时间轴、镜头切换同步、基于风格预设的实时质检、拆分合并工具、双栏翻译模式（原文/译文）和批处理/项目操作
- **后处理** — 自动将元数据、缩略图和字幕（启用时）嵌入输出文件
- **SponsorBlock** — 自动跳过赞助段、片头片尾和自我推广片段，支持移除/标记/自定义模式
- **下载库** — 跟踪和管理所有下载
- **6 款精美主题** — Midnight、Aurora、Sunset、Ocean、Forest、Candy
- **快速轻量** — 专为低资源占用而设计

## 截图

![Youwee](screenshots/youwee-youtube.png)

<details>
<summary><strong>更多截图</strong></summary>

![Youwee - Universal](screenshots/youwee-universal.png)
![Youwee - Gallery](screenshots/youwee-gallery.png)
![Youwee - Channels](screenshots/youwee-channels.png)
![Youwee - AI Summary](screenshots/youwee-ai-summary.png)
![Youwee - Processing 1](screenshots/youwee-processing.png)
![Youwee - Processing 2](screenshots/youwee-processing-2.png)
![Youwee - Subtitles](screenshots/youwee-subtitles.png)
![Youwee - Metadata](screenshots/youwee-metadata.png)
![Youwee - Library](screenshots/youwee-library.png)
![Youwee - Logs](screenshots/youwee-logs.png)
![Youwee - Setting - General](screenshots/youwee-setting-general.png)
![Youwee - Setting - Dependencies](screenshots/youwee-setting-dependencies.png)
![Youwee - Setting - Download](screenshots/youwee-setting-download.png)
![Youwee - Setting - AI Features](screenshots/youwee-setting-ai-features.png)
![Youwee - Setting - Network & Auth](screenshots/youwee-setting-network-auth.png)
![Youwee - Setting - Plugin](screenshots/youwee-setting-plugins.png)
![Youwee - Setting - Remote Download](screenshots/youwee-setting-remote-download.png)
![Youwee - Setting - Extension](screenshots/youwee-setting-extension.png)
![Youwee - Setting - About](screenshots/youwee-setting-about.png)
![Youwee - Browser Extension](screenshots/youwee-extension-chrome-firefox.png)

</details>

## 演示视频

▶️ [在 YouTube 观看](https://youtu.be/7eaKOsFAP1s)

## 法律提示

Youwee 是一个本地工具，用于下载和处理用户提供的 URL 中的媒体内容。Youwee 与 YouTube 或任何其他媒体平台均无隶属关系。

请仅将 Youwee 用于你拥有、已获得许可，或依法可以访问和保存的内容。用户应自行负责遵守适用法律、平台条款、版权规则以及所需授权。Youwee 项目及维护者不对应用滥用行为负责。

## 安装

### 下载适合您平台的版本

> ⚠️ **注意**: 该应用尚未使用 Apple 开发者证书签名。如果 macOS 阻止应用运行，请执行：
> ```bash
> xattr -cr /Applications/Youwee.app
> ```

| 平台 | 下载 |
|------|------|
| **Windows** (x64) | [下载 .msi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows.msi) · [下载 .exe](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows-Setup.exe) |
| **macOS** (Apple Silicon) | [下载 .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Apple-Silicon.dmg) |
| **macOS** (Intel) | [下载 .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Intel.dmg) |
| **Linux** (x64) | [下载 .deb](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.deb) · [下载 .AppImage](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.AppImage) |

> 在 [Releases 页面](https://github.com/vanloctech/youwee/releases) 查看所有版本

### 浏览器扩展（Chromium + Firefox）

| 浏览器 | 下载 |
|--------|------|
| **Chromium**（Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc） | [下载 .zip](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Chromium.zip) |
| **Firefox** | [下载 .xpi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Firefox-signed.xpi) |

- 一键将当前标签页发送到 Youwee（`Download now` 或 `Add to queue`）
- 支持站点悬浮按钮可选择 `Video/Audio` 与清晰度
- 弹窗可用于所有有效 HTTP/HTTPS 标签页
- 说明文档：[youwee.app/docs/browser-extension](https://youwee.app/docs/browser-extension)

### 插件

使用已签名的 `.ywp` 插件扩展 Youwee 的下载后工作流，例如通知、上传和第三方集成。

- 插件页面：[Youwee Plugins](https://youwee.app/zh/plugins)
- 推荐插件和安装指南：[PLUGINS.zh-CN.md](PLUGINS.zh-CN.md)
- SDK：[sdk-js/README.md](../sdk-js/README.md) · [youwee-sdk](https://www.npmjs.com/package/youwee-sdk)

### 远程下载

通过 Telegram 命令远程控制 Youwee，例如添加链接、下载、查看队列、状态和停止下载。文档：[youwee.app/docs/remote-download](https://youwee.app/docs/remote-download)

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

## 赞助商

<div align="center">
  <a href="https://www.atlascloud.ai/">
    <img src="sponsors/atlascloud.svg" alt="Atlas Cloud" width="220">
  </a>
</div>

## 贡献

欢迎贡献，详情见[贡献指南](CONTRIBUTING.zh-CN.md)。

## 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](../LICENSE) 文件。

## 联系方式

- **Website**: [youwee.app](https://youwee.app)
- **文档**: [Docs](https://github.com/vanloctech/youwee/blob/develop/docs/README.zh-CN.md)
- **Discord**: [Youwee Community](https://discord.gg/yCrs9hcw)
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
