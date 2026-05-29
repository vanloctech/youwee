import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { syncAssetScopePaths } from '@/lib/asset-access';
import { collectAssetScopeCandidates } from '@/lib/asset-paths';
import { localizeUnknownError } from '@/lib/backend-error';
import { buildCookieProxyInvokeOptions, loadNetworkSettings } from '@/lib/network-config';
import {
  loadPluginWorkflowSnapshots,
  loadPostDownloadWorkflowSteps,
} from '@/lib/post-download-plugins';
import type {
  DownloadProgress,
  HistoryAdvancedFilters,
  HistoryCollection,
  HistoryEntry,
  HistoryFilter,
  HistorySort,
  HistoryTag,
} from '@/lib/types';

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
  historyVersion: number;
  filter: HistoryFilter;
  search: string;
  advancedFilters: HistoryAdvancedFilters;
  sort: HistorySort;
  tags: HistoryTag[];
  collections: HistoryCollection[];
  loading: boolean;
  totalCount: number;
  maxEntries: number;
  redownloadTasks: Map<string, RedownloadTask>;
  setFilter: (filter: HistoryFilter) => void;
  setSearch: (search: string) => void;
  setAdvancedFilters: (updates: Partial<HistoryAdvancedFilters>) => void;
  clearAdvancedFilters: () => void;
  setSort: (sort: HistorySort) => void;
  setMaxEntries: (max: number) => void;
  refreshHistory: () => Promise<void>;
  refreshTaxonomy: () => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  openFileLocation: (filepath: string) => Promise<void>;
  checkFileExists: (filepath: string) => Promise<boolean>;
  renameEntry: (entryId: string, newName: string) => Promise<void>;
  createCollection: (name: string, color?: string | null) => Promise<void>;
  renameCollection: (id: string, name: string) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  assignHistoryTags: (historyId: string, tags: string[]) => Promise<void>;
  assignHistoryCollections: (historyId: string, collectionIds: string[]) => Promise<void>;
  removeHistoryTag: (historyId: string, tagId: string) => Promise<void>;
  removeHistoryFromCollection: (historyId: string, collectionId: string) => Promise<void>;
  redownload: (entry: HistoryEntry) => Promise<void>;
  getRedownloadTask: (entryId: string) => RedownloadTask | undefined;
}

const HistoryContext = createContext<HistoryContextType | null>(null);

const MAX_HISTORY_KEY = 'youwee_max_history';
const HISTORY_SORT_KEY = 'youwee_history_sort';

const DEFAULT_ADVANCED_FILTERS: HistoryAdvancedFilters = {
  mediaType: 'all',
  datePreset: 'all',
  downloadedAtFrom: null,
  downloadedAtTo: null,
  customDateFrom: null,
  customDateTo: null,
  formats: [],
  qualities: [],
  tagIds: [],
  collectionIds: [],
  matchMode: 'any',
};

const SORT_OPTIONS: HistorySort[] = ['recent', 'oldest', 'title', 'size'];

function getStartOfDayEpochSeconds(date: Date): number {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return Math.floor(value.getTime() / 1000);
}

function getEndOfDayEpochSeconds(date: Date): number {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return Math.floor(value.getTime() / 1000);
}

