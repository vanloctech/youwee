use reqwest::Client;
use serde::{Deserialize, Serialize};

/// AI Provider options
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AIProvider {
    Gemini,
    OpenAI,
    Ollama,
    Proxy, // OpenAI-compatible API with custom domain
}

impl Default for AIProvider {
    fn default() -> Self {
        AIProvider::Gemini
    }
}

/// Summary style options
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SummaryStyle {
    Short,    // 2-3 sentences
    Concise,  // Balanced summary with key points
    Detailed, // Comprehensive bullet points with all details
}

impl Default for SummaryStyle {
    fn default() -> Self {
        SummaryStyle::Concise
    }
}

/// AI Configuration
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AIConfig {
    pub enabled: bool,
    pub provider: AIProvider,
    pub api_key: Option<String>,
    pub model: String,
    pub ollama_url: Option<String>,
    pub proxy_url: Option<String>, // Custom OpenAI-compatible API endpoint
    pub summary_style: SummaryStyle,
    pub summary_language: String, // "auto", "en", "vi", "ja", etc.
    pub timeout_seconds: Option<u64>, // Timeout for AI generation (default 120s)
    #[serde(default)]
    pub transcript_languages: Option<Vec<String>>, // Languages to try for transcript extraction
}

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: AIProvider::Gemini,
            api_key: None,
            model: "gemini-2.0-flash".to_string(),
            ollama_url: Some("http://localhost:11434".to_string()),
            proxy_url: Some("https://api.openai.com".to_string()),
            summary_style: SummaryStyle::Short,
            summary_language: "auto".to_string(),
            timeout_seconds: Some(120),
            transcript_languages: Some(vec!["en".to_string()]),
        }
    }
}

/// AI Summary result
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SummaryResult {
    pub summary: String,
    pub provider: String,
    pub model: String,
}

/// Error types for AI operations
#[derive(Debug)]
pub enum AIError {
    NoApiKey,
    NoTranscript,
    ApiError(String),
    NetworkError(String),
    ParseError(String),
}

impl std::fmt::Display for AIError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AIError::NoApiKey => write!(f, "API key not configured. Please add your API key in Settings."),
            AIError::NoTranscript => write!(f, "No transcript available for this video."),
            AIError::ApiError(msg) => write!(f, "AI API error: {}", msg),
            AIError::NetworkError(msg) => write!(f, "Network error: {}", msg),
            AIError::ParseError(msg) => write!(f, "Failed to parse response: {}", msg),
        }
    }
}

impl From<AIError> for String {
    fn from(err: AIError) -> String {
        err.to_string()
    }
}

/// Build prompt based on style and language
fn build_prompt(transcript: &str, style: &SummaryStyle, language: &str, title: Option<&str>) -> String {
    let style_instruction = match style {
        SummaryStyle::Short => "Provide a concise summary in 2-3 sentences capturing the main idea.",
        SummaryStyle::Concise => r#"Summarize this video in a clear, structured format:
1. Start with a one-sentence overview of what the video is about
2. List 3-5 key points or takeaways using bullet points
3. Keep each bullet point to 1-2 sentences maximum
Be informative but concise. Focus on the most valuable insights."#,
        SummaryStyle::Detailed => r#"Provide a comprehensive summary of this video:
1. Begin with a brief introduction (2-3 sentences) explaining the video's purpose and context
2. Break down ALL major topics discussed using organized bullet points with sub-points where needed
3. Include specific details, examples, statistics, or quotes mentioned
4. End with key conclusions or action items if applicable
Be thorough and capture all important information."#,
    };
    
    let language_instruction = if language == "auto" {
        "Respond in the same language as the transcript."
    } else {
        &format!("Respond in {}.", match language {
            "en" => "English",
            "vi" => "Vietnamese",
            "ja" => "Japanese",
            "ko" => "Korean",
            "zh" => "Chinese",
            "es" => "Spanish",
            "fr" => "French",
            "de" => "German",
            "pt" => "Portuguese",
            "ru" => "Russian",
            _ => language,
        })
    };
    
    // Truncate transcript if too long (keep ~8000 chars for context window)
    // Use char indices to avoid cutting in the middle of multi-byte UTF-8 characters
    let max_chars = 8000;
    let truncated = if transcript.chars().count() > max_chars {
        let truncated_str: String = transcript.chars().take(max_chars).collect();
        format!("{}... [truncated]", truncated_str)
    } else {
        transcript.to_string()
    };
    
    // Include title if provided for better context
    let title_section = match title {
        Some(t) if !t.is_empty() => format!("Video Title: \"{}\"\n\n", t),
        _ => String::new(),
    };
    
    format!(
        "You are a helpful assistant that summarizes video content.\n\n\
        {}\n\
        {}\n\n\
        {}Here is the video transcript:\n\n\
        {}\n\n\
        Summary:",
        style_instruction, language_instruction, title_section, truncated
    )
}

