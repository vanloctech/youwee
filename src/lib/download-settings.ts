import {
  AUTO_RETRY_LIMITS,
  clampAutoRetryDelaySeconds,
  clampAutoRetryMaxAttempts,
} from '@/lib/download-retry';
import type {
  DownloadSettings,
  ExternalEnqueueOptions,
  FilenameMetadataField,
  FilenameMetadataPosition,
  ItemDownloadSettings,
  ItemUniversalSettings,
  PluginWorkflowSnapshotMap,
  PluginWorkflowStepSnapshot,
} from '@/lib/types';
import { DEFAULT_SPONSORBLOCK_CATEGORIES } from '@/lib/types';
import { sanitizeYtdlpAdvancedOptions } from '@/lib/ytdlp-advanced-options';

interface SnapshotExtras {
  pluginWorkflowSnapshots?: PluginWorkflowSnapshotMap;
  postDownloadWorkflowSteps?: PluginWorkflowStepSnapshot[];
  overrides?: Partial<ItemDownloadSettings>;
}

export const DEFAULT_FILENAME_METADATA_FIELDS: FilenameMetadataField[] = [
  'uploadDate',
  'viewCount',
];

export const FILENAME_METADATA_FIELDS: FilenameMetadataField[] = [
  'uploadDate',
  'viewCount',
  'uploader',
  'duration',
  'resolution',
  'videoId',
];

const FILENAME_METADATA_FIELD_SET = new Set<FilenameMetadataField>(FILENAME_METADATA_FIELDS);

export function sanitizeFilenameMetadataFields(value: unknown): FilenameMetadataField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const fields: FilenameMetadataField[] = [];
  for (const field of value) {
    if (
      typeof field === 'string' &&
      FILENAME_METADATA_FIELD_SET.has(field as FilenameMetadataField) &&
      !fields.includes(field as FilenameMetadataField)
    ) {
      fields.push(field as FilenameMetadataField);
    }
  }

  return fields;
}

export function sanitizeFilenameMetadataPosition(value: unknown): FilenameMetadataPosition {
  return value === 'suffix' ? 'suffix' : 'prefix';
}

export function createDefaultDownloadSettings(saved: Partial<DownloadSettings>): DownloadSettings {
  const filenameMetadataFields = sanitizeFilenameMetadataFields(saved.filenameMetadataFields);

  return {
    quality: saved.quality || 'best',
    format: saved.format || 'mp4',
    outputPath: saved.outputPath || '',
    downloadPlaylist: saved.downloadPlaylist || false,
    videoCodec: saved.videoCodec || 'auto',
    preferredFps: saved.preferredFps === '30' ? saved.preferredFps : 'original',
    audioBitrate: saved.audioBitrate || 'auto',
    concurrentDownloads: saved.concurrentDownloads || 1,
    playlistLimit: saved.playlistLimit || 0,
    autoCheckUpdate: saved.autoCheckUpdate !== false,
    subtitleMode: saved.subtitleMode || 'off',
    subtitleLangs: saved.subtitleLangs || ['en', 'vi'],
    subtitleEmbed: saved.subtitleEmbed || false,
    subtitleFormat: saved.subtitleFormat || 'srt',
    useBunRuntime: saved.useBunRuntime || false,
    useActualPlayerJs: saved.useActualPlayerJs || false,
    embedMetadata: saved.embedMetadata !== false,
    embedThumbnail: saved.embedThumbnail === true,
    numberPlaylistItems: saved.numberPlaylistItems === true,
    numberQueueItems: saved.numberQueueItems === true,
    filenameMetadataEnabled: saved.filenameMetadataEnabled === true,
    filenameMetadataFields,
    filenameMetadataPosition: sanitizeFilenameMetadataPosition(saved.filenameMetadataPosition),
    splitEmbeddedChapters: saved.splitEmbeddedChapters === true,
    numberChapterFiles: saved.numberChapterFiles !== false,
    autoOrganizeCollections: saved.autoOrganizeCollections === true,
    rememberDownloadedVideos: saved.rememberDownloadedVideos === true,
    duplicateDownloadHandling:
      saved.duplicateDownloadHandling === 'skip' || saved.duplicateDownloadHandling === 'allow'
        ? saved.duplicateDownloadHandling
        : 'ask',
    liveFromStart: saved.liveFromStart === true,
    skipLive: saved.skipLive === true,
    speedLimitEnabled: saved.speedLimitEnabled === true,
    speedLimitValue: saved.speedLimitValue || 10,
    speedLimitUnit: saved.speedLimitUnit || 'M',
    useAria2: saved.useAria2 === true,
    aria2Args: saved.aria2Args || '',
    ytdlpAdvancedOptionsEnabled: saved.ytdlpAdvancedOptionsEnabled === true,
    ytdlpAdvancedOptions: sanitizeYtdlpAdvancedOptions(saved.ytdlpAdvancedOptions),
    autoRetryEnabled: saved.autoRetryEnabled === true,
    autoRetryMaxAttempts: clampAutoRetryMaxAttempts(
      saved.autoRetryMaxAttempts || AUTO_RETRY_LIMITS.maxAttempts.default,
    ),
    autoRetryDelaySeconds: clampAutoRetryDelaySeconds(
      saved.autoRetryDelaySeconds || AUTO_RETRY_LIMITS.delaySeconds.default,
    ),
    persistDownloadQueue: saved.persistDownloadQueue === true,
    sponsorBlock: saved.sponsorBlock === true,
    sponsorBlockMode: saved.sponsorBlockMode || 'remove',
    sponsorBlockCategories: saved.sponsorBlockCategories || {
      ...DEFAULT_SPONSORBLOCK_CATEGORIES,
    },
    telegramEnabled: saved.telegramEnabled === true,
    telegramBotToken: saved.telegramBotToken || '',
    telegramAllowedChatIds: saved.telegramAllowedChatIds || '',
    telegramPlainUrlAction: saved.telegramPlainUrlAction === 'add' ? 'add' : 'download',
  };
}

