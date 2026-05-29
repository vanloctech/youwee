export type Quality = 'best' | '8k' | '4k' | '2k' | '1080' | '720' | '480' | '360' | 'audio';
export type Format = 'mp4' | 'mkv' | 'webm' | 'mp3' | 'm4a' | 'opus';
export type VideoCodec = 'h264' | 'vp9' | 'av1' | 'auto';
export type AudioBitrate = 'auto' | '128';
export type SubtitleMode = 'off' | 'auto' | 'manual';
export type SubtitleFormat = 'srt' | 'vtt' | 'ass';
export type PluginTrigger =
  | 'download.queued'
  | 'download.beforeStart'
  | 'download.completed'
  | 'download.failed';

// SponsorBlock types
export type SponsorBlockMode = 'remove' | 'mark' | 'custom';
export type SponsorBlockAction = 'remove' | 'mark' | 'off';

export const SPONSORBLOCK_CATEGORIES = [
  'sponsor',
  'selfpromo',
  'interaction',
  'intro',
  'outro',
  'preview',
  'music_offtopic',
  'filler',
] as const;

export type SponsorBlockCategory = (typeof SPONSORBLOCK_CATEGORIES)[number];

export const DEFAULT_SPONSORBLOCK_CATEGORIES: Record<SponsorBlockCategory, SponsorBlockAction> = {
  sponsor: 'remove',
  selfpromo: 'remove',
  interaction: 'remove',
  intro: 'mark',
  outro: 'mark',
  preview: 'off',
  music_offtopic: 'off',
  filler: 'off',
};

// Source platforms supported by yt-dlp
export type SourcePlatform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'twitter'
  | 'facebook'
  | 'vimeo'
  | 'twitch'
  | 'bilibili'
  | 'soundcloud'
  | 'dailymotion'
  | 'data_export'
  | 'other';

// Settings snapshot saved with each queue item (YouTube page)
export interface ItemDownloadSettings {
  quality: Quality;
  format: Format;
  outputPath: string;
  videoCodec: VideoCodec;
  audioBitrate: AudioBitrate;
  useAria2: boolean;
  aria2Args: string;
  subtitleMode: SubtitleMode;
  subtitleLangs: string[];
  subtitleEmbed: boolean;
  subtitleFormat: SubtitleFormat;
  timeRangeStart?: string;
  timeRangeEnd?: string;
  pluginWorkflowSnapshots?: PluginWorkflowSnapshotMap;
  postDownloadWorkflowSteps?: PluginWorkflowStepSnapshot[];
  autoRetryEnabled: boolean;
  autoRetryMaxAttempts: number;
  autoRetryDelaySeconds: number;
}

// Simplified settings snapshot for Universal page
export interface ItemUniversalSettings {
  quality: Quality;
  format: Format;
  outputPath: string;
  audioBitrate: AudioBitrate;
  useAria2: boolean;
  aria2Args: string;
  timeRangeStart?: string;
  timeRangeEnd?: string;
  pluginWorkflowSnapshots?: PluginWorkflowSnapshotMap;
  postDownloadWorkflowSteps?: PluginWorkflowStepSnapshot[];
  autoRetryEnabled: boolean;
  autoRetryMaxAttempts: number;
  autoRetryDelaySeconds: number;
}

export interface DownloadRetryState {
  retryIndex: number;
  maxRetries: number;
  delaySeconds: number;
  remainingSeconds: number;
}

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'fetching' | 'downloading' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  error?: string;
  isPlaylist?: boolean;
  isLive?: boolean; // true if video is currently live streaming
  downloadedSize?: string; // For live streams: "2.87 MiB"
  elapsedTime?: string; // For live streams: "00:00:07"
  playlistIndex?: number;
  playlistTotal?: number;
  thumbnail?: string;
  duration?: string;
  channel?: string;
  filesize?: number; // File size in bytes from video info
  // Completed download info
  completedFilesize?: number; // Actual file size after download
  completedResolution?: string; // e.g. "1920x1080"
  completedFormat?: string; // e.g. "mp4"
  completedFilepath?: string; // Absolute path of downloaded file
  completedHistoryId?: string; // Related history entry id after completion
  // Source detection
  extractor?: string; // e.g. "youtube", "tiktok", "instagram"
  // Settings snapshot when item was added to queue
  settings?: ItemDownloadSettings | ItemUniversalSettings;
  // Auto retry status while waiting between attempts
  retryState?: DownloadRetryState;
}

