use crate::types::{code, BackendError};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct YtdlpAdvancedOption {
    pub id: String,
    pub value: Option<String>,
    pub secondary_value: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BuiltYtdlpAdvancedArgs {
    pub args: Vec<String>,
    pub youtube_player_client: Option<String>,
    pub skipped_options: Vec<String>,
}

pub fn build_ytdlp_advanced_args(
    url: &str,
    enabled: bool,
    options: &[YtdlpAdvancedOption],
) -> Result<BuiltYtdlpAdvancedArgs, BackendError> {
    if !enabled || options.is_empty() {
        return Ok(BuiltYtdlpAdvancedArgs {
            args: Vec::new(),
            youtube_player_client: None,
            skipped_options: Vec::new(),
        });
    }

    let is_bilibili = is_bilibili_host(url);
    let mut args = Vec::new();
    let mut skipped_options = Vec::new();
    let mut youtube_player_client = None;
    let mut force_ip_mode: Option<&str> = None;

    for option in options {
        if option.id.starts_with('-') {
            return Err(validation_error(format!(
                "Unsupported yt-dlp option '{}'. Use the supported advanced options list.",
                option.id
            )));
        }

        if is_bilibili && is_bilibili_managed_header_option(&option.id) {
            skipped_options.push(option.id.clone());
            continue;
        }

        match option.id.as_str() {
            "impersonate" => push_flag_value(
                &mut args,
                "--impersonate",
                validate_impersonate(required_value(option, "impersonate")?)?,
            ),
            "forceIpv4" => {
                ensure_no_value(option)?;
                if force_ip_mode == Some("ipv6") {
                    return Err(validation_error(
                        "Cannot combine Force IPv4 and Force IPv6.",
                    ));
                }
                force_ip_mode = Some("ipv4");
                args.push("--force-ipv4".to_string());
            }
            "forceIpv6" => {
                ensure_no_value(option)?;
                if force_ip_mode == Some("ipv4") {
                    return Err(validation_error(
                        "Cannot combine Force IPv4 and Force IPv6.",
                    ));
                }
                force_ip_mode = Some("ipv6");
                args.push("--force-ipv6".to_string());
            }
            "socketTimeout" => push_flag_value(
                &mut args,
                "--socket-timeout",
                validate_number(required_value(option, "socket timeout")?, 1.0, 300.0)?,
            ),
            "userAgent" => push_flag_value(
                &mut args,
                "--user-agent",
                validate_text(required_value(option, "user agent")?, 500, "user agent")?,
            ),
            "referer" => push_flag_value(
                &mut args,
                "--referer",
                validate_http_url(required_value(option, "referer")?)?,
            ),
            "addHeaders" => {
                let name = validate_header_name(required_value(option, "header name")?)?;
                let value = validate_text(
                    required_secondary_value(option, "header value")?,
                    500,
                    "header value",
                )?;
                args.push("--add-headers".to_string());
                args.push(format!("{}:{}", name, value));
            }
            "sleepRequests" => push_flag_value(
                &mut args,
                "--sleep-requests",
                validate_number(required_value(option, "sleep requests")?, 0.0, 300.0)?,
            ),
            "sleepInterval" => push_flag_value(
                &mut args,
                "--sleep-interval",
                validate_number(required_value(option, "sleep interval")?, 0.0, 300.0)?,
            ),
            "maxSleepInterval" => push_flag_value(
                &mut args,
                "--max-sleep-interval",
                validate_number(required_value(option, "max sleep interval")?, 0.0, 300.0)?,
            ),
            "concurrentFragments" => push_flag_value(
                &mut args,
                "--concurrent-fragments",
                validate_integer(required_value(option, "concurrent fragments")?, 1, 32)?,
            ),
            "throttledRate" => push_flag_value(
                &mut args,
                "--throttled-rate",
                validate_size(required_value(option, "throttled rate")?)?,
            ),
            "httpChunkSize" => push_flag_value(
                &mut args,
                "--http-chunk-size",
                validate_size(required_value(option, "HTTP chunk size")?)?,
            ),
            "geoBypass" => {
                ensure_no_value(option)?;
                args.push("--geo-bypass".to_string());
            }
            "geoBypassCountry" => push_flag_value(
                &mut args,
                "--geo-bypass-country",
                validate_country(required_value(option, "geo bypass country")?)?,
            ),
            "matchFilters" => push_flag_value(
                &mut args,
                "--match-filters",
                validate_text(required_value(option, "match filter")?, 500, "match filter")?,
            ),
            "formatSort" => push_flag_value(
                &mut args,
                "--format-sort",
                validate_format_sort(required_value(option, "format sort")?)?,
            ),
            "youtubePlayerClient" => {
                youtube_player_client = Some(validate_youtube_player_client(required_value(
                    option,
                    "player client",
                )?)?);
            }
            _ => {
                return Err(validation_error(format!(
                    "Unsupported yt-dlp option '{}'. Use the supported advanced options list.",
                    option.id
                )));
            }
        }
    }

    Ok(BuiltYtdlpAdvancedArgs {
        args,
        youtube_player_client,
        skipped_options,
    })
}

pub fn build_youtube_extractor_args(
    use_actual_player_js: bool,
    player_client: Option<&str>,
) -> Option<String> {
    let mut parts = Vec::new();
    if use_actual_player_js {
        parts.push("player_js_version=actual".to_string());
    }
    if let Some(player_client) = player_client {
        if !player_client.is_empty() {
            parts.push(format!("player-client={}", player_client));
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(format!("youtube:{}", parts.join(";")))
    }
}

pub fn redact_ytdlp_advanced_args(args: &[String]) -> Vec<String> {
    let mut redacted = Vec::with_capacity(args.len());
    let mut redact_next_value_for: Option<&str> = None;

    for arg in args {
        if let Some(flag) = redact_next_value_for.take() {
            redacted.push(match flag {
                "--add-headers" | "--add-header" => redact_header_value(arg),
                _ => "<redacted>".to_string(),
            });
            continue;
        }

        redacted.push(arg.clone());
        if matches!(
            arg.as_str(),
            "--add-headers"
                | "--add-header"
                | "--user-agent"
                | "--referer"
                | "--cookies"
                | "--cookies-from-browser"
                | "--proxy"
        ) {
            redact_next_value_for = Some(arg);
        }
    }

    redacted
}

/// Masks the query string (and any embedded credentials) of a URL before it is
/// written to logs or shown in the diagnostics panel. The scheme, host and path
/// are preserved so the command stays recognizable.
pub fn redact_url_for_log(url: &str) -> String {
    let Ok(mut parsed) = reqwest::Url::parse(url) else {
        return url.split(['?', '&']).next().unwrap_or(url).to_string();
    };
    if parsed.query().map_or(false, |q| !q.is_empty()) {
        parsed.set_query(Some("<redacted>"));
    }
    if parsed.username().is_empty() && parsed.password().is_none() {
        return parsed.to_string();
    }
    let _ = parsed.set_username("");
    let _ = parsed.set_password(None);
    parsed.to_string()
}

/// Redacts a full yt-dlp arg vector for logs / diagnostics. When `redact_url` is
/// set, the trailing URL argument (position after `--`) is masked too.
pub fn redact_download_args_for_log(args: &[String], redact_url: bool) -> Vec<String> {
    let mut redacted = redact_ytdlp_advanced_args(args);
    if redact_url {
        if let Some(last) = redacted.last_mut() {
            *last = redact_url_for_log(last);
        }
    }
    redacted
}

/// Flags that may be passed through the expert raw-arguments textarea.
/// Everything else starting with `-` is rejected so the app-managed download
/// pipeline (output paths, cookies, proxy, retries, post-processing) cannot be
/// silently overridden by raw input.
const SAFE_RAW_ARG_ALLOWLIST: &[&str] = &[
    "--limit-rate",
    "--retries",
    "--fragment-retries",
    "--extractor-retries",
    "--file-access-retries",
    "--concurrent-fragments",
    "--socket-timeout",
    "--http-chunk-size",
    "--throttled-rate",
    "--sleep-requests",
    "--sleep-interval",
    "--max-sleep-interval",
    "--user-agent",
    "--referer",
    "--add-header",
    "--geo-bypass",
    "--geo-bypass-country",
    "--match-filters",
    "--format-sort",
    "--impersonate",
];

/// Flags that are dangerous or app-managed. Defense-in-depth: even if a flag is
/// ever added to the allowlist above, these are still rejected.
const RAW_ARG_BLOCKLIST: &[&str] = &[
    "--exec",
    "--exec-before-download",
    "--downloader",
    "--downloader-args",
    "--external-downloader",
    "--external-downloader-args",
    "--config-location",
    "--load-info-json",
    "--write-info-json",
    "--print",
    "--print-to-file",
    "--cookies",
    "--cookies-from-browser",
    "--proxy",
    "--ffmpeg-location",
    "--js-runtimes",
    "--extractor-args",
    "--plugin-dirs",
    "--cache-dir",
    "--output",
    "-o",
    "--format",
    "-f",
    "--playlist-start",
    "--playlist-end",
    "--download-archive",
    "--write-pages",
    "--skip-download",
    "--simulate",
    "--dump-json",
    "--flat-playlist",
    "--lazy-playlist",
    "--postprocessor-args",
    "--ppa",
    "--remux-video",
    "--recode-video",
    "--convert-subs",
    "--convert-thumbnails",
    "--xattrs",
    "--embed-metadata",
    "--embed-thumbnail",
    "--split-chapters",
    "--download-sections",
    "--force-overwrites",
    "--no-overwrites",
    "--newline",
    "--progress",
    "--no-warnings",
];

/// Tokenizes an expert raw-arguments string (whitespace-split, quote-aware) and
/// validates every flag against the safe allowlist. Returns the argv tokens so
/// they can be appended to the download command as an array (never a shell
/// string). Invalid or dangerous flags produce a validation error BEFORE the
/// download starts.
pub fn build_ytdlp_raw_args(raw: &str) -> Result<Vec<String>, BackendError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    if trimmed.len() > 4000 {
        return Err(validation_error(
            "Raw yt-dlp arguments are too long (max 4000 characters).",
        ));
    }

    let tokens = tokenize_raw_args(trimmed)?;

    let mut args = Vec::with_capacity(tokens.len());
    for token in &tokens {
        if token.chars().any(|ch| ch.is_control()) {
            return Err(validation_error(
                "Raw yt-dlp arguments cannot contain control characters.",
            ));
        }
        if token == "--" {
            return Err(validation_error(
                "Raw yt-dlp arguments cannot contain the '--' separator.",
            ));
        }
        if token.starts_with('-') {
            if RAW_ARG_BLOCKLIST.contains(&token.as_str()) {
                return Err(validation_error(format!(
                    "Raw yt-dlp flag '{}' is blocked for safety.",
                    token
                )));
            }
            if !SAFE_RAW_ARG_ALLOWLIST.contains(&token.as_str()) {
                return Err(validation_error(format!(
                    "Raw yt-dlp flag '{}' is not in the safe allowlist.",
                    token
                )));
            }
        }
        args.push(token.clone());
    }

    Ok(args)
}

/// Whitespace-splits a raw argument string while honoring single and double
/// quotes (with backslash escapes inside double quotes).
fn tokenize_raw_args(raw: &str) -> Result<Vec<String>, BackendError> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut chars = raw.chars().peekable();
    let mut in_token = false;

    while let Some(ch) = chars.next() {
        match ch {
            ' ' | '\t' | '\r' => {
                if in_token {
                    tokens.push(std::mem::take(&mut current));
                    in_token = false;
                }
            }
            '"' => {
                in_token = true;
                let mut closed = false;
                while let Some(inner) = chars.next() {
                    match inner {
                        '"' => {
                            closed = true;
                            break;
                        }
                        '\\' => {
                            if let Some(escaped) = chars.next() {
                                current.push(escaped);
                            }
                        }
                        c => current.push(c),
                    }
                }
                if !closed {
                    return Err(validation_error(
                        "Unterminated double quote in raw yt-dlp arguments.",
                    ));
                }
            }
            '\'' => {
                in_token = true;
                let mut closed = false;
                while let Some(inner) = chars.next() {
                    match inner {
                        '\'' => {
                            closed = true;
                            break;
                        }
                        c => current.push(c),
                    }
                }
                if !closed {
                    return Err(validation_error(
                        "Unterminated single quote in raw yt-dlp arguments.",
                    ));
                }
            }
            c if c.is_control() => {
                return Err(validation_error(
                    "Raw yt-dlp arguments cannot contain control characters.",
                ));
            }
            c => {
                in_token = true;
                current.push(c);
            }
        }
    }

    if in_token {
        tokens.push(current);
    }

    Ok(tokens)
}

