use super::*;
use reqwest::Client;
use std::time::Duration;

const DEFAULT_AI_TIMEOUT_SECONDS: u64 = 120;
const MIN_AI_TIMEOUT_SECONDS: u64 = 30;
const MAX_AI_TIMEOUT_SECONDS: u64 = 60 * 60;
fn normalized_summary_max_tokens(custom_max_tokens: Option<u32>) -> Option<u32> {
    custom_max_tokens.filter(|value| *value > 0)
}

#[cfg(test)]
fn summary_max_tokens_for_config(config: &AIConfig) -> Option<u32> {
    normalized_summary_max_tokens(config.summary_max_tokens)
}

fn normalized_timeout_seconds(timeout_seconds: Option<u64>) -> u64 {
    timeout_seconds
        .unwrap_or(DEFAULT_AI_TIMEOUT_SECONDS)
        .clamp(MIN_AI_TIMEOUT_SECONDS, MAX_AI_TIMEOUT_SECONDS)
}

fn ai_client(timeout_seconds: Option<u64>) -> Result<Client, AIError> {
    Client::builder()
        .timeout(Duration::from_secs(normalized_timeout_seconds(
            timeout_seconds,
        )))
        .build()
        .map_err(|e| AIError::NetworkError(format!("Failed to create AI HTTP client: {}", e)))
}

fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") || trimmed.ends_with("/v1/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
}

fn response_snippet(response_text: &str) -> String {
    const MAX_CHARS: usize = 700;
    let mut snippet = response_text.chars().take(MAX_CHARS).collect::<String>();
    if response_text.chars().count() > MAX_CHARS {
        snippet.push_str("...");
    }
    snippet
}

fn extract_openai_compatible_error(response_text: &str) -> Option<String> {
    let json = serde_json::from_str::<serde_json::Value>(response_text).ok()?;
    let error = json.get("error")?;
    error
        .get("message")
        .and_then(|m| m.as_str())
        .or_else(|| error.as_str())
        .map(str::to_string)
}

fn extract_openai_compatible_text(json: &serde_json::Value) -> Option<String> {
    let choice = json.get("choices")?.get(0)?;
    let message = choice.get("message");

    if let Some(content) = message
        .and_then(|m| m.get("content"))
        .and_then(|content| content.as_str())
    {
        if !content.trim().is_empty() {
            return Some(content.to_string());
        }
    }

    if let Some(parts) = message
        .and_then(|m| m.get("content"))
        .and_then(|content| content.as_array())
    {
        let text = parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(|text| text.as_str())
                    .or_else(|| part.get("content").and_then(|text| text.as_str()))
            })
            .collect::<Vec<_>>()
            .join("");
        if !text.trim().is_empty() {
            return Some(text);
        }
    }

    if let Some(text) = choice.get("text").and_then(|text| text.as_str()) {
        if !text.trim().is_empty() {
            return Some(text.to_string());
        }
    }

    None
}

fn openai_compatible_finish_reason(json: &serde_json::Value) -> Option<&str> {
    let choice = json.get("choices")?.get(0)?;
    choice
        .get("finish_reason")
        .and_then(|reason| reason.as_str())
        .or_else(|| choice.get("stop_reason").and_then(|reason| reason.as_str()))
}

fn parse_openai_compatible_response(
    provider_label: &str,
    status: reqwest::StatusCode,
    response_text: &str,
) -> Result<String, AIError> {
    if !status.is_success() {
        let detail = extract_openai_compatible_error(response_text)
            .unwrap_or_else(|| response_snippet(response_text));
        return Err(AIError::ApiError(format!(
            "{} API returned HTTP {}: {}",
            provider_label, status, detail
        )));
    }

    let json: serde_json::Value = serde_json::from_str(response_text).map_err(|e| {
        AIError::ParseError(format!(
            "{} API returned invalid JSON: {}. Response: {}",
            provider_label,
            e,
            response_snippet(response_text)
        ))
    })?;

    let text = extract_openai_compatible_text(&json).ok_or_else(|| {
        AIError::ParseError(format!(
            "{} API response did not contain message content. Response: {}",
            provider_label,
            response_snippet(response_text)
        ))
    })?;

    if matches!(
        openai_compatible_finish_reason(&json),
        Some("length" | "max_tokens")
    ) {
        return Err(AIError::ApiError(format!(
            "{} API response was cut off by the output token limit. Try again with a shorter transcript or a provider/model that supports longer output.",
            provider_label
        )));
    }

    Ok(text)
}

