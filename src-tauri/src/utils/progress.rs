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

/// Parse ffmpeg stderr progress output emitted during mux/merge/postprocess.
///
/// ffmpeg writes lines like:
///   frame=   75 fps=0.0 q=-1.0 Lsize=     133KiB time=00:00:05.00 bitrate= 217.7kbits/s speed= 223x
///
/// Returns (downloaded_size, speed, elapsed_time) when matched.
/// - downloaded_size: output file size so far (e.g. "133KiB")
/// - speed:          processing speed (e.g. "223x")
/// - elapsed_time:   mux progress timestamp (e.g. "00:00:05.00")
pub fn parse_ffmpeg_progress(line: &str) -> Option<(String, String, String)> {
    // Quick guard: ffmpeg progress lines always contain both "time=" and "speed="
    if !line.contains("time=") || !line.contains("speed=") {
        return None;
    }

    let mut size = String::new();
    let mut speed = String::new();
    let mut time = String::new();

    // Extract Lsize= or size= value
    if let Some(re) = regex::Regex::new(r"[Ll]?size=\s*([\d.]+\s*\w+)").ok() {
        if let Some(caps) = re.captures(line) {
            size = caps.get(1).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        }
    }

    // Extract speed= value (e.g. "223x" or "1.5x")
    if let Some(re) = regex::Regex::new(r"speed=\s*([\d.]+x)").ok() {
        if let Some(caps) = re.captures(line) {
            speed = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
    }

    // Extract time= value (e.g. "00:00:05.00")
    if let Some(re) = regex::Regex::new(r"time=\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)").ok() {
        if let Some(caps) = re.captures(line) {
            time = caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        }
    }

    // Must have at least time to be a valid ffmpeg progress line
    if time.is_empty() {
        return None;
    }

    Some((size, speed, time))
}
