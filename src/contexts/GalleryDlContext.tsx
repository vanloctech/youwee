import { invoke } from '@tauri-apps/api/core';
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
import { extractBackendError, localizeBackendError } from '@/lib/backend-error';
import {
  AUTO_RETRY_LIMITS,
  clampAutoRetryDelaySeconds,
  clampAutoRetryMaxAttempts,
  isNonRetryableError,
  isRetryableError,
  waitWithCancellation,
} from '@/lib/download-retry';
import { buildCookieProxyInvokeOptions, loadNetworkSettings } from '@/lib/network-config';
import { parseUniversalUrls } from '@/lib/sources';
import type { DownloadItem } from '@/lib/types';
import { useDownload } from './DownloadContext';

const STORAGE_KEY = 'youwee-gallerydl-settings';
const DOWNLOAD_QUEUE_IDLE_GRACE_MS = 1000;

interface GalleryDlSettings {
  outputPath: string;
  concurrentDownloads: number;
  autoRetryEnabled: boolean;
  autoRetryMaxAttempts: number;
  autoRetryDelaySeconds: number;
}

interface GalleryDownloadResult {
  filepath: string;
  history_id?: string | null;
}

interface GalleryDlContextType {
  items: DownloadItem[];
  focusedItemId: string | null;
  isDownloading: boolean;
  settings: GalleryDlSettings;
  error: string | null;
  addFromText: (text: string) => Promise<number>;
  importFromFile: () => Promise<number>;
  importFromClipboard: () => Promise<number>;
  selectOutputFolder: () => Promise<void>;
  removeItem: (id: string) => void;
  clearAll: () => void;
  clearCompleted: () => void;
  startDownload: () => Promise<void>;
  stopDownload: () => Promise<void>;
  updateConcurrentDownloads: (concurrent: number) => void;
}

const GalleryDlContext = createContext<GalleryDlContextType | null>(null);

function isAbsolutePath(path: string): boolean {
  if (!path) return false;
  if (path.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return false;
}

function loadSavedSettings(): Partial<GalleryDlSettings> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to load gallery-dl settings:', error);
  }
  return {};
}

function saveSettings(settings: GalleryDlSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save gallery-dl settings:', error);
  }
}

function buildItemTitle(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname;
    return `${host}${path}` || url;
  } catch {
    return url;
  }
}

