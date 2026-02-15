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

## Build extension packages

From project root:

```bash
bun run ext:build
```

Output folders:

- `extensions/youwee-webext/dist/chromium`
- `extensions/youwee-webext/dist/firefox`

## Install on Chromium browsers (Chrome/Edge/Brave)

1. Open extension management page (`chrome://extensions` or equivalent).
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select folder: `extensions/youwee-webext/dist/chromium`.

## Install on Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on**.
3. Select file: `extensions/youwee-webext/dist/firefox/manifest.json`.

## Usage

1. Open a supported video page.
2. Click floating **Download with Youwee** button (or extension popup action).
3. Browser may show **Open Youwee?** prompt the first time.
4. Choose **Always allow** for smoother one-click flow.

## Notes

- This extension relies on deep-link protocol `youwee://download`.
- YouTube playlist URLs are normalized to current video when `v` parameter exists (to avoid unintended full-playlist enqueue).
- If Youwee is not installed or protocol handler is unavailable, extension can still copy URL for manual fallback.
