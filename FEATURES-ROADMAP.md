# Youwee — Features to Add

## P0 — Add first

### 1. Automatic yt-dlp and FFmpeg manager
**Add:** A dependency manager for yt-dlp, FFmpeg, and gallery-dl.

**Implementation instructions:**
- Add a Settings → Engines screen showing installed version, latest available version, path, architecture, and health status.
- Support automatic download, upgrade, rollback, and manual executable selection.
- Download binaries only from configured trusted release sources.
- Verify SHA-256 checksums before replacing an executable.
- Keep the previous working version for one-click rollback.
- Run a startup compatibility test after upgrades.
- Store engine versions in exported settings so installations can be reproduced.

**Acceptance criteria:**
- Users can update each engine without using a terminal.
- A failed update never deletes the last working version.
- The UI clearly reports checksum, version, and compatibility failures.

**Priority:** P0 — patch release.

### 2. Per-download custom yt-dlp options
**Add:** Advanced options that can be applied globally, per profile, or to one download.

**Implementation instructions:**
- Add a validated key/value editor instead of accepting unrestricted shell text.
- Support common options for format, cookies, proxy, retries, rate limits, subtitles, metadata, chapters, and post-processing.
- Add an “expert raw arguments” mode behind a warning for unsupported yt-dlp flags.
- Display the generated command in a copyable diagnostics panel.
- Prevent unsafe shell interpolation by passing arguments as an array to the process runner.
- Save named presets and allow a preset to be selected in the browser extension and Telegram commands.

**Acceptance criteria:**
- A user can apply a custom option to one item without changing global defaults.
- Invalid options are detected before the download starts.
- The generated command reproduces the selected configuration.

**Priority:** P0 — patch release.

### 3. Clipboard monitoring and drag-and-drop ingestion
**Add:** Automatic URL detection from the clipboard and direct file/URL drop support.

**Implementation instructions:**
- Add an opt-in clipboard watcher with pause, allowlist, and duplicate suppression controls.
- Detect single URLs, newline-separated URLs, and URLs copied from browser address bars.
- Add a visible “Clipboard monitoring is active” indicator.
- Accept dragged URLs, text files, JSON lists, CSV files, and supported media files.
- Route every detected item through the existing deduplication and workspace logic.
- Add configurable behavior: ask, add immediately, or ignore.

**Acceptance criteria:**
- Copying a supported URL produces one queue item at most.
- Clipboard monitoring can be disabled without uninstalling the application.
- Dropped batches preserve input order and report invalid lines.

**Priority:** P0 — patch release.

### 4. Download profiles and per-item presets
**Add:** Reusable profiles for different download purposes.

**Implementation instructions:**
- Provide built-in profiles: Best available, 4K archive, audio library, subtitles only, mobile, and podcast.
- Allow users to define output directory, format, codec, quality, subtitles, metadata, chapters, SponsorBlock behavior, naming template, and post-processing per profile.
- Allow a profile to be assigned by browser domain, playlist, channel, Telegram command, or folder.
- Show the resolved profile before queue submission.
- Permit per-item overrides without modifying the parent profile.

**Acceptance criteria:**
- A user can create, duplicate, export, import, and delete profiles.
- Profile changes affect new downloads only unless the user explicitly reapplies them.
- The queue displays which profile produced each item.

**Priority:** P0 — patch/minor release.

### 5. Incognito and privacy mode
**Add:** A mode that minimizes local traces of downloads.

**Implementation instructions:**
- Do not add incognito downloads to normal history unless the user explicitly saves them.
- Disable title/thumbnail caching for incognito items or encrypt the cache.
- Provide a one-click “Clear temporary data” action.
- Add separate retention settings for URLs, metadata, logs, thumbnails, and cookies.
- Never expose cookie values or private URLs in normal logs.
- Show a clear privacy indicator on incognito queue items.

**Acceptance criteria:**
- Incognito items are absent from normal history after completion.
- Temporary files and metadata are removed according to the selected retention policy.
- Logs redact authentication and sensitive URL parameters.

**Priority:** P0 — patch release.

### 6. Download history export, import, and backup
**Add:** Portable backups for history, queues, settings, profiles, plugins, and templates.

