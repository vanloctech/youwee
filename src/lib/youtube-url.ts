const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

function cleanVideoId(value: string | null | undefined): string | null {
  const id = value?.trim();
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be') {
      return cleanVideoId(parsed.pathname.split('/').filter(Boolean)[0]);
    }

    if (YOUTUBE_HOSTS.has(host)) {
      const watchId = cleanVideoId(parsed.searchParams.get('v'));
      if (watchId) return watchId;

      const [kind, id] = parsed.pathname.split('/').filter(Boolean);
      if (kind === 'shorts' || kind === 'embed' || kind === 'live') {
        return cleanVideoId(id);
      }
    }
  } catch {
    const match = url.match(
      /(?:youtube\.com\/(?:watch\?[^#\s]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]+)/,
    );
    return cleanVideoId(match?.[1]);
  }

  return null;
}

export function youtubeThumbnailUrl(videoId: string, quality = 'mqdefault'): string {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}
