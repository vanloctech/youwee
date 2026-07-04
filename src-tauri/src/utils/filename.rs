//! Filename sanitization and yt-dlp output template helpers.

const WINDOWS_MAX_PATH: usize = 260;
const RESERVED_SUFFIX_BYTES: usize = 40;
const MIN_TRIM_FILENAMES: u32 = 50;
const MAX_TRIM_FILENAMES: u32 = 200;
const DEFAULT_TRIM_FILENAMES: u32 = 120;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FilenameTemplatePreset {
    Title,
    TitleId,
    UploaderTitle,
    IdOnly,
}

impl FilenameTemplatePreset {
    pub fn from_str(value: &str) -> Self {
        match value {
            "title" => Self::Title,
            "uploader_title" => Self::UploaderTitle,
            "id_only" => Self::IdOnly,
            _ => Self::TitleId,
        }
    }

    pub fn body(self) -> &'static str {
        match self {
            Self::Title => "%(title)s",
            Self::TitleId => "%(title).100B [%(id)s]",
            Self::UploaderTitle => "%(uploader)s - %(title).80B",
            Self::IdOnly => "%(id)s",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct FilenameAdvancedOverrides {
    pub restrict_filenames: bool,
    pub trim_filenames: Option<u32>,
}

/// Sanitize a user-facing string for use in filesystem paths.
pub fn sanitize_filename_part(value: &str, fallback: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0' => ' ',
            ch if ch.is_control() => ' ',
            ch => ch,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = sanitized.trim_matches(['.', ' ']).trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.chars().take(120).collect()
    }
}

pub fn calc_trim_filenames_bytes(output_path: &str) -> u32 {
    let path_len = output_path.chars().count();
    let available = WINDOWS_MAX_PATH
        .saturating_sub(path_len)
        .saturating_sub(RESERVED_SUFFIX_BYTES);
    (available as u32).clamp(MIN_TRIM_FILENAMES, MAX_TRIM_FILENAMES)
}

pub fn is_long_title_site(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    let Some(host) = parsed.host_str().map(|host| host.to_ascii_lowercase()) else {
        return false;
    };

    host == "facebook.com"
        || host.ends_with(".facebook.com")
        || host == "fb.watch"
        || host == "instagram.com"
        || host.ends_with(".instagram.com")
}

pub fn resolve_filename_preset(
    url: &str,
    user_preset: FilenameTemplatePreset,
) -> FilenameTemplatePreset {
    if !is_long_title_site(url) {
        return user_preset;
    }

    match user_preset {
        FilenameTemplatePreset::Title => FilenameTemplatePreset::TitleId,
        other => other,
    }
}

pub fn filename_body_for_preset(preset: FilenameTemplatePreset) -> &'static str {
    preset.body()
}

fn number_width(total: Option<u32>) -> usize {
    total
        .filter(|value| *value >= 100)
        .map(|value| value.to_string().len())
        .unwrap_or(2)
}

fn build_playlist_prefix(
    enabled: bool,
    playlist_index: Option<u32>,
    playlist_total: Option<u32>,
) -> Option<String> {
    if !enabled {
        return None;
    }

    let width = number_width(playlist_total);
    playlist_index
        .map(|index| format!("{index:0width$} - "))
        .or_else(|| Some(format!("%(playlist_index)0{width}d - ")))
}

fn build_queue_prefix(
    enabled: bool,
    queue_index: Option<u32>,
    queue_total: Option<u32>,
) -> Option<String> {
    if !enabled {
        return None;
    }

    let index = queue_index?;
    let width = number_width(queue_total);
    Some(format!("{index:0width$} - "))
}

pub fn build_ytdlp_output_template(
    output_path: &str,
    url: &str,
    preset: FilenameTemplatePreset,
    number_playlist_items: bool,
    playlist_index: Option<u32>,
    playlist_total: Option<u32>,
    number_queue_items: bool,
    queue_index: Option<u32>,
    queue_total: Option<u32>,
) -> String {
    let prefix = build_playlist_prefix(number_playlist_items, playlist_index, playlist_total)
        .or_else(|| build_queue_prefix(number_queue_items, queue_index, queue_total))
        .unwrap_or_default();
    let body = filename_body_for_preset(resolve_filename_preset(url, preset));
    format!("{output_path}/{prefix}{body}.%(ext)s")
}