**Implementation instructions:**
- Define a versioned JSON backup schema.
- Include download URL, source, title, status, local path, timestamps, profile, and error state.
- Exclude secrets by default; offer separately encrypted credentials export.
- Add conflict policies: skip, replace, merge, or create duplicate.
- Provide automatic scheduled backups and a configurable backup directory.
- Validate backup integrity before import and migrate older schema versions.

**Acceptance criteria:**
- A backup can be restored on another operating system.
- Import produces a preview of additions, conflicts, and skipped records.
- A corrupt or incompatible backup fails without modifying existing data.

**Priority:** P0 — minor release.

### 7. Better queue controls and download failure recovery
**Add:** Professional queue management for retries, dependencies, and partial failures.

**Implementation instructions:**
- Add pause, resume, retry, cancel, restart, duplicate, reorder, and move-to-top actions.
- Add automatic retry policies with exponential backoff and a maximum attempt count.
- Classify errors as transient, authentication, geo-restriction, unavailable, disk, or configuration errors.
- Preserve partial files only when yt-dlp/FFmpeg can safely resume them.
- Add “retry failed only,” “retry authentication failures,” and “export failed URLs.”
- Allow queue items to depend on earlier items, such as download → subtitle generation → conversion.

**Acceptance criteria:**
- Restarting the application restores queue state safely.
- Every failure has a human-readable cause and suggested action.
- Retry behavior is visible and configurable.

**Priority:** P0 — minor release.

## P1 — Add next

### 8. 4K, 8K, HDR, and high-frame-rate presets
**Add:** Explicit quality choices for 2160p, 4320p, HDR, 60 fps, and 120 fps where available.

**Implementation instructions:**
- Add resolution, frame-rate, dynamic-range, codec, and bitrate columns to the format picker.
- Map friendly choices to validated yt-dlp format-selection rules.
- Add fallback chains, for example 8K → 4K → 1440p → 1080p.
- Warn when the selected format requires FFmpeg merging or remuxing.
- Display estimated size before queue submission when the extractor provides it.
- Add separate audio quality selection for high-resolution downloads.

**Acceptance criteria:**
- The picker never promises a format unavailable from the source.
- Users can save a preferred maximum resolution and frame rate.
- The final file reports actual resolution, frame rate, HDR status, and codecs.

**Priority:** P1 — minor release.

### 9. Granular codec, container, and remux controls
**Add:** User control over AV1, VP9, H.264, H.265, Opus, AAC, MP3, MP4, MKV, WebM, and audio-only outputs.

**Implementation instructions:**
- Add separate preference lists for video codec, audio codec, container, and compatibility mode.
- Define compatibility presets for Apple devices, Android, web playback, archival, and legacy TVs.
- Use yt-dlp format filtering first and FFmpeg remuxing only when necessary.
- Warn when transcoding is required and show expected quality loss.
- Preserve source streams when the requested container can contain them without transcoding.

**Acceptance criteria:**
- Users can request a codec/container combination without writing format expressions.
- The application distinguishes remuxing from lossy transcoding.
- Output metadata accurately reflects the final codecs and container.

**Priority:** P1 — minor release.

### 10. Audio-track and language selection
**Add:** Selection of preferred, alternate, descriptive, dubbed, and original audio tracks.

**Implementation instructions:**
- Populate the format dialog with language code, language name, role, codec, bitrate, and sample rate.
- Add global language priority such as `en > original > any`.
- Add “download all audio tracks” and “download selected tracks” options.
- Store selected track metadata in the output filename or media tags when requested.
- Use deterministic fallback behavior when the preferred track is unavailable.

**Acceptance criteria:**
- The user can preview available audio languages before downloading.
- The selected track is verified after merging.
- Fallback decisions appear in the job log.

**Priority:** P1 — minor release.

### 11. Chapter-aware downloads
**Add:** Chapter display, chapter selection, chapter splitting, and chapter-based filenames.

**Implementation instructions:**
- Show chapter title, start time, end time, and duration in the media information view.
- Allow users to select individual chapters or ranges.
- Add modes for one complete file, one file per chapter, or both.
- Use FFmpeg stream copy when possible; fall back to re-encoding only when required for accurate cuts.
- Sanitize chapter titles for filesystem compatibility.
- Add an option to write chapter markers into the final container.

**Acceptance criteria:**
- Chapter boundaries are visible before download.
- Split filenames contain stable numbering and sanitized titles.
- The application reports whether each split used stream copy or transcoding.

**Priority:** P1 — minor release.