fn push_flag_value(args: &mut Vec<String>, flag: &str, value: String) {
    args.push(flag.to_string());
    args.push(value);
}

fn required_value<'a>(
    option: &'a YtdlpAdvancedOption,
    label: &str,
) -> Result<&'a str, BackendError> {
    let value = option.value.as_deref().unwrap_or("").trim();
    if value.is_empty() {
        return Err(validation_error(format!("Missing yt-dlp {} value.", label)));
    }
    Ok(value)
}

fn required_secondary_value<'a>(
    option: &'a YtdlpAdvancedOption,
    label: &str,
) -> Result<&'a str, BackendError> {
    let value = option.secondary_value.as_deref().unwrap_or("").trim();
    if value.is_empty() {
        return Err(validation_error(format!("Missing yt-dlp {} value.", label)));
    }
    Ok(value)
}

fn ensure_no_value(option: &YtdlpAdvancedOption) -> Result<(), BackendError> {
    if option
        .value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .is_some()
        || option
            .secondary_value
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .is_some()
    {
        return Err(validation_error(format!(
            "yt-dlp option '{}' does not accept a value.",
            option.id
        )));
    }
    Ok(())
}

fn validate_impersonate(value: &str) -> Result<String, BackendError> {
    validate_text(value, 64, "impersonate target")?;
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':'))
    {
        return Err(validation_error(
            "Invalid impersonate target. Use values like chrome or safari:macos.",
        ));
    }
    Ok(value.to_string())
}

