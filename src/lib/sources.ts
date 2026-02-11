import type { SourcePlatform } from './types';

export interface SourceInfo {
  platform: SourcePlatform;
  faIcon: string; // Font Awesome v4 icon class (e.g., "fa-youtube-play")
  color: string;
  label: string;
}

// Font Awesome v4 brand icons mapping
// Reference: https://fontawesome.com/v4/icons/#brand
const SOURCE_MAP: Record<string, SourceInfo> = {
  youtube: {
    platform: 'youtube',
    faIcon: 'fa-youtube-play',
    color: 'text-red-500',
    label: 'YouTube',
  },
  tiktok: {
    platform: 'tiktok',
    faIcon: 'fa-music', // TikTok not in FA v4, use music as fallback
    color: 'text-pink-500',
    label: 'TikTok',
  },
  instagram: {
    platform: 'instagram',
    faIcon: 'fa-instagram',
    color: 'text-purple-500',
    label: 'Instagram',
  },
  twitter: {
    platform: 'twitter',
    faIcon: 'fa-twitter',
    color: 'text-sky-400',
    label: 'X/Twitter',
  },
  facebook: {
    platform: 'facebook',
    faIcon: 'fa-facebook',
    color: 'text-blue-600',
    label: 'Facebook',
  },
  vimeo: {
    platform: 'vimeo',
    faIcon: 'fa-vimeo',
    color: 'text-cyan-500',
    label: 'Vimeo',
  },
  twitch: {
    platform: 'twitch',
    faIcon: 'fa-twitch',
    color: 'text-purple-400',
    label: 'Twitch',
  },
  bilibili: {
    platform: 'bilibili',
    faIcon: 'fa-play-circle',
    color: 'text-cyan-500',
    label: 'Bilibili',
  },
  soundcloud: {
    platform: 'soundcloud',
    faIcon: 'fa-soundcloud',
    color: 'text-orange-500',
    label: 'SoundCloud',
  },
  dailymotion: {
    platform: 'dailymotion',
    faIcon: 'fa-play-circle', // Dailymotion not in FA v4
    color: 'text-blue-400',
    label: 'Dailymotion',
  },
  reddit: {
    platform: 'other',
    faIcon: 'fa-reddit',
    color: 'text-orange-600',
    label: 'Reddit',
  },
  vine: {
    platform: 'other',
    faIcon: 'fa-vine',
    color: 'text-green-500',
    label: 'Vine',
  },
  spotify: {
    platform: 'other',
    faIcon: 'fa-spotify',
    color: 'text-green-500',
    label: 'Spotify',
  },
  tumblr: {
    platform: 'other',
    faIcon: 'fa-tumblr',
    color: 'text-blue-900',
    label: 'Tumblr',
  },
  flickr: {
    platform: 'other',
    faIcon: 'fa-flickr',
    color: 'text-pink-500',
    label: 'Flickr',
  },
  vk: {
    platform: 'other',
    faIcon: 'fa-vk',
    color: 'text-blue-500',
    label: 'VK',
  },
  pinterest: {
    platform: 'other',
    faIcon: 'fa-pinterest',
    color: 'text-red-600',
    label: 'Pinterest',
  },
  linkedin: {
    platform: 'other',
    faIcon: 'fa-linkedin',
    color: 'text-blue-700',
    label: 'LinkedIn',
  },
};

const DEFAULT_SOURCE: SourceInfo = {
  platform: 'other',
  faIcon: 'fa-globe',
  color: 'text-muted-foreground',
  label: 'Video',
};

/**
 * Detect source platform from yt-dlp extractor name
 */
export function detectSource(extractor?: string): SourceInfo {
  if (!extractor) return DEFAULT_SOURCE;

  // Normalize extractor name (remove special chars, lowercase)
  const key = extractor.toLowerCase().replace(/[^a-z]/g, '');

  // Check for known platforms
  for (const [platformKey, info] of Object.entries(SOURCE_MAP)) {
    if (key.includes(platformKey)) {
      return info;
    }
  }

  // Return default with the original extractor name as label
  return {
    ...DEFAULT_SOURCE,
    label: extractor.charAt(0).toUpperCase() + extractor.slice(1),
  };
}

/**
 * Check if URL looks like a valid HTTP/HTTPS URL
 */
export function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parse URLs from text input, filtering for valid HTTP/HTTPS URLs
 */
export function parseUniversalUrls(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) return false;
      // Validate URL format
      return isValidUrl(line);
    });
}
