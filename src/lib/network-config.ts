import type { CookieSettings, ProxySettings } from '@/lib/types';

export const COOKIE_STORAGE_KEY = 'youwee-cookie-settings';
export const PROXY_STORAGE_KEY = 'youwee-proxy-settings';
export const DEFAULT_COOKIE_SKIP_PATTERNS = ['facebook.com/reel'];

export type CookieProxyInvokeOptions = {
  cookieMode: CookieSettings['mode'];
  cookieBrowser: CookieSettings['browser'] | null;
  cookieBrowserProfile: string | null;
  cookieFilePath: string | null;
  cookieSkipPatterns: string[];
  proxyUrl: string | null;
};

export function normalizeCookieSkipPattern(pattern: string): string {
  const withoutScheme = pattern
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0]
    .replace(/\/+$/, '');

  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex === -1) {
    return withoutScheme.toLowerCase();
  }

  const host = withoutScheme.slice(0, slashIndex).toLowerCase();
  const path = withoutScheme.slice(slashIndex).replace(/\/+$/, '');

  return `${host}${path}`;
}

export function isValidCookieSkipPattern(pattern: string): boolean {
  const normalized = normalizeCookieSkipPattern(pattern);
  if (!normalized || /\s/.test(normalized)) {
    return false;
  }

  const host = normalized.split('/')[0];
  return host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
}

export function sanitizeCookieSkipPatterns(patterns: unknown): string[] {
  if (!Array.isArray(patterns)) {
    return DEFAULT_COOKIE_SKIP_PATTERNS;
  }

  const next: string[] = [];
  const seen = new Set<string>();

  for (const pattern of patterns) {
    if (typeof pattern !== 'string') {
      continue;
    }

    const normalized = normalizeCookieSkipPattern(pattern);
    const key = normalized.toLowerCase();
    if (!isValidCookieSkipPattern(normalized) || seen.has(key)) {
      continue;
    }

    next.push(normalized);
    seen.add(key);
  }

  return next;
}

function normalizeCookieSettings(settings: CookieSettings): CookieSettings {
  return {
    ...settings,
    cookieSkipPatterns: sanitizeCookieSkipPatterns(settings.cookieSkipPatterns),
  };
}

export function loadCookieSettings(): CookieSettings {
  try {
    const saved = localStorage.getItem(COOKIE_STORAGE_KEY);
    if (saved) {
      return normalizeCookieSettings(JSON.parse(saved));
    }
  } catch (error) {
    console.error('Failed to load cookie settings:', error);
  }
  return { mode: 'off', cookieSkipPatterns: DEFAULT_COOKIE_SKIP_PATTERNS };
}

export function saveCookieSettings(settings: CookieSettings) {
  try {
    localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(normalizeCookieSettings(settings)));
  } catch (error) {
    console.error('Failed to save cookie settings:', error);
  }
}

export function loadProxySettings(): ProxySettings {
  try {
    const saved = localStorage.getItem(PROXY_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to load proxy settings:', error);
  }
  return { mode: 'off' };
}

export function saveProxySettings(settings: ProxySettings) {
  try {
    localStorage.setItem(PROXY_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save proxy settings:', error);
  }
}

export function buildProxyUrl(settings: ProxySettings): string | undefined {
  if (settings.mode === 'off' || !settings.host || !settings.port) {
    return undefined;
  }

  const protocol = settings.mode === 'socks5' ? 'socks5' : 'http';
  const auth =
    settings.username && settings.password
      ? `${encodeURIComponent(settings.username)}:${encodeURIComponent(settings.password)}@`
      : '';

  return `${protocol}://${auth}${settings.host}:${settings.port}`;
}

export function buildCookieProxyInvokeOptions(
  cookieSettings: CookieSettings,
  proxySettings: ProxySettings,
): CookieProxyInvokeOptions {
  return {
    cookieMode: cookieSettings.mode,
    cookieBrowser: cookieSettings.browser || null,
    cookieBrowserProfile: cookieSettings.browserProfile || null,
    cookieFilePath: cookieSettings.filePath || null,
    cookieSkipPatterns: sanitizeCookieSkipPatterns(cookieSettings.cookieSkipPatterns),
    proxyUrl: buildProxyUrl(proxySettings) || null,
  };
}

export function loadNetworkSettings() {
  return {
    cookieSettings: loadCookieSettings(),
    proxySettings: loadProxySettings(),
  };
}
