use std::path::Path;

/// Sanitize and validate output path to prevent path traversal attacks
pub fn sanitize_output_path(path: &str) -> Result<String, String> {
    // Check for empty path
    if path.is_empty() {
        return Err("Invalid output path: path cannot be empty. Please select an output folder.".to_string());
    }
    
    // Check for obvious path traversal attempts
    if path.contains("..") {
        return Err("Invalid output path: path traversal detected".to_string());
    }
    
    let path = Path::new(path);
    
    // Ensure the path is absolute
    if !path.is_absolute() {
        return Err("Invalid output path: must be an absolute path".to_string());
    }
    
    // Create directory if it doesn't exist (for ChromeOS/Linux where Downloads may not exist)
    if !path.exists() {
        std::fs::create_dir_all(path)
            .map_err(|e| format!("Failed to create output directory: {}. Please select a different folder.", e))?;
    }
    
    // Canonicalize to resolve any symlinks and normalize the path
    let canonical = path.canonicalize()
        .map_err(|e| format!("Invalid output path: {}", e))?;
    
    // Verify it's a directory
    if !canonical.is_dir() {
        return Err("Invalid output path: not a directory".to_string());
    }
    
    canonical.to_str()
        .ok_or_else(|| "Invalid output path: contains invalid UTF-8".to_string())
        .map(|s| s.to_string())
}
