use super::providers::generate_raw_for_provider;
use super::*;

pub async fn generate_summary(
    config: &AIConfig,
    transcript: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    generate_summary_custom_with_hooks(
        config,
        transcript,
        &config.summary_style,
        &config.summary_language,
        title,
        &LongSummaryFormat::Auto,
        None,
        &NO_LONG_SUMMARY_HOOKS,
    )
    .await
}

pub async fn generate_summary_custom(
    config: &AIConfig,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
    generate_summary_custom_with_hooks(
        config,
        transcript,
        style,
        language,
        title,
        &LongSummaryFormat::Auto,
        None,
        &NO_LONG_SUMMARY_HOOKS,
    )
    .await
}

pub async fn generate_summary_custom_with_hooks(
    config: &AIConfig,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    long_summary_format: &LongSummaryFormat,
    long_summary_words: Option<u32>,
    hooks: &LongSummaryHooks<'_>,
) -> Result<SummaryResult, AIError> {
    if transcript.trim().is_empty() {
        return Err(AIError::NoTranscript);
    }

    let long_summary_chars = long_summary_words_to_chars(long_summary_words);
    if !should_use_long_summary_with_limit(transcript, long_summary_chars) {
        return generate_summary_custom_once(config, transcript, style, language, title).await;
    }

    let chunks = chunk_transcript(transcript, long_summary_chars);
    if chunks.len() <= 1 {
        return generate_summary_custom_once(config, transcript, style, language, title).await;
    }

    let chunk_count = chunks.len();
    let resolved_format = resolve_long_summary_format(long_summary_format, style);
    let mut chunk_summaries = Vec::with_capacity(chunk_count);

    for (index, chunk) in chunks.iter().enumerate() {
        hooks.ensure_not_cancelled()?;
        hooks.emit(LongSummaryProgress {
            stage: "summarizing-chunk",
            chunk_index: Some(index + 1),
            chunk_count,
        });

        let previous_summary = chunk_summaries
            .last()
            .map(|summary: &ChunkSummary| summary.summary.as_str());
        let prompt = build_chunk_prompt(
            chunk,
            index + 1,
            chunk_count,
            style,
            language,
            previous_summary,
            title,
            resolved_format,
        );
        let result = generate_raw_for_provider(config, &prompt).await?;
        chunk_summaries.push(ChunkSummary {
            index: index + 1,
            summary: result.summary,
        });
    }

    hooks.ensure_not_cancelled()?;
    hooks.emit(LongSummaryProgress {
        stage: "combining",
        chunk_index: None,
        chunk_count,
    });
    let chunk_summaries = reduce_chunk_summaries_for_composition(
        config,
        chunk_summaries,
        style,
        language,
        title,
        resolved_format,
        hooks,
    )
    .await?;

    let prompt = match resolved_format {
        ResolvedLongSummaryFormat::Final => {
            build_final_prompt(&chunk_summaries, style, language, title)
        }
        ResolvedLongSummaryFormat::Parts => {
            build_parts_prompt(&chunk_summaries, style, language, title)
        }
    };
    generate_raw_for_provider(config, &prompt).await
}

async fn reduce_chunk_summaries_for_composition(
    config: &AIConfig,
    chunk_summaries: Vec<ChunkSummary>,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
    resolved_format: ResolvedLongSummaryFormat,
    hooks: &LongSummaryHooks<'_>,
) -> Result<Vec<ChunkSummary>, AIError> {
    let mut summaries = chunk_summaries;

    while summaries.len() > 1 && should_batch_chunk_summaries_for_compose(&summaries) {
        let batches = batch_chunk_summaries_for_compose(&summaries, LONG_SUMMARY_COMPOSE_CHARS);
        if batches.len() >= summaries.len() {
            break;
        }

        let batch_count = batches.len();
        let mut reduced = Vec::with_capacity(batch_count);

        for (batch_index, batch) in batches.iter().enumerate() {
            hooks.ensure_not_cancelled()?;
            let prompt = build_intermediate_prompt(
                batch,
                style,
                language,
                title,
                resolved_format,
                batch_index + 1,
                batch_count,
            );
            let result = generate_raw_for_provider(config, &prompt).await?;
            reduced.push(ChunkSummary {
                index: batch_index + 1,
                summary: result.summary,
            });
        }

        summaries = reduced;
    }

    Ok(summaries)
}

async fn generate_summary_custom_once(
    config: &AIConfig,
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> Result<SummaryResult, AIError> {
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
                config.summary_max_tokens,
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
                config.summary_max_tokens,
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
                config.summary_max_tokens,
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
                config.summary_max_tokens,
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
                config.summary_max_tokens,
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
            generate_with_proxy(
                proxy_url,
                api_key,
                &config.model,
                transcript,
                style,
                language,
                title,
                config.timeout_seconds,
                config.summary_max_tokens,
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