### 12. Search and search-result downloading
**Add:** A search interface that can search supported providers and queue selected results.

**Implementation instructions:**
- Add a provider abstraction so search support is independent from download extraction.
- Display title, creator, duration, upload date, thumbnail, live status, and source URL.
- Support pagination, sorting, filtering, multi-select, and “download all visible results.”
- Add result deduplication by canonical URL and extractor ID.
- Respect provider rate limits and require explicit confirmation before large batch downloads.
- Preserve the original query and result position in job metadata.

**Acceptance criteria:**
- Users can search without opening an external browser.
- Search results can be added to the queue without copying URLs manually.
- Failed provider searches explain whether the problem is authentication, rate limiting, or unsupported search.

**Priority:** P1 — minor/major release.

### 13. Playlist, channel, Watch Later, and private-list management
**Add:** First-class management of recurring collections and authenticated user lists.

**Implementation instructions:**
- Add collection previews with item count, new items, removed items, and unavailable items.
- Support “download new items only” using a persistent item archive.
- Add include/exclude rules for title, duration, uploader, date, resolution, and live status.
- Add support for authenticated personal lists only after explicit user authorization.
- Provide channel/playlist monitoring schedules and change notifications.
- Keep collection state separate from the ordinary download history.

**Acceptance criteria:**
- Re-running a collection does not redownload previously completed items unless requested.
- Users can preview changes before starting a monitoring run.
- Private collection failures provide an authentication-specific recovery path.

**Priority:** P1 — major release.

### 14. Authenticated browser session bridge
**Add:** A secure method to use the user’s existing browser session for authorized content.

**Implementation instructions:**
- Prefer a browser-extension handoff or OS-native browser cookie extraction rather than asking users to paste cookies.
- Require explicit per-browser and per-domain consent.
- Store extracted cookies in the OS credential store or encrypted local storage.
- Add session expiration detection and a “re-authorize” action.
- Never transmit cookies to Youwee cloud services.
- Display a warning that users must download only content they are authorized to access.

**Acceptance criteria:**
- Authorized private or age-restricted content can be resolved without manual cookie-file handling.
- Cookies are scoped to the selected browser/domain.
- Removing an account deletes the associated session material.

**Priority:** P1 — major release.

### 15. Proxy profiles and network routing
**Add:** HTTP, HTTPS, SOCKS5, per-download, per-domain, and per-profile proxy settings.

**Implementation instructions:**
- Create a Proxy Manager with named profiles and connection-test actions.
- Store credentials in the OS credential store, never in plain configuration files.
- Support proxy selection at global, provider, profile, playlist, and individual-job levels.
- Add optional bypass rules for local addresses and selected domains.
- Show the active proxy profile in the job details.
- Implement clear error messages for DNS, authentication, timeout, and geo-related failures.

**Acceptance criteria:**
- A user can test a proxy before starting a job.
- Per-domain rules override global rules predictably.
- Proxy credentials do not appear in logs or exported backups.

**Priority:** P1 — minor release.

### 16. Scheduling and bandwidth policies
**Add:** Date/time scheduling, recurring jobs, active-hour rules, and bandwidth budgets.

**Implementation instructions:**
- Add one-time, daily, weekly, and custom recurring schedules.
- Support start/end windows, maximum concurrent jobs, maximum speed, and daily data limits.
- Add “run only when on Wi-Fi,” “run only when charging,” and “run only when idle” where supported by the platform.
- Persist schedules in a background service so the desktop window need not remain open.
- Add queue priorities and a policy preview before activation.

**Acceptance criteria:**
- Scheduled jobs run after application restart.
- Bandwidth limits apply globally and per job according to the selected policy.
- Missed jobs have a configurable catch-up behavior.

**Priority:** P1 — minor release.

### 17. Concurrent fragment and connection controls
**Add:** Configurable parallelism for fragments, files, and queues.

**Implementation instructions:**
- Separate maximum simultaneous downloads from maximum fragments per download.
- Add adaptive mode that reduces concurrency after repeated throttling or errors.
- Add per-provider concurrency limits.
- Show connection count, active fragments, throughput, and throttling state.
- Preserve a conservative default to avoid unnecessary provider load.
- Combine with speed limits and scheduling policies.

**Acceptance criteria:**
- Users can configure concurrency without editing yt-dlp arguments.
- The UI reports effective rather than merely requested concurrency.
- A failed fragment can retry without restarting unrelated jobs.