pub async fn generate_with_gemini(
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let prompt = build_prompt(transcript, style, language, title);
    let max_tokens = normalized_summary_max_tokens(summary_max_tokens);
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );

    let is_thinking_model =
        model.contains("flash-preview") || model.contains("2.5") || model.contains("3-");

    let body = if is_thinking_model {
        let mut body = serde_json::json!({
            "contents": [{ "parts": [{ "text": prompt }] }]
        });
        if let Some(max_tokens) = max_tokens {
            body["generationConfig"] = serde_json::json!({
                "maxOutputTokens": max_tokens
            });
        }
        body
    } else {
        let mut generation_config = serde_json::json!({
            "temperature": 0.7
        });
        if let Some(max_tokens) = max_tokens {
            generation_config["maxOutputTokens"] = serde_json::json!(max_tokens);
        }
        serde_json::json!({
            "contents": [{ "parts": [{ "text": prompt }] }],
            "generationConfig": generation_config
        })
    };

    #[cfg(debug_assertions)]
    {
        println!("[GEMINI] URL: {}", url);
        println!(
            "[GEMINI] Model: {}, Is thinking model: {}",
            model, is_thinking_model
        );
        println!(
            "[GEMINI] Request body: {}",
            serde_json::to_string_pretty(&body).unwrap_or_default()
        );
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    #[cfg(debug_assertions)]
    {
        println!("[GEMINI] Response status: {}", status);
        println!(
            "[GEMINI] Response body: {}",
            &response_text[..response_text.len().min(1000)]
        );
    }

    if !status.is_success() {
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&response_text) {
            let error_msg = error_json
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or(&response_text);
            return Err(AIError::ApiError(format!(
                "Gemini API error: {}",
                error_msg
            )));
        }
        return Err(AIError::ApiError(format!(
            "Status {}: {}",
            status, response_text
        )));
    }

    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| AIError::ParseError(format!("Failed to parse response: {}", e)))?;

    if let Some(error) = json.get("error") {
        let msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error");
        return Err(AIError::ApiError(format!("Gemini error: {}", msg)));
    }

    if let Some(feedback) = json.get("promptFeedback") {
        if let Some(block_reason) = feedback.get("blockReason") {
            return Err(AIError::ApiError(format!(
                "Content blocked: {:?}",
                block_reason
            )));
        }
    }

    let summary = json
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| {
            AIError::ParseError(format!(
                "Could not extract text from response. Response: {}",
                &response_text[..response_text.len().min(500)]
            ))
        })?;

    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "Gemini".to_string(),
        model: model.to_string(),
    })
}

pub async fn generate_with_openai(
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let prompt = build_prompt(transcript, style, language, title);
    let max_tokens = normalized_summary_max_tokens(summary_max_tokens);

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.7
    });
    if let Some(max_tokens) = max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let summary = parse_openai_compatible_response("OpenAI", status, &response_text)?;

    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "OpenAI".to_string(),
        model: model.to_string(),
    })
}

pub async fn generate_with_ollama(
    ollama_url: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let prompt = build_prompt(transcript, style, language, title);
    let url = format!("{}/api/generate", ollama_url.trim_end_matches('/'));
    let max_tokens = normalized_summary_max_tokens(summary_max_tokens);

    let mut options = serde_json::json!({
        "temperature": 0.7
    });
    if let Some(max_tokens) = max_tokens {
        options["num_predict"] = serde_json::json!(max_tokens);
    }

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": options
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            AIError::NetworkError(format!(
                "Failed to connect to Ollama at {}: {}",
                ollama_url, e
            ))
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AIError::ApiError(format!("Status {}: {}", status, text)));
    }

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| AIError::ParseError(e.to_string()))?;

    let summary = json
        .get("response")
        .and_then(|t| t.as_str())
        .ok_or_else(|| AIError::ParseError("No response in Ollama output".to_string()))?;

    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "Ollama".to_string(),
        model: model.to_string(),
    })
}

pub async fn generate_with_deepseek(
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let prompt = build_prompt(transcript, style, language, title);
    let max_tokens = normalized_summary_max_tokens(summary_max_tokens);

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.7
    });
    if let Some(max_tokens) = max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post("https://api.deepseek.com/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let summary = parse_openai_compatible_response("DeepSeek", status, &response_text)?;

    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "DeepSeek".to_string(),
        model: model.to_string(),
    })
}

pub async fn generate_with_qwen(
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let prompt = build_prompt(transcript, style, language, title);
    let max_tokens = normalized_summary_max_tokens(summary_max_tokens);

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.7
    });
    if let Some(max_tokens) = max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let summary = parse_openai_compatible_response("Qwen", status, &response_text)?;

    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "Qwen".to_string(),
        model: model.to_string(),
    })
}

