use super::*;
use reqwest::Client;
use std::time::Duration;

const DEFAULT_AI_TIMEOUT_SECONDS: u64 = 120;
const MIN_AI_TIMEOUT_SECONDS: u64 = 30;
const MAX_AI_TIMEOUT_SECONDS: u64 = 60 * 60;
/// The most times we will auto-correct rejected sampling parameters before
/// giving up. Only `temperature` and `max_tokens` can be adjusted, so two
/// corrections is already the practical ceiling; the extra margin is a cheap
/// safety net.
///
/// This counts *corrections*, not total requests: each correction is followed
/// by another attempt, so the worst case is `MAX_OPENAI_PARAM_ADJUSTMENTS + 1`
/// requests (the initial attempt plus one send per correction).
const MAX_OPENAI_PARAM_ADJUSTMENTS: usize = 3;

fn normalized_summary_max_tokens(custom_max_tokens: Option<u32>) -> Option<u32> {
    custom_max_tokens.filter(|value| *value > 0)
}

/// OpenAI model families that still use the legacy Chat Completions sampling
/// parameters (`temperature` + `max_tokens`).
///
/// Newer reasoning-style families (o1/o3/o4/gpt-5 and later) instead use
/// `max_completion_tokens` and do not allow overriding `temperature`.
///
/// We intentionally maintain a short allowlist of legacy families because they
/// are effectively frozen, while newer OpenAI models have consistently moved to
/// the new parameter style.
const OPENAI_LEGACY_MODEL_PREFIXES: &[&str] = &[
    "gpt-3.5",
    "gpt-4-",
    "gpt-4o",
    "gpt-4.1",
    "chatgpt-4o",
];

fn openai_is_legacy_model(model: &str) -> bool {
    let model = model.to_lowercase();
    OPENAI_LEGACY_MODEL_PREFIXES
        .iter()
        .any(|prefix| model.starts_with(prefix))
        || model == "gpt-4"
}

/// Adds the appropriate sampling parameters for the selected OpenAI model.
///
/// Legacy chat models receive:
///   - `temperature`
///   - `max_tokens`
///
/// Newer reasoning-style models receive:
///   - `max_completion_tokens`
///
/// This is only our default guess. If OpenAI rejects the chosen parameters,
/// `post_openai_chat()` automatically retries with the corrected ones.
fn apply_openai_sampling_params(
    body: &mut serde_json::Value,
    model: &str,
    temperature: f64,
    max_tokens: Option<u32>,
) {
    if openai_is_legacy_model(model) {
        body["temperature"] = serde_json::json!(temperature);
        if let Some(max_tokens) = max_tokens {
            body["max_tokens"] = serde_json::json!(max_tokens);
        }
    } else if let Some(max_tokens) = max_tokens {
        body["max_completion_tokens"] = serde_json::json!(max_tokens);
    }
}

/// Inspects an OpenAI "unsupported parameter/value" error and corrects the
/// offending field in `body` in place. Returns whether anything was changed.
///
/// Prefers the structured `error.param` field when OpenAI provides one; falls
/// back to matching the field name in the human-readable message otherwise.
///
/// The token-limit field is swapped in whichever direction is needed: OpenAI
/// reasoning models reject `max_tokens` (swap to `max_completion_tokens`),
/// while some OpenAI-compatible proxies reject `max_completion_tokens` (swap
/// back to `max_tokens`). Matching either field name covers both cases.
fn adjust_openai_request(body: &mut serde_json::Value, error: &OpenAIErrorDetail) -> bool {
    let Some(fields) = body.as_object_mut() else {
        return false;
    };

    let names_temperature = |s: &str| s.contains("temperature");
    // Substring match, so this also fires for "max_completion_tokens".
    let names_max_tokens = |s: &str| s.contains("max_tokens") || s.contains("max_completion_tokens");

    let targets_temperature = error
        .param
        .as_deref()
        .map(names_temperature)
        .unwrap_or_else(|| names_temperature(&error.message));
    let targets_max_tokens = error
        .param
        .as_deref()
        .map(names_max_tokens)
        .unwrap_or_else(|| names_max_tokens(&error.message));

    let mut adjusted = false;
    if targets_temperature && fields.remove("temperature").is_some() {
        adjusted = true;
    }
    if targets_max_tokens {
        // Swap the token-limit field to whichever name we're not currently
        // using, preserving its value. Only one of the two is ever present.
        if let Some(value) = fields.remove("max_tokens") {
            fields.insert("max_completion_tokens".to_string(), value);
            adjusted = true;
        } else if let Some(value) = fields.remove("max_completion_tokens") {
            fields.insert("max_tokens".to_string(), value);
            adjusted = true;
        }
    }
    adjusted
}

