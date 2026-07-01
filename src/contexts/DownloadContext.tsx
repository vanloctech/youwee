import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { downloadDir, homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePersistedDownloadQueue } from '@/hooks/usePersistedDownloadQueue';
import {
  extractBackendError,
  localizeBackendError,
  localizeProgressError,
} from '@/lib/backend-error';
import {
  buildDownloadDuplicateIdentity,
  getDownloadDuplicateIdentityKey,
} from '@/lib/download-duplicates';
import {
  clampAutoRetryDelaySeconds,
  clampAutoRetryMaxAttempts,
  isNonRetryableError,
  isRetryableError,
  waitWithCancellation,
} from '@/lib/download-retry';
import {
  buildItemDownloadSettingsSnapshot,
  createDefaultDownloadSettings,
  refreshItemPluginWorkflowSnapshots,
  serializeDownloadSettings,
} from '@/lib/download-settings';
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
  refreshPluginWorkflowSnapshots,
  refreshPostDownloadWorkflowSteps,
} from '@/lib/post-download-plugins';
import { normalizeShellEscapedUrl } from '@/lib/sources';
import type {
  AudioBitrate,
  CookieSettings,
  DownloadDuplicateCandidate,
  DownloadDuplicateFilterOptions,
  DownloadDuplicateMatch,
  DownloadDuplicateReview,
  DownloadDuplicateReviewAction,
  DownloadItem,
  DownloadProgress,
  DownloadSettings,
  ExternalEnqueueOptions,
  ExternalEnqueueResult,
  Format,
  ItemDownloadSettings,
  PlaylistVideoEntry,
  PostDownloadPluginPayload,
  PreferredFps,
  ProxySettings,
  Quality,
  SponsorBlockAction,
  SponsorBlockCategory,
  SponsorBlockMode,
  SubtitleFormat,
  SubtitleMode,
  TelegramStatus,
  VideoCodec,
  YoutubeSearchQueueResult,
  YoutubeSearchVideo,
} from '@/lib/types';
import { extractYouTubeVideoId } from '@/lib/youtube-url';
import { DownloadContext } from './download-context';

const STORAGE_KEY = 'youwee-settings';
const DOWNLOAD_QUEUE_IDLE_GRACE_MS = 1000;

// Check if path is absolute (cross-platform)
const isAbsolutePath = (path: string): boolean => {
  if (!path) return false;
  if (path.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return false;
};

async function resolveDefaultOutputPath(): Promise<string> {
  try {
    let path = await downloadDir();

    if (!isAbsolutePath(path)) {
      const home = await homeDir();
      if (home) {
        path = `${home}Downloads`;
      }
    }

    return isAbsolutePath(path) ? path : '';
  } catch (error) {
    console.error('Failed to get download directory:', error);
    try {
      const home = await homeDir();
      const fallbackPath = home ? `${home}Downloads` : '';
      return isAbsolutePath(fallbackPath) ? fallbackPath : '';
    } catch (fallbackError) {
      console.error('Failed to get home directory:', fallbackError);
      return '';
    }
  }
}

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeDownloadSettings(settings)));
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

interface DownloadQueueCandidate extends DownloadDuplicateCandidate {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: string;
  channel?: string;
  extractor?: string;
  playlistIndex?: number;
  playlistTotal?: number;
}

