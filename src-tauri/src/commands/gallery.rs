use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};

use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::process::Command;

use crate::database::add_history_internal;
use crate::database::add_log_internal;
use crate::services::{build_cookie_args, get_gallerydl_path, system_gallerydl_not_found_message};
use crate::types::BackendError;
use crate::utils::{normalize_url, sanitize_output_path, validate_url, CommandExt};

const RECENT_OUTPUT_LIMIT: usize = 30;

/// Child PIDs of gallery-dl processes spawned by THIS app, keyed by download
/// id — a stop request only kills the process trees that belong to it.
static GALLERY_CHILD_PIDS: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
/// Download ids that a stop request has targeted (cleared when the run ends).
static GALLERY_STOP_IDS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

#[derive(serde::Serialize)]
pub struct GalleryDownloadResult {
    pub filepath: String,
    pub history_id: Option<String>,
}

const DEFAULT_GALLERY_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// asurascans.com gallery-dl external extractor, embedded and hot-deployed to
/// `<app_data_dir>/extractors/asurascans.py` (loaded via `gallery-dl -X`).
const ASURASCANS_EXTRACTOR: &str = include_str!("../../extractors/asurascans.py");

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GalleryDownloadOptions {
    pub retries: Option<u32>,
    pub timeout: Option<u64>,
    pub range: Option<String>,
    pub filename: Option<String>,
    pub flat_output: Option<bool>,
    pub cbz: Option<bool>,
    pub rate_limit: Option<String>,
    pub filesize_min: Option<String>,
    pub filesize_max: Option<String>,
    pub sleep: Option<f64>,
}

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GalleryProbe {
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub count: Option<u32>,
    pub category: Option<String>,
    pub subcategory: Option<String>,
    pub error: Option<String>,
}

fn push_recent_output(buffer: &mut VecDeque<String>, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }
    if buffer.len() >= RECENT_OUTPUT_LIMIT {
        buffer.pop_front();
    }
    buffer.push_back(trimmed.to_string());
}

/// Kill one gallery-dl process tree by PID (the app's own child only).
fn kill_process_tree_pid(pid: u32) {
    #[cfg(windows)]
    {
        use std::process::Command as StdCommand;
        let mut cmd = StdCommand::new("taskkill");
        cmd.args(["/F", "/T", "/PID", &pid.to_string()]);
        cmd.hide_window();
        cmd.spawn().ok();
    }
    #[cfg(unix)]
    {
        use std::process::Command as StdCommand;
        StdCommand::new("pkill")
            .args(["-9", "-P", &pid.to_string()])
            .spawn()
            .ok();
        StdCommand::new("kill")
            .args(["-9", &pid.to_string()])
            .spawn()
            .ok();
    }
}

fn archive_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    Ok(app_data_dir.join("archive").join("gallery-dl.txt"))
}

/// Make sure the external-extractor dir exists and holds the current
/// asurascans.py (hot-patched: any drift is overwritten on the next run).
async fn ensure_extractors_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let extractors_dir = app_data_dir.join("extractors");
    tokio::fs::create_dir_all(&extractors_dir)
        .await
        .map_err(|e| format!("Failed to create extractors directory: {}", e))?;
    let target = extractors_dir.join("asurascans.py");
    let up_to_date = tokio::fs::read_to_string(&target)
        .await
        .map(|existing| existing == ASURASCANS_EXTRACTOR)
        .unwrap_or(false);
    if !up_to_date {
        tokio::fs::write(&target, ASURASCANS_EXTRACTOR)
            .await
            .map_err(|e| format!("Failed to write asurascans extractor: {}", e))?;
    }
    Ok(extractors_dir)
}

fn push_opt(args: &mut Vec<String>, flag: &str, value: Option<&str>) {
    if let Some(value) = value {
        if !value.is_empty() {
            args.push(flag.to_string());
            args.push(value.to_string());
        }
    }
}

fn thumb_cache_key(url: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    hasher.finish()
}

fn thumb_extension(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".webp") {
        "webp"
    } else if lower.contains(".png") {
        "png"
    } else if lower.contains(".gif") {
        "gif"
    } else {
        "jpg"
    }
}

