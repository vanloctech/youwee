use std::sync::Mutex;

// Pending deep links received before the frontend listener is ready.
static PENDING_EXTERNAL_LINKS: Mutex<Vec<String>> = Mutex::new(Vec::new());
const MAX_PENDING_EXTERNAL_LINKS: usize = 100;
const MAX_EXTERNAL_LINK_LENGTH: usize = 4096;

#[derive(Clone, serde::Serialize)]
pub struct ExternalOpenUrlEventPayload {
    pub urls: Vec<String>,
}

fn extract_external_link_from_arg(arg: &str) -> Option<String> {
    let trimmed = arg.trim().trim_matches('"').trim_matches('\'');
    if trimmed.starts_with("youwee://") {
        if is_valid_external_link(trimmed) {
            return Some(trimmed.to_string());
        }
        return None;
    }

    trimmed.find("youwee://").and_then(|start| {
        let candidate = trimmed[start..].trim_matches('"').to_string();
        if is_valid_external_link(&candidate) {
            Some(candidate)
        } else {
            None
        }
    })
}

fn is_valid_external_link(link: &str) -> bool {
    let trimmed = link.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_EXTERNAL_LINK_LENGTH {
        return false;
    }
    if !trimmed.starts_with("youwee://download") && !trimmed.starts_with("youwee://summary") {
        return false;
    }
    trimmed.contains("v=1") && trimmed.contains("url=")
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
            if !is_valid_external_link(&url) {
                continue;
            }
            if !pending.iter().any(|existing| existing == &url) {
                pending.push(url);
                if pending.len() > MAX_PENDING_EXTERNAL_LINKS {
                    let overflow = pending.len() - MAX_PENDING_EXTERNAL_LINKS;
                    pending.drain(0..overflow);
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deep_link_extraction_stays_string_based() {
        let argv = vec![
            "youwee".to_string(),
            "youwee://download?v=1&url=https%3A%2F%2Fexample.com%2Fvideo".to_string(),
        ];

        let links = extract_external_links_from_argv(&argv);

        assert_eq!(
            links,
            vec!["youwee://download?v=1&url=https%3A%2F%2Fexample.com%2Fvideo"]
        );
    }

    #[test]
    fn summary_deep_link_extraction_uses_same_pending_queue() {
        let argv = vec![
            "youwee".to_string(),
            "youwee://summary?v=1&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123"
                .to_string(),
        ];

        let links = extract_external_links_from_argv(&argv);

        assert_eq!(
            links,
            vec!["youwee://summary?v=1&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc123"]
        );
    }
}