pub async fn generate_with_proxy(
    proxy_url: &str,
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let prompt = build_prompt(transcript, style, language, title);
    let max_tokens = normalized_summary_max_tokens(summary_max_tokens);

    let url = chat_completions_url(proxy_url);

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.7
    });
    if let Some(max_tokens) = max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            AIError::NetworkError(format!(
                "Failed to connect to proxy at {}: {}",
                proxy_url, e
            ))
        })?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    let summary = parse_openai_compatible_response("Proxy", status, &response_text)?;

    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "Proxy".to_string(),
        model: model.to_string(),
    })
}

pub async fn generate_with_lmstudio(
    lmstudio_url: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let prompt = build_prompt(transcript, style, language, title);
    let max_tokens = normalized_summary_max_tokens(summary_max_tokens);

    let url = chat_completions_url(lmstudio_url);

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.7
    });
    if let Some(max_tokens) = max_tokens {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            AIError::NetworkError(format!(
                "Failed to connect to LM Studio at {}: {}",
                lmstudio_url, e
            ))
        })?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    let summary = parse_openai_compatible_response("LM Studio", status, &response_text)?;

    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "LM Studio".to_string(),
        model: model.to_string(),
    })
}

async fn generate_raw_with_gemini(
    api_key: &str,
    model: &str,
    prompt: &str,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );

    let mut body = serde_json::json!({
        "contents": [{ "parts": [{ "text": prompt }] }],
        "generationConfig": {
            "temperature": 0.3
        }
    });
    if let Some(max_tokens) = normalized_summary_max_tokens(summary_max_tokens) {
        body["generationConfig"]["maxOutputTokens"] = serde_json::json!(max_tokens);
    }

    #[cfg(debug_assertions)]
    {
        println!("[GEMINI RAW] URL: {}", url);
        println!("[GEMINI RAW] Prompt: {}", &prompt[..prompt.len().min(500)]);
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    #[cfg(debug_assertions)]
    {
        println!("[GEMINI RAW] Response status: {}", status);
        println!(
            "[GEMINI RAW] Response: {}",
            &response_text[..response_text.len().min(1000)]
        );
    }

    if !status.is_success() {
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&response_text) {
            let error_msg = error_json
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Err(AIError::ApiError(format!(
                "Gemini API error: {}",
                error_msg
            )));
        }
        return Err(AIError::ApiError(format!("Gemini API error: {}", status)));
    }

    let json: serde_json::Value =
        serde_json::from_str(&response_text).map_err(|e| AIError::ParseError(e.to_string()))?;

    let text = json
        .get("candidates")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("content"))
        .and_then(|c| c.get("parts"))
        .and_then(|p| p.get(0))
        .and_then(|p| p.get("text"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| AIError::ParseError("No text in response".to_string()))?;

    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "Gemini".to_string(),
    })
}

async fn generate_raw_with_openai(
    api_key: &str,
    model: &str,
    prompt: &str,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.3
    });
    if let Some(max_tokens) = normalized_summary_max_tokens(summary_max_tokens) {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let text = parse_openai_compatible_response("OpenAI", status, &response_text)?;

    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "OpenAI".to_string(),
    })
}

async fn generate_raw_with_ollama(
    base_url: &str,
    model: &str,
    prompt: &str,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let url = format!("{}/api/generate", base_url.trim_end_matches('/'));

    let mut options = serde_json::json!({
        "temperature": 0.3
    });
    if let Some(max_tokens) = normalized_summary_max_tokens(summary_max_tokens) {
        options["num_predict"] = serde_json::json!(max_tokens);
    }

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": options
    });

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(AIError::ApiError(format!(
            "Ollama error: {}",
            response_text
        )));
    }

    let json: serde_json::Value =
        serde_json::from_str(&response_text).map_err(|e| AIError::ParseError(e.to_string()))?;

    let text = json
        .get("response")
        .and_then(|t| t.as_str())
        .ok_or_else(|| AIError::ParseError("No response in Ollama output".to_string()))?;

    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "Ollama".to_string(),
    })
}

async fn generate_raw_with_lmstudio(
    lmstudio_url: &str,
    model: &str,
    prompt: &str,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let url = chat_completions_url(lmstudio_url);

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.3
    });
    if let Some(max_tokens) = normalized_summary_max_tokens(summary_max_tokens) {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            AIError::NetworkError(format!(
                "Failed to connect to LM Studio at {}: {}",
                lmstudio_url, e
            ))
        })?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let text = parse_openai_compatible_response("LM Studio", status, &response_text)?;

    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "LM Studio".to_string(),
    })
}

