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
  loadCookieSettings,
  loadProxySettings,
} from '@/lib/network-config';
import {
  enqueuePluginWorkflowTrigger,
  loadPluginWorkflowSnapshots,
  loadPostDownloadWorkflowSteps,
  refreshPostDownloadWorkflowSteps,
} from '@/lib/post-download-plugins';
import { parseUniversalUrls } from '@/lib/sources';
import type {
  AudioBitrate,
  DownloadItem,
  DownloadProgress,
  ExternalEnqueueOptions,
  ExternalEnqueueResult,
  Format,
  ItemUniversalSettings,
  PostDownloadPluginPayload,
  Quality,
  VideoInfoResponse,
} from '@/lib/types';
import { useDownload } from './DownloadContext';

const STORAGE_KEY = 'youwee-universal-settings';
const DOWNLOAD_STORAGE_KEY = 'youwee-settings';
const DOWNLOAD_QUEUE_IDLE_GRACE_MS = 1000;

// Format duration in seconds to HH:MM:SS or MM:SS
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Check if path is absolute (cross-platform)
const isAbsolutePath = (path: string): boolean => {
  if (!path) return false;
  if (path.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return false;
};

// Simplified settings for Universal downloads (no codec, subtitles, playlist)
export interface UniversalSettings {
  quality: Quality;
  format: Format;
  outputPath: string;
  audioBitrate: AudioBitrate;
  concurrentDownloads: number;
  // Live stream settings
  liveFromStart: boolean;
  // Speed limit settings
  speedLimitEnabled: boolean;
  speedLimitValue: number;
  speedLimitUnit: 'K' | 'M' | 'G';
  // Auto retry settings
  autoRetryEnabled: boolean;
  autoRetryMaxAttempts: number;
  autoRetryDelaySeconds: number;
}

// Load settings from localStorage
function loadSavedSettings(): Partial<UniversalSettings> {
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

// Load embed settings from main download settings
function loadEmbedSettings(): { embedMetadata: boolean; embedThumbnail: boolean } {
  try {
    const saved = localStorage.getItem(DOWNLOAD_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        embedMetadata: parsed.embedMetadata !== false, // Default true
        embedThumbnail: parsed.embedThumbnail === true, // Default false (requires FFmpeg)
      };
    }
  } catch (e) {
    console.error('Failed to load embed settings:', e);
  }
  return { embedMetadata: true, embedThumbnail: false };
}

// Load SponsorBlock settings from main download settings
function loadSponsorBlockArgs(): { remove: string | null; mark: string | null } {
  try {
    const saved = localStorage.getItem(DOWNLOAD_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.sponsorBlock) return { remove: null, mark: null };

      if (parsed.sponsorBlockMode === 'remove') return { remove: 'all', mark: null };
      if (parsed.sponsorBlockMode === 'mark') return { remove: null, mark: 'all' };

      // Custom mode
      const cats = parsed.sponsorBlockCategories || {};
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
  } catch (e) {
    console.error('Failed to load sponsorblock settings:', e);
  }
  return { remove: null, mark: null };
}

function loadAria2Settings(): { useAria2: boolean; aria2Args: string } {
  try {
    const saved = localStorage.getItem(DOWNLOAD_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        useAria2: parsed.useAria2 === true,
        aria2Args: typeof parsed.aria2Args === 'string' ? parsed.aria2Args : '',
      };
    }
  } catch (e) {
    console.error('Failed to load aria2 settings:', e);
  }
  return { useAria2: false, aria2Args: '' };
}

// Save settings to localStorage
function saveSettings(settings: UniversalSettings) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        outputPath: settings.outputPath,
        quality: settings.quality,
        format: settings.format,
        audioBitrate: settings.audioBitrate,
        concurrentDownloads: settings.concurrentDownloads,
        liveFromStart: settings.liveFromStart,
        speedLimitEnabled: settings.speedLimitEnabled,
        speedLimitValue: settings.speedLimitValue,
        speedLimitUnit: settings.speedLimitUnit,
        autoRetryEnabled: settings.autoRetryEnabled,
        autoRetryMaxAttempts: settings.autoRetryMaxAttempts,
        autoRetryDelaySeconds: settings.autoRetryDelaySeconds,
      }),
    );
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

