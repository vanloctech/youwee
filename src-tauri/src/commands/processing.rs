use std::collections::HashMap;
use std::path::Path;
use std::process::Stdio;
use std::sync::LazyLock;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use rusqlite::params;

use crate::database::get_db;
use crate::services::{get_ffmpeg_path, generate_raw, AIConfig};

// Store for active processing jobs
static ACTIVE_JOBS: LazyLock<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>> = 
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Parse a shell command string into arguments, respecting quotes
fn parse_shell_command(cmd: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut quote_char = ' ';
    let mut chars = cmd.chars().peekable();
    
    while let Some(c) = chars.next() {
        match c {
            '"' | '\'' if !in_quotes => {
                in_quotes = true;
                quote_char = c;
            }
            c if in_quotes && c == quote_char => {
                in_quotes = false;
            }
            '\\' if chars.peek() == Some(&'"') || chars.peek() == Some(&'\'') => {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            }
            ' ' | '\t' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => {
                current.push(c);
            }
        }
    }
    
    if !current.is_empty() {
        args.push(current);
    }
    
    args
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoMetadata {
    pub path: String,
    pub filename: String,
    pub duration: f64,
    pub width: i32,
    pub height: i32,
    pub fps: f64,
    pub video_codec: String,
    pub audio_codec: String,
    pub bitrate: i64,
    pub file_size: i64,
    pub format: String,
    pub has_audio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FFmpegCommandResult {
    pub command: String,
    pub explanation: String,
    pub estimated_size_mb: f64,
    pub estimated_time_seconds: f64,
    pub output_path: String,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingProgress {
    pub job_id: String,
    pub percent: f64,
    pub frame: i64,
    pub total_frames: i64,
    pub fps: f64,
    pub speed: String,
    pub time: String,
    pub size: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingJob {
    pub id: String,
    pub input_path: String,
    pub output_path: Option<String>,
    pub task_type: String,
    pub user_prompt: Option<String>,
    pub ffmpeg_command: String,
    pub status: String,
    pub progress: f64,
    pub error_message: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessingPreset {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub task_type: String,
    pub prompt_template: String,
    pub icon: Option<String>,
    pub created_at: String,
}

/// Get video metadata using FFprobe
#[tauri::command]
pub async fn get_video_metadata(app: AppHandle, path: String) -> Result<VideoMetadata, String> {
    let ffprobe_path = get_ffprobe_path(&app).await
        .ok_or("FFprobe not found. Please install FFmpeg.")?;
    
    let output = Command::new(&ffprobe_path)
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &path,
        ])
        .output()
        .await
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;
    
    if !output.status.success() {
        return Err("FFprobe failed to analyze video".to_string());
    }
    
    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;
    
    // Extract video stream info
    let streams = json.get("streams").and_then(|s| s.as_array()).ok_or("No streams found")?;
    let format = json.get("format").ok_or("No format info")?;
    
    let video_stream = streams.iter().find(|s| {
        s.get("codec_type").and_then(|c| c.as_str()) == Some("video")
    });
    
    let audio_stream = streams.iter().find(|s| {
        s.get("codec_type").and_then(|c| c.as_str()) == Some("audio")
    });
    
    let filename = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    
    let duration = format.get("duration")
        .and_then(|d| d.as_str())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);
    
    let (width, height, fps, video_codec) = if let Some(vs) = video_stream {
        let w = vs.get("width").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let h = vs.get("height").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
        let codec = vs.get("codec_name").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
        
        // Parse FPS from r_frame_rate (e.g., "30/1" or "30000/1001")
        let fps_str = vs.get("r_frame_rate").and_then(|v| v.as_str()).unwrap_or("0/1");
        let fps_parts: Vec<&str> = fps_str.split('/').collect();
        let fps = if fps_parts.len() == 2 {
            let num = fps_parts[0].parse::<f64>().unwrap_or(0.0);
            let den = fps_parts[1].parse::<f64>().unwrap_or(1.0);
            if den > 0.0 { num / den } else { 0.0 }
        } else {
            fps_str.parse::<f64>().unwrap_or(0.0)
        };
        
        (w, h, fps, codec)
    } else {
        (0, 0, 0.0, "none".to_string())
    };
    
    let audio_codec = audio_stream
        .and_then(|a| a.get("codec_name"))
        .and_then(|c| c.as_str())
        .unwrap_or("none")
        .to_string();
    
    let bitrate = format.get("bit_rate")
        .and_then(|b| b.as_str())
        .and_then(|b| b.parse::<i64>().ok())
        .unwrap_or(0) / 1000; // Convert to kbps
    
    let file_size = format.get("size")
        .and_then(|s| s.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .unwrap_or(0);
    
    let format_name = format.get("format_name")
        .and_then(|f| f.as_str())
        .unwrap_or("unknown")
        .split(',')
        .next()
        .unwrap_or("unknown")
        .to_string();
    
    Ok(VideoMetadata {
        path,
        filename,
        duration,
        width,
        height,
        fps,
        video_codec,
        audio_codec,
        bitrate,
        file_size,
        format: format_name,
        has_audio: audio_stream.is_some(),
    })
}

/// Generate FFmpeg command using AI
#[tauri::command]
pub async fn generate_processing_command(
    app: AppHandle,
    input_path: String,
    user_prompt: String,
    timeline_start: Option<f64>,
    timeline_end: Option<f64>,
    metadata: VideoMetadata,
) -> Result<FFmpegCommandResult, String> {
    // Build context for AI
    let selection_info = if let (Some(start), Some(end)) = (timeline_start, timeline_end) {
        format!("Timeline selection: {} to {} ({} seconds)", 
            format_time(start), format_time(end), end - start)
    } else {
        "No timeline selection".to_string()
    };
    
    let ai_prompt = format!(
        r#"You are an FFmpeg command generator assistant. Your ONLY job is to convert video editing requests into FFmpeg commands.

## Video Information
- File: {}
- Full Path: {}
- Duration: {} ({} seconds)
- Resolution: {}x{}
- FPS: {:.2}
- Video Codec: {}
- Audio Codec: {}
- Bitrate: {} kbps
- Size: {} MB
- {}

## User Request
{}

## IMPORTANT: Topic Detection
First, determine if the user's request is related to video/audio processing. Valid requests include:
- Cutting, trimming, splitting video
- Converting formats, codecs, resolution
- Extracting audio, removing audio
- Changing speed, rotating, flipping
- Compressing, resizing
- Creating GIFs, thumbnails
- Adding/removing subtitles
- Any FFmpeg-related operation

If the request is NOT related to video/audio processing (e.g., general chat, questions, greetings, unrelated topics), respond with:
```json
{{
  "off_topic": true,
  "message": "I can only help with video editing tasks. Please describe what you'd like to do with your video, such as cutting, converting, resizing, or extracting audio."
}}
```

## Rules for Valid Video Requests
1. Use -y flag to overwrite output
2. Preserve quality unless asked to reduce
3. Use -ss BEFORE -i for fast seeking when cutting
4. Output to same directory with descriptive suffix (e.g., _cut, _720p, _audio)
5. Use hardware acceleration when beneficial (-hwaccel auto)
6. Include -progress pipe:2 for progress tracking (outputs to stderr)
7. IMPORTANT: Use the exact full path provided above for input and output files
8. Wrap file paths in double quotes

## Response Format (JSON only, no markdown outside)
For valid video requests:
```json
{{
  "command": "ffmpeg -y -ss 00:02:00.000 -i \\\"/full/path/to/input.mp4\\\" -t 10 -c copy -progress pipe:2 \\\"/full/path/to/input_cut.mp4\\\"",
  "explanation": "Brief explanation of what this command does",
  "estimated_size_mb": 50,
  "estimated_time_seconds": 30,
  "output_path": "/full/path/to/output.mp4",
  "warnings": []
}}
```
"#,
        metadata.filename,
        input_path,
        format_time(metadata.duration),
        metadata.duration,
        metadata.width,
        metadata.height,
        metadata.fps,
        metadata.video_codec,
        metadata.audio_codec,
        metadata.bitrate,
        metadata.file_size / 1_000_000,
        selection_info,
        user_prompt,
    );
    
    // Load AI config
    let config = load_ai_config(&app).await?;
    
    if !config.enabled {
        return Err("AI is not enabled. Please configure AI in Settings.".to_string());
    }
    
    // Generate using AI (raw mode, no summarization wrapping)
    let result = generate_raw(&config, &ai_prompt).await
        .map_err(|e| format!("AI generation failed: {}", e))?;
    
    #[cfg(debug_assertions)]
    {
        println!("[PROCESSING] AI Response: {}", &result.summary[..result.summary.len().min(500)]);
    }
    
    // Parse JSON from response
    let response_text = result.summary.trim();
    
    // Try to extract JSON from the response (handle markdown code blocks)
    let json_str = if response_text.starts_with('{') {
        response_text.to_string()
    } else {
        // Try to find JSON in markdown code block
        let cleaned = response_text
            .replace("```json", "")
            .replace("```", "");
        
        if let Some(start) = cleaned.find('{') {
            if let Some(end) = cleaned.rfind('}') {
                cleaned[start..=end].to_string()
            } else {
                return Err(format!("Invalid AI response: no valid JSON found. Response: {}", 
                    &response_text[..response_text.len().min(200)]));
            }
        } else {
            return Err(format!("Invalid AI response: no JSON found. Response: {}", 
                &response_text[..response_text.len().min(200)]));
        }
    };
    
    let parsed: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;
    
    // Check if AI detected off-topic request
    if parsed.get("off_topic").and_then(|v| v.as_bool()).unwrap_or(false) {
        let message = parsed.get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("I can only help with video editing tasks.");
        return Err(message.to_string());
    }
    
    // Replace placeholder paths with actual paths
    let command = parsed.get("command")
        .and_then(|c| c.as_str())
        .ok_or("No command in response")?
        .replace("{input}", &input_path);
    
    // Generate timestamp for unique output names
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let input_stem = Path::new(&input_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or("output".to_string());
    let input_dir = Path::new(&input_path).parent().unwrap_or(Path::new("."));
    
    let output_path = parsed.get("output_path")
        .and_then(|p| p.as_str())
        .map(|p| {
            // Extract extension from AI's suggested path
            let ext = Path::new(p)
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or("mp4".to_string());
            
            // Extract suffix (like _cut, _720p, etc.) from AI's path
            let ai_stem = Path::new(p)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            
            // Try to find a suffix pattern in AI's filename
            let suffix = if ai_stem.contains("_cut") {
                "_cut"
            } else if ai_stem.contains("_720p") {
                "_720p"
            } else if ai_stem.contains("_1080p") {
                "_1080p"
            } else if ai_stem.contains("_compressed") {
                "_compressed"
            } else if ai_stem.contains("_audio") {
                "_audio"
            } else {
                "_processed"
            };
            
            // Build output path with timestamp
            input_dir.join(format!("{}{}_{}.{}", input_stem, suffix, timestamp, ext))
                .to_string_lossy().to_string()
        })
        .unwrap_or_else(|| {
            input_dir.join(format!("{}_processed_{}.mp4", input_stem, timestamp))
                .to_string_lossy().to_string()
        });
    
    // Update command with the new timestamped output path
    let command = if let Some(ai_output) = parsed.get("output_path").and_then(|p| p.as_str()) {
        command.replace(ai_output, &output_path)
    } else {
        command
    };
    
    Ok(FFmpegCommandResult {
        command,
        explanation: parsed.get("explanation")
            .and_then(|e| e.as_str())
            .unwrap_or("Processing video...")
            .to_string(),
        estimated_size_mb: parsed.get("estimated_size_mb")
            .and_then(|s| s.as_f64())
            .unwrap_or(0.0),
        estimated_time_seconds: parsed.get("estimated_time_seconds")
            .and_then(|t| t.as_f64())
            .unwrap_or(0.0),
        output_path,
        warnings: parsed.get("warnings")
            .and_then(|w| w.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
            .unwrap_or_default(),
    })
}

/// Generate command for quick actions (without AI)
#[tauri::command]
pub async fn generate_quick_action_command(
    input_path: String,
    task_type: String,
    options: HashMap<String, serde_json::Value>,
    timeline_start: Option<f64>,
    timeline_end: Option<f64>,
    metadata: VideoMetadata,
) -> Result<FFmpegCommandResult, String> {
    let input_dir = Path::new(&input_path).parent().unwrap_or(Path::new("."));
    let input_stem = Path::new(&input_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or("output".to_string());
    
    // Generate timestamp suffix for unique output names
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    
    let (command, output_path, explanation) = match task_type.as_str() {
        "cut" => {
            let start = timeline_start.ok_or("No start time selected")?;
            let end = timeline_end.ok_or("No end time selected")?;
            let duration = end - start;
            let output = input_dir.join(format!("{}_cut_{}.mp4", input_stem, timestamp));
            
            let cmd = format!(
                "ffmpeg -y -ss {} -i \"{}\" -t {} -c copy -progress pipe:2 \"{}\"",
                format_time(start), input_path, duration, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(), 
             format!("Cut video from {} to {} (duration: {})", 
                format_time(start), format_time(end), format_time(duration)))
        }
        
        "extract_audio" => {
            let format = options.get("format")
                .and_then(|f| f.as_str())
                .unwrap_or("mp3");
            
            let (ext, codec) = match format {
                "m4a" => ("m4a", "-c:a copy"),
                "flac" => ("flac", "-c:a flac"),
                "wav" => ("wav", "-c:a pcm_s16le"),
                "mp3" => ("m4a", "-c:a aac -b:a 192k"), // MP3 not available, use M4A/AAC instead
                _ => ("m4a", "-c:a aac -b:a 192k"),
            };
            
            let output = input_dir.join(format!("{}_{}.{}", input_stem, timestamp, ext));
            
            let cmd = format!(
                "ffmpeg -y -i \"{}\" -vn {} -progress pipe:2 \"{}\"",
                input_path, codec, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             format!("Extract audio as {}", ext.to_uppercase()))
        }
        
        "resize" => {
            let resolution = options.get("resolution")
                .and_then(|r| r.as_str())
                .unwrap_or("720");
            
            let output = input_dir.join(format!("{}_{}p_{}.mp4", input_stem, resolution, timestamp));
            
            let cmd = format!(
                "ffmpeg -y -i \"{}\" -vf scale=-1:{} -c:v libx264 -preset medium -crf 23 -c:a copy -progress pipe:2 \"{}\"",
                input_path, resolution, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             format!("Resize video to {}p", resolution))
        }
        
        "convert" => {
            let format = options.get("format")
                .and_then(|f| f.as_str())
                .unwrap_or("mp4");
            
            let output = input_dir.join(format!("{}_{}.{}", input_stem, timestamp, format));
            
            let codec_args = match format {
                "webm" => "-c:v libvpx-vp9 -c:a libopus",
                "mkv" => "-c:v copy -c:a copy",
                "avi" => "-c:v libxvid -c:a mp3",
                "mov" => "-c:v libx264 -c:a aac",
                _ => "-c:v libx264 -c:a aac",
            };
            
            let cmd = format!(
                "ffmpeg -y -i \"{}\" {} -progress pipe:2 \"{}\"",
                input_path, codec_args, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             format!("Convert to {}", format.to_uppercase()))
        }
        
        "speed" => {
            let speed = options.get("speed")
                .and_then(|s| s.as_f64())
                .unwrap_or(2.0);
            
            let output = input_dir.join(format!("{}_{}x_{}.mp4", input_stem, speed, timestamp));
            let pts = 1.0 / speed;
            let atempo = speed.min(2.0).max(0.5); // atempo only supports 0.5-2.0
            
            let cmd = format!(
                "ffmpeg -y -i \"{}\" -filter_complex \"[0:v]setpts={}*PTS[v];[0:a]atempo={}[a]\" -map \"[v]\" -map \"[a]\" -progress pipe:2 \"{}\"",
                input_path, pts, atempo, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             format!("Change speed to {}x", speed))
        }
        
        "compress" => {
            let output = input_dir.join(format!("{}_compressed_{}.mp4", input_stem, timestamp));
            
            let cmd = format!(
                "ffmpeg -y -i \"{}\" -c:v libx264 -preset slow -crf 28 -c:a aac -b:a 128k -progress pipe:2 \"{}\"",
                input_path, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             "Compress video to reduce file size".to_string())
        }
        
        "remove_audio" => {
            let output = input_dir.join(format!("{}_noaudio_{}.mp4", input_stem, timestamp));
            
            let cmd = format!(
                "ffmpeg -y -i \"{}\" -c:v copy -an -progress pipe:2 \"{}\"",
                input_path, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             "Remove audio track".to_string())
        }
        
        "thumbnail" => {
            let time = timeline_start.unwrap_or(0.0);
            let output = input_dir.join(format!("{}_thumb_{}.jpg", input_stem, timestamp));
            
            let cmd = format!(
                "ffmpeg -y -ss {} -i \"{}\" -vframes 1 -q:v 2 \"{}\"",
                format_time(time), input_path, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             format!("Extract thumbnail at {}", format_time(time)))
        }
        
        "gif" => {
            let start = timeline_start.unwrap_or(0.0);
            let end = timeline_end.unwrap_or(start + 5.0);
            let duration = end - start;
            let output = input_dir.join(format!("{}_{}.gif", input_stem, timestamp));
            
            let cmd = format!(
                "ffmpeg -y -ss {} -t {} -i \"{}\" -vf \"fps=15,scale=480:-1:flags=lanczos\" -progress pipe:2 \"{}\"",
                format_time(start), duration, input_path, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             format!("Create GIF from {} to {}", format_time(start), format_time(end)))
        }
        
        "rotate" => {
            let degrees = options.get("degrees")
                .and_then(|d| d.as_i64())
                .unwrap_or(90);
            
            let transpose = match degrees {
                90 => "transpose=1",
                180 => "transpose=2,transpose=2",
                270 => "transpose=2",
                _ => "transpose=1",
            };
            
            let output = input_dir.join(format!("{}_rotated_{}.mp4", input_stem, timestamp));
            
            let cmd = format!(
                "ffmpeg -y -i \"{}\" -vf {} -c:a copy -progress pipe:2 \"{}\"",
                input_path, transpose, output.display()
            );
            
            (cmd, output.to_string_lossy().to_string(),
             format!("Rotate video {}°", degrees))
        }
        
        _ => {
            return Err(format!("Unknown task type: {}", task_type));
        }
    };
    
    // Estimate processing time (rough: 1 second per 10 seconds of video)
    let estimated_time = metadata.duration / 10.0;
    
    Ok(FFmpegCommandResult {
        command,
        explanation,
        estimated_size_mb: (metadata.file_size as f64 / 1_000_000.0) * 0.8, // Rough estimate
        estimated_time_seconds: estimated_time,
        output_path,
        warnings: vec![],
    })
}

/// Execute FFmpeg command with progress tracking
#[tauri::command]
pub async fn execute_ffmpeg_command(
    app: AppHandle,
    job_id: String,
    command: String,
    input_path: String,
    output_path: String,
) -> Result<(), String> {
    println!("[FFMPEG] Starting execute_ffmpeg_command");
    println!("[FFMPEG] Job ID: {}", job_id);
    println!("[FFMPEG] Command: {}", command);
    println!("[FFMPEG] Input: {}", input_path);
    println!("[FFMPEG] Output: {}", output_path);
    
    let ffmpeg_path = get_ffmpeg_path(&app).await
        .ok_or("FFmpeg not found")?;
    println!("[FFMPEG] FFmpeg path: {:?}", ffmpeg_path);
    
    // Get video metadata for progress calculation
    let metadata = get_video_metadata(app.clone(), input_path.clone()).await?;
    let total_duration_secs = metadata.duration;
    let total_frames = (metadata.duration * metadata.fps) as i64;
    println!("[FFMPEG] Total duration: {} secs, Total frames: {}", total_duration_secs, total_frames);
    
    // Ensure -progress pipe:2 is in the command for progress tracking
    let command_with_progress = if !command.contains("-progress") {
        // Find the last argument (output path) and insert -progress before it
        if let Some(last_quote) = command.rfind('"') {
            let before_output = &command[..last_quote];
            if let Some(second_last_quote) = before_output.rfind('"') {
                format!(
                    "{} -progress pipe:2 {}",
                    &command[..second_last_quote],
                    &command[second_last_quote..]
                )
            } else {
                command.clone()
            }
        } else {
            command.clone()
        }
    } else {
        command.clone()
    };
    println!("[FFMPEG] Command with progress: {}", command_with_progress);
    
    // Parse command into args (properly handling quoted paths)
    let all_args = parse_shell_command(&command_with_progress);
    println!("[FFMPEG] Parsed args count: {}", all_args.len());
    for (i, arg) in all_args.iter().enumerate() {
        println!("[FFMPEG]   arg[{}]: '{}'", i, arg);
    }
    
    let args: Vec<&str> = all_args.iter()
        .skip(1) // Skip "ffmpeg"
        .map(|s| s.as_str())
        .collect();
    
    // Create cancellation channel
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    
    {
        let mut jobs = ACTIVE_JOBS.lock().await;
        jobs.insert(job_id.clone(), cancel_tx);
    }
    
    println!("[FFMPEG] Spawning FFmpeg process...");
    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            println!("[FFMPEG] Failed to spawn: {}", e);
            format!("Failed to start FFmpeg: {}", e)
        })?;
    println!("[FFMPEG] FFmpeg process spawned successfully");
    
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let mut reader = BufReader::new(stderr).lines();
    
    let app_clone = app.clone();
    let job_id_clone = job_id.clone();
    
    // Progress parsing task
    let progress_task = tokio::spawn(async move {
        let mut current_frame: i64 = 0;
        let mut current_fps: f64 = 0.0;
        let mut current_time = String::new();
        let mut current_time_secs: f64 = 0.0;
        let mut current_size = String::new();
        let mut current_speed = String::new();
        let mut error_lines: Vec<String> = Vec::new();
        
        while let Ok(Some(line)) = reader.next_line().await {
            // Log all stderr lines for debugging
            println!("[FFMPEG STDERR] {}", line);
            
            // Collect error messages
            if line.contains("Error") || line.contains("error") || line.contains("Invalid") {
                error_lines.push(line.clone());
            }
            
            // Parse progress output (handle both "key=value" and "key= value" formats)
            if line.starts_with("frame=") {
                if let Some(val) = line.strip_prefix("frame=") {
                    // Handle "frame= 3944" format (space after =)
                    current_frame = val.trim().split_whitespace().next()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(current_frame);
                }
            } else if line.starts_with("fps=") {
                if let Some(val) = line.strip_prefix("fps=") {
                    current_fps = val.trim().split_whitespace().next()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(current_fps);
                }
            } else if line.starts_with("out_time_us=") {
                // out_time_us is in microseconds, more accurate for progress
                if let Some(val) = line.strip_prefix("out_time_us=") {
                    if let Ok(us) = val.trim().parse::<i64>() {
                        current_time_secs = us as f64 / 1_000_000.0;
                    }
                }
            } else if line.starts_with("out_time=") {
                if let Some(val) = line.strip_prefix("out_time=") {
                    // Trim microseconds: "00:01:05.050000" -> "00:01:05"
                    let time_str = val.trim();
                    current_time = if let Some(dot_pos) = time_str.find('.') {
                        time_str[..dot_pos].to_string()
                    } else {
                        time_str.to_string()
                    };
                }
            } else if line.starts_with("total_size=") {
                if let Some(val) = line.strip_prefix("total_size=") {
                    let bytes: i64 = val.trim().parse().unwrap_or(0);
                    current_size = format!("{:.1} MB", bytes as f64 / 1_000_000.0);
                }
            } else if line.starts_with("speed=") {
                if let Some(val) = line.strip_prefix("speed=") {
                    current_speed = val.trim().to_string();
                }
            } else if line == "progress=continue" || line == "progress=end" {
                // Use time-based progress (more reliable than frame-based)
                let percent = if total_duration_secs > 0.0 && current_time_secs > 0.0 {
                    (current_time_secs / total_duration_secs * 100.0).min(100.0)
                } else if total_frames > 0 && current_frame > 0 {
                    // Fallback to frame-based
                    (current_frame as f64 / total_frames as f64 * 100.0).min(100.0)
                } else {
                    0.0
                };
                
                println!("[FFMPEG PROGRESS] time_secs={}, duration={}, percent={:.1}%", 
                    current_time_secs, total_duration_secs, percent);
                
                let progress = ProcessingProgress {
                    job_id: job_id_clone.clone(),
                    percent,
                    frame: current_frame,
                    total_frames,
                    fps: current_fps,
                    speed: current_speed.clone(),
                    time: current_time.clone(),
                    size: current_size.clone(),
                };
                
                let _ = app_clone.emit("processing-progress", &progress);
            }
        }
        
        if !error_lines.is_empty() {
            println!("[FFMPEG] Collected errors: {:?}", error_lines);
        }
    });
    
    // Wait for completion or cancellation
    tokio::select! {
        status = child.wait() => {
            println!("[FFMPEG] Process exited with status: {:?}", status);
            progress_task.abort();
            
            // Clean up
            {
                let mut jobs = ACTIVE_JOBS.lock().await;
                jobs.remove(&job_id);
            }
            
            match status {
                Ok(exit_status) if exit_status.success() => {
                    println!("[FFMPEG] Success! Output: {}", output_path);
                    // Emit 100% progress
                    let _ = app.emit("processing-progress", ProcessingProgress {
                        job_id: job_id.clone(),
                        percent: 100.0,
                        frame: total_frames,
                        total_frames,
                        fps: 0.0,
                        speed: "done".to_string(),
                        time: "".to_string(),
                        size: "".to_string(),
                    });
                    Ok(())
                }
                Ok(exit_status) => {
                    println!("[FFMPEG] Failed with exit code: {:?}", exit_status.code());
                    Err(format!("FFmpeg exited with code: {:?}", exit_status.code()))
                }
                Err(e) => {
                    println!("[FFMPEG] Process error: {}", e);
                    Err(format!("FFmpeg process error: {}", e))
                }
            }
        }
        _ = &mut cancel_rx => {
            child.kill().await.ok();
            progress_task.abort();
            
            // Clean up output file
            tokio::fs::remove_file(&output_path).await.ok();
            
            {
                let mut jobs = ACTIVE_JOBS.lock().await;
                jobs.remove(&job_id);
            }
            
            Err("Processing cancelled".to_string())
        }
    }
}

/// Cancel FFmpeg processing
#[tauri::command]
pub async fn cancel_ffmpeg(job_id: String) -> Result<(), String> {
    let mut jobs = ACTIVE_JOBS.lock().await;
    if let Some(cancel_tx) = jobs.remove(&job_id) {
        cancel_tx.send(()).ok();
        Ok(())
    } else {
        Err("Job not found".to_string())
    }
}

/// Get processing history from database
#[tauri::command]
pub async fn get_processing_history(_app: AppHandle, limit: i32) -> Result<Vec<ProcessingJob>, String> {
    let conn = get_db()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, input_path, output_path, task_type, user_prompt, 
         ffmpeg_command, status, progress, error_message, created_at, completed_at
         FROM processing_jobs 
         ORDER BY created_at DESC 
         LIMIT ?1"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;
    
    let jobs = stmt.query_map(params![limit], |row| {
        Ok(ProcessingJob {
            id: row.get(0)?,
            input_path: row.get(1)?,
            output_path: row.get(2)?,
            task_type: row.get(3)?,
            user_prompt: row.get(4)?,
            ffmpeg_command: row.get(5)?,
            status: row.get(6)?,
            progress: row.get(7)?,
            error_message: row.get(8)?,
            created_at: row.get(9)?,
            completed_at: row.get(10)?,
        })
    })
    .map_err(|e| format!("Query failed: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(jobs)
}

/// Delete processing job from history
#[tauri::command]
pub async fn delete_processing_job(_app: AppHandle, id: String) -> Result<(), String> {
    let conn = get_db()?;
    
    conn.execute("DELETE FROM processing_jobs WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete job: {}", e))?;
    
    Ok(())
}

/// Save a new processing job to history
#[tauri::command]
pub async fn save_processing_job(
    _app: AppHandle,
    id: String,
    input_path: String,
    output_path: Option<String>,
    task_type: String,
    user_prompt: Option<String>,
    ffmpeg_command: String,
) -> Result<(), String> {
    let conn = get_db()?;
    let created_at = chrono::Utc::now().to_rfc3339();
    let status = "pending".to_string();
    
    conn.execute(
        "INSERT INTO processing_jobs (id, input_path, output_path, task_type, user_prompt, ffmpeg_command, status, progress, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, input_path, output_path, task_type, user_prompt, ffmpeg_command, status, 0.0, created_at],
    )
    .map_err(|e| format!("Failed to save job: {}", e))?;
    
    Ok(())
}

/// Update processing job status
#[tauri::command]
pub async fn update_processing_job(
    _app: AppHandle,
    id: String,
    status: String,
    progress: f64,
    error_message: Option<String>,
) -> Result<(), String> {
    let conn = get_db()?;
    
    if status == "completed" || status == "failed" || status == "cancelled" {
        let completed_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE processing_jobs SET status = ?1, progress = ?2, error_message = ?3, completed_at = ?4 WHERE id = ?5",
            params![status, progress, error_message, completed_at, id],
        )
        .map_err(|e| format!("Failed to update job: {}", e))?;
    } else {
        conn.execute(
            "UPDATE processing_jobs SET status = ?1, progress = ?2, error_message = ?3 WHERE id = ?4",
            params![status, progress, error_message, id],
        )
        .map_err(|e| format!("Failed to update job: {}", e))?;
    }
    
    Ok(())
}

/// Get processing presets
#[tauri::command]
pub async fn get_processing_presets(_app: AppHandle) -> Result<Vec<ProcessingPreset>, String> {
    let conn = get_db()?;
    
    let mut stmt = conn.prepare(
        "SELECT id, name, description, task_type, prompt_template, icon, created_at
         FROM processing_presets 
         ORDER BY name ASC"
    ).map_err(|e| format!("Failed to prepare query: {}", e))?;
    
    let presets = stmt.query_map([], |row| {
        Ok(ProcessingPreset {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            task_type: row.get(3)?,
            prompt_template: row.get(4)?,
            icon: row.get(5)?,
            created_at: row.get(6)?,
        })
    })
    .map_err(|e| format!("Query failed: {}", e))?
    .filter_map(|r| r.ok())
    .collect();
    
    Ok(presets)
}

/// Save processing preset
#[tauri::command]
pub async fn save_processing_preset(
    _app: AppHandle,
    name: String,
    description: Option<String>,
    prompt_template: String,
    task_type: String,
) -> Result<(), String> {
    let conn = get_db()?;
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = chrono::Utc::now().to_rfc3339();
    
    conn.execute(
        "INSERT INTO processing_presets (id, name, description, task_type, prompt_template, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, name, description, task_type, prompt_template, created_at],
    )
    .map_err(|e| format!("Failed to save preset: {}", e))?;
    
    Ok(())
}

/// Delete processing preset
#[tauri::command]
pub async fn delete_processing_preset(_app: AppHandle, id: String) -> Result<(), String> {
    let conn = get_db()?;
    
    conn.execute("DELETE FROM processing_presets WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete preset: {}", e))?;
    
    Ok(())
}

// Helper functions

async fn get_ffprobe_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    // First check app data directory
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        let bin_dir = app_data_dir.join("bin");
        #[cfg(windows)]
        let ffprobe_path = bin_dir.join("ffprobe.exe");
        #[cfg(not(windows))]
        let ffprobe_path = bin_dir.join("ffprobe");
        
        if ffprobe_path.exists() {
            return Some(ffprobe_path);
        }
    }
    
    // Fallback to system ffprobe
    #[cfg(unix)]
    {
        let output = Command::new("which")
            .arg("ffprobe")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Some(std::path::PathBuf::from(path_str));
            }
        }
    }
    
    #[cfg(windows)]
    {
        let output = Command::new("where")
            .arg("ffprobe")
            .output()
            .await
            .ok()?;
        
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).lines().next()?.to_string();
            if !path_str.is_empty() {
                return Some(std::path::PathBuf::from(path_str));
            }
        }
    }
    
    None
}

