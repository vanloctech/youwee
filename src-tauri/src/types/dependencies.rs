use serde::{Deserialize, Serialize};

/// yt-dlp channel selection
#[derive(Clone, Serialize, Deserialize, Debug, Default, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum YtdlpChannel {
    Bundled,
    #[default]
    Stable,
    Nightly,
}

impl YtdlpChannel {
    pub fn as_str(&self) -> &'static str {
        match self {
            YtdlpChannel::Bundled => "bundled",
            YtdlpChannel::Stable => "stable",
            YtdlpChannel::Nightly => "nightly",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "stable" => YtdlpChannel::Stable,
            "nightly" => YtdlpChannel::Nightly,
            _ => YtdlpChannel::Bundled,
        }
    }
}

/// yt-dlp version info for a specific channel
#[derive(Clone, Serialize, Debug)]
pub struct YtdlpChannelInfo {
    pub channel: String,
    pub version: Option<String>,
    pub installed: bool,
    pub binary_path: Option<String>,
}

/// yt-dlp all versions info
#[derive(Clone, Serialize, Debug)]
pub struct YtdlpAllVersions {
    pub current_channel: String,
    pub using_fallback: bool,
    pub bundled: YtdlpChannelInfo,
    pub stable: YtdlpChannelInfo,
    pub nightly: YtdlpChannelInfo,
}

/// yt-dlp channel update info
#[derive(Clone, Serialize, Debug)]
pub struct YtdlpChannelUpdateInfo {
    pub channel: String,
    pub current_version: Option<String>,
    pub latest_version: String,
    pub update_available: bool,
}

/// yt-dlp version info (legacy, for backward compatibility)
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