fn validate_number(value: &str, min: f64, max: f64) -> Result<String, BackendError> {
    reject_raw_separator(value, "number")?;
    let parsed: f64 = value
        .parse()
        .map_err(|_| validation_error("Invalid numeric yt-dlp option value."))?;
    if !parsed.is_finite() || parsed < min || parsed > max {
        return Err(validation_error(format!(
            "Numeric yt-dlp option value must be between {} and {}.",
            min, max
        )));
    }
    Ok(value.to_string())
}

fn validate_integer(value: &str, min: u32, max: u32) -> Result<String, BackendError> {
    reject_raw_separator(value, "integer")?;
    let parsed: u32 = value
        .parse()
        .map_err(|_| validation_error("Invalid integer yt-dlp option value."))?;
    if parsed < min || parsed > max {
        return Err(validation_error(format!(
            "Integer yt-dlp option value must be between {} and {}.",
            min, max
        )));
    }
    Ok(parsed.to_string())
}

fn validate_size(value: &str) -> Result<String, BackendError> {
    validate_text(value, 20, "size")?;
    let mut chars = value.chars().peekable();
    let mut digit_count = 0;
    while matches!(chars.peek(), Some(ch) if ch.is_ascii_digit()) {
        digit_count += 1;
        chars.next();
    }
    if digit_count == 0 {
        return Err(validation_error("Size value must start with digits."));
    }
    let suffix: String = chars.collect();
    if suffix.is_empty() || matches!(suffix.as_str(), "K" | "M" | "G" | "KiB" | "MiB" | "GiB") {
        Ok(value.to_string())
    } else {
        Err(validation_error(
            "Invalid size suffix. Use values like 10M or 4MiB.",
        ))
    }
}

