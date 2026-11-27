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

fn preferred_fps_filter(preferred_fps: Option<&str>) -> Option<&'static str> {
    match preferred_fps {
        Some("30") => Some("[fps<=30]"),
        _ => None,
    }
}

fn apply_fps_filter(format_string: String, preferred_fps: Option<&str>) -> String {
    let Some(fps_filter) = preferred_fps_filter(preferred_fps) else {
        return format_string;
    };

    format_string
        .split('/')
        .map(|candidate| {
            let leading_len = candidate.len() - candidate.trim_start().len();
            let (leading, trimmed) = candidate.split_at(leading_len);

            if trimmed.starts_with("bestvideo") {
                format!(
                    "{}{}",
                    leading,
                    trimmed.replacen("bestvideo", &format!("bestvideo{}", fps_filter), 1)
                )
            } else if trimmed.starts_with("best[") {
                format!(
                    "{}{}",
                    leading,
                    trimmed.replacen("best[", &format!("best{}[", fps_filter), 1)
                )
            } else if trimmed == "best" {
                format!("{}best{}", leading, fps_filter)
            } else {
                candidate.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// Prefer the audio track that YouTube marks as the original language.
///
/// Multi-language videos can expose an automatically dubbed track as the plain
/// `bestaudio` result, especially when the account/browser language is English.
/// Keep the existing container preference, but fall back progressively so sites
/// that do not expose `format_note=...original...` continue to work normally.
fn prefer_original_audio(format_string: String) -> String {
    const M4A_TOKEN: &str = "__YOUWEE_M4A_AUDIO__";
    const WEBM_TOKEN: &str = "__YOUWEE_WEBM_AUDIO__";
    const ANY_TOKEN: &str = "__YOUWEE_ANY_AUDIO__";

    format_string
        .replace("bestaudio[ext=m4a]", M4A_TOKEN)
        .replace("bestaudio[ext=webm]", WEBM_TOKEN)
        .replace("bestaudio", ANY_TOKEN)
        .replace(
            M4A_TOKEN,
            "(bestaudio[ext=m4a][format_note*=original]/bestaudio[format_note*=original]/bestaudio[ext=m4a]/bestaudio)",
        )
        .replace(
            WEBM_TOKEN,
            "(bestaudio[ext=webm][format_note*=original]/bestaudio[format_note*=original]/bestaudio[ext=webm]/bestaudio)",
        )
        .replace(
            ANY_TOKEN,
            "(bestaudio[format_note*=original]/bestaudio)",
        )
}

/// Build yt-dlp format string based on quality, format, codec and FPS preferences
pub fn build_format_string(
    quality: &str,
    format: &str,
    video_codec: &str,
    preferred_fps: Option<&str>,
) -> String {
    // Audio-only formats
    if quality == "audio" || format == "mp3" || format == "m4a" || format == "opus" {
        let format_string = match format {
            "mp3" => "bestaudio/best".to_string(),
            "m4a" => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
            "opus" => "bestaudio[ext=webm]/bestaudio/best".to_string(),
            _ => "bestaudio[ext=m4a]/bestaudio/best".to_string(),
        };

        return prefer_original_audio(format_string);
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

    let format_string = if format == "webm" {
        let webm_codec_filter = match video_codec {
            "vp9" => "[vcodec^=vp9]",
            "av1" => "[vcodec^=av01]",
            _ => "", // H.264 is not WebM-compatible; use WebM-native codecs instead.
        };

        if let Some(h) = height {
            if !webm_codec_filter.is_empty() {
                format!(
                    "bestvideo[height<={}][ext=webm]{}+bestaudio[ext=webm]/\
                     bestvideo[height<={}][ext=webm]+bestaudio[ext=webm]/\
                     best[height<={}][ext=webm]",
                    h, webm_codec_filter, h, h
                )
            } else if quality == "8k" {
                format!(
                    "bestvideo[height<={}][ext=webm][vcodec^=av01]+bestaudio[ext=webm]/\
                     bestvideo[height<={}][ext=webm][vcodec^=vp9]+bestaudio[ext=webm]/\
                     bestvideo[height<={}][ext=webm]+bestaudio[ext=webm]/\
                     best[height<={}][ext=webm]",
                    h, h, h, h
                )
            } else {
                format!(
                    "bestvideo[height<={}][ext=webm][vcodec^=vp9]+bestaudio[ext=webm]/\
                     bestvideo[height<={}][ext=webm][vcodec^=av01]+bestaudio[ext=webm]/\
                     bestvideo[height<={}][ext=webm]+bestaudio[ext=webm]/\
                     best[height<={}][ext=webm]",
                    h, h, h, h
                )
            }
        } else if !webm_codec_filter.is_empty() {
            format!(
                "bestvideo[ext=webm]{}+bestaudio[ext=webm]/\
                 bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]",
                webm_codec_filter
            )
        } else {
            "bestvideo[ext=webm][vcodec^=vp9]+bestaudio[ext=webm]/\
             bestvideo[ext=webm][vcodec^=av01]+bestaudio[ext=webm]/\
             bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]"
                .to_string()
        }
    } else if format == "mp4" {
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
    };

    prefer_original_audio(apply_fps_filter(format_string, preferred_fps))
}

#[cfg(test)]
mod tests {
    use super::build_format_string;

    #[test]
    fn webm_4k_ignores_h264_and_uses_webm_streams() {
        let format = build_format_string("4k", "webm", "h264", None);

        assert!(format.contains("[ext=webm]"));
        assert!(format.contains("bestaudio[ext=webm][format_note*=original]"));
        assert!(format.contains("[vcodec^=vp9]"));
        assert!(!format.contains("[vcodec^=avc]"));
        assert!(!format.contains("+(bestaudio[format_note*=original]/bestaudio)/"));
    }

    #[test]
    fn webm_respects_compatible_explicit_codec() {
        let format = build_format_string("4k", "webm", "av1", None);

        assert!(format.contains("bestvideo[height<=2160][ext=webm][vcodec^=av01]"));
        assert!(format.contains("bestaudio[ext=webm][format_note*=original]"));
    }

    #[test]
    fn preferred_30fps_filters_video_candidates() {
        let format = build_format_string("1080", "mp4", "auto", Some("30"));

        assert!(format.contains("[fps<=30]"));
        assert!(format.contains("bestvideo[fps<=30][height<=1080][ext=mp4]"));
        assert!(format.contains("best[fps<=30][height<=1080]"));
    }

    #[test]
    fn unsupported_preferred_fps_does_not_filter_video_candidates() {
        let format = build_format_string("1080", "mp4", "auto", Some("60"));

        assert!(!format.contains("[fps<="));
        assert!(format.contains("bestvideo[height<=1080][ext=mp4]"));
    }

    #[test]
    fn video_download_prefers_original_audio_with_normal_fallback() {
        let format = build_format_string("1080", "mp4", "auto", None);

        assert!(format.contains("bestaudio[ext=m4a][format_note*=original]"));
        assert!(format.contains("bestaudio[format_note*=original]"));
        assert!(format.contains("bestaudio[ext=m4a]/bestaudio"));
    }

    #[test]
    fn audio_only_download_prefers_original_audio_with_normal_fallback() {
        let format = build_format_string("audio", "mp3", "auto", None);

        assert!(format.starts_with("(bestaudio[format_note*=original]/bestaudio)"));
        assert!(format.ends_with("/best"));
    }
}