/// Generate summary using Gemini API
pub async fn generate_with_gemini(
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    let prompt = build_prompt(transcript, style, language, title);
    
    // Gemini API endpoint - use v1beta for latest models
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );
    
    // Build request body - for thinking models (gemini-2.5, gemini-3), don't restrict output tokens
    let is_thinking_model = model.contains("flash-preview") || model.contains("2.5") || model.contains("3-");
    
    let body = if is_thinking_model {
        serde_json::json!({
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }]
        })
    } else {
        serde_json::json!({
            "contents": [{
                "parts": [{
                    "text": prompt
                }]
            }],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048
            }
        })
    };
    
    #[cfg(debug_assertions)]
    {
        println!("[GEMINI] URL: {}", url);
        println!("[GEMINI] Model: {}, Is thinking model: {}", model, is_thinking_model);
        println!("[GEMINI] Request body: {}", serde_json::to_string_pretty(&body).unwrap_or_default());
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
        println!("[GEMINI] Response body: {}", &response_text[..response_text.len().min(1000)]);
    }
    
    if !status.is_success() {
        // Parse error message from response
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&response_text) {
            let error_msg = error_json
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or(&response_text);
            return Err(AIError::ApiError(format!("Gemini API error: {}", error_msg)));
        }
        return Err(AIError::ApiError(format!("Status {}: {}", status, response_text)));
    }
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| AIError::ParseError(format!("Failed to parse response: {}", e)))?;
    
    // Check for blocked content or errors in response
    if let Some(error) = json.get("error") {
        let msg = error.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown error");
        return Err(AIError::ApiError(format!("Gemini error: {}", msg)));
    }
    
    // Check prompt feedback for blocked content
    if let Some(feedback) = json.get("promptFeedback") {
        if let Some(block_reason) = feedback.get("blockReason") {
            return Err(AIError::ApiError(format!("Content blocked: {:?}", block_reason)));
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
            // Provide more context about why parsing failed
            AIError::ParseError(format!("Could not extract text from response. Response: {}", 
                &response_text[..response_text.len().min(500)]))
        })?;
    
    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "Gemini".to_string(),
        model: model.to_string(),
    })
}

/// Generate summary using OpenAI API
pub async fn generate_with_openai(
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    let prompt = build_prompt(transcript, style, language, title);
    
    let body = serde_json::json!({
        "model": model,
        "messages": [{
            "role": "user",
            "content": prompt
        }],
        "temperature": 0.7,
        "max_tokens": 1024,
    });
    
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(e.to_string()))?;
    
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
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| AIError::ParseError("No content in response".to_string()))?;
    
    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "OpenAI".to_string(),
        model: model.to_string(),
    })
}

/// Generate summary using Ollama (local)
pub async fn generate_with_ollama(
    ollama_url: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    let prompt = build_prompt(transcript, style, language, title);
    
    let url = format!("{}/api/generate", ollama_url.trim_end_matches('/'));
    
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": 0.7,
        }
    });
    
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(format!("Failed to connect to Ollama at {}: {}", ollama_url, e)))?;
    
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

