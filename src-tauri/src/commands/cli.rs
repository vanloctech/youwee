use std::sync::Mutex;
use tauri::Url;

static PENDING_CLI_DOWNLOAD_REQUESTS: Mutex<Vec<CliDownloadRequest>> = Mutex::new(Vec::new());
const MAX_PENDING_CLI_DOWNLOAD_REQUESTS: usize = 100;
const MAX_CLI_URL_LENGTH: usize = 2048;

// Allowlist of accepted quality values (mirrors frontend parseEnqueueOptions).
const ALLOWED_VIDEO_QUALITIES: [&str; 8] = ["best", "8k", "4k", "2k", "1080", "720", "480", "360"];
const ALLOWED_AUDIO_QUALITIES: [&str; 2] = ["128", "auto"];
const ALLOWED_SUBTITLE_MODES: [&str; 3] = ["off", "auto", "manual"];
const ALLOWED_SUBTITLE_FORMATS: [&str; 3] = ["srt", "vtt", "ass"];

#[derive(Clone, serde::Serialize)]
pub struct CliDownloadRequest {
    pub url: String,
    pub target: String,
    pub action: String,
    pub media: String,
    pub quality: String,
    pub skip_live: bool,
    pub download_playlist: Option<bool>,
    pub subtitle_mode: Option<String>,
    pub subtitle_langs: Vec<String>,
    pub subtitle_embed: bool,
    pub subtitle_format: Option<String>,
    pub download_sections: Option<String>,
    pub live_from_start: bool,
    pub trusted_local: bool,
}

#[derive(Clone, serde::Serialize)]
pub struct ExternalCliDownloadEventPayload {
    pub requests: Vec<CliDownloadRequest>,
}

#[derive(Default)]
pub struct CliDownloadArgs {
    pub url: Option<String>,
    pub quality: Option<String>,
    pub audio: bool,
    pub queue_only: bool,
    pub target: Option<String>,
    pub skip_live: bool,
    pub download_playlist: Option<bool>,
    pub subtitle_mode: Option<String>,
    pub subtitle_langs: Option<String>,
    pub subtitle_embed: bool,
    pub subtitle_format: Option<String>,
    pub download_sections: Option<String>,
    pub live_from_start: bool,
}

pub fn print_cli_usage_and_should_exit(argv: &[String]) -> bool {
    if argv
        .iter()
        .skip(1)
        .any(|arg| arg == "--help" || arg == "-h")
    {
        println!("{}", cli_help_text(command_name(argv)));
        return true;
    }

    if argv
        .iter()
        .skip(1)
        .any(|arg| arg == "--version" || arg == "-V")
    {
        println!("Youwee {}", env!("CARGO_PKG_VERSION"));
        return true;
    }

    false
}

fn command_name(argv: &[String]) -> &str {
    argv.first()
        .and_then(|arg| {
            std::path::Path::new(arg)
                .file_name()
                .and_then(|name| name.to_str())
        })
        .filter(|name| !name.is_empty())
        .unwrap_or("youwee")
}

fn cli_help_text(command: &str) -> String {
    format!(
        "\
Youwee {version}
GUI for yt-dlp. Pass a video URL to queue or download it.

Usage:
  {command} [URL] [OPTIONS]

Arguments:
  [URL]                 Video URL to download

Options:
  -u, --url <URL>       Video URL to download (alternative to positional URL)
  -q, --quality <VALUE> Video quality: best, 8k, 4k, 2k, 1080, 720, 480, 360. For audio use 128 or auto
  -a, --audio           Download audio only
      --queue-only      Only add the URL to the queue without starting the download
  -t, --target <VALUE>  Routing target: auto, youtube, or universal
      --skip-live       Skip live, scheduled, or was-live videos before downloading
      --playlist        Allow yt-dlp to download playlist URLs
      --no-playlist     Force single-video download for playlist URLs
      --subtitle-mode <VALUE>  Subtitle mode: off, auto, or manual
      --subtitle-langs <VALUE> Comma-separated subtitle languages, e.g. en,vi,ja
      --subtitle-format <VALUE> Subtitle format: srt, vtt, or ass
      --embed-subs      Embed subtitles into the output file
      --download-sections <VALUE> Time range as START-END, e.g. 00:30-02:10
      --live-from-start Download livestreams from the beginning
  -h, --help            Print help
  -V, --version         Print version",
        version = env!("CARGO_PKG_VERSION")
    )
}

