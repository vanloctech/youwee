# Changelog

All notable changes to Youwee will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Browser Extension for one-click download (Chromium + Firefox)** - You can now send the current video page from browser to Youwee and choose `Download now` or `Add to queue`
- **Extension setup in Settings** - Added a new Settings → Extension section with direct download buttons and easy install steps for Chromium and Firefox

### Changed

### Fixed

## [0.10.0] - 2026-02-15

### Added
- **Subtitle Workshop** - Added an all-in-one subtitle page for SRT/VTT/ASS with editing, timing tools, find/replace, auto-fix, and AI actions (Whisper, Translate, Grammar Fix)
- **Advanced subtitle tools** - Added waveform/spectrogram timeline, shot-change sync, realtime QC with style profiles, split/merge tools, translator mode (source/target), and batch project tools

### Changed

### Fixed

## [0.9.4] - 2026-02-14

### Added
- **Processing output folder picker** - Added a selectable output directory in Processing chat. Default stays the main video folder, and generated outputs now honor the selected folder for AI commands and quick actions
- **Multi-file attachments in Processing AI chat** - Processing chat now supports image/video/subtitle attachments (picker + drag/drop) with contextual previews and metadata
- **Language request shortcut in Settings** - Added a quick link in Settings → General for users to vote/request next language support on GitHub Discussions
- **System tray app update action** - Added a new tray menu action to check for Youwee updates directly from tray

### Changed
- **Deterministic subtitle/merge command generation** - Processing command generation now handles subtitle burn-in and multi-video merge (including intro/outro ordering hints) before AI fallback for more reliable results
- **Clearer system tray channel check label** - Renamed "Check All Now" to "Check Followed Channels Now" to better reflect checking followed channels
- **Simplified page headers** - Removed leading title icons from Metadata, Processing, and AI Summary pages for a cleaner look

### Fixed
- **Video info fetch fails with authentication/proxy** - Fixed yt-dlp argument ordering so cookie and proxy flags are inserted before the `--` URL separator, preventing `Failed to fetch video info` errors while keeping downloads working
- **Stable channel update check always shows available** - Fixed yt-dlp stable/nightly update check to read the installed channel binary version (`--version`) instead of file-existence metadata, so "Up to date" is shown correctly after update
- **Bundled update status and binary source mismatch** - Fixed bundled update flow to show latest available version in Settings and prefer the user-updated `app_data/bin/yt-dlp` binary when present, so updating bundled actually takes effect
- **Processing page video info redesign** - Refreshed the section below player with a YouTube-style title + modern metadata chips, and removed hover color shift/shadow on codec badges for cleaner visuals
- **Prompt Templates dropdown close behavior** - Fixed Processing Prompt Templates dropdown to auto-close on outside click and Escape key
- **Duplicate URL count in Universal input** - Fixed the URL count badge showing duplicated number (e.g. `1 1 URL`) in Universal URL input

## [0.9.3] - 2026-02-14

### Added
- **Subtitle download in Metadata** - New subtitle toggle in the Metadata settings bar to download subtitles (manual + auto-generated) alongside metadata. Includes a popover to select languages and format (SRT/VTT/ASS)

### Changed
- **Improved time range input UX** - Replaced plain text inputs with auto-formatting time inputs that insert `:` separators as you type (e.g. `1030` → `10:30`, `10530` → `1:05:30`). Smart placeholder shows `M:SS` or `H:MM:SS` based on video duration. Real-time validation with red border for invalid format or when start >= end. Shows total video duration hint when available

## [0.9.2] - 2026-02-13

### Added
- **Time range download** - Download only a specific portion of a video by setting start and end times (e.g. 10:30 to 14:30). Available per-item on both YouTube and Universal queues via the scissors icon. Uses yt-dlp's `--download-sections` under the hood
- **Auto-check FFmpeg updates on startup** - FFmpeg update check now runs automatically when the app starts (for bundled installs). If an update is available, it shows in Settings > Dependencies without needing to manually click the refresh button

## [0.9.1] - 2026-02-13

