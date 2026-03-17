use app_lib::services::parse_ytdlp_error;
use app_lib::types::code;

#[test]
fn parse_ytdlp_error_detects_fresh_login_cookies_phrase() {
    let stderr = "ERROR: This Douyin/TikTok content requires fresh login cookies. \
                  Please refresh login in browser cookie mode, then retry.";

    let err = parse_ytdlp_error(stderr).expect("expected fresh cookies backend error");
    assert_eq!(err.code(), code::YT_FRESH_COOKIES_REQUIRED);
    assert_eq!(
        err.message(),
        "This Douyin/TikTok content requires fresh login cookies. \
Please refresh login in browser cookie mode, then retry."
    );
}
