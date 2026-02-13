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

/// Validate ffmpeg arguments to block dangerous patterns.
/// This is a defense-in-depth measure for AI-generated commands.
pub fn validate_ffmpeg_args(args: &[String]) -> Result<(), String> {
    for arg in args {
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
