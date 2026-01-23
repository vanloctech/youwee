# Youwee

<div align="center">
  <img src="src-tauri/icons/icon.png" alt="Youwee Logo" width="128" height="128">
  
  **A modern, beautiful YouTube video downloader built with Tauri and React**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=white)](https://tauri.app/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
</div>

---

## ✨ Features

- **Batch Downloads** - Download multiple videos at once
- **Playlist Support** - Download entire YouTube playlists
- **Multiple Quality Options** - From 360p to 8K Ultra HD
- **Subtitle Support** - Embed subtitles into videos or save as separate files
- **Universal Downloads** - Support for 1800+ websites powered by yt-dlp
- **Download History** - Track all your downloads in the Library
- **Audio Extraction** - Extract audio in MP3, M4A, or Opus formats
- **6 Beautiful Themes** - Midnight, Aurora, Sunset, Ocean, Forest, Candy
- **Dark/Light Mode** - Choose your preferred appearance
- **File Size Estimation** - Know the size before downloading
- **Fast & Lightweight** - Built with Tauri for minimal resource usage
- **Auto-Updates** - Stay up to date with the latest features

## 📸 Screenshots
|                 Download                 |                     Setting                      |
|:----------------------------------------:|:------------------------------------------------:|
| ![Youwee](docs/screenshots/youwee-1.png) | ![Youwee setting](docs/screenshots/youwee-3.png) |


## 🚀 Installation

### Download for your platform

| Platform | Download |
|----------|----------|
| **Windows** (x64) | [Download .msi](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows.msi) · [Download .exe](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Windows-Setup.exe) |
| **macOS** (Apple Silicon) | [Download .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Apple-Silicon.dmg) |
| **macOS** (Intel) | [Download .dmg](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Mac-Intel.dmg) |
| **Linux** (x64) | [Download .deb](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.deb) · [Download .AppImage](https://github.com/vanloctech/youwee/releases/latest/download/Youwee-Linux.AppImage) |

> See all releases on the [Releases page](https://github.com/vanloctech/youwee/releases)

> ⚠️ **Note**: The app is not signed with an Apple Developer certificate yet. If macOS blocks the app, run:
> ```bash
> xattr -cr /Applications/Youwee.app
> ```

### Build from Source

#### Prerequisites

- [Bun](https://bun.sh/) (v1.0 or later)
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

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Rust, Tauri 2.0
- **Downloader**: yt-dlp (bundled)
- **Build**: Bun, Vite

## 🤝 Contributing

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

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - The powerful video downloader
- [FFmpeg](https://ffmpeg.org/) - Multimedia framework for audio/video processing
- [Bun](https://bun.sh/) - Fast JavaScript runtime for YouTube extraction
- [Tauri](https://tauri.app/) - Build smaller, faster, and more secure desktop apps
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Lucide Icons](https://lucide.dev/) - Beautiful open-source icons

## 📬 Contact

- **GitHub**: [@vanloctech](https://github.com/vanloctech)
- **Issues**: [GitHub Issues](https://github.com/vanloctech/youwee/issues)

---

<div align="center">
  Made with ❤️ by VietNam
</div>