fn is_accepted_cli_url(url: &str) -> bool {
    if url.is_empty() || url.len() > MAX_CLI_URL_LENGTH {
        return false;
    }
    if url.contains(char::is_whitespace) {
        return false;
    }

    let Ok(parsed) = Url::parse(url) else {
        return false;
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return false;
    }

    parsed
        .host_str()
        .map(|host| !is_private_or_local_host(host))
        .unwrap_or(false)
}

fn is_private_or_local_host(hostname: &str) -> bool {
    let host = hostname
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_ascii_lowercase();
    if host.is_empty() {
        return true;
    }

    if host == "localhost"
        || host == "0.0.0.0"
        || host == "::"
        || host == "::1"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host.ends_with(".internal")
    {
        return true;
    }

    if host.starts_with("127.")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
    {
        return true;
    }

    if let Some(second_octet) = host
        .strip_prefix("172.")
        .and_then(|rest| rest.split('.').next())
        .and_then(|octet| octet.parse::<u8>().ok())
    {
        if (16..=31).contains(&second_octet) {
            return true;
        }
    }

    if host.contains(':') {
        return host.starts_with("fe80:") || host.starts_with("fc") || host.starts_with("fd");
    }

    false
}

/// Build a structured CLI download request from parsed CLI arguments.
/// Returns `None` when no usable URL is present.
pub fn build_cli_download_request(args: &CliDownloadArgs) -> Option<CliDownloadRequest> {
    let url = args.url.as_ref()?.trim();
    let url = url.trim_matches('"').trim_matches('\'');
    if !is_accepted_cli_url(url) {
        return None;
    }

    let media = if args.audio { "audio" } else { "video" }.to_string();
    let quality = normalize_cli_quality(args.quality.as_deref(), args.audio);
    let action = if args.queue_only {
        "queue_only"
    } else {
        "download_now"
    }
    .to_string();
    let target = normalize_cli_target(args.target.as_deref());
    let subtitle_format = args
        .subtitle_format
        .as_deref()
        .map(|format| normalize_cli_subtitle_format(Some(format)));
    let subtitle_langs = normalize_cli_subtitle_langs(args.subtitle_langs.as_deref());
    let subtitle_mode = args
        .subtitle_mode
        .as_deref()
        .map(|mode| normalize_cli_subtitle_mode(Some(mode)))
        .or_else(|| {
            if !subtitle_langs.is_empty() {
                Some("manual".to_string())
            } else if args.subtitle_embed || subtitle_format.is_some() {
                Some("auto".to_string())
            } else {
                None
            }
        });
    let download_sections = normalize_cli_download_sections(args.download_sections.as_deref());

    Some(CliDownloadRequest {
        url: url.to_string(),
        target,
        action,
        media,
        quality,
        skip_live: args.skip_live,
        download_playlist: args.download_playlist,
        subtitle_mode,
        subtitle_langs,
        subtitle_embed: args.subtitle_embed,
        subtitle_format,
        download_sections,
        live_from_start: args.live_from_start,
        trusted_local: true,
    })
}

fn normalize_cli_quality(value: Option<&str>, audio: bool) -> String {
    let fallback = if audio { "auto" } else { "best" };
    let Some(quality) = value.map(|q| q.trim().to_ascii_lowercase()) else {
        return fallback.to_string();
    };
    let allowed = if audio {
        ALLOWED_AUDIO_QUALITIES.contains(&quality.as_str())
    } else {
        ALLOWED_VIDEO_QUALITIES.contains(&quality.as_str())
    };
    if allowed {
        quality
    } else {
        fallback.to_string()
    }
}

