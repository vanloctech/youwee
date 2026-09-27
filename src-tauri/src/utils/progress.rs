/// Parse yt-dlp progress output
/// Returns (percent, speed, eta, playlist_index, playlist_count, downloaded_size, elapsed_time)
pub fn parse_progress(
    line: &str,
) -> Option<(
    f64,
    String,
    String,
    Option<u32>,
    Option<u32>,
    Option<String>,
    Option<String>,
)> {
    let mut playlist_index: Option<u32> = None;
    let mut playlist_count: Option<u32> = None;

    // aria2 writes progress with carriage-return updates instead of yt-dlp's
    // `[download]` format, for example:
    // [#abc 1.0GiB/1.1GiB(96%) CN:16 DL:12MiB ETA:3s]
    // The shell may deliver more than one carriage-return frame in a chunk,
    // so use the last matching frame.
    let aria2_re = regex::Regex::new(
        r"\[#\S+\s+([^/\s]+)/[^\s(]+\(([\d.]+)%\).*?DL:([^\s\]]+)(?:\s+ETA:([^\s\]]+))?",
    )
    .ok()?;
    if let Some(caps) = aria2_re.captures_iter(line).last() {
        let percent = caps.get(2)?.as_str().parse().ok()?;
        return Some((
            percent,
            caps.get(3)
                .map(|value| value.as_str().to_string())
                .unwrap_or_default(),
            caps.get(4)
                .map(|value| value.as_str().to_string())
                .unwrap_or_default(),
            playlist_index,
            playlist_count,
            caps.get(1).map(|value| value.as_str().to_string()),
            None,
        ));
    }

    // Check for playlist progress
    if line.contains("Downloading item") {
        let re = regex::Regex::new(r"Downloading item (\d+) of (\d+)").ok()?;
        if let Some(caps) = re.captures(line) {
            playlist_index = caps.get(1).and_then(|m| m.as_str().parse().ok());
            playlist_count = caps.get(2).and_then(|m| m.as_str().parse().ok());
        }
    }

    // Standard progress with percentage (normal videos)
    if line.contains("[download]") && line.contains("%") {
        // Try to match with speed and ETA
        if line.contains(" at ") {
            let re = regex::Regex::new(r"(\d+\.?\d*)%.*at\s+(\S+)(?:.*ETA\s+(\S+))?").ok()?;
            if let Some(caps) = re.captures(line) {
                let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
                let speed = caps
                    .get(2)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default();
                let eta = caps
                    .get(3)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default();
                return Some((
                    percent,
                    speed,
                    eta,
                    playlist_index,
                    playlist_count,
                    None,
                    None,
                ));
            }
        }
        // Fallback: just extract percent (no speed/eta available)
        let re = regex::Regex::new(r"(\d+\.?\d*)%").ok()?;
        if let Some(caps) = re.captures(line) {
            let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
            return Some((
                percent,
                String::new(),
                String::new(),
                playlist_index,
                playlist_count,
                None,
                None,
            ));
        }
    }

    // Live stream progress: [download]    2.87MiB at  506.63KiB/s (00:00:07) (frag 91/2097)
    if line.contains("[download]") && !line.contains("%") && line.contains(" at ") {
        let re = regex::Regex::new(
            r"\[download\]\s+([\d.]+\s*\w+)\s+at\s+([\d.]+\s*\w+/s)\s*(?:\((\d{2}:\d{2}:\d{2})\))?",
        )
        .ok()?;
        if let Some(caps) = re.captures(line) {
            let downloaded_size = caps.get(1).map(|m| m.as_str().trim().to_string());
            let speed = caps
                .get(2)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default();
            let elapsed_time = caps.get(3).map(|m| m.as_str().to_string());
            return Some((
                0.0,
                speed,
                String::new(),
                playlist_index,
                playlist_count,
                downloaded_size,
                elapsed_time,
            ));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::parse_progress;

    #[test]
    fn parses_aria2_console_progress() {
        let parsed = parse_progress("[#123abc 1.0GiB/1.1GiB(96%) CN:16 DL:12MiB ETA:3s]")
            .expect("aria2 progress");
        assert_eq!(parsed.0, 96.0);
        assert_eq!(parsed.1, "12MiB");
        assert_eq!(parsed.2, "3s");
        assert_eq!(parsed.5.as_deref(), Some("1.0GiB"));
    }

    #[test]
    fn uses_latest_aria2_frame_in_chunk() {
        let parsed = parse_progress(
            "[#id 10MiB/100MiB(10%) CN:4 DL:1MiB ETA:1m]\r[#id 75MiB/100MiB(75%) CN:4 DL:2MiB ETA:12s]",
        )
        .expect("latest aria2 progress");
        assert_eq!(parsed.0, 75.0);
        assert_eq!(parsed.1, "2MiB");
    }
}