export function buildExternalDownloadSettingsOverrides(
  settings: DownloadSettings,
  options: ExternalEnqueueOptions | undefined,
  outputPath: string,
): Partial<ItemDownloadSettings> {
  const mediaType = options?.mediaType === 'audio' ? 'audio' : 'video';
  const videoQuality = options?.quality && options.quality !== 'audio' ? options.quality : 'best';
  const audioBitrate = options?.audioBitrate === '128' ? '128' : 'auto';

  return {
    quality: mediaType === 'audio' ? 'audio' : videoQuality,
    // Browser deep links select media and quality, not a container. Preserve
    // the global format that will be snapshotted onto this queue item.
    format: settings.format,
    outputPath,
    downloadPlaylist: options?.downloadPlaylist ?? settings.downloadPlaylist,
    playlistLimit:
      options?.playlistLimit ?? (settings.playlistLimit > 0 ? settings.playlistLimit : null),
    audioBitrate: mediaType === 'audio' ? audioBitrate : settings.audioBitrate,
    subtitleMode: options?.subtitleMode ?? settings.subtitleMode,
    subtitleLangs: options?.subtitleLangs ?? [...settings.subtitleLangs],
    subtitleEmbed: options?.subtitleEmbed ?? settings.subtitleEmbed,
    subtitleFormat: options?.subtitleFormat ?? settings.subtitleFormat,
    timeRangeStart: options?.timeRangeStart,
    timeRangeEnd: options?.timeRangeEnd,
    liveFromStart: options?.liveFromStart ?? settings.liveFromStart,
    skipLive: options?.skipLive ?? settings.skipLive,
  };
}