async fn load_ai_config(app: &AppHandle) -> Result<AIConfig, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|_| "Failed to get app data directory")?;
    
    let config_path = app_data_dir.join("ai_config.json");
    
    if config_path.exists() {
        let content = tokio::fs::read_to_string(&config_path).await
            .map_err(|e| format!("Failed to read AI config: {}", e))?;
        
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse AI config: {}", e))
    } else {
        Err("AI config not found. Please configure AI in Settings.".to_string())
    }
}

fn format_time(seconds: f64) -> String {
    let hrs = (seconds / 3600.0) as i32;
    let mins = ((seconds % 3600.0) / 60.0) as i32;
    let secs = (seconds % 60.0) as i32;
    let ms = ((seconds % 1.0) * 1000.0) as i32;
    
    // FFmpeg requires HH:MM:SS.mmm format
    format!("{:02}:{:02}:{:02}.{:03}", hrs, mins, secs, ms)
}

/// Check if a codec requires preview transcoding
fn needs_preview_transcode(codec: &str) -> bool {
    let unsupported_codecs = ["vp9", "vp8", "av1", "hevc", "h265", "theora"];
    let codec_lower = codec.to_lowercase();
    unsupported_codecs.iter().any(|c| codec_lower.contains(c))
}

/// Generate a preview video file for unsupported codecs
#[tauri::command]
pub async fn generate_video_preview(
    app: AppHandle,
    input_path: String,
    video_codec: String,
) -> Result<String, String> {
    // Check if preview is needed
    if !needs_preview_transcode(&video_codec) {
        return Err("Preview not needed for this codec".to_string());
    }
    
    let ffmpeg_path = get_ffmpeg_path(&app).await
        .ok_or("FFmpeg not found")?;
    
    // Create preview directory
    let app_data_dir = app.path().app_data_dir()
        .map_err(|_| "Failed to get app data directory")?;
    let preview_dir = app_data_dir.join("previews");
    std::fs::create_dir_all(&preview_dir).ok();
    
    // Generate unique preview filename based on input path hash
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        hasher.finish()
    };
    let preview_path = preview_dir.join(format!("preview_{}.mp4", hash));
    
    // Check if preview already exists
    if preview_path.exists() {
        return Ok(preview_path.to_string_lossy().to_string());
    }
    
    // Emit progress start
    let _ = app.emit("preview-progress", serde_json::json!({
        "status": "starting",
        "percent": 0
    }));
    
    // Generate preview with FFmpeg
    // Settings: 720p, H.264, 30fps, fast preset, lower bitrate
    let output = Command::new(&ffmpeg_path)
        .args([
            "-y",
            "-i", &input_path,
            "-vf", "scale=-2:720",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "28",
            "-r", "30",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            preview_path.to_str().unwrap(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // Clean up failed preview
        std::fs::remove_file(&preview_path).ok();
        return Err(format!("FFmpeg failed: {}", stderr));
    }
    
    // Emit progress complete
    let _ = app.emit("preview-progress", serde_json::json!({
        "status": "complete",
        "percent": 100
    }));
    
    Ok(preview_path.to_string_lossy().to_string())
}

/// Check if preview exists for a video
#[tauri::command]
pub async fn check_preview_exists(
    app: AppHandle,
    input_path: String,
) -> Result<Option<String>, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|_| "Failed to get app data directory")?;
    let preview_dir = app_data_dir.join("previews");
    
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        input_path.hash(&mut hasher);
        hasher.finish()
    };
    let preview_path = preview_dir.join(format!("preview_{}.mp4", hash));
    
    if preview_path.exists() {
        Ok(Some(preview_path.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Clean up old preview files
#[tauri::command]
pub async fn cleanup_previews(app: AppHandle) -> Result<u32, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|_| "Failed to get app data directory")?;
    let preview_dir = app_data_dir.join("previews");
    
    if !preview_dir.exists() {
        return Ok(0);
    }
    
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(&preview_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            if let Ok(metadata) = entry.metadata() {
                // Delete files older than 7 days
                if let Ok(modified) = metadata.modified() {
                    if let Ok(elapsed) = modified.elapsed() {
                        if elapsed.as_secs() > 7 * 24 * 60 * 60 {
                            if std::fs::remove_file(entry.path()).is_ok() {
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(count)
}
