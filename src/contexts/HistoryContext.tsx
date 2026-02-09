import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { DownloadProgress, HistoryEntry, HistoryFilter } from '@/lib/types';

// Re-download task state
interface RedownloadTask {
  entryId: string;
  downloadId: string;
  status: 'downloading' | 'completed' | 'error';
  progress: number;
  speed: string;
  eta: string;
  error?: string;
}

interface HistoryContextType {
  entries: HistoryEntry[];
  filter: HistoryFilter;
  search: string;
  loading: boolean;
  totalCount: number;
  maxEntries: number;
  redownloadTasks: Map<string, RedownloadTask>;
  setFilter: (filter: HistoryFilter) => void;
  setSearch: (search: string) => void;
  setMaxEntries: (max: number) => void;
  refreshHistory: () => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  openFileLocation: (filepath: string) => Promise<void>;
  checkFileExists: (filepath: string) => Promise<boolean>;
  redownload: (entry: HistoryEntry) => Promise<void>;
  getRedownloadTask: (entryId: string) => RedownloadTask | undefined;
}

const HistoryContext = createContext<HistoryContextType | null>(null);

const MAX_HISTORY_KEY = 'youwee_max_history';

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [maxEntries, setMaxEntriesState] = useState(() => {
    const saved = localStorage.getItem(MAX_HISTORY_KEY);
    return saved ? parseInt(saved, 10) : 500;
  });
  const [redownloadTasks, setRedownloadTasks] = useState<Map<string, RedownloadTask>>(new Map());

  // Listen for download progress events for re-downloads
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      const progress = event.payload;

      // Check if this is a redownload task
      setRedownloadTasks((prev) => {
        const newMap = new Map(prev);
        // Find task by downloadId
        for (const [entryId, task] of newMap.entries()) {
          if (task.downloadId === progress.id) {
            if (progress.status === 'finished') {
              newMap.set(entryId, {
                ...task,
                status: 'completed',
                progress: 100,
              });
            } else {
              newMap.set(entryId, {
                ...task,
                status: 'downloading',
                progress: progress.percent,
                speed: progress.speed,
                eta: progress.eta,
              });
            }
            break;
          }
        }
        return newMap;
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const setMaxEntries = useCallback((max: number) => {
    setMaxEntriesState(max);
    localStorage.setItem(MAX_HISTORY_KEY, String(max));
  }, []);

  const refreshHistory = useCallback(async () => {
    setLoading(true);
    try {
      const sourceFilter = filter === 'all' ? null : filter;
      const searchParam = search.trim() || null;

      const [result, count] = await Promise.all([
        invoke<HistoryEntry[]>('get_history', {
          limit: 500,
          offset: 0,
          source: sourceFilter,
          search: searchParam,
        }),
        invoke<number>('get_history_count', {
          source: sourceFilter,
          search: searchParam,
        }),
      ]);

      setEntries(result);
      setTotalCount(count);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  const deleteEntry = useCallback(async (id: string) => {
    try {
      await invoke('delete_history', { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to delete history entry:', error);
      throw error;
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      await invoke('clear_history');
      setEntries([]);
      setTotalCount(0);
    } catch (error) {
      console.error('Failed to clear history:', error);
      throw error;
    }
  }, []);

  const openFileLocation = useCallback(async (filepath: string) => {
    try {
      await invoke('open_file_location', { filepath });
    } catch (error) {
      console.error('Failed to open file location:', error);
      throw error;
    }
  }, []);

  const checkFileExists = useCallback(async (filepath: string): Promise<boolean> => {
    try {
      return await invoke<boolean>('check_file_exists', { filepath });
    } catch (error) {
      console.error('Failed to check file:', error);
      return false;
    }
  }, []);

  const redownload = useCallback(
    async (entry: HistoryEntry) => {
      // For summary-only entries (no filepath), we can download fresh
      // For entries with filepath, check if file already exists
      if (entry.filepath) {
        const exists = await checkFileExists(entry.filepath);
        if (exists) {
          throw new Error('File already exists');
        }
      }

      // Get output path from filepath, or from user settings if filepath is empty
      let outputPath = '';
      if (entry.filepath) {
        outputPath = entry.filepath.substring(0, entry.filepath.lastIndexOf('/'));
      }

      // Get settings from localStorage
      const logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
      let useBunRuntime = false;
      let useActualPlayerJs = false;
      let savedOutputPath = '';
      try {
        const savedSettings = localStorage.getItem('youwee-settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          useBunRuntime = parsed.useBunRuntime || false;
          useActualPlayerJs = parsed.useActualPlayerJs || false;
          savedOutputPath = parsed.outputPath || '';
        }
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }

      // Load cookie settings
      let cookieMode = 'off';
      let cookieBrowser: string | null = null;
      let cookieBrowserProfile: string | null = null;
      let cookieFilePath: string | null = null;
      try {
        const savedCookieSettings = localStorage.getItem('youwee-cookie-settings');
        if (savedCookieSettings) {
          const parsed = JSON.parse(savedCookieSettings);
          cookieMode = parsed.mode || 'off';
          cookieBrowser = parsed.browser || null;
          cookieBrowserProfile = parsed.browserProfile || null;
          cookieFilePath = parsed.filePath || null;
        }
      } catch (e) {
        console.error('Failed to parse cookie settings:', e);
      }

      // Load proxy settings
      let proxyUrl: string | null = null;
      try {
        const savedProxySettings = localStorage.getItem('youwee-proxy-settings');
        if (savedProxySettings) {
          const parsed = JSON.parse(savedProxySettings);
          if (parsed.mode !== 'off' && parsed.host && parsed.port) {
            const protocol = parsed.mode === 'socks5' ? 'socks5' : 'http';
            const auth =
              parsed.username && parsed.password
                ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
                : '';
            proxyUrl = `${protocol}://${auth}${parsed.host}:${parsed.port}`;
          }
        }
      } catch (e) {
        console.error('Failed to parse proxy settings:', e);
      }

      // Use saved output path if entry has no filepath
      if (!outputPath && savedOutputPath) {
        outputPath = savedOutputPath;
      }

      if (!outputPath) {
        throw new Error('No output path available. Please set a download folder in Settings.');
      }

      // Convert quality display format to download format (e.g., "480p" -> "480", "1080p" -> "1080")
      // Default to 'best' if no quality specified (e.g., summary-only entries)
      let quality = entry.quality || 'best';
      if (quality.endsWith('p')) {
        quality = quality.slice(0, -1); // Remove 'p' suffix
      }
      // Handle special cases
      if (quality === '4K') quality = '4k';
      if (quality === '8K') quality = '8k';
      if (quality === '2K') quality = '2k';
      if (quality === 'Best') quality = 'best';
      if (quality === 'Audio') quality = 'audio';

      // Default format to 'mp4' if not specified
      const format = entry.format || 'mp4';

      const downloadId = `redownload-${Date.now()}`;

      // Add task to tracking
      setRedownloadTasks((prev) => {
        const newMap = new Map(prev);
        newMap.set(entry.id, {
          entryId: entry.id,
          downloadId,
          status: 'downloading',
          progress: 0,
          speed: '',
          eta: '',
        });
        return newMap;
      });

      try {
        await invoke('download_video', {
          id: downloadId,
          url: entry.url,
          outputPath,
          quality,
          format,
          downloadPlaylist: false,
          videoCodec: 'h264',
          audioBitrate: '192',
          playlistLimit: null,
          subtitleMode: 'off',
          subtitleLangs: '',
          subtitleEmbed: false,
          subtitleFormat: 'srt',
          logStderr,
          useBunRuntime,
          useActualPlayerJs,
          historyId: entry.id,
          // Cookie settings
          cookieMode,
          cookieBrowser,
          cookieBrowserProfile,
          cookieFilePath,
          // Proxy settings
          proxyUrl,
        });

        // Mark as completed
        setRedownloadTasks((prev) => {
          const newMap = new Map(prev);
          const task = newMap.get(entry.id);
          if (task) {
            newMap.set(entry.id, { ...task, status: 'completed', progress: 100 });
          }
          return newMap;
        });

        // Refresh history to update file_exists status
        setTimeout(() => refreshHistory(), 1000);
      } catch (error) {
        console.error('Failed to redownload:', error);
        // Mark as error
        setRedownloadTasks((prev) => {
          const newMap = new Map(prev);
          const task = newMap.get(entry.id);
          if (task) {
            newMap.set(entry.id, {
              ...task,
              status: 'error',
              error: error instanceof Error ? error.message : 'Download failed',
            });
          }
          return newMap;
        });
        throw error;
      }
    },
    [checkFileExists, refreshHistory],
  );

  const getRedownloadTask = useCallback(
    (entryId: string) => {
      return redownloadTasks.get(entryId);
    },
    [redownloadTasks],
  );

  // Fetch history on mount and when filter/search changes
  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Auto-refresh every 30 seconds when page is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshHistory();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshHistory]);

  return (
    <HistoryContext.Provider
      value={{
        entries,
        filter,
        search,
        loading,
        totalCount,
        maxEntries,
        redownloadTasks,
        setFilter,
        setSearch,
        setMaxEntries,
        refreshHistory,
        deleteEntry,
        clearHistory,
        openFileLocation,
        checkFileExists,
        redownload,
        getRedownloadTask,
      }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory() {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
}
