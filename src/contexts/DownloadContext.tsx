import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { downloadDir, homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { usePersistedDownloadQueue } from '@/hooks/usePersistedDownloadQueue';
import {
  extractBackendError,
  localizeBackendError,
  localizeProgressError,
} from '@/lib/backend-error';
import {
  AUTO_RETRY_LIMITS,
  clampAutoRetryDelaySeconds,
  clampAutoRetryMaxAttempts,
  isNonRetryableError,
  isRetryableError,
  waitWithCancellation,
} from '@/lib/download-retry';
import {
  buildCookieProxyInvokeOptions,
  buildProxyUrl,
  loadCookieSettings,
  loadProxySettings,
  saveCookieSettings,
  saveProxySettings,
} from '@/lib/network-config';
import {
  enqueuePluginWorkflowTrigger,
  loadPluginWorkflowSnapshots,
  loadPostDownloadWorkflowSteps,
  refreshPostDownloadWorkflowSteps,
} from '@/lib/post-download-plugins';
import type {
  AudioBitrate,
  CookieSettings,
  DownloadItem,
  DownloadProgress,
  DownloadSettings,
  ExternalEnqueueOptions,
  ExternalEnqueueResult,
  Format,
  ItemDownloadSettings,
  PlaylistVideoEntry,
  PostDownloadPluginPayload,
  ProxySettings,
  Quality,
  SponsorBlockAction,
  SponsorBlockCategory,
  SponsorBlockMode,
  SubtitleFormat,
  SubtitleMode,
  TelegramStatus,
  VideoCodec,
} from '@/lib/types';
import { DEFAULT_SPONSORBLOCK_CATEGORIES } from '@/lib/types';

const STORAGE_KEY = 'youwee-settings';
const DOWNLOAD_QUEUE_IDLE_GRACE_MS = 1000;

// Check if path is absolute (cross-platform)
const isAbsolutePath = (path: string): boolean => {
  if (!path) return false;
  if (path.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return false;
};

// Load settings from localStorage
function loadSavedSettings(): Partial<DownloadSettings> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load saved settings:', e);
  }
  return {};
}

// Build SponsorBlock category strings for yt-dlp args
function buildSponsorBlockArgs(settings: DownloadSettings): {
  remove: string | null;
  mark: string | null;
} {
  if (!settings.sponsorBlock) return { remove: null, mark: null };

  const cats = settings.sponsorBlockCategories;

  if (settings.sponsorBlockMode === 'remove') {
    return { remove: 'all', mark: null };
  }
  if (settings.sponsorBlockMode === 'mark') {
    return { remove: null, mark: 'all' };
  }

  // Custom mode: build comma-separated lists
  const removeCats: string[] = [];
  const markCats: string[] = [];
  for (const [cat, action] of Object.entries(cats)) {
    if (action === 'remove') removeCats.push(cat);
    else if (action === 'mark') markCats.push(cat);
  }
  return {
    remove: removeCats.length > 0 ? removeCats.join(',') : null,
    mark: markCats.length > 0 ? markCats.join(',') : null,
  };
}

// Save settings to localStorage
function saveSettings(settings: DownloadSettings) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
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
        liveFromStart: settings.liveFromStart,
        speedLimitEnabled: settings.speedLimitEnabled,
        speedLimitValue: settings.speedLimitValue,
        speedLimitUnit: settings.speedLimitUnit,
        useAria2: settings.useAria2,
        aria2Args: settings.aria2Args,
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
      }),
    );
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

interface PlaylistInfo {
  index: number;
  total: number;
  title: string;
}

interface RenameDownloadedFileResult {
  newFilepath: string;
  newTitle: string;
}

interface DownloadContextType {
  items: DownloadItem[];
  focusedItemId: string | null;
  isDownloading: boolean;
  isExpandingPlaylist: boolean;
  settings: DownloadSettings;
  cookieSettings: CookieSettings;
  proxySettings: ProxySettings;
  currentPlaylistInfo: PlaylistInfo | null;
  addFromText: (text: string) => Promise<number>;
  enqueueExternalUrl: (
    url: string,
    options?: ExternalEnqueueOptions,
  ) => Promise<ExternalEnqueueResult>;
  focusItem: (itemId: string) => void;
  importFromFile: () => Promise<number>;
  importFromClipboard: () => Promise<number>;
  selectOutputFolder: () => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
  clearCompleted: () => void;
  startDownload: () => Promise<void>;
  stopDownload: () => Promise<void>;
  updateSettings: (updates: Partial<DownloadSettings>) => void;
  updateQuality: (quality: Quality) => void;
  updateFormat: (format: Format) => void;
  updateVideoCodec: (codec: VideoCodec) => void;
  updateAudioBitrate: (bitrate: AudioBitrate) => void;
  updateConcurrentDownloads: (concurrent: number) => void;
  updatePlaylistLimit: (limit: number) => void;
  updateAutoCheckUpdate: (enabled: boolean) => void;
  togglePlaylist: () => void;
  // Subtitle settings
  updateSubtitleMode: (mode: SubtitleMode) => void;
  updateSubtitleLangs: (langs: string[]) => void;
  updateSubtitleEmbed: (embed: boolean) => void;
  updateSubtitleFormat: (format: SubtitleFormat) => void;
  // YouTube specific settings
  updateUseBunRuntime: (enabled: boolean) => void;
  updateUseActualPlayerJs: (enabled: boolean) => void;
  // Cookie settings
  updateCookieSettings: (updates: Partial<CookieSettings>) => void;
  // Proxy settings
  updateProxySettings: (updates: Partial<ProxySettings>) => void;
  getProxyUrl: () => string | undefined;
  // Post-processing settings
  updateEmbedMetadata: (enabled: boolean) => void;
  updateEmbedThumbnail: (enabled: boolean) => void;
  // Live stream settings
  updateLiveFromStart: (enabled: boolean) => void;
  // Speed limit settings
  updateSpeedLimit: (enabled: boolean, value: number, unit: 'K' | 'M' | 'G') => void;
  // External downloader settings
  updateUseAria2: (enabled: boolean) => void;
  updateAria2Args: (args: string) => void;
  // Auto retry settings
  updateAutoRetry: (enabled: boolean, maxAttempts: number, delaySeconds: number) => void;
  // SponsorBlock settings
  updateSponsorBlock: (enabled: boolean) => void;
  updateSponsorBlockMode: (mode: SponsorBlockMode) => void;
  updateSponsorBlockCategory: (category: SponsorBlockCategory, action: SponsorBlockAction) => void;
  updateTelegramSettings: (
    updates: Pick<
      Partial<DownloadSettings>,
      'telegramEnabled' | 'telegramBotToken' | 'telegramAllowedChatIds' | 'telegramPlainUrlAction'
    >,
  ) => void;
  refreshTelegramStatus: () => Promise<TelegramStatus>;
  // Cookie error detection
  cookieError: { show: boolean; itemId?: string; kind: 'db_locked' | 'fresh_cookies' } | null;
  clearCookieError: () => void;
  retryFailedDownload: (itemId: string) => void;
  // Per-item time range
  updateItemTimeRange: (id: string, start?: string, end?: string) => void;
  // Rename completed file
  renameCompletedItem: (id: string, newName: string) => Promise<void>;
}

