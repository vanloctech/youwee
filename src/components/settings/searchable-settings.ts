export type SettingsSectionId =
  | 'general'
  | 'dependencies'
  | 'download'
  | 'ai'
  | 'network'
  | 'about';

export interface SearchableSetting {
  id: string;
  /** i18n key for the setting label (resolved at search time) */
  labelKey: string;
  /** i18n key for the setting description (resolved at search time) */
  descriptionKey: string;
  /** English keywords — always searchable regardless of language */
  keywords: string[];
  section: SettingsSectionId;
}

/** Search result with resolved translated strings */
export interface SearchResult extends SearchableSetting {
  label: string;
  description: string;
}

export const SEARCHABLE_SETTINGS: SearchableSetting[] = [
  // General Section
  {
    id: 'theme',
    labelKey: 'general.colorTheme',
    descriptionKey: 'general.appearanceDesc',
    keywords: [
      'color',
      'appearance',
      'theme',
      'midnight',
      'aurora',
      'sunset',
      'ocean',
      'forest',
      'candy',
    ],
    section: 'general',
  },
  {
    id: 'mode',
    labelKey: 'general.colorMode',
    descriptionKey: 'general.colorModeDesc',
    keywords: ['dark', 'light', 'night', 'day', 'appearance', 'mode'],
    section: 'general',
  },
  {
    id: 'language',
    labelKey: 'common:language.label',
    descriptionKey: 'common:language.select',
    keywords: ['language', 'english', 'vietnamese', 'locale', 'i18n'],
    section: 'general',
  },
  {
    id: 'language-request',
    labelKey: 'general.languageRequest',
    descriptionKey: 'general.languageRequestDesc',
    keywords: ['language', 'request', 'vote', 'discussion', 'github', 'locale', 'translation'],
    section: 'general',
  },
  {
    id: 'max-history',
    labelKey: 'general.maxHistory',
    descriptionKey: 'general.storageDesc',
    keywords: ['history', 'storage', 'limit', 'entries', 'database'],
    section: 'general',
  },
  {
    id: 'preview-threshold',
    labelKey: 'general.previewThreshold',
    descriptionKey: 'general.previewThresholdDesc',
    keywords: ['preview', 'threshold', 'size', 'large', 'file', 'processing', 'video', 'confirm'],
    section: 'general',
  },

  // Download Section
  {
    id: 'embed-metadata',
    labelKey: 'download.embedMetadata',
    descriptionKey: 'download.embedMetadataDesc',
    keywords: ['metadata', 'title', 'artist', 'tags', 'post-processing'],
    section: 'download',
  },
  {
    id: 'embed-thumbnail',
    labelKey: 'download.embedThumbnail',
    descriptionKey: 'download.embedThumbnailDesc',
    keywords: ['thumbnail', 'cover', 'art', 'image', 'post-processing'],
    section: 'download',
  },
  {
    id: 'live-from-start',
    labelKey: 'download.liveFromStart',
    descriptionKey: 'download.liveFromStartDesc',
    keywords: ['live', 'stream', 'start', 'beginning', 'broadcast'],
    section: 'download',
  },
  {
    id: 'speed-limit',
    labelKey: 'download.speedLimit',
    descriptionKey: 'download.speedLimitDesc',
    keywords: ['speed', 'limit', 'bandwidth', 'rate', 'throttle', 'slow'],
    section: 'download',
  },
  {
    id: 'sponsorblock',
    labelKey: 'download.sponsorBlockToggle',
    descriptionKey: 'download.sponsorBlockToggleDesc',
    keywords: [
      'sponsorblock',
      'sponsor',
      'ad',
      'skip',
      'chapter',
      'intro',
      'outro',
      'promotion',
      'subscribe',
    ],
    section: 'download',
  },

  // Dependencies Section
  {
    id: 'ytdlp',
    labelKey: 'dependencies.ytdlp',
    descriptionKey: 'dependencies.videoDownloadEngine',
    keywords: ['ytdlp', 'yt-dlp', 'download', 'engine', 'update', 'version'],
    section: 'dependencies',
  },
  {
    id: 'ffmpeg',
    labelKey: 'dependencies.ffmpeg',
    descriptionKey: 'dependencies.audioVideoProcessing',
    keywords: ['ffmpeg', 'video', 'audio', 'processing', 'convert', '4k', '8k'],
    section: 'dependencies',
  },
  {
    id: 'bun',
    labelKey: 'dependencies.denoRuntime',
    descriptionKey: 'dependencies.jsRuntimeForYoutube',
    keywords: ['deno', 'runtime', 'javascript', 'node', 'speed'],
    section: 'dependencies',
  },
  {
    id: 'youtube-troubleshooting',
    labelKey: 'dependencies.youtubeTroubleshooting',
    descriptionKey: 'dependencies.optionsToFixIssues',
    keywords: ['youtube', 'troubleshoot', 'fix', 'error', 'player', 'nsig'],
    section: 'dependencies',
  },

  // AI Section
  {
    id: 'ai-enabled',
    labelKey: 'ai.enabled',
    descriptionKey: 'ai.enabledDesc',
    keywords: ['ai', 'artificial', 'intelligence', 'summary', 'smart'],
    section: 'ai',
  },
  {
    id: 'ai-provider',
    labelKey: 'ai.provider',
    descriptionKey: 'ai.providerDesc',
    keywords: ['provider', 'gemini', 'openai', 'ollama', 'deepseek', 'qwen', 'gpt', 'claude'],
    section: 'ai',
  },
  {
    id: 'ai-api-key',
    labelKey: 'ai.apiKey',
    descriptionKey: 'ai.enabledDesc',
    keywords: ['api', 'key', 'token', 'secret', 'authentication'],
    section: 'ai',
  },
  {
    id: 'ai-model',
    labelKey: 'ai.model',
    descriptionKey: 'ai.modelDesc',
    keywords: ['model', 'gpt-4', 'gemini', 'llama', 'mistral'],
    section: 'ai',
  },
  {
    id: 'summary-style',
    labelKey: 'ai.summaryStyle',
    descriptionKey: 'ai.summaryStyleDesc',
    keywords: ['summary', 'style', 'short', 'concise', 'detailed'],
    section: 'ai',
  },
  {
    id: 'summary-language',
    labelKey: 'ai.summaryLanguage',
    descriptionKey: 'ai.summaryLanguageDesc',
    keywords: ['language', 'english', 'vietnamese', 'japanese', 'chinese'],
    section: 'ai',
  },
  {
    id: 'transcript-languages',
    labelKey: 'ai.transcriptLanguages',
    descriptionKey: 'ai.transcriptLanguagesDesc',
    keywords: ['transcript', 'subtitle', 'caption', 'language'],
    section: 'ai',
  },
  {
    id: 'whisper',
    labelKey: 'ai.whisper',
    descriptionKey: 'ai.whisperDesc',
    keywords: ['whisper', 'transcribe', 'speech', 'audio', 'openai'],
    section: 'ai',
  },
  {
    id: 'ai-timeout',
    labelKey: 'ai.timeout',
    descriptionKey: 'ai.timeoutDesc',
    keywords: ['timeout', 'time', 'limit', 'seconds', 'minutes'],
    section: 'ai',
  },

  // Network Section
  {
    id: 'cookie-mode',
    labelKey: 'network.cookieSource',
    descriptionKey: 'network.cookieSourceDesc',
    keywords: ['cookie', 'auth', 'login', 'age', 'restricted', 'browser'],
    section: 'network',
  },
  {
    id: 'cookie-browser',
    labelKey: 'network.browser',
    descriptionKey: 'network.videoAuthDesc',
    keywords: ['browser', 'chrome', 'firefox', 'safari', 'edge', 'brave'],
    section: 'network',
  },
  {
    id: 'proxy',
    labelKey: 'network.networkProxy',
    descriptionKey: 'network.networkProxyDesc',
    keywords: ['proxy', 'http', 'https', 'socks', 'vpn', 'network'],
    section: 'network',
  },

  // About Section
  {
    id: 'app-version',
    labelKey: 'about.title',
    descriptionKey: 'about.description',
    keywords: ['version', 'app', 'about', 'info'],
    section: 'about',
  },
  {
    id: 'auto-update',
    labelKey: 'about.autoUpdate',
    descriptionKey: 'about.autoUpdateDesc',
    keywords: ['update', 'auto', 'check', 'new', 'version'],
    section: 'about',
  },
  {
    id: 'github',
    labelKey: 'about.reportIssue',
    descriptionKey: 'about.license',
    keywords: ['github', 'source', 'code', 'repository', 'open source'],
    section: 'about',
  },

  // System (in General)
  {
    id: 'hide-dock',
    labelKey: 'system.hideDockOnClose',
    descriptionKey: 'system.hideDockOnCloseDesc',
    keywords: ['dock', 'hide', 'close', 'tray', 'macos', 'taskbar', 'system'],
    section: 'general',
  },
];

/**
 * Search settings with i18n support.
 * Matches against translated label/description AND English keywords.
 * @param query - user search input
 * @param t - i18next translation function (settings namespace, with cross-namespace support)
 */
export function searchSettings(query: string, t: (key: string) => string): SearchResult[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter(Boolean);

  const results: SearchResult[] = [];

  for (const setting of SEARCHABLE_SETTINGS) {
    const label = t(setting.labelKey);
    const description = t(setting.descriptionKey);

    // Search against: translated label + translated description + English keywords
    const searchText = [label, description, ...setting.keywords].join(' ').toLowerCase();

    if (terms.every((term) => searchText.includes(term))) {
      results.push({ ...setting, label, description });
    }
  }

  return results;
}

export const SECTION_INFO: Record<SettingsSectionId, { label: string; icon: string }> = {
  general: { label: 'General', icon: 'Palette' },
  dependencies: { label: 'Dependencies', icon: 'Package' },
  download: { label: 'Download', icon: 'ArrowDownToLine' },
  ai: { label: 'AI Features', icon: 'Sparkles' },
  network: { label: 'Network & Auth', icon: 'Globe' },
  about: { label: 'About', icon: 'Info' },
};
