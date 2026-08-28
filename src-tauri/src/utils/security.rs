/// Validate a URL before passing to yt-dlp.
/// Only allows http:// and https:// schemes, rejects option-injection attempts.
pub fn validate_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("URL cannot be empty".to_string());
    }
    if trimmed.starts_with('-') {
        return Err("Invalid URL: cannot start with '-'".to_string());
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("Invalid URL: only http:// and https:// are supported".to_string());
    }
    Ok(())
}

/// Normalize URLs to formats compatible with yt-dlp extractors.
///
/// Transforms platform-specific URL variants into the canonical format
/// expected by yt-dlp. Returns the original URL unchanged if no
/// normalization is needed.
///
/// # Supported transforms
///
/// ## Douyin
/// Any `douyin.com` page with a `modal_id` query parameter → direct video URL:
/// - `douyin.com/user/…?modal_id=123` → `douyin.com/video/123`
/// - `douyin.com/jingxuan?modal_id=123` → `douyin.com/video/123`
/// - `douyin.com/jingxuan/music?modal_id=123` → `douyin.com/video/123`
///
/// ## YouTube
/// Channel root URLs → videos tab:
/// - `youtube.com/@handle` → `youtube.com/@handle/videos`
/// - `youtube.com/channel/UC…` → `youtube.com/channel/UC…/videos`
pub fn normalize_url(url: &str) -> String {
    let lower = url.to_lowercase();

    if lower.contains("youtube.com/") {
        if let Some(normalized) = normalize_youtube_channel_root_tab_url(url, "videos") {
            return normalized;
        }
    }

    if lower.contains("douyin.com/") {
        if let Some(normalized) = normalize_douyin(url) {
            return normalized;
        }
    }

    url.to_string()
}

/// Normalize a YouTube channel URL to one or more content tabs.
/// Non-YouTube URLs, video URLs, and playlist URLs are returned unchanged.
pub fn normalize_channel_content_urls(
    url: &str,
    youtube_content_type: Option<&str>,
) -> Vec<String> {
    let lower = url.to_lowercase();
    if !lower.contains("youtube.com/") {
        return vec![normalize_url(url)];
    }

    match youtube_content_type.unwrap_or("videos") {
        "shorts" => normalize_youtube_channel_tab_url(url, "shorts")
            .map(|url| vec![url])
            .unwrap_or_else(|| vec![normalize_url(url)]),
        "streams" => normalize_youtube_channel_tab_url(url, "streams")
            .map(|url| vec![url])
            .unwrap_or_else(|| vec![normalize_url(url)]),
        "videos_shorts" => {
            let videos = normalize_youtube_channel_tab_url(url, "videos");
            let shorts = normalize_youtube_channel_tab_url(url, "shorts");
            match (videos, shorts) {
                (Some(videos), Some(shorts)) => vec![videos, shorts],
                _ => vec![normalize_url(url)],
            }
        }
        _ => normalize_youtube_channel_tab_url(url, "videos")
            .map(|url| vec![url])
            .unwrap_or_else(|| vec![normalize_url(url)]),
    }
}

/// Normalize YouTube channel URLs to a specific content tab.
/// yt-dlp extracts fewer entries from a channel home tab than from a direct tab.
fn normalize_youtube_channel_root_tab_url(url: &str, tab: &str) -> Option<String> {
    let mut parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?;
    if !is_youtube_host(host) {
        return None;
    }

    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|segments| segments.filter(|segment| !segment.is_empty()).collect())
        .unwrap_or_default();

    let channel_segments: Option<&[&str]> = match segments.as_slice() {
        [handle] if handle.starts_with('@') && handle.len() > 1 => Some(&segments[0..1]),
        ["channel", channel_id] if !channel_id.is_empty() => Some(&segments[0..2]),
        ["c", channel_name] if !channel_name.is_empty() => Some(&segments[0..2]),
        ["user", user_name] if !user_name.is_empty() => Some(&segments[0..2]),
        _ => None,
    };

    let channel_segments = channel_segments?;

    let normalized_path = format!("/{}/{}", channel_segments.join("/"), tab);
    parsed.set_path(&normalized_path);
    Some(parsed.to_string())
}

