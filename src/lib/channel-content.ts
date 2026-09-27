import type { YoutubeChannelContentType } from '@/lib/types';

export const TIKTOK_SHORT_MAX_DURATION_SECONDS = 60;

export function isTikTokChannelContentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'tiktok.com' && !host.endsWith('.tiktok.com')) return false;
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments.length === 1 && segments[0].startsWith('@') && segments[0].length > 1;
  } catch {
    // Ignore incomplete URLs while the user is typing.
  }
  return false;
}

export function matchesChannelContentType(
  platform: string,
  contentType: YoutubeChannelContentType,
  duration?: number | null,
): boolean {
  if (platform !== 'tiktok' || contentType === 'videos_shorts' || contentType === 'streams') {
    return true;
  }

  if (duration == null || !Number.isFinite(duration)) return false;

  return contentType === 'shorts'
    ? duration <= TIKTOK_SHORT_MAX_DURATION_SECONDS
    : duration > TIKTOK_SHORT_MAX_DURATION_SECONDS;
}
