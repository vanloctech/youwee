# Youwee

<div align="center">

  [![English](https://img.shields.io/badge/lang-English-blue)](README.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](docs/README.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](docs/README.zh-CN.md)
  ![Français](https://img.shields.io/badge/lang-Français-0055A4)
  ![Русский](https://img.shields.io/badge/lang-Русский-1F5FBF)
  ![العربية](https://img.shields.io/badge/lang-%D8%A7%D9%84%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9-0A8F6A)
  ![ไทย](https://img.shields.io/badge/lang-%E0%B9%84%E0%B8%97%E0%B8%A2-7B1FA2)
  [![Vote for next language](https://img.shields.io/badge/Vote-Next_Language-orange?logo=github)](https://github.com/vanloctech/youwee/discussions/18)

  <img src="src-tauri/icons/icon.png" alt="Youwee Logo" width="128" height="128">
  
  **A modern, beautiful YouTube video downloader built with Tauri and React**

  [![Downloads](https://img.shields.io/github/downloads/vanloctech/youwee/total?label=Downloads)](https://github.com/vanloctech/youwee/releases)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Reddit](https://img.shields.io/badge/Reddit-r%2Fyouwee-FF4500?logo=reddit&logoColor=white)](https://www.reddit.com/r/youwee)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)

<a href="https://www.producthunt.com/products/youwee/reviews/new?utm_source=badge-product_review&utm_medium=badge&utm_source=badge-youwee" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/product_review.svg?product_id=1154224&theme=light" alt="Youwee - A modern YouTube downloader @yt-dlp GUI for cross-platform | Product Hunt" width="250" height="54"></a>
</div>

---

## Features

- **Video Downloads** — YouTube, TikTok, Facebook, Instagram, Bilibili, Youku, and 1800+ sites
- **Browser Extension Bridge** — Chromium + Firefox extension with floating button, media/quality picker, and one-click `Download now` / `Add to queue` send to Youwee app
- **Plugins & Workflow Automation** — Install signed plugins, configure custom fields, assign them to download workflows, and extend Youwee with notifications, uploads, and post-download automations
- **Channel Follow** — Follow YouTube, Bilibili & Youku channels, get notified of new videos, auto-download, and manage from system tray
- **Metadata Fetcher** — Download video info, descriptions, comments, and thumbnails without the video
- **Live Stream Support** — Download live streams with dedicated toggle
- **AI Video Summary** — Summarize videos with Gemini, OpenAI, or Ollama
- **AI Video Processing** — Edit videos using natural language (cut, convert, resize, extract audio)
- **Time Range Download (Cut Video)** — Download only the segment you need by setting start/end time
- **Batch & Playlist** — Download multiple videos or entire playlists
- **Audio Extraction** — Extract audio in MP3, M4A, or Opus formats
- **Subtitle Support** — Download or embed subtitles
- **Subtitle Workshop** — Create, edit, and refine subtitles (SRT/VTT/ASS) with timing tools, find/replace, auto-fix, AI Translate, AI Grammar Fix, and Whisper generation
- **Subtitle Page Core Features** — Waveform/spectrogram timeline, shot-change sync, realtime QC with style profiles, split/merge tools, translator mode (source/target), and batch/project operations
- **Post-Processing** — Auto-embed metadata, thumbnail, and subtitles (when enabled) into output files
- **SponsorBlock** — Automatically skip sponsors, intros, outros, and self-promotions with remove/mark/custom modes
- **Speed Limit** — Control download bandwidth (KB/s, MB/s, GB/s)
- **Download Library** — Track and manage all your downloads
- **6 Beautiful Themes** — Midnight, Aurora, Sunset, Ocean, Forest, Candy
- **Fast & Lightweight** — Built with Tauri for minimal resource usage

## Screenshots
![Youwee](docs/screenshots/youwee-youtube.png)

<details>
<summary><strong>More Screenshots</strong></summary>

![Youwee - Universal](docs/screenshots/youwee-universal.png)
![Youwee - Gallery](docs/screenshots/youwee-gallery.png)
![Youwee - Channels](docs/screenshots/youwee-channels.png)
![Youwee - AI Summary](docs/screenshots/youwee-ai-summary.png)
![Youwee - Processing 1](docs/screenshots/youwee-processing.png)
![Youwee - Processing 2](docs/screenshots/youwee-processing-2.png)
![Youwee - Subtitles](docs/screenshots/youwee-subtitles.png)
![Youwee - Metadata](docs/screenshots/youwee-metadata.png)
![Youwee - Library](docs/screenshots/youwee-library.png)
![Youwee - Logs](docs/screenshots/youwee-logs.png)
![Youwee - Setting - General](docs/screenshots/youwee-setting-general.png)
![Youwee - Setting - Dependencies](docs/screenshots/youwee-setting-dependencies.png)
![Youwee - Setting - Download](docs/screenshots/youwee-setting-download.png)
![Youwee - Setting - AI Features](docs/screenshots/youwee-setting-ai-features.png)
![Youwee - Setting - Network & Auth](docs/screenshots/youwee-setting-network-auth.png)
![Youwee - Setting - Plugin](docs/screenshots/youwee-setting-plugins.png)
![Youwee - Setting - Remote Download](docs/screenshots/youwee-setting-remote-download.png)
![Youwee - Setting - Extension](docs/screenshots/youwee-setting-extension.png)
![Youwee - Setting - About](docs/screenshots/youwee-setting-about.png)
![Youwee - Browser Extension](docs/screenshots/youwee-extension-chrome-firefox.png)

</details>

## Demo Video

▶️ [Watch on YouTube](https://www.youtube.com/watch?v=H7TtVZWxilU)


## Installation

### Download for your platform

> ⚠️ **Note**: The app is not signed with an Apple Developer certificate yet. If macOS blocks the app, open terminal and run:
> ```bash
> xattr -cr /Applications/Youwee.app
> ```

| Platform | Download                                                                                                                                                                                                                                   |
|----------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Windows** (x64) | [Download .msi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows.msi) · [Download .exe](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows-Setup.exe)                                |
| **macOS** (Apple Silicon) | [Download .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Apple-Silicon.dmg)                                                                                                                                |
| **macOS** (Intel) | [Download .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Intel.dmg)                                                                                                                                        |
| **Linux** (x64) | [Download .deb](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.deb) · [Download .AppImage](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.AppImage) (Recommend for auto update) |

> See all releases on the [Releases page](https://github.com/vanloctech/youwee/releases)

### Browser Extension (Chromium + Firefox)

| Browser | Download |
|---------|----------|
| **Chromium** (Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc) | [Download .zip](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Chromium.zip) |
| **Firefox** | [Download .xpi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Extension-Firefox-signed.xpi) |

- One-click send current page to Youwee with `Download now` or `Add to queue`
- Floating button supports `Video/Audio` + quality selection on supported sites
- Popup works on any valid HTTP/HTTPS tab
- Guide: [docs/browser-extension.md](docs/browser-extension.md)

### Plugins

Extend Youwee with signed `.ywp` plugins for post-download workflows such as notifications, uploads, and third-party integrations.

- Recommended plugins and install guide: [PLUGINS.md](PLUGINS.md)
- SDK: [sdk-js/README.md](sdk-js/README.md) · [youwee-sdk](https://www.npmjs.com/package/youwee-sdk)

### Build from Source

#### Prerequisites

- [Bun](https://bun.sh/) (v1.3.5 or later)
- [Rust](https://www.rust-lang.org/) (v1.70 or later)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

#### Steps

```bash
# Clone the repository
git clone https://github.com/vanloctech/youwee.git
cd youwee

# Install dependencies
bun install

# Run in development mode
bun run tauri dev

# Build for production
bun run tauri build
```

## Contributing

We welcome contributions. See [Contributing Guide](CONTRIBUTING.md).

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

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
