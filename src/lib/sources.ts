import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faFacebook,
  faFlickr,
  faInstagram,
  faLinkedin,
  faPinterest,
  faReddit,
  faSoundcloud,
  faSpotify,
  faTiktok,
  faTumblr,
  faTwitch,
  faTwitter,
  faVimeo,
  faVine,
  faVk,
  faYoutube,
} from '@fortawesome/free-brands-svg-icons';
import { faCirclePlay, faGlobe, faTable } from '@fortawesome/free-solid-svg-icons';
import type { SourcePlatform } from './types';

export interface SourceInfo {
  platform: SourcePlatform;
  icon: IconDefinition;
  color: string;
  label: string;
}

const SOURCE_MAP: Record<string, SourceInfo> = {
  youtube: {
    platform: 'youtube',
    icon: faYoutube,
    color: 'text-red-500',
    label: 'YouTube',
  },
  tiktok: {
    platform: 'tiktok',
    icon: faTiktok,
    color: 'text-pink-500',
    label: 'TikTok',
  },
  instagram: {
    platform: 'instagram',
    icon: faInstagram,
    color: 'text-purple-500',
    label: 'Instagram',
  },
  twitter: {
    platform: 'twitter',
    icon: faTwitter,
    color: 'text-sky-400',
    label: 'X/Twitter',
  },
  facebook: {
    platform: 'facebook',
    icon: faFacebook,
    color: 'text-blue-600',
    label: 'Facebook',
  },
  vimeo: {
    platform: 'vimeo',
    icon: faVimeo,
    color: 'text-cyan-500',
    label: 'Vimeo',
  },
  twitch: {
    platform: 'twitch',
    icon: faTwitch,
    color: 'text-purple-400',
    label: 'Twitch',
  },
  bilibili: {
    platform: 'bilibili',
    icon: faCirclePlay,
    color: 'text-cyan-500',
    label: 'Bilibili',
  },
  youku: {
    platform: 'other',
    icon: faCirclePlay,
    color: 'text-blue-500',
    label: 'Youku',
  },
  soundcloud: {
    platform: 'soundcloud',
    icon: faSoundcloud,
    color: 'text-orange-500',
    label: 'SoundCloud',
  },
  dailymotion: {
    platform: 'dailymotion',
    icon: faCirclePlay,
    color: 'text-blue-400',
    label: 'Dailymotion',
  },
  dataexport: {
    platform: 'data_export',
    icon: faTable,
    color: 'text-emerald-400',
    label: 'Data Export',
  },
  reddit: {
    platform: 'other',
    icon: faReddit,
    color: 'text-orange-600',
    label: 'Reddit',
  },
  vine: {
    platform: 'other',
    icon: faVine,
    color: 'text-green-500',
    label: 'Vine',
  },
  spotify: {
    platform: 'other',
    icon: faSpotify,
    color: 'text-green-500',
    label: 'Spotify',
  },
  tumblr: {
    platform: 'other',
    icon: faTumblr,
    color: 'text-blue-900',
    label: 'Tumblr',
  },
  flickr: {
    platform: 'other',
    icon: faFlickr,
    color: 'text-pink-500',
    label: 'Flickr',
  },
  vk: {
    platform: 'other',
    icon: faVk,
    color: 'text-blue-500',
    label: 'VK',
  },
  pinterest: {
    platform: 'other',
    icon: faPinterest,
    color: 'text-red-600',
    label: 'Pinterest',
  },
  linkedin: {
    platform: 'other',
    icon: faLinkedin,
    color: 'text-blue-700',
    label: 'LinkedIn',
  },
};

const DEFAULT_SOURCE: SourceInfo = {
  platform: 'other',
  icon: faGlobe,
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
    const url = new URL(normalizeShellEscapedUrl(text));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeShellEscapedUrl(text: string): string {
  const trimmed = text.trim();
  let normalized = '';

  for (let index = 0; index < trimmed.length; index += 1) {
    const current = trimmed[index];
    const next = trimmed[index + 1];

    if (current === '\\' && next && isShellEscapedUrlChar(next)) {
      normalized += next;
      index += 1;
      continue;
    }

    normalized += current;
  }

  return normalized;
}

function isShellEscapedUrlChar(char: string): boolean {
  return "?=&#%+:/._-~@!$'()*,;[]".includes(char);
}

/**
 * Parse URLs from text input, filtering for valid HTTP/HTTPS URLs
 */
export function parseUniversalUrls(text: string): string[] {
  return text
    .split('\n')
    .map(normalizeShellEscapedUrl)
    .filter((line) => {
      // Skip empty lines and comments
      if (!line || line.startsWith('#')) return false;
      // Validate URL format
      return isValidUrl(line);
    });
}
