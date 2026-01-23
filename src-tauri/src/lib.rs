//! Youwee - Modern YouTube Video Downloader
//!
//! This is the main entry point for the Tauri application.
//! The codebase is organized into the following modules:
//!
//! - `types`: Data structures (VideoInfo, DownloadProgress, etc.)
//! - `database`: SQLite operations for logs and history
//! - `utils`: Helper functions (format_size, parse_progress, etc.)
//! - `services`: Core services (yt-dlp, FFmpeg, Bun runtime)
//! - `commands`: Tauri commands exposed to the frontend

pub mod types;
pub mod database;
pub mod utils;
pub mod services;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Initialize the database
            if let Err(e) = database::init_database(&app.handle()) {
                log::error!("Failed to initialize database: {}", e);
            }
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Download commands
            commands::download_video,
            commands::stop_download,
            // Video info commands
            commands::get_video_info,
            commands::get_playlist_entries,
            commands::get_available_subtitles,
            commands::get_video_transcript,
            // yt-dlp commands
            commands::get_ytdlp_version,
            commands::check_ytdlp_update,
            commands::update_ytdlp,
            // FFmpeg commands
            commands::check_ffmpeg,
            commands::download_ffmpeg,
            commands::get_ffmpeg_path_for_ytdlp,
            // Bun commands
            commands::check_bun,
            commands::download_bun,
            // Log commands
            commands::get_logs,
            commands::add_log,
            commands::clear_logs,
            commands::export_logs,
            // History commands
            commands::add_history,
            commands::get_history,
            commands::delete_history,
            commands::clear_history,
            commands::get_history_count,
            commands::open_file_location,
            commands::check_file_exists,
            commands::update_summary,
            commands::add_summary_only_history,
            // AI commands
            commands::save_ai_config,
            commands::get_ai_config,
            commands::test_ai_connection,
            commands::generate_video_summary,
            commands::get_ai_models,
            commands::get_summary_languages,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
