use crate::database::update_history_summary;
use crate::services::{
    generate_raw, generate_summary_custom_with_hooks, test_connection, AIConfig, LongSummaryFormat,
    LongSummaryHooks, LongSummaryProgress, SummaryStyle,
};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager};

static CANCELLED_SUMMARY_REQUESTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn cancelled_summary_requests() -> &'static Mutex<HashSet<String>> {
    CANCELLED_SUMMARY_REQUESTS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn normalize_request_id(request_id: Option<String>) -> Option<String> {
    request_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn clear_cancelled_summary_request(request_id: Option<&str>) {
    if let Some(request_id) = request_id {
        if let Ok(mut requests) = cancelled_summary_requests().lock() {
            requests.remove(request_id);
        }
    }
}

fn take_cancelled_summary_request(request_id: Option<&str>) -> bool {
    request_id
        .and_then(|request_id| {
            cancelled_summary_requests()
                .lock()
                .ok()
                .map(|mut requests| requests.remove(request_id))
        })
        .unwrap_or(false)
}

fn is_summary_request_cancelled(request_id: &str) -> bool {
    cancelled_summary_requests()
        .lock()
        .map(|requests| requests.contains(request_id))
        .unwrap_or(false)
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryProgressPayload {
    request_id: String,
    stage: String,
    chunk_index: Option<usize>,
    chunk_count: usize,
}

async fn generate_summary_with_progress(
    app: &AppHandle,
    config: &AIConfig,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    long_summary_format: &LongSummaryFormat,
    long_summary_words: Option<u32>,
    request_id: Option<String>,
) -> Result<crate::services::SummaryResult, String> {
    let request_id = normalize_request_id(request_id);
    if take_cancelled_summary_request(request_id.as_deref()) {
        return Err(crate::services::AIError::Cancelled.to_wire_string());
    }
    let progress_request_id = request_id.clone();
    let progress_app = app.clone();
    let progress = move |progress: LongSummaryProgress| {
        if let Some(request_id) = progress_request_id.as_deref() {
            let payload = SummaryProgressPayload {
                request_id: request_id.to_string(),
                stage: progress.stage.to_string(),
                chunk_index: progress.chunk_index,
                chunk_count: progress.chunk_count,
            };
            progress_app.emit("summary-progress", payload).ok();
        }
    };
    let cancel_request_id = request_id.clone();
    let should_cancel = move || {
        cancel_request_id
            .as_deref()
            .map(is_summary_request_cancelled)
            .unwrap_or(false)
    };
    let hooks = LongSummaryHooks {
        progress: request_id
            .as_ref()
            .map(|_| &progress as &(dyn Fn(LongSummaryProgress) + Send + Sync)),
        should_cancel: request_id
            .as_ref()
            .map(|_| &should_cancel as &(dyn Fn() -> bool + Send + Sync)),
    };

    let result = generate_summary_custom_with_hooks(
        config,
        transcript,
        style,
        language,
        title,
        long_summary_format,
        long_summary_words,
        &hooks,
    )
    .await
    .map_err(|e| e.to_wire_string());
    clear_cancelled_summary_request(request_id.as_deref());
    result
}

/// Get the AI config file path
fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    Ok(app_data_dir.join("ai_config.json"))
}

/// Save AI configuration
#[tauri::command]
pub async fn save_ai_config(app: AppHandle, config: AIConfig) -> Result<(), String> {
    let path = get_config_path(&app)?;
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

/// Load AI configuration
#[tauri::command]
pub async fn get_ai_config(app: AppHandle) -> Result<AIConfig, String> {
    let path = get_config_path(&app)?;

    if !path.exists() {
        return Ok(AIConfig::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;

    let config: AIConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;

    Ok(config)
}

/// Test AI connection
#[tauri::command]
pub async fn test_ai_connection(config: AIConfig) -> Result<String, String> {
    test_connection(&config)
        .await
        .map_err(|e| e.to_wire_string())
}

/// Generate summary for a video transcript
#[tauri::command]
pub async fn generate_video_summary(
    app: AppHandle,
    transcript: String,
    history_id: Option<String>,
    title: Option<String>,
    request_id: Option<String>,
) -> Result<String, String> {
    let config = get_ai_config(app.clone()).await?;

    if !config.enabled {
        return Err("AI features are disabled. Enable them in Settings.".to_string());
    }

    let result = generate_summary_with_progress(
        &app,
        &config,
        &transcript,
        &config.summary_style,
        &config.summary_language,
        title.as_deref(),
        &LongSummaryFormat::Auto,
        None,
        request_id,
    )
    .await?;

    // If history_id is provided, save summary to database
    if let Some(id) = history_id {
        update_history_summary(id, result.summary.clone())?;
    }

    Ok(result.summary)
}

/// Generate summary with custom style and language options
#[tauri::command]
pub async fn generate_summary_with_options(
    app: AppHandle,
    transcript: String,
    style: String,
    language: String,
    title: Option<String>,
    long_summary_format: Option<String>,
    long_summary_words: Option<u32>,
    request_id: Option<String>,
) -> Result<SummaryResult, String> {
    let config = get_ai_config(app.clone()).await?;

    if !config.enabled {
        return Err("AI features are disabled. Enable them in Settings.".to_string());
    }

    // Parse style string to enum
    let summary_style = match style.to_lowercase().as_str() {
        "short" => SummaryStyle::Short,
        "concise" => SummaryStyle::Concise,
        "detailed" => SummaryStyle::Detailed,
        _ => SummaryStyle::Concise,
    };
    let long_summary_format = parse_long_summary_format(long_summary_format.as_deref());

    let result = generate_summary_with_progress(
        &app,
        &config,
        &transcript,
        &summary_style,
        &language,
        title.as_deref(),
        &long_summary_format,
        long_summary_words,
        request_id,
    )
    .await?;

    Ok(SummaryResult {
        summary: result.summary,
    })
}

fn parse_long_summary_format(value: Option<&str>) -> LongSummaryFormat {
    match value.unwrap_or("auto").to_lowercase().as_str() {
        "final" | "final-summary" => LongSummaryFormat::Final,
        "parts" | "by-parts" => LongSummaryFormat::Parts,
        _ => LongSummaryFormat::Auto,
    }
}

#[tauri::command]
pub fn cancel_summary_generation(request_id: String) -> Result<(), String> {
    let request_id = request_id.trim();
    if request_id.is_empty() {
        return Ok(());
    }

    cancelled_summary_requests()
        .lock()
        .map_err(|e| format!("Failed to lock summary cancellation state: {}", e))?
        .insert(request_id.to_string());
    Ok(())
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct SummaryResult {
    pub summary: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    static TEST_CANCEL_MUTEX: Mutex<()> = Mutex::new(());

    fn reset_cancelled_summary_requests() {
        cancelled_summary_requests().lock().unwrap().clear();
    }

    #[test]
    fn take_cancelled_summary_request_consumes_existing_marker() {
        let _guard = TEST_CANCEL_MUTEX.lock().unwrap();
        reset_cancelled_summary_requests();
        cancel_summary_generation("summary-race".to_string()).unwrap();

        assert!(take_cancelled_summary_request(Some("summary-race")));
        assert!(!take_cancelled_summary_request(Some("summary-race")));

        reset_cancelled_summary_requests();
    }

    #[test]
    fn clear_cancelled_summary_request_removes_marker_after_completion() {
        let _guard = TEST_CANCEL_MUTEX.lock().unwrap();
        reset_cancelled_summary_requests();
        cancel_summary_generation("summary-complete".to_string()).unwrap();

        clear_cancelled_summary_request(Some("summary-complete"));

        assert!(!take_cancelled_summary_request(Some("summary-complete")));

        reset_cancelled_summary_requests();
    }
}

/// Get available AI models for a provider
#[tauri::command]
pub fn get_ai_models(provider: String) -> Vec<ModelOption> {
    match provider.to_lowercase().as_str() {
        "gemini" => vec![
            ModelOption {
                value: "gemini-3.5-flash".to_string(),
                label: "Gemini 3.5 Flash (Recommended)".to_string(),
            },
            ModelOption {
                value: "gemini-3.1-flash-lite".to_string(),
                label: "Gemini 3.1 Flash Lite".to_string(),
            },
            ModelOption {
                value: "gemini-2.5-pro".to_string(),
                label: "Gemini 2.5 Pro".to_string(),
            },
        ],
        "openai" => vec![
            ModelOption {
                value: "gpt-5.5".to_string(),
                label: "GPT-5.5 (Recommended)".to_string(),
            },
            ModelOption {
                value: "gpt-5.4".to_string(),
                label: "GPT-5.4".to_string(),
            },
            ModelOption {
                value: "gpt-5.4-mini".to_string(),
                label: "GPT-5.4 Mini".to_string(),
            },
        ],
        "ollama" => vec![
            ModelOption {
                value: "gpt-oss:20b".to_string(),
                label: "GPT-OSS 20B (Recommended)".to_string(),
            },
            ModelOption {
                value: "qwen3:8b".to_string(),
                label: "Qwen 3 8B".to_string(),
            },
            ModelOption {
                value: "gemma3:12b".to_string(),
                label: "Gemma 3 12B".to_string(),
            },
        ],
        "lmstudio" => vec![
            ModelOption {
                value: "openai/gpt-oss-20b".to_string(),
                label: "GPT-OSS 20B (Recommended)".to_string(),
            },
            ModelOption {
                value: "qwen/qwen3-8b".to_string(),
                label: "Qwen 3 8B".to_string(),
            },
            ModelOption {
                value: "google/gemma-3-12b".to_string(),
                label: "Gemma 3 12B".to_string(),
            },
        ],
        "deepseek" => vec![
            ModelOption {
                value: "deepseek-v4-flash".to_string(),
                label: "DeepSeek V4 Flash (Recommended)".to_string(),
            },
            ModelOption {
                value: "deepseek-v4-pro".to_string(),
                label: "DeepSeek V4 Pro".to_string(),
            },
        ],
        "qwen" => vec![
            ModelOption {
                value: "qwen3-max".to_string(),
                label: "Qwen 3 Max (Recommended)".to_string(),
            },
            ModelOption {
                value: "qwen3.5-plus".to_string(),
                label: "Qwen 3.5 Plus".to_string(),
            },
            ModelOption {
                value: "qwen3.5-flash".to_string(),
                label: "Qwen 3.5 Flash".to_string(),
            },
        ],
        "proxy" => vec![
            ModelOption {
                value: "gpt-5.5".to_string(),
                label: "GPT-5.5 (Recommended)".to_string(),
            },
            ModelOption {
                value: "gpt-5.4".to_string(),
                label: "GPT-5.4".to_string(),
            },
            ModelOption {
                value: "gpt-5.4-mini".to_string(),
                label: "GPT-5.4 Mini".to_string(),
            },
            ModelOption {
                value: "gemini-3.5-flash".to_string(),
                label: "Gemini 3.5 Flash".to_string(),
            },
            ModelOption {
                value: "deepseek-v4-flash".to_string(),
                label: "DeepSeek V4 Flash".to_string(),
            },
            ModelOption {
                value: "qwen3.5-plus".to_string(),
                label: "Qwen 3.5 Plus".to_string(),
            },
        ],
        _ => vec![],
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct ModelOption {
    pub value: String,
    pub label: String,
}

/// Get available summary languages
#[tauri::command]
pub fn get_summary_languages() -> Vec<LanguageOption> {
    vec![
        LanguageOption {
            value: "auto".to_string(),
            label: "Auto (Same as video)".to_string(),
        },
        LanguageOption {
            value: "en".to_string(),
            label: "English".to_string(),
        },
        LanguageOption {
            value: "vi".to_string(),
            label: "Vietnamese".to_string(),
        },
        LanguageOption {
            value: "ja".to_string(),
            label: "Japanese".to_string(),
        },
        LanguageOption {
            value: "ko".to_string(),
            label: "Korean".to_string(),
        },
        LanguageOption {
            value: "zh".to_string(),
            label: "Chinese".to_string(),
        },
        LanguageOption {
            value: "es".to_string(),
            label: "Spanish".to_string(),
        },
        LanguageOption {
            value: "fr".to_string(),
            label: "French".to_string(),
        },
        LanguageOption {
            value: "de".to_string(),
            label: "German".to_string(),
        },
        LanguageOption {
            value: "pt".to_string(),
            label: "Portuguese".to_string(),
        },
        LanguageOption {
            value: "ru".to_string(),
            label: "Russian".to_string(),
        },
    ]
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct LanguageOption {
    pub value: String,
    pub label: String,
}

/// Generate raw AI text response (no summarization wrapping)
/// Used for subtitle translation, grammar fix, and other custom AI tasks
#[tauri::command]
pub async fn generate_ai_response(app: AppHandle, prompt: String) -> Result<String, String> {
    let config = get_ai_config(app).await?;

    if !config.enabled {
        return Err("AI features are disabled. Enable them in Settings.".to_string());
    }

    let result = generate_raw(&config, &prompt)
        .await
        .map_err(|e| e.to_wire_string())?;

    Ok(result.summary)
}