function buildExtractor(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

export function GalleryDlProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<GalleryDlSettings>(() => {
    const saved = loadSavedSettings();
    return {
      outputPath: saved.outputPath || '',
      concurrentDownloads: saved.concurrentDownloads || 1,
      autoRetryEnabled: saved.autoRetryEnabled === true,
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
  const settingsRef = useRef<GalleryDlSettings>(settings);
  const focusClearTimerRef = useRef<number | null>(null);
  const { settings: downloadSettings } = useDownload();

  usePersistedDownloadQueue({
    queueKind: 'gallery',
    enabled: downloadSettings.persistDownloadQueue,
    items,
    setItems,
    logLabel: 'gallery queue',
  });

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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

  useEffect(() => {
    const getDefaultPath = async () => {
      if (settings.outputPath) return;

      try {
        let path = await downloadDir();
        if (!isAbsolutePath(path)) {
          const home = await homeDir();
          if (home) path = `${home}Downloads`;
        }
        if (isAbsolutePath(path)) {
          setSettings((current) => {
            const next = { ...current, outputPath: path };
            saveSettings(next);
            return next;
          });
        }
      } catch (error) {
        console.error('Failed to get default gallery output path:', error);
      }
    };

    void getDefaultPath();
  }, [settings.outputPath]);

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

  const addFromText = useCallback(
    async (text: string): Promise<number> => {
      const urls = parseUniversalUrls(text);
      if (urls.length === 0) return 0;

      const currentItems = itemsRef.current;
      const newItems: DownloadItem[] = urls
        .filter((url) => !currentItems.some((item) => item.url === url))
        .map((url) => ({
          id: crypto.randomUUID(),
          url,
          title: buildItemTitle(url),
          status: 'pending' as const,
          progress: 0,
          speed: '',
          eta: '',
          extractor: buildExtractor(url),
        }));

      if (newItems.length > 0) {
        setItems((prev) => [...prev, ...newItems]);
        focusItem(newItems[newItems.length - 1].id);
      }

      return newItems.length;
    },
    [focusItem],
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
      console.error('Failed to import gallery URLs:', error);
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
        setSettings((current) => {
          const next = { ...current, outputPath: folder as string };
          saveSettings(next);
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  }, [settings.outputPath]);

  const removeItem = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((current) => current.filter((item) => item.status !== 'completed'));
  }, []);

  const stopDownload = useCallback(async () => {
    try {
      await invoke('stop_gallery_download');
    } catch (invokeError) {
      console.error('Failed to stop gallery-dl:', invokeError);
    }
    setItems((current) => current.map((item) => ({ ...item, retryState: undefined })));
    setIsDownloading(false);
    isDownloadingRef.current = false;
  }, []);

  const updateConcurrentDownloads = useCallback((concurrentDownloads: number) => {
    const value = Math.max(1, Math.min(5, concurrentDownloads));
    setSettings((current) => {
      const next = { ...current, concurrentDownloads: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const startDownload = useCallback(async () => {
    const hasPendingItems = () =>
      itemsRef.current.some((item) => item.status === 'pending' || item.status === 'error');

    if (!hasPendingItems()) return;

    setError(null);
    setIsDownloading(true);
    isDownloadingRef.current = true;

    setItems((current) =>
      current.map((item) =>
        item.status === 'pending' || item.status === 'error'
          ? {
              ...item,
              status: 'pending' as const,
              progress: 0,
              speed: '',
              eta: '',
              error: undefined,
              retryState: undefined,
            }
          : item,
      ),
    );

    const concurrentLimit = Math.max(1, settings.concurrentDownloads || 1);

    const downloadItem = async (item: DownloadItem) => {
      if (!isDownloadingRef.current) return;

      const { cookieSettings, proxySettings } = loadNetworkSettings();
      const networkOptions = buildCookieProxyInvokeOptions(cookieSettings, proxySettings);
      const logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
      let retryIndex = 0;

      while (isDownloadingRef.current) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: 'downloading', error: undefined, retryState: undefined }
              : entry,
          ),
        );

        try {
          const result = await invoke<GalleryDownloadResult>('download_gallery', {
            url: item.url,
            outputPath: settingsRef.current.outputPath,
            logStderr,
            ...networkOptions,
            source: item.extractor || null,
          });

          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'completed',
                    progress: 100,
                    completedFilepath: result.filepath,
                    completedHistoryId: result.history_id ?? undefined,
                    retryState: undefined,
                  }
                : entry,
            ),
          );
          return;
        } catch (invokeError) {
          const parsedError = extractBackendError(invokeError);
          const errorMessage = localizeBackendError(parsedError);
          setError(errorMessage);

          const canRetry =
            isDownloadingRef.current &&
            settingsRef.current.autoRetryEnabled &&
            retryIndex < settingsRef.current.autoRetryMaxAttempts &&
            !isNonRetryableError(parsedError.message, parsedError.code) &&
            isRetryableError(parsedError.message, parsedError.code, parsedError.retryable);

          if (!canRetry) {
            setItems((current) =>
              current.map((entry) =>
                entry.id === item.id
                  ? { ...entry, status: 'error', error: errorMessage, retryState: undefined }
                  : entry,
              ),
            );
            return;
          }

          retryIndex += 1;
          const retryDelaySeconds = settingsRef.current.autoRetryDelaySeconds;
          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? {
                    ...entry,
                    status: 'pending',
                    error: errorMessage,
                    retryState: {
                      retryIndex,
                      maxRetries: settingsRef.current.autoRetryMaxAttempts,
                      delaySeconds: retryDelaySeconds,
                      remainingSeconds: retryDelaySeconds,
                    },
                  }
                : entry,
            ),
          );

          const shouldContinue = await waitWithCancellation(
            retryDelaySeconds * 1000,
            () => !isDownloadingRef.current,
            (remainingSeconds) => {
              setItems((current) =>
                current.map((entry) =>
                  entry.id === item.id && entry.retryState
                    ? {
                        ...entry,
                        retryState: {
                          ...entry.retryState,
                          remainingSeconds,
                        },
                      }
                    : entry,
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
  }, [settings.concurrentDownloads]);

  const value: GalleryDlContextType = {
    items,
    focusedItemId,
    isDownloading,
    settings,
    error,
    addFromText,
    importFromFile,
    importFromClipboard,
    selectOutputFolder,
    removeItem,
    clearAll,
    clearCompleted,
    startDownload,
    stopDownload,
    updateConcurrentDownloads,
  };

  return <GalleryDlContext.Provider value={value}>{children}</GalleryDlContext.Provider>;
}

export function useGalleryDl() {
  const context = useContext(GalleryDlContext);
  if (!context) {
    throw new Error('useGalleryDl must be used within a GalleryDlProvider');
  }
  return context;
}
