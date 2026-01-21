import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { downloadDir } from '@tauri-apps/api/path';
import { readTextFile } from '@tauri-apps/plugin-fs';
import type { 
  DownloadItem, 
  DownloadSettings, 
  DownloadProgress, 
  Quality, 
  Format,
  VideoCodec,
  AudioBitrate,
  SubtitleMode,
  SubtitleFormat,
  PlaylistVideoEntry,
  ItemDownloadSettings,
} from '@/lib/types';

const STORAGE_KEY = 'youwee-settings';

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

// Save settings to localStorage
function saveSettings(settings: DownloadSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
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
    }));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

interface PlaylistInfo {
  index: number;
  total: number;
  title: string;
}

interface DownloadContextType {
  items: DownloadItem[];
  isDownloading: boolean;
  isExpandingPlaylist: boolean;
  settings: DownloadSettings;
  currentPlaylistInfo: PlaylistInfo | null;
  addFromText: (text: string) => Promise<number>;
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
}

const DownloadContext = createContext<DownloadContextType | null>(null);

export function DownloadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExpandingPlaylist, setIsExpandingPlaylist] = useState(false);
  
  // Load saved settings on init
  const [settings, setSettings] = useState<DownloadSettings>(() => {
    const saved = loadSavedSettings();
    return {
      quality: saved.quality || 'best',
      format: saved.format || 'mp4',
      outputPath: saved.outputPath || '',
      downloadPlaylist: saved.downloadPlaylist || false,
      videoCodec: saved.videoCodec || 'h264',
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
    };
  });
  
  const [currentPlaylistInfo, setCurrentPlaylistInfo] = useState<PlaylistInfo | null>(null);
  
  const isDownloadingRef = useRef(false);
  const itemsRef = useRef<DownloadItem[]>([]);
  
  // Keep itemsRef in sync with items state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Get default download path on mount (only if not saved)
  useEffect(() => {
    const getDefaultPath = async () => {
      // Only fetch default if no saved path
      if (settings.outputPath) return;
      
      try {
        const path = await downloadDir();
        setSettings(s => {
          const newSettings = { ...s, outputPath: path };
          saveSettings(newSettings);
          return newSettings;
        });
      } catch (error) {
        console.error('Failed to get download directory:', error);
      }
    };
    getDefaultPath();
  }, []);

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
      
      setItems(currentItems => currentItems.map(item => 
        item.id === progress.id 
          ? { 
              ...item, 
              progress: progress.percent,
              speed: progress.speed,
              eta: progress.eta,
              title: progress.title || item.title,
              status: progress.status === 'finished' ? 'completed' : 
                      progress.status === 'error' ? 'error' : 'downloading',
              playlistIndex: progress.playlist_index,
              playlistTotal: progress.playlist_count,
              // Store completed info when finished
              ...(progress.status === 'finished' ? {
                completedFilesize: progress.filesize,
                completedResolution: progress.resolution,
                completedFormat: progress.format_ext,
              } : {}),
            }
          : item
      ));
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const parseUrls = useCallback((text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
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

  // Add individual URLs (not playlist expansion)
  const addUrlsDirectly = useCallback((urls: string[], playlistId?: string) => {
    if (urls.length === 0) return 0;

    const currentItems = itemsRef.current;
    
    // Snapshot current settings for these items
    const settingsSnapshot: ItemDownloadSettings = {
      quality: settings.quality,
      format: settings.format,
      outputPath: settings.outputPath,
      videoCodec: settings.videoCodec,
      audioBitrate: settings.audioBitrate,
      subtitleMode: settings.subtitleMode,
      subtitleLangs: [...settings.subtitleLangs],
      subtitleEmbed: settings.subtitleEmbed,
      subtitleFormat: settings.subtitleFormat,
    };
    
    const newItems: DownloadItem[] = urls
      .filter(url => !currentItems.some(item => item.url === url))
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
      setItems(prev => [...prev, ...newItems]);
    }
    
    return newItems.length;
  }, [settings]);

  // Expand playlist URL to individual videos
  const expandPlaylistUrl = useCallback(async (url: string): Promise<string[]> => {
    try {
      const limit = settings.playlistLimit > 0 ? settings.playlistLimit : undefined;
      const entries = await invoke<PlaylistVideoEntry[]>('get_playlist_entries', { 
        url, 
        limit 
      });
      
      // Snapshot current settings for these items
      const settingsSnapshot: ItemDownloadSettings = {
        quality: settings.quality,
        format: settings.format,
        outputPath: settings.outputPath,
        videoCodec: settings.videoCodec,
        audioBitrate: settings.audioBitrate,
        subtitleMode: settings.subtitleMode,
        subtitleLangs: [...settings.subtitleLangs],
        subtitleEmbed: settings.subtitleEmbed,
        subtitleFormat: settings.subtitleFormat,
      };
      
      // Add items with titles and thumbnails from playlist data
      const currentItems = itemsRef.current;
      const newItems: DownloadItem[] = entries
        .filter(entry => !currentItems.some(item => item.url === entry.url))
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
        setItems(prev => [...prev, ...newItems]);
      }
      
      return entries.map(e => e.url);
    } catch (error) {
      console.error('Failed to expand playlist:', error);
      throw error;
    }
  }, [settings]);

  // Format duration from seconds to "mm:ss" or "hh:mm:ss"
  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const addFromText = useCallback(async (text: string): Promise<number> => {
    const urls = parseUrls(text);
    if (urls.length === 0) return 0;

    let totalAdded = 0;

    // Separate playlist URLs and regular video URLs
    const playlistUrls = urls.filter(url => isPlaylistUrl(url) && settings.downloadPlaylist);
    const regularUrls = urls.filter(url => !isPlaylistUrl(url) || !settings.downloadPlaylist);

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
  }, [parseUrls, isPlaylistUrl, settings.downloadPlaylist, addUrlsDirectly, expandPlaylistUrl]);

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
        setSettings(s => {
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
    setItems(items => items.filter(item => item.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setCurrentPlaylistInfo(null);
  }, []);

  const clearCompleted = useCallback(() => {
    setItems(items => items.filter(item => item.status !== 'completed'));
  }, []);

  const startDownload = useCallback(async () => {
    const currentItems = itemsRef.current;
    // Only download items that are pending or had errors (not completed ones)
    const itemsToDownload = currentItems.filter(
      item => item.status === 'pending' || item.status === 'error'
    );
    
    if (itemsToDownload.length === 0) return;
    
    setIsDownloading(true);
    isDownloadingRef.current = true;
    setCurrentPlaylistInfo(null);
    
    // Reset only pending/error items, keep completed items and playlist info as-is
    setItems(items => items.map(item => {
      if (item.status === 'pending' || item.status === 'error') {
        return {
          ...item,
          status: 'pending' as const,
          progress: 0,
          speed: '',
          eta: '',
          error: undefined,
          // Keep playlistIndex and playlistTotal for display
        };
      }
      return item;
    }));

    const concurrentLimit = settings.concurrentDownloads || 1;
    
    // Download single item
    const downloadItem = async (item: DownloadItem) => {
      if (!isDownloadingRef.current) return;
      
      setItems(items => items.map(i => 
        i.id === item.id ? { ...i, status: 'downloading' } : i
      ));

      try {
        // Use item's saved settings (snapshot from when it was added)
        // Fallback to current global settings if not available
        const itemSettings = item.settings as ItemDownloadSettings | undefined;
        const logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
        
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
        });
        
        setItems(items => items.map(i => 
          i.id === item.id ? { ...i, status: 'completed', progress: 100 } : i
        ));
      } catch (error) {
        setItems(items => items.map(i => 
          i.id === item.id ? { ...i, status: 'error', error: String(error) } : i
        ));
      }
    };

    try {
      // Process items with concurrency limit
      const queue = [...itemsToDownload];
      const activeDownloads: Promise<void>[] = [];
      
      const processNext = async (): Promise<void> => {
        while (isDownloadingRef.current && queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          await downloadItem(item);
        }
      };
      
      // Calculate worker count BEFORE starting (queue.length changes during shift)
      const workerCount = Math.min(concurrentLimit, itemsToDownload.length);
      
      // Start concurrent workers
      for (let i = 0; i < workerCount; i++) {
        activeDownloads.push(processNext());
      }
      
      await Promise.all(activeDownloads);
    } finally {
      setIsDownloading(false);
      isDownloadingRef.current = false;
      setCurrentPlaylistInfo(null);
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
    setCurrentPlaylistInfo(null);
  }, []);

  const updateSettings = useCallback((updates: Partial<DownloadSettings>) => {
    setSettings(s => {
      const newSettings = { ...s, ...updates };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateQuality = useCallback((quality: Quality) => {
    setSettings(s => {
      const newSettings = { ...s, quality };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateFormat = useCallback((format: Format) => {
    setSettings(s => {
      const newSettings = { ...s, format };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateVideoCodec = useCallback((videoCodec: VideoCodec) => {
    setSettings(s => {
      const newSettings = { ...s, videoCodec };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateAudioBitrate = useCallback((audioBitrate: AudioBitrate) => {
    setSettings(s => {
      const newSettings = { ...s, audioBitrate };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateConcurrentDownloads = useCallback((concurrentDownloads: number) => {
    const value = Math.max(1, Math.min(5, concurrentDownloads));
    setSettings(s => {
      const newSettings = { ...s, concurrentDownloads: value };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updatePlaylistLimit = useCallback((playlistLimit: number) => {
    const value = Math.max(0, Math.min(100, playlistLimit)); // 0 = unlimited
    setSettings(s => {
      const newSettings = { ...s, playlistLimit: value };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateAutoCheckUpdate = useCallback((enabled: boolean) => {
    setSettings(s => {
      const newSettings = { ...s, autoCheckUpdate: enabled };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const togglePlaylist = useCallback(() => {
    setSettings(s => {
      const newSettings = { ...s, downloadPlaylist: !s.downloadPlaylist };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleMode = useCallback((subtitleMode: SubtitleMode) => {
    setSettings(s => {
      const newSettings = { ...s, subtitleMode };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleLangs = useCallback((subtitleLangs: string[]) => {
    setSettings(s => {
      const newSettings = { ...s, subtitleLangs };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleEmbed = useCallback((subtitleEmbed: boolean) => {
    setSettings(s => {
      const newSettings = { ...s, subtitleEmbed };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateSubtitleFormat = useCallback((subtitleFormat: SubtitleFormat) => {
    setSettings(s => {
      const newSettings = { ...s, subtitleFormat };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const updateUseBunRuntime = useCallback((useBunRuntime: boolean) => {
    setSettings(s => {
      const newSettings = { ...s, useBunRuntime };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const value: DownloadContextType = {
    items,
    isDownloading,
    isExpandingPlaylist,
    settings,
    currentPlaylistInfo,
    addFromText,
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
  };

  return (
    <DownloadContext.Provider value={value}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
}
