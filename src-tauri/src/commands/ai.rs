use crate::database::update_history_summary;
use crate::services::{
    generate_raw, generate_summary, generate_summary_custom, test_connection, AIConfig,
    SummaryStyle,
};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
    test_connection(&config).await.map_err(|e| e.to_string())
}

/// Generate summary for a video transcript
#[tauri::command]
pub async fn generate_video_summary(
    app: AppHandle,
    transcript: String,
    history_id: Option<String>,
    title: Option<String>,
) -> Result<String, String> {
    let config = get_ai_config(app.clone()).await?;

    if !config.enabled {
        return Err("AI features are disabled. Enable them in Settings.".to_string());
    }

    let result = generate_summary(&config, &transcript, title.as_deref())
        .await
        .map_err(|e| e.to_string())?;

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

    let result = generate_summary_custom(
        &config,
        &transcript,
        &summary_style,
        &language,
        title.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;

    Ok(SummaryResult {
        summary: result.summary,
    })
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct SummaryResult {
    pub summary: String,
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
        .map_err(|e| format!("AI generation failed: {}", e))?;

    Ok(result.summary)
}
