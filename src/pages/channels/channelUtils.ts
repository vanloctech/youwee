import type {
  Format,
  PreferredFps,
  Quality,
  VideoCodec,
  YoutubeChannelContentType,
} from '@/lib/types';

export const FFMPEG_REQUIRED_QUALITIES: Quality[] = ['best', '8k', '4k', '2k'];

export function loadInitialSettings(): {
  quality: Quality;
  format: Format;
  videoCodec: VideoCodec;
  preferredFps: PreferredFps;
  isAudioMode: boolean;
} {
  try {
    const saved = localStorage.getItem('youwee-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const quality: Quality = parsed.quality || 'best';
      const format: Format = parsed.format || 'mp4';
      const videoCodec: VideoCodec = parsed.videoCodec || 'auto';
      const preferredFps: PreferredFps = parsed.preferredFps === '30' ? '30' : 'original';
      const isAudioMode = quality === 'audio' || ['mp3', 'm4a', 'opus'].includes(format);

      const normalizedFormat = isAudioMode
        ? ['mp3', 'm4a', 'opus'].includes(format)
          ? format
          : 'mp3'
        : ['mp4', 'mkv', 'webm'].includes(format)
          ? format
          : 'mp4';
      const normalizedQuality = isAudioMode ? 'audio' : quality;

      return {
        quality: normalizedQuality,
        format: normalizedFormat,
        videoCodec,
        preferredFps,
        isAudioMode,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    quality: 'best',
    format: 'mp4',
    videoCodec: 'auto',
    preferredFps: 'original',
    isAudioMode: false,
  };
}

export function getYoutubeContentTypeFromUrl(url: string): YoutubeChannelContentType {
  try {
    const parsed = new URL(url);
    if (!isYoutubeChannelContentUrl(url)) return 'videos';
    const segments = parsed.pathname.split('/').filter(Boolean);
    const tab = segments.at(-1);
    if (tab === 'shorts') return 'shorts';
    if (tab === 'streams') return 'streams';
  } catch {
    // ignore invalid URLs while typing
  }
  return 'videos';
}

export function isYoutubeChannelContentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host !== 'youtube.com' && !host.endsWith('.youtube.com')) return false;

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments.length === 0) return false;

    const isContentTab =
      segments.length === 2 && ['videos', 'shorts', 'streams'].includes(segments[1]);
    const isNestedContentTab =
      segments.length === 3 && ['videos', 'shorts', 'streams'].includes(segments[2]);

    if (segments[0].startsWith('@') && segments[0].length > 1) {
      return segments.length === 1 || isContentTab;
    }
    if (['channel', 'c', 'user'].includes(segments[0]) && segments[1]) {
      return segments.length === 2 || isNestedContentTab;
    }
  } catch {
    // ignore invalid URLs while typing
  }
  return false;
}