/// Download a probe thumbnail into the shared gallery-thumbs cache dir.
async fn cache_probe_thumbnail(
    app: &AppHandle,
    url: &str,
    proxy_url: Option<&str>,
) -> Option<String> {
    let cache_dir = app.path().app_cache_dir().ok()?.join("gallery-thumbs");
    std::fs::create_dir_all(&cache_dir).ok()?;
    let ext = thumb_extension(url);
    let thumb_path = cache_dir.join(format!("queue-{}.{}", thumb_cache_key(url), ext));
    if thumb_path.exists() {
        return Some(thumb_path.to_string_lossy().into_owned());
    }
    let mut builder = reqwest::Client::builder()
        .user_agent(DEFAULT_GALLERY_UA)
        .timeout(std::time::Duration::from_secs(10));
    if let Some(proxy) = proxy_url {
        if !proxy.is_empty() {
            if let Ok(proxy) = reqwest::Proxy::all(proxy) {
                builder = builder.proxy(proxy);
            }
        }
    }
    let client = builder.build().ok()?;
    let mut request = client.get(url);
    if url.to_ascii_lowercase().contains("pximg.net") {
        request = request.header("Referer", "https://www.pixiv.net/");
    }
    let response = request.send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let bytes = response.bytes().await.ok()?;
    tokio::fs::write(&thumb_path, bytes).await.ok()?;
    Some(thumb_path.to_string_lossy().into_owned())
}

fn first_meta_string(
    meta: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    for key in keys {
        if let Some(value) = meta.get(*key) {
            if let Some(s) = value.as_str() {
                if !s.is_empty() {
                    return Some(s.to_string());
                }
            }
        }
    }
    None
}

