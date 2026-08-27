import { invoke } from '@tauri-apps/api/core';
import { downloadDir, homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePersistedDownloadQueue } from '@/hooks/usePersistedDownloadQueue';
import { extractBackendError, localizeBackendError } from '@/lib/backend-error';
import { createClientId } from '@/lib/client-id';
import { buildDownloadDuplicateIdentity } from '@/lib/download-duplicates';
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
import { useDownload } from './download-context';
import { classifyDownloadError } from './DownloadContext';
import { GalleryDlContext } from './gallerydl-context';

const STORAGE_KEY = 'youwee-gallerydl-settings';
const DOWNLOAD_QUEUE_IDLE_GRACE_MS = 1000;

export interface GalleryDlSettings {
  outputPath: string;
  concurrentDownloads: number;
  autoRetryEnabled: boolean;
  autoRetryMaxAttempts: number;
  autoRetryDelaySeconds: number;
  // Advanced gallery-dl options (round 4)
  range: string;
  filenameTemplate: string;
  flatOutput: boolean;
  cbzOutput: boolean;
  rateLimit: string;
  minFileSize: string;
  maxFileSize: string;
  sleep: string;
  retries: number;
  timeout: number;
}

interface GalleryDownloadResult {
  filepath: string;
  history_id?: string | null;
}

interface GalleryProbe {
  title?: string | null;
  thumbnail?: string | null;
  count?: number | null;
  category?: string | null;
  subcategory?: string | null;
  error?: string | null;
}

interface GalleryDownloadOptions {
  retries?: number;
  timeout?: number;
  range?: string;
  filename?: string;
  flatOutput?: boolean;
  cbz?: boolean;
  rateLimit?: string;
  filesizeMin?: string;
  filesizeMax?: string;
  sleep?: number;
}

export interface GalleryDlContextType {
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
  retryFailedDownload: (itemId: string) => void;
  toggleItemIncognito: (id: string) => void;
  pauseItem: (id: string) => void;
  resumeItem: (id: string) => void;
  cancelItem: (id: string) => void;
  duplicateItem: (id: string) => void;
  moveItemToTop: (id: string) => void;
  updateConcurrentDownloads: (concurrent: number) => void;
  updateSettings: (patch: Partial<GalleryDlSettings>) => void;
}

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

function buildGalleryOptions(settings: GalleryDlSettings): GalleryDownloadOptions {
  const sleep = Number(settings.sleep);
  return {
    retries: settings.retries > 0 ? settings.retries : undefined,
    timeout: settings.timeout > 0 ? settings.timeout : undefined,
    range: settings.range.trim() || undefined,
    filename: settings.filenameTemplate.trim() || undefined,
    flatOutput: settings.flatOutput || undefined,
    cbz: settings.cbzOutput || undefined,
    rateLimit: settings.rateLimit.trim() || undefined,
    filesizeMin: settings.minFileSize.trim() || undefined,
    filesizeMax: settings.maxFileSize.trim() || undefined,
    sleep: Number.isFinite(sleep) && sleep > 0 ? sleep : undefined,
  };
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
      range: saved.range ?? '',
      filenameTemplate: saved.filenameTemplate ?? '',
      flatOutput: saved.flatOutput === true,
      cbzOutput: saved.cbzOutput === true,
      rateLimit: saved.rateLimit ?? '',
      minFileSize: saved.minFileSize ?? '',
      maxFileSize: saved.maxFileSize ?? '',
      sleep: saved.sleep ?? '',
      retries: saved.retries ?? 8,
      timeout: saved.timeout ?? 60,
    };
  });

  const isDownloadingRef = useRef(false);
  const itemsRef = useRef<DownloadItem[]>([]);
