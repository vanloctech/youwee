//! Infistar (sponsor) model catalog.
//!
//! Infistar publishes its model catalog at a public pricing endpoint (no API key needed).
//! Youwee keeps only the chat models it can call through the OpenAI-compatible
//! `/v1/chat/completions` endpoint, caches the result for a day, and falls back to a
//! built-in list when offline.

use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const INFISTAR_PRICING_URL: &str = "https://infistar.cc/api/pricing";
const CACHE_FILE_NAME: &str = "infistar-models.json";
const CACHE_TTL_SECS: u64 = 24 * 60 * 60;

/// Model names with these parts are not chat models (image, audio, embeddings, ...).
const NON_CHAT_NAME_PARTS: &[&str] = &[
    "image", "embed", "rerank", "tts", "whisper", "video", "audio", "realtime", "transcri",
];

/// A selectable model, grouped by brand for the settings dropdown.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct GroupedModelOption {
    pub value: String,
    pub label: String,
    pub group: String,
}

#[derive(Deserialize)]
struct PricingResponse {
    data: Vec<PricingModel>,
}

#[derive(Deserialize)]
struct PricingModel {
    model_name: String,
    #[serde(default)]
    display_name_en: Option<String>,
    #[serde(default)]
    brand_name_en: Option<String>,
    #[serde(default)]
    brand_name: Option<String>,
    #[serde(default)]
    brand_display_order: Option<i64>,
    #[serde(default)]
    model_display_order: Option<i64>,
    #[serde(default)]
    supported_endpoint_types: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
struct CachedModels {
    fetched_at: u64,
    models: Vec<GroupedModelOption>,
}

fn is_chat_model(model: &PricingModel) -> bool {
    let supports_chat = model
        .supported_endpoint_types
        .as_ref()
        .is_some_and(|types| types.iter().any(|t| t == "openai"));
    let name = model.model_name.to_lowercase();
    supports_chat && !NON_CHAT_NAME_PARTS.iter().any(|part| name.contains(part))
}

/// Keep chat models, in Infistar's own brand/model display order, without duplicates.
pub(crate) fn parse_infistar_models(json: &str) -> Result<Vec<GroupedModelOption>, String> {
    let response: PricingResponse =
        serde_json::from_str(json).map_err(|e| format!("Invalid Infistar catalog: {}", e))?;

    let mut models: Vec<PricingModel> = response.data.into_iter().filter(is_chat_model).collect();
    models.sort_by_key(|m| {
        (
            m.brand_display_order.unwrap_or(i64::MAX),
            m.model_display_order.unwrap_or(i64::MAX),
        )
    });

    let mut seen = std::collections::HashSet::new();
    Ok(models
        .into_iter()
        .filter(|m| seen.insert(m.model_name.clone()))
        .map(|m| GroupedModelOption {
            label: m
                .display_name_en
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| m.model_name.clone()),
            group: m
                .brand_name_en
                .or(m.brand_name)
                .filter(|name| !name.trim().is_empty())
                .unwrap_or_else(|| "Other".to_string()),
            value: m.model_name,
        })
        .collect())
}

/// Built-in list used when the catalog cannot be fetched and nothing is cached.
pub fn infistar_fallback_models() -> Vec<GroupedModelOption> {
    [
        ("gpt-6.1-sol", "GPT-6.1 Sol", "ChatGPT"),
        ("gpt-6.1-terra", "GPT-6.1 Terra", "ChatGPT"),
        ("gpt-5.5", "GPT-5.5", "ChatGPT"),
        ("deepseek-v4.1-flash", "DeepSeek V4.1 Flash", "DeepSeek"),
        ("deepseek-v4-pro", "DeepSeek V4 Pro", "DeepSeek"),
        ("claude-opus-5-5", "Claude Opus 5.5", "Claude"),
        ("claude-sonnet-5-5", "Claude Sonnet 5.5", "Claude"),
        ("claude-haiku-5-5", "Claude Haiku 5.5", "Claude"),
        ("gemini-3.5-flash", "Gemini 3.5 Flash", "Gemini"),
        ("gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview", "Gemini"),
        ("qwen3.8-max", "Qwen 3.8 Max", "Qwen"),
        ("qwen3.7-plus", "Qwen3.7 Plus", "Qwen"),
        ("grok-4.7", "Grok 4.7", "Grok"),
    ]
    .into_iter()
    .map(|(value, label, group)| GroupedModelOption {
        value: value.to_string(),
        label: label.to_string(),
        group: group.to_string(),
    })
    .collect()
}

fn cache_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_cache_dir()
        .ok()
        .map(|dir| dir.join(CACHE_FILE_NAME))
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

