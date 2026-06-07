# Youwee Command Line Interface

Youwee accepts a video URL directly from the command line, making it easy to
script downloads without manually registering the `youwee://` protocol handler.

When invoked with a URL, Youwee sends the request to the local app, adds the URL
to the download queue, and starts the download immediately unless `--queue-only`
is passed. CLI URL requests do not force the main window to open, so Youwee can
stay in the system tray.

## Usage

```
youwee <url> [options]
youwee --url <url> [options]
```

If Youwee is already running, the new URL is sent to the running instance.

## Options

| Flag | Alias | Description |
|------|-------|-------------|
| `<url>` (positional) | | Video URL to download |
| `--url <url>` | `-u` | Video URL (alternative to positional) |
| `--quality <q>` | `-q` | Video: `best`, `8k`, `4k`, `2k`, `1080`, `720`, `480`, `360`. Audio: `128` or `auto` |
| `--audio` | `-a` | Download audio only |
| `--queue-only` | | Add to queue without starting the download |
| `--target <t>` | `-t` | Routing: `auto` (default), `youtube`, `universal` |
| `--skip-live` | | Skip live, scheduled, or was-live videos before downloading |
| `--playlist` | | Allow yt-dlp to download playlist URLs |
| `--no-playlist` | | Force single-video download for playlist URLs |
| `--subtitle-mode <mode>` | | Subtitle mode: `off`, `auto`, `manual` |
| `--subtitle-langs <langs>` | | Comma-separated subtitle languages, e.g. `en,vi,ja` |
| `--subtitle-format <fmt>` | | Subtitle format: `srt`, `vtt`, `ass` |
| `--embed-subs` | | Embed subtitles into the output file |
| `--download-sections <range>` | | Download a time range, e.g. `00:30-02:10` |
| `--live-from-start` | | Download livestreams from the beginning |
| `--help` | `-h` | Show help |

Unknown or out-of-allowlist values are ignored and fall back to defaults. Only
public `http`/`https` URLs are accepted; local/private URLs are rejected.

## Examples

```sh
# Download a video at default quality
youwee https://www.youtube.com/watch?v=3TE5aR7EHus

# Download 720p
youwee --url "https://www.youtube.com/watch?v=3TE5aR7EHus" --quality 720

# Audio only
youwee -a "https://www.youtube.com/watch?v=3TE5aR7EHus"

# Add to the queue without starting
youwee --queue-only "https://vimeo.com/123456789"

# Skip live, scheduled, and was-live videos
youwee --skip-live "https://www.youtube.com/watch?v=3TE5aR7EHus"

# Download subtitles for selected languages
youwee "https://www.youtube.com/watch?v=3TE5aR7EHus" --subtitle-mode manual --subtitle-langs en,vi --subtitle-format srt

# Download only a section
youwee "https://www.youtube.com/watch?v=3TE5aR7EHus" --download-sections 00:30-02:10
```

## Notes

- The CLI sends a structured local request to Youwee. The browser extension
  still uses the separate `youwee://download` deep-link contract.
- Youwee remains a GUI/tray application. CLI URL requests are handled in the
  background and do not force the main window to open.
- Linux users no longer need to manually register the `youwee://` MIME handler
  just to pass URLs from a script.
