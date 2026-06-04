use super::providers::generate_raw_for_provider;
use super::*;

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
            generate_with_gemini(
                api_key,
                &config.model,
                transcript,
                &config.summary_style,
                &config.summary_language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::OpenAI => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_openai(
                api_key,
                &config.model,
                transcript,
                &config.summary_style,
                &config.summary_language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::DeepSeek => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_deepseek(
                api_key,
                &config.model,
                transcript,
                &config.summary_style,
                &config.summary_language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::Qwen => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_qwen(
                api_key,
                &config.model,
                transcript,
                &config.summary_style,
                &config.summary_language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::Ollama => {
            let ollama_url = config
                .ollama_url
                .as_deref()
                .unwrap_or("http://localhost:11434");
            generate_with_ollama(
                ollama_url,
                &config.model,
                transcript,
                &config.summary_style,
                &config.summary_language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::LmStudio => {
            let lmstudio_url = config
                .lmstudio_url
                .as_deref()
                .unwrap_or("http://localhost:1234");
            generate_with_lmstudio(
                lmstudio_url,
                &config.model,
                transcript,
                &config.summary_style,
                &config.summary_language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::Proxy => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            let proxy_url = config
                .proxy_url
                .as_deref()
                .unwrap_or("https://api.openai.com");
            generate_with_proxy(
                proxy_url,
                api_key,
                &config.model,
                transcript,
                &config.summary_style,
                &config.summary_language,
                title,
                config.timeout_seconds,
            )
            .await
        }
    }
}

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
            generate_with_gemini(
                api_key,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::OpenAI => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_openai(
                api_key,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::DeepSeek => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_deepseek(
                api_key,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::Qwen => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            generate_with_qwen(
                api_key,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::Ollama => {
            let ollama_url = config
                .ollama_url
                .as_deref()
                .unwrap_or("http://localhost:11434");
            generate_with_ollama(
                ollama_url,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::LmStudio => {
            let lmstudio_url = config
                .lmstudio_url
                .as_deref()
                .unwrap_or("http://localhost:1234");
            generate_with_lmstudio(
                lmstudio_url,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
            )
            .await
        }
        AIProvider::Proxy => {
            let api_key = config.api_key.as_ref().ok_or(AIError::NoApiKey)?;
            let proxy_url = config
                .proxy_url
                .as_deref()
                .unwrap_or("https://api.openai.com");
            generate_with_proxy(
                proxy_url,
                api_key,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
            )
            .await
        }
    }
}

pub async fn generate_raw(config: &AIConfig, prompt: &str) -> Result<SummaryResult, AIError> {
    if prompt.trim().is_empty() {
        return Err(AIError::NoTranscript);
    }
    generate_raw_for_provider(config, prompt).await
}

pub async fn test_connection(config: &AIConfig) -> Result<String, AIError> {
    let test_transcript = "This is a test video about programming tutorials.";
    let result = generate_summary(config, test_transcript, None).await?;
    Ok(format!(
        "Connection successful! Using {} with model {}",
        result.provider, result.model
    ))
}