export interface ExternalEnqueueResult {
  added: boolean;
  itemId: string | null;
}

export interface ExternalEnqueueOptions {
  mediaType?: 'video' | 'audio';
  quality?: Quality;
  audioBitrate?: AudioBitrate;
}

export interface DownloadSettings {
  quality: Quality;
  format: Format;
  outputPath: string;
  downloadPlaylist: boolean;
  videoCodec: VideoCodec;
  audioBitrate: AudioBitrate;
  concurrentDownloads: number; // 1-5
  playlistLimit: number; // 0 = unlimited, 1-100
  autoCheckUpdate: boolean; // Auto check for app updates on startup
  // Subtitle settings
  subtitleMode: SubtitleMode; // off, auto, manual
  subtitleLangs: string[]; // ['vi', 'en', 'ja']
  subtitleEmbed: boolean; // true = embed into video, false = separate file
  subtitleFormat: SubtitleFormat; // srt, vtt, ass
  // YouTube specific settings
  useBunRuntime: boolean; // Deprecated - Deno is now used automatically
  useActualPlayerJs: boolean; // Use actual player.js version for YouTube (fixes some download issues)
  // Post-processing settings
  embedMetadata: boolean; // Embed metadata (title, artist, description) into downloaded files
  embedThumbnail: boolean; // Embed thumbnail as cover art (requires FFmpeg)
  // Live stream settings
  liveFromStart: boolean; // Download live streams from the beginning
  // Speed limit settings
  speedLimitEnabled: boolean; // true = limited, false = unlimited
  speedLimitValue: number; // e.g. 10
  speedLimitUnit: 'K' | 'M' | 'G'; // KB/s, MB/s, GB/s
  // External downloader settings
  useAria2: boolean; // Use aria2c as yt-dlp external downloader
  aria2Args: string; // Custom aria2 arguments (raw or aria2c: prefixed)
  // Auto retry settings
  autoRetryEnabled: boolean; // Retry transient failures automatically
  autoRetryMaxAttempts: number; // Number of retries after initial failure (1-10)
  autoRetryDelaySeconds: number; // Delay between retries in seconds (1-60)
  // SponsorBlock settings
  sponsorBlock: boolean; // toggle on/off
  sponsorBlockMode: SponsorBlockMode; // 'remove' | 'mark' | 'custom'
  sponsorBlockCategories: Record<SponsorBlockCategory, SponsorBlockAction>; // per-category action (custom mode)
  // Telegram remote control settings
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramAllowedChatIds: string;
  telegramPlainUrlAction: 'add' | 'download';
}

export interface TelegramStatus {
  state: 'disabled' | 'running' | 'error';
  message?: string | null;
}

export interface DownloadProgress {
  id: string;
  percent: number;
  speed: string;
  eta: string;
  status: string;
  title?: string;
  playlist_index?: number;
  playlist_count?: number;
  // Additional info for completed downloads
  filesize?: number;
  resolution?: string;
  format_ext?: string;
  // Error message when status is 'error'
  error_message?: string;
  error_code?: string;
  error_params?: Record<string, string | number | boolean>;
  history_id?: string; // Related history entry id when available
  filepath?: string; // Final file path when status is 'finished'
  // For live streams (no percentage available)
  downloaded_size?: string; // e.g. "2.87 MiB"
  elapsed_time?: string; // e.g. "00:00:07"
}

export type PluginRuntimeLanguage = 'javascript' | 'python';
export type PluginProvider = 'deno' | 'python';
export type PluginPackageSourceKind = 'workspace' | 'package-ywp';
export type PluginManifestIconName = string;
export type PluginFilesystemPermission =
  | 'fs.plugin.read'
  | 'fs.plugin.write'
  | 'fs.payload-file.read'
  | 'fs.payload-directory.read'
  | 'fs.payload-directory.write'
  | 'fs.temp.read'
  | 'fs.temp.write'
  | 'fs.user-selected.read'
  | 'fs.user-selected.write';
export type PluginToolPermission = 'tool.ffmpeg.run' | 'tool.ytdlp.run';

export interface PluginPermissionSet {
  network: boolean;
  fs: PluginFilesystemPermission[];
  tools: PluginToolPermission[];
}

export interface PluginPermissionApproval {
  network: boolean;
  fs: PluginFilesystemPermission[];
  tools: PluginToolPermission[];
}

