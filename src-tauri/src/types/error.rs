use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const BACKEND_ERROR_PREFIX: &str = "__YOUWEE_ERR__";

pub mod code {
    pub const BACKEND_UNKNOWN: &str = "BACKEND_UNKNOWN";
    pub const VALIDATION_INVALID_URL: &str = "VALIDATION_INVALID_URL";
    pub const VALIDATION_INVALID_INPUT: &str = "VALIDATION_INVALID_INPUT";
    pub const DOWNLOAD_CANCELLED: &str = "DOWNLOAD_CANCELLED";
    pub const TRANSCRIPT_NOT_AVAILABLE: &str = "TRANSCRIPT_NOT_AVAILABLE";
    pub const YT_RATE_LIMITED: &str = "YT_RATE_LIMITED";
    pub const YT_PRIVATE_VIDEO: &str = "YT_PRIVATE_VIDEO";
    pub const YT_AGE_RESTRICTED: &str = "YT_AGE_RESTRICTED";
    pub const YT_MEMBERS_ONLY: &str = "YT_MEMBERS_ONLY";
    pub const YT_SIGNIN_REQUIRED: &str = "YT_SIGNIN_REQUIRED";
    pub const YT_GEO_RESTRICTED: &str = "YT_GEO_RESTRICTED";
    pub const YT_VIDEO_UNAVAILABLE: &str = "YT_VIDEO_UNAVAILABLE";
    pub const YT_NO_SUBTITLES: &str = "YT_NO_SUBTITLES";
    pub const YT_SKIPPED_LIVE: &str = "YT_SKIPPED_LIVE";
    pub const YT_SKIPPED_FILTER: &str = "YT_SKIPPED_FILTER";
    pub const YT_UPCOMING_LIVE: &str = "YT_UPCOMING_LIVE";
    pub const YT_COOKIE_DB_LOCKED: &str = "YT_COOKIE_DB_LOCKED";
    pub const YT_FRESH_COOKIES_REQUIRED: &str = "YT_FRESH_COOKIES_REQUIRED";
    pub const NETWORK_TIMEOUT: &str = "NETWORK_TIMEOUT";
    pub const NETWORK_REQUEST_FAILED: &str = "NETWORK_REQUEST_FAILED";
    pub const PROCESS_START_FAILED: &str = "PROCESS_START_FAILED";
    pub const PROCESS_EXECUTION_FAILED: &str = "PROCESS_EXECUTION_FAILED";
    pub const PROCESS_EXIT_NON_ZERO: &str = "PROCESS_EXIT_NON_ZERO";
    pub const PARSE_FAILED: &str = "PARSE_FAILED";
    pub const IO_OPERATION_FAILED: &str = "IO_OPERATION_FAILED";
    pub const DB_OPERATION_FAILED: &str = "DB_OPERATION_FAILED";
    pub const YTDLP_NOT_FOUND: &str = "YTDLP_NOT_FOUND";
    pub const YTDLP_SYSTEM_NOT_FOUND: &str = "YTDLP_SYSTEM_NOT_FOUND";
    pub const YTDLP_APP_NOT_FOUND: &str = "YTDLP_APP_NOT_FOUND";
    pub const YTDLP_SYSTEM_MANAGED: &str = "YTDLP_SYSTEM_MANAGED";
    pub const GALLERYDL_NOT_FOUND: &str = "GALLERYDL_NOT_FOUND";
    pub const ARIA2_NOT_FOUND: &str = "ARIA2_NOT_FOUND";
    pub const FFMPEG_NOT_FOUND: &str = "FFMPEG_NOT_FOUND";
    pub const FFMPEG_SYSTEM_MANAGED: &str = "FFMPEG_SYSTEM_MANAGED";
    pub const AI_API_ERROR: &str = "AI_API_ERROR";
    pub const AI_NO_API_KEY: &str = "AI_NO_API_KEY";
    pub const AI_NO_TRANSCRIPT: &str = "AI_NO_TRANSCRIPT";
    pub const WHISPER_API_ERROR: &str = "WHISPER_API_ERROR";
    pub const WHISPER_NO_API_KEY: &str = "WHISPER_NO_API_KEY";
    pub const WHISPER_UNSUPPORTED_FORMAT: &str = "WHISPER_UNSUPPORTED_FORMAT";
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendErrorWire {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}

#[derive(Debug, Clone)]
pub struct BackendError {
    wire: BackendErrorWire,
}

impl BackendError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        let code = code.into();
        let retryable = Some(default_retryable(&code));
        Self {
            wire: BackendErrorWire {
                code,
                message: message.into(),
                params: None,
                source: None,
                retryable,
            },
        }
    }

    pub fn from_message(message: impl Into<String>) -> Self {
        let message = message.into();
        let code = infer_error_code(&message);
        Self::new(code, message)
    }

    pub fn with_source(mut self, source: impl Into<String>) -> Self {
        self.wire.source = Some(source.into());
        self
    }

    pub fn with_retryable(mut self, retryable: bool) -> Self {
        self.wire.retryable = Some(retryable);
        self
    }

    pub fn with_param(mut self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        let mut map = match self.wire.params.take() {
            Some(Value::Object(obj)) => obj,
            _ => Map::new(),
        };
        map.insert(key.into(), value.into());
        self.wire.params = Some(Value::Object(map));
        self
    }

    pub fn with_params(mut self, params: Map<String, Value>) -> Self {
        self.wire.params = Some(Value::Object(params));
        self
    }

    pub fn code(&self) -> &str {
        &self.wire.code
    }

    pub fn message(&self) -> &str {
        &self.wire.message
    }

    pub fn params(&self) -> Option<&Value> {
        self.wire.params.as_ref()
    }

    pub fn to_wire(&self) -> BackendErrorWire {
        self.wire.clone()
    }

    pub fn to_wire_string(&self) -> String {
        match serde_json::to_string(&self.wire) {
            Ok(json) => format!("{}{}", BACKEND_ERROR_PREFIX, json),
            Err(_) => format!(
                "{}{{\"code\":\"{}\",\"message\":\"{}\"}}",
                BACKEND_ERROR_PREFIX,
                code::BACKEND_UNKNOWN,
                escape_json_string(self.message())
            ),
        }
    }
}

