use std::path::Path;
use tauri::AppHandle;
use uuid::Uuid;
use crate::services::{
    transcribe_audio, extract_audio_for_whisper, WhisperResponseFormat, WhisperError,
    run_ytdlp_with_stderr_and_cookies, get_ffmpeg_path,
};
use crate::database::add_log_internal;

/// Transcribe a local video/audio file using OpenAI Whisper API
/// 
/// This command:
/// 1. Extracts audio from video if needed (using FFmpeg)
/// 2. Sends audio to OpenAI Whisper API
/// 3. Returns transcription or subtitle content
#[tauri::command]
pub async fn transcribe_video_with_whisper(
    app: AppHandle,
    video_path: String,
    response_format: String, // "text", "srt", "vtt"
    openai_api_key: String,
    language: Option<String>,
    whisper_endpoint_url: Option<String>,
    whisper_model: Option<String>,
) -> Result<String, String> {
    add_log_internal("info", &format!("Starting Whisper transcription for: {}", video_path), None, None).ok();
    
    if openai_api_key.is_empty() {
        return Err(WhisperError::NoApiKey.into());
    }
    
    let path = Path::new(&video_path);
    if !path.exists() {
        return Err(WhisperError::FileNotFound(video_path.clone()).into());
    }
    
    // Parse response format
    let format = match response_format.to_lowercase().as_str() {
        "text" => WhisperResponseFormat::Text,
        "srt" => WhisperResponseFormat::Srt,
        "vtt" => WhisperResponseFormat::Vtt,
        "json" => WhisperResponseFormat::Json,
        _ => WhisperResponseFormat::Text,
    };
    
    // Check if we need to extract audio (video files)
    let extension = path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    let audio_path = if ["mp4", "mkv", "webm", "avi", "mov", "flv"].contains(&extension.as_str()) {
        // Need to extract audio first
        add_log_internal("info", "Extracting audio from video for Whisper...", None, None).ok();
        
        let temp_dir = std::env::temp_dir().join(format!("youwee_whisper_{}", Uuid::new_v4()));
        std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
        
        let audio_output = temp_dir.join("audio.mp3");
        let audio_output_str = audio_output.to_string_lossy().to_string();
        
        // Get FFmpeg path
        let ffmpeg_path = get_ffmpeg_path(&app).await;
        let ffmpeg_path_str = ffmpeg_path.as_ref().map(|p| p.to_string_lossy().to_string());
        
        extract_audio_for_whisper(
            &video_path,
            &audio_output_str,
            ffmpeg_path_str.as_deref(),
        ).await.map_err(|e| e.to_string())?;
        
        audio_output_str
    } else {
        // Already an audio file
        video_path.clone()
    };
    
    // Transcribe with Whisper
    add_log_internal("info", "Sending audio to Whisper API...", None, None).ok();
    
    let result = transcribe_audio(
        &openai_api_key,
        &audio_path,
        format,
        language.as_deref(),
        whisper_endpoint_url.as_deref(),
        whisper_model.as_deref(),
    ).await.map_err(|e| e.to_string())?;
    
    // Clean up temp audio file if we created one
    if audio_path != video_path {
        if let Some(parent) = Path::new(&audio_path).parent() {
            std::fs::remove_dir_all(parent).ok();
        }
    }
    
    add_log_internal("success", &format!("Whisper transcription complete ({} chars)", result.text.len()), None, None).ok();
    
    Ok(result.text)
}