const startDownloadRef = useRef<() => Promise<void>>(async () => {});
  const settingsRef = useRef<GalleryDlSettings>(settings);
  const focusClearTimerRef = useRef<number | null>(null);
  const { settings: downloadSettings, filterDownloadedDuplicateCandidates } = useDownload();

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

  const probeItems = useCallback(
    async (newItems: DownloadItem[]) => {
      const { cookieSettings, proxySettings } = loadNetworkSettings();
      const networkOptions = buildCookieProxyInvokeOptions(cookieSettings, proxySettings);
      for (const item of newItems) {
        try {
          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: 'fetching' as const }
                : entry,
            ),
          );
          const probe = await invoke<GalleryProbe>('probe_gallery', {
            url: item.url,
            ...networkOptions,
          });
          setItems((current) =>
            current.map((entry) => {
              if (entry.id !== item.id) return entry;
              const next: DownloadItem = { ...entry, status: 'pending' as const };
              if (probe.thumbnail) next.thumbnail = probe.thumbnail;
              if (probe.title) next.title = probe.title;
              if (probe.count) next.fileCount = probe.count;
              if (probe.error) console.warn('gallery probe:', probe.error);
              return next;
            }),
          );
        } catch (invokeError) {
          console.error('Failed to probe gallery URL:', invokeError);
          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: 'pending' as const }
                : entry,
            ),
          );
        }
      }
    },
    [],
  );

  const addFromText = useCallback(
    async (text: string): Promise<number> => {
      const urls = parseUniversalUrls(text);
      if (urls.length === 0) return 0;

      const currentItems = itemsRef.current;
      const candidates = urls
        .filter((url) => !currentItems.some((item) => item.url === url))
        .map((url) => ({
          url,
          title: buildItemTitle(url),
          thumbnail: undefined,
          duplicateIdentity: buildDownloadDuplicateIdentity(url),
        }));
      const filteredCandidates = await filterDownloadedDuplicateCandidates(candidates);
      const currentItemsAfterReview = itemsRef.current;
      const enqueueCandidates = filteredCandidates.filter(
        (candidate) => !currentItemsAfterReview.some((item) => item.url === candidate.url),
      );
      const newItems: DownloadItem[] = enqueueCandidates.map((candidate) => ({
        id: createClientId(),
        url: candidate.url,
        title: candidate.title,
        status: 'pending' as const,
        progress: 0,
        speed: '',
        eta: '',
        extractor: buildExtractor(candidate.url),
      }));

      if (newItems.length > 0) {
        setItems((prev) => {
          const nextItems = [...prev, ...newItems];
          itemsRef.current = nextItems;
          return nextItems;
        });
        focusItem(newItems[newItems.length - 1].id);
        void probeItems(newItems);
      }

      return newItems.length;
    },
    [filterDownloadedDuplicateCandidates, focusItem, probeItems],
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

  const updateSettings = useCallback((patch: Partial<GalleryDlSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // P0-5: per-item incognito flag (backend history gate is a mainline follow-up).
  const toggleItemIncognito = useCallback((id: string) => {
    setItems((current) => {
      const nextItems = current.map((item) =>
        item.id === id ? { ...item, incognito: !item.incognito } : item,
      );
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  // P0-7: pause (queued/failed items only; active items are soft-cancelled instead).
  const pauseItem = useCallback((id: string) => {
    setItems((current) => {
      const nextItems = current.map((item) =>
        item.id === id && (item.status === 'pending' || item.status === 'error')
          ? { ...item, status: 'paused' as const, retryState: undefined }
          : item,
      );
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  // P0-7: resume a paused item; running workers pick it up automatically.
  const resumeItem = useCallback((id: string) => {
    setItems((current) => {
      const nextItems = current.map((item) =>
        item.id === id && item.status === 'paused'
          ? { ...item, status: 'pending' as const }
          : item,
      );
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  // P0-7: cancel = soft detach (marks item skipped and ignores late backend events)
  // + real per-item process cancellation for active downloads via the id-keyed
  // backend registry (cancel_download_item).
  const cancelItem = useCallback((id: string) => {
    const current = itemsRef.current.find((item) => item.id === id);
    if (current && (current.status === 'downloading' || current.status === 'fetching')) {
      void invoke('cancel_download_item', { id }).catch((error) => {
        console.error('Failed to cancel download item:', error);
      });
    }
    setItems((current) => {
      const nextItems = current.map((item) =>
        item.id === id && item.status !== 'completed' && item.status !== 'skipped'
          ? {
              ...item,
              status: 'skipped' as const,
              progress: 0,
              speed: '',
              eta: '',
              error: undefined,
              errorCode: undefined,
              errorClass: undefined,
              retryState: undefined,
            }
          : item,
      );
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  // P0-7: clone an item with a fresh id, reset to pending.
  const duplicateItem = useCallback((id: string) => {
    const source = itemsRef.current.find((item) => item.id === id);
    if (!source) return;
    const copy: DownloadItem = {
      ...source,
      id: createClientId(),
      status: 'pending' as const,
      progress: 0,
      speed: '',
      eta: '',
      error: undefined,
      errorCode: undefined,
      errorClass: undefined,
      retryState: undefined,
      completedFilepath: undefined,
      completedHistoryId: undefined,
      completedFilesize: undefined,
      completedResolution: undefined,
      completedFormat: undefined,
    };
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextItems = [...current];
      nextItems.splice(index < 0 ? nextItems.length : index + 1, 0, copy);
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  // P0-7: move an item to the front of the queue (claim order = array order).
  const moveItemToTop = useCallback((id: string) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      if (index <= 0) return current;
      const nextItems = [...current];
      const [moved] = nextItems.splice(index, 1);
      nextItems.unshift(moved);
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  // P0-7: retry a failed download (reset item and restart the queue).
  const retryFailedDownload = useCallback(
    (itemId: string) => {
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                status: 'pending',
                progress: 0,
                error: undefined,
                errorCode: undefined,
                errorClass: undefined,
                retryState: undefined,
              }
            : item,
        ),
      );
      // Use a short delay to ensure state update before starting download.
      setTimeout(() => {
        void startDownloadRef.current();
      }, 100);
    },
    [],
  );

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
            thumbnail: item.thumbnail || null,
            // Incognito (P0-5): backend should skip history/log URL writes for this item
            incognito: item.incognito === true,
            options: buildGalleryOptions(settingsRef.current),
          });

          setItems((current) =>
            current.map((entry) =>
              entry.id === item.id
                ? entry.status === 'paused' || entry.status === 'skipped'
                  ? entry
                  : {
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
          if (
            itemsRef.current.some(
              (entry) =>
                entry.id === item.id &&
                (entry.status === 'paused' || entry.status === 'skipped'),
            )
          ) {
            return;
          }
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
                  ? {
                      ...entry,
                      status: 'error',
                      error: errorMessage,
                      errorClass: classifyDownloadError(parsedError.message, parsedError.code),
                      retryState: undefined,
                    }
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
                    errorClass: classifyDownloadError(parsedError.message, parsedError.code),
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
  startDownloadRef.current = startDownload;

  const value: GalleryDlContextType = useMemo(
    () => ({
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
      retryFailedDownload,
      toggleItemIncognito,
      pauseItem,
      resumeItem,
      cancelItem,
      duplicateItem,
      moveItemToTop,
      updateConcurrentDownloads,
      updateSettings,
    }),
    [
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
      retryFailedDownload,
      toggleItemIncognito,
      pauseItem,
      resumeItem,
      cancelItem,
      duplicateItem,
      moveItemToTop,
      updateConcurrentDownloads,
      updateSettings,
    ],
  );

  return <GalleryDlContext.Provider value={value}>{children}</GalleryDlContext.Provider>;
}
