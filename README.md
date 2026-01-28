# Youwee

<div align="center">
  <img src="src-tauri/icons/icon.png" alt="Youwee Logo" width="128" height="128">
  
  **A modern, beautiful YouTube video downloader built with Tauri and React**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
  [![Reddit](https://img.shields.io/badge/Reddit-r%2Fyouwee-FF4500?logo=reddit&logoColor=white)](https://www.reddit.com/r/youwee)
  [![English](https://img.shields.io/badge/lang-English-blue)](README.md)
  [![Tiếng Việt](https://img.shields.io/badge/lang-Tiếng_Việt-red)](docs/README.vi.md)
  [![简体中文](https://img.shields.io/badge/lang-简体中文-green)](docs/README.zh-CN.md)
</div>

---

## Features

- **Video Downloads** — YouTube, TikTok, Facebook, Instagram, and 1800+ sites
- **AI Video Summary** — Summarize videos with Gemini, OpenAI, or Ollama
- **AI Video Processing** — Edit videos using natural language (cut, convert, resize, extract audio)
- **Batch & Playlist** — Download multiple videos or entire playlists
- **Audio Extraction** — Extract audio in MP3, M4A, or Opus formats
- **Subtitle Support** — Download or embed subtitles
- **Post-Processing** — Auto-embed metadata and thumbnails into files
- **Download Library** — Track and manage all your downloads
- **6 Beautiful Themes** — Midnight, Aurora, Sunset, Ocean, Forest, Candy
- **Fast & Lightweight** — Built with Tauri for minimal resource usage

## Screenshots
![Youwee](docs/screenshots/youwee-1.png)

<details>
<summary><strong>More Screenshots</strong></summary>

![Youwee - Library](docs/screenshots/youwee-2.png)
![Youwee - AI Summary](docs/screenshots/youwee-3.png)
![Youwee - Processing](docs/screenshots/youwee-4.png)
![Youwee - Settings](docs/screenshots/youwee-5.png)
![Youwee - Themes](docs/screenshots/youwee-6.png)
![Youwee - About](docs/screenshots/youwee-7.png)

</details>


## Installation

### Download for your platform

| Platform | Download |
|----------|----------|
| **Windows** (x64) | [Download .msi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows.msi) · [Download .exe](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows-Setup.exe) |
| **macOS** (Apple Silicon) | [Download .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Apple-Silicon.dmg) |
| **macOS** (Intel) | [Download .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Intel.dmg) |
| **Linux** (x64) | [Download .deb](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.deb) · [Download .AppImage](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.AppImage) |

> See all releases on the [Releases page](https://github.com/vanloctech/youwee/releases)

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

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Rust, Tauri 2.0
- **Downloader**: yt-dlp (bundled)
- **Build**: Bun, Vite

## Contributing

We welcome contributions! Here's how you can help:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests and linting:
   ```bash
   bun run lint
   bun run build
   cd src-tauri && cargo check
   ```
5. Commit your changes: `git commit -m 'feat: add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

### Development Tips

- Run `bun run tauri dev` for hot-reloading development
- Frontend changes reflect immediately
- Rust changes require recompilation (automatic in dev mode)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - The powerful video downloader
- [FFmpeg](https://ffmpeg.org/) - Multimedia framework for audio/video processing
- [Bun](https://bun.sh/) - Fast JavaScript runtime for YouTube extraction
- [Tauri](https://tauri.app/) - Build smaller, faster, and more secure desktop apps
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Lucide Icons](https://lucide.dev/) - Beautiful open-source icons

## Contact

- **GitHub**: [@vanloctech](https://github.com/vanloctech)
- **Issues**: [GitHub Issues](https://github.com/vanloctech/youwee/issues)

---

<div align="center">
  Made with ❤️ by VietNam
</div>