export interface DownloadContextType {
  items: DownloadItem[];
  focusedItemId: string | null;
  isDownloading: boolean;
  isExpandingPlaylist: boolean;
  settings: DownloadSettings;
  cookieSettings: CookieSettings;
  proxySettings: ProxySettings;
  currentPlaylistInfo: PlaylistInfo | null;
  duplicateReview: DownloadDuplicateReview | null;
  duplicateSkipNotice: { count: number } | null;
  addFromText: (text: string) => Promise<number>;
  addSearchResultsToQueue: (results: YoutubeSearchVideo[]) => Promise<YoutubeSearchQueueResult>;
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
  updatePreferredFps: (fps: PreferredFps) => void;
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
  updateSkipLive: (enabled: boolean) => void;
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
      | 'telegramEnabled'
      | 'telegramBotToken'
      | 'telegramAllowedChatIds'
      | 'telegramMessageThreadId'
      | 'telegramPlainUrlAction'
    >,
  ) => void;
  refreshTelegramStatus: () => Promise<TelegramStatus>;
  // Cookie error detection
  cookieError: { show: boolean; itemId?: string; kind: 'db_locked' | 'fresh_cookies' } | null;
  clearCookieError: () => void;
  retryFailedDownload: (itemId: string) => void;
  resolveDuplicateReview: (action: DownloadDuplicateReviewAction, applyToAll: boolean) => void;
  dismissDuplicateSkipNotice: () => void;
  filterDownloadedDuplicateCandidates: <T extends DownloadDuplicateCandidate>(
    candidates: T[],
    options?: DownloadDuplicateFilterOptions,
  ) => Promise<T[]>;
  // Per-item time range
  updateItemTimeRange: (id: string, start?: string, end?: string) => void;
  selectItemOutputFolder: (id: string) => Promise<void>;
  // Rename completed file
  renameCompletedItem: (id: string, newName: string) => Promise<void>;
}

