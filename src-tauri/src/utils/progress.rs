/// Parse yt-dlp progress output
/// Returns (percent, speed, eta, playlist_index, playlist_count, downloaded_size, elapsed_time)
pub fn parse_progress(line: &str) -> Option<(f64, String, String, Option<u32>, Option<u32>, Option<String>, Option<String>)> {
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
        let re = regex::Regex::new(r"(\d+\.?\d*)%.*?(?:at\s+(\S+))?.*?(?:ETA\s+(\S+))?").ok()?;
        if let Some(caps) = re.captures(line) {
            let percent: f64 = caps.get(1)?.as_str().parse().ok()?;
            let speed = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            let eta = caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default();
            return Some((percent, speed, eta, playlist_index, playlist_count, None, None));
        }
    }
    
    // Live stream progress: [download]    2.87MiB at  506.63KiB/s (00:00:07) (frag 91/2097)
    if line.contains("[download]") && !line.contains("%") && line.contains(" at ") {
        let re = regex::Regex::new(
            r"\[download\]\s+([\d.]+\s*\w+)\s+at\s+([\d.]+\s*\w+/s)\s*(?:\((\d{2}:\d{2}:\d{2})\))?"
        ).ok()?;
        if let Some(caps) = re.captures(line) {
            let downloaded_size = caps.get(1).map(|m| m.as_str().trim().to_string());
            let speed = caps.get(2).map(|m| m.as_str().to_string()).unwrap_or_default();
            let elapsed_time = caps.get(3).map(|m| m.as_str().to_string());
            return Some((0.0, speed, String::new(), playlist_index, playlist_count, downloaded_size, elapsed_time));
        }
    }
    
    None
}