pub fn to_wire_error_string(message: impl Into<String>) -> String {
    BackendError::from_message(message).to_wire_string()
}

pub fn parse_wire_error_string(raw: &str) -> Option<BackendErrorWire> {
    let payload = raw.strip_prefix(BACKEND_ERROR_PREFIX)?;
    serde_json::from_str(payload).ok()
}

pub fn infer_error_code(message: &str) -> &'static str {
    let m = message.to_lowercase();

    if m.contains("invalid url") || m.contains("url is invalid") {
        return code::VALIDATION_INVALID_URL;
    }
    if m.contains("invalid ") {
        return code::VALIDATION_INVALID_INPUT;
    }
    if m.contains("download cancelled") || m.contains("canceled") || m.contains("cancelled") {
        return code::DOWNLOAD_CANCELLED;
    }
    if m.contains("no transcript available") || m.contains("no subtitles") {
        return code::TRANSCRIPT_NOT_AVAILABLE;
    }
    if m.contains("could not copy") && m.contains("cookie") && m.contains("database") {
        return code::YT_COOKIE_DB_LOCKED;
    }
    if m.contains("fresh cookies") {
        return code::YT_FRESH_COOKIES_REQUIRED;
    }
    if m.contains("429") || m.contains("too many requests") || m.contains("rate limited") {
        return code::YT_RATE_LIMITED;
    }
    if m.contains("private video") {
        return code::YT_PRIVATE_VIDEO;
    }
    if m.contains("age-restricted") || m.contains("confirm your age") {
        return code::YT_AGE_RESTRICTED;
    }
    if m.contains("members-only") || m.contains("member-only") || m.contains("join this channel") {
        return code::YT_MEMBERS_ONLY;
    }
    if m.contains("sign in")
        || m.contains("login required")
        || m.contains("cookies") && m.contains("required")
    {
        return code::YT_SIGNIN_REQUIRED;
    }
    if m.contains("not available in your country") || m.contains("geo") && m.contains("restricted")
    {
        return code::YT_GEO_RESTRICTED;
    }
    if m.contains("video unavailable") || m.contains("this video is unavailable") {
        return code::YT_VIDEO_UNAVAILABLE;
    }
    if m.contains("this live event will begin")
        || m.contains("premieres in")
        || m.contains("premiere will begin")
        || m.contains("live event has not started")
    {
        return code::YT_UPCOMING_LIVE;
    }
    if m.contains("does not pass filter") || m.contains("skipped by filter") {
        return code::YT_SKIPPED_FILTER;
    }
    if m.contains("no subtitles") || m.contains("subtitles are disabled") {
        return code::YT_NO_SUBTITLES;
    }
    if m.contains("system yt-dlp not found") {
        return code::YTDLP_SYSTEM_NOT_FOUND;
    }
    if m.contains("app-managed yt-dlp not found") {
        return code::YTDLP_APP_NOT_FOUND;
    }
    if m.contains("system yt-dlp is managed externally") {
        return code::YTDLP_SYSTEM_MANAGED;
    }
    if m.contains("yt-dlp not found") {
        return code::YTDLP_NOT_FOUND;
    }
    if m.contains("gallery-dl not found") || m.contains("system gallery-dl not found") {
        return code::GALLERYDL_NOT_FOUND;
    }
    if m.contains("aria2c not found")
        || (m.contains("aria2c") || m.contains("aria2"))
            && (m.contains("no such file")
                || m.contains("not recognized")
                || m.contains("not found"))
    {
        return code::ARIA2_NOT_FOUND;
    }
    if m.contains("system ffmpeg is managed externally") {
        return code::FFMPEG_SYSTEM_MANAGED;
    }
    if m.contains("ffmpeg not found") || m.contains("ffprobe not found") {
        return code::FFMPEG_NOT_FOUND;
    }
    if m.contains("timed out") || m.contains("timeout") {
        return code::NETWORK_TIMEOUT;
    }
    if m.contains("network error")
        || m.contains("connection")
        || m.contains("unable to download")
        || m.contains("failed to fetch")
        || m.contains("request error")
    {
        return code::NETWORK_REQUEST_FAILED;
    }
    if m.contains("failed to start") {
        return code::PROCESS_START_FAILED;
    }
    if m.contains("process error") || m.contains("failed to run") {
        return code::PROCESS_EXECUTION_FAILED;
    }
    if m.contains("exit code") || m.contains("download failed") {
        return code::PROCESS_EXIT_NON_ZERO;
    }
    if m.contains("failed to parse") || m.contains("parse error") {
        return code::PARSE_FAILED;
    }
    if m.contains("failed to read")
        || m.contains("failed to write")
        || m.contains("no such file")
        || m.contains("permission denied")
        || m.contains("failed to open")
    {
        return code::IO_OPERATION_FAILED;
    }
    if m.contains("query failed")
        || m.contains("database")
        || m.contains("failed to insert")
        || m.contains("failed to delete")
        || m.contains("failed to clear")
    {
        return code::DB_OPERATION_FAILED;
    }
    if m.contains("api key not configured") {
        return code::AI_NO_API_KEY;
    }
    if m.contains("ai api error") {
        return code::AI_API_ERROR;
    }
    if m.contains("no transcript") {
        return code::AI_NO_TRANSCRIPT;
    }
    if m.contains("openai api key not configured for whisper") {
        return code::WHISPER_NO_API_KEY;
    }
    if m.contains("unsupported audio format") {
        return code::WHISPER_UNSUPPORTED_FORMAT;
    }
    if m.contains("whisper api error") {
        return code::WHISPER_API_ERROR;
    }

    code::BACKEND_UNKNOWN
}

pub fn default_retryable(code: &str) -> bool {
    matches!(
        code,
        code::NETWORK_TIMEOUT
            | code::NETWORK_REQUEST_FAILED
            | code::YT_RATE_LIMITED
            | code::PROCESS_START_FAILED
            | code::PROCESS_EXECUTION_FAILED
            | code::PROCESS_EXIT_NON_ZERO
    )
}

fn escape_json_string(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}