/// Normalize YouTube channel root or tab URLs to a specific content tab.
fn normalize_youtube_channel_tab_url(url: &str, tab: &str) -> Option<String> {
    let mut parsed = reqwest::Url::parse(url).ok()?;
    let host = parsed.host_str()?;
    if !is_youtube_host(host) {
        return None;
    }

    let segments: Vec<&str> = parsed
        .path_segments()
        .map(|segments| segments.filter(|segment| !segment.is_empty()).collect())
        .unwrap_or_default();

    let channel_segments: Option<&[&str]> = match segments.as_slice() {
        [handle] if handle.starts_with('@') && handle.len() > 1 => Some(&segments[0..1]),
        [handle, current_tab]
            if handle.starts_with('@')
                && handle.len() > 1
                && is_youtube_channel_content_tab(current_tab) =>
        {
            Some(&segments[0..1])
        }
        ["channel", channel_id] if !channel_id.is_empty() => Some(&segments[0..2]),
        ["channel", channel_id, current_tab]
            if !channel_id.is_empty() && is_youtube_channel_content_tab(current_tab) =>
        {
            Some(&segments[0..2])
        }
        ["c", channel_name] if !channel_name.is_empty() => Some(&segments[0..2]),
        ["c", channel_name, current_tab]
            if !channel_name.is_empty() && is_youtube_channel_content_tab(current_tab) =>
        {
            Some(&segments[0..2])
        }
        ["user", user_name] if !user_name.is_empty() => Some(&segments[0..2]),
        ["user", user_name, current_tab]
            if !user_name.is_empty() && is_youtube_channel_content_tab(current_tab) =>
        {
            Some(&segments[0..2])
        }
        _ => None,
    };

    let channel_segments = channel_segments?;

    let normalized_path = format!("/{}/{}", channel_segments.join("/"), tab);
    parsed.set_path(&normalized_path);
    Some(parsed.to_string())
}

fn is_youtube_channel_content_tab(tab: &str) -> bool {
    matches!(tab, "videos" | "shorts" | "streams")
}

fn is_youtube_host(host: &str) -> bool {
    let host = host.trim_start_matches("www.");
    host == "youtube.com" || host.ends_with(".youtube.com")
}

/// Try to normalize a Douyin modal URL to a direct video URL.
/// Returns `None` when the URL does not match the expected pattern.
fn normalize_douyin(url: &str) -> Option<String> {
    // Split URL into base and query
    let (base, query) = url.split_once('?')?;

    // Already a direct video URL — leave it alone
    let lower_base = base.to_lowercase();
    if lower_base.contains("douyin.com/video/") {
        return None;
    }

    // Must be a douyin.com host
    if !lower_base.contains("douyin.com/") {
        return None;
    }

    // Find modal_id in query parameters
    let modal_id = query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .find(|(key, _)| *key == "modal_id")
        .map(|(_, value)| value)?;

    // Validate: must be a non-empty numeric string
    if modal_id.is_empty() || !modal_id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    Some(format!("https://www.douyin.com/video/{}", modal_id))
}

/// Validate ffmpeg arguments to block dangerous patterns.
/// This is a defense-in-depth measure for AI-generated commands.
pub fn validate_ffmpeg_args(args: &[String]) -> Result<(), String> {
    for arg in args {
        if arg.contains('\0') {
            return Err("Invalid NUL byte in ffmpeg argument".to_string());
        }
        if matches!(arg.as_str(), "&&" | "||" | ";" | "|" | ">" | ">>" | "<") {
            return Err(format!("Shell control operator is not allowed: {}", arg));
        }
        // Block shell injection patterns (shouldn't appear in ffmpeg args)
        if arg.contains('`') || arg.contains("$(") {
            return Err(format!("Dangerous pattern in ffmpeg argument: {}", arg));
        }
        // Block dangerous ffmpeg protocols that could exfiltrate data
        let lower = arg.to_lowercase();
        for proto in &["concat:", "tcp:", "udp:", "ftp:", "smb:", "rtmp:", "rtp:"] {
            if lower.starts_with(proto) {
                return Err(format!("Blocked protocol in ffmpeg argument: {}", arg));
            }
        }
    }
    Ok(())
}

