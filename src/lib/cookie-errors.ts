/**
 * Which cookie dialog to show for a failed download.
 *
 * - `access_denied`: the OS blocked reading the browser profile (macOS privacy / Full Disk Access)
 * - `profile_not_found`: the selected browser profile has no cookie database
 * - `db_locked`: the cookie database is locked or can't be decrypted (Chromium on Windows)
 * - `fresh_cookies`: the site wants freshly exported cookies
 */
export type CookieErrorKind = 'access_denied' | 'profile_not_found' | 'db_locked' | 'fresh_cookies';

// Only the Windows lock / decryption failures. Keep this narrow: a broad "cookie … database"
// match used to show the "browser is open" dialog for unrelated errors such as a missing profile.
const DB_LOCKED_PATTERN = /could not copy.*cookie|failed to decrypt.*dpapi|app.bound.encryption/i;

export function getCookieErrorKind(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined,
): CookieErrorKind | null {
  switch (errorCode) {
    case 'YT_FRESH_COOKIES_REQUIRED':
      return 'fresh_cookies';
    case 'YT_COOKIE_ACCESS_DENIED':
      return 'access_denied';
    case 'YT_COOKIE_PROFILE_NOT_FOUND':
      return 'profile_not_found';
    case 'YT_COOKIE_DB_LOCKED':
      return 'db_locked';
  }
  if (errorMessage && DB_LOCKED_PATTERN.test(errorMessage)) return 'db_locked';
  return null;
}
