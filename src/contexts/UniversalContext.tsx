import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { downloadDir } from '@tauri-apps/api/path';
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
import { parseUniversalUrls } from '@/lib/sources';
import type {
  AudioBitrate,
  CookieSettings,
  DownloadItem,
  DownloadProgress,
  Format,
  ItemUniversalSettings,
  Quality,
} from '@/lib/types';

const STORAGE_KEY = 'youwee-universal-settings';
const COOKIE_STORAGE_KEY = 'youwee-cookie-settings';
const DOWNLOAD_STORAGE_KEY = 'youwee-settings';

// Simplified settings for Universal downloads (no codec, subtitles, playlist)
export interface UniversalSettings {
  quality: Quality;
  format: Format;
  outputPath: string;
  audioBitrate: AudioBitrate;
  concurrentDownloads: number;
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

// Load cookie settings from localStorage (shared with DownloadContext)
function loadCookieSettings(): CookieSettings {
  try {
    const saved = localStorage.getItem(COOKIE_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load cookie settings:', e);
  }
  return { mode: 'off' };
}

// Load embed settings from main download settings
function loadEmbedSettings(): { embedMetadata: boolean; embedThumbnail: boolean } {
  try {
    const saved = localStorage.getItem(DOWNLOAD_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        embedMetadata: parsed.embedMetadata !== false, // Default true
        embedThumbnail: parsed.embedThumbnail !== false, // Default true
      };
    }
  } catch (e) {
    console.error('Failed to load embed settings:', e);
  }
  return { embedMetadata: true, embedThumbnail: true };
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
      }),
    );
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

interface UniversalContextType {
  items: DownloadItem[];
  isDownloading: boolean;
  settings: UniversalSettings;
  addFromText: (text: string) => Promise<number>;
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
}

const UniversalContext = createContext<UniversalContextType | null>(null);

export function UniversalProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);

  // Load saved settings on init
  const [settings, setSettings] = useState<UniversalSettings>(() => {
    const saved = loadSavedSettings();
    return {
      quality: saved.quality || 'best',
      format: saved.format || 'mp4',
      outputPath: saved.outputPath || '',
      audioBitrate: saved.audioBitrate || 'auto',
      concurrentDownloads: saved.concurrentDownloads || 1,
    };
  });

  const isDownloadingRef = useRef(false);
  const itemsRef = useRef<DownloadItem[]>([]);

  // Keep itemsRef in sync with items state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Get default download path on mount (only if not saved)
  useEffect(() => {
    const getDefaultPath = async () => {
      if (settings.outputPath) return;

      try {
        const path = await downloadDir();
        setSettings((s) => {
          const newSettings = { ...s, outputPath: path };
          saveSettings(newSettings);
          return newSettings;
        });
      } catch (error) {
        console.error('Failed to get download directory:', error);
      }
    };
    getDefaultPath();
  }, [settings.outputPath]);

  // Listen for progress updates - use unique event for universal downloads
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      const progress = event.payload;

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
                // Store completed info when finished
                ...(progress.status === 'finished'
                  ? {
                      completedFilesize: progress.filesize,
                      completedResolution: progress.resolution,
                      completedFormat: progress.format_ext,
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

  const addFromText = useCallback(
    async (text: string): Promise<number> => {
      const urls = parseUniversalUrls(text);
      if (urls.length === 0) return 0;

      const currentItems = itemsRef.current;

      // Snapshot current settings for these items
      const settingsSnapshot: ItemUniversalSettings = {
        quality: settings.quality,
        format: settings.format,
        outputPath: settings.outputPath,
        audioBitrate: settings.audioBitrate,
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
      }

      return newItems.length;
    },
    [settings],
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

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((items) => items.filter((item) => item.status !== 'completed'));
  }, []);

  const startDownload = useCallback(async () => {
    const currentItems = itemsRef.current;
    const itemsToDownload = currentItems.filter(
      (item) => item.status === 'pending' || item.status === 'error',
    );

    if (itemsToDownload.length === 0) return;

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
          };
        }
        return item;
      }),
    );

    const concurrentLimit = settings.concurrentDownloads || 1;

    const downloadItem = async (item: DownloadItem) => {
      if (!isDownloadingRef.current) return;

      setItems((items) =>
        items.map((i) => (i.id === item.id ? { ...i, status: 'downloading' } : i)),
      );

      try {
        // Use item's saved settings (snapshot from when it was added)
        // Fallback to current global settings if not available
        const itemSettings = item.settings as ItemUniversalSettings | undefined;
        const logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
        const cookieSettings = loadCookieSettings();
        const embedSettings = loadEmbedSettings();

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
          cookieMode: cookieSettings.mode,
          cookieBrowser: cookieSettings.browser || null,
          cookieBrowserProfile: cookieSettings.browserProfile || null,
          cookieFilePath: cookieSettings.filePath || null,
          // Post-processing settings (from main download settings)
          embedMetadata: embedSettings.embedMetadata,
          embedThumbnail: embedSettings.embedThumbnail,
        });

        setItems((items) =>
          items.map((i) => (i.id === item.id ? { ...i, status: 'completed', progress: 100 } : i)),
        );
      } catch (error) {
        setItems((items) =>
          items.map((i) =>
            i.id === item.id ? { ...i, status: 'error', error: String(error) } : i,
          ),
        );
      }
    };

    try {
      const queue = [...itemsToDownload];
      const activeDownloads: Promise<void>[] = [];

      const processNext = async (): Promise<void> => {
        while (isDownloadingRef.current && queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          await downloadItem(item);
        }
      };

      const workerCount = Math.min(concurrentLimit, itemsToDownload.length);

      for (let i = 0; i < workerCount; i++) {
        activeDownloads.push(processNext());
      }

      await Promise.all(activeDownloads);
    } finally {
      setIsDownloading(false);
      isDownloadingRef.current = false;
    }
  }, [settings]);

  const stopDownload = useCallback(async () => {
    try {
      await invoke('stop_download');
    } catch (error) {
      console.error('Failed to stop download:', error);
    }
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

  const value: UniversalContextType = {
    items,
    isDownloading,
    settings,
    addFromText,
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
