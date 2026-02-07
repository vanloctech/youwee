/// Format file size in human readable format
pub fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;

    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.2} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.2} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Build yt-dlp format string based on quality, format and codec preferences
pub fn build_format_string(quality: &str, format: &str, video_codec: &str) -> String {
    // Audio-only formats
    if quality == "audio" || format == "mp3" || format == "m4a" || format == "opus" {
        return match format {
            "mp3" => "bestaudio/best".to_string(),
            "m4a" => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
            "opus" => "bestaudio[ext=webm]/bestaudio/best".to_string(),
            _ => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
        };
    }

    let height = match quality {
        "8k" => Some("4320"),
        "4k" => Some("2160"),
        "2k" => Some("1440"),
        "1080" => Some("1080"),
        "720" => Some("720"),
        "480" => Some("480"),
        "360" => Some("360"),
        _ => None,
    };

    // Build codec filter based on user selection
    // Respect user's explicit codec choice for ALL qualities
    let codec_filter = match video_codec {
        "h264" => "[vcodec^=avc]",
        "vp9" => "[vcodec^=vp9]",
        "av1" => "[vcodec^=av01]",
        _ => "", // auto - no codec filter, handled separately for high-res
    };

    let is_high_res = matches!(quality, "8k" | "4k" | "2k");
    let is_auto_codec = video_codec == "auto" || video_codec.is_empty();

    if format == "mp4" {
        if let Some(h) = height {
            if is_high_res && is_auto_codec {
                // High-res auto codec: prioritize by resolution, smart codec fallback
                if quality == "8k" {
                    // 8K: AV1 first (most 8K is AV1-only), then VP9, then any
                    format!(
                        "bestvideo[height<={}][vcodec^=av01]+bestaudio/\
                         bestvideo[height<={}][vcodec^=vp9]+bestaudio/\
                         bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                        h, h, h, h
                    )
                } else {
                    // 4K/2K: VP9 first (good compatibility), then AV1, then any
                    format!(
                        "bestvideo[height<={}][vcodec^=vp9]+bestaudio/\
                         bestvideo[height<={}][vcodec^=av01]+bestaudio/\
                         bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                        h, h, h, h
                    )
                }
            } else if !codec_filter.is_empty() {
                // Explicit codec choice: try with codec filter, fallback without
                format!(
                    "bestvideo[height<={}]{}[ext=mp4]+bestaudio[ext=m4a]/\
                     bestvideo[height<={}]{}+bestaudio/\
                     bestvideo[height<={}][ext=mp4]+bestaudio[ext=m4a]/\
                     bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, codec_filter, h, codec_filter, h, h, h
                )
            } else {
                format!(
                    "bestvideo[height<={}][ext=mp4]+bestaudio[ext=m4a]/\
                     bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, h, h
                )
            }
        } else if is_auto_codec {
            // "best" quality with auto codec
            "bestvideo+bestaudio/best".to_string()
        } else {
            // "best" quality with explicit codec
            format!(
                "bestvideo{}+bestaudio/bestvideo+bestaudio/best",
                codec_filter
            )
        }
    } else if let Some(h) = height {
        if is_high_res && is_auto_codec {
            // High-res auto codec (non-mp4): same smart fallback
            if quality == "8k" {
                format!(
                    "bestvideo[height<={}][vcodec^=av01]+bestaudio/\
                     bestvideo[height<={}][vcodec^=vp9]+bestaudio/\
                     bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, h, h, h
                )
            } else {
                format!(
                    "bestvideo[height<={}][vcodec^=vp9]+bestaudio/\
                     bestvideo[height<={}][vcodec^=av01]+bestaudio/\
                     bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                    h, h, h, h
                )
            }
        } else if !codec_filter.is_empty() {
            // Explicit codec: try with filter, fallback without
            format!(
                "bestvideo[height<={}]{}+bestaudio/\
                 bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                h, codec_filter, h, h
            )
        } else {
            format!(
                "bestvideo[height<={}]+bestaudio/best[height<={}]/best",
                h, h
            )
        }
    } else if is_auto_codec {
        // "best" quality with auto codec
        "bestvideo+bestaudio/best".to_string()
    } else {
        // "best" quality with explicit codec
        format!(
            "bestvideo{}+bestaudio/bestvideo+bestaudio/best",
            codec_filter
        )
    }
}
