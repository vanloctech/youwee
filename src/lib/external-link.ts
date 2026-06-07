import type { AudioBitrate, ExternalEnqueueOptions, Quality } from './types';
import { isSafeUrl } from './utils';

export type ExternalLinkTarget = 'auto' | 'youtube' | 'universal';
export type ExternalLinkAction = 'download_now' | 'queue_only';
export type ExternalRouteTarget = 'youtube' | 'universal';

export interface ExternalLinkRequest {
  raw: string;
  url: string;
  target: ExternalLinkTarget;
  action: ExternalLinkAction;
  enqueueOptions: ExternalEnqueueOptions;
  source: string | null;
}

const MAX_EXTERNAL_DEEPLINK_LENGTH = 4096;
const TRUSTED_EXTERNAL_SOURCES = new Set(['ext-chromium', 'ext-firefox']);

function normalizeExternalSource(source: string | null): string | null {
  const normalized = source?.trim().toLowerCase();
  if (!normalized) return null;
  return TRUSTED_EXTERNAL_SOURCES.has(normalized) ? normalized : null;
}

export function isTrustedExternalSource(source: string | null): boolean {
  return !!source && TRUSTED_EXTERNAL_SOURCES.has(source);
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (!host) return true;

  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }

  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return true;
  }

  if (host.includes(':')) {
    return host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd');
  }

  return false;
}

export function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return !isPrivateOrLocalHost(parsed.hostname);
  } catch {
    return false;
  }
}

function parseEnqueueOptions(parsed: URL): ExternalEnqueueOptions {
  const media = parsed.searchParams.get('media') === 'audio' ? 'audio' : 'video';
  const qualityParam = parsed.searchParams.get('quality') || '';

  if (media === 'audio') {
    const audioBitrate: AudioBitrate = qualityParam === '128' ? '128' : 'auto';
    return {
      mediaType: 'audio',
      quality: 'audio',
      audioBitrate,
    };
  }

  const allowedVideoQualities = new Set<Quality>([
    'best',
    '8k',
    '4k',
    '2k',
    '1080',
    '720',
    '480',
    '360',
  ]);
  const quality: Quality = allowedVideoQualities.has(qualityParam as Quality)
    ? (qualityParam as Quality)
    : 'best';

  return {
    mediaType: 'video',
    quality,
  };
}

function isYouTubeHost(hostname: string): boolean {
  return (
    hostname === 'youtube.com' ||
    hostname === 'www.youtube.com' ||
    hostname === 'm.youtube.com' ||
    hostname === 'music.youtube.com' ||
    hostname === 'youtu.be'
  );
}

export function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return isYouTubeHost(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeExternalVideoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (isYouTubeHost(host)) {
      const hasVideoId = parsed.searchParams.has('v') || host === 'youtu.be';
      if (hasVideoId) {
        parsed.searchParams.delete('list');
        parsed.searchParams.delete('index');
      }
    }
    // Douyin: any page with modal_id → direct video URL
    if (host === 'www.douyin.com' || host === 'douyin.com') {
      const modalId = parsed.searchParams.get('modal_id');
      if (modalId && /^\d+$/.test(modalId) && !parsed.pathname.startsWith('/video/')) {
        return `https://www.douyin.com/video/${modalId}`;
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function parseExternalDeepLink(raw: string): ExternalLinkRequest | null {
  if (!raw || raw.length > MAX_EXTERNAL_DEEPLINK_LENGTH) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'youwee:' || parsed.hostname !== 'download') {
    return null;
  }

  if (parsed.searchParams.get('v') !== '1') {
    return null;
  }

  const urlParam = parsed.searchParams.get('url')?.trim();
  if (!urlParam || !isSafeUrl(urlParam)) {
    return null;
  }

  const normalizedUrl = normalizeExternalVideoUrl(urlParam);
  if (!isSafeUrl(normalizedUrl) || !isPublicHttpUrl(normalizedUrl)) {
    return null;
  }

  const targetParam = parsed.searchParams.get('target');
  const target: ExternalLinkTarget =
    targetParam === 'youtube' || targetParam === 'universal' ? targetParam : 'auto';

  const actionParam = parsed.searchParams.get('action');
  const action: ExternalLinkAction = actionParam === 'queue_only' ? 'queue_only' : 'download_now';

  return {
    raw,
    url: normalizedUrl,
    target,
    action,
    enqueueOptions: parseEnqueueOptions(parsed),
    source: normalizeExternalSource(parsed.searchParams.get('source')),
  };
}

export function resolveExternalRouteTarget(
  preferredTarget: ExternalLinkTarget,
  url: string,
): ExternalRouteTarget {
  if (preferredTarget === 'youtube' || preferredTarget === 'universal') {
    return preferredTarget;
  }
  return isYouTubeUrl(url) ? 'youtube' : 'universal';
}