**Priority:** P1 — minor release.

### 18. Built-in media preview and playback
**Add:** Preview before download and playback from the local library.

**Implementation instructions:**
- Integrate libmpv, VLC, or another maintained playback backend.
- Support local files, completed downloads, and short remote previews where the provider allows it.
- Add subtitle track selection, audio-track selection, seek, playback speed, and frame capture.
- Keep playback isolated from the downloader process so a player crash cannot stop the queue.
- Add “preview selected format” before downloading when a direct preview URL is available.

**Acceptance criteria:**
- Users can verify title, content, audio, subtitles, and quality before committing to a full download.
- Playback opens from any completed library item.
- Unsupported codecs produce a clear dependency message.

**Priority:** P1 — major release.

### 19. Library search, filtering, sorting, and saved views
**Add:** A scalable library browser for large collections.

**Implementation instructions:**
- Add full-text search across title, uploader, URL, description, tags, chapters, and subtitles.
- Add filters for type, duration, date, status, source, resolution, codec, profile, folder, and subtitle availability.
- Add sorting by name, date, duration, size, source, and completion status.
- Allow saved views such as “Unwatched,” “Failed,” “4K,” “Missing subtitles,” and “Audio library.”
- Add bulk actions for move, rename, reprocess, export, retry, and delete.

**Acceptance criteria:**
- Filtering remains responsive on large libraries.
- Saved views persist across restarts.
- Bulk actions show a confirmation preview and an undo path where possible.

**Priority:** P1 — minor release.

### 20. Naming templates and automatic folder organization
**Add:** A safe, previewable naming-template system.

**Implementation instructions:**
- Support variables for title, uploader, channel, upload date, ID, playlist index, chapter, language, resolution, codec, and extension.
- Add templates for channel folders, playlist folders, artist/album folders, and date archives.
- Normalize Unicode, trim path length, replace illegal characters, and prevent path traversal.
- Show example output for every template before saving.
- Add collision policies: overwrite, skip, suffix, or compare hashes.

**Acceptance criteria:**
- Users can preview the final path before download.
- The same source produces deterministic paths under the same template.
- Files cannot be written outside the configured download root through metadata values.

**Priority:** P1 — minor release.

## P2 — Add after core workflow improvements

### 21. Audio tagging and MusicBrainz/Discogs lookup
**Add:** Automatic metadata enrichment for audio-only downloads.

**Implementation instructions:**
- Add opt-in lookups using title, uploader, album, track number, and duration.
- Support artist, album, title, date, genre, track number, disc number, comment, and artwork tags.
- Display candidate matches and require confirmation when confidence is low.
- Cache accepted matches locally for repeat downloads.
- Write tags without re-encoding whenever the container supports it.
- Provide a dry-run preview of tag changes.

**Acceptance criteria:**
- Users can approve or reject metadata matches before writing tags.
- Artwork is resized and embedded according to a configurable size limit.
- Tagging failures do not mark the underlying download as failed.

**Priority:** P2 — minor/plugin release.

### 22. Plex, Jellyfin, and Emby integration
**Add:** Post-download media-server refresh and optional library routing.

**Implementation instructions:**
- Implement integrations as plugins using server URL, API token, and library selection.
- Store tokens securely and provide a connection-test button.
- Trigger refresh only after all configured post-processing steps succeed.
- Support separate libraries for movies, shows, music, courses, and user-defined content.
- Add a queue event log showing refresh request, response, and retry state.

**Acceptance criteria:**
- A completed job can automatically trigger the correct server library refresh.
- Server credentials never appear in logs or backups.
- Users can disable refresh for individual profiles.

**Priority:** P2 — plugin release.

### 23. Archive extraction and password handling
**Add:** Optional extraction of downloaded ZIP, RAR, 7z, and TAR archives.

**Implementation instructions:**
- Add a post-processing step with extract, keep archive, delete archive, and verify-only modes.
- Require explicit enablement per profile to avoid unsafe automatic extraction.
- Support password entry through the OS credential store and optional password lists supplied by the user.
- Block path traversal and absolute-path entries during extraction.
- Write an extraction manifest and preserve failed archives for diagnosis.

**Acceptance criteria:**
- Extracted files remain inside the configured destination.
- Incorrect passwords produce a clear failure without deleting the archive.
- Users can preview archive contents before extraction.