function parseLocalDate(dateString?: string | null): Date | null {
  if (!dateString) return null;
  const parsed = new Date(`${dateString}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildResolvedHistoryFilters(filters: HistoryAdvancedFilters): HistoryAdvancedFilters {
  let downloadedAtFrom: number | null = null;
  let downloadedAtTo: number | null = null;

  const now = new Date();
  if (filters.datePreset === 'today') {
    downloadedAtFrom = getStartOfDayEpochSeconds(now);
    downloadedAtTo = getEndOfDayEpochSeconds(now);
  } else if (filters.datePreset === 'last7days') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    downloadedAtFrom = getStartOfDayEpochSeconds(from);
    downloadedAtTo = getEndOfDayEpochSeconds(now);
  } else if (filters.datePreset === 'last30days') {
    const from = new Date(now);
    from.setDate(from.getDate() - 29);
    downloadedAtFrom = getStartOfDayEpochSeconds(from);
    downloadedAtTo = getEndOfDayEpochSeconds(now);
  } else if (filters.datePreset === 'custom') {
    const fromDate = parseLocalDate(filters.customDateFrom);
    const toDate = parseLocalDate(filters.customDateTo);
    if (fromDate) downloadedAtFrom = getStartOfDayEpochSeconds(fromDate);
    if (toDate) downloadedAtTo = getEndOfDayEpochSeconds(toDate);
  }

  return {
    ...filters,
    downloadedAtFrom,
    downloadedAtTo,
    mediaType: filters.mediaType || 'all',
    formats: filters.formats || [],
    qualities: filters.qualities || [],
    tagIds: filters.tagIds || [],
    collectionIds: filters.collectionIds || [],
    matchMode: filters.matchMode || 'any',
  };
}

interface RenameDownloadedFileResult {
  newFilepath: string;
  newTitle: string;
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [search, setSearch] = useState('');
  const [advancedFilters, setAdvancedFiltersState] =
    useState<HistoryAdvancedFilters>(DEFAULT_ADVANCED_FILTERS);
  const [sort, setSortState] = useState<HistorySort>(() => {
    const saved = localStorage.getItem(HISTORY_SORT_KEY) as HistorySort | null;
    if (saved && SORT_OPTIONS.includes(saved)) {
      return saved;
    }
    return 'recent';
  });
  const [tags, setTags] = useState<HistoryTag[]>([]);
  const [collections, setCollections] = useState<HistoryCollection[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [maxEntries, setMaxEntriesState] = useState(() => {
    const saved = localStorage.getItem(MAX_HISTORY_KEY);
    return saved ? parseInt(saved, 10) : 500;
  });
  const [redownloadTasks, setRedownloadTasks] = useState<Map<string, RedownloadTask>>(new Map());
  const lastAssetScopeKeyRef = useRef('');

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

  const setAdvancedFilters = useCallback((updates: Partial<HistoryAdvancedFilters>) => {
    setAdvancedFiltersState((current) => ({ ...current, ...updates }));
  }, []);

  const clearAdvancedFilters = useCallback(() => {
    setAdvancedFiltersState(DEFAULT_ADVANCED_FILTERS);
  }, []);

  const setSort = useCallback((nextSort: HistorySort) => {
    setSortState(nextSort);
    localStorage.setItem(HISTORY_SORT_KEY, nextSort);
  }, []);

  const refreshTaxonomy = useCallback(async () => {
    try {
      const [nextTags, nextCollections] = await Promise.all([
        invoke<HistoryTag[]>('get_tags'),
        invoke<HistoryCollection[]>('get_collections'),
      ]);
      setTags(nextTags);
      setCollections(nextCollections);
    } catch (error) {
      console.error('Failed to fetch history taxonomy:', error);
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    setLoading(true);
    try {
      const sourceFilter = filter === 'all' ? null : filter;
      const searchParam = search.trim() || null;
      const resolvedFilters = buildResolvedHistoryFilters(advancedFilters);

      const [result, count] = await Promise.all([
        invoke<HistoryEntry[]>('get_history', {
          limit: 500,
          offset: 0,
          source: sourceFilter,
          search: searchParam,
          filters: resolvedFilters,
          sort,
        }),
        invoke<number>('get_history_count', {
          source: sourceFilter,
          search: searchParam,
          filters: resolvedFilters,
        }),
      ]);

      setEntries(result);
      setTotalCount(count);
      setHistoryVersion((prev) => prev + 1);

      const scopeCandidates = result
        .filter((entry) => entry.filepath.trim())
        .map((entry) => entry.filepath);

      try {
        const savedSettings = localStorage.getItem('youwee-settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings) as { outputPath?: string };
          if (parsed.outputPath) {
            scopeCandidates.push(parsed.outputPath);
          }
        }
      } catch (error) {
        console.error('Failed to parse output path for asset scope sync:', error);
      }

      const scopeKey = collectAssetScopeCandidates(scopeCandidates).sort().join('\n');
      if (scopeKey && scopeKey !== lastAssetScopeKeyRef.current) {
        lastAssetScopeKeyRef.current = scopeKey;
        void syncAssetScopePaths(scopeCandidates).catch((error) => {
          console.error('Failed to sync asset scope paths:', error);
        });
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, search, advancedFilters, sort]);

  const deleteEntry = useCallback(
    async (id: string) => {
      try {
        await invoke('delete_history', { id });
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setTotalCount((prev) => Math.max(0, prev - 1));
        setHistoryVersion((prev) => prev + 1);
        void refreshTaxonomy();
      } catch (error) {
        console.error('Failed to delete history entry:', error);
        throw error;
      }
    },
    [refreshTaxonomy],
  );

  const clearHistory = useCallback(async () => {
    try {
      await invoke('clear_history');
      setEntries([]);
      setTags([]);
      setCollections([]);
      setTotalCount(0);
      setHistoryVersion((prev) => prev + 1);
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

  const renameEntry = useCallback(
    async (entryId: string, newName: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) {
        throw new Error('History entry not found');
      }
      if (!entry.filepath) {
        throw new Error('File path is not available for this entry');
      }

      const result = await invoke<RenameDownloadedFileResult>('rename_downloaded_file', {
        filepath: entry.filepath,
        newName,
        historyId: entry.id,
      });
      await invoke('sync_history_renamed_entry', {
        id: entry.id,
        filepath: result.newFilepath,
        title: result.newTitle,
      });

      setEntries((prev) =>
        prev.map((item) =>
          item.id === entryId
            ? {
                ...item,
                title: result.newTitle,
                filepath: result.newFilepath,
                file_exists: true,
              }
            : item,
        ),
      );
      setHistoryVersion((prev) => prev + 1);
    },
    [entries],
  );

  const assignHistoryTags = useCallback(
    async (historyId: string, nextTags: string[]) => {
      await invoke('assign_history_tags', { historyId, tags: nextTags });
      await Promise.all([refreshHistory(), refreshTaxonomy()]);
    },
    [refreshHistory, refreshTaxonomy],
  );

  const assignHistoryCollections = useCallback(
    async (historyId: string, collectionIds: string[]) => {
      await invoke('assign_history_collections', { historyId, collectionIds });
      await Promise.all([refreshHistory(), refreshTaxonomy()]);
    },
    [refreshHistory, refreshTaxonomy],
  );

  const removeHistoryTag = useCallback(
    async (historyId: string, tagId: string) => {
      await invoke('remove_history_tag', { historyId, tagId });
      await Promise.all([refreshHistory(), refreshTaxonomy()]);
    },
    [refreshHistory, refreshTaxonomy],
  );

  const removeHistoryFromCollection = useCallback(
    async (historyId: string, collectionId: string) => {
      await invoke('remove_history_from_collection', { historyId, collectionId });
      await Promise.all([refreshHistory(), refreshTaxonomy()]);
    },
    [refreshHistory, refreshTaxonomy],
  );

  const createCollection = useCallback(
    async (name: string, color?: string | null) => {
      await invoke('create_collection', { name, color: color ?? null });
      await refreshTaxonomy();
    },
    [refreshTaxonomy],
  );

  const renameCollection = useCallback(
    async (id: string, name: string) => {
      await invoke('rename_collection', { id, name });
      await Promise.all([refreshHistory(), refreshTaxonomy()]);
    },
    [refreshHistory, refreshTaxonomy],
  );

  const deleteCollection = useCallback(
    async (id: string) => {
      await invoke('delete_collection', { id });
      await Promise.all([refreshHistory(), refreshTaxonomy()]);
    },
    [refreshHistory, refreshTaxonomy],
  );

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
        const lastSep = Math.max(entry.filepath.lastIndexOf('/'), entry.filepath.lastIndexOf('\\'));
        outputPath = lastSep > 0 ? entry.filepath.substring(0, lastSep) : '';
      }

      // Get settings from localStorage
      const logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
      let useBunRuntime = false;
      let useActualPlayerJs = false;
      let useAria2 = false;
      let aria2Args = '';
      let savedOutputPath = '';
      try {
        const savedSettings = localStorage.getItem('youwee-settings');
        if (savedSettings) {
          const parsed = JSON.parse(savedSettings);
          useBunRuntime = parsed.useBunRuntime || false;
          useActualPlayerJs = parsed.useActualPlayerJs || false;
          useAria2 = parsed.useAria2 === true;
          aria2Args = parsed.aria2Args || '';
          savedOutputPath = parsed.outputPath || '';
        }
      } catch (e) {
        console.error('Failed to parse settings:', e);
      }

      const { cookieSettings, proxySettings } = loadNetworkSettings();
      const networkOptions = buildCookieProxyInvokeOptions(cookieSettings, proxySettings);

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
          videoCodec: 'auto',
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
          ...networkOptions,
          // External downloader settings
          useAria2,
          aria2Args,
          pluginWorkflowSnapshots: loadPluginWorkflowSnapshots(),
          postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
          downloadKind: 'history-redownload',
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
              error: localizeUnknownError(error),
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

  useEffect(() => {
    refreshTaxonomy();
  }, [refreshTaxonomy]);

  // Auto-refresh every 30 seconds when page is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshHistory();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [refreshHistory]);

  // Refresh history whenever any download completes (including audio)
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      if (event.payload.status === 'finished') {
        // Delay slightly to ensure Rust has finished writing the DB record
        setTimeout(() => refreshHistory(), 800);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshHistory]);

  return (
    <HistoryContext.Provider
      value={{
        entries,
        historyVersion,
        filter,
        search,
        advancedFilters,
        sort,
        tags,
        collections,
        loading,
        totalCount,
        maxEntries,
        redownloadTasks,
        setFilter,
        setSearch,
        setAdvancedFilters,
        clearAdvancedFilters,
        setSort,
        setMaxEntries,
        refreshHistory,
        refreshTaxonomy,
        deleteEntry,
        clearHistory,
        openFileLocation,
        checkFileExists,
        renameEntry,
        createCollection,
        renameCollection,
        deleteCollection,
        assignHistoryTags,
        assignHistoryCollections,
        removeHistoryTag,
        removeHistoryFromCollection,
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