/// Parse an AI-generated FFmpeg command into argv safely.
///
/// Youwee never executes this string through a shell, but parsing still rejects
/// unquoted shell control syntax so malicious model output cannot be carried
/// forward as a plausible command.
pub fn parse_ffmpeg_command_args(command: &str) -> Result<Vec<String>, String> {
    let normalized_command = normalize_ai_escaped_quotes(command);
    let tokens = tokenize_command(&normalized_command)?;
    let program = tokens
        .first()
        .ok_or_else(|| "FFmpeg command cannot be empty".to_string())?;

    if !is_ffmpeg_program(program) {
        return Err("AI response must generate an ffmpeg command only.".to_string());
    }

    let args = tokens[1..].to_vec();
    validate_ffmpeg_args(&args)?;
    Ok(args)
}

fn normalize_ai_escaped_quotes(command: &str) -> String {
    command
        .replace("\\/", "/")
        .replace("\\\"", "\"")
        .replace("\\'", "'")
}

fn is_ffmpeg_program(program: &str) -> bool {
    let normalized = program.trim_matches('"').trim_matches('\'');
    std::path::Path::new(normalized)
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case("ffmpeg") || name.eq_ignore_ascii_case("ffmpeg.exe"))
        .unwrap_or(false)
}

fn tokenize_command(command: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut chars = command.chars().peekable();
    let mut quote: Option<char> = None;

    while let Some(c) = chars.next() {
        match quote {
            Some(q) if c == q => quote = None,
            Some(q) => {
                if c == '\n' || c == '\r' || c == '\0' {
                    return Err("Invalid control character in ffmpeg command".to_string());
                }
                if q == '"' && c == '\\' {
                    if let Some(next) = chars.peek().copied() {
                        if matches!(next, '"' | '\\') {
                            current.push(chars.next().unwrap());
                            continue;
                        }
                    }
                }
                current.push(c);
            }
            None => match c {
                '"' | '\'' => quote = Some(c),
                ' ' | '\t' => {
                    if !current.is_empty() {
                        args.push(std::mem::take(&mut current));
                    }
                }
                '\n' | '\r' | '\0' => {
                    return Err("Invalid control character in ffmpeg command".to_string());
                }
                ';' | '|' | '&' | '<' | '>' => {
                    return Err(format!(
                        "Shell control syntax is not allowed in ffmpeg command: {}",
                        c
                    ));
                }
                '`' => {
                    return Err("Command substitution is not allowed in ffmpeg command".to_string());
                }
                '$' if chars.peek() == Some(&'(') => {
                    return Err("Command substitution is not allowed in ffmpeg command".to_string());
                }
                '\\' => {
                    if let Some(next) = chars.peek().copied() {
                        if is_unquoted_backslash_escape(next) {
                            current.push(chars.next().unwrap());
                        } else {
                            current.push(c);
                        }
                    } else {
                        current.push(c);
                    }
                }
                _ => current.push(c),
            },
        }
    }

    if quote.is_some() {
        return Err("Unclosed quote in ffmpeg command".to_string());
    }
    if !current.is_empty() {
        args.push(current);
    }

    Ok(args)
}

fn is_unquoted_backslash_escape(next: char) -> bool {
    matches!(next, ' ' | '\t' | '"' | '\'' | '\\')
}

