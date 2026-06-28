import {
  AUTO_RETRY_LIMITS,
  clampAutoRetryDelaySeconds,
  clampAutoRetryMaxAttempts,
} from '@/lib/download-retry';
import type {
  DownloadSettings,
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

export function createDefaultDownloadSettings(saved: Partial<DownloadSettings>): DownloadSettings {
  return {
    quality: saved.quality || 'best',
    format: saved.format || 'mp4',
    outputPath: saved.outputPath || '',
    downloadPlaylist: saved.downloadPlaylist || false,
    videoCodec: saved.videoCodec || 'auto',
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
    splitEmbeddedChapters: saved.splitEmbeddedChapters === true,
    numberChapterFiles: saved.numberChapterFiles !== false,
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

export function serializeDownloadSettings(settings: DownloadSettings): Partial<DownloadSettings> {
  return {
    outputPath: settings.outputPath,
    quality: settings.quality,
    format: settings.format,
    downloadPlaylist: settings.downloadPlaylist,
    videoCodec: settings.videoCodec,
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
    splitEmbeddedChapters: settings.splitEmbeddedChapters,
    numberChapterFiles: settings.numberChapterFiles,
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
    splitEmbeddedChapters: settings.splitEmbeddedChapters,
    numberChapterFiles: settings.numberChapterFiles,
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