export type PluginConfigFieldInputType =
  | 'text'
  | 'textarea'
  | 'password'
  | 'number'
  | 'boolean'
  | 'file'
  | 'directory'
  | 'select'
  | 'multi-select';

export interface PluginConfigFieldOption {
  value: string;
  label: string;
}

export type PluginConfigFieldValue = string | number | boolean | string[];

export interface PluginConfigField {
  key: string;
  inputType: PluginConfigFieldInputType;
  label: string;
  description?: string | null;
  placeholder?: string | null;
  required: boolean;
  defaultValue?: PluginConfigFieldValue | null;
  sensitive: boolean;
  options: PluginConfigFieldOption[];
  min?: number | null;
  max?: number | null;
  step?: number | null;
}

export interface PluginRuntimeSpec {
  language: PluginRuntimeLanguage;
  supportedProviders: PluginProvider[];
  preferredProvider?: PluginProvider | null;
  entrypoint: string;
}

export interface PluginCompatibilitySpec {
  appVersion?: string | null;
  sdkVersion?: string | null;
}

export interface PluginI18nSpec {
  defaultLocale?: string | null;
  supportedLocales: string[];
  directory?: string | null;
}

export interface PluginManifest {
  id: string;
  slug: string;
  name: string;
  version: string;
  icon?: PluginManifestIconName | null;
  description?: string | null;
  author?: string | null;
  homepage?: string | null;
  repository?: string | null;
  license?: string | null;
  runtime: PluginRuntimeSpec;
  compatibility?: PluginCompatibilitySpec | null;
  triggers: string[];
  permissions: PluginPermissionSet;
  configFields: PluginConfigField[];
  timeoutSec: number;
  readme?: string | null;
  checksum?: string | null;
  publishedAt?: string | null;
  i18n?: PluginI18nSpec | null;
}

export interface PluginPackageSource {
  kind: PluginPackageSourceKind;
  value: string;
  checksum?: string | null;
  packageFormat?: string | null;
  packageFormatVersion?: number | null;
  builderSdkVersion?: string | null;
  signatureStatus?: string | null;
  signerKeyId?: string | null;
  signerFingerprint?: string | null;
  signatureAlgorithm?: string | null;
  signedAt?: string | null;
}

export interface PluginInstallation {
  pluginId: string;
  enabled: boolean;
  trusted: boolean;
  approvedPermissions: PluginPermissionApproval;
  selectedProvider?: PluginProvider | null;
  timeoutSecOverride?: number | null;
  installedPath: string;
  source: PluginPackageSource;
  lastResolvedProvider?: PluginProvider | null;
  lastResolvedSource?: string | null;
  lastExecutionStatus?: string | null;
  lastError?: string | null;
  configValues: Record<string, unknown>;
  configValueStatus: Record<string, boolean>;
  signatureStatus?: string | null;
  signerKeyId?: string | null;
  signerFingerprint?: string | null;
  signatureAlgorithm?: string | null;
  signedAt?: string | null;
}

export interface PluginSummary {
  manifest: PluginManifest;
  installation: PluginInstallation;
  warnings: string[];
  readmeContent?: string | null;
}

export interface PluginPackageInspection {
  manifest: PluginManifest;
  source: PluginPackageSource;
  warnings: string[];
  readmeContent?: string | null;
  packageFormat?: string | null;
  packageFormatVersion?: number | null;
  builderSdkVersion?: string | null;
  packageChecksum?: string | null;
  signatureStatus?: string | null;
  signerKeyId?: string | null;
  signerFingerprint?: string | null;
  signatureAlgorithm?: string | null;
  signedAt?: string | null;
}

export interface PluginWorkspaceSummary {
  pluginId: string;
  slug: string;
  name: string;
  path: string;
  manifestPath: string;
  packageJsonPath: string;
  readmePath: string;
}

export interface PackagedPluginBuildInfo {
  packageFormat: string;
  packageFormatVersion: number;
  packagedAt: string;
  builder: {
    tool: string;
    version: string;
  };
  bundle: {
    entrypoint: string;
    bundled: boolean;
    includesDependencies: boolean;
    moduleFormat: string;
  };
}

export interface PackagedPluginChecksums {
  algorithm: string;
  files: Record<string, string>;
}

