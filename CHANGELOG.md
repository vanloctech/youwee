# Changelog

All notable changes to Youwee will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [0.5.0] - 2026-01-27

### Added
- AI Video Processing page - Edit videos using natural language prompts
- Post-processing settings - Embed metadata and thumbnails into downloaded files
- Embed Metadata settings - Add title, artist, description to files (enabled by default)
- Embed Thumbnail settings - Add cover art/thumbnail to files (enabled by default, requires FFmpeg)

### Fixed
- AI error message "AI Features is disabled" no longer shows when download fails (Windows)
- Summarize button now hidden when AI features disabled
- Summarize button hidden on failed download items to prevent confusion
- yt-dlp version now correctly shows updated version after update
- FFmpeg update checker - check for new versions from GitHub releases
- Bun runtime update checker - check for new versions from GitHub releases


## [0.4.1] - 2026-01-24

### Added
- Video Authentication support for age-restricted, private, and members-only videos
- Browser cookie extraction (Chrome, Firefox, Safari, Edge, Brave, Opera, Vivaldi)
- Browser profile detection with display names
- Cookie file support as alternative authentication method
- macOS Full Disk Access guidance for browser cookie access
- Hindi and Portuguese (Brazil) language options for summaries
- Debug logging for Gemini API requests in dev mode

### Changed
- Updated OpenAI models to latest: GPT-5.2, GPT-5.1, GPT-5, GPT-4.1 series
- Gemini API now uses x-goog-api-key header instead of query parameter
- Thinking models (Gemini 2.5, 3) no longer use generationConfig restrictions
- yt-dlp now uses nightly builds for latest features and fixes
- Improved logo clarity in sidebar and about section (128px instead of 64px)
- Error messages now show full details with auth guidance when needed

### Fixed
- Gemini API 429 errors by switching to header-based authentication
- Gemini thinking models returning empty responses
- Age-restricted video errors now guide users to enable authentication
- Video preview and queue items now show actual error messages

## [0.4.0] - 2026-01-24

### Added
- AI-powered video summarization with support for Gemini, OpenAI, and Ollama (local)
- Proxy AI provider for OpenAI-compatible APIs with custom domain (Azure, LiteLLM, OpenRouter)
- Dedicated AI Summary page for quick video summarization without downloading
- Configurable transcript languages with priority order
- Video transcript extraction from YouTube subtitles (including auto-generated)
- Concise summary style option (between Short and Detailed)
- Summarize button in queue items to generate summary without downloading
- YouTube Troubleshooting option for actual player.js version (fixes download issues)
- Re-download with progress tracking in Library
- Copy summary button in Library items

### Changed
- Redesigned download settings with clear Video/Audio toggle for better UX
- Merged App Updates section into About section in Settings for cleaner UI
- macOS app icon now follows Apple guidelines with rounded corners and proper sizing (84.4%)
- Improved About section with modern card layout and quick links
- Re-download now updates existing history entry instead of creating new one

### Fixed
- Re-download quality mapping (480p → 480, 1080p → 1080, etc.)
- Re-download for summary-only entries now uses best quality and user's output path
- FFmpeg check now defaults to false, properly requiring FFmpeg for best/2K+ quality
- Improved Gemini API error handling with detailed error messages
- Fixed transcript extraction to support YouTube auto-generated subtitles
- Added video description as fallback when no subtitles available
- Prevent transcript cross-contamination between videos
- Show full yt-dlp command in logs instead of just args

## [0.3.2] - 2026-01-22

### Added
- FFmpeg warning dialog when selecting 2K/4K/8K/best quality without FFmpeg installed
- SHA256 checksum verification for FFmpeg downloads on all platforms
- Linux ARM64 support for FFmpeg downloads

### Changed
- FFmpeg source for Windows/Linux changed to BtbN/FFmpeg-Builds (more reliable, with checksums)
- FFmpeg source for macOS now uses vanloctech/ffmpeg-macos repository

### Fixed
- macOS Intel FFmpeg download URL (now uses universal binary from ffmpeg-macos repo)

## [0.3.1] - 2025-01-21

### Added
- Bun runtime support for YouTube downloads (fixes 360p-only issue on some systems)

### Fixed
- macOS updater now downloads correct architecture-specific update files

## [0.3.0] - 2025-01-20

### Added
- Download History / Library page with SQLite storage
- Logs page for tracking download activities
- Universal Download page for non-YouTube sources (1000+ sites)
- Gradient progress bar with shimmer effect
- Quality/format badges in download queue
- Per-item download settings in queue

### Changed
- Simplified audio quality options to match YouTube's available bitrates
- Reduced max log entries from 1000 to 500 for performance

### Fixed
- Extract video title from final filepath for accurate logs
- Show actual file size after MP3 conversion
- Use proper FFmpeg postprocessor args for audio bitrate
- Sum video+audio stream sizes for accurate total filesize

## [0.2.1] - 2025-01-15

### Fixed
- Various bug fixes and stability improvements

## [0.2.0] - 2025-01-10

### Added
- Playlist support with batch downloading
- Multiple quality options (8K, 4K, 2K, 1080p, 720p, 480p)
- Multiple format support (MP4, MKV, WebM, MP3, M4A, Opus)
- Subtitle download with language selection
- Concurrent downloads (up to 5 parallel)
- Auto-update with secure signature verification

### Changed
- Improved UI with 6 color themes
- Better error handling and user feedback

## [0.1.0] - 2025-01-01

### Added
- Initial release
- YouTube video download
- Basic quality selection
- Dark/Light mode
- Bundled yt-dlp