### Fixed
- **App crash on macOS without Homebrew** - Fixed startup crash caused by missing `liblzma` dynamic library. The `xz2` crate now uses static linking, making the app fully self-contained without requiring Homebrew or system libraries
- **Auto-download ignores user settings** - Channel auto-download now respects per-channel download preferences (Video/Audio mode, quality, format, codec, bitrate) instead of using hardcoded values. Each channel has its own download settings configurable in the channel settings panel
- **Security hardening** - FFmpeg commands now use structured argument arrays instead of shell string parsing, preventing command injection. Added URL scheme validation and `--` separator for all yt-dlp calls to block option injection. Enabled Content Security Policy, removed overly broad shell permissions, and added `isSafeUrl` validation for rendered links
- **Video preview fails for MKV/AVI/FLV/TS containers** - Preview detection now checks both container format and codec. Videos in unsupported containers (MKV, AVI, FLV, WMV, TS, WebM, OGG) are correctly transcoded to H.264 preview. HEVC in MP4/MOV no longer unnecessarily transcoded on macOS
- **Scheduled downloads not visible in tray mode** - Desktop notifications now fire when a scheduled download starts, stops, or completes while the app is minimized to system tray. Tray menu shows active schedule status (e.g. "YouTube: 23:00"). Schedule works on both YouTube and Universal pages
- **Quit from tray kills active downloads** - Tray "Quit" now uses graceful shutdown instead of force-killing the process, allowing active downloads to finish cleanup and preventing corrupted files
- **Dock icon setting lost on restart (macOS)** - The "Hide Dock icon on close" preference is now synced to the native layer on app startup, not only when visiting the Settings page
- **Universal queue shows skeleton instead of URL while loading** - Replaced pulsing skeleton placeholder with the actual URL text and a "Loading info..." spinner badge. When metadata fetch fails, items now exit loading state gracefully instead of showing skeleton forever

## [0.9.0] - 2026-02-12

### Added
- **Channel Follow & Auto-Download** - Follow YouTube channels, browse their videos, select and batch download with full quality/codec/format controls. Background polling detects new uploads with desktop notifications and per-channel new video badges. Collapsible followed channels panel with system tray close-to-tray support
- **Large file preview confirmation** - Configurable file size threshold (default 300MB) that shows a confirmation dialog before loading large videos in Processing. Threshold adjustable in Settings → General → Processing
- **i18n-aware Settings search** - Settings search now works in all languages. Searching in Vietnamese (e.g. "giao diện") or Chinese returns matching results. English keywords still work as fallback regardless of language

### Fixed
- **Processing page white screen on 4K VP9/AV1/HEVC videos (Linux)** - GStreamer's AAC audio decoder crashes WebKitGTK when playing VP9/AV1/HEVC videos. Preview now uses dual-element approach: silent H.264 video + separate WAV audio synced via JavaScript, completely bypassing the broken AAC path. If video playback still fails, auto-falls back to a static JPEG thumbnail. Works across macOS, Windows, and Linux

## [0.8.2] - 2026-02-11

### Added
- **Multilingual update notes** - Update dialog now shows release notes in user's language (English, Vietnamese, Chinese). CI automatically extracts changelogs from language-specific CHANGELOG files
- **8K/4K/2K quality options for Universal downloads** - Quality dropdown now includes 8K Ultra HD, 4K Ultra HD and 2K QHD options, matching the YouTube tab. Falls back gracefully if the source doesn't have high-res formats
- **Live from start toggle for Universal downloads** - New toggle in Advanced Settings to record live streams from the beginning instead of the current point. Uses yt-dlp's `--live-from-start` flag
- **Video preview for Universal downloads** - Automatically shows thumbnail, title, duration and channel when adding URLs from TikTok, Bilibili, Facebook, Instagram, Twitter and other sites. Thumbnails are also saved to Library history
- **Smarter platform detection** - Library now correctly identifies and tags all 1800+ sites supported by yt-dlp (Bilibili, Dailymotion, SoundCloud, etc.) instead of showing "Other". Added Bilibili as a dedicated filter tab