**Priority:** P2 — plugin/release feature.

### 24. 3D, 360-degree, VR, and stereoscopic media support
**Add:** Detection and handling of immersive media formats.

**Implementation instructions:**
- Detect 360, 180, stereoscopic, equirectangular, and projection metadata.
- Display projection and eye-layout information in the format picker.
- Preserve spatial metadata during remuxing and post-processing.
- Add optional metadata injection when required by the target player.
- Add library filters for 360, VR, 3D, mono, top-bottom, and side-by-side media.

**Acceptance criteria:**
- Immersive media is labeled before download.
- Remuxing does not silently remove required projection metadata.
- The final file reports its detected projection and stereo layout.

**Priority:** P2 — plugin/release feature.

### 25. Subtitle project interchange and advanced batch processing
**Add:** Import/export and repeatable subtitle-processing projects.

**Implementation instructions:**
- Support SRT, VTT, ASS, SSA, TTML, and YouTube-style subtitle formats.
- Add project files containing source media, subtitle tracks, timing changes, translation settings, QC rules, and output targets.
- Support batch alignment, translation, grammar correction, burn-in, embedding, split, merge, and format conversion.
- Add dry-run validation for missing fonts, invalid timestamps, overlaps, and encoding issues.
- Preserve original subtitle files and create versioned processed outputs.

**Acceptance criteria:**
- A subtitle project can be reopened and reproduced later.
- Batch jobs report per-file successes and failures.
- Original subtitles are never overwritten without explicit confirmation.

**Priority:** P2 — minor/major release.

### 26. Mobile share target and remote queue companion
**Add:** Android share-target support and a mobile-friendly remote queue interface.

**Implementation instructions:**
- Create an Android app or PWA that accepts shared URLs from YouTube, TikTok, browsers, and file managers.
- Allow the user to choose local mobile download or a paired Youwee desktop/server destination.
- Pair devices with a short-lived code or QR code; do not use permanent unauthenticated URLs.
- Show queue status, progress, errors, and completed-file links.
- Add optional iOS Shortcuts support using authenticated HTTPS endpoints.
- Keep tokens revocable and scoped per device.

**Acceptance criteria:**
- A shared URL reaches the selected Youwee queue without manual copying.
- Pairing can be revoked from the desktop application.
- The mobile client never exposes the desktop queue without authentication.

**Priority:** P2 — major release.

### 27. Shortcut, Tasker, Raycast, and bookmarklet integrations
**Add:** Lightweight automation entry points.

**Implementation instructions:**
- Expose authenticated local HTTP endpoints for add, status, pause, resume, retry, and export.
- Provide Android Tasker actions, iOS Shortcut actions, Raycast commands, and a browser bookmarklet.
- Support parameters for URL, profile, output folder, schedule, and notification policy.
- Return structured JSON with job ID, status, and validation errors.
- Add token scopes so automation can be read-only or queue-writing.

**Acceptance criteria:**
- Every integration can submit a URL and receive a stable job ID.
- Invalid profiles or paths are rejected before queuing.
- Tokens can be rotated and revoked independently.

**Priority:** P2 — plugin/integration release.

### 28. Youwee Server: headless self-hosted deployment
**Add:** A Dockerized headless server with a web UI and API.

**Implementation instructions:**
- Separate downloader workers, API, database, web UI, and media-processing workers.
- Publish amd64 and arm64 images with pinned dependency versions.
- Support Docker Compose, NAS deployment, configurable volumes, and health checks.
- Add user authentication, API tokens, role permissions, and per-user directories.
- Support queue persistence, scheduled jobs, webhooks, and browser/mobile submission.
- Add documented environment variables and a migration path for desktop settings.

**Acceptance criteria:**
- A clean Docker Compose deployment can download and process a job without the desktop app.
- Restarting containers preserves queue and library state.
- Unauthorized users cannot view URLs, metadata, files, or logs.

**Priority:** P2 — major release.

### 29. HTTPS, reverse-proxy, and secure remote access
**Add:** Safe remote access for the self-hosted server.

**Implementation instructions:**
- Support deployment behind Caddy, Nginx, Traefik, and common NAS reverse proxies.
- Document TLS termination, trusted proxy headers, WebSocket forwarding, and upload limits.
- Add optional built-in HTTPS for small deployments.
- Enforce secure cookies, CSRF protection, origin validation, rate limiting, and login lockout.
- Add audit logs for authentication, token use, queue changes, and file access.

