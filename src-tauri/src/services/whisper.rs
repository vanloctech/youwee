use reqwest::multipart::{Form, Part};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

/// Whisper API response format
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum WhisperResponseFormat {
    Json,
    Text,
    Srt,
    Vtt,
    VerboseJson,
}

impl Default for WhisperResponseFormat {
    fn default() -> Self {
        WhisperResponseFormat::Text
    }
}

impl std::fmt::Display for WhisperResponseFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WhisperResponseFormat::Json => write!(f, "json"),
            WhisperResponseFormat::Text => write!(f, "text"),
            WhisperResponseFormat::Srt => write!(f, "srt"),
            WhisperResponseFormat::Vtt => write!(f, "vtt"),
            WhisperResponseFormat::VerboseJson => write!(f, "verbose_json"),
        }
    }
}

/// Whisper transcription result
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhisperResult {
    pub text: String,
    pub duration_seconds: Option<f64>,
    pub language: Option<String>,
}

/// Error types for Whisper operations
#[derive(Debug)]
pub enum WhisperError {
    NoApiKey,
    FileNotFound(String),
    FileTooLarge(u64), // Size in bytes
    UnsupportedFormat(String),
    ApiError(String),
    NetworkError(String),
    ParseError(String),
    FfmpegError(String),
}

impl std::fmt::Display for WhisperError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WhisperError::NoApiKey => write!(f, "OpenAI API key not configured for Whisper."),
            WhisperError::FileNotFound(path) => write!(f, "Audio file not found: {}", path),
            WhisperError::FileTooLarge(size) => write!(
                f,
                "Audio file too large ({:.1} MB). Whisper API limit is 25 MB.",
                *size as f64 / 1_000_000.0
            ),
            WhisperError::UnsupportedFormat(fmt) => {
                write!(f, "Unsupported audio format: {}. Use mp3, mp4, m4a, wav, or webm.", fmt)
            }
            WhisperError::ApiError(msg) => write!(f, "Whisper API error: {}", msg),
            WhisperError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            WhisperError::ParseError(msg) => write!(f, "Failed to parse Whisper response: {}", msg),
            WhisperError::FfmpegError(msg) => write!(f, "FFmpeg error: {}", msg),
        }
    }
}

impl From<WhisperError> for String {
    fn from(err: WhisperError) -> String {
        err.to_string()
    }
}

/// Maximum file size for Whisper API (25 MB)
const MAX_FILE_SIZE: u64 = 25 * 1024 * 1024;

/// Supported audio formats for Whisper
const SUPPORTED_FORMATS: &[&str] = &["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg"];

/// Transcribe audio file using OpenAI Whisper API
/// 
/// # Arguments
/// * `api_key` - OpenAI API key
/// * `audio_path` - Path to audio/video file
/// * `response_format` - Desired output format (text, srt, vtt, json)
/// * `language` - Optional language hint (e.g., "en", "vi", "ja")
/// 
/// # Returns
/// Transcription text or subtitle content
pub async fn transcribe_audio(
    api_key: &str,
    audio_path: &str,
    response_format: WhisperResponseFormat,
    language: Option<&str>,
) -> Result<WhisperResult, WhisperError> {
    let path = Path::new(audio_path);
    
    // Validate file exists
    if !path.exists() {
        return Err(WhisperError::FileNotFound(audio_path.to_string()));
    }
    
    // Get file metadata
    let metadata = fs::metadata(path)
        .await
        .map_err(|e| WhisperError::FileNotFound(format!("{}: {}", audio_path, e)))?;
    
    // Check file size
    if metadata.len() > MAX_FILE_SIZE {
        return Err(WhisperError::FileTooLarge(metadata.len()));
    }
    
    // Validate format
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    if !SUPPORTED_FORMATS.contains(&extension.as_str()) {
        return Err(WhisperError::UnsupportedFormat(extension));
    }
    
    // Read file content
    let file_bytes = fs::read(path)
        .await
        .map_err(|e| WhisperError::FileNotFound(format!("Failed to read file: {}", e)))?;
    
    // Get filename for the multipart form
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("audio.mp3")
        .to_string();
    
    // Determine MIME type
    let mime_type = match extension.as_str() {
        "mp3" | "mpga" => "audio/mpeg",
        "mp4" | "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "webm" => "audio/webm",
        "ogg" => "audio/ogg",
        _ => "audio/mpeg",
    };
    
    // Build multipart form
    let file_part = Part::bytes(file_bytes)
        .file_name(filename)
        .mime_str(mime_type)
        .map_err(|e| WhisperError::ParseError(format!("Invalid MIME type: {}", e)))?;
    
    let mut form = Form::new()
        .part("file", file_part)
        .text("model", "whisper-1")
        .text("response_format", response_format.to_string());
    
    // Add language hint if provided
    if let Some(lang) = language {
        form = form.text("language", lang.to_string());
    }
    
    // Send request
    let client = Client::new();
    let response = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .header("Authorization", format!("Bearer {}", api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| WhisperError::NetworkError(e.to_string()))?;
    
    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    
    #[cfg(debug_assertions)]
    {
        println!("[WHISPER] Response status: {}", status);
        println!("[WHISPER] Response (first 500 chars): {}", &response_text[..response_text.len().min(500)]);
    }
    
    if !status.is_success() {
        // Try to parse error message from JSON response
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&response_text) {
            let error_msg = error_json
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or(&response_text);
            return Err(WhisperError::ApiError(error_msg.to_string()));
        }
        return Err(WhisperError::ApiError(format!("Status {}: {}", status, response_text)));
    }
    
    // Parse response based on format
    match response_format {
        WhisperResponseFormat::Text | WhisperResponseFormat::Srt | WhisperResponseFormat::Vtt => {
            // These formats return plain text
            Ok(WhisperResult {
                text: response_text,
                duration_seconds: None,
                language: None,
            })
        }
        WhisperResponseFormat::Json => {
            // JSON format: {"text": "..."}
            let json: serde_json::Value = serde_json::from_str(&response_text)
                .map_err(|e| WhisperError::ParseError(e.to_string()))?;
            
            let text = json
                .get("text")
                .and_then(|t| t.as_str())
                .ok_or_else(|| WhisperError::ParseError("No text in response".to_string()))?;
            
            Ok(WhisperResult {
                text: text.to_string(),
                duration_seconds: None,
                language: None,
            })
        }
        WhisperResponseFormat::VerboseJson => {
            // Verbose JSON includes duration and language
            let json: serde_json::Value = serde_json::from_str(&response_text)
                .map_err(|e| WhisperError::ParseError(e.to_string()))?;
            
            let text = json
                .get("text")
                .and_then(|t| t.as_str())
                .ok_or_else(|| WhisperError::ParseError("No text in response".to_string()))?;
            
            let duration = json.get("duration").and_then(|d| d.as_f64());
            let language = json.get("language").and_then(|l| l.as_str()).map(|s| s.to_string());
            
            Ok(WhisperResult {
                text: text.to_string(),
                duration_seconds: duration,
                language,
            })
        }
    }
}