async fn generate_raw_with_deepseek(
    api_key: &str,
    model: &str,
    prompt: &str,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.3
    });
    if let Some(max_tokens) = normalized_summary_max_tokens(summary_max_tokens) {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post("https://api.deepseek.com/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let text = parse_openai_compatible_response("DeepSeek", status, &response_text)?;

    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "DeepSeek".to_string(),
    })
}

async fn generate_raw_with_qwen(
    api_key: &str,
    model: &str,
    prompt: &str,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.3
    });
    if let Some(max_tokens) = normalized_summary_max_tokens(summary_max_tokens) {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let text = parse_openai_compatible_response("Qwen", status, &response_text)?;

    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "Qwen".to_string(),
    })
}

async fn generate_raw_with_proxy(
    proxy_url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
    timeout_seconds: Option<u64>,
    summary_max_tokens: Option<u32>,
) -> Result<SummaryResult, AIError> {
    let client = ai_client(timeout_seconds)?;
    let url = chat_completions_url(proxy_url);

    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.3
    });
    if let Some(max_tokens) = normalized_summary_max_tokens(summary_max_tokens) {
        body["max_tokens"] = serde_json::json!(max_tokens);
    }

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    let text = parse_openai_compatible_response("Proxy", status, &response_text)?;

    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "Proxy".to_string(),
    })
}

pub(super) async fn generate_raw_for_provider(
    config: &AIConfig,
    prompt: &str,
) -> Result<SummaryResult, AIError> {
    match config.provider {
        AIProvider::Gemini => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_raw_with_gemini(
                api_key,
                &config.model,
                prompt,
                config.timeout_seconds,
                config.summary_max_tokens,
            )
            .await
        }
        AIProvider::OpenAI => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_raw_with_openai(
                api_key,
                &config.model,
                prompt,
                config.timeout_seconds,
                config.summary_max_tokens,
            )
            .await
        }
        AIProvider::DeepSeek => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_raw_with_deepseek(
                api_key,
                &config.model,
                prompt,
                config.timeout_seconds,
                config.summary_max_tokens,
            )
            .await
        }
        AIProvider::Qwen => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_raw_with_qwen(
                api_key,
                &config.model,
                prompt,
                config.timeout_seconds,
                config.summary_max_tokens,
            )
            .await
        }
        AIProvider::Ollama => {
            let ollama_url = config
                .ollama_url
                .as_deref()
                .unwrap_or("http://localhost:11434");
            generate_raw_with_ollama(
                ollama_url,
                &config.model,
                prompt,
                config.timeout_seconds,
                config.summary_max_tokens,
            )
            .await
        }
        AIProvider::LmStudio => {
            let lmstudio_url = config
                .lmstudio_url
                .as_deref()
                .unwrap_or("http://localhost:1234");
            generate_raw_with_lmstudio(
                lmstudio_url,
                &config.model,
                prompt,
                config.timeout_seconds,
                config.summary_max_tokens,
            )
            .await
        }
        AIProvider::Proxy => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            let proxy_url = config
                .proxy_url
                .as_deref()
                .unwrap_or("https://api.openai.com");
            generate_raw_with_proxy(
                proxy_url,
                api_key,
                &config.model,
                prompt,
                config.timeout_seconds,
                config.summary_max_tokens,
            )
            .await
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_summary_max_tokens_is_unlimited() {
        let config = AIConfig::default();

        assert_eq!(summary_max_tokens_for_config(&config), None);
    }

    #[test]
    fn custom_summary_max_tokens_is_used_when_set() {
        let config = AIConfig {
            summary_max_tokens: Some(8000),
            ..AIConfig::default()
        };

        assert_eq!(summary_max_tokens_for_config(&config), Some(8000));
    }

    #[test]
    fn zero_summary_max_tokens_is_treated_as_unlimited() {
        let config = AIConfig {
            summary_max_tokens: Some(0),
            ..AIConfig::default()
        };

        assert_eq!(summary_max_tokens_for_config(&config), None);
    }

    #[test]
    fn openai_compatible_parser_rejects_length_truncated_output() {
        let response = r#"{
            "choices": [{
                "message": { "content": "Partial summary" },
                "finish_reason": "length"
            }]
        }"#;

        let error = parse_openai_compatible_response("Proxy", reqwest::StatusCode::OK, response)
            .unwrap_err();

        assert!(matches!(error, AIError::ApiError(message) if message.contains("cut off")));
    }
}