export interface PluginSignaturePayload {
  checksumsPath: string;
  checksumsSha256: string;
  pluginId: string;
  pluginVersion: string;
  packageFormat: string;
  packageFormatVersion: number;
}

export interface PackagedPluginSignature {
  version: number;
  algorithm: string;
  keyId: string;
  fingerprint: string;
  publicKey: string;
  signedAt: string;
  payload: PluginSignaturePayload;
  signature: string;
}

export interface RuntimeProviderStatus {
  provider: PluginProvider;
  available: boolean;
  resolvedPath?: string | null;
  resolvedSource?: string | null;
  details?: string | null;
}

export interface PluginExecutionResult {
  pluginId: string;
  success: boolean;
  message?: string | null;
  artifacts?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  mutations?: PluginChainMutation | null;
  stdout?: string | null;
  stderr?: string | null;
}

export type PluginWorkflowFailurePolicy = 'continue' | 'stop-chain';

export interface PluginWorkflowStepConfig {
  pluginId: string;
  failurePolicy: PluginWorkflowFailurePolicy;
}

export interface PluginWorkflowStepSnapshot {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  selectedProvider?: PluginProvider | null;
  timeoutSecOverride?: number | null;
  approvedPermissions: PluginPermissionApproval;
  failurePolicy: PluginWorkflowFailurePolicy;
}

export type PluginWorkflowSnapshotMap = Partial<
  Record<PluginTrigger, PluginWorkflowStepSnapshot[]>
>;

export interface PluginTriggerWorkflow {
  trigger: string;
  steps: PluginWorkflowStepConfig[];
}

export type PluginWorkflowRunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'partial-failed'
  | 'failed';

export interface PluginChainMutation {
  activeFilepath?: string | null;
  activeFilename?: string | null;
  extraFiles: string[];
  metadataPatch?: Record<string, unknown> | null;
}

export interface PluginChainState {
  jobId: string;
  source?: string | null;
  downloadKind: string;
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  historyId?: string | null;
  timeRange?: string | null;
  activeFilepath: string;
  activeFilename: string;
  directory: string;
  filesize?: number | null;
  format?: string | null;
  quality?: string | null;
  extraFiles: string[];
  metadata?: Record<string, unknown> | null;
}

export interface PluginWorkflowRun {
  runId: string;
  trigger: string;
  status: PluginWorkflowRunStatus;
  initialPayload: PostDownloadPluginPayload;
  currentChainState: PluginChainState;
  steps: PluginWorkflowStepSnapshot[];
  currentStepIndex?: number | null;
  failedStepPluginId?: string | null;
}

export interface PluginExecutionStatusEvent {
  pluginId: string;
  runId?: string | null;
  pluginName?: string | null;
  runtime?: string | null;
  provider?: string | null;
  resolvedProvider?: string | null;
  resolvedSource?: string | null;
  status: string;
  message?: string | null;
  details?: string | null;
  errorKind?: string | null;
  errorResource?: string | null;
  mediaTitle?: string | null;
  filename?: string | null;
  mediaUrl?: string | null;
}

export interface PluginExecutionOutputEvent {
  pluginId: string;
  runId?: string | null;
  pluginName?: string | null;
  stream: 'stdout' | 'stderr';
  chunk: string;
  mediaTitle?: string | null;
  filename?: string | null;
  mediaUrl?: string | null;
}

export interface PostDownloadPluginPayload {
  jobId: string;
  source?: string | null;
  trigger: string;
  filepath: string;
  filename: string;
  directory: string;
  filesize?: number | null;
  format?: string | null;
  quality?: string | null;
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  historyId?: string | null;
  timeRange?: string | null;
  downloadKind: string;
  workflowRunId?: string | null;
  workflowStepIndex?: number | null;
  workflowStepPluginId?: string | null;
  chainState?: PluginChainState | null;
}

export interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  channel: string;
  upload_date: string;
  view_count: number;
  is_playlist: boolean;
  playlist_count?: number;
  // Source detection
  extractor?: string;
  extractor_key?: string;
  // Live stream fields
  is_live?: boolean; // true if currently live streaming
  was_live?: boolean; // true if was a live stream (now ended)
  live_status?: 'is_live' | 'was_live' | 'not_live' | 'is_upcoming';
}

export interface FormatOption {
  format_id: string;
  ext: string;
  resolution: string;
  width?: number;
  height?: number;
  vcodec: string;
  acodec: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
  abr?: number;
  format_note?: string;
}