/// Extract audio from video file using FFmpeg
/// Creates a compressed MP3 file suitable for Whisper API
/// 
/// # Arguments
/// * `input_path` - Path to video file
/// * `output_path` - Path for output audio file
/// * `ffmpeg_path` - Path to FFmpeg binary
/// 
/// # Returns
/// Path to extracted audio file
pub async fn extract_audio_for_whisper(
    input_path: &str,
    output_path: &str,
    ffmpeg_path: Option<&str>,
) -> Result<String, WhisperError> {
    use tokio::process::Command;
    use crate::utils::CommandExt;
    
    let ffmpeg = ffmpeg_path.unwrap_or("ffmpeg");
    
    // Extract audio as mono MP3 at 64kbps (compact for Whisper)
    // -vn: no video
    // -ac 1: mono audio (smaller file)
    // -b:a 64k: 64kbps bitrate (good enough for speech)
    let mut cmd = Command::new(ffmpeg);
    cmd.args([
            "-i", input_path,
            "-vn",
            "-acodec", "libmp3lame",
            "-ac", "1",
            "-b:a", "64k",
            "-y", // Overwrite output
            output_path,
        ]);
    cmd.hide_window();
    let output = cmd.output().await
        .map_err(|e| WhisperError::FfmpegError(format!("Failed to run FFmpeg: {}", e)))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WhisperError::FfmpegError(format!("FFmpeg failed: {}", stderr)));
    }
    
    // Verify output file exists and is within size limit
    let metadata = fs::metadata(output_path)
        .await
        .map_err(|e| WhisperError::FfmpegError(format!("Output file not created: {}", e)))?;
    
    if metadata.len() > MAX_FILE_SIZE {
        // Try again with even lower bitrate
        let _ = fs::remove_file(output_path).await;
        
        let mut cmd2 = Command::new(ffmpeg);
        cmd2.args([
                "-i", input_path,
                "-vn",
                "-acodec", "libmp3lame",
                "-ac", "1",
                "-b:a", "32k", // Even lower bitrate
                "-y",
                output_path,
            ]);
        cmd2.hide_window();
        let output = cmd2.output().await
            .map_err(|e| WhisperError::FfmpegError(format!("Failed to run FFmpeg: {}", e)))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(WhisperError::FfmpegError(format!("FFmpeg failed: {}", stderr)));
        }
        
        // Check size again
        let metadata = fs::metadata(output_path)
            .await
            .map_err(|e| WhisperError::FfmpegError(format!("Output file not created: {}", e)))?;
        
        if metadata.len() > MAX_FILE_SIZE {
            return Err(WhisperError::FileTooLarge(metadata.len()));
        }
    }
    
    Ok(output_path.to_string())
}

/// Get audio duration in seconds using FFprobe
pub async fn get_audio_duration(
    audio_path: &str,
    ffprobe_path: Option<&str>,
) -> Result<f64, WhisperError> {
    use tokio::process::Command;
    use crate::utils::CommandExt;
    
    let ffprobe = ffprobe_path.unwrap_or("ffprobe");
    
    let mut cmd = Command::new(ffprobe);
    cmd.args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ]);
    cmd.hide_window();
    let output = cmd.output().await
        .map_err(|e| WhisperError::FfmpegError(format!("Failed to run ffprobe: {}", e)))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(WhisperError::FfmpegError(format!("ffprobe failed: {}", stderr)));
    }
    
    let duration_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
    duration_str
        .parse::<f64>()
        .map_err(|e| WhisperError::ParseError(format!("Invalid duration '{}': {}", duration_str, e)))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_response_format_display() {
        assert_eq!(WhisperResponseFormat::Text.to_string(), "text");
        assert_eq!(WhisperResponseFormat::Srt.to_string(), "srt");
        assert_eq!(WhisperResponseFormat::Vtt.to_string(), "vtt");
        assert_eq!(WhisperResponseFormat::Json.to_string(), "json");
        assert_eq!(WhisperResponseFormat::VerboseJson.to_string(), "verbose_json");
    }
    
    #[test]
    fn test_error_display() {
        let err = WhisperError::FileTooLarge(30_000_000);
        assert!(err.to_string().contains("30.0 MB"));
        
        let err = WhisperError::UnsupportedFormat("xyz".to_string());
        assert!(err.to_string().contains("xyz"));
    }
}
