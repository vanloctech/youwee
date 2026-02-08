export type SettingsSectionId =
  | 'general'
  | 'dependencies'
  | 'download'
  | 'ai'
  | 'network'
  | 'about';

export interface SearchableSetting {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  section: SettingsSectionId;
}

export const SEARCHABLE_SETTINGS: SearchableSetting[] = [
  // General Section
  {
    id: 'theme',
    label: 'Theme',
    description: 'Choose your preferred color theme',
    keywords: [
      'color',
      'appearance',
      'style',
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
    label: 'Dark/Light Mode',
    description: 'Switch between dark and light mode',
    keywords: ['dark', 'light', 'night', 'day', 'appearance'],
    section: 'general',
  },
  {
    id: 'language',
    label: 'Language',
    description: 'Change app language',
    keywords: ['language', 'ngôn ngữ', 'english', 'vietnamese', 'tiếng việt', 'locale', 'i18n'],
    section: 'general',
  },
  {
    id: 'max-history',
    label: 'Max History Entries',
    description: 'Limit number of download history entries',
    keywords: ['history', 'storage', 'limit', 'entries', 'database'],
    section: 'general',
  },

  // Download Section
  {
    id: 'embed-metadata',
    label: 'Embed Metadata',
    description: 'Add title, artist, description to files',
    keywords: ['metadata', 'title', 'artist', 'tags', 'post-processing'],
    section: 'download',
  },
  {
    id: 'embed-thumbnail',
    label: 'Embed Thumbnail',
    description: 'Embed video thumbnail as cover art',
    keywords: ['thumbnail', 'cover', 'art', 'image', 'post-processing'],
    section: 'download',
  },
  {
    id: 'live-from-start',
    label: 'Live From Start',
    description: 'Download live streams from the beginning',
    keywords: ['live', 'stream', 'start', 'beginning', 'broadcast'],
    section: 'download',
  },
  {
    id: 'speed-limit',
    label: 'Speed Limit',
    description: 'Limit download bandwidth',
    keywords: ['speed', 'limit', 'bandwidth', 'rate', 'throttle', 'slow'],
    section: 'download',
  },
  {
    id: 'sponsorblock',
    label: 'SponsorBlock',
    description: 'Auto-skip sponsors and promotions',
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
    label: 'yt-dlp',
    description: 'Video download engine',
    keywords: ['ytdlp', 'yt-dlp', 'download', 'engine', 'update', 'version'],
    section: 'dependencies',
  },
  {
    id: 'ffmpeg',
    label: 'FFmpeg',
    description: 'Audio/video processing',
    keywords: ['ffmpeg', 'video', 'audio', 'processing', 'convert', '4k', '8k'],
    section: 'dependencies',
  },
  {
    id: 'bun',
    label: 'Bun Runtime',
    description: 'JavaScript runtime for advanced features',
    keywords: ['bun', 'runtime', 'javascript', 'node', 'speed'],
    section: 'dependencies',
  },
  {
    id: 'youtube-troubleshooting',
    label: 'YouTube Troubleshooting',
    description: 'Fix YouTube download issues',
    keywords: ['youtube', 'troubleshoot', 'fix', 'error', 'player', 'nsig'],
    section: 'dependencies',
  },

  // AI Section
  {
    id: 'ai-enabled',
    label: 'AI Features',
    description: 'Enable AI-powered video summarization',
    keywords: ['ai', 'artificial', 'intelligence', 'summary', 'smart'],
    section: 'ai',
  },
  {
    id: 'ai-provider',
    label: 'AI Provider',
    description: 'Choose AI service provider',
    keywords: ['provider', 'gemini', 'openai', 'ollama', 'deepseek', 'qwen', 'gpt', 'claude'],
    section: 'ai',
  },
  {
    id: 'ai-api-key',
    label: 'API Key',
    description: 'Configure your AI provider API key',
    keywords: ['api', 'key', 'token', 'secret', 'authentication'],
    section: 'ai',
  },
  {
    id: 'ai-model',
    label: 'AI Model',
    description: 'Select AI model for summarization',
    keywords: ['model', 'gpt-4', 'gemini', 'llama', 'mistral'],
    section: 'ai',
  },
  {
    id: 'summary-style',
    label: 'Summary Style',
    description: 'Choose summary detail level',
    keywords: ['summary', 'style', 'short', 'concise', 'detailed'],
    section: 'ai',
  },
  {
    id: 'summary-language',
    label: 'Summary Language',
    description: 'Language for generated summaries',
    keywords: ['language', 'english', 'vietnamese', 'japanese', 'chinese'],
    section: 'ai',
  },
  {
    id: 'transcript-languages',
    label: 'Transcript Languages',
    description: 'Preferred languages for video transcripts',
    keywords: ['transcript', 'subtitle', 'caption', 'language'],
    section: 'ai',
  },
  {
    id: 'whisper',
    label: 'Whisper Transcription',
    description: 'Use OpenAI Whisper for videos without captions',
    keywords: ['whisper', 'transcribe', 'speech', 'audio', 'openai'],
    section: 'ai',
  },
  {
    id: 'ai-timeout',
    label: 'Generation Timeout',
    description: 'Maximum time for AI response',
    keywords: ['timeout', 'time', 'limit', 'seconds', 'minutes'],
    section: 'ai',
  },

  // Network Section
  {
    id: 'cookie-mode',
    label: 'Cookie Mode',
    description: 'Authentication for age-restricted videos',
    keywords: ['cookie', 'auth', 'login', 'age', 'restricted', 'browser'],
    section: 'network',
  },
  {
    id: 'cookie-browser',
    label: 'Browser for Cookies',
    description: 'Select browser to extract cookies from',
    keywords: ['browser', 'chrome', 'firefox', 'safari', 'edge', 'brave'],
    section: 'network',
  },
  {
    id: 'proxy',
    label: 'Network Proxy',
    description: 'Configure proxy for downloads',
    keywords: ['proxy', 'http', 'https', 'socks', 'vpn', 'network'],
    section: 'network',
  },

  // About Section
  {
    id: 'app-version',
    label: 'App Version',
    description: 'Current application version',
    keywords: ['version', 'app', 'about', 'info'],
    section: 'about',
  },
  {
    id: 'auto-update',
    label: 'Auto Check Updates',
    description: 'Automatically check for app updates',
    keywords: ['update', 'auto', 'check', 'new', 'version'],
    section: 'about',
  },
  {
    id: 'github',
    label: 'GitHub Repository',
    description: 'View source code on GitHub',
    keywords: ['github', 'source', 'code', 'repository', 'open source'],
    section: 'about',
  },
];

export function searchSettings(query: string): SearchableSetting[] {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter(Boolean);

  return SEARCHABLE_SETTINGS.filter((setting) => {
    const searchText = [setting.label, setting.description, ...setting.keywords]
      .join(' ')
      .toLowerCase();

    return terms.every((term) => searchText.includes(term));
  });
}

export const SECTION_INFO: Record<SettingsSectionId, { label: string; icon: string }> = {
  general: { label: 'General', icon: 'Palette' },
  dependencies: { label: 'Dependencies', icon: 'Package' },
  download: { label: 'Download', icon: 'ArrowDownToLine' },
  ai: { label: 'AI Features', icon: 'Sparkles' },
  network: { label: 'Network & Auth', icon: 'Globe' },
  about: { label: 'About', icon: 'Info' },
};