export function serializeDownloadSettings(settings: DownloadSettings): Partial<DownloadSettings> {
  return {
    outputPath: settings.outputPath,
    quality: settings.quality,
    format: settings.format,
    downloadPlaylist: settings.downloadPlaylist,
    videoCodec: settings.videoCodec,
    preferredFps: settings.preferredFps,
    audioBitrate: settings.audioBitrate,
    concurrentDownloads: settings.concurrentDownloads,
    playlistLimit: settings.playlistLimit,
    autoCheckUpdate: settings.autoCheckUpdate,
    subtitleMode: settings.subtitleMode,
    subtitleLangs: settings.subtitleLangs,
    subtitleEmbed: settings.subtitleEmbed,
    subtitleFormat: settings.subtitleFormat,
    useBunRuntime: settings.useBunRuntime,
    useActualPlayerJs: settings.useActualPlayerJs,
    embedMetadata: settings.embedMetadata,
    embedThumbnail: settings.embedThumbnail,
    numberPlaylistItems: settings.numberPlaylistItems,
    numberQueueItems: settings.numberQueueItems,
    filenameMetadataEnabled: settings.filenameMetadataEnabled,
    filenameMetadataFields: sanitizeFilenameMetadataFields(settings.filenameMetadataFields),
    filenameMetadataPosition: sanitizeFilenameMetadataPosition(settings.filenameMetadataPosition),
    splitEmbeddedChapters: settings.splitEmbeddedChapters,
    numberChapterFiles: settings.numberChapterFiles,
    autoOrganizeCollections: settings.autoOrganizeCollections,
    rememberDownloadedVideos: settings.rememberDownloadedVideos,
    duplicateDownloadHandling: settings.duplicateDownloadHandling,
    liveFromStart: settings.liveFromStart,
    skipLive: settings.skipLive,
    speedLimitEnabled: settings.speedLimitEnabled,
    speedLimitValue: settings.speedLimitValue,
    speedLimitUnit: settings.speedLimitUnit,
    useAria2: settings.useAria2,
    aria2Args: settings.aria2Args,
    ytdlpAdvancedOptionsEnabled: settings.ytdlpAdvancedOptionsEnabled,
    ytdlpAdvancedOptions: sanitizeYtdlpAdvancedOptions(settings.ytdlpAdvancedOptions),
    autoRetryEnabled: settings.autoRetryEnabled,
    autoRetryMaxAttempts: settings.autoRetryMaxAttempts,
    autoRetryDelaySeconds: settings.autoRetryDelaySeconds,
    persistDownloadQueue: settings.persistDownloadQueue,
    sponsorBlock: settings.sponsorBlock,
    sponsorBlockMode: settings.sponsorBlockMode,
    sponsorBlockCategories: settings.sponsorBlockCategories,
    telegramEnabled: settings.telegramEnabled,
    telegramBotToken: settings.telegramBotToken,
    telegramAllowedChatIds: settings.telegramAllowedChatIds,
    telegramPlainUrlAction: settings.telegramPlainUrlAction,
  };
}

export function buildItemDownloadSettingsSnapshot(
  settings: DownloadSettings,
  extras: SnapshotExtras = {},
): ItemDownloadSettings {
  return {
    quality: settings.quality,
    format: settings.format,
    outputPath: settings.outputPath,
    downloadPlaylist: settings.downloadPlaylist,
    playlistLimit: settings.playlistLimit > 0 ? settings.playlistLimit : null,
    videoCodec: settings.videoCodec,
    preferredFps: settings.preferredFps,
    audioBitrate: settings.audioBitrate,
    useAria2: settings.useAria2,
    aria2Args: settings.aria2Args,
    ytdlpAdvancedOptionsEnabled: settings.ytdlpAdvancedOptionsEnabled,
    ytdlpAdvancedOptions: sanitizeYtdlpAdvancedOptions(settings.ytdlpAdvancedOptions),
    subtitleMode: settings.subtitleMode,
    subtitleLangs: [...settings.subtitleLangs],
    subtitleEmbed: settings.subtitleEmbed,
    subtitleFormat: settings.subtitleFormat,
    liveFromStart: settings.liveFromStart,
    skipLive: settings.skipLive,
    numberPlaylistItems: settings.numberPlaylistItems,
    numberQueueItems: settings.numberQueueItems,
    filenameMetadataEnabled: settings.filenameMetadataEnabled,
    filenameMetadataFields: sanitizeFilenameMetadataFields(settings.filenameMetadataFields),
    filenameMetadataPosition: sanitizeFilenameMetadataPosition(settings.filenameMetadataPosition),
    splitEmbeddedChapters: settings.splitEmbeddedChapters,
    numberChapterFiles: settings.numberChapterFiles,
    autoOrganizeCollections: settings.autoOrganizeCollections,
    pluginWorkflowSnapshots: extras.pluginWorkflowSnapshots,
    postDownloadWorkflowSteps: extras.postDownloadWorkflowSteps,
    autoRetryEnabled: settings.autoRetryEnabled,
    autoRetryMaxAttempts: settings.autoRetryMaxAttempts,
    autoRetryDelaySeconds: settings.autoRetryDelaySeconds,
    ...extras.overrides,
  };
}

export function refreshItemPluginWorkflowSnapshots<
  T extends ItemDownloadSettings | ItemUniversalSettings,
>(settings: T, pluginWorkflowSnapshots: PluginWorkflowSnapshotMap): T {
  return {
    ...settings,
    pluginWorkflowSnapshots,
    postDownloadWorkflowSteps: pluginWorkflowSnapshots['download.completed'] ?? [],
  };
}
