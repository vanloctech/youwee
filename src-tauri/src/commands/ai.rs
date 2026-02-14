use tauri::{AppHandle, Manager};
use std::fs;
use std::path::PathBuf;
use crate::services::{AIConfig, SummaryStyle, generate_summary, generate_summary_custom, generate_raw, test_connection};
use crate::database::update_history_summary;

/// Get the AI config file path
fn get_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    Ok(app_data_dir.join("ai_config.json"))
}

/// Save AI configuration
#[tauri::command]
pub async fn save_ai_config(app: AppHandle, config: AIConfig) -> Result<(), String> {
    let path = get_config_path(&app)?;
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

/// Load AI configuration
#[tauri::command]
pub async fn get_ai_config(app: AppHandle) -> Result<AIConfig, String> {
    let path = get_config_path(&app)?;
    
    if !path.exists() {
        return Ok(AIConfig::default());
    }
    
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    
    let config: AIConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse config: {}", e))?;
    
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
    
    let result = generate_summary_custom(&config, &transcript, &summary_style, &language, title.as_deref())
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
            ModelOption { value: "gemini-3-pro-preview".to_string(), label: "Gemini 3 Pro".to_string() },
            ModelOption { value: "gemini-3-flash-preview".to_string(), label: "Gemini 3 Flash (Recommended)".to_string() },
            ModelOption { value: "gemini-2.5-flash".to_string(), label: "Gemini 2.5 Flash".to_string() },
            ModelOption { value: "gemini-2.0-flash".to_string(), label: "Gemini 2.0 Flash".to_string() },
            ModelOption { value: "gemini-2.0-flash-lite".to_string(), label: "Gemini 2.0 Flash Lite".to_string() },
        ],
        "openai" => vec![
            ModelOption { value: "gpt-4.1-nano".to_string(), label: "GPT-4.1 Nano (Recommended)".to_string() },
            ModelOption { value: "gpt-4.1-mini".to_string(), label: "GPT-4.1 Mini".to_string() },
            ModelOption { value: "gpt-4.1".to_string(), label: "GPT-4.1".to_string() },
            ModelOption { value: "gpt-5-nano".to_string(), label: "GPT-5 Nano".to_string() },
            ModelOption { value: "gpt-5-mini".to_string(), label: "GPT-5 Mini".to_string() },
            ModelOption { value: "gpt-5".to_string(), label: "GPT-5".to_string() },
            ModelOption { value: "gpt-5.1".to_string(), label: "GPT-5.1".to_string() },
            ModelOption { value: "gpt-5.2".to_string(), label: "GPT-5.2".to_string() },
            ModelOption { value: "gpt-4o-mini".to_string(), label: "GPT-4o Mini".to_string() },
            ModelOption { value: "gpt-4o".to_string(), label: "GPT-4o".to_string() },
            ModelOption { value: "gpt-4-turbo".to_string(), label: "GPT-4 Turbo".to_string() },
        ],
        "ollama" => vec![
            ModelOption { value: "llama3.2".to_string(), label: "Llama 3.2 (Recommended)".to_string() },
            ModelOption { value: "llama3.1".to_string(), label: "Llama 3.1".to_string() },
            ModelOption { value: "gemma2".to_string(), label: "Gemma 2".to_string() },
            ModelOption { value: "qwen2.5".to_string(), label: "Qwen 2.5".to_string() },
            ModelOption { value: "mistral".to_string(), label: "Mistral".to_string() },
            ModelOption { value: "phi3".to_string(), label: "Phi 3".to_string() },
            ModelOption { value: "deepseek-coder-v2".to_string(), label: "DeepSeek Coder V2".to_string() },
        ],
        "deepseek" => vec![
            ModelOption { value: "deepseek-chat".to_string(), label: "DeepSeek Chat (Recommended)".to_string() },
            ModelOption { value: "deepseek-reasoner".to_string(), label: "DeepSeek Reasoner (R1)".to_string() },
        ],
        "qwen" => vec![
            ModelOption { value: "qwen-turbo".to_string(), label: "Qwen Turbo (Recommended)".to_string() },
            ModelOption { value: "qwen-plus".to_string(), label: "Qwen Plus".to_string() },
            ModelOption { value: "qwen-max".to_string(), label: "Qwen Max".to_string() },
            ModelOption { value: "qwen-long".to_string(), label: "Qwen Long".to_string() },
        ],
        "proxy" => vec![
            ModelOption { value: "gpt-4.1-nano".to_string(), label: "GPT-4.1 Nano".to_string() },
            ModelOption { value: "gpt-4.1-mini".to_string(), label: "GPT-4.1 Mini".to_string() },
            ModelOption { value: "gpt-4.1".to_string(), label: "GPT-4.1".to_string() },
            ModelOption { value: "gpt-5-nano".to_string(), label: "GPT-5 Nano".to_string() },
            ModelOption { value: "gpt-5-mini".to_string(), label: "GPT-5 Mini".to_string() },
            ModelOption { value: "gpt-5".to_string(), label: "GPT-5".to_string() },
            ModelOption { value: "gpt-4o-mini".to_string(), label: "GPT-4o Mini".to_string() },
            ModelOption { value: "gpt-4o".to_string(), label: "GPT-4o".to_string() },
            ModelOption { value: "claude-3-5-sonnet-20241022".to_string(), label: "Claude 3.5 Sonnet".to_string() },
            ModelOption { value: "claude-3-5-haiku-20241022".to_string(), label: "Claude 3.5 Haiku".to_string() },
            ModelOption { value: "deepseek-chat".to_string(), label: "DeepSeek Chat".to_string() },
            ModelOption { value: "deepseek-reasoner".to_string(), label: "DeepSeek Reasoner".to_string() },
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
        LanguageOption { value: "auto".to_string(), label: "Auto (Same as video)".to_string() },
        LanguageOption { value: "en".to_string(), label: "English".to_string() },
        LanguageOption { value: "vi".to_string(), label: "Vietnamese".to_string() },
        LanguageOption { value: "ja".to_string(), label: "Japanese".to_string() },
        LanguageOption { value: "ko".to_string(), label: "Korean".to_string() },
        LanguageOption { value: "zh".to_string(), label: "Chinese".to_string() },
        LanguageOption { value: "es".to_string(), label: "Spanish".to_string() },
        LanguageOption { value: "fr".to_string(), label: "French".to_string() },
        LanguageOption { value: "de".to_string(), label: "German".to_string() },
        LanguageOption { value: "pt".to_string(), label: "Portuguese".to_string() },
        LanguageOption { value: "ru".to_string(), label: "Russian".to_string() },
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
pub async fn generate_ai_response(
    app: AppHandle,
    prompt: String,
) -> Result<String, String> {
    let config = get_ai_config(app).await?;
    
    if !config.enabled {
        return Err("AI features are disabled. Enable them in Settings.".to_string());
    }
    
    let result = generate_raw(&config, &prompt)
        .await
        .map_err(|e| format!("AI generation failed: {}", e))?;
    
    Ok(result.summary)
}