**Acceptance criteria:**
- The server works behind a documented reverse-proxy configuration.
- HTTP credentials and API tokens are never transmitted in plaintext when remote access is enabled.
- The server identifies proxy misconfiguration without exposing secrets.

**Priority:** P2 — major release.

### 30. Public API and webhook event system
**Add:** A versioned API and reliable outbound events.

**Implementation instructions:**
- Define endpoints for media inspection, queue creation, status, cancellation, retry, library search, and file metadata.
- Use stable job IDs and idempotency keys to prevent duplicate submissions.
- Add webhook events for queued, started, progress, completed, failed, paused, and post-processing states.
- Sign webhook payloads and support retry with exponential backoff.
- Add event delivery history and a test-event button.

**Acceptance criteria:**
- External clients can perform the complete queue lifecycle through documented endpoints.
- Duplicate requests do not create duplicate jobs when the same idempotency key is used.
- Webhook receivers can verify signatures and replay failed deliveries.

**Priority:** P2 — major release.

### 31. Multi-device synchronization
**Add:** Optional synchronization of profiles, history, queues, and settings between trusted Youwee installations.

**Implementation instructions:**
- Make synchronization opt-in and separate from file transfer.
- Support local server sync first, then optional user-managed storage.
- Define conflict rules for profiles, queue states, library paths, and history records.
- Never synchronize browser cookies or secrets by default.
- Add device registration, revoke, last-seen time, and sync status.

**Acceptance criteria:**
- Two trusted installations can share profiles and selected history records.
- Conflicts are previewed before destructive resolution.
- Secret material remains local unless explicitly and securely configured.

**Priority:** P2 — long-term release.

## P3 — Strategic additions

### 32. Automated media quality inspection
**Add:** Post-download validation for technical quality and corruption.

**Implementation instructions:**
- Use FFprobe to validate duration, streams, codecs, resolution, frame rate, bitrate, timestamps, and container health.
- Detect truncated files, missing audio, broken subtitles, zero-duration streams, and unexpected transcoding.
- Add configurable QC profiles for archive, mobile, web, podcast, and media-server outputs.
- Mark failed validation separately from failed download.
- Provide a machine-readable QC report and repair/reprocess action.

**Acceptance criteria:**
- Every completed job can optionally receive a QC result.
- The user can see exactly which rule failed.
- Reprocessing uses the original source URL and profile configuration.

**Priority:** P3 — strategic release.

### 33. Duplicate detection and content fingerprinting
**Add:** Detection of duplicate downloads across URLs and folders.

**Implementation instructions:**
- Compare canonical source IDs, normalized URLs, file hashes, duration, dimensions, and optional perceptual fingerprints.
- Add policies for skip, link, replace, keep both, or ask.
- Detect duplicates before download and during library import.
- Provide a review screen with file size, paths, dates, and source URLs.
- Never delete duplicates automatically without explicit policy confirmation.

**Acceptance criteria:**
- Repeated playlist runs do not create duplicate files under the selected policy.
- Library imports identify likely duplicates without blocking unrelated items.
- Any deletion action is reversible or protected by confirmation.

**Priority:** P3 — strategic release.

### 34. Media-server and archive metadata sidecars
**Add:** NFO, JSON, XML, poster, thumbnail, chapter, and subtitle sidecar generation.

**Implementation instructions:**
- Add output profiles for Plex/Jellyfin, Kodi, archival, research, and generic sidecars.
- Include source URL, uploader, upload date, description, chapters, tags, subtitles, hashes, and processing history.
- Make sidecar naming follow the final media filename.
- Support redaction of URLs or personal metadata for sharing.
- Version sidecars when post-processing changes metadata.

**Acceptance criteria:**
- Sidecars can be regenerated without redownloading media.
- Sidecar paths match the selected naming template.
- JSON metadata passes schema validation before being marked complete.

**Priority:** P3 — plugin/release feature.

### 35. Advanced storage and lifecycle policies
**Add:** Rules for retention, archival, deletion, and storage quotas.