export interface VideoInfoResponse {
  info: VideoInfo;
  formats: FormatOption[];
}

export interface PlaylistInfo {
  id: string;
  title: string;
  entries: PlaylistEntry[];
}

export interface PlaylistEntry {
  id: string;
  title: string;
  url: string;
  duration?: number;
}

export interface SubtitleInfo {
  lang: string; // Language code (en, vi, ja, etc.)
  name: string; // Language name (English, Vietnamese, etc.)
  isAutoGenerated: boolean;
}

export interface PlaylistVideoEntry {
  id: string;
  title: string;
  url: string;
  thumbnail?: string;
  duration?: number;
  channel?: string;
  upload_date?: string;
}

export type ExportSource = 'auto' | 'youtube_playlist' | 'youtube_channel' | 'url_list';

export type ExportFormat =
  | 'csv'
  | 'excel'
  | 'text'
  | 'bookmark_html'
  | 'json'
  | 'markdown'
  | 'xml'
  | 'html'
  | 'yaml'
  | 'sqlite'
  | 'word';

export interface ExportRow {
  id: string;
  title?: string | null;
  url?: string | null;
  platform?: string | null;
  uploader?: string | null;
  thumbnail?: string | null;
  durationSeconds?: number | null;
  uploadDate?: string | null;
  timestamp?: number | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
  description?: string | null;
  tags?: string[] | null;
  playlistIndex?: number | null;
  extractor?: string | null;
}

export interface ExtractDataRowsOutput {
  source: ExportSource;
  title?: string | null;
  rows: ExportRow[];
  warnings: string[];
}

// Log types
export type LogType = 'command' | 'success' | 'error' | 'stderr' | 'info';

export interface LogEntry {
  id: string;
  timestamp: string; // ISO 8601
  log_type: LogType;
  message: string;
  details?: string;
  url?: string;
}

export interface PluginLogsPage {
  items: LogEntry[];
  total: number;
  has_more: boolean;
}

export type LogFilter = 'all' | 'command' | 'success' | 'error' | 'stderr' | 'info';

// History types
export interface HistoryTag {
  id: string;
  name: string;
  itemCount?: number | null;
}

export interface HistoryCollection {
  id: string;
  name: string;
  color?: string | null;
  itemCount?: number | null;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  filepath: string;
  filesize?: number;
  duration?: number;
  quality?: string;
  format?: string;
  source?: string; // "youtube", "tiktok", etc.
  downloaded_at: string; // ISO 8601
  file_exists: boolean;
  summary?: string; // AI-generated summary
  time_range?: string; // Time range cut (e.g. "00:10-01:00")
  tags: HistoryTag[];
  collections: HistoryCollection[];
}

export type HistoryFilter =
  | 'all'
  | 'youtube'
  | 'tiktok'
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'bilibili'
  | 'data_export'
  | 'other';
export type HistoryMediaType = 'all' | 'video' | 'audio';
export type HistoryDatePreset = 'all' | 'today' | 'last7days' | 'last30days' | 'custom';
export type HistorySort = 'recent' | 'oldest' | 'title' | 'size';
export type HistoryFilterMatchMode = 'any' | 'all';

export interface HistoryAdvancedFilters {
  mediaType: HistoryMediaType;
  datePreset: HistoryDatePreset;
  downloadedAtFrom?: number | null;
  downloadedAtTo?: number | null;
  customDateFrom?: string | null;
  customDateTo?: string | null;
  formats: string[];
  qualities: string[];
  tagIds: string[];
  collectionIds: string[];
  matchMode: HistoryFilterMatchMode;
}

// AI types
export type AIProvider =
  | 'gemini'
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'ollama'
  | 'lmstudio'
  | 'proxy';
export type SummaryStyle = 'short' | 'concise' | 'detailed';

// Network Proxy types
export type ProxyMode = 'off' | 'http' | 'socks5';

export interface ProxySettings {
  mode: ProxyMode;
  host?: string; // e.g., "127.0.0.1" or "proxy.example.com"
  port?: number; // e.g., 7890
  username?: string; // Optional auth
  password?: string; // Optional auth
}

// Cookie/Authentication types
export type CookieMode = 'off' | 'browser' | 'file';
export type BrowserType = 'chrome' | 'firefox' | 'safari' | 'edge' | 'brave' | 'opera' | 'vivaldi';

