import { describe, expect, test } from 'bun:test';
import {
  buildCookieProxyInvokeOptions,
  normalizeCookieSkipPattern,
  sanitizeCookieSkipPatterns,
} from '../src/lib/network-config';

describe('cookie skip patterns', () => {
  test('normalizes domains and domain path prefixes', () => {
    expect(normalizeCookieSkipPattern(' https://Facebook.com/reel/?x=1 ')).toBe(
      'facebook.com/reel',
    );
    expect(normalizeCookieSkipPattern('/facebook.com/reel/')).toBe('facebook.com/reel');
  });

  test('defaults missing saved patterns but preserves an explicit empty list', () => {
    expect(sanitizeCookieSkipPatterns(undefined)).toEqual(['facebook.com/reel']);
    expect(sanitizeCookieSkipPatterns([])).toEqual([]);
  });

  test('passes sanitized skip patterns to backend invoke options', () => {
    const options = buildCookieProxyInvokeOptions(
      {
        mode: 'browser',
        browser: 'chrome',
        cookieSkipPatterns: ['https://facebook.com/reel/', 'bad value'],
      },
      { mode: 'off' },
    );

    expect(options.cookieSkipPatterns).toEqual(['facebook.com/reel']);
  });
});