fn normalize_cli_target(value: Option<&str>) -> String {
    let Some(target) = value.map(|t| t.trim().to_ascii_lowercase()) else {
        return "auto".to_string();
    };
    if target == "youtube" || target == "universal" {
        target
    } else {
        "auto".to_string()
    }
}

fn normalize_cli_subtitle_mode(value: Option<&str>) -> String {
    let Some(mode) = value.map(|m| m.trim().to_ascii_lowercase()) else {
        return "off".to_string();
    };
    if ALLOWED_SUBTITLE_MODES.contains(&mode.as_str()) {
        mode
    } else {
        "off".to_string()
    }
}

fn normalize_cli_subtitle_format(value: Option<&str>) -> String {
    let Some(format) = value.map(|f| f.trim().to_ascii_lowercase()) else {
        return "srt".to_string();
    };
    if ALLOWED_SUBTITLE_FORMATS.contains(&format.as_str()) {
        format
    } else {
        "srt".to_string()
    }
}

fn normalize_cli_subtitle_langs(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or("")
        .split(',')
        .filter_map(|lang| {
            let lang = lang.trim();
            if lang.is_empty()
                || lang.len() > 16
                || !lang
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                None
            } else {
                Some(lang.to_string())
            }
        })
        .take(20)
        .collect()
}

fn normalize_cli_download_sections(value: Option<&str>) -> Option<String> {
    let section = value?.trim().trim_start_matches('*');
    if section.is_empty() || section.len() > 64 || section.contains(char::is_whitespace) {
        return None;
    }
    let (start, end) = section.split_once('-')?;
    if is_valid_time_marker(start) && is_valid_time_marker(end) {
        Some(format!("*{}-{}", start, end))
    } else {
        None
    }
}

fn is_valid_time_marker(value: &str) -> bool {
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() < 2 || parts.len() > 3 {
        return false;
    }
    parts
        .iter()
        .all(|part| !part.is_empty() && part.len() <= 2 && part.chars().all(|c| c.is_ascii_digit()))
}

/// Best-effort parser for raw argv (used by the single-instance callback where
/// only the raw process arguments are available). Supports the same flags as
/// the declared CLI schema. Unknown flags are ignored.
pub fn parse_cli_args_from_argv(argv: &[String]) -> CliDownloadArgs {
    let mut args = CliDownloadArgs::default();
    let mut iter = argv.iter().skip(1).peekable();

    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--url" | "-u" => {
                if let Some(value) = iter.next() {
                    args.url = Some(value.clone());
                }
            }
            "--quality" | "-q" => {
                if let Some(value) = iter.next() {
                    args.quality = Some(value.clone());
                }
            }
            "--target" | "-t" => {
                if let Some(value) = iter.next() {
                    args.target = Some(value.clone());
                }
            }
            "--audio" | "-a" => args.audio = true,
            "--queue-only" => args.queue_only = true,
            "--skip-live" => args.skip_live = true,
            "--playlist" => args.download_playlist = Some(true),
            "--no-playlist" => args.download_playlist = Some(false),
            "--embed-subs" => args.subtitle_embed = true,
            "--live-from-start" => args.live_from_start = true,
            "--subtitle-mode" => {
                if let Some(value) = iter.next() {
                    args.subtitle_mode = Some(value.clone());
                }
            }
            "--subtitle-langs" => {
                if let Some(value) = iter.next() {
                    args.subtitle_langs = Some(value.clone());
                }
            }
            "--subtitle-format" => {
                if let Some(value) = iter.next() {
                    args.subtitle_format = Some(value.clone());
                }
            }
            "--download-sections" => {
                if let Some(value) = iter.next() {
                    args.download_sections = Some(value.clone());
                }
            }
            other => {
                // Handle --flag=value form.
                if let Some(rest) = other.strip_prefix("--url=") {
                    args.url = Some(rest.to_string());
                } else if let Some(rest) = other.strip_prefix("--quality=") {
                    args.quality = Some(rest.to_string());
                } else if let Some(rest) = other.strip_prefix("--target=") {
                    args.target = Some(rest.to_string());
                } else if let Some(rest) = other.strip_prefix("--subtitle-mode=") {
                    args.subtitle_mode = Some(rest.to_string());
                } else if let Some(rest) = other.strip_prefix("--subtitle-langs=") {
                    args.subtitle_langs = Some(rest.to_string());
                } else if let Some(rest) = other.strip_prefix("--subtitle-format=") {
                    args.subtitle_format = Some(rest.to_string());
                } else if let Some(rest) = other.strip_prefix("--download-sections=") {
                    args.download_sections = Some(rest.to_string());
                } else if !other.starts_with('-') && args.url.is_none() {
                    // First positional argument is treated as the URL.
                    args.url = Some(other.to_string());
                }
            }
        }
    }

    args
}

