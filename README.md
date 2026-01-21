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
- **Multiple Quality Options** - From 360p to 4K Ultra HD
- **Subtitle Support** - Ability to embed subtitles into videos or save them as separate files.
- **Batch Downloading** - Support for downloading multiple videos simultaneously.
- **Expanded Compatibility** - Added support for 1800+ websites powered by yt-dlp.
- **Download Management** - Added Download History and Library sections.
- **8K Resolution Support** - High-quality video downloading now supports up to 8K resolution.
- **Developer Tools** - Added access to yt-dlp logs and execution commands for debugging.
- **Audio Extraction** - Extract audio in MP3, M4A, or Opus formats
- **6 Beautiful Themes** - Midnight, Aurora, Sunset, Ocean, Forest, Candy
- **Dark/Light Mode** - Choose your preferred appearance
- **H.264 Codec** - Maximum compatibility with all players
- **File Size Estimation** - Know the size before downloading
- **Fast & Lightweight** - Built with Tauri for minimal resource usage
- **No External Dependencies** - yt-dlp bundled with the app

## 📸 Screenshots
|                 Download                 |                     Setting                      |
|:----------------------------------------:|:------------------------------------------------:|
| ![Youwee](docs/screenshots/youwee-1.png) | ![Youwee setting](docs/screenshots/youwee-3.png) |


## 🚀 Installation

### Download Pre-built Binaries

Download the latest release for your platform from the [Releases](https://github.com/vanloctech/youwee/releases) page:

| Platform | Architecture | File |
|----------|--------------|------|
| Windows | x86_64 | `.msi` / `.exe` |
| macOS | Apple Silicon (M1/M2/M3) | `.dmg` |
| macOS | Intel | `.dmg` |
| Linux | x86_64 | `.deb` / `.AppImage` |

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

## 🎯 Usage

1. **Add URLs** - Paste YouTube video or playlist URLs
2. **Configure Settings** - Choose quality, format, and output folder
3. **Start Download** - Click the download button and watch the progress

### Supported Formats

| Type | Formats |
|------|---------|
| Video | MP4, MKV, WebM |
| Audio | MP3, M4A (AAC), Opus |

### Quality Options

| Quality | Resolution |
|---------|------------|
| Best | Highest available |
| 4K | 2160p |
| 2K | 1440p |
| 1080p | Full HD |
| 720p | HD |
| 480p | SD |
| 360p | Low |

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

### Project Structure

```
youwee/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Utilities and types
│   └── pages/              # Page components
├── src-tauri/              # Rust backend
│   ├── src/                # Rust source code
│   ├── icons/              # App icons
│   └── bin/                # yt-dlp binaries
├── public/                 # Static assets
└── .github/                # GitHub workflows
```

### Development Tips

- Run `bun run tauri dev` for hot-reloading development
- Frontend changes reflect immediately
- Rust changes require recompilation (automatic in dev mode)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) - The powerful video downloader
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
