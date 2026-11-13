# Backend Error Codes

This document defines the backend wire error contract used by Tauri commands.

## Wire format

- Prefix: `__YOUWEE_ERR__`
- Payload JSON:

```json
{
  "code": "STRING_CODE",
  "message": "Fallback message for logs/debug",
  "params": { "key": "value" },
  "source": "optional-source",
  "retryable": true
}
```

Frontend should:

1. Parse prefix + JSON payload.
2. Localize by `common:backendErrors.<code>`.
3. Fallback to `message` when translation key is missing.

## Core codes

| Code | Meaning | Retryable |
| --- | --- | --- |
| `BACKEND_UNKNOWN` | Unknown error | false |
| `VALIDATION_INVALID_URL` | Invalid URL input | false |
| `VALIDATION_INVALID_INPUT` | Invalid input data | false |
| `DOWNLOAD_CANCELLED` | User/system cancelled download | false |
| `TRANSCRIPT_NOT_AVAILABLE` | No transcript/subtitle content available | false |
| `YT_RATE_LIMITED` | Rate-limited by platform | true |
| `YT_PRIVATE_VIDEO` | Private video | false |
| `YT_AGE_RESTRICTED` | Age-restricted content | false |
| `YT_MEMBERS_ONLY` | Members-only content | false |
| `YT_SIGNIN_REQUIRED` | Login/authentication required | false |
| `YT_GEO_RESTRICTED` | Region-restricted content | false |
| `YT_VIDEO_UNAVAILABLE` | Video unavailable | false |
| `YT_NO_SUBTITLES` | Subtitles not available | false |
| `YT_COOKIE_DB_LOCKED` | Browser cookie database locked | false |
| `YT_COOKIE_ACCESS_DENIED` | OS blocked reading the browser profile (macOS privacy / Full Disk Access) | false |
| `YT_COOKIE_PROFILE_NOT_FOUND` | Selected browser profile has no cookie database | false |
| `YT_FRESH_COOKIES_REQUIRED` | Fresh cookies are required | false |
| `NETWORK_TIMEOUT` | Request timeout | true |
| `NETWORK_REQUEST_FAILED` | Network/connection failure | true |
| `PROCESS_START_FAILED` | Failed to start child process | true |
| `PROCESS_EXECUTION_FAILED` | Child process execution failure | true |
| `PROCESS_EXIT_NON_ZERO` | Child process exited with failure | true |
| `PARSE_FAILED` | Parse/deserialize error | false |
| `IO_OPERATION_FAILED` | File system operation failed | false |
| `DB_OPERATION_FAILED` | Database operation failed | false |
| `YTDLP_NOT_FOUND` | yt-dlp binary missing | false |
| `FFMPEG_NOT_FOUND` | FFmpeg/ffprobe missing | false |
| `GALLERYDL_NOT_FOUND` | gallery-dl binary missing | false |
| `GALLERYDL_INSTALL_UNSUPPORTED` | No official standalone gallery-dl build for this platform (e.g. macOS); install with Homebrew/pip | false |
| `GALLERYDL_SYSTEM_MANAGED` | System gallery-dl is in use; update it with the package manager | false |
| `AI_API_ERROR` | AI provider API returned error | false |
| `AI_NO_API_KEY` | AI API key missing | false |
| `AI_NO_TRANSCRIPT` | Transcript missing for AI step | false |
| `WHISPER_API_ERROR` | Whisper API returned error | false |
| `WHISPER_NO_API_KEY` | Whisper API key missing | false |
| `WHISPER_UNSUPPORTED_FORMAT` | Unsupported audio format for Whisper | false |