pub fn build_ytdlp_chapter_output_template(
    output_path: &str,
    number_playlist_items: bool,
    playlist_index: Option<u32>,
    playlist_total: Option<u32>,
    number_queue_items: bool,
    queue_index: Option<u32>,
    queue_total: Option<u32>,
    number_chapter_files: bool,
) -> String {
    let item_prefix = build_playlist_prefix(number_playlist_items, playlist_index, playlist_total)
        .or_else(|| build_queue_prefix(number_queue_items, queue_index, queue_total))
        .unwrap_or_default();
    let chapter_prefix = if number_chapter_files {
        "%(section_number)02d - "
    } else {
        ""
    };
    format!("{output_path}/{item_prefix}{chapter_prefix}%(section_title)s.%(ext)s")
}

pub fn build_ytdlp_metadata_output_template(
    output_path: &str,
    url: &str,
    preset: FilenameTemplatePreset,
) -> String {
    let body = filename_body_for_preset(resolve_filename_preset(url, preset));
    format!("{output_path}/{body}")
}

pub struct SafeFilenameOptions<'a> {
    pub output_path: Option<&'a str>,
    pub restrict_ascii: bool,
    pub trim_filenames: Option<u32>,
}

pub fn add_safe_filename_args(args: &mut Vec<String>, options: SafeFilenameOptions<'_>) {
    #[cfg(windows)]
    {
        args.push("--windows-filenames".to_string());
    }

    if options.restrict_ascii {
        args.push("--restrict-filenames".to_string());
    }

    let trim = options
        .trim_filenames
        .or_else(|| options.output_path.map(calc_trim_filenames_bytes))
        .unwrap_or(DEFAULT_TRIM_FILENAMES);

    args.push("--trim-filenames".to_string());
    args.push(trim.to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_filename_preset_upgrades_facebook_title_mode() {
        assert_eq!(
            resolve_filename_preset(
                "https://www.facebook.com/reel/123",
                FilenameTemplatePreset::Title
            ),
            FilenameTemplatePreset::TitleId
        );
    }

    #[test]
    fn resolve_filename_preset_keeps_user_choice_for_youtube() {
        assert_eq!(
            resolve_filename_preset(
                "https://www.youtube.com/watch?v=abc",
                FilenameTemplatePreset::Title
            ),
            FilenameTemplatePreset::Title
        );
    }

    #[test]
    fn output_template_uses_title_id_by_default() {
        assert_eq!(
            build_ytdlp_output_template(
                "/tmp/out",
                "https://www.youtube.com/watch?v=abc",
                FilenameTemplatePreset::TitleId,
                false,
                None,
                None,
                false,
                None,
                None,
            ),
            "/tmp/out/%(title).100B [%(id)s].%(ext)s"
        );
    }

    #[test]
    fn output_template_numbers_playlist_items() {
        assert_eq!(
            build_ytdlp_output_template(
                "/tmp/out",
                "https://www.youtube.com/watch?v=abc",
                FilenameTemplatePreset::TitleId,
                true,
                Some(3),
                Some(120),
                false,
                None,
                None,
            ),
            "/tmp/out/003 - %(title).100B [%(id)s].%(ext)s"
        );
    }

    #[test]
    fn trim_filenames_respects_output_path_length() {
        let short_path = "G:\\Youwee";
        let trim = calc_trim_filenames_bytes(short_path);
        assert!(trim <= MAX_TRIM_FILENAMES);
        assert!(trim >= MIN_TRIM_FILENAMES);
    }

    #[test]
    fn safe_filename_args_include_windows_and_restrict_flags() {
        let mut args = vec!["--newline".to_string()];
        add_safe_filename_args(
            &mut args,
            SafeFilenameOptions {
                output_path: Some("G:\\Youwee"),
                restrict_ascii: true,
                trim_filenames: None,
            },
        );

        #[cfg(windows)]
        assert!(args.contains(&"--windows-filenames".to_string()));
        assert!(args.contains(&"--restrict-filenames".to_string()));
        assert!(args.contains(&"--trim-filenames".to_string()));
    }

    #[test]
    fn sanitize_filename_part_replaces_invalid_chars() {
        assert_eq!(
            sanitize_filename_part("bad/name|test", "fallback"),
            "bad name test"
        );
    }
}