### Fixed
- **Processing page freezes on video upload (Linux)** - Video files were read entirely into RAM via `readFile()`, causing OOM crashes and white screens. Now uses Tauri's asset protocol to stream videos directly without loading into memory. Also adds error boundary to prevent unrecoverable white screens, video error handling with codec-specific messages, blob URL cleanup to prevent memory leaks, and correct MIME type detection for non-MP4 formats
- **Broken thumbnails in Library** - Fix thumbnails from sites like Bilibili that use HTTP URLs. Thumbnails now gracefully fall back to a placeholder icon if they fail to load
- **Library not refreshing on page switch** - Library now automatically loads latest downloads when navigating to the page instead of requiring a manual refresh

## [0.8.1] - 2026-02-09

### Fixed
- **HTTP 416 error on re-download** - Add `--force-overwrites` flag to prevent "Requested range not satisfiable" errors caused by stale `.part` files from interrupted downloads
- **Settings not applied when adding to queue** - Fix stale closure issue where changing format (Video → Audio) immediately before adding URL would use old settings. Now uses ref to always capture current settings
- **Library source filter not working** - Fix parameter name mismatch between frontend (`sourceFilter`) and backend (`source`) that caused TikTok, Facebook and other platform filters to show all entries instead of filtered results. Also fix search and count queries to respect active filters

## [0.8.0] - 2026-02-09

### Added
- **DPAPI error detection** - Detect Chrome 127+ App-Bound Encryption errors on Windows, show troubleshooting hint to use Firefox or Cookie File mode
- **Image attachment in Processing** - Upload images via attach button or drag & drop, AI generates FFmpeg commands for overlay, watermark, intro/outro, PiP and more
- **Custom Whisper backend** - Configure custom endpoint URL and model for Whisper transcription, compatible with Groq, LocalAI, Faster-Whisper and other OpenAI-compatible APIs
- **SponsorBlock integration** - Auto-skip sponsors, intros, outros and promotions using community data. Three modes: Remove all (cut segments), Mark all (chapter markers), or Custom per-category control
- **Scheduled downloads** - Schedule downloads to start at a specific time with optional stop time. Quick presets (1h, 3h, tonight, tomorrow) or custom time picker. Works on both YouTube and Universal pages

### Changed
- **Processing input layout** - Move prompt templates button into input card, textarea on top with action buttons below
- **yt-dlp channel selector** - Redesigned from segmented toggle to radio cards with descriptions, active badge, and install status for clearer selection

### Fixed
- **8K download gets 4K** - High-res (8K/4K/2K) ignored user's codec setting and always forced VP9. Now respects codec choice and prioritizes AV1 for 8K, VP9 for 4K/2K when set to Auto
- **Download speed not showing** - Fixed regex not capturing speed and ETA from yt-dlp progress output
- **Failed to fetch video info for YouTube** - Add Deno JS runtime to video info, transcript, playlist, and subtitle fetching (same as download)
- **Video title shows Unknown in Library** - Extract title from filepath when yt-dlp doesn't output Destination message
- **Slow yt-dlp version loading** - Eliminated redundant version checks on startup (7 sequential calls → 1), channel info now uses lightweight file-exists check instead of running binaries

## [0.7.1] - 2026-02-06

### Added
- **FFmpeg check before download** - Shows FFmpeg install dialog when starting download with Best/4K/2K quality without FFmpeg installed
- **Failed download hints** - Shows "View Logs page for details" when download fails
- **Troubleshooting tips in Logs** - Auto-detect common errors and show fix suggestions (FFmpeg missing, auth required, rate limit, etc.)
- **Windows cookie error handling** - Auto-detect browser cookie lock errors, show retry dialog with instructions to close browser
- **Windows cookie warning** - Shows warning in Settings → Network when using browser cookie mode on Windows

### Fixed
- **Metadata ignores playlist** - URLs with `?list=` now fetch only single video metadata
- **Windows path handling** - Fixed download folder detection for Windows paths (C:\, D:\)

### Changed
- **Larger default window** - 1100x800 (was 1000x700)
- **Disable reload in production** - Block right-click menu, F5, Ctrl+R