#[tauri::command]
pub async fn stop_gallery_download(id: Option<String>) -> Result<(), String> {
    {
        let mut stop_ids = GALLERY_STOP_IDS.lock().unwrap_or_else(|e| e.into_inner());
        let mut pids = GALLERY_CHILD_PIDS.lock().unwrap_or_else(|e| e.into_inner());
        match id {
            Some(target) => {
                stop_ids.insert(target.clone());
                if let Some(pid) = pids.remove(&target) {
                    kill_process_tree_pid(pid);
                }
            }
            None => {
                // Stop-everything: mark every tracked download and kill each tree.
                for key in pids.keys() {
                    stop_ids.insert(key.clone());
                }
                for pid in pids.values() {
                    kill_process_tree_pid(*pid);
                }
                pids.clear();
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn download_gallery(
    app: AppHandle,
    url: String,
    output_path: String,
    log_stderr: Option<bool>,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
    source: Option<String>,
    thumbnail: Option<String>,
    options: Option<GalleryDownloadOptions>,
    incognito: Option<bool>,
    id: Option<String>,
) -> Result<GalleryDownloadResult, String> {
    validate_url(&url).map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let url = normalize_url(&url);

    let Some(binary_path) = get_gallerydl_path(&app) else {
        return Err(BackendError::new(
            crate::types::code::GALLERYDL_NOT_FOUND,
            system_gallerydl_not_found_message(),
        )
        .with_retryable(false)
        .to_wire_string());
    };

    let sanitized_path = sanitize_output_path(&output_path)
        .map_err(|e| BackendError::from_message(e).to_wire_string())?;
    let archive_path = archive_file_path(&app)?;
    if let Some(parent) = archive_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create archive directory: {}", e))?;
    }

    let extractors_dir = ensure_extractors_dir(&app).await?;

    let mut args = vec![
        "--destination".to_string(),
        sanitized_path.clone(),
        "--download-archive".to_string(),
        archive_path.to_string_lossy().to_string(),
        "-X".to_string(),
        extractors_dir.to_string_lossy().to_string(),
    ];

    // Hardening defaults. Per-item options below override these, and each
    // flag is emitted exactly once (the resolved value wins — no duplicates).
    let retries = options
        .as_ref()
        .and_then(|o| o.retries)
        .filter(|v| *v > 0)
        .unwrap_or(8);
    args.push("--retries".to_string());
    args.push(retries.to_string());
    let http_timeout = options
        .as_ref()
        .and_then(|o| o.timeout)
        .filter(|v| *v > 0)
        .unwrap_or(60);
    args.push("--http-timeout".to_string());
    args.push(http_timeout.to_string());
    args.push("--sleep-429".to_string());
    args.push("30".to_string());
    args.push("--user-agent".to_string());
    args.push(DEFAULT_GALLERY_UA.to_string());

    args.extend(build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    ));

    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }

    if let Some(opts) = options {
        push_opt(&mut args, "--range", opts.range.as_deref());
        push_opt(&mut args, "--filename", opts.filename.as_deref());
        if opts.flat_output == Some(true) {
            args.push("-o".to_string());
            args.push("directory=".to_string());
        }
        if opts.cbz == Some(true) {
            args.push("--cbz".to_string());
        }
        push_opt(&mut args, "--limit-rate", opts.rate_limit.as_deref());
        push_opt(&mut args, "--filesize-min", opts.filesize_min.as_deref());
        push_opt(&mut args, "--filesize-max", opts.filesize_max.as_deref());
        if let Some(value) = opts.sleep {
            if value > 0.0 {
                args.push("--sleep".to_string());
                args.push(value.to_string());
            }
        }
    }

    args.push(url.clone());

    let command_str = format!("[{}] gallery-dl {}", binary_path.display(), args.join(" "));
    add_log_internal("command", &command_str, None, Some(&url)).ok();

    let mut cmd = Command::new(&binary_path);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();

    let stop_key = id.unwrap_or_else(|| url.clone());
    let mut child = cmd.spawn().map_err(|e| {
        BackendError::from_message(format!("Failed to start gallery-dl: {}", e)).to_wire_string()
    })?;
    if let Some(pid) = child.id() {
        GALLERY_CHILD_PIDS
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(stop_key.clone(), pid);
    }
    GALLERY_STOP_IDS.lock().unwrap_or_else(|e| e.into_inner()).remove(&stop_key);

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut recent = VecDeque::with_capacity(RECENT_OUTPUT_LIMIT);
        if let Some(stdout) = stdout {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                push_recent_output(&mut recent, &line);
            }
        }
        recent
    });

    let url_for_stderr = url.clone();
    let stderr_enabled = log_stderr.unwrap_or(true);
    let stderr_task = tokio::spawn(async move {
        let mut recent = VecDeque::with_capacity(RECENT_OUTPUT_LIMIT);
        if let Some(stderr) = stderr {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                if stderr_enabled {
                    add_log_internal("stderr", &line, None, Some(&url_for_stderr)).ok();
                }
                push_recent_output(&mut recent, &line);
            }
        }
        recent
    });

    let child_pid = child.id();
    let status = child.wait().await.map_err(|e| {
        BackendError::from_message(format!("gallery-dl process error: {}", e)).to_wire_string()
    })?;
    GALLERY_CHILD_PIDS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&stop_key);
    let was_stopped = GALLERY_STOP_IDS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(&stop_key);

    let mut recent_lines: Vec<String> = stdout_task.await.unwrap_or_default().into_iter().collect();
    recent_lines.extend(stderr_task.await.unwrap_or_default().into_iter());

    if !status.success() {
        let reason = recent_lines
            .iter()
            .rev()
            .find(|line| {
                let lower = line.to_lowercase();
                lower.contains("error")
                    || lower.contains("failed")
                    || lower.contains("forbidden")
                    || lower.contains("too many requests")
                    || lower.contains("not found")
            })
            .cloned()
            .or_else(|| recent_lines.last().cloned())
            .unwrap_or_else(|| "Unknown error".to_string());

        if was_stopped {
            return Err(BackendError::from_message("Gallery download stopped".to_string())
                .with_param("exitCode", status.code().unwrap_or(-1))
                .to_wire_string());
        }
        return Err(BackendError::from_message(format!(
            "Gallery download failed (exit code {}): {}",
            status.code().unwrap_or(-1),
            reason
        ))
        .with_param("exitCode", status.code().unwrap_or(-1))
        .to_wire_string());
    }

    let history_id = if incognito.unwrap_or(false) {
        add_log_internal("success", "Gallery download completed (incognito)", None, None).ok();
        None
    } else {
        let title = source.clone().unwrap_or_else(|| url.clone());
        let id = add_history_internal(
            url.clone(),
            title,
            thumbnail,
            sanitized_path.clone(),
            None,
            None,
            None,
            Some("gallery".to_string()),
            source.or(Some("gallery-dl".to_string())),
            None,
        )
        .ok();
        add_log_internal("success", "Gallery download completed", None, Some(&url)).ok();
        id
    };

    Ok(GalleryDownloadResult {
        filepath: sanitized_path,
        history_id,
    })
}