/// Build a structured CLI download request from raw argv.
pub fn build_cli_download_request_from_argv(argv: &[String]) -> Option<CliDownloadRequest> {
    let args = parse_cli_args_from_argv(argv);
    build_cli_download_request(&args)
}

pub fn enqueue_cli_download_requests(requests: Vec<CliDownloadRequest>) {
    if requests.is_empty() {
        return;
    }
    if let Ok(mut pending) = PENDING_CLI_DOWNLOAD_REQUESTS.lock() {
        for request in requests {
            if !is_accepted_cli_url(&request.url) {
                continue;
            }
            if let Some(existing) = pending.iter_mut().find(|existing| {
                existing.url == request.url
                    && existing.target == request.target
                    && existing.action == request.action
                    && existing.media == request.media
                    && existing.quality == request.quality
                    && existing.skip_live == request.skip_live
                    && existing.download_playlist == request.download_playlist
                    && existing.subtitle_mode == request.subtitle_mode
                    && existing.subtitle_langs == request.subtitle_langs
                    && existing.subtitle_embed == request.subtitle_embed
                    && existing.subtitle_format == request.subtitle_format
                    && existing.download_sections == request.download_sections
                    && existing.live_from_start == request.live_from_start
            }) {
                existing.trusted_local = existing.trusted_local || request.trusted_local;
            } else {
                pending.push(request);
                if pending.len() > MAX_PENDING_CLI_DOWNLOAD_REQUESTS {
                    let overflow = pending.len() - MAX_PENDING_CLI_DOWNLOAD_REQUESTS;
                    pending.drain(0..overflow);
                }
            }
        }
    }
}

pub fn take_pending_cli_download_requests() -> Vec<CliDownloadRequest> {
    if let Ok(mut pending) = PENDING_CLI_DOWNLOAD_REQUESTS.lock() {
        return std::mem::take(&mut *pending);
    }
    Vec::new()
}