/// Transcribe a video from URL using OpenAI Whisper API
/// 
/// This command:
/// 1. Downloads audio from URL using yt-dlp
/// 2. Sends audio to OpenAI Whisper API
/// 3. Returns transcription or subtitle content
#[tauri::command]
pub async fn transcribe_url_with_whisper(
    app: AppHandle,
    url: String,
    response_format: String, // "text", "srt", "vtt"
    openai_api_key: String,
    language: Option<String>,
    // Cookie params
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    // Proxy
    proxy_url: Option<String>,
    // Whisper backend settings
    whisper_endpoint_url: Option<String>,
    whisper_model: Option<String>,
) -> Result<String, String> {
    add_log_internal("info", &format!("Starting Whisper transcription for URL: {}", url), None, Some(&url)).ok();
    
    if openai_api_key.is_empty() {
        return Err(WhisperError::NoApiKey.into());
    }
    
    // Parse response format
    let format = match response_format.to_lowercase().as_str() {
        "text" => WhisperResponseFormat::Text,
        "srt" => WhisperResponseFormat::Srt,
        "vtt" => WhisperResponseFormat::Vtt,
        "json" => WhisperResponseFormat::Json,
        _ => WhisperResponseFormat::Text,
    };
    
    // Create temp directory
    let temp_dir = std::env::temp_dir().join(format!("youwee_whisper_{}", Uuid::new_v4()));
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    
    let audio_output = temp_dir.join("audio.mp3");
    let audio_output_str = audio_output.to_string_lossy().to_string();
    
    // Download audio only using yt-dlp
    add_log_internal("info", "Downloading audio for Whisper transcription...", None, Some(&url)).ok();
    
    let download_args = vec![
        "-x", // Extract audio
        "--audio-format", "mp3",
        "--audio-quality", "5", // Medium quality (smaller file)
        "-o", &audio_output_str,
        "--no-playlist",
        "--no-warnings",
        &url,
    ];
    
    let result = run_ytdlp_with_stderr_and_cookies(
        &app,
        &download_args,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        proxy_url.as_deref(),
    ).await.map_err(|e| format!("Failed to download audio: {}", e))?;
    
    #[cfg(debug_assertions)]
    {
        if !result.stderr.is_empty() {
            println!("[WHISPER] yt-dlp stderr: {}", result.stderr);
        }
    }
    
    // Find the downloaded file (yt-dlp might add extension)
    let mut audio_file = audio_output_str.clone();
    
    // Check if file exists, if not, try with .mp3 extension
    if !Path::new(&audio_file).exists() {
        let with_ext = format!("{}.mp3", audio_output_str);
        if Path::new(&with_ext).exists() {
            audio_file = with_ext;
        } else {
            // Try to find any audio file in temp dir
            if let Ok(entries) = std::fs::read_dir(&temp_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension() {
                        if ["mp3", "m4a", "webm", "ogg"].contains(&ext.to_string_lossy().as_ref()) {
                            audio_file = path.to_string_lossy().to_string();
                            break;
                        }
                    }
                }
            }
        }
    }
    
    if !Path::new(&audio_file).exists() {
        std::fs::remove_dir_all(&temp_dir).ok();
        return Err("Failed to download audio from URL".to_string());
    }
    
    // Check file size and compress if needed
    let metadata = std::fs::metadata(&audio_file)
        .map_err(|e| format!("Failed to get file metadata: {}", e))?;
    
    let max_size: u64 = 25 * 1024 * 1024; // 25 MB
    
    if metadata.len() > max_size {
        add_log_internal("info", "Audio file too large, compressing...", None, Some(&url)).ok();
        
        // Get FFmpeg path
        let ffmpeg_path = get_ffmpeg_path(&app).await;
        let ffmpeg_path_str = ffmpeg_path.as_ref().map(|p| p.to_string_lossy().to_string());
        
        let compressed_output = temp_dir.join("audio_compressed.mp3");
        let compressed_str = compressed_output.to_string_lossy().to_string();
        
        extract_audio_for_whisper(
            &audio_file,
            &compressed_str,
            ffmpeg_path_str.as_deref(),
        ).await.map_err(|e| e.to_string())?;
        
        audio_file = compressed_str;
    }
    
    // Transcribe with Whisper
    add_log_internal("info", "Sending audio to Whisper API...", None, Some(&url)).ok();
    
    let whisper_result = transcribe_audio(
        &openai_api_key,
        &audio_file,
        format,
        language.as_deref(),
        whisper_endpoint_url.as_deref(),
        whisper_model.as_deref(),
    ).await.map_err(|e| e.to_string())?;
    
    // Clean up temp files
    std::fs::remove_dir_all(&temp_dir).ok();
    
    add_log_internal(
        "success",
        &format!("Whisper transcription complete ({} chars)", whisper_result.text.len()),
        None,
        Some(&url),
    ).ok();
    
    Ok(whisper_result.text)
}

/// Generate subtitles for a video file and save to disk
#[tauri::command]
pub async fn generate_subtitles_with_whisper(
    app: AppHandle,
    video_path: String,
    output_format: String, // "srt" or "vtt"
    openai_api_key: String,
    language: Option<String>,
    whisper_endpoint_url: Option<String>,
    whisper_model: Option<String>,
) -> Result<String, String> {
    // Validate format
    let format = match output_format.to_lowercase().as_str() {
        "srt" => "srt",
        "vtt" => "vtt",
        _ => return Err("Invalid subtitle format. Use 'srt' or 'vtt'.".to_string()),
    };
    
    // Transcribe with Whisper
    let subtitle_content = transcribe_video_with_whisper(
        app,
        video_path.clone(),
        format.to_string(),
        openai_api_key,
        language,
        whisper_endpoint_url,
        whisper_model,
    ).await?;
    
    // Determine output path
    let input_path = Path::new(&video_path);
    let output_path = input_path.with_extension(format);
    let output_str = output_path.to_string_lossy().to_string();
    
    // Save subtitle file
    std::fs::write(&output_path, &subtitle_content)
        .map_err(|e| format!("Failed to save subtitle file: {}", e))?;
    
    add_log_internal(
        "success",
        &format!("Saved subtitles to: {}", output_str),
        None,
        None,
    ).ok();
    
    Ok(output_str)
}