export const BROWSER_OPTIONS: { value: BrowserType; label: string }[] = [
  { value: 'chrome', label: 'Google Chrome' },
  { value: 'firefox', label: 'Mozilla Firefox' },
  { value: 'safari', label: 'Safari' },
  { value: 'edge', label: 'Microsoft Edge' },
  { value: 'brave', label: 'Brave' },
  { value: 'opera', label: 'Opera' },
  { value: 'vivaldi', label: 'Vivaldi' },
];

export interface CookieSettings {
  mode: CookieMode;
  browser?: BrowserType;
  browserProfile?: string;
  filePath?: string;
}

export interface BrowserProfile {
  folder_name: string; // Used for yt-dlp: "Profile 1"
  display_name: string; // Shown to user: "Loc Nguyen"
}

export interface AIConfig {
  enabled: boolean;
  provider: AIProvider;
  api_key?: string;
  model: string;
  ollama_url?: string;
  lmstudio_url?: string;
  proxy_url?: string; // Custom OpenAI-compatible API endpoint
  summary_style: SummaryStyle;
  summary_language: string;
  timeout_seconds?: number; // Timeout for AI generation (default 120s)
  transcript_languages?: string[]; // Languages to try for transcript extraction (order matters)
  // Whisper settings
  whisper_enabled?: boolean; // Enable Whisper as fallback transcription
  whisper_api_key?: string; // Separate OpenAI key for Whisper (used when provider !== 'openai')
  whisper_endpoint_url?: string; // Custom Whisper API endpoint URL
  whisper_model?: string; // Custom Whisper model name (default: whisper-1)
}

// Available languages (shared between transcript extraction and summary output)
export const LANGUAGE_OPTIONS = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'Arabic' },
  { code: 'vi', name: 'Vietnamese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh-Hans', name: 'Chinese (Simplified)' },
  { code: 'zh-Hant', name: 'Chinese (Traditional)' },
  { code: 'th', name: 'Thai' },
  { code: 'id', name: 'Indonesian' },
  { code: 'hi', name: 'Hindi' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
] as const;

// Default transcript languages order
export const DEFAULT_TRANSCRIPT_LANGUAGES = ['en'];

export interface ModelOption {
  value: string;
  label: string;
}

export interface LanguageOption {
  value: string;
  label: string;
}

// ============================================
// Video Processing Types
// ============================================

export type ProcessingStatus =
  | 'idle'
  | 'generating'
  | 'ready'
  | 'processing'
  | 'completed'
  | 'error';

export type ProcessingTaskType =
  | 'cut'
  | 'extract_audio'
  | 'resize'
  | 'convert'
  | 'burn_subtitles'
  | 'thumbnail'
  | 'gif'
  | 'speed'
  | 'volume'
  | 'remove_audio'
  | 'merge'
  | 'compress'
  | 'rotate'
  | 'flip'
  | 'crop'
  | 'watermark'
  | 'custom';

export interface VideoMetadata {
  path: string;
  filename: string;
  duration: number; // seconds
  width: number;
  height: number;
  fps: number;
  video_codec: string;
  audio_codec: string;
  bitrate: number; // kbps
  file_size: number; // bytes
  format: string;
  has_audio: boolean;
}

export interface TimelineSelection {
  start: number; // seconds
  end: number; // seconds
}

export interface FFmpegCommandResult {
  command: string;
  command_args: string[];
  explanation: string;
  estimated_size_mb: number;
  estimated_time_seconds: number;
  output_path: string;
  warnings: string[];
}

export interface ProcessingJob {
  id: string;
  input_path: string;
  output_path?: string;
  task_type: ProcessingTaskType;
  user_prompt?: string;
  ffmpeg_command: string;
  status: ProcessingStatus;
  progress: number;
  error_message?: string;
  input_metadata?: VideoMetadata;
  output_metadata?: VideoMetadata;
  created_at: string;
  completed_at?: string;
  ai_provider?: string;
  ai_model?: string;
}

export interface ProcessingProgress {
  job_id: string;
  percent: number;
  frame: number;
  total_frames: number;
  fps: number;
  speed: string;
  time: string;
  size: string;
}

export interface ProcessingPreset {
  id: string;
  name: string;
  description?: string;
  task_type: ProcessingTaskType;
  prompt_template: string;
  icon?: string;
  created_at: string;
}