interface UniversalContextType {
  items: DownloadItem[];
  focusedItemId: string | null;
  isDownloading: boolean;
  settings: UniversalSettings;
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
  updateQuality: (quality: Quality) => void;
  updateFormat: (format: Format) => void;
  updateAudioBitrate: (bitrate: AudioBitrate) => void;
  updateConcurrentDownloads: (concurrent: number) => void;
  updateLiveFromStart: (enabled: boolean) => void;
  updateAutoRetry: (enabled: boolean, maxAttempts: number, delaySeconds: number) => void;
  // Cookie error detection
  cookieError: { show: boolean; itemId?: string; kind: 'db_locked' | 'fresh_cookies' } | null;
  clearCookieError: () => void;
  retryFailedDownload: (itemId: string) => void;
  // Per-item time range
  updateItemTimeRange: (id: string, start?: string, end?: string) => void;
  // Rename completed file
  renameCompletedItem: (id: string, newName: string) => Promise<void>;
}

const UniversalContext = createContext<UniversalContextType | null>(null);

interface RenameDownloadedFileResult {
  newFilepath: string;
  newTitle: string;
}

export function UniversalProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [cookieError, setCookieError] = useState<{
    show: boolean;
    itemId?: string;
    kind: 'db_locked' | 'fresh_cookies';
  } | null>(null);

  // Load saved settings on init
  const [settings, setSettings] = useState<UniversalSettings>(() => {
    const saved = loadSavedSettings();
    return {
      quality: saved.quality || 'best',
      format: saved.format || 'mp4',
      outputPath: saved.outputPath || '',
      audioBitrate: saved.audioBitrate || 'auto',
      concurrentDownloads: saved.concurrentDownloads || 1,
      // Live stream settings
      liveFromStart: saved.liveFromStart === true, // Default to false
      // Speed limit settings
      speedLimitEnabled: saved.speedLimitEnabled === true, // Default to false (unlimited)
      speedLimitValue: saved.speedLimitValue || 10,
      speedLimitUnit: saved.speedLimitUnit || 'M',
      // Auto retry settings
      autoRetryEnabled: saved.autoRetryEnabled === true, // Default to false
      autoRetryMaxAttempts: clampAutoRetryMaxAttempts(
        saved.autoRetryMaxAttempts || AUTO_RETRY_LIMITS.maxAttempts.default,
      ),
      autoRetryDelaySeconds: clampAutoRetryDelaySeconds(
        saved.autoRetryDelaySeconds || AUTO_RETRY_LIMITS.delaySeconds.default,
      ),
    };
  });

  const isDownloadingRef = useRef(false);
  const itemsRef = useRef<DownloadItem[]>([]);
  const settingsRef = useRef<UniversalSettings>(settings);
  const focusClearTimerRef = useRef<number | null>(null);
  const { settings: downloadSettings } = useDownload();

  usePersistedDownloadQueue({
    queueKind: 'universal',
    enabled: downloadSettings.persistDownloadQueue,
    items,
    setItems,
    logLabel: 'universal queue',
  });

  // Keep itemsRef in sync with items state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Keep settingsRef in sync with settings state
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    refreshPostDownloadWorkflowSteps();
  }, []);

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

  // Listen for progress updates - use unique event for universal downloads
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      const progress = event.payload;

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

  // Fetch metadata for items in background (fire-and-forget)
  const fetchMetadataForItems = useCallback((items: DownloadItem[]) => {
    const cookieSettings = loadCookieSettings();
    const proxySettings = loadProxySettings();
    const networkOptions = buildCookieProxyInvokeOptions(cookieSettings, proxySettings);

    for (const item of items) {
      invoke<VideoInfoResponse>('get_video_info', {
        url: item.url,
        ...networkOptions,
      })
        .then((response) => {
          const info = response.info;
          const thumb = info.thumbnail?.replace(/^http:\/\//, 'https://') || null;
          setItems((current) =>
            current.map((i) =>
              i.id === item.id
                ? {
                    ...i,
                    thumbnail: thumb || i.thumbnail,
                    title: info.title || i.title,
                    duration: info.duration ? formatDuration(info.duration) : i.duration,
                    extractor: info.extractor || i.extractor,
                    channel: info.channel || i.channel,
                  }
                : i,
            ),
          );
        })
        .catch(() => {
          // Mark extractor so isFetchingMeta becomes false and item exits loading state
          setItems((current) =>
            current.map((i) => (i.id === item.id ? { ...i, extractor: 'direct' } : i)),
          );
        });
    }
  }, []);

  const enqueueQueuedWorkflowForItems = useCallback((queuedItems: DownloadItem[]) => {
    for (const item of queuedItems) {
      const itemSettings = item.settings as ItemUniversalSettings | undefined;
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
        downloadKind: 'universal',
        workflowRunId: null,
        workflowStepIndex: null,
        workflowStepPluginId: null,
        chainState: null,
      };
      void enqueuePluginWorkflowTrigger('download.queued', payload, workflowSnapshots).catch(
        (error) => {
          console.error('Failed to enqueue universal download.queued workflow:', error);
        },
      );
    }
  }, []);

  const enqueueFailedWorkflowForItem = useCallback(
    (item: DownloadItem, itemSettings: ItemUniversalSettings | undefined) => {
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
        downloadKind: 'universal',
        workflowRunId: null,
        workflowStepIndex: null,
        workflowStepPluginId: null,
        chainState: null,
      };
      void enqueuePluginWorkflowTrigger('download.failed', payload, workflowSnapshots).catch(
        (error) => {
          console.error('Failed to enqueue universal download.failed workflow:', error);
        },
      );
    },
    [settings.format, settings.outputPath, settings.quality],
  );

  const addFromText = useCallback(
    async (text: string): Promise<number> => {
      const urls = parseUniversalUrls(text);
      if (urls.length === 0) return 0;

      const currentItems = itemsRef.current;
      const currentSettings = settingsRef.current;
      const aria2Settings = loadAria2Settings();
      const workflowSnapshots = loadPluginWorkflowSnapshots();

      // Snapshot current settings for these items
      const settingsSnapshot: ItemUniversalSettings = {
        quality: currentSettings.quality,
        format: currentSettings.format,
        outputPath: currentSettings.outputPath,
        audioBitrate: currentSettings.audioBitrate,
        useAria2: aria2Settings.useAria2,
        aria2Args: aria2Settings.aria2Args,
        pluginWorkflowSnapshots: workflowSnapshots,
        postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
        autoRetryEnabled: currentSettings.autoRetryEnabled,
        autoRetryMaxAttempts: currentSettings.autoRetryMaxAttempts,
        autoRetryDelaySeconds: currentSettings.autoRetryDelaySeconds,
      };

      const newItems: DownloadItem[] = urls
        .filter((url) => !currentItems.some((item) => item.url === url))
        .map((url) => ({
          id: crypto.randomUUID(),
          url,
          title: url,
          status: 'pending' as const,
          progress: 0,
          speed: '',
          eta: '',
          // Store settings snapshot
          settings: settingsSnapshot,
        }));

      if (newItems.length > 0) {
        setItems((prev) => [...prev, ...newItems]);
        // Fetch metadata (thumbnail, title, duration) in background
        fetchMetadataForItems(newItems);
        enqueueQueuedWorkflowForItems(newItems);
      }

      return newItems.length;
    },
    [enqueueQueuedWorkflowForItems, fetchMetadataForItems],
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
      const mediaType = options?.mediaType === 'audio' ? 'audio' : 'video';
      const videoQuality =
        options?.quality && options.quality !== 'audio' ? options.quality : 'best';
      const audioBitrate = options?.audioBitrate === '128' ? '128' : 'auto';
      const aria2Settings = loadAria2Settings();
      const workflowSnapshots = loadPluginWorkflowSnapshots();

      const settingsSnapshot: ItemUniversalSettings = {
        quality: mediaType === 'audio' ? 'audio' : videoQuality,
        format: mediaType === 'audio' ? 'mp3' : 'mp4',
        outputPath: currentSettings.outputPath,
        audioBitrate: mediaType === 'audio' ? audioBitrate : currentSettings.audioBitrate,
        useAria2: aria2Settings.useAria2,
        aria2Args: aria2Settings.aria2Args,
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
        settings: settingsSnapshot,
      };

      const nextItems = [...itemsRef.current, newItem];
      itemsRef.current = nextItems;
      setItems(nextItems);
      fetchMetadataForItems([newItem]);
      focusItem(newItem.id);
      enqueueQueuedWorkflowForItems([newItem]);
      return { added: true, itemId: newItem.id };
    },
    [enqueueQueuedWorkflowForItems, fetchMetadataForItems, focusItem],
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
        const settings = item.settings as ItemUniversalSettings;
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

    // Reset pending/error items
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
          };
        }
        return item;
      }),
    );

    const concurrentLimit = Math.max(1, settings.concurrentDownloads || 1);

    const downloadItem = async (item: DownloadItem) => {
      if (!isDownloadingRef.current) return;

      // Use item's saved settings (snapshot from when it was added)
      // Fallback to current global settings if not available
      const itemSettings = item.settings as ItemUniversalSettings | undefined;
      const logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
      const cookieSettings = loadCookieSettings();
      const proxySettings = loadProxySettings();
      const networkOptions = buildCookieProxyInvokeOptions(cookieSettings, proxySettings);
      const embedSettings = loadEmbedSettings();
      const sponsorBlockArgs = loadSponsorBlockArgs();
      const aria2Settings = loadAria2Settings();

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
            downloadPlaylist: false,
            videoCodec: 'auto', // Use auto for universal downloads
            audioBitrate: itemSettings?.audioBitrate ?? settings.audioBitrate,
            playlistLimit: null,
            subtitleMode: 'off',
            subtitleLangs: '',
            subtitleEmbed: false,
            subtitleFormat: 'srt',
            // Logging settings
            logStderr,
            // Cookie settings
            ...networkOptions,
            // Post-processing settings (from main download settings)
            embedMetadata: embedSettings.embedMetadata,
            embedThumbnail: embedSettings.embedThumbnail,
            // Live stream settings
            liveFromStart: settings.liveFromStart,
            // Speed limit settings
            speedLimit: settings.speedLimitEnabled
              ? `${settings.speedLimitValue}${settings.speedLimitUnit}`
              : null,
            // External downloader settings (from item snapshot, fallback to global settings)
            useAria2: itemSettings?.useAria2 ?? aria2Settings.useAria2,
            aria2Args: itemSettings?.aria2Args ?? aria2Settings.aria2Args,
            // SponsorBlock settings
            sponsorblockRemove: sponsorBlockArgs.remove,
            sponsorblockMark: sponsorBlockArgs.mark,
            // Download sections (time range)
            downloadSections:
              itemSettings?.timeRangeStart && itemSettings?.timeRangeEnd
                ? `*${itemSettings.timeRangeStart}-${itemSettings.timeRangeEnd}`
                : null,
            // Title from video info fetch
            title: item.title || null,
            // Thumbnail from video info fetch (for non-YouTube sites)
            thumbnail: item.thumbnail || null,
            // Source/extractor from video info fetch (e.g. "BiliBili", "TikTok")
            source: item.extractor || null,
            pluginWorkflowSnapshots:
              itemSettings?.pluginWorkflowSnapshots ?? loadPluginWorkflowSnapshots(),
            postDownloadWorkflowSteps:
              itemSettings?.postDownloadWorkflowSteps ?? loadPostDownloadWorkflowSteps(),
            emitFailedWorkflow: false,
            downloadKind: 'universal',
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
    }
  }, [enqueueFailedWorkflowForItem, settings]);

  const stopDownload = useCallback(async () => {
    try {
      await invoke('stop_download');
    } catch (error) {
      console.error('Failed to stop download:', error);
    }
    setItems((items) => items.map((item) => ({ ...item, retryState: undefined })));
    setIsDownloading(false);
    isDownloadingRef.current = false;
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

  const updateLiveFromStart = useCallback((liveFromStart: boolean) => {
    setSettings((s) => {
      const newSettings = { ...s, liveFromStart };
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

  const value: UniversalContextType = {
    items,
    focusedItemId,
    isDownloading,
    settings,
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
    updateQuality,
    updateFormat,
    updateAudioBitrate,
    updateConcurrentDownloads,
    updateLiveFromStart,
    updateAutoRetry,
    // Cookie error detection
    cookieError,
    clearCookieError,
    retryFailedDownload,
    // Per-item time range
    updateItemTimeRange,
    renameCompletedItem,
  };

  return <UniversalContext.Provider value={value}>{children}</UniversalContext.Provider>;
}

export function useUniversal() {
  const context = useContext(UniversalContext);
  if (!context) {
    throw new Error('useUniversal must be used within a UniversalProvider');
  }
  return context;
}
