//! yt-dlp filename safety helpers for long paths and Windows-invalid characters.

const WINDOWS_MAX_PATH: usize = 260;
const RESERVED_SUFFIX_BYTES: usize = 40;
const MIN_TRIM_FILENAMES: u32 = 50;
const MAX_TRIM_FILENAMES: u32 = 180;
const DEFAULT_TRIM_FILENAMES: u32 = 180;

/// Compute a safe `--trim-filenames` byte limit from the output directory length.
///
/// Reserves space for the directory prefix so the final path stays within common
/// filesystem limits (especially `MAX_PATH` on Windows).
pub fn calc_trim_filenames_bytes(output_path: &str) -> u32 {
    let path_len = output_path.as_bytes().len();
    let available = WINDOWS_MAX_PATH
        .saturating_sub(path_len)
        .saturating_sub(RESERVED_SUFFIX_BYTES);
    (available as u32).clamp(MIN_TRIM_FILENAMES, MAX_TRIM_FILENAMES)
}

/// Append yt-dlp flags that keep generated filenames safe on the target platform.
pub fn add_safe_filename_args(args: &mut Vec<String>, output_path: Option<&str>) {
    #[cfg(windows)]
    {
        args.push("--windows-filenames".to_string());
    }

    let trim = output_path
        .map(calc_trim_filenames_bytes)
        .unwrap_or(DEFAULT_TRIM_FILENAMES);

    args.push("--trim-filenames".to_string());
    args.push(trim.to_string());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn calc_trim_filenames_respects_long_output_paths() {
        let long_path = "G:\\weeb\\Downloads\\very-long-folder-name";
        assert!(calc_trim_filenames_bytes(long_path) < DEFAULT_TRIM_FILENAMES);
    }

    #[test]
    fn calc_trim_filenames_clamps_short_paths_to_default_cap() {
        assert_eq!(calc_trim_filenames_bytes("/tmp"), DEFAULT_TRIM_FILENAMES);
    }

    #[test]
    fn calc_trim_filenames_uses_byte_length_for_non_ascii_paths() {
        let path = "G:\\下载\\weeb\\very-long-non-ascii-output-directory-name";
        assert!(path.as_bytes().len() > path.chars().count());

        let expected = (WINDOWS_MAX_PATH
            .saturating_sub(path.as_bytes().len())
            .saturating_sub(RESERVED_SUFFIX_BYTES) as u32)
            .clamp(MIN_TRIM_FILENAMES, MAX_TRIM_FILENAMES);
        assert_eq!(calc_trim_filenames_bytes(path), expected);
        assert!(expected < DEFAULT_TRIM_FILENAMES);
    }

    #[test]
    fn add_safe_filename_args_uses_path_aware_trim() {
        let mut args = Vec::new();
        add_safe_filename_args(&mut args, Some("G:\\weeb"));

        assert!(args.contains(&"--trim-filenames".to_string()));
        let trim_index = args
            .iter()
            .position(|arg| arg == "--trim-filenames")
            .unwrap();
        let trim_value: u32 = args[trim_index + 1].parse().unwrap();
        assert!(trim_value >= MIN_TRIM_FILENAMES);
        assert!(trim_value <= MAX_TRIM_FILENAMES);
    }

    #[test]
    fn add_safe_filename_args_falls_back_to_default_trim() {
        let mut args = Vec::new();
        add_safe_filename_args(&mut args, None);

        assert_eq!(
            args,
            vec![
                #[cfg(windows)]
                "--windows-filenames".to_string(),
                "--trim-filenames".to_string(),
                DEFAULT_TRIM_FILENAMES.to_string(),
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn add_safe_filename_args_enables_windows_filenames() {
        let mut args = Vec::new();
        add_safe_filename_args(&mut args, None);
        assert!(args.contains(&"--windows-filenames".to_string()));
    }
}