/// Convert a Vec of ffmpeg args into a display-friendly command string.
/// Quotes arguments containing spaces.
pub fn args_to_display_command(args: &[String]) -> String {
    let mut parts = vec!["ffmpeg".to_string()];
    for arg in args {
        if arg.contains(' ') || arg.contains('"') || arg.contains('\'') {
            parts.push(format!("\"{}\"", arg.replace('"', "\\\"")));
        } else {
            parts.push(arg.clone());
        }
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    // — Douyin: various pages with modal_id —

    #[test]
    fn douyin_user_profile_modal() {
        let input =
            "https://www.douyin.com/user/self?modal_id=7587779409656007994&showTab=recommend";
        assert_eq!(
            normalize_url(input),
            "https://www.douyin.com/video/7587779409656007994"
        );
    }

    #[test]
    fn douyin_user_profile_with_extra_params() {
        let input = "https://www.douyin.com/user/MS4wLjABAAAApS8G4x1k10StKWUjcUv0nhgo5h4Zio_cfCH5Yjvs0gc?from_tab_name=main&modal_id=7338347129624218919";
        assert_eq!(
            normalize_url(input),
            "https://www.douyin.com/video/7338347129624218919"
        );
    }

    #[test]
    fn douyin_jingxuan_modal() {
        let input = "https://www.douyin.com/jingxuan?modal_id=7612685550327205158";
        assert_eq!(
            normalize_url(input),
            "https://www.douyin.com/video/7612685550327205158"
        );
    }

    #[test]
    fn douyin_jingxuan_search_modal() {
        let input = "https://www.douyin.com/jingxuan/search/%E6%AC%B2%E6%A2%A6?aid=8604cede-cf5d-4750-87e8-9bd39b73b239&modal_id=7602194190675655906&type=general";
        assert_eq!(
            normalize_url(input),
            "https://www.douyin.com/video/7602194190675655906"
        );
    }

    #[test]
    fn douyin_jingxuan_music_modal() {
        let input = "https://www.douyin.com/jingxuan/music?modal_id=7607040283255016755";
        assert_eq!(
            normalize_url(input),
            "https://www.douyin.com/video/7607040283255016755"
        );
    }

    // — Douyin: should NOT transform —

    #[test]
    fn douyin_direct_video_url_unchanged() {
        let input = "https://www.douyin.com/video/7587779409656007994";
        assert_eq!(normalize_url(input), input);
    }

    #[test]
    fn douyin_no_modal_id() {
        let input = "https://www.douyin.com/user/self?showTab=recommend";
        assert_eq!(normalize_url(input), input);
    }

    #[test]
    fn douyin_homepage_no_modal_id() {
        let input = "https://www.douyin.com/?recommend=1";
        assert_eq!(normalize_url(input), input);
    }

    #[test]
    fn douyin_non_numeric_modal_id() {
        let input = "https://www.douyin.com/user/self?modal_id=abc123&showTab=recommend";
        assert_eq!(normalize_url(input), input);
    }

    #[test]
    fn douyin_empty_modal_id() {
        let input = "https://www.douyin.com/user/self?modal_id=&showTab=recommend";
        assert_eq!(normalize_url(input), input);
    }

    // — Other platforms: unchanged —

    #[test]
    fn youtube_url_unchanged() {
        let input = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
        assert_eq!(normalize_url(input), input);
    }

    #[test]
    fn youtube_handle_root_normalizes_to_videos_tab() {
        let input = "https://www.youtube.com/@channelname";
        assert_eq!(
            normalize_url(input),
            "https://www.youtube.com/@channelname/videos"
        );
    }

    #[test]
    fn youtube_handle_root_with_trailing_slash_normalizes_to_videos_tab() {
        let input = "https://www.youtube.com/@channelname/";
        assert_eq!(
            normalize_url(input),
            "https://www.youtube.com/@channelname/videos"
        );
    }

    #[test]
    fn youtube_channel_id_root_normalizes_to_videos_tab() {
        let input = "https://www.youtube.com/channel/UCabc123";
        assert_eq!(
            normalize_url(input),
            "https://www.youtube.com/channel/UCabc123/videos"
        );
    }

    #[test]
    fn youtube_named_channel_roots_normalize_to_videos_tab() {
        assert_eq!(
            normalize_url("https://www.youtube.com/c/channelname"),
            "https://www.youtube.com/c/channelname/videos"
        );
        assert_eq!(
            normalize_url("https://www.youtube.com/user/channelname"),
            "https://www.youtube.com/user/channelname/videos"
        );
    }

    #[test]
    fn youtube_channel_tabs_are_unchanged() {
        for input in [
            "https://www.youtube.com/@channelname/videos",
            "https://www.youtube.com/@channelname/shorts",
            "https://www.youtube.com/@channelname/streams",
            "https://www.youtube.com/@channelname/playlists",
        ] {
            assert_eq!(normalize_url(input), input);
        }
    }

    #[test]
    fn youtube_channel_content_type_short_normalizes_to_shorts_tab() {
        let input = "https://www.youtube.com/@channelname";
        assert_eq!(
            normalize_channel_content_urls(input, Some("shorts")),
            vec!["https://www.youtube.com/@channelname/shorts".to_string()]
        );
    }

    #[test]
    fn youtube_channel_content_type_streams_normalizes_to_streams_tab() {
        let input = "https://www.youtube.com/@channelname/videos";
        assert_eq!(
            normalize_channel_content_urls(input, Some("streams")),
            vec!["https://www.youtube.com/@channelname/streams".to_string()]
        );
    }

    #[test]
    fn youtube_channel_content_type_videos_shorts_returns_both_tabs() {
        let input = "https://www.youtube.com/channel/UCabc123";
        assert_eq!(
            normalize_channel_content_urls(input, Some("videos_shorts")),
            vec![
                "https://www.youtube.com/channel/UCabc123/videos".to_string(),
                "https://www.youtube.com/channel/UCabc123/shorts".to_string(),
            ]
        );
    }

    #[test]
    fn channel_content_type_does_not_touch_non_youtube_urls() {
        let input = "https://space.bilibili.com/12345";
        assert_eq!(
            normalize_channel_content_urls(input, Some("shorts")),
            vec![input.to_string()]
        );
    }

    #[test]
    fn youtube_unsupported_channel_tabs_are_not_rewritten_by_content_type() {
        let input = "https://www.youtube.com/@channelname/playlists";
        assert_eq!(
            normalize_channel_content_urls(input, Some("shorts")),
            vec![input.to_string()]
        );
    }

    #[test]
    fn bilibili_url_unchanged() {
        let input = "https://www.bilibili.com/video/BV1xx411c7mD";
        assert_eq!(normalize_url(input), input);
    }

    #[test]
    fn empty_url_unchanged() {
        assert_eq!(normalize_url(""), "");
    }

    #[test]
    fn parse_ffmpeg_command_accepts_quoted_paths_and_filters() {
        let args = parse_ffmpeg_command_args(
            r#"ffmpeg -y -i "/tmp/Input File.mp4" -filter_complex "[0:v]scale=1280:-1[v];[0:a]anull[a]" -map "[v]" "/tmp/output file.mp4""#,
        )
        .expect("valid ffmpeg command should parse");

        assert_eq!(args[0], "-y");
        assert_eq!(args[2], "/tmp/Input File.mp4");
        assert!(args.contains(&"[0:v]scale=1280:-1[v];[0:a]anull[a]".to_string()));
        assert_eq!(args.last().unwrap(), "/tmp/output file.mp4");
    }

    #[test]
    fn parse_ffmpeg_command_accepts_json_escaped_quoted_paths() {
        let args = parse_ffmpeg_command_args(
            r#"ffmpeg -y -hwaccel auto -i \"/Users/locnguyen/yt/GIẢI CỨU THỎ BẢY MÀU.mp4\" -vn -c:a libmp3lame -q:a 2 -progress pipe:2 \"/Users/locnguyen/yt/GIẢI CỨU THỎ BẢY MÀU_audio.mp3\""#,
        )
        .expect("AI JSON-escaped quotes should still preserve paths with spaces");

        assert_eq!(
            args,
            vec![
                "-y",
                "-hwaccel",
                "auto",
                "-i",
                "/Users/locnguyen/yt/GIẢI CỨU THỎ BẢY MÀU.mp4",
                "-vn",
                "-c:a",
                "libmp3lame",
                "-q:a",
                "2",
                "-progress",
                "pipe:2",
                "/Users/locnguyen/yt/GIẢI CỨU THỎ BẢY MÀU_audio.mp3",
            ]
        );
    }

    #[test]
    fn parse_ffmpeg_command_accepts_json_escaped_slashes() {
        let args = parse_ffmpeg_command_args(
            r#"ffmpeg -y -i "\/Users\/locnguyen\/yt\/ruindkid - Bad Pitch For You.mp4" -filter:a "atempo=2.0" "\/Users\/locnguyen\/yt\/ruindkid - Bad Pitch For You_x2.mp3""#,
        )
        .expect("AI JSON-escaped slashes should be normalized before execution");

        assert_eq!(
            args,
            vec![
                "-y",
                "-i",
                "/Users/locnguyen/yt/ruindkid - Bad Pitch For You.mp4",
                "-filter:a",
                "atempo=2.0",
                "/Users/locnguyen/yt/ruindkid - Bad Pitch For You_x2.mp3",
            ]
        );
    }

    #[test]
    fn parse_ffmpeg_command_preserves_quoted_windows_paths() {
        let args = parse_ffmpeg_command_args(
            r#"ffmpeg -y -i "C:\Users\locnguyen\Videos\Input File.mp4" "C:\Users\locnguyen\Videos\Output File.mp3""#,
        )
        .expect("quoted Windows paths should preserve backslashes");

        assert_eq!(
            args,
            vec![
                "-y",
                "-i",
                r#"C:\Users\locnguyen\Videos\Input File.mp4"#,
                r#"C:\Users\locnguyen\Videos\Output File.mp3"#,
            ]
        );
    }

    #[test]
    fn parse_ffmpeg_command_preserves_unquoted_windows_paths() {
        let args = parse_ffmpeg_command_args(
            r#"ffmpeg -y -i C:\Users\locnguyen\Videos\input.mp4 C:\Users\locnguyen\Videos\output.mp3"#,
        )
        .expect("unquoted Windows paths should preserve backslashes");

        assert_eq!(
            args,
            vec![
                "-y",
                "-i",
                r#"C:\Users\locnguyen\Videos\input.mp4"#,
                r#"C:\Users\locnguyen\Videos\output.mp3"#,
            ]
        );
    }

    #[test]
    fn parse_ffmpeg_command_keeps_unix_escaped_spaces() {
        let args =
            parse_ffmpeg_command_args(r#"ffmpeg -y -i /tmp/Input\ File.mp4 /tmp/Output\ File.mp3"#)
                .expect("escaped spaces should still be accepted for Unix-like paths");

        assert_eq!(
            args,
            vec!["-y", "-i", "/tmp/Input File.mp4", "/tmp/Output File.mp3"]
        );
    }

    #[test]
    fn parse_ffmpeg_command_allows_full_ffmpeg_binary_path() {
        let args = parse_ffmpeg_command_args(r#"/usr/local/bin/ffmpeg -i input.mp4 output.mp4"#)
            .expect("ffmpeg basename should be accepted");

        assert_eq!(args, vec!["-i", "input.mp4", "output.mp4"]);
    }

    #[test]
    fn parse_ffmpeg_command_rejects_shell_injection_operators() {
        let err = parse_ffmpeg_command_args("ffmpeg -i input.mp4 output.mp4 && rm -rf /")
            .expect_err("shell operator should be rejected");

        assert!(err.contains("Shell control syntax"));
    }

    #[test]
    fn parse_ffmpeg_command_rejects_non_ffmpeg_program() {
        let err = parse_ffmpeg_command_args(r#"bash -c "rm -rf /""#)
            .expect_err("non-ffmpeg command should be rejected");

        assert!(err.contains("ffmpeg command only"));
    }

    #[test]
    fn parse_ffmpeg_command_rejects_command_substitution() {
        let err = parse_ffmpeg_command_args("ffmpeg -i $(touch /tmp/pwned) output.mp4")
            .expect_err("command substitution should be rejected");

        assert!(err.contains("Command substitution"));
    }

    #[test]
    fn validate_ffmpeg_args_rejects_shell_operator_arg() {
        let err =
            validate_ffmpeg_args(&["-i".to_string(), "input.mp4".to_string(), "&&".to_string()])
                .expect_err("operator arg should be rejected");

        assert!(err.contains("Shell control operator"));
    }
}