const DownloadContext = createContext<DownloadContextType | null>(null);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExpandingPlaylist, setIsExpandingPlaylist] = useState(false);
  const [cookieError, setCookieError] = useState<{
    show: boolean;
    itemId?: string;
    kind: 'db_locked' | 'fresh_cookies';
  } | null>(null);

  // Load saved settings on init
  const [settings, setSettings] = useState<DownloadSettings>(() => {
    const saved = loadSavedSettings();
    return {
      quality: saved.quality || 'best',
      format: saved.format || 'mp4',
      outputPath: saved.outputPath || '',
      downloadPlaylist: saved.downloadPlaylist || false,
      videoCodec: saved.videoCodec || 'auto',
      audioBitrate: saved.audioBitrate || 'auto',
      concurrentDownloads: saved.concurrentDownloads || 1,
      playlistLimit: saved.playlistLimit || 0, // 0 = unlimited
      autoCheckUpdate: saved.autoCheckUpdate !== false, // Default to true
      // Subtitle settings
      subtitleMode: saved.subtitleMode || 'off',
      subtitleLangs: saved.subtitleLangs || ['en', 'vi'],
      subtitleEmbed: saved.subtitleEmbed || false,
      subtitleFormat: saved.subtitleFormat || 'srt',
      // YouTube specific settings
      useBunRuntime: saved.useBunRuntime || false,
      useActualPlayerJs: saved.useActualPlayerJs || false,
      // Post-processing settings
      embedMetadata: saved.embedMetadata !== false, // Default to true
      embedThumbnail: saved.embedThumbnail === true, // Default to false (requires FFmpeg)
      // Live stream settings
      liveFromStart: saved.liveFromStart === true, // Default to false
      // Speed limit settings
      speedLimitEnabled: saved.speedLimitEnabled === true, // Default to false (unlimited)
      speedLimitValue: saved.speedLimitValue || 10,
      speedLimitUnit: saved.speedLimitUnit || 'M',
      // External downloader settings
      useAria2: saved.useAria2 === true, // Default to false
      aria2Args: saved.aria2Args || '',
      // Auto retry settings
      autoRetryEnabled: saved.autoRetryEnabled === true, // Default to false
      autoRetryMaxAttempts: clampAutoRetryMaxAttempts(
        saved.autoRetryMaxAttempts || AUTO_RETRY_LIMITS.maxAttempts.default,
      ),
      autoRetryDelaySeconds: clampAutoRetryDelaySeconds(
        saved.autoRetryDelaySeconds || AUTO_RETRY_LIMITS.delaySeconds.default,
      ),
      // Queue persistence
      persistDownloadQueue: saved.persistDownloadQueue === true,
      // SponsorBlock settings
      sponsorBlock: saved.sponsorBlock === true, // Default to false
      sponsorBlockMode: saved.sponsorBlockMode || 'remove',
      sponsorBlockCategories: saved.sponsorBlockCategories || {
        ...DEFAULT_SPONSORBLOCK_CATEGORIES,
      },
      // Telegram remote control settings
      telegramEnabled: saved.telegramEnabled === true,
      telegramBotToken: saved.telegramBotToken || '',
      telegramAllowedChatIds: saved.telegramAllowedChatIds || '',
      telegramPlainUrlAction: saved.telegramPlainUrlAction === 'add' ? 'add' : 'download',
    };
  });

  // Load cookie settings on init
  const [cookieSettings, setCookieSettings] = useState<CookieSettings>(() => loadCookieSettings());

  // Load proxy settings on init
  const [proxySettings, setProxySettings] = useState<ProxySettings>(() => loadProxySettings());

  // Sync cookie/proxy settings to the Rust polling service so background
  // channel checks can authenticate with Bilibili, YouTube, etc.
  const syncPollingNetworkConfig = useCallback((cookies: CookieSettings, proxy: ProxySettings) => {
    invoke('set_polling_network_config', {
      ...buildCookieProxyInvokeOptions(cookies, proxy),
    }).catch((e) => console.error('Failed to sync polling network config:', e));
  }, []);

  const [currentPlaylistInfo, setCurrentPlaylistInfo] = useState<PlaylistInfo | null>(null);

  const isDownloadingRef = useRef(false);
  const itemsRef = useRef<DownloadItem[]>([]);
  const settingsRef = useRef<DownloadSettings>(settings);
  const focusClearTimerRef = useRef<number | null>(null);

  usePersistedDownloadQueue({
    queueKind: 'youtube',
    enabled: settings.persistDownloadQueue,
    items,
    setItems,
    logLabel: 'download queue',
  });

  // Initial sync on mount
  useEffect(() => {
    syncPollingNetworkConfig(loadCookieSettings(), loadProxySettings());
  }, [syncPollingNetworkConfig]);

  useEffect(() => {
    refreshPostDownloadWorkflowSteps();
  }, []);

  useEffect(() => {
    const allowedChatIds = settings.telegramAllowedChatIds
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter((id) => /^-?\d+$/.test(id));

    const timer = window.setTimeout(() => {
      invoke('set_telegram_config', {
        config: {
          enabled: settings.telegramEnabled,
          botToken: settings.telegramBotToken,
          allowedChatIds,
          plainUrlAction: settings.telegramPlainUrlAction,
        },
      }).catch((e) => console.error('Failed to sync Telegram config:', e));
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    settings.telegramEnabled,
    settings.telegramBotToken,
    settings.telegramAllowedChatIds,
    settings.telegramPlainUrlAction,
  ]);

  // Keep itemsRef in sync with items state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Keep settingsRef in sync with settings state
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    return () => {
      if (focusClearTimerRef.current !== null) {
        window.clearTimeout(focusClearTimerRef.current);
      }
    };
  }, []);

  // Get default download path on mount (only if not saved)
  useEffect(() => {
    const getDefaultPath = async () => {
      // Only fetch default if no saved path
      if (settings.outputPath) return;

      try {
        // Try Tauri's downloadDir first
        let path = await downloadDir();

        // Validate path is absolute (cross-platform)
        if (!isAbsolutePath(path)) {
          // Fallback to home directory + Downloads (for ChromeOS/Linux)
          const home = await homeDir();
          if (home) {
            path = `${home}Downloads`;
          }
        }

        // Only set if we have a valid absolute path
        if (isAbsolutePath(path)) {
          setSettings((s) => {
            const newSettings = { ...s, outputPath: path };
            saveSettings(newSettings);
            return newSettings;
          });
        }
      } catch (error) {
        console.error('Failed to get download directory:', error);
        // Try homeDir as final fallback
        try {
          const home = await homeDir();
          if (home) {
            const fallbackPath = `${home}Downloads`;
            setSettings((s) => {
              const newSettings = { ...s, outputPath: fallbackPath };
              saveSettings(newSettings);
              return newSettings;
            });
          }
        } catch (fallbackError) {
          console.error('Failed to get home directory:', fallbackError);
        }
      }
    };
    getDefaultPath();
  }, [settings.outputPath]);

  // Listen for progress updates from Rust backend - runs once at app start
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      const progress = event.payload;

      if (progress.playlist_index && progress.playlist_count) {
        setCurrentPlaylistInfo({
          index: progress.playlist_index,
          total: progress.playlist_count,
          title: progress.title || '',
        });
      }

      // Detect cookie error on Windows (lock error or DPAPI/App-Bound Encryption)
      const cookieDbLockedPattern =
        /could not copy.*cookie|permission denied.*cookies|cookie.*database|failed to.*cookie|failed to decrypt.*dpapi|app.bound.encryption/i;
      if (progress.status === 'error' && progress.error_code === 'YT_FRESH_COOKIES_REQUIRED') {
        setCookieError({ show: true, itemId: progress.id, kind: 'fresh_cookies' });
      } else if (
        progress.status === 'error' &&
        ((progress.error_code && progress.error_code === 'YT_COOKIE_DB_LOCKED') ||
          (progress.error_message && cookieDbLockedPattern.test(progress.error_message)))
      ) {
        setCookieError({ show: true, itemId: progress.id, kind: 'db_locked' });
      }

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === progress.id
            ? {
                ...item,
                progress: progress.percent,
                speed: progress.speed,
                eta: progress.eta,
                title: progress.title || item.title,
                status:
                  progress.status === 'finished'
                    ? 'completed'
                    : progress.status === 'error'
                      ? 'error'
                      : 'downloading',
                error: localizeProgressError(
                  progress.error_code,
                  progress.error_message,
                  progress.error_params,
                ),
                retryState: undefined,
                playlistIndex: progress.playlist_index,
                playlistTotal: progress.playlist_count,
                downloadedSize: progress.downloaded_size,
                elapsedTime: progress.elapsed_time,
                // Auto-detect live stream if we receive downloaded_size (live stream format)
                isLive: progress.downloaded_size ? true : item.isLive,
                // Store completed info when finished
                ...(progress.status === 'finished'
                  ? {
                      completedFilesize: progress.filesize,
                      completedResolution: progress.resolution,
                      completedFormat: progress.format_ext,
                      completedFilepath: progress.filepath,
                      completedHistoryId: progress.history_id,
                    }
                  : {}),
              }
            : item,
        ),
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const parseUrls = useCallback((text: string): string[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        // Skip empty lines and comments
        if (!line || line.startsWith('#')) return false;
        // Check for valid YouTube URLs
        return line.includes('youtube.com') || line.includes('youtu.be');
      });
  }, []);

  // Helper to check if URL is a playlist
  const isPlaylistUrl = useCallback((url: string): boolean => {
    return url.includes('list=');
  }, []);

  // Format duration from seconds to "mm:ss" or "hh:mm:ss"
  const formatDuration = useCallback((seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  const enqueueQueuedWorkflowForItems = useCallback((queuedItems: DownloadItem[]) => {
    for (const item of queuedItems) {
      const itemSettings = item.settings as ItemDownloadSettings | undefined;
      const workflowSnapshots = itemSettings?.pluginWorkflowSnapshots;
      const timeRange =
        itemSettings?.timeRangeStart && itemSettings?.timeRangeEnd
          ? `${itemSettings.timeRangeStart}-${itemSettings.timeRangeEnd}`
          : null;
      const payload: PostDownloadPluginPayload = {
        jobId: item.id,
        source: item.extractor || null,
        trigger: 'download.queued',
        filepath: '',
        filename: item.title || item.url,
        directory: itemSettings?.outputPath ?? settingsRef.current.outputPath,
        filesize: item.filesize ?? null,
        format: itemSettings?.format ?? settingsRef.current.format,
        quality: itemSettings?.quality ?? settingsRef.current.quality,
        url: item.url,
        title: item.title || null,
        thumbnail: item.thumbnail || null,
        historyId: null,
        timeRange,
        downloadKind: 'download',
        workflowRunId: null,
        workflowStepIndex: null,
        workflowStepPluginId: null,
        chainState: null,
      };
      void enqueuePluginWorkflowTrigger('download.queued', payload, workflowSnapshots).catch(
        (error) => {
          console.error('Failed to enqueue download.queued workflow:', error);
        },
      );
    }
  }, []);

  const enqueueFailedWorkflowForItem = useCallback(
    (item: DownloadItem, itemSettings: ItemDownloadSettings | undefined) => {
      const workflowSnapshots = itemSettings?.pluginWorkflowSnapshots;
      const timeRange =
        itemSettings?.timeRangeStart && itemSettings?.timeRangeEnd
          ? `${itemSettings.timeRangeStart}-${itemSettings.timeRangeEnd}`
          : null;
      const payload: PostDownloadPluginPayload = {
        jobId: item.id,
        source: item.extractor || null,
        trigger: 'download.failed',
        filepath: '',
        filename: item.title || item.url,
        directory: itemSettings?.outputPath ?? settings.outputPath,
        filesize: item.filesize ?? null,
        format: itemSettings?.format ?? settings.format,
        quality: itemSettings?.quality ?? settings.quality,
        url: item.url,
        title: item.title || null,
        thumbnail: item.thumbnail || null,
        historyId: null,
        timeRange,
        downloadKind: 'download',
        workflowRunId: null,
        workflowStepIndex: null,
        workflowStepPluginId: null,
        chainState: null,
      };
      void enqueuePluginWorkflowTrigger('download.failed', payload, workflowSnapshots).catch(
        (error) => {
          console.error('Failed to enqueue download.failed workflow:', error);
        },
      );
    },
    [settings.format, settings.outputPath, settings.quality],
  );

  // Add individual URLs (not playlist expansion)
  const addUrlsDirectly = useCallback(
    (urls: string[], playlistId?: string) => {
      if (urls.length === 0) return 0;

      const currentItems = itemsRef.current;
      const currentSettings = settingsRef.current;
      const workflowSnapshots = loadPluginWorkflowSnapshots();

      // Snapshot current settings for these items
      const settingsSnapshot: ItemDownloadSettings = {
        quality: currentSettings.quality,
        format: currentSettings.format,
        outputPath: currentSettings.outputPath,
        videoCodec: currentSettings.videoCodec,
        audioBitrate: currentSettings.audioBitrate,
        useAria2: currentSettings.useAria2,
        aria2Args: currentSettings.aria2Args,
        subtitleMode: currentSettings.subtitleMode,
        subtitleLangs: [...currentSettings.subtitleLangs],
        subtitleEmbed: currentSettings.subtitleEmbed,
        subtitleFormat: currentSettings.subtitleFormat,
        pluginWorkflowSnapshots: workflowSnapshots,
        postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
        autoRetryEnabled: currentSettings.autoRetryEnabled,
        autoRetryMaxAttempts: currentSettings.autoRetryMaxAttempts,
        autoRetryDelaySeconds: currentSettings.autoRetryDelaySeconds,
      };

      const newItems: DownloadItem[] = urls
        .filter((url) => !currentItems.some((item) => item.url === url))
        .map((url, index) => ({
          id: crypto.randomUUID(),
          url,
          title: url,
          status: 'pending' as const,
          progress: 0,
          speed: '',
          eta: '',
          isPlaylist: false,
          // Store playlist context for display
          playlistIndex: playlistId ? index + 1 : undefined,
          playlistTotal: playlistId ? urls.length : undefined,
          // Store settings snapshot
          settings: settingsSnapshot,
        }));

      if (newItems.length > 0) {
        setItems((prev) => [...prev, ...newItems]);
        enqueueQueuedWorkflowForItems(newItems);
      }

      return newItems.length;
    },
    [enqueueQueuedWorkflowForItems],
  );

  const focusItem = useCallback((itemId: string) => {
    setFocusedItemId(itemId);

    if (focusClearTimerRef.current !== null) {
      window.clearTimeout(focusClearTimerRef.current);
    }

    focusClearTimerRef.current = window.setTimeout(() => {
      setFocusedItemId((current) => (current === itemId ? null : current));
      focusClearTimerRef.current = null;
    }, 3000);
  }, []);

  const enqueueExternalUrl = useCallback(
    async (url: string, options?: ExternalEnqueueOptions): Promise<ExternalEnqueueResult> => {
      const normalizedUrl = url.trim();
      if (!normalizedUrl) return { added: false, itemId: null };

      const existingItem = itemsRef.current.find((item) => item.url === normalizedUrl);
      if (existingItem) {
        focusItem(existingItem.id);
        return { added: false, itemId: existingItem.id };
      }

      const currentSettings = settingsRef.current;
      const workflowSnapshots = loadPluginWorkflowSnapshots();
      const mediaType = options?.mediaType === 'audio' ? 'audio' : 'video';
      const videoQuality =
        options?.quality && options.quality !== 'audio' ? options.quality : 'best';
      const audioBitrate = options?.audioBitrate === '128' ? '128' : 'auto';

      const settingsSnapshot: ItemDownloadSettings = {
        quality: mediaType === 'audio' ? 'audio' : videoQuality,
        format: mediaType === 'audio' ? 'mp3' : 'mp4',
        outputPath: currentSettings.outputPath,
        videoCodec: currentSettings.videoCodec,
        audioBitrate: mediaType === 'audio' ? audioBitrate : currentSettings.audioBitrate,
        useAria2: currentSettings.useAria2,
        aria2Args: currentSettings.aria2Args,
        subtitleMode: currentSettings.subtitleMode,
        subtitleLangs: [...currentSettings.subtitleLangs],
        subtitleEmbed: currentSettings.subtitleEmbed,
        subtitleFormat: currentSettings.subtitleFormat,
        pluginWorkflowSnapshots: workflowSnapshots,
        postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
        autoRetryEnabled: currentSettings.autoRetryEnabled,
        autoRetryMaxAttempts: currentSettings.autoRetryMaxAttempts,
        autoRetryDelaySeconds: currentSettings.autoRetryDelaySeconds,
      };

      const newItem: DownloadItem = {
        id: crypto.randomUUID(),
        url: normalizedUrl,
        title: normalizedUrl,
        status: 'pending',
        progress: 0,
        speed: '',
        eta: '',
        isPlaylist: false,
        settings: settingsSnapshot,
      };

      const nextItems = [...itemsRef.current, newItem];
      itemsRef.current = nextItems;
      setItems(nextItems);
      focusItem(newItem.id);
      enqueueQueuedWorkflowForItems([newItem]);
      return { added: true, itemId: newItem.id };
    },
    [enqueueQueuedWorkflowForItems, focusItem],
  );

  // Expand playlist URL to individual videos
  const expandPlaylistUrl = useCallback(
    async (url: string): Promise<string[]> => {
      try {
        const limit = settings.playlistLimit > 0 ? settings.playlistLimit : undefined;
        const entries = await invoke<PlaylistVideoEntry[]>('get_playlist_entries', {
          url,
          limit,
          ...buildCookieProxyInvokeOptions(cookieSettings, proxySettings),
        });

        // Snapshot current settings for these items
        const workflowSnapshots = loadPluginWorkflowSnapshots();
        const settingsSnapshot: ItemDownloadSettings = {
          quality: settingsRef.current.quality,
          format: settingsRef.current.format,
          outputPath: settingsRef.current.outputPath,
          videoCodec: settingsRef.current.videoCodec,
          audioBitrate: settingsRef.current.audioBitrate,
          useAria2: settingsRef.current.useAria2,
          aria2Args: settingsRef.current.aria2Args,
          subtitleMode: settingsRef.current.subtitleMode,
          subtitleLangs: [...settingsRef.current.subtitleLangs],
          subtitleEmbed: settingsRef.current.subtitleEmbed,
          subtitleFormat: settingsRef.current.subtitleFormat,
          pluginWorkflowSnapshots: workflowSnapshots,
          postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
          autoRetryEnabled: settingsRef.current.autoRetryEnabled,
          autoRetryMaxAttempts: settingsRef.current.autoRetryMaxAttempts,
          autoRetryDelaySeconds: settingsRef.current.autoRetryDelaySeconds,
        };

        // Add items with titles and thumbnails from playlist data
        const currentItems = itemsRef.current;
        const newItems: DownloadItem[] = entries
          .filter((entry) => !currentItems.some((item) => item.url === entry.url))
          .map((entry, index) => ({
            id: crypto.randomUUID(),
            url: entry.url,
            title: entry.title,
            status: 'pending' as const,
            progress: 0,
            speed: '',
            eta: '',
            isPlaylist: false,
            thumbnail: entry.thumbnail,
            duration: entry.duration ? formatDuration(entry.duration) : undefined,
            channel: entry.channel,
            playlistIndex: index + 1,
            playlistTotal: entries.length,
            // Store settings snapshot
            settings: settingsSnapshot,
          }));

        if (newItems.length > 0) {
          setItems((prev) => [...prev, ...newItems]);
          enqueueQueuedWorkflowForItems(newItems);
        }

        return entries.map((e) => e.url);
      } catch (error) {
        console.error('Failed to expand playlist:', error);
        throw error;
      }
    },
    [settings, cookieSettings, proxySettings, formatDuration, enqueueQueuedWorkflowForItems],
  );

  const addFromText = useCallback(
    async (text: string): Promise<number> => {
      const urls = parseUrls(text);
      if (urls.length === 0) return 0;

      let totalAdded = 0;

      // Separate playlist URLs and regular video URLs
      const playlistUrls = urls.filter((url) => isPlaylistUrl(url) && settings.downloadPlaylist);
      const regularUrls = urls.filter((url) => !isPlaylistUrl(url) || !settings.downloadPlaylist);

      // Add regular videos directly
      if (regularUrls.length > 0) {
        totalAdded += addUrlsDirectly(regularUrls);
      }

      // Expand playlists if playlist mode is ON
      if (playlistUrls.length > 0) {
        setIsExpandingPlaylist(true);
        try {
          for (const playlistUrl of playlistUrls) {
            try {
              const expandedUrls = await expandPlaylistUrl(playlistUrl);
              totalAdded += expandedUrls.length;
            } catch (error) {
              // If expansion fails, add as single item
              console.error('Failed to expand playlist, adding as single item:', error);
              totalAdded += addUrlsDirectly([playlistUrl]);
            }
          }
        } finally {
          setIsExpandingPlaylist(false);
        }
      }

      return totalAdded;
    },
    [parseUrls, isPlaylistUrl, settings.downloadPlaylist, addUrlsDirectly, expandPlaylistUrl],
  );

  const importFromFile = useCallback(async (): Promise<number> => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: 'Text files', extensions: ['txt'] }],
        title: 'Import URLs from file',
      });

      if (!file) return 0;

      const content = await readTextFile(file as string);
      return addFromText(content);
    } catch (error) {
      console.error('Failed to import file:', error);
      return 0;
    }
  }, [addFromText]);

  const importFromClipboard = useCallback(async (): Promise<number> => {
    try {
      const text = await navigator.clipboard.readText();
      return addFromText(text);
    } catch (error) {
      console.error('Failed to read clipboard:', error);
      return 0;
    }
  }, [addFromText]);

  const selectOutputFolder = useCallback(async () => {
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        title: 'Select Download Folder',
        defaultPath: settings.outputPath || undefined,
      });

      if (folder) {
        setSettings((s) => {
          const newSettings = { ...s, outputPath: folder as string };
          saveSettings(newSettings);
          return newSettings;
        });
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  }, [settings.outputPath]);

  const removeItem = useCallback((id: string) => {
    setItems((items) => items.filter((item) => item.id !== id));
  }, []);

  const updateItemTimeRange = useCallback((id: string, start?: string, end?: string) => {
    setItems((items) =>
      items.map((item) => {
        if (item.id !== id || !item.settings) return item;
        const settings = item.settings as ItemDownloadSettings;
        return {
          ...item,
          settings: { ...settings, timeRangeStart: start, timeRangeEnd: end },
        };
      }),
    );
  }, []);

  const renameCompletedItem = useCallback(async (id: string, newName: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item || item.status !== 'completed') {
      throw new Error('Only completed items can be renamed');
    }

    const filepath = item.completedFilepath;
    if (!filepath) {
      throw new Error('File path is not available for this item');
    }

    try {
      const result = await invoke<RenameDownloadedFileResult>('rename_downloaded_file', {
        filepath,
        newName,
        historyId: item.completedHistoryId || null,
      });
      if (item.completedHistoryId) {
        await invoke('sync_history_renamed_entry', {
          id: item.completedHistoryId,
          filepath: result.newFilepath,
          title: result.newTitle,
        });
      }

      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === id
            ? {
                ...currentItem,
                title: result.newTitle,
                completedFilepath: result.newFilepath,
              }
            : currentItem,
        ),
      );
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setCurrentPlaylistInfo(null);
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((items) => items.filter((item) => item.status !== 'completed'));
  }, []);

  const startDownload = useCallback(async () => {
    const hasPendingItems = () =>
      itemsRef.current.some((item) => item.status === 'pending' || item.status === 'error');

    if (!hasPendingItems()) return;

    setIsDownloading(true);
    isDownloadingRef.current = true;
    setCurrentPlaylistInfo(null);

    // Reset only pending/error items, keep completed items and playlist info as-is
    setItems((items) =>
      items.map((item) => {
        if (item.status === 'pending' || item.status === 'error') {
          return {
            ...item,
            status: 'pending' as const,
            progress: 0,
            speed: '',
            eta: '',
            error: undefined,
            retryState: undefined,
            // Keep playlistIndex and playlistTotal for display
          };
        }
        return item;
      }),
    );

    const concurrentLimit = Math.max(1, settings.concurrentDownloads || 1);

    // Download single item
    const downloadItem = async (item: DownloadItem) => {
      if (!isDownloadingRef.current) return;

      // Use item's saved settings (snapshot from when it was added)
      // Fallback to current global settings if not available
      const itemSettings = item.settings as ItemDownloadSettings | undefined;
      const logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
      const sponsorBlockArgs = buildSponsorBlockArgs(settings);

      const autoRetryEnabled = itemSettings?.autoRetryEnabled ?? settings.autoRetryEnabled;
      const maxRetries = clampAutoRetryMaxAttempts(
        itemSettings?.autoRetryMaxAttempts ?? settings.autoRetryMaxAttempts,
      );
      const retryDelaySeconds = clampAutoRetryDelaySeconds(
        itemSettings?.autoRetryDelaySeconds ?? settings.autoRetryDelaySeconds,
      );

      let retryIndex = 0;

      while (isDownloadingRef.current) {
        setItems((items) =>
          items.map((i) =>
            i.id === item.id
              ? { ...i, status: 'downloading', error: undefined, retryState: undefined }
              : i,
          ),
        );

        try {
          await invoke('download_video', {
            id: item.id,
            url: item.url,
            outputPath: itemSettings?.outputPath ?? settings.outputPath,
            quality: itemSettings?.quality ?? settings.quality,
            format: itemSettings?.format ?? settings.format,
            downloadPlaylist: false, // Always false - playlist already expanded
            videoCodec: itemSettings?.videoCodec ?? settings.videoCodec,
            audioBitrate: itemSettings?.audioBitrate ?? settings.audioBitrate,
            playlistLimit: null, // Not needed
            // Subtitle settings
            subtitleMode: itemSettings?.subtitleMode ?? settings.subtitleMode,
            subtitleLangs: (itemSettings?.subtitleLangs ?? settings.subtitleLangs).join(','),
            subtitleEmbed: itemSettings?.subtitleEmbed ?? settings.subtitleEmbed,
            subtitleFormat: itemSettings?.subtitleFormat ?? settings.subtitleFormat,
            // Logging settings
            logStderr,
            // YouTube specific settings
            useBunRuntime: settings.useBunRuntime,
            useActualPlayerJs: settings.useActualPlayerJs,
            // Network settings
            ...buildCookieProxyInvokeOptions(cookieSettings, proxySettings),
            // Post-processing settings
            embedMetadata: settings.embedMetadata,
            embedThumbnail: settings.embedThumbnail,
            // Live stream settings
            liveFromStart: settings.liveFromStart,
            // Speed limit settings
            speedLimit: settings.speedLimitEnabled
              ? `${settings.speedLimitValue}${settings.speedLimitUnit}`
              : null,
            // External downloader settings
            useAria2: itemSettings?.useAria2 ?? settings.useAria2,
            aria2Args: itemSettings?.aria2Args ?? settings.aria2Args,
            // SponsorBlock settings
            sponsorblockRemove: sponsorBlockArgs.remove,
            sponsorblockMark: sponsorBlockArgs.mark,
            // Download sections (time range)
            downloadSections:
              itemSettings?.timeRangeStart && itemSettings?.timeRangeEnd
                ? `*${itemSettings.timeRangeStart}-${itemSettings.timeRangeEnd}`
                : null,
            // No history_id for new downloads
            historyId: null,
            // Title from video info fetch
            title: item.title || null,
            // Thumbnail from video info fetch
            thumbnail: item.thumbnail || null,
            // Source/extractor from video info fetch
            source: item.extractor || null,
            pluginWorkflowSnapshots:
              itemSettings?.pluginWorkflowSnapshots ?? loadPluginWorkflowSnapshots(),
            postDownloadWorkflowSteps:
              itemSettings?.postDownloadWorkflowSteps ?? loadPostDownloadWorkflowSteps(),
            emitFailedWorkflow: false,
            downloadKind: 'download',
          });

          setItems((items) =>
            items.map((i) =>
              i.id === item.id
                ? { ...i, status: 'completed', progress: 100, retryState: undefined }
                : i,
            ),
          );
          return;
        } catch (error) {
          const parsedError = extractBackendError(error);
          const errorMessage = localizeBackendError(parsedError);
          const canRetry =
            isDownloadingRef.current &&
            autoRetryEnabled &&
            retryIndex < maxRetries &&
            !isNonRetryableError(parsedError.message, parsedError.code) &&
            isRetryableError(parsedError.message, parsedError.code, parsedError.retryable);

          if (!canRetry) {
            enqueueFailedWorkflowForItem(item, itemSettings);
            setItems((items) =>
              items.map((i) =>
                i.id === item.id
                  ? { ...i, status: 'error', error: errorMessage, retryState: undefined }
                  : i,
              ),
            );
            return;
          }

          retryIndex += 1;
          setItems((items) =>
            items.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    status: 'pending',
                    error: errorMessage,
                    retryState: {
                      retryIndex,
                      maxRetries,
                      delaySeconds: retryDelaySeconds,
                      remainingSeconds: retryDelaySeconds,
                    },
                  }
                : i,
            ),
          );

          const shouldContinue = await waitWithCancellation(
            retryDelaySeconds * 1000,
            () => !isDownloadingRef.current,
            (remainingSeconds) => {
              setItems((items) =>
                items.map((i) =>
                  i.id === item.id && i.retryState
                    ? {
                        ...i,
                        retryState: {
                          ...i.retryState,
                          remainingSeconds,
                        },
                      }
                    : i,
                ),
              );
            },
          );

          if (!shouldContinue) {
            return;
          }
        }
      }
    };

    try {
      const claimedIds = new Set<string>();
      const processedIds = new Set<string>();
      let activeCount = 0;

      const claimNextItem = (): DownloadItem | null => {
        const next = itemsRef.current.find(
          (candidate) =>
            (candidate.status === 'pending' || candidate.status === 'error') &&
            !claimedIds.has(candidate.id) &&
            !processedIds.has(candidate.id),
        );
        if (!next) return null;
        claimedIds.add(next.id);
        return next;
      };

      const hasUnclaimedPendingItems = () =>
        itemsRef.current.some(
          (candidate) =>
            (candidate.status === 'pending' || candidate.status === 'error') &&
            !claimedIds.has(candidate.id) &&
            !processedIds.has(candidate.id),
        );

      const processNext = async (): Promise<void> => {
        while (isDownloadingRef.current) {
          const item = claimNextItem();
          if (!item) {
            if (activeCount === 0 && !hasUnclaimedPendingItems()) {
              await new Promise<void>((resolve) => {
                window.setTimeout(resolve, DOWNLOAD_QUEUE_IDLE_GRACE_MS);
              });
              if (!isDownloadingRef.current || !hasUnclaimedPendingItems()) {
                return;
              }
              continue;
            }
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, 200);
            });
            continue;
          }

          activeCount += 1;
          try {
            await downloadItem(item);
          } finally {
            activeCount -= 1;
            claimedIds.delete(item.id);
            processedIds.add(item.id);
          }
        }
      };

      const workers = Array.from({ length: concurrentLimit }, () => processNext());
      await Promise.all(workers);
    } finally {
      setIsDownloading(false);
      isDownloadingRef.current = false;
      setCurrentPlaylistInfo(null);
    }
  }, [enqueueFailedWorkflowForItem, settings, cookieSettings, proxySettings]);

  const stopDownload = useCallback(async () => {
    try {
      await invoke('stop_download');
    } catch (error) {
      console.error('Failed to stop download:', error);
    }
    setItems((items) => items.map((item) => ({ ...item, retryState: undefined })));
    setIsDownloading(false);
    isDownloadingRef.current = false;
    setCurrentPlaylistInfo(null);
  }, []);

  const updateSettings = useCallback((updates: Partial<DownloadSettings>) => {
    setSettings((s) => {
      const newSettings = { ...s, ...updates };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateQuality = useCallback((quality: Quality) => {
    setSettings((s) => {
      const newSettings = { ...s, quality };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateFormat = useCallback((format: Format) => {
    setSettings((s) => {
      const newSettings = { ...s, format };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateVideoCodec = useCallback((videoCodec: VideoCodec) => {
    setSettings((s) => {
      const newSettings = { ...s, videoCodec };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateAudioBitrate = useCallback((audioBitrate: AudioBitrate) => {
    setSettings((s) => {
      const newSettings = { ...s, audioBitrate };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateConcurrentDownloads = useCallback((concurrentDownloads: number) => {
    const value = Math.max(1, Math.min(5, concurrentDownloads));
    setSettings((s) => {
      const newSettings = { ...s, concurrentDownloads: value };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updatePlaylistLimit = useCallback((playlistLimit: number) => {
    const value = Math.max(0, Math.min(100, playlistLimit)); // 0 = unlimited
    setSettings((s) => {
      const newSettings = { ...s, playlistLimit: value };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateAutoCheckUpdate = useCallback((enabled: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, autoCheckUpdate: enabled };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const togglePlaylist = useCallback(() => {
    setSettings((s) => {
      const newSettings = { ...s, downloadPlaylist: !s.downloadPlaylist };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleMode = useCallback((subtitleMode: SubtitleMode) => {
    setSettings((s) => {
      const newSettings = { ...s, subtitleMode };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleLangs = useCallback((subtitleLangs: string[]) => {
    setSettings((s) => {
      const newSettings = { ...s, subtitleLangs };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleEmbed = useCallback((subtitleEmbed: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, subtitleEmbed };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleFormat = useCallback((subtitleFormat: SubtitleFormat) => {
    setSettings((s) => {
      const newSettings = { ...s, subtitleFormat };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateUseBunRuntime = useCallback((useBunRuntime: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, useBunRuntime };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateUseActualPlayerJs = useCallback((useActualPlayerJs: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, useActualPlayerJs };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateCookieSettings = useCallback(
    (updates: Partial<CookieSettings>) => {
      setCookieSettings((s) => {
        const newSettings = { ...s, ...updates };
        saveCookieSettings(newSettings);
        syncPollingNetworkConfig(newSettings, proxySettings);
        return newSettings;
      });
    },
    [syncPollingNetworkConfig, proxySettings],
  );

  const updateProxySettings = useCallback(
    (updates: Partial<ProxySettings>) => {
      setProxySettings((s) => {
        const newSettings = { ...s, ...updates };
        saveProxySettings(newSettings);
        syncPollingNetworkConfig(cookieSettings, newSettings);
        return newSettings;
      });
    },
    [syncPollingNetworkConfig, cookieSettings],
  );

  const getProxyUrl = useCallback(() => {
    return buildProxyUrl(proxySettings);
  }, [proxySettings]);

  const updateEmbedMetadata = useCallback((embedMetadata: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, embedMetadata };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateEmbedThumbnail = useCallback((embedThumbnail: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, embedThumbnail };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateLiveFromStart = useCallback((liveFromStart: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, liveFromStart };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSpeedLimit = useCallback(
    (speedLimitEnabled: boolean, speedLimitValue: number, speedLimitUnit: 'K' | 'M' | 'G') => {
      setSettings((s) => {
        const newSettings = { ...s, speedLimitEnabled, speedLimitValue, speedLimitUnit };
        saveSettings(newSettings);
        return newSettings;
      });
    },
    [],
  );

  const updateUseAria2 = useCallback((useAria2: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, useAria2 };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateAria2Args = useCallback((aria2Args: string) => {
    setSettings((s) => {
      const newSettings = { ...s, aria2Args };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateAutoRetry = useCallback(
    (autoRetryEnabled: boolean, autoRetryMaxAttempts: number, autoRetryDelaySeconds: number) => {
      setSettings((s) => {
        const newSettings = {
          ...s,
          autoRetryEnabled,
          autoRetryMaxAttempts: clampAutoRetryMaxAttempts(autoRetryMaxAttempts),
          autoRetryDelaySeconds: clampAutoRetryDelaySeconds(autoRetryDelaySeconds),
        };
        saveSettings(newSettings);
        return newSettings;
      });
    },
    [],
  );

  const updateSponsorBlock = useCallback((sponsorBlock: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, sponsorBlock };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSponsorBlockMode = useCallback((sponsorBlockMode: SponsorBlockMode) => {
    setSettings((s) => {
      const newSettings = { ...s, sponsorBlockMode };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSponsorBlockCategory = useCallback(
    (category: SponsorBlockCategory, action: SponsorBlockAction) => {
      setSettings((s) => {
        const newSettings = {
          ...s,
          sponsorBlockCategories: { ...s.sponsorBlockCategories, [category]: action },
        };
        saveSettings(newSettings);
        return newSettings;
      });
    },
    [],
  );

  const updateTelegramSettings = useCallback(
    (
      updates: Pick<
        Partial<DownloadSettings>,
        'telegramEnabled' | 'telegramBotToken' | 'telegramAllowedChatIds' | 'telegramPlainUrlAction'
      >,
    ) => {
      setSettings((s) => {
        const newSettings = { ...s, ...updates };
        saveSettings(newSettings);
        return newSettings;
      });
    },
    [],
  );

  const refreshTelegramStatus = useCallback(async () => {
    return invoke<TelegramStatus>('get_telegram_status');
  }, []);

  // Clear cookie error dialog
  const clearCookieError = useCallback(() => {
    setCookieError(null);
  }, []);

  // Retry a failed download (reset item and restart)
  const retryFailedDownload = useCallback(
    (itemId: string) => {
      // Reset item status to pending
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? { ...item, status: 'pending', progress: 0, error: undefined, retryState: undefined }
            : item,
        ),
      );
      // Clear cookie error
      setCookieError(null);
      // Use a short delay to ensure state update before starting download
      setTimeout(() => {
        startDownload();
      }, 100);
    },
    [startDownload],
  );

  const value: DownloadContextType = {
    items,
    focusedItemId,
    isDownloading,
    isExpandingPlaylist,
    settings,
    cookieSettings,
    proxySettings,
    currentPlaylistInfo,
    addFromText,
    enqueueExternalUrl,
    focusItem,
    importFromFile,
    importFromClipboard,
    selectOutputFolder,
    removeItem,
    clearAll,
    clearCompleted,
    startDownload,
    stopDownload,
    updateSettings,
    updateQuality,
    updateFormat,
    updateVideoCodec,
    updateAudioBitrate,
    updateConcurrentDownloads,
    updatePlaylistLimit,
    updateAutoCheckUpdate,
    togglePlaylist,
    updateSubtitleMode,
    updateSubtitleLangs,
    updateSubtitleEmbed,
    updateSubtitleFormat,
    updateUseBunRuntime,
    updateUseActualPlayerJs,
    updateCookieSettings,
    updateProxySettings,
    getProxyUrl,
    updateEmbedMetadata,
    updateEmbedThumbnail,
    updateLiveFromStart,
    updateSpeedLimit,
    updateUseAria2,
    updateAria2Args,
    updateAutoRetry,
    // SponsorBlock settings
    updateSponsorBlock,
    updateSponsorBlockMode,
    updateSponsorBlockCategory,
    updateTelegramSettings,
    refreshTelegramStatus,
    // Cookie error detection
    cookieError,
    clearCookieError,
    retryFailedDownload,
    // Per-item time range
    updateItemTimeRange,
    renameCompletedItem,
  };

  return <DownloadContext.Provider value={value}>{children}</DownloadContext.Provider>;
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
}