/// Generate summary using Proxy (OpenAI-compatible API with custom domain)
pub async fn generate_with_proxy(
    proxy_url: &str,
    api_key: &str,
    model: &str,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    let prompt = build_prompt(transcript, style, language, title);
    
    // Build endpoint URL - support both with and without /v1/chat/completions suffix
    let base_url = proxy_url.trim_end_matches('/');
    let url = if base_url.ends_with("/chat/completions") || base_url.ends_with("/v1/chat/completions") {
        base_url.to_string()
    } else if base_url.ends_with("/v1") {
        format!("{}/chat/completions", base_url)
    } else {
        format!("{}/v1/chat/completions", base_url)
    };
    
    let body = serde_json::json!({
        "model": model,
        "messages": [{
            "role": "user",
            "content": prompt
        }],
        "temperature": 0.7,
        "max_tokens": 1024,
    });
    
    let response = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| AIError::NetworkError(format!("Failed to connect to proxy at {}: {}", proxy_url, e)))?;
    
    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();
    
    if !status.is_success() {
        // Parse error message from response
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&response_text) {
            let error_msg = error_json
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or(&response_text);
            return Err(AIError::ApiError(format!("Proxy API error: {}", error_msg)));
        }
        return Err(AIError::ApiError(format!("Status {}: {}", status, response_text)));
    }
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| AIError::ParseError(format!("Failed to parse response: {}", e)))?;
    
    let summary = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| AIError::ParseError(format!(
            "No content in response. Response: {}", 
            &response_text[..response_text.len().min(500)]
        )))?;
    
    Ok(SummaryResult {
        summary: summary.trim().to_string(),
        provider: "Proxy".to_string(),
        model: model.to_string(),
    })
}

/// Generate summary based on config
pub async fn generate_summary(
    config: &AIConfig,
    transcript: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    if transcript.trim().is_empty() {
        return Err(AIError::NoTranscript);
    }
    
    match config.provider {
        AIProvider::Gemini => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_gemini(api_key, &config.model, transcript, &config.summary_style, &config.summary_language, title).await
        }
        AIProvider::OpenAI => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_openai(api_key, &config.model, transcript, &config.summary_style, &config.summary_language, title).await
        }
        AIProvider::Ollama => {
            let ollama_url = config.ollama_url.as_ref().map(|s| s.as_str()).unwrap_or("http://localhost:11434");
            generate_with_ollama(ollama_url, &config.model, transcript, &config.summary_style, &config.summary_language, title).await
        }
        AIProvider::Proxy => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            let proxy_url = config.proxy_url.as_ref().map(|s| s.as_str()).unwrap_or("https://api.openai.com");
            generate_with_proxy(proxy_url, api_key, &config.model, transcript, &config.summary_style, &config.summary_language, title).await
        }
    }
}

/// Generate summary with custom style and language (overriding config)
pub async fn generate_summary_custom(
    config: &AIConfig,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    if transcript.trim().is_empty() {
        return Err(AIError::NoTranscript);
    }
    
    match config.provider {
        AIProvider::Gemini => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_gemini(api_key, &config.model, transcript, style, language, title).await
        }
        AIProvider::OpenAI => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_openai(api_key, &config.model, transcript, style, language, title).await
        }
        AIProvider::Ollama => {
            let ollama_url = config.ollama_url.as_ref().map(|s| s.as_str()).unwrap_or("http://localhost:11434");
            generate_with_ollama(ollama_url, &config.model, transcript, style, language, title).await
        }
        AIProvider::Proxy => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            let proxy_url = config.proxy_url.as_ref().map(|s| s.as_str()).unwrap_or("https://api.openai.com");
            generate_with_proxy(proxy_url, api_key, &config.model, transcript, style, language, title).await
        }
    }
}

