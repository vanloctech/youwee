# Youwee Browser Extension (Chromium + Firefox)

The Youwee browser extension lets users send the current video page directly to the Youwee desktop app via deep link (`youwee://`), so they do not need to copy/paste URLs manually.

## What it does

- Adds a floating **Download with Youwee** button on supported video sites.
- Adds a popup action to send the current tab URL to Youwee from any HTTP/HTTPS page.
- Routes automatically:
  - YouTube URLs -> Youwee **YouTube** page
  - Other supported URLs -> Youwee **Universal** page
- Triggers auto-download when Youwee is idle (if app is already downloading, URL is added to queue only).

## Supported floating-button sites (core allowlist)

- `youtube.com`, `youtu.be`, `music.youtube.com`
- `tiktok.com`
- `instagram.com`
- `facebook.com`, `fb.watch`
- `x.com`, `twitter.com`
- `vimeo.com`
- `twitch.tv`, `clips.twitch.tv`
- `bilibili.com`, `b23.tv`
- `dailymotion.com`, `dai.ly`
- `soundcloud.com`

For other sites, users can still click the extension icon and send the current tab URL from popup.

## Download extension packages (recommended for users)

Go to the latest release assets:

- [https://github.com/vanloctech/youwee/releases/latest](https://github.com/vanloctech/youwee/releases/latest)

Download files:

- `Youwee-Extension-Chromium-vX.Y.Z.zip`
- `Youwee-Extension-Firefox-signed-vX.Y.Z.xpi`

### Install on Chromium browsers (Chrome/Edge/Brave)

1. Extract `Youwee-Extension-Chromium-vX.Y.Z.zip`.
2. Open extension management page (`chrome://extensions` or equivalent).
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select extracted folder.

### Install on Firefox (stable)

1. Download `Youwee-Extension-Firefox-signed-vX.Y.Z.xpi`.
2. Drag-and-drop the `.xpi` file into Firefox (or open the file directly).
3. Confirm installation.

## Build extension packages (for development)

From project root:

```bash
bun run ext:package
```

Output folders:

- Build output:
  - `extensions/youwee-webext/dist/chromium`
  - `extensions/youwee-webext/dist/firefox`
- Packaged files:
  - `extensions/youwee-webext/dist/packages/Youwee-Extension-Chromium-vX.Y.Z.zip`
  - `extensions/youwee-webext/dist/packages/Youwee-Extension-Firefox-unsigned-vX.Y.Z.zip`

## Usage

1. Open a supported video page.
2. Click floating **Download with Youwee** button (or extension popup action).
3. Browser may show **Open Youwee?** prompt the first time.
4. Choose **Always allow** for smoother one-click flow.

## Notes

- This extension relies on deep-link protocol `youwee://download`.
- YouTube playlist URLs are normalized to current video when `v` parameter exists (to avoid unintended full-playlist enqueue).
- If Youwee is not installed or protocol handler is unavailable, extension can still copy URL for manual fallback.
