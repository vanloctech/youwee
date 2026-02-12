use serde::{Deserialize, Serialize};

/// Log entry structure
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct LogEntry {
    pub id: String,
    pub timestamp: String,
    pub log_type: String, // "command" | "success" | "error" | "stderr" | "info"
    pub message: String,
    pub details: Option<String>,
    pub url: Option<String>,
}
