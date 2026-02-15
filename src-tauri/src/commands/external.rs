use std::sync::Mutex;

// Pending deep links received before the frontend listener is ready.
static PENDING_EXTERNAL_LINKS: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[derive(Clone, serde::Serialize)]
pub struct ExternalOpenUrlEventPayload {
    pub urls: Vec<String>,
}

fn extract_external_link_from_arg(arg: &str) -> Option<String> {
    let trimmed = arg.trim().trim_matches('"').trim_matches('\'');
    if trimmed.starts_with("youwee://") {
        return Some(trimmed.to_string());
    }

    trimmed
        .find("youwee://")
        .map(|start| trimmed[start..].trim_matches('"').to_string())
}

pub fn extract_external_links_from_argv(argv: &[String]) -> Vec<String> {
    let mut links: Vec<String> = Vec::new();
    for arg in argv {
        if let Some(link) = extract_external_link_from_arg(arg) {
            if !links.iter().any(|existing| existing == &link) {
                links.push(link);
            }
        }
    }
    links
}

pub fn enqueue_external_links(urls: Vec<String>) {
    if urls.is_empty() {
        return;
    }
    if let Ok(mut pending) = PENDING_EXTERNAL_LINKS.lock() {
        for url in urls {
            if !pending.iter().any(|existing| existing == &url) {
                pending.push(url);
            }
        }
    }
}

pub fn take_pending_external_links() -> Vec<String> {
    if let Ok(mut pending) = PENDING_EXTERNAL_LINKS.lock() {
        return std::mem::take(&mut *pending);
    }
    Vec::new()
}

#[tauri::command]
pub fn consume_pending_external_links() -> Vec<String> {
    take_pending_external_links()
}