**Implementation instructions:**
- Add per-profile and per-folder retention policies based on age, size, status, or collection membership.
- Support move-to-archive, delete-after-successful-upload, and low-disk-space actions.
- Add configurable minimum free-space thresholds and preflight checks.
- Provide a dry-run report before applying cleanup.
- Protect pinned, tagged, failed, and legally preserved items from automatic deletion.

**Acceptance criteria:**
- Cleanup never runs without an enabled policy and visible scope.
- Low disk space pauses new jobs before they start.
- Users can preview all files affected by a lifecycle rule.

**Priority:** P3 — strategic release.

### 36. Reproducible releases and stronger update verification
**Add:** Transparent release integrity and update provenance.

**Implementation instructions:**
- Publish signed installers, checksums, source archives, dependency manifests, and build metadata.
- Verify signatures and checksums inside the updater before installation.
- Show release channel, version, signing status, and changelog before updating.
- Support stable, beta, and pinned-version channels.
- Add rollback to the last known-good release.

**Acceptance criteria:**
- Users can independently verify downloaded installers.
- The updater blocks mismatched or unsigned artifacts according to policy.
- A failed update restores the previous version automatically.

**Priority:** P3 — strategic release.

### 37. Accessibility and internationalization improvements
**Add:** Full keyboard, screen-reader, high-contrast, and localization support.

**Implementation instructions:**
- Add accessible labels, focus order, keyboard shortcuts, reduced-motion mode, and high-contrast themes.
- Ensure progress, errors, and queue state are available to screen readers.
- Externalize all user-facing strings and support pluralization, date, number, and file-size localization.
- Allow right-to-left layouts where the UI framework supports them.
- Add locale-aware subtitle, filename, and metadata handling.

**Acceptance criteria:**
- Core workflows can be completed without a mouse.
- Screen readers announce queue transitions and validation errors.
- Changing locale does not corrupt filenames, metadata, or subtitle text.

**Priority:** P3 — continuous release work.

### 38. Site-extractor health dashboard
**Add:** Diagnostics for supported-site failures and extractor freshness.

**Implementation instructions:**
- Track extractor errors by domain, version, error class, and time.
- Add a user-consented anonymized diagnostics export.
- Show whether a failure is caused by yt-dlp version, authentication, rate limiting, network, or unsupported site behavior.
- Add a one-click “copy diagnostic bundle” that redacts cookies and tokens.
- Provide plugin/engine compatibility checks before reporting a site as unsupported.

**Acceptance criteria:**
- Users can diagnose common failures without reading raw stack traces.
- Diagnostic bundles contain reproducible settings but no secrets.
- Site failures can be grouped by domain and extractor version.

**Priority:** P3 — strategic release.

## Recommended implementation order

1. Automatic engine manager.
2. Per-download custom options.
3. Clipboard and drag-and-drop ingestion.
4. Download profiles.
5. Incognito mode.
6. History export/import and backup.
7. Queue recovery and retry controls.
8. 4K/8K/HDR/HFR presets.
9. Codec/container controls.
10. Audio-track selection.
11. Chapter splitting.
12. Search and result downloading.
13. Authenticated browser bridge.
14. Proxy profiles.
15. Scheduling and bandwidth policies.
16. Library filtering and naming templates.
17. Playback.
18. Mobile share target.
19. Public API and webhooks.
20. Self-hosted Youwee Server.
21. HTTPS and reverse-proxy support.
22. Media-server integrations.
23. Audio tagging.
24. Archive extraction.
25. VR/360 support.
26. Subtitle project interchange.
27. Multi-device synchronization.
28. QC, deduplication, lifecycle policies, and release-provenance features.

## Sources

- Youwee repository, README, release, browser-extension, Telegram, plugin, and SDK documentation: https://github.com/vanloctech/youwee
- Youwee v0.20.3 release: https://github.com/vanloctech/youwee/releases/tag/v0.20.3
- yt-dlp documentation: https://github.com/yt-dlp/yt-dlp
- 4K Video Downloader Plus documentation: https://www.4kdownload.com/products/videodownloader-41
- MediaHuman YouTube Downloader documentation: https://www.mediahuman.com/youtube-video-downloader/
- JDownloader documentation: https://jdownloader.org/
- Stacher: https://stacher.io/
- Parabolic: https://github.com/NickvisionApps/Parabolic
- MeTube: https://github.com/alexta69/metube
- YTDLnis: https://github.com/deniscerri/ytdlnis
- Seal: https://github.com/JunkFood02/Seal