fn validate_country(value: &str) -> Result<String, BackendError> {
    validate_text(value, 2, "country")?;
    if value.len() != 2 || !value.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return Err(validation_error("Country code must be two letters."));
    }
    Ok(value.to_ascii_uppercase())
}

fn validate_format_sort(value: &str) -> Result<String, BackendError> {
    validate_text(value, 160, "format sort")?;
    if !value.chars().all(|ch| {
        ch.is_ascii_alphanumeric() || matches!(ch, ',' | ':' | '_' | '-' | '+' | '.' | '~')
    }) {
        return Err(validation_error("Invalid format sort value."));
    }
    Ok(value.to_string())
}

fn validate_youtube_player_client(value: &str) -> Result<String, BackendError> {
    validate_text(value, 32, "YouTube player client")?;
    match value {
        "web" | "mweb" | "tv" | "ios" | "android" | "web_safari" => Ok(value.to_string()),
        _ => Err(validation_error(
            "Unsupported YouTube player client preset.",
        )),
    }
}

fn validate_http_url(value: &str) -> Result<String, BackendError> {
    validate_text(value, 500, "URL")?;
    let parsed =
        reqwest::Url::parse(value).map_err(|_| validation_error("Invalid HTTP URL value."))?;
    match parsed.scheme() {
        "http" | "https" => Ok(value.to_string()),
        _ => Err(validation_error(
            "Only http:// and https:// URLs are allowed.",
        )),
    }
}

