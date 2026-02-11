//! Youwee - Modern YouTube Video Downloader
//!
//! This is the main entry point for the Tauri application.
//! The codebase is organized into the following modules:
//!
//! - `types`: Data structures (VideoInfo, DownloadProgress, etc.)
//! - `database`: SQLite operations for logs and history
//! - `utils`: Helper functions (format_size, parse_progress, etc.)
//! - `services`: Core services (yt-dlp, FFmpeg, Deno runtime)
//! - `commands`: Tauri commands exposed to the frontend

pub mod types;
pub mod database;
pub mod utils;
pub mod services;
pub mod commands;

use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Initialize the database
            if let Err(e) = database::init_database(&app.handle()) {
                log::error!("Failed to initialize database: {}", e);
            }
            
            // Start background channel polling
            services::polling::start_polling(app.handle().clone());
            
            // Setup system tray
            setup_tray(app)?;
            
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close-to-tray: hide window instead of quitting
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
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
            // yt-dlp channel commands
            commands::get_ytdlp_channel_cmd,
            commands::set_ytdlp_channel_cmd,
            commands::get_all_ytdlp_versions_cmd,
            commands::check_ytdlp_channel_update,
            commands::download_ytdlp_channel,
            // FFmpeg commands
            commands::check_ffmpeg,
            commands::check_ffmpeg_update,
            commands::download_ffmpeg,
            commands::get_ffmpeg_path_for_ytdlp,
            // Deno commands
            commands::check_deno,
            commands::check_deno_update,
            commands::download_deno,
            // Browser detection
            commands::detect_installed_browsers,
            commands::get_browser_profiles,
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
            commands::open_macos_privacy_settings,
            // AI commands
            commands::save_ai_config,
            commands::get_ai_config,
            commands::test_ai_connection,
            commands::generate_video_summary,
            commands::generate_summary_with_options,
            commands::get_ai_models,
            commands::get_summary_languages,
            // Processing commands
            commands::get_video_metadata,
            commands::get_image_metadata,
            commands::generate_processing_command,
            commands::generate_quick_action_command,
            commands::execute_ffmpeg_command,
            commands::cancel_ffmpeg,
            commands::get_processing_history,
            commands::save_processing_job,
            commands::update_processing_job,
            commands::delete_processing_job,
            commands::clear_processing_history,
            commands::get_processing_presets,
            commands::save_processing_preset,
            commands::delete_processing_preset,
            commands::generate_video_preview,
            commands::check_preview_exists,
            commands::cleanup_previews,
            // Whisper commands
            commands::transcribe_video_with_whisper,
            commands::transcribe_url_with_whisper,
            commands::generate_subtitles_with_whisper,
            // Metadata commands
            commands::fetch_metadata,
            commands::cancel_metadata_fetch,
            // Channel commands
            commands::get_channel_videos,
            commands::get_channel_info,
            commands::follow_channel,
            commands::unfollow_channel,
            commands::get_followed_channels,
            commands::update_channel_settings,
            commands::save_channel_videos,
            commands::get_saved_channel_videos,
            commands::update_channel_video_status,
            commands::update_channel_video_status_by_video_id,
            commands::get_new_videos_count,
            commands::update_channel_last_checked,
            commands::update_channel_info,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                // Stop polling on exit
                services::polling::stop_polling();
                let _ = app_handle;
            }
        });
}

/// Setup system tray icon and menu
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let check_now = MenuItemBuilder::with_id("check_now", "Check Now").build(app)?;
    let show = MenuItemBuilder::with_id("show", "Open Youwee").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&check_now)
        .separator()
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .expect("Failed to load tray icon");

    let app_handle = app.handle().clone();
    let app_handle_menu = app.handle().clone();

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("Youwee")
        .menu(&menu)
        .on_menu_event(move |_tray, event| {
            match event.id().as_ref() {
                "check_now" => {
                    // Trigger immediate check by restarting polling
                    services::polling::stop_polling();
                    services::polling::start_polling(app_handle_menu.clone());
                }
                "show" => {
                    if let Some(window) = app_handle_menu.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    services::polling::stop_polling();
                    std::process::exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(move |_tray, event| {
            // Left-click tray icon -> show/focus window
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}