export interface ChatAttachment {
  id: string;
  path: string; // absolute path on disk
  name: string; // filename
  kind: 'image' | 'video' | 'subtitle' | 'other';
  width?: number;
  height?: number;
  size: number; // file size in bytes
  format: string; // extension or detected format
  previewUrl?: string; // blob URL for preview in chat (image only)
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'complete';
  content: string;
  timestamp: string;
  command?: FFmpegCommandResult;
  outputPath?: string; // For 'complete' role
  attachments?: ChatAttachment[];
}

// Quick action definitions
export interface QuickAction {
  id: ProcessingTaskType;
  icon: string;
  label: string;
  description: string;
  needsInput?: 'format' | 'resolution' | 'speed' | 'file' | 'timestamp' | 'range';
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'cut', icon: '✂️', label: 'Cut/Trim', description: 'Cut video using timeline selection' },
  {
    id: 'extract_audio',
    icon: '🎵',
    label: 'Extract Audio',
    description: 'Extract audio track',
    needsInput: 'format',
  },
  {
    id: 'resize',
    icon: '📐',
    label: 'Resize',
    description: 'Change video resolution',
    needsInput: 'resolution',
  },
  {
    id: 'convert',
    icon: '🔄',
    label: 'Convert',
    description: 'Convert to different format',
    needsInput: 'format',
  },
  {
    id: 'burn_subtitles',
    icon: '📝',
    label: 'Burn Subtitles',
    description: 'Burn subtitles into video',
    needsInput: 'file',
  },
  {
    id: 'thumbnail',
    icon: '🖼️',
    label: 'Thumbnail',
    description: 'Extract frame as image',
    needsInput: 'timestamp',
  },
  {
    id: 'gif',
    icon: '🎞️',
    label: 'Create GIF',
    description: 'Create GIF from selection',
    needsInput: 'range',
  },
  {
    id: 'speed',
    icon: '⚡',
    label: 'Speed',
    description: 'Change playback speed',
    needsInput: 'speed',
  },
  { id: 'compress', icon: '📦', label: 'Compress', description: 'Reduce file size' },
  { id: 'remove_audio', icon: '🔇', label: 'Remove Audio', description: 'Remove audio track' },
  { id: 'rotate', icon: '🔃', label: 'Rotate', description: 'Rotate video 90°/180°/270°' },
  {
    id: 'merge',
    icon: '🔀',
    label: 'Merge',
    description: 'Merge multiple videos',
    needsInput: 'file',
  },
];

// ============================================
// yt-dlp Channel Types
// ============================================

export type DependencySource = 'auto' | 'app' | 'system';

export type YtdlpChannel = 'bundled' | 'stable' | 'nightly';

export interface YtdlpChannelInfo {
  channel: string;
  version: string | null;
  installed: boolean;
  binary_path: string | null;
}

export interface YtdlpAllVersions {
  current_channel: string;
  using_fallback: boolean;
  bundled: YtdlpChannelInfo;
  stable: YtdlpChannelInfo;
  nightly: YtdlpChannelInfo;
}

export interface YtdlpChannelUpdateInfo {
  channel: string;
  current_version: string | null;
  latest_version: string;
  update_available: boolean;
}

// ============================================
// Channel Follow & Auto-Download Types
// ============================================

export interface ChannelInfo {
  name: string;
  avatar_url: string | null;
}

export interface FollowedChannel {
  id: string;
  url: string;
  name: string;
  thumbnail?: string;
  platform: string;
  last_checked_at?: string;
  last_video_id?: string;
  check_interval: number; // minutes
  auto_download: boolean;
  download_quality: string;
  download_format: string;
  created_at: string;
  // Auto-download filter settings
  filter_min_duration?: number; // seconds
  filter_max_duration?: number; // seconds
  filter_include_keywords?: string; // comma-separated
  filter_exclude_keywords?: string; // comma-separated
  filter_max_videos?: number;
  download_threads: number; // concurrent download threads (default 1)
  download_video_codec: string; // video codec (h264, vp9, av1, auto)
  download_audio_bitrate: string; // audio bitrate (128, 192, 256, 320, auto)
}

export interface ChannelVideo {
  id: string;
  channel_id: string;
  video_id: string;
  title: string;
  url: string;
  thumbnail?: string;
  duration?: number;
  upload_date?: string;
  status: 'new' | 'downloaded' | 'skipped' | 'downloading';
  created_at: string;
}