/// Generate raw AI response without summarization prompt wrapping
/// Used for FFmpeg command generation and other custom tasks
pub async fn generate_raw(config: &AIConfig, prompt: &str) -> Result<SummaryResult, AIError> {
    if prompt.trim().is_empty() {
        return Err(AIError::NoTranscript);
    }
    
    match config.provider {
        AIProvider::Gemini => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_raw_with_gemini(api_key, &config.model, prompt).await
        }
        AIProvider::OpenAI => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_raw_with_openai(api_key, &config.model, prompt).await
        }
        AIProvider::Ollama => {
            let ollama_url = config.ollama_url.as_ref().map(|s| s.as_str()).unwrap_or("http://localhost:11434");
            generate_raw_with_ollama(ollama_url, &config.model, prompt).await
        }
        AIProvider::Proxy => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            let proxy_url = config.proxy_url.as_ref().map(|s| s.as_str()).unwrap_or("https://api.openai.com");
            generate_raw_with_proxy(proxy_url, api_key, &config.model, prompt).await
        }
    }
}

/// Raw generation with Gemini (no summarization wrapping)
async fn generate_raw_with_gemini(
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );
    
    let body = serde_json::json!({
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 2048
        }
    });
    
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
        println!("[GEMINI RAW] Response: {}", &response_text[..response_text.len().min(1000)]);
    }
    
    if !status.is_success() {
        if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&response_text) {
            let error_msg = error_json
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Err(AIError::ApiError(format!("Gemini API error: {}", error_msg)));
        }
        return Err(AIError::ApiError(format!("Gemini API error: {}", status)));
    }
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| AIError::ParseError(e.to_string()))?;
    
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

/// Raw generation with OpenAI (no summarization wrapping)
async fn generate_raw_with_openai(
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    
    let body = serde_json::json!({
        "model": model,
        "messages": [{
            "role": "user",
            "content": prompt
        }],
        "temperature": 0.3,
        "max_tokens": 2048
    });
    
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
    
    if !status.is_success() {
        return Err(AIError::ApiError(format!("OpenAI API error: {}", response_text)));
    }
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| AIError::ParseError(e.to_string()))?;
    
    let text = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| AIError::ParseError("No text in response".to_string()))?;
    
    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "OpenAI".to_string(),
    })
}

/// Raw generation with Ollama (no summarization wrapping)
async fn generate_raw_with_ollama(
    base_url: &str,
    model: &str,
    prompt: &str,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    let url = format!("{}/api/generate", base_url.trim_end_matches('/'));
    
    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": false,
        "options": {
            "temperature": 0.3
        }
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
        return Err(AIError::ApiError(format!("Ollama error: {}", response_text)));
    }
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| AIError::ParseError(e.to_string()))?;
    
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

/// Raw generation with Proxy (no summarization wrapping)
async fn generate_raw_with_proxy(
    proxy_url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
) -> Result<SummaryResult, AIError> {
    let client = Client::new();
    let url = format!("{}/v1/chat/completions", proxy_url.trim_end_matches('/'));
    
    let body = serde_json::json!({
        "model": model,
        "messages": [{
            "role": "user",
            "content": prompt
        }],
        "temperature": 0.3,
        "max_tokens": 2048
    });
    
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
    
    if !status.is_success() {
        return Err(AIError::ApiError(format!("Proxy API error: {}", response_text)));
    }
    
    let json: serde_json::Value = serde_json::from_str(&response_text)
        .map_err(|e| AIError::ParseError(e.to_string()))?;
    
    let text = json
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|t| t.as_str())
        .ok_or_else(|| AIError::ParseError("No text in response".to_string()))?;
    
    Ok(SummaryResult {
        summary: text.to_string(),
        model: model.to_string(),
        provider: "Proxy".to_string(),
    })
}

/// Test AI connection with a simple prompt
pub async fn test_connection(config: &AIConfig) -> Result<String, AIError> {
    let test_transcript = "This is a test video about programming tutorials.";
    let result = generate_summary(config, test_transcript, None).await?;
    Ok(format!("Connection successful! Using {} with model {}", result.provider, result.model))
}
