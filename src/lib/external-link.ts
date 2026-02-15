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
    return parsed.toString();
  } catch {
    return url;
  }
}

export function parseExternalDeepLink(raw: string): ExternalLinkRequest | null {
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
  if (!isSafeUrl(normalizedUrl)) {
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
    source: parsed.searchParams.get('source'),
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
