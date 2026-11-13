import { describe, expect, test } from 'bun:test';
import { getCookieErrorKind } from '../src/lib/cookie-errors';

describe('getCookieErrorKind', () => {
  test('maps backend cookie error codes to dialog kinds', () => {
    expect(getCookieErrorKind('YT_COOKIE_ACCESS_DENIED', null)).toBe('access_denied');
    expect(getCookieErrorKind('YT_COOKIE_PROFILE_NOT_FOUND', null)).toBe('profile_not_found');
    expect(getCookieErrorKind('YT_COOKIE_DB_LOCKED', null)).toBe('db_locked');
    expect(getCookieErrorKind('YT_FRESH_COOKIES_REQUIRED', null)).toBe('fresh_cookies');
  });

  test('a missing cookie database is not reported as a locked one', () => {
    expect(
      getCookieErrorKind(
        'BACKEND_UNKNOWN',
        'ERROR: could not find chrome cookies database in "/Users/me/Library/Application Support/Google/Chrome/Profile 3"',
      ),
    ).toBeNull();
  });

  test('still recognises Windows lock and decryption failures by message', () => {
    expect(getCookieErrorKind(undefined, 'ERROR: Could not copy Chrome cookie database')).toBe(
      'db_locked',
    );
    expect(getCookieErrorKind(undefined, 'Failed to decrypt with DPAPI')).toBe('db_locked');
  });

  test('unrelated errors show no cookie dialog', () => {
    expect(
      getCookieErrorKind('YT_BOT_CHECK', 'Use --cookies-from-browser or --cookies'),
    ).toBeNull();
  });
});