export function DownloadProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExpandingPlaylist, setIsExpandingPlaylist] = useState(false);
  const [cookieError, setCookieError] = useState<{
    show: boolean;
    itemId?: string;
    kind: 'db_locked' | 'fresh_cookies';
  } | null>(null);
  const [duplicateReview, setDuplicateReview] = useState<DownloadDuplicateReview | null>(null);
  const [duplicateSkipNotice, setDuplicateSkipNotice] = useState<{ count: number } | null>(null);
  const [pendingOutputPathUpdate, setPendingOutputPathUpdate] = useState<{
    outputPath: string;
    itemIds: string[];
  } | null>(null);

  // Load saved settings on init
  const [settings, setSettings] = useState<DownloadSettings>(() => {
    const saved = loadSavedSettings();
    return createDefaultDownloadSettings(saved);
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
  const duplicateReviewResolverRef = useRef<{
    resolve: (action: DownloadDuplicateReviewAction) => void;
  } | null>(null);

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
    const messageThreadId = settings.telegramMessageThreadId.trim();

    const timer = window.setTimeout(() => {
      invoke('set_telegram_config', {
        config: {
          enabled: settings.telegramEnabled,
          botToken: settings.telegramBotToken,
          allowedChatIds,
          messageThreadId: /^\d+$/.test(messageThreadId) ? Number(messageThreadId) : null,
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
    settings.telegramMessageThreadId,
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

      const path = await resolveDefaultOutputPath();
      if (path) {
        setSettings((s) => {
          const newSettings = { ...s, outputPath: path };
          saveSettings(newSettings);
          return newSettings;
        });
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

      setItems((currentItems) => {
        if (progress.status === 'error' && progress.error_code === 'DOWNLOAD_CANCELLED') {
          return currentItems.map((item) =>
            item.id === progress.id
              ? {
                  ...item,
                  status: 'pending',
                  speed: '',
                  eta: '',
                  error: undefined,
                  errorCode: undefined,
                  retryState: undefined,
                }
              : item,
          );
        }

        const status: DownloadItem['status'] =
          progress.status === 'finished'
            ? 'completed'
            : progress.status === 'error'
              ? 'error'
              : 'downloading';
        const nextItems = currentItems.map((item) =>
          item.id === progress.id
            ? {
                ...item,
                progress: progress.percent,
                speed: progress.speed,
                eta: progress.eta,
                title: progress.title || item.title,
                status,
                error: localizeProgressError(
                  progress.error_code,
                  progress.error_message,
                  progress.error_params,
                ),
                errorCode: progress.status === 'error' ? progress.error_code : undefined,
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
        );
        itemsRef.current = nextItems;
        return nextItems;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const parseUrls = useCallback((text: string): string[] => {
    return text
      .split('\n')
      .map(normalizeShellEscapedUrl)
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

  const requestDuplicateReview = useCallback(
    (review: DownloadDuplicateReview): Promise<DownloadDuplicateReviewAction> => {
      if (duplicateReviewResolverRef.current) {
        duplicateReviewResolverRef.current.resolve('cancel');
      }

      setDuplicateReview(review);
      return new Promise((resolve) => {
        duplicateReviewResolverRef.current = { resolve };
      });
    },
    [],
  );

  const resolveDuplicateReview = useCallback(
    (action: DownloadDuplicateReviewAction, _applyToAll: boolean) => {
      const resolver = duplicateReviewResolverRef.current;
      duplicateReviewResolverRef.current = null;
      setDuplicateReview(null);
      resolver?.resolve(action);
    },
    [],
  );

  const dismissDuplicateSkipNotice = useCallback(() => {
    setDuplicateSkipNotice(null);
  }, []);

  const filterDownloadedDuplicateCandidates = useCallback(
    async <T extends DownloadDuplicateCandidate>(
      candidates: T[],
      options: DownloadDuplicateFilterOptions = {},
    ): Promise<T[]> => {
      const currentSettings = settingsRef.current;
      if (
        !currentSettings.rememberDownloadedVideos ||
        currentSettings.duplicateDownloadHandling === 'allow' ||
        candidates.length === 0
      ) {
        return candidates;
      }

      try {
        const identities = candidates.map((candidate) => candidate.duplicateIdentity);
        const matches = await invoke<DownloadDuplicateMatch[]>('find_duplicate_downloads', {
          identities,
        });
        if (matches.length === 0) return candidates;

        const matchByKey = new Map<string, DownloadDuplicateMatch>();
        for (const match of matches) {
          for (const key of [
            getDownloadDuplicateIdentityKey({ mediaId: match.mediaId }),
            getDownloadDuplicateIdentityKey({ canonicalUrl: match.canonicalUrl }),
          ]) {
            if (key) {
              matchByKey.set(key, match);
            }
          }
        }
        if (matchByKey.size === 0) return candidates;

        const duplicateItems: { candidate: T; duplicate: DownloadDuplicateMatch }[] = [];
        for (const candidate of candidates) {
          const duplicate = matchByKey.get(
            getDownloadDuplicateIdentityKey(candidate.duplicateIdentity),
          );
          if (duplicate) {
            duplicateItems.push({ candidate, duplicate });
          }
        }

        if (duplicateItems.length === 0) return candidates;

        const skipDuplicates = () => {
          const duplicateKeys = new Set(
            duplicateItems.map((item) =>
              getDownloadDuplicateIdentityKey(item.candidate.duplicateIdentity),
            ),
          );
          if (options.notify !== false) {
            setDuplicateSkipNotice({ count: duplicateItems.length });
          }
          return candidates.filter(
            (candidate) =>
              !duplicateKeys.has(getDownloadDuplicateIdentityKey(candidate.duplicateIdentity)),
          );
        };

        if (currentSettings.duplicateDownloadHandling === 'skip' || options.ask === false) {
          return skipDuplicates();
        }

        const action = await requestDuplicateReview({
          duplicates: duplicateItems.map((item) => ({
            url: item.candidate.url,
            title: item.candidate.title,
            thumbnail: item.candidate.thumbnail,
            duplicate: item.duplicate,
          })),
          newCount: candidates.length - duplicateItems.length,
        });

        if (action === 'add') return candidates;
        if (action === 'skip') return skipDuplicates();
        return [];
      } catch (error) {
        console.warn('Failed to check downloaded duplicates:', error);
        return candidates;
      }
    },
    [requestDuplicateReview],
  );

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
    async (urls: string[], playlistId?: string) => {
      if (urls.length === 0) return 0;

      const currentItems = itemsRef.current;
      const currentSettings = settingsRef.current;
      const workflowSnapshots = loadPluginWorkflowSnapshots();

      // Snapshot current settings for these items
      const settingsSnapshot = buildItemDownloadSettingsSnapshot(currentSettings, {
        pluginWorkflowSnapshots: workflowSnapshots,
        postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
        overrides: {
          downloadPlaylist: false,
          playlistLimit: null,
        },
      });

      const nextUrls = urls.filter((url) => !currentItems.some((item) => item.url === url));
      const candidates = nextUrls.map<DownloadQueueCandidate>((url) => ({
        url,
        title: url,
        duplicateIdentity: buildDownloadDuplicateIdentity(url),
      }));
      const filteredCandidates = await filterDownloadedDuplicateCandidates(candidates);
      const currentItemsAfterReview = itemsRef.current;
      const enqueueCandidates = filteredCandidates.filter(
        (candidate) => !currentItemsAfterReview.some((item) => item.url === candidate.url),
      );
      const queueTotal = currentItemsAfterReview.length + enqueueCandidates.length;
      const newItems: DownloadItem[] = enqueueCandidates.map((candidate, index) => ({
        id: crypto.randomUUID(),
        url: candidate.url,
        title: candidate.title,
        status: 'pending' as const,
        progress: 0,
        speed: '',
        eta: '',
        isPlaylist: false,
        // Store playlist context for display
        playlistIndex: playlistId ? index + 1 : undefined,
        playlistTotal: playlistId ? urls.length : undefined,
        queueIndex: playlistId ? undefined : currentItemsAfterReview.length + index + 1,
        queueTotal: playlistId ? undefined : queueTotal,
        // Store settings snapshot
        settings: settingsSnapshot,
      }));

      if (newItems.length > 0) {
        setItems((prev) => {
          const nextItems = [...prev, ...newItems];
          itemsRef.current = nextItems;
          return nextItems;
        });
        enqueueQueuedWorkflowForItems(newItems);
      }

      return newItems.length;
    },
    [enqueueQueuedWorkflowForItems, filterDownloadedDuplicateCandidates],
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
      let outputPath = options?.outputPath || currentSettings.outputPath;
      if (!outputPath) {
        outputPath = await resolveDefaultOutputPath();
        if (outputPath) {
          setSettings((s) => {
            const newSettings = { ...s, outputPath };
            settingsRef.current = newSettings;
            saveSettings(newSettings);
            return newSettings;
          });
        }
      }
      const workflowSnapshots = loadPluginWorkflowSnapshots();
      const mediaType = options?.mediaType === 'audio' ? 'audio' : 'video';
      const videoQuality =
        options?.quality && options.quality !== 'audio' ? options.quality : 'best';
      const audioBitrate = options?.audioBitrate === '128' ? '128' : 'auto';

      const settingsSnapshot = buildItemDownloadSettingsSnapshot(currentSettings, {
        pluginWorkflowSnapshots: workflowSnapshots,
        postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
        overrides: {
          quality: mediaType === 'audio' ? 'audio' : videoQuality,
          format: mediaType === 'audio' ? 'mp3' : 'mp4',
          outputPath,
          downloadPlaylist: options?.downloadPlaylist ?? false,
          playlistLimit: options?.playlistLimit ?? null,
          audioBitrate: mediaType === 'audio' ? audioBitrate : currentSettings.audioBitrate,
          subtitleMode: options?.subtitleMode ?? currentSettings.subtitleMode,
          subtitleLangs: options?.subtitleLangs ?? [...currentSettings.subtitleLangs],
          subtitleEmbed: options?.subtitleEmbed ?? currentSettings.subtitleEmbed,
          subtitleFormat: options?.subtitleFormat ?? currentSettings.subtitleFormat,
          timeRangeStart: options?.timeRangeStart,
          timeRangeEnd: options?.timeRangeEnd,
          liveFromStart: options?.liveFromStart ?? currentSettings.liveFromStart,
          skipLive: options?.skipLive ?? currentSettings.skipLive,
        },
      });

      const newItem: DownloadItem = {
        id: crypto.randomUUID(),
        url: normalizedUrl,
        title: normalizedUrl,
        status: 'pending',
        progress: 0,
        speed: '',
        eta: '',
        isPlaylist: false,
        queueIndex: itemsRef.current.length + 1,
        queueTotal: itemsRef.current.length + 1,
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

  const addSearchResultsToQueue = useCallback(
    async (results: YoutubeSearchVideo[]): Promise<YoutubeSearchQueueResult> => {
      if (results.length === 0) return { added: 0, queuedIds: [] };

      const workflowSnapshots = loadPluginWorkflowSnapshots();
      const currentSettings = settingsRef.current;
      const settingsSnapshot = buildItemDownloadSettingsSnapshot(currentSettings, {
        pluginWorkflowSnapshots: workflowSnapshots,
        postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
        overrides: {
          downloadPlaylist: false,
          playlistLimit: null,
        },
      });

      const currentItems = itemsRef.current;
      let nextQueueIndex = currentItems.length + 1;
      const seenUrls = new Set(currentItems.map((item) => item.url));
      const seenYoutubeIds = new Set(
        currentItems
          .map((item) => extractYouTubeVideoId(item.url))
          .filter((id): id is string => id !== null),
      );
      const newItems: DownloadItem[] = [];
      const queuedIds: string[] = [];
      const candidates: DownloadQueueCandidate[] = [];

      for (const result of results) {
        const url = result.url.trim();
        if (!url) continue;
        const videoId = result.id || extractYouTubeVideoId(url);
        if (seenUrls.has(url) || (videoId && seenYoutubeIds.has(videoId))) {
          queuedIds.push(result.id);
          continue;
        }
        seenUrls.add(url);
        if (videoId) {
          seenYoutubeIds.add(videoId);
        }
        queuedIds.push(result.id);

        candidates.push({
          url,
          title: result.title || url,
          thumbnail: result.thumbnail || undefined,
          duration: result.duration || undefined,
          channel: result.channel || undefined,
          extractor: 'youtube',
          duplicateIdentity: buildDownloadDuplicateIdentity(url, videoId),
        });
      }

      const filteredCandidates = await filterDownloadedDuplicateCandidates(candidates);
      const currentItemsAfterReview = itemsRef.current;
      const currentYoutubeIdsAfterReview = new Set(
        currentItemsAfterReview
          .map((item) => extractYouTubeVideoId(item.url))
          .filter((id): id is string => id !== null),
      );

      for (const candidate of filteredCandidates) {
        const videoId = extractYouTubeVideoId(candidate.url);
        if (
          currentItemsAfterReview.some((item) => item.url === candidate.url) ||
          (videoId && currentYoutubeIdsAfterReview.has(videoId))
        ) {
          continue;
        }
        if (videoId) {
          currentYoutubeIdsAfterReview.add(videoId);
        }
        newItems.push({
          id: crypto.randomUUID(),
          url: candidate.url,
          title: candidate.title,
          status: 'pending',
          progress: 0,
          speed: '',
          eta: '',
          isPlaylist: false,
          thumbnail: candidate.thumbnail,
          duration: candidate.duration,
          channel: candidate.channel,
          extractor: candidate.extractor,
          queueIndex: nextQueueIndex,
          settings: settingsSnapshot,
        });
        nextQueueIndex += 1;
      }

      if (newItems.length === 0) return { added: 0, queuedIds };
      const queueTotal = currentItems.length + newItems.length;
      for (const item of newItems) {
        item.queueTotal = queueTotal;
      }

      const nextItems = [...itemsRef.current, ...newItems];
      itemsRef.current = nextItems;
      setItems(nextItems);
      focusItem(newItems[0].id);
      enqueueQueuedWorkflowForItems(newItems);
      return { added: newItems.length, queuedIds };
    },
    [enqueueQueuedWorkflowForItems, filterDownloadedDuplicateCandidates, focusItem],
  );

  // Expand playlist URL to individual videos
  const expandPlaylistUrl = useCallback(
    async (url: string): Promise<number> => {
      try {
        const limit = settings.playlistLimit > 0 ? settings.playlistLimit : undefined;
        const entries = await invoke<PlaylistVideoEntry[]>('get_playlist_entries', {
          url,
          limit,
          ...buildCookieProxyInvokeOptions(cookieSettings, proxySettings),
        });

        // Snapshot current settings for these items
        const workflowSnapshots = loadPluginWorkflowSnapshots();
        const settingsSnapshot = buildItemDownloadSettingsSnapshot(settingsRef.current, {
          pluginWorkflowSnapshots: workflowSnapshots,
          postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
          overrides: {
            downloadPlaylist: false,
            playlistLimit: null,
            playlistCollectionName:
              entries.find((entry) => entry.playlist_title)?.playlist_title ?? null,
          },
        });

        // Add items with titles and thumbnails from playlist data
        const currentItems = itemsRef.current;
        const candidates = entries
          .map<DownloadQueueCandidate>((entry, index) => ({
            url: entry.url,
            title: entry.title,
            thumbnail: entry.thumbnail,
            duration: entry.duration ? formatDuration(entry.duration) : undefined,
            channel: entry.channel,
            playlistIndex: index + 1,
            playlistTotal: entries.length,
            duplicateIdentity: buildDownloadDuplicateIdentity(entry.url, entry.id),
          }))
          .filter((candidate) => !currentItems.some((item) => item.url === candidate.url));
        const filteredCandidates = await filterDownloadedDuplicateCandidates(candidates);
        const currentItemsAfterReview = itemsRef.current;
        const enqueueCandidates = filteredCandidates.filter(
          (candidate) => !currentItemsAfterReview.some((item) => item.url === candidate.url),
        );
        const newItems: DownloadItem[] = enqueueCandidates.map((candidate) => ({
          id: crypto.randomUUID(),
          url: candidate.url,
          title: candidate.title,
          status: 'pending' as const,
          progress: 0,
          speed: '',
          eta: '',
          isPlaylist: false,
          thumbnail: candidate.thumbnail,
          duration: candidate.duration,
          channel: candidate.channel,
          playlistIndex: candidate.playlistIndex,
          playlistTotal: candidate.playlistTotal,
          // Store settings snapshot
          settings: settingsSnapshot,
        }));

        if (newItems.length > 0) {
          setItems((prev) => {
            const nextItems = [...prev, ...newItems];
            itemsRef.current = nextItems;
            return nextItems;
          });
          enqueueQueuedWorkflowForItems(newItems);
        }

        return newItems.length;
      } catch (error) {
        console.error('Failed to expand playlist:', error);
        throw error;
      }
    },
    [
      settings,
      cookieSettings,
      proxySettings,
      formatDuration,
      enqueueQueuedWorkflowForItems,
      filterDownloadedDuplicateCandidates,
    ],
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
        totalAdded += await addUrlsDirectly(regularUrls);
      }

      // Expand playlists if playlist mode is ON
      if (playlistUrls.length > 0) {
        setIsExpandingPlaylist(true);
        try {
          for (const playlistUrl of playlistUrls) {
            try {
              totalAdded += await expandPlaylistUrl(playlistUrl);
            } catch (error) {
              // If expansion fails, add as single item
              console.error('Failed to expand playlist, adding as single item:', error);
              totalAdded += await addUrlsDirectly([playlistUrl]);
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
        const outputPath = folder as string;
        const itemsToUpdate = itemsRef.current.filter((item) => {
          if (!item.settings || item.status === 'downloading' || item.status === 'completed') {
            return false;
          }
          const itemSettings = item.settings as ItemDownloadSettings;
          return itemSettings.outputPath !== outputPath;
        });

        setSettings((s) => {
          const newSettings = { ...s, outputPath };
          saveSettings(newSettings);
          return newSettings;
        });

        if (itemsToUpdate.length > 0) {
          setPendingOutputPathUpdate({
            outputPath,
            itemIds: itemsToUpdate.map((item) => item.id),
          });
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  }, [settings.outputPath]);

  const confirmQueuedOutputPathUpdate = useCallback(() => {
    if (!pendingOutputPathUpdate) return;
    const idsToUpdate = new Set(pendingOutputPathUpdate.itemIds);
    const { outputPath } = pendingOutputPathUpdate;

    setItems((items) => {
      const nextItems = items.map((item) => {
        if (
          !idsToUpdate.has(item.id) ||
          !item.settings ||
          item.status === 'downloading' ||
          item.status === 'completed'
        ) {
          return item;
        }
        const itemSettings = item.settings as ItemDownloadSettings;
        return {
          ...item,
          settings: { ...itemSettings, outputPath },
        };
      });
      itemsRef.current = nextItems;
      return nextItems;
    });
    setPendingOutputPathUpdate(null);
  }, [pendingOutputPathUpdate]);

  const removeItem = useCallback((id: string) => {
    setItems((items) => {
      const nextItems = items.filter((item) => item.id !== id);
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  const updateItemTimeRange = useCallback((id: string, start?: string, end?: string) => {
    setItems((items) => {
      const nextItems = items.map((item) => {
        if (item.id !== id || !item.settings) return item;
        const settings = item.settings as ItemDownloadSettings;
        return {
          ...item,
          settings: { ...settings, timeRangeStart: start, timeRangeEnd: end },
        };
      });
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  const updateItemOutputPath = useCallback((id: string, outputPath: string) => {
    setItems((items) => {
      const nextItems = items.map((item) => {
        if (item.id !== id || !item.settings) return item;
        const settings = item.settings as ItemDownloadSettings;
        return {
          ...item,
          settings: { ...settings, outputPath },
        };
      });
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  const selectItemOutputFolder = useCallback(
    async (id: string) => {
      if (isDownloadingRef.current) return;

      const item = itemsRef.current.find((i) => i.id === id);
      if (!item || (item.status !== 'pending' && item.status !== 'error')) {
        return;
      }

      const itemSettings = item.settings as ItemDownloadSettings | undefined;
      const defaultPath = itemSettings?.outputPath || settingsRef.current.outputPath || undefined;

      try {
        const folder = await open({
          directory: true,
          multiple: false,
          title: 'Select Download Folder',
          defaultPath,
        });

        if (typeof folder === 'string' && folder) {
          updateItemOutputPath(id, folder);
        }
      } catch (error) {
        console.error('Failed to select item folder:', error);
      }
    },
    [updateItemOutputPath],
  );

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
    itemsRef.current = [];
    setItems([]);
    setCurrentPlaylistInfo(null);
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((items) => {
      const nextItems = items.filter(
        (item) => item.status !== 'completed' && item.status !== 'skipped',
      );
      itemsRef.current = nextItems;
      return nextItems;
    });
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
              ? {
                  ...i,
                  status: 'downloading',
                  error: undefined,
                  errorCode: undefined,
                  retryState: undefined,
                }
              : i,
          ),
        );

        try {
          await invoke('download_video', {
            id: item.id,
            url: item.url,
            outputPath: itemSettings?.outputPath || settings.outputPath,
            quality: itemSettings?.quality ?? settings.quality,
            format: itemSettings?.format ?? settings.format,
            downloadPlaylist: itemSettings?.downloadPlaylist ?? false,
            playlistIndex: item.playlistIndex ?? null,
            playlistTotal: item.playlistTotal ?? null,
            numberPlaylistItems: itemSettings?.numberPlaylistItems ?? false,
            queueIndex: item.queueIndex ?? null,
            queueTotal: item.queueTotal ?? null,
            numberQueueItems: itemSettings?.numberQueueItems ?? false,
            splitEmbeddedChapters: itemSettings?.splitEmbeddedChapters ?? false,
            numberChapterFiles: itemSettings?.numberChapterFiles ?? true,
            autoOrganizeCollections: itemSettings?.autoOrganizeCollections ?? false,
            playlistCollectionName: itemSettings?.playlistCollectionName ?? null,
            videoCodec: itemSettings?.videoCodec ?? settings.videoCodec,
            preferredFps: itemSettings?.preferredFps ?? settings.preferredFps,
            audioBitrate: itemSettings?.audioBitrate ?? settings.audioBitrate,
            playlistLimit:
              itemSettings?.playlistLimit && itemSettings.playlistLimit > 0
                ? itemSettings.playlistLimit
                : null,
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
            liveFromStart: itemSettings?.liveFromStart ?? settings.liveFromStart,
            skipLive: itemSettings?.skipLive ?? false,
            // Speed limit settings
            speedLimit: settings.speedLimitEnabled
              ? `${settings.speedLimitValue}${settings.speedLimitUnit}`
              : null,
            // External downloader settings
            useAria2: itemSettings?.useAria2 ?? settings.useAria2,
            aria2Args: itemSettings?.aria2Args ?? settings.aria2Args,
            // yt-dlp advanced options
            ytdlpAdvancedOptionsEnabled:
              itemSettings?.ytdlpAdvancedOptionsEnabled ?? settings.ytdlpAdvancedOptionsEnabled,
            ytdlpAdvancedOptions:
              itemSettings?.ytdlpAdvancedOptions ?? settings.ytdlpAdvancedOptions,
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
          if (itemsRef.current.some((i) => i.id === item.id && i.status === 'completed')) {
            return;
          }

          const parsedError = extractBackendError(error);
          const errorMessage = localizeBackendError(parsedError);
          if (parsedError.code === 'DOWNLOAD_CANCELLED') {
            setItems((items) =>
              items.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: 'pending',
                      speed: '',
                      eta: '',
                      error: undefined,
                      errorCode: undefined,
                      retryState: undefined,
                    }
                  : i,
              ),
            );
            return;
          }

          if (parsedError.code === 'YT_SKIPPED_LIVE' || parsedError.code === 'YT_SKIPPED_FILTER') {
            setItems((items) =>
              items.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: 'skipped',
                      progress: 0,
                      error: errorMessage,
                      errorCode: parsedError.code,
                      retryState: undefined,
                    }
                  : i,
              ),
            );
            return;
          }
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
                  ? {
                      ...i,
                      status: 'error',
                      error: errorMessage,
                      errorCode: parsedError.code,
                      retryState: undefined,
                    }
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
                    errorCode: parsedError.code,
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

  const updatePreferredFps = useCallback((preferredFps: PreferredFps) => {
    setSettings((s) => {
      const newSettings = { ...s, preferredFps };
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

  const updateSkipLive = useCallback((skipLive: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, skipLive };
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
        | 'telegramEnabled'
        | 'telegramBotToken'
        | 'telegramAllowedChatIds'
        | 'telegramMessageThreadId'
        | 'telegramPlainUrlAction'
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
      void (async () => {
        const pluginWorkflowSnapshots = await refreshPluginWorkflowSnapshots();

        // Reset item status to pending and treat retry as a fresh workflow run.
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'pending',
                  progress: 0,
                  error: undefined,
                  errorCode: undefined,
                  retryState: undefined,
                  settings: item.settings
                    ? refreshItemPluginWorkflowSnapshots(item.settings, pluginWorkflowSnapshots)
                    : item.settings,
                }
              : item,
          ),
        );
        // Clear cookie error
        setCookieError(null);
        // Use a short delay to ensure state update before starting download
        setTimeout(() => {
          startDownload();
        }, 100);
      })();
    },
    [startDownload],
  );

  const value: DownloadContextType = useMemo(
    () => ({
      items,
      focusedItemId,
      isDownloading,
      isExpandingPlaylist,
      settings,
      cookieSettings,
      proxySettings,
      currentPlaylistInfo,
      duplicateReview,
      duplicateSkipNotice,
      addFromText,
      addSearchResultsToQueue,
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
      updatePreferredFps,
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
      updateSkipLive,
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
      resolveDuplicateReview,
      dismissDuplicateSkipNotice,
      filterDownloadedDuplicateCandidates,
      // Per-item time range
      updateItemTimeRange,
      selectItemOutputFolder,
      renameCompletedItem,
    }),
    [
      items,
      focusedItemId,
      isDownloading,
      isExpandingPlaylist,
      settings,
      cookieSettings,
      proxySettings,
      currentPlaylistInfo,
      duplicateReview,
      duplicateSkipNotice,
      addFromText,
      addSearchResultsToQueue,
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
      updatePreferredFps,
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
      updateSkipLive,
      updateSpeedLimit,
      updateUseAria2,
      updateAria2Args,
      updateAutoRetry,
      updateSponsorBlock,
      updateSponsorBlockMode,
      updateSponsorBlockCategory,
      updateTelegramSettings,
      refreshTelegramStatus,
      cookieError,
      clearCookieError,
      retryFailedDownload,
      resolveDuplicateReview,
      dismissDuplicateSkipNotice,
      filterDownloadedDuplicateCandidates,
      updateItemTimeRange,
      selectItemOutputFolder,
      renameCompletedItem,
    ],
  );

  return (
    <DownloadContext.Provider value={value}>
      {children}
      <AlertDialog
        open={Boolean(pendingOutputPathUpdate)}
        onOpenChange={(open) => {
          if (!open) setPendingOutputPathUpdate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('queueOutputPathUpdate.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('queueOutputPathUpdate.message', {
                count: pendingOutputPathUpdate?.itemIds.length ?? 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmQueuedOutputPathUpdate}>
              {t('queueOutputPathUpdate.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DownloadContext.Provider>
  );
}