/// Sends a chat completion request to OpenAI.
///
/// The request is built using our best-known parameter set for the model family.
/// If OpenAI responds that a parameter (such as `temperature` or `max_tokens`)
/// is unsupported, we adjust just that parameter and retry until no further
/// automatic correction is possible.
async fn post_openai_chat(
    client: &Client,
    url: &str,
    api_key: &str,
    mut body: serde_json::Value,
) -> Result<(reqwest::StatusCode, String), AIError> {
    let send = |body: &serde_json::Value| {
        client
            .post(url)
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", api_key))
            .json(body)
            .send()
    };

    // Initial attempt plus one retry per successful parameter correction.
    for adjustments_left in (0..=MAX_OPENAI_PARAM_ADJUSTMENTS).rev() {
        let response = send(&body).await.map_err(|e| AIError::NetworkError(e.to_string()))?;
        let status = response.status();
        let response_text = response.text().await.unwrap_or_default();

        if status != reqwest::StatusCode::BAD_REQUEST || adjustments_left == 0 {
            return Ok((status, response_text));
        }

        let Some(error) = extract_openai_compatible_error_detail(&response_text) else {
            return Ok((status, response_text));
        };

        if !adjust_openai_request(&mut body, &error) {
            return Ok((status, response_text));
        }
    }

    unreachable!("loop always returns on its final iteration")
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

/// An OpenAI API error, with the structured `param` field (when present) alongside
/// the human-readable message. Used by `adjust_openai_request` to reliably tell which
/// request field OpenAI rejected instead of guessing from the message text.
struct OpenAIErrorDetail {
    message: String,
    param: Option<String>,
}

fn extract_openai_compatible_error_detail(response_text: &str) -> Option<OpenAIErrorDetail> {
    let json = serde_json::from_str::<serde_json::Value>(response_text).ok()?;
    let error = json.get("error")?;
    let message = error
        .get("message")
        .and_then(|m| m.as_str())
        .or_else(|| error.as_str())?
        .to_string();
    let param = error
        .get("param")
        .and_then(|p| p.as_str())
        .map(str::to_string);
    Some(OpenAIErrorDetail { message, param })
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
        "messages": [{ "role": "user", "content": prompt }]
    });
    apply_openai_sampling_params(&mut body, model, 0.7, max_tokens);

    let (status, response_text) = post_openai_chat(
        &client,
        "https://api.openai.com/v1/chat/completions",
        api_key,
        body,
    )
    .await?;
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

    // Proxy is OpenAI-compatible and defaults to api.openai.com with a GPT-5
    // model, so it shares OpenAI's sampling-parameter handling and retry path.
    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }]
    });
    apply_openai_sampling_params(&mut body, model, 0.7, max_tokens);

    let (status, response_text) = post_openai_chat(&client, &url, api_key, body).await?;

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
        "messages": [{ "role": "user", "content": prompt }]
    });
    apply_openai_sampling_params(
        &mut body,
        model,
        0.3,
        normalized_summary_max_tokens(summary_max_tokens),
    );

    let (status, response_text) = post_openai_chat(
        &client,
        "https://api.openai.com/v1/chat/completions",
        api_key,
        body,
    )
    .await?;
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

    // Proxy is OpenAI-compatible; share OpenAI's sampling params + retry path.
    let mut body = serde_json::json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }]
    });
    apply_openai_sampling_params(
        &mut body,
        model,
        0.3,
        normalized_summary_max_tokens(summary_max_tokens),
    );

    let (status, response_text) = post_openai_chat(&client, &url, api_key, body).await?;
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

    // --- apply_openai_sampling_params ---

    #[test]
    fn legacy_model_uses_temperature_and_max_tokens() {
        let mut body = serde_json::json!({});
        apply_openai_sampling_params(&mut body, "gpt-4o", 0.7, Some(1024));

        assert_eq!(body["temperature"], serde_json::json!(0.7));
        assert_eq!(body["max_tokens"], serde_json::json!(1024));
        assert!(body.get("max_completion_tokens").is_none());
    }

    #[test]
    fn reasoning_model_uses_max_completion_tokens_without_temperature() {
        let mut body = serde_json::json!({});
        apply_openai_sampling_params(&mut body, "gpt-5.5", 0.7, Some(1024));

        assert_eq!(body["max_completion_tokens"], serde_json::json!(1024));
        assert!(body.get("temperature").is_none());
        assert!(body.get("max_tokens").is_none());
    }

    #[test]
    fn reasoning_model_omits_token_limit_when_unset() {
        let mut body = serde_json::json!({});
        apply_openai_sampling_params(&mut body, "o3", 0.7, None);

        assert!(body.get("max_completion_tokens").is_none());
        assert!(body.get("temperature").is_none());
        assert!(body.get("max_tokens").is_none());
    }

    #[test]
    fn legacy_model_detection_is_case_insensitive() {
        assert!(openai_is_legacy_model("GPT-4o"));
        assert!(openai_is_legacy_model("gpt-4"));
        assert!(openai_is_legacy_model("gpt-3.5-turbo"));
        assert!(!openai_is_legacy_model("gpt-5.5"));
        assert!(!openai_is_legacy_model("o3-mini"));
    }

    // --- adjust_openai_request ---

    fn error_with_param(message: &str, param: Option<&str>) -> OpenAIErrorDetail {
        OpenAIErrorDetail {
            message: message.to_string(),
            param: param.map(str::to_string),
        }
    }

    #[test]
    fn adjust_removes_rejected_temperature() {
        let mut body = serde_json::json!({
            "temperature": 0.7,
            "max_tokens": 1024
        });
        let error = error_with_param(
            "Unsupported value: 'temperature' does not support 0.7",
            Some("temperature"),
        );

        assert!(adjust_openai_request(&mut body, &error));
        assert!(body.get("temperature").is_none());
        // Untargeted fields are left alone.
        assert_eq!(body["max_tokens"], serde_json::json!(1024));
    }

    #[test]
    fn adjust_converts_rejected_max_tokens_to_max_completion_tokens() {
        let mut body = serde_json::json!({
            "max_tokens": 1024
        });
        let error = error_with_param(
            "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
            Some("max_tokens"),
        );

        assert!(adjust_openai_request(&mut body, &error));
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["max_completion_tokens"], serde_json::json!(1024));
    }

    #[test]
    fn adjust_converts_rejected_max_completion_tokens_back_to_max_tokens() {
        // An OpenAI-compatible proxy that only understands the legacy field.
        let mut body = serde_json::json!({
            "max_completion_tokens": 1024
        });
        let error = error_with_param(
            "Unrecognized request argument supplied: max_completion_tokens",
            Some("max_completion_tokens"),
        );

        assert!(adjust_openai_request(&mut body, &error));
        assert!(body.get("max_completion_tokens").is_none());
        assert_eq!(body["max_tokens"], serde_json::json!(1024));
    }

    #[test]
    fn adjust_falls_back_to_message_when_param_absent() {
        let mut body = serde_json::json!({
            "temperature": 0.7
        });
        let error = error_with_param(
            "This model does not support setting temperature.",
            None,
        );

        assert!(adjust_openai_request(&mut body, &error));
        assert!(body.get("temperature").is_none());
    }

    #[test]
    fn adjust_reports_no_change_when_field_already_absent() {
        // OpenAI names max_tokens, but the body has neither token field.
        let mut body = serde_json::json!({
            "temperature": 0.7
        });
        let error = error_with_param("max_tokens is not supported", Some("max_tokens"));

        assert!(!adjust_openai_request(&mut body, &error));
        // Nothing was touched.
        assert_eq!(body["temperature"], serde_json::json!(0.7));
    }

    #[test]
    fn adjust_removes_temperature_and_swaps_tokens_together() {
        let mut body = serde_json::json!({
            "temperature": 0.7,
            "max_tokens": 512
        });
        // Some models complain about both fields in one message.
        let error = error_with_param(
            "temperature is unsupported and max_tokens must be max_completion_tokens",
            None,
        );

        assert!(adjust_openai_request(&mut body, &error));
        assert!(body.get("temperature").is_none());
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["max_completion_tokens"], serde_json::json!(512));
    }
}