fn validate_header_name(value: &str) -> Result<String, BackendError> {
    validate_text(value, 80, "header name")?;
    let lower = value.to_ascii_lowercase();
    if matches!(
        lower.as_str(),
        "cookie"
            | "authorization"
            | "proxy-authorization"
            | "set-cookie"
            | "x-api-key"
            | "x-auth-token"
    ) {
        return Err(validation_error(format!(
            "Header '{}' is not allowed in yt-dlp advanced options.",
            value
        )));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-')
    {
        return Err(validation_error("Invalid HTTP header name."));
    }
    Ok(value.to_string())
}

fn validate_text(value: &str, max_len: usize, label: &str) -> Result<String, BackendError> {
    if value.is_empty() {
        return Err(validation_error(format!("{} cannot be empty.", label)));
    }
    if value.len() > max_len {
        return Err(validation_error(format!(
            "{} is too long for yt-dlp advanced options.",
            label
        )));
    }
    if value.contains('\0') || value.contains('\n') || value.contains('\r') {
        return Err(validation_error(format!(
            "{} cannot contain control characters.",
            label
        )));
    }
    reject_raw_separator(value, label)?;
    Ok(value.to_string())
}

fn reject_raw_separator(value: &str, label: &str) -> Result<(), BackendError> {
    if value == "--" || value.contains(" --") || value.contains("-- ") {
        return Err(validation_error(format!(
            "{} cannot contain raw yt-dlp option separators.",
            label
        )));
    }
    Ok(())
}

fn is_bilibili_managed_header_option(id: &str) -> bool {
    matches!(id, "impersonate" | "userAgent" | "referer" | "addHeaders")
}

fn is_bilibili_host(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    let Some(host) = parsed.host_str().map(|host| host.to_ascii_lowercase()) else {
        return false;
    };
    host == "b23.tv" || host == "bilibili.com" || host.ends_with(".bilibili.com")
}

fn redact_header_value(header: &str) -> String {
    match header.split_once(':') {
        Some((name, _)) => format!("{}:<redacted>", name),
        None => "<redacted>".to_string(),
    }
}

fn validation_error(message: impl Into<String>) -> BackendError {
    BackendError::new(code::VALIDATION_INVALID_INPUT, message).with_retryable(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn option(id: &str, value: Option<&str>, secondary_value: Option<&str>) -> YtdlpAdvancedOption {
        YtdlpAdvancedOption {
            id: id.to_string(),
            value: value.map(str::to_string),
            secondary_value: secondary_value.map(str::to_string),
        }
    }

    #[test]
    fn build_ytdlp_advanced_args_allows_vetted_options() {
        let built = build_ytdlp_advanced_args(
            "https://www.youtube.com/watch?v=abc",
            true,
            &[
                option("impersonate", Some("chrome"), None),
                option("forceIpv4", None, None),
                option("socketTimeout", Some("30"), None),
                option("referer", Some("https://example.com/watch"), None),
                option("addHeaders", Some("X-Test"), Some("demo")),
                option("concurrentFragments", Some("4"), None),
                option("geoBypassCountry", Some("US"), None),
                option("matchFilters", Some("!is_live"), None),
                option("formatSort", Some("res:1080,fps"), None),
                option("youtubePlayerClient", Some("web_safari"), None),
            ],
        )
        .expect("valid advanced options should build");

        assert_eq!(
            built.args,
            vec![
                "--impersonate",
                "chrome",
                "--force-ipv4",
                "--socket-timeout",
                "30",
                "--referer",
                "https://example.com/watch",
                "--add-headers",
                "X-Test:demo",
                "--concurrent-fragments",
                "4",
                "--geo-bypass-country",
                "US",
                "--match-filters",
                "!is_live",
                "--format-sort",
                "res:1080,fps",
            ]
        );
        assert_eq!(built.youtube_player_client.as_deref(), Some("web_safari"));
    }

    #[test]
    fn build_ytdlp_advanced_args_rejects_dangerous_or_managed_options() {
        let err = build_ytdlp_advanced_args(
            "https://www.youtube.com/watch?v=abc",
            true,
            &[option("--exec", Some("echo bad"), None)],
        )
        .expect_err("raw yt-dlp flags should be rejected");

        assert!(err.message().contains("Unsupported yt-dlp option"));
    }

    #[test]
    fn build_ytdlp_advanced_args_rejects_sensitive_headers() {
        let err = build_ytdlp_advanced_args(
            "https://www.youtube.com/watch?v=abc",
            true,
            &[option(
                "addHeaders",
                Some("Authorization"),
                Some("Bearer token"),
            )],
        )
        .expect_err("sensitive headers should be rejected");

        assert!(err.message().contains("not allowed"));
    }

    #[test]
    fn build_ytdlp_advanced_args_skips_headers_for_bilibili() {
        let built = build_ytdlp_advanced_args(
            "https://www.bilibili.com/video/BV1Qo4y1s7XT",
            true,
            &[
                option("impersonate", Some("chrome"), None),
                option("userAgent", Some("Custom UA"), None),
                option("referer", Some("https://example.com/"), None),
                option("addHeaders", Some("X-Test"), Some("demo")),
                option("forceIpv6", None, None),
            ],
        )
        .expect("non-header options should still build");

        assert_eq!(built.args, vec!["--force-ipv6"]);
        assert_eq!(built.skipped_options.len(), 4);
    }

    #[test]
    fn build_youtube_extractor_args_merges_actual_player_js_and_player_client() {
        let merged = build_youtube_extractor_args(true, Some("web_safari"));

        assert_eq!(
            merged,
            Some("youtube:player_js_version=actual;player-client=web_safari".to_string())
        );
    }

    #[test]
    fn redact_ytdlp_advanced_args_redacts_custom_headers() {
        let redacted = redact_ytdlp_advanced_args(&[
            "--add-headers".to_string(),
            "X-Test:secret".to_string(),
            "--user-agent".to_string(),
            "Secret Browser".to_string(),
            "--referer".to_string(),
            "https://example.com".to_string(),
        ]);

        assert_eq!(
            redacted,
            vec![
                "--add-headers",
                "X-Test:<redacted>",
                "--user-agent",
                "<redacted>",
                "--referer",
                "<redacted>"
            ]
        );
    }

    #[test]
    fn build_ytdlp_raw_args_tokenizes_quoted_values() {
        let args = build_ytdlp_raw_args(
            "--limit-rate 5M --retries 5 --add-header \"X-Test: hello world\" --match-filters '!is_live'",
        )
        .expect("safe raw args should tokenize");

        assert_eq!(
            args,
            vec![
                "--limit-rate",
                "5M",
                "--retries",
                "5",
                "--add-header",
                "X-Test: hello world",
                "--match-filters",
                "!is_live",
            ]
        );
    }

    #[test]
    fn build_ytdlp_raw_args_rejects_dangerous_flags() {
        for bad in ["--exec", "--downloader-args", "--config-location", "--load-info-json"] {
            let err = build_ytdlp_raw_args(&format!("--limit-rate 5M {bad} echo pwned"))
                .expect_err("dangerous raw flags must be rejected");
            assert!(
                err.message().contains("blocked for safety"),
                "unexpected message: {}",
                err.message()
            );
        }
    }

    #[test]
    fn build_ytdlp_raw_args_rejects_non_allowlisted_flags() {
        let err = build_ytdlp_raw_args("--output /tmp/x.mp4")
            .expect_err("app-managed flags must be rejected");
        assert!(err.message().contains("not in the safe allowlist"));

        let err2 = build_ytdlp_raw_args("-f best")
            .expect_err("short app-managed flags must be rejected");
        assert!(err2.message().contains("blocked for safety"));
    }

    #[test]
    fn build_ytdlp_raw_args_rejects_unterminated_quotes() {
        let err = build_ytdlp_raw_args("--limit-rate \"5M")
            .expect_err("unterminated quotes must be rejected");
        assert!(err.message().contains("Unterminated"));

        let err2 = build_ytdlp_raw_args("--retries '3")
            .expect_err("unterminated single quotes must be rejected");
        assert!(err2.message().contains("Unterminated"));
    }

    #[test]
    fn build_ytdlp_raw_args_accepts_empty_input() {
        assert!(build_ytdlp_raw_args("").unwrap().is_empty());
        assert!(build_ytdlp_raw_args("   ").unwrap().is_empty());
    }

    #[test]
    fn redact_download_args_for_log_redacts_secrets_and_url() {
        let redacted = redact_download_args_for_log(
            &[
                "--cookies".to_string(),
                "C:\\secrets\\cookies.txt".to_string(),
                "--proxy".to_string(),
                "http://user:pass@127.0.0.1:8080".to_string(),
                "--add-header".to_string(),
                "X-Api-Key:abc".to_string(),
                "--".to_string(),
                "https://example.com/watch?v=secret123&t=10".to_string(),
            ],
            true,
        );

        assert_eq!(
            redacted,
            vec![
                "--cookies",
                "<redacted>",
                "--proxy",
                "<redacted>",
                "--add-header",
                "X-Api-Key:<redacted>",
                "--",
                "https://example.com/watch?<redacted>"
            ]
        );
    }

    #[test]
    fn redact_url_for_log_keeps_scheme_host_path() {
        let redacted = redact_url_for_log("https://example.com/watch?v=abc&token=secret");
        assert_eq!(redacted, "https://example.com/watch?<redacted>");

        let plain = redact_url_for_log("https://example.com/video/123");
        assert_eq!(plain, "https://example.com/video/123");
    }
}