## [0.7.0] - 2026-02-05

### Added
- **Metadata page** - Fetch video info (JSON, description, comments, thumbnail) without downloading video
- **Live stream download support** - Toggle in Settings → Download, shows LIVE badge on queue items
- **Download speed limit** - Limit bandwidth with custom value and unit (KB/s, MB/s, GB/s)

### Fixed
- **ChromeOS compatibility** - Fixed "invalid output path" error, auto-creates Downloads folder

### Changed
- **New Download settings section** - Moved Post-processing, Live Stream, Speed Limit to dedicated section
- **Compact Advanced Settings popover** - Better fit for small screens with scroll support

## [0.6.1] - 2026-02-03

### Added
- **yt-dlp channel selection** - Choose between Bundled, Stable, or Nightly versions in Settings → Dependencies
- **Auto-download yt-dlp Stable** - Automatically downloads latest stable yt-dlp on first launch
- **Fallback to bundled** - Uses bundled yt-dlp when Stable/Nightly not available (no internet, download failed)

### Changed
- **Default channel is now Stable** - App defaults to Stable channel instead of Bundled for latest features and fixes
- **Status indicators** - Shows "Using bundled temporarily..." when falling back, "Downloading yt-dlp..." during auto-download
- **Embed Thumbnail off by default** - Disabled by default since it requires FFmpeg

### Fixed
- **Hidden console windows on Windows** - yt-dlp, FFmpeg, and other background processes no longer spawn visible terminal windows
- **FFmpeg/Deno download with progress** - Shows download percentage and stage (downloading, extracting, verifying) instead of hanging indefinitely
- **Display download error details** - Failed downloads now show error message in the queue item instead of just "Error" status


## [0.6.0] - 2026-02-03

### Changed
- **Replaced Bun with Deno** - Now uses Deno runtime for YouTube JavaScript extraction (required by yt-dlp)
- **Auto-download Deno on first launch** - App automatically downloads Deno if not installed
- **Setup progress dialog** - Shows "Setting Up YouTube Support" popup when downloading Deno on first launch

### Fixed
- **YouTube downloads with bundled Deno** - Fixed path escaping issue when Deno is installed in Application Support folder (paths with spaces)
- **Use `--js-runtimes` flag** - Switched from `--extractor-args` to `--js-runtimes deno:PATH` for better compatibility
- **yt-dlp update not taking effect** - Fixed issue where updated yt-dlp version was not used after restart (now prioritizes user-updated version over bundled)


## [0.5.4] - 2026-01-28

### Fixed
- **AI Settings restored** - Proxy URL input, API key hints with platform links, and transcript language reordering now work correctly

### Changed
- Wider Model input and Summary Style dropdown for better readability


## [0.5.3] - 2026-01-28

### Added
- **Multi-language support (i18n)** - Full internationalization with English, Vietnamese, and Chinese (Simplified)
- **Language switcher** in Settings → General → Appearance
- **Localized README** - Vietnamese and Chinese versions in `/docs`


## [0.5.2] - 2026-01-27

### Fixed
- About section now shows correct GitHub links (`vanloctech/youwee`)
- Restored "Made with ❤️ by Vietnam" branding
- Added License link in About section
- Restored Auto-check for updates toggle in About section


## [0.5.1] - 2026-01-27

### Added
- **OpenAI Whisper transcription** - Fallback for videos without captions, uses Whisper API to transcribe audio (~$0.006/min)
- **DeepSeek & Qwen AI providers** - More AI options for video summarization
- **Proxy support** - Configure HTTP/HTTPS/SOCKS proxy for yt-dlp downloads
- **Clear All button** in Processing History - Quickly remove all history entries
- **Settings search** - Find settings quickly with keyboard search

### Changed
- **Settings page redesigned** - New sidebar navigation with 5 sections (General, Dependencies, AI, Network, About)
- **Universal page** now has Video/Audio toggle like YouTube page for consistency
- **macOS app icon** updated with proper Apple guidelines padding

### Fixed
- Downloads now save to library correctly when using updated yt-dlp


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