#[tauri::command]
pub fn consume_pending_cli_download_requests() -> Vec<CliDownloadRequest> {
    take_pending_cli_download_requests()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_request_preserves_url_without_deep_link_encoding() {
        let args = CliDownloadArgs {
            url: Some("https://www.youtube.com/watch?v=abc123&list=PL1#t=30".to_string()),
            quality: Some("720".to_string()),
            ..Default::default()
        };

        let request = build_cli_download_request(&args).expect("expected CLI request");

        assert_eq!(
            request.url,
            "https://www.youtube.com/watch?v=abc123&list=PL1#t=30"
        );
        assert_eq!(request.quality, "720");
        assert_eq!(request.action, "download_now");
        assert_eq!(request.media, "video");
        assert_eq!(request.target, "auto");
        assert!(request.trusted_local);
    }

    #[test]
    fn cli_request_rejects_non_http_urls() {
        let args = CliDownloadArgs {
            url: Some("file:///tmp/video.mp4".to_string()),
            ..Default::default()
        };

        assert!(build_cli_download_request(&args).is_none());
    }

    #[test]
    fn cli_request_rejects_private_urls() {
        let args = CliDownloadArgs {
            url: Some("http://localhost:8080/video".to_string()),
            ..Default::default()
        };

        assert!(build_cli_download_request(&args).is_none());
    }

    #[test]
    fn raw_argv_supports_positional_url_and_flags() {
        let argv = vec![
            "youwee".to_string(),
            "https://example.com/video".to_string(),
            "--quality=480".to_string(),
            "--queue-only".to_string(),
            "--target".to_string(),
            "universal".to_string(),
        ];

        let request = build_cli_download_request_from_argv(&argv).expect("expected CLI request");

        assert_eq!(request.url, "https://example.com/video");
        assert_eq!(request.quality, "480");
        assert_eq!(request.action, "queue_only");
        assert_eq!(request.target, "universal");
    }

    #[test]
    fn cli_request_falls_back_for_unsupported_values() {
        let args = CliDownloadArgs {
            url: Some("https://example.com/video".to_string()),
            quality: Some("999".to_string()),
            target: Some("desktop".to_string()),
            ..Default::default()
        };

        let request = build_cli_download_request(&args).expect("expected CLI request");

        assert_eq!(request.quality, "best");
        assert_eq!(request.target, "auto");
    }

    #[test]
    fn raw_argv_supports_download_option_overrides() {
        let argv = vec![
            "youwee".to_string(),
            "https://example.com/video".to_string(),
            "--skip-live".to_string(),
            "--playlist".to_string(),
            "--subtitle-mode=manual".to_string(),
            "--subtitle-langs".to_string(),
            "en,vi".to_string(),
            "--subtitle-format".to_string(),
            "vtt".to_string(),
            "--embed-subs".to_string(),
            "--download-sections=00:30-02:10".to_string(),
            "--live-from-start".to_string(),
        ];

        let request = build_cli_download_request_from_argv(&argv).expect("expected CLI request");

        assert!(request.skip_live);
        assert_eq!(request.download_playlist, Some(true));
        assert_eq!(request.subtitle_mode.as_deref(), Some("manual"));
        assert_eq!(request.subtitle_langs, vec!["en", "vi"]);
        assert!(request.subtitle_embed);
        assert_eq!(request.subtitle_format.as_deref(), Some("vtt"));
        assert_eq!(request.download_sections.as_deref(), Some("*00:30-02:10"));
        assert!(request.live_from_start);
    }

    #[test]
    fn cli_request_sanitizes_download_option_overrides() {
        let args = CliDownloadArgs {
            url: Some("https://example.com/video".to_string()),
            subtitle_mode: Some("invalid".to_string()),
            subtitle_langs: Some("en,../../secret,vi".to_string()),
            subtitle_format: Some("txt".to_string()),
            download_sections: Some("not a range".to_string()),
            ..Default::default()
        };

        let request = build_cli_download_request(&args).expect("expected CLI request");

        assert_eq!(request.subtitle_mode.as_deref(), Some("off"));
        assert_eq!(request.subtitle_langs, vec!["en", "vi"]);
        assert_eq!(request.subtitle_format.as_deref(), Some("srt"));
        assert_eq!(request.download_sections, None);
    }

    #[test]
    fn subtitle_options_imply_subtitle_mode_when_omitted() {
        let args = CliDownloadArgs {
            url: Some("https://example.com/video".to_string()),
            subtitle_langs: Some("en,vi".to_string()),
            ..Default::default()
        };
        let request = build_cli_download_request(&args).expect("expected CLI request");
        assert_eq!(request.subtitle_mode.as_deref(), Some("manual"));

        let args = CliDownloadArgs {
            url: Some("https://example.com/video".to_string()),
            subtitle_embed: true,
            ..Default::default()
        };
        let request = build_cli_download_request(&args).expect("expected CLI request");
        assert_eq!(request.subtitle_mode.as_deref(), Some("auto"));
    }

    #[test]
    fn cli_help_request_exits_before_app_start() {
        let argv = vec!["youwee".to_string(), "--help".to_string()];

        assert!(print_cli_usage_and_should_exit(&argv));
    }
}
