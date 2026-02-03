use serde::Serialize;

/// yt-dlp version info
#[derive(Clone, Serialize, Debug)]
pub struct YtdlpVersionInfo {
    pub version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub is_bundled: bool,
    pub binary_path: String,
}

/// FFmpeg installation status
#[derive(Clone, Serialize, Debug)]
pub struct FfmpegStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub is_system: bool,
}

/// Deno runtime installation status
#[derive(Clone, Serialize, Debug)]
pub struct DenoStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub binary_path: Option<String>,
    pub is_system: bool,
}
