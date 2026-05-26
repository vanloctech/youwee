use serde::{Deserialize, Serialize};

#[path = "ai/providers.rs"]
mod providers;
#[path = "ai/dispatch.rs"]
mod dispatch;

pub use dispatch::*;
use providers::*;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AIProvider {
    Gemini,
    OpenAI,
    DeepSeek,
    Qwen,
    Ollama,
    LmStudio,
    Proxy,
}

impl Default for AIProvider {
    fn default() -> Self {
        AIProvider::Gemini
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SummaryStyle {
    Short,
    Concise,
    Detailed,
}

impl Default for SummaryStyle {
    fn default() -> Self {
        SummaryStyle::Concise
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AIConfig {
    pub enabled: bool,
    pub provider: AIProvider,
    pub api_key: Option<String>,
    pub model: String,
    pub ollama_url: Option<String>,
    pub lmstudio_url: Option<String>,
    pub proxy_url: Option<String>,
    pub summary_style: SummaryStyle,
    pub summary_language: String,
    pub timeout_seconds: Option<u64>,
    #[serde(default)]
    pub transcript_languages: Option<Vec<String>>,
    #[serde(default)]
    pub whisper_enabled: bool,
    #[serde(default)]
    pub whisper_api_key: Option<String>,
    #[serde(default)]
    pub whisper_endpoint_url: Option<String>,
    #[serde(default)]
    pub whisper_model: Option<String>,
}

impl Default for AIConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: AIProvider::Gemini,
            api_key: None,
            model: "gemini-3.5-flash".to_string(),
            ollama_url: Some("http://localhost:11434".to_string()),
            lmstudio_url: Some("http://localhost:1234".to_string()),
            proxy_url: Some("https://api.openai.com".to_string()),
            summary_style: SummaryStyle::Short,
            summary_language: "auto".to_string(),
            timeout_seconds: Some(120),
            transcript_languages: Some(vec!["en".to_string()]),
            whisper_enabled: false,
            whisper_api_key: None,
            whisper_endpoint_url: None,
            whisper_model: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SummaryResult {
    pub summary: String,
    pub provider: String,
    pub model: String,
}

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
            AIError::NoApiKey => write!(
                f,
                "API key not configured. Please add your API key in Settings."
            ),
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

fn build_prompt(
    transcript: &str,
    style: &SummaryStyle,
    language: &str,
    title: Option<&str>,
) -> String {
    let style_instruction = match style {
        SummaryStyle::Short => {
            "Provide a concise summary in 2-3 sentences capturing the main idea."
        }
        SummaryStyle::Concise => {
            r#"Summarize this video in a clear, structured format:
1. Start with a one-sentence overview of what the video is about
2. List 3-5 key points or takeaways using bullet points
3. Keep each bullet point to 1-2 sentences maximum
Be informative but concise. Focus on the most valuable insights."#
        }
        SummaryStyle::Detailed => {
            r#"Provide a comprehensive summary of this video:
1. Begin with a brief introduction (2-3 sentences) explaining the video's purpose and context
2. Break down ALL major topics discussed using organized bullet points with sub-points where needed
3. Include specific details, examples, statistics, or quotes mentioned
4. End with key conclusions or action items if applicable
Be thorough and capture all important information."#
        }
    };

    let language_instruction = if language == "auto" {
        "Respond in the same language as the transcript."
    } else {
        &format!(
            "Respond in {}.",
            match language {
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
            }
        )
    };

    let max_chars = 8000;
    let truncated = if transcript.chars().count() > max_chars {
        let truncated_str: String = transcript.chars().take(max_chars).collect();
        format!("{}... [truncated]", truncated_str)
    } else {
        transcript.to_string()
    };

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
