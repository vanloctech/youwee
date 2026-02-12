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

use tauri::{Manager, Emitter};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

/// Whether to hide the dock icon when closing the window (macOS only)
static HIDE_DOCK_ON_CLOSE: AtomicBool = AtomicBool::new(false);

/// Current UI language for tray menu translations (default: "en")
static TRAY_LANG: Mutex<String> = Mutex::new(String::new());

/// Show the main window and restore dock icon if needed
fn show_main_window(app_handle: &tauri::AppHandle) {
    if let Some(window) = app_handle.get_webview_window("main") {
        #[cfg(target_os = "macos")]
        {
            let _ = app_handle.set_activation_policy(tauri::ActivationPolicy::Regular);
        }
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Tauri command: set the hide-dock-on-close preference
#[tauri::command]
fn set_hide_dock_on_close(hide: bool) {
    HIDE_DOCK_ON_CLOSE.store(hide, Ordering::SeqCst);
}

/// Tauri command: rebuild the system tray menu with current channel info
#[tauri::command]
fn rebuild_tray_menu_cmd(app: tauri::AppHandle, lang: Option<String>) {
    if let Some(l) = lang {
        if let Ok(mut stored) = TRAY_LANG.lock() {
            *stored = l;
        }
    }
    rebuild_tray_menu(&app);
}

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

                // macOS: optionally hide the dock icon too
                #[cfg(target_os = "macos")]
                if HIDE_DOCK_ON_CLOSE.load(Ordering::SeqCst) {
                    let _ = window.app_handle().set_activation_policy(tauri::ActivationPolicy::Accessory);
                }
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
            commands::generate_video_thumbnail,
            commands::generate_audio_preview,
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
            commands::set_polling_network_config,
            // System commands
            set_hide_dock_on_close,
            rebuild_tray_menu_cmd,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            match event {
                // macOS: user clicked dock icon while window is hidden → reopen
                // (On Windows/Linux this event doesn't fire — users use the system tray instead)
                #[cfg(target_os = "macos")]
                tauri::RunEvent::Reopen {
                    has_visible_windows, ..
                } => {
                    if !has_visible_windows {
                        show_main_window(_app_handle);
                    }
                }
                tauri::RunEvent::ExitRequested { .. } => {
                    // Stop polling on exit
                    services::polling::stop_polling();
                }
                _ => {}
            }
        });
}

/// Setup system tray icon and menu
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Build a minimal initial menu (will be replaced by rebuild_tray_menu)
    let show = MenuItemBuilder::with_id("show", "Open Youwee").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .expect("Failed to load tray icon");

    let app_handle = app.handle().clone();
    let app_handle_menu = app.handle().clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Youwee")
        .menu(&menu)
        .on_menu_event(move |_tray, event| {
            let id = event.id().as_ref();
            if let Some(channel_id) = id.strip_prefix("ch_") {
                // Channel item clicked: open app and navigate to channel
                show_main_window(&app_handle_menu);
                let _ = app_handle_menu.emit("tray-open-channel", channel_id.to_string());
            } else {
                match id {
                    "check_now" => {
                        services::polling::stop_polling();
                        services::polling::start_polling(app_handle_menu.clone());
                    }
                    "show" => {
                        show_main_window(&app_handle_menu);
                    }
                    "quit" => {
                        services::polling::stop_polling();
                        std::process::exit(0);
                    }
                    _ => {}
                }
            }
        })
        .on_tray_icon_event(move |_tray, event| {
            // Left-click tray icon -> show/focus window
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(&app_handle);
            }
        })
        .build(app)?;

    // Populate tray menu with channel info
    rebuild_tray_menu(&app.handle());

    Ok(())
}

/// Rebuild the system tray menu with current followed channels and new video counts.
/// Called after follow/unfollow, polling finds new videos, or downloads complete.
pub fn rebuild_tray_menu(app_handle: &tauri::AppHandle) {
    if let Err(e) = rebuild_tray_menu_inner(app_handle) {
        log::error!("Failed to rebuild tray menu: {}", e);
    }
}

/// Get the stored tray language code
fn get_tray_lang() -> String {
    TRAY_LANG.lock().map(|l| l.clone()).unwrap_or_default()
}

/// Translate a tray menu key based on the current language
fn tray_text(key: &str) -> &'static str {
    let lang = get_tray_lang();
    let lang = if lang.is_empty() || lang.starts_with("en") { "en" } else { lang.as_str() };

    match (lang, key) {
        // Vietnamese
        ("vi", "followed_channels") => "Kênh đang theo dõi",
        ("vi", "no_channels") => "Chưa theo dõi kênh nào",
        ("vi", "new_suffix") => "mới",
        ("vi", "check_all") => "Kiểm tra tất cả",
        ("vi", "open") => "Mở Youwee",
        ("vi", "quit") => "Thoát",
        // Chinese
        ("zh-CN", "followed_channels") => "已关注的频道",
        ("zh-CN", "no_channels") => "尚未关注任何频道",
        ("zh-CN", "new_suffix") => "个新视频",
        ("zh-CN", "check_all") => "立即全部检查",
        ("zh-CN", "open") => "打开 Youwee",
        ("zh-CN", "quit") => "退出",
        // English (default)
        (_, "followed_channels") => "Followed Channels",
        (_, "no_channels") => "No channels followed",
        (_, "new_suffix") => "new",
        (_, "check_all") => "Check All Now",
        (_, "open") => "Open Youwee",
        (_, "quit") => "Quit",
        _ => "???",
    }
}

fn rebuild_tray_menu_inner(app_handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let channels = database::get_followed_channels_db().unwrap_or_default();
    let channel_count = channels.len();

    // Build channel submenu
    let submenu_label = format!("{} ({})", tray_text("followed_channels"), channel_count);
    let mut submenu = SubmenuBuilder::new(app_handle, &submenu_label);

    if channels.is_empty() {
        let item = MenuItemBuilder::with_id("no_channels", tray_text("no_channels"))
            .enabled(false)
            .build(app_handle)?;
        submenu = submenu.item(&item);
    } else {
        for ch in &channels {
            let count = database::get_new_videos_count_db(Some(ch.id.clone())).unwrap_or(0);
            let label = if count > 0 {
                format!("{} ({} {})", ch.name, count, tray_text("new_suffix"))
            } else {
                ch.name.clone()
            };
            let item_id = format!("ch_{}", ch.id);
            let item = MenuItemBuilder::with_id(item_id, &label).build(app_handle)?;
            submenu = submenu.item(&item);
        }
    }

    let built_submenu = submenu.build()?;

    // Build full menu
    let check_now = MenuItemBuilder::with_id("check_now", tray_text("check_all")).build(app_handle)?;
    let show = MenuItemBuilder::with_id("show", tray_text("open")).build(app_handle)?;
    let quit = MenuItemBuilder::with_id("quit", tray_text("quit")).build(app_handle)?;

    let menu = MenuBuilder::new(app_handle)
        .item(&built_submenu)
        .separator()
        .item(&check_now)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;

    if let Some(tray) = app_handle.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}
