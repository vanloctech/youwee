import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { downloadDir, homeDir } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useDownload } from './DownloadContext';

const STORAGE_KEY = 'youwee_metadata_settings';

// Check if path is absolute (cross-platform)
const isAbsolutePath = (path: string): boolean => {
  if (!path) return false;
  if (path.startsWith('/')) return true;
  if (/^[A-Za-z]:[\\/]/.test(path)) return true;
  return false;
};

export interface MetadataItem {
  id: string;
  url: string;
  title: string;
  status: 'pending' | 'fetching' | 'completed' | 'error';
  error?: string;
}

export interface MetadataSettings {
  outputPath: string;
  writeInfoJson: boolean;
  writeDescription: boolean;
  writeComments: boolean;
  writeThumbnail: boolean;
}

interface MetadataProgress {
  id: string;
  status: string;
  title?: string;
  error_message?: string;
}

interface MetadataContextType {
  items: MetadataItem[];
  isFetching: boolean;
  settings: MetadataSettings;
  addUrls: (text: string) => void;
  removeItem: (id: string) => void;
  clearAll: () => void;
  clearCompleted: () => void;
  startFetch: () => void;
  stopFetch: () => void;
  selectOutputFolder: () => Promise<void>;
  updateSettings: (updates: Partial<MetadataSettings>) => void;
}

function loadSavedSettings(): Partial<MetadataSettings> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load metadata settings:', e);
  }
  return {};
}

function saveSettings(settings: MetadataSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save metadata settings:', e);
  }
}

const MetadataContext = createContext<MetadataContextType | null>(null);

export function MetadataProvider({ children }: { children: ReactNode }) {
  const { cookieSettings, getProxyUrl } = useDownload();
  const [items, setItems] = useState<MetadataItem[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const cancelRef = useRef(false);

  const [settings, setSettings] = useState<MetadataSettings>(() => {
    const saved = loadSavedSettings();
    return {
      outputPath: saved.outputPath || '',
      writeInfoJson: saved.writeInfoJson !== false, // Default true
      writeDescription: saved.writeDescription !== false, // Default true
      writeComments: saved.writeComments === true, // Default false (can be slow)
      writeThumbnail: saved.writeThumbnail !== false, // Default true
    };
  });

  // Get default output path
  useEffect(() => {
    const getDefaultPath = async () => {
      if (settings.outputPath) return;

      try {
        let path = await downloadDir();
        if (!isAbsolutePath(path)) {
          const home = await homeDir();
          if (home) {
            path = `${home}Downloads`;
          }
        }
        if (isAbsolutePath(path)) {
          setSettings((s) => {
            const newSettings = { ...s, outputPath: path };
            saveSettings(newSettings);
            return newSettings;
          });
        }
      } catch (error) {
        console.error('Failed to get download directory:', error);
      }
    };
    getDefaultPath();
  }, [settings.outputPath]);

  // Listen for progress events
  useEffect(() => {
    const unlisten = listen<MetadataProgress>('metadata-progress', (event) => {
      const progress = event.payload;

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === progress.id
            ? {
                ...item,
                title: progress.title || item.title,
                status:
                  progress.status === 'finished'
                    ? 'completed'
                    : progress.status === 'error'
                      ? 'error'
                      : 'fetching',
                error: progress.error_message,
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
        if (!line || line.startsWith('#')) return false;
        return (
          line.includes('youtube.com') ||
          line.includes('youtu.be') ||
          line.includes('http://') ||
          line.includes('https://')
        );
      });
  }, []);

  const addUrls = useCallback(
    (text: string) => {
      const urls = parseUrls(text);
      const newItems: MetadataItem[] = urls.map((url) => ({
        id: `meta-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url,
        title: url,
        status: 'pending',
      }));
      setItems((prev) => [...prev, ...newItems]);
    },
    [parseUrls],
  );

  const removeItem = useCallback((id: string) => {
    setItems((items) => items.filter((item) => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((items) => items.filter((item) => item.status !== 'completed'));
  }, []);

  const startFetch = useCallback(async () => {
    const pendingItems = items.filter((item) => item.status === 'pending');
    if (pendingItems.length === 0) return;

    setIsFetching(true);
    cancelRef.current = false;

    for (const item of pendingItems) {
      if (cancelRef.current) break;

      setItems((items) => items.map((i) => (i.id === item.id ? { ...i, status: 'fetching' } : i)));

      try {
        await invoke('fetch_metadata', {
          id: item.id,
          url: item.url,
          outputPath: settings.outputPath,
          writeInfoJson: settings.writeInfoJson,
          writeDescription: settings.writeDescription,
          writeComments: settings.writeComments,
          writeThumbnail: settings.writeThumbnail,
          // Cookie settings
          cookieMode: cookieSettings.mode,
          cookieBrowser: cookieSettings.browser || null,
          cookieBrowserProfile: cookieSettings.browserProfile || null,
          cookieFilePath: cookieSettings.filePath || null,
          // Proxy settings
          proxyUrl: getProxyUrl() || null,
        });
      } catch (error) {
        setItems((items) =>
          items.map((i) =>
            i.id === item.id ? { ...i, status: 'error', error: String(error) } : i,
          ),
        );
      }
    }

    setIsFetching(false);
  }, [items, settings, cookieSettings, getProxyUrl]);

  const stopFetch = useCallback(async () => {
    cancelRef.current = true;
    setIsFetching(false);
    try {
      await invoke('cancel_metadata_fetch');
    } catch (e) {
      console.error('Failed to cancel:', e);
    }
  }, []);

  const selectOutputFolder = useCallback(async () => {
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        defaultPath: settings.outputPath || undefined,
      });
      if (folder) {
        setSettings((s) => {
          const newSettings = { ...s, outputPath: folder as string };
          saveSettings(newSettings);
          return newSettings;
        });
      }
    } catch (e) {
      console.error('Failed to select folder:', e);
    }
  }, [settings.outputPath]);

  const updateSettings = useCallback((updates: Partial<MetadataSettings>) => {
    setSettings((s) => {
      const newSettings = { ...s, ...updates };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const value: MetadataContextType = {
    items,
    isFetching,
    settings,
    addUrls,
    removeItem,
    clearAll,
    clearCompleted,
    startFetch,
    stopFetch,
    selectOutputFolder,
    updateSettings,
  };

  return <MetadataContext.Provider value={value}>{children}</MetadataContext.Provider>;
}

export function useMetadata() {
  const context = useContext(MetadataContext);
  if (!context) {
    throw new Error('useMetadata must be used within a MetadataProvider');
  }
  return context;
}