/// Probe a gallery URL without downloading: runs `gallery-dl -J --no-download`
/// and returns the title/count/category plus a cached thumbnail (first image).
/// Never blocks queueing: any failure returns a probe with `error` set.
#[tauri::command]
pub async fn probe_gallery(
    app: AppHandle,
    url: String,
    cookie_mode: Option<String>,
    cookie_browser: Option<String>,
    cookie_browser_profile: Option<String>,
    cookie_file_path: Option<String>,
    cookie_skip_patterns: Option<Vec<String>>,
    proxy_url: Option<String>,
) -> Result<GalleryProbe, String> {
    if validate_url(&url).is_err() {
        return Ok(GalleryProbe {
            error: Some("Invalid URL".to_string()),
            ..Default::default()
        });
    }
    let url = normalize_url(&url);

    let Some(binary_path) = get_gallerydl_path(&app) else {
        return Ok(GalleryProbe {
            error: Some(system_gallerydl_not_found_message()),
            ..Default::default()
        });
    };

    let extractors_dir = match ensure_extractors_dir(&app).await {
        Ok(dir) => dir,
        Err(e) => {
            return Ok(GalleryProbe {
                error: Some(e),
                ..Default::default()
            })
        }
    };

    let mut args = vec![
        "-J".to_string(),
        "--no-download".to_string(),
        "-X".to_string(),
        extractors_dir.to_string_lossy().to_string(),
    ];
    args.extend(build_cookie_args(
        &url,
        cookie_mode.as_deref(),
        cookie_browser.as_deref(),
        cookie_browser_profile.as_deref(),
        cookie_file_path.as_deref(),
        cookie_skip_patterns.as_deref(),
    ));
    if let Some(proxy) = proxy_url.as_ref() {
        if !proxy.is_empty() {
            args.push("--proxy".to_string());
            args.push(proxy.clone());
        }
    }
    args.push(url.clone());

    let mut cmd = Command::new(&binary_path);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.hide_window();

    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(e) => {
            return Ok(GalleryProbe {
                error: Some(format!("Failed to start gallery-dl: {}", e)),
                ..Default::default()
            })
        }
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let wait = async {
        let status = child.wait().await;
        let mut out = String::new();
        if let Some(mut stdout) = stdout {
            let _ = stdout.read_to_string(&mut out).await;
        }
        let mut err = String::new();
        if let Some(mut stderr) = stderr {
            let _ = stderr.read_to_string(&mut err).await;
        }
        (status, out, err)
    };

    let (status, out, err) =
        match tokio::time::timeout(std::time::Duration::from_secs(15), wait).await {
            Ok(inner) => inner,
            Err(_) => {
                let _ = child.kill().await;
                return Ok(GalleryProbe {
                    error: Some("Preview timed out".to_string()),
                    ..Default::default()
                });
            }
        };
    if status.is_err() {
        return Ok(GalleryProbe {
            error: Some("Failed to run gallery-dl".to_string()),
            ..Default::default()
        });
    }

    // gallery-dl can exit non-zero while still printing valid JSON; parse stdout regardless.
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(out.trim());
    let Ok(value) = parsed else {
        let reason = err.trim();
        return Ok(GalleryProbe {
            error: Some(if reason.is_empty() {
                "No preview available".to_string()
            } else {
                reason.to_string()
            }),
            ..Default::default()
        });
    };

    let mut probe = GalleryProbe::default();
    let mut thumb_candidates: Vec<String> = Vec::new();

    if let Some(entries) = value.as_array() {
        for entry in entries {
            let Some(items) = entry.as_array() else { continue };
            if items.len() < 2 {
                continue;
            }
            let kind = items[0].as_i64().unwrap_or(-1);
            if kind == 2 {
                // Directory message -> general gallery metadata
                if let Some(meta) = items[1].as_object() {
                    probe.title =
                        first_meta_string(meta, &["seriesName", "title", "manga", "name", "description"]);
                    probe.count = meta.get("count").and_then(|v| v.as_u64()).map(|v| v as u32);
                    probe.category = meta
                        .get("category")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    probe.subcategory = meta
                        .get("subcategory")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                }
            } else if kind == 3 {
                // Url message -> [3, [0, url] | url, meta]
                let url_val = &items[1];
                let url_str = if let Some(arr) = url_val.as_array() {
                    arr.get(1)
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                } else {
                    url_val.as_str().map(|s| s.to_string())
                };
                if let Some(url_str) = url_str {
                    let mut thumb: Option<String> = None;
                    if let Some(meta) = items.get(2).and_then(|v| v.as_object()) {
                        thumb = first_meta_string(meta, &["thumbnail", "preview_file_url"]).or_else(
                            || {
                                meta.get("preview")
                                    .and_then(|v| v.as_object())
                                    .and_then(|p| p.get("url"))
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string())
                            },
                        );
                        if thumb.is_none() {
                            thumb = meta
                                .get("file")
                                .and_then(|v| v.as_object())
                                .and_then(|f| f.get("url"))
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                        if thumb.is_none() {
                            thumb = meta
                                .get("file_url")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string());
                        }
                    }
                    thumb_candidates.push(thumb.unwrap_or_else(|| url_str.clone()));
                }
            }
        }
    }

    if probe.thumbnail.is_none() {
        if let Some(first) = thumb_candidates.first() {
            probe.thumbnail = cache_probe_thumbnail(&app, first, proxy_url.as_deref()).await;
        }
    }

    Ok(probe)
}
