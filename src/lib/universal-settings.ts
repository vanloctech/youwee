import {
  AUTO_RETRY_LIMITS,
  clampAutoRetryDelaySeconds,
  clampAutoRetryMaxAttempts,
} from '@/lib/download-retry';
import type {
  AudioBitrate,
  FilenameMetadataField,
  FilenameMetadataPosition,
  Format,
  ItemUniversalSettings,
  PluginWorkflowSnapshotMap,
  PluginWorkflowStepSnapshot,
  PreferredFps,
  Quality,
  VideoCodec,
  YtdlpAdvancedOption,
} from '@/lib/types';
import { sanitizeYtdlpAdvancedOptions } from '@/lib/ytdlp-advanced-options';

export interface UniversalSettings {
  quality: Quality;
  format: Format;
  outputPath: string;
  videoCodec: VideoCodec;
  audioBitrate: AudioBitrate;
  preferredFps: PreferredFps;
  concurrentDownloads: number;
  liveFromStart: boolean;
  skipLive: boolean;
  speedLimitEnabled: boolean;
  speedLimitValue: number;
  speedLimitUnit: 'K' | 'M' | 'G';
  autoRetryEnabled: boolean;
  autoRetryMaxAttempts: number;
  autoRetryDelaySeconds: number;
}

interface UniversalSnapshotOptions {
  useAria2: boolean;
  aria2Args: string;
  ytdlpAdvancedOptionsEnabled: boolean;
  ytdlpAdvancedOptions: YtdlpAdvancedOption[];
  numberQueueItems: boolean;
  filenameMetadataEnabled: boolean;
  filenameMetadataFields: FilenameMetadataField[];
  filenameMetadataPosition: FilenameMetadataPosition;
  splitEmbeddedChapters: boolean;
  numberChapterFiles: boolean;
  autoOrganizeCollections: boolean;
  pluginWorkflowSnapshots?: PluginWorkflowSnapshotMap;
  postDownloadWorkflowSteps?: PluginWorkflowStepSnapshot[];
  overrides?: Partial<ItemUniversalSettings>;
}

const UNIVERSAL_VIDEO_CODECS = new Set<VideoCodec>(['auto', 'h264', 'vp9', 'av1']);

export function normalizeUniversalVideoCodec(value: unknown): VideoCodec {
  return typeof value === 'string' && UNIVERSAL_VIDEO_CODECS.has(value as VideoCodec)
    ? (value as VideoCodec)
    : 'auto';
}

export function createDefaultUniversalSettings(
  saved: Partial<UniversalSettings>,
): UniversalSettings {
  const format = saved.format || 'mp4';
  const videoCodec = normalizeUniversalVideoCodec(saved.videoCodec);

  return {
    quality: saved.quality || 'best',
    format,
    outputPath: saved.outputPath || '',
    videoCodec: format === 'webm' && videoCodec === 'h264' ? 'auto' : videoCodec,
    audioBitrate: saved.audioBitrate || 'auto',
    preferredFps: saved.preferredFps === '30' ? saved.preferredFps : 'original',
    concurrentDownloads: saved.concurrentDownloads || 1,
    liveFromStart: saved.liveFromStart === true,
    skipLive: saved.skipLive === true,
    speedLimitEnabled: saved.speedLimitEnabled === true,
    speedLimitValue: saved.speedLimitValue || 10,
    speedLimitUnit: saved.speedLimitUnit || 'M',
    autoRetryEnabled: saved.autoRetryEnabled === true,
    autoRetryMaxAttempts: clampAutoRetryMaxAttempts(
      saved.autoRetryMaxAttempts || AUTO_RETRY_LIMITS.maxAttempts.default,
    ),
    autoRetryDelaySeconds: clampAutoRetryDelaySeconds(
      saved.autoRetryDelaySeconds || AUTO_RETRY_LIMITS.delaySeconds.default,
    ),
  };
}

export function serializeUniversalSettings(
  settings: UniversalSettings,
): Partial<UniversalSettings> {
  return {
    outputPath: settings.outputPath,
    quality: settings.quality,
    format: settings.format,
    videoCodec: settings.videoCodec,
    audioBitrate: settings.audioBitrate,
    preferredFps: settings.preferredFps,
    concurrentDownloads: settings.concurrentDownloads,
    liveFromStart: settings.liveFromStart,
    skipLive: settings.skipLive,
    speedLimitEnabled: settings.speedLimitEnabled,
    speedLimitValue: settings.speedLimitValue,
    speedLimitUnit: settings.speedLimitUnit,
    autoRetryEnabled: settings.autoRetryEnabled,
    autoRetryMaxAttempts: settings.autoRetryMaxAttempts,
    autoRetryDelaySeconds: settings.autoRetryDelaySeconds,
  };
}

export function buildItemUniversalSettingsSnapshot(
  settings: UniversalSettings,
  options: UniversalSnapshotOptions,
): ItemUniversalSettings {
  return {
    quality: settings.quality,
    format: settings.format,
    outputPath: settings.outputPath,
    videoCodec: settings.videoCodec,
    audioBitrate: settings.audioBitrate,
    preferredFps: settings.preferredFps,
    useAria2: options.useAria2,
    aria2Args: options.aria2Args,
    ytdlpAdvancedOptionsEnabled: options.ytdlpAdvancedOptionsEnabled,
    ytdlpAdvancedOptions: sanitizeYtdlpAdvancedOptions(options.ytdlpAdvancedOptions),
    liveFromStart: settings.liveFromStart,
    skipLive: settings.skipLive,
    numberQueueItems: options.numberQueueItems,
    filenameMetadataEnabled: options.filenameMetadataEnabled,
    filenameMetadataFields: [...options.filenameMetadataFields],
    filenameMetadataPosition: options.filenameMetadataPosition,
    splitEmbeddedChapters: options.splitEmbeddedChapters,
    numberChapterFiles: options.numberChapterFiles,
    autoOrganizeCollections: options.autoOrganizeCollections,
    pluginWorkflowSnapshots: options.pluginWorkflowSnapshots,
    postDownloadWorkflowSteps: options.postDownloadWorkflowSteps,
    autoRetryEnabled: settings.autoRetryEnabled,
    autoRetryMaxAttempts: settings.autoRetryMaxAttempts,
    autoRetryDelaySeconds: settings.autoRetryDelaySeconds,
    ...options.overrides,
  };
}

export function resolveUniversalVideoCodec(
  itemSettings: Partial<Pick<ItemUniversalSettings, 'videoCodec'>> | null | undefined,
  _settings: Pick<UniversalSettings, 'videoCodec'>,
): VideoCodec {
  if (itemSettings && 'videoCodec' in itemSettings) {
    return normalizeUniversalVideoCodec(itemSettings.videoCodec);
  }

  return 'auto';
}