async fn read_cache(app: &AppHandle) -> Option<CachedModels> {
    let content = tokio::fs::read_to_string(cache_path(app)?).await.ok()?;
    serde_json::from_str::<CachedModels>(&content)
        .ok()
        .filter(|cached| !cached.models.is_empty())
}

async fn write_cache(app: &AppHandle, models: &[GroupedModelOption]) {
    let Some(path) = cache_path(app) else { return };
    if let Some(parent) = path.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    let cached = CachedModels {
        fetched_at: now_secs(),
        models: models.to_vec(),
    };
    if let Ok(json) = serde_json::to_string(&cached) {
        let _ = tokio::fs::write(path, json).await;
    }
}

async fn fetch_catalog() -> Result<Vec<GroupedModelOption>, String> {
    let client = reqwest::Client::builder()
        .user_agent("Youwee")
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
    let body = client
        .get(INFISTAR_PRICING_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch Infistar models: {}", e))?
        .error_for_status()
        .map_err(|e| format!("Failed to fetch Infistar models: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read Infistar models: {}", e))?;
    let models = parse_infistar_models(&body)?;
    if models.is_empty() {
        return Err("Infistar catalog has no chat models".to_string());
    }
    Ok(models)
}

/// Infistar chat models: fresh cache, else network, else stale cache, else built-in list.
pub async fn get_infistar_models_internal(app: &AppHandle) -> Vec<GroupedModelOption> {
    let cached = read_cache(app).await;
    if let Some(cached) = &cached {
        if now_secs().saturating_sub(cached.fetched_at) < CACHE_TTL_SECS {
            return cached.models.clone();
        }
    }

    match fetch_catalog().await {
        Ok(models) => {
            write_cache(app, &models).await;
            models
        }
        Err(error) => {
            log::warn!("{}", error);
            cached
                .map(|cached| cached.models)
                .unwrap_or_else(infistar_fallback_models)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
      "success": true,
      "data": [
        {"model_name": "claude-sonnet-5-5", "display_name_en": "Claude Sonnet 5.5", "brand_name_en": "Claude",
         "brand_display_order": 300, "model_display_order": 605, "supported_endpoint_types": ["openai", "anthropic"]},
        {"model_name": "gpt-6.1-terra", "display_name_en": "GPT-6.1 Terra", "brand_name_en": "ChatGPT",
         "brand_display_order": 100, "model_display_order": 450, "supported_endpoint_types": ["openai"]},
        {"model_name": "gpt-6.1-sol", "display_name_en": "GPT-6.1 Sol", "brand_name_en": "ChatGPT",
         "brand_display_order": 100, "model_display_order": 400, "supported_endpoint_types": ["openai"]},
        {"model_name": "gemini-3-pro-image", "display_name_en": "Gemini 3 Pro Image", "brand_name_en": "Gemini",
         "brand_display_order": 400, "model_display_order": 10, "supported_endpoint_types": ["openai"]},
        {"model_name": "kling-v3", "display_name_en": "Kling V3", "brand_name_en": "Kling AI",
         "brand_display_order": 900, "model_display_order": 10, "supported_endpoint_types": ["openai-video"]},
        {"model_name": "glm-6", "display_name_en": "", "brand_name": "Zhipu GLM",
         "supported_endpoint_types": ["openai"]},
        {"model_name": "gpt-6.1-sol", "display_name_en": "GPT-6.1 Sol (dup)", "brand_name_en": "ChatGPT",
         "brand_display_order": 100, "model_display_order": 401, "supported_endpoint_types": ["openai"]}
      ],
      "vendors": []
    }"#;

    #[test]
    fn keeps_chat_models_in_display_order_grouped_by_brand() {
        let models = parse_infistar_models(SAMPLE).unwrap();
        let values: Vec<&str> = models.iter().map(|m| m.value.as_str()).collect();
        assert_eq!(
            values,
            ["gpt-6.1-sol", "gpt-6.1-terra", "claude-sonnet-5-5", "glm-6"]
        );
        assert_eq!(models[0].label, "GPT-6.1 Sol");
        assert_eq!(models[0].group, "ChatGPT");
    }

    #[test]
    fn falls_back_to_model_name_and_brand_name() {
        let models = parse_infistar_models(SAMPLE).unwrap();
        let glm = models.iter().find(|m| m.value == "glm-6").unwrap();
        assert_eq!(glm.label, "glm-6");
        assert_eq!(glm.group, "Zhipu GLM");
    }

    #[test]
    fn rejects_invalid_catalog() {
        assert!(parse_infistar_models("<html>").is_err());
    }

    #[test]
    fn fallback_list_is_not_empty() {
        assert!(infistar_fallback_models()
            .iter()
            .any(|m| m.value == "gpt-6.1-sol"));
    }
}
