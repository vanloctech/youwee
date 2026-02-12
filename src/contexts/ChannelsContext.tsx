import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
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
import type {
  ChannelVideo,
  DownloadProgress,
  DownloadSettings,
  FollowedChannel,
  PlaylistVideoEntry,
} from '@/lib/types';
import { DEFAULT_SPONSORBLOCK_CATEGORIES } from '@/lib/types';

/** Supported platform definitions for channel detection.
 *  Easily extensible — add a new entry to support more platforms. */
const SUPPORTED_PLATFORMS = [
  { platform: 'youtube', hosts: ['youtube.com', 'youtu.be'] },
  { platform: 'bilibili', hosts: ['bilibili.com', 'b23.tv'] },
] as const;

export type Platform = (typeof SUPPORTED_PLATFORMS)[number]['platform'] | 'other';

/** Detect which platform a URL belongs to */
export function detectPlatform(url: string): Platform {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    for (const { platform, hosts } of SUPPORTED_PLATFORMS) {
      if (hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
        return platform;
      }
    }
  } catch {
    // invalid URL
  }
  return 'other';
}

/** Check if a URL is a supported channel platform */
function isSupportedPlatform(url: string): boolean {
  return detectPlatform(url) !== 'other';
}

/** Extract a readable channel name from a URL */
function extractChannelFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    // YouTube patterns: /@handle, /channel/ID, /c/name, /user/name
    if (host === 'youtube.com' || host === 'youtu.be') {
      const atMatch = u.pathname.match(/^\/@([^/]+)/);
      if (atMatch) return `@${atMatch[1]}`;
      const channelMatch = u.pathname.match(/^\/channel\/([^/]+)/);
      if (channelMatch) return channelMatch[1];
      const cMatch = u.pathname.match(/^\/c\/([^/]+)/);
      if (cMatch) return cMatch[1];
      const userMatch = u.pathname.match(/^\/user\/([^/]+)/);
      if (userMatch) return userMatch[1];
    }

    // Bilibili patterns: space.bilibili.com/{uid}
    if (host === 'space.bilibili.com') {
      const uidMatch = u.pathname.match(/^\/(\d+)/);
      if (uidMatch) return `UID:${uidMatch[1]}`;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/** Sanitize a channel name to be safe as a filesystem folder name.
 *  Works across macOS, Windows, and Linux. */
function sanitizeChannelFolderName(name: string): string {
  // Remove characters that are invalid on any OS: / \ : * ? " < > |
  let safe = name.replace(/[/\\:*?"<>|]/g, '');
  // Remove control characters (U+0000–U+001F, U+007F)
  safe = [...safe]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join('');
  // Trim leading/trailing dots and spaces (Windows restriction)
  safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');
  // Collapse multiple spaces into one
  safe = safe.replace(/\s+/g, ' ');
  // Fallback if name is empty after sanitization
  if (!safe) safe = 'Channel';
  return safe;
}

/** Build SponsorBlock args from settings (same logic as DownloadContext) */
function buildSponsorBlockArgs(settings: Partial<DownloadSettings>): {
  remove: string | null;
  mark: string | null;
} {
  if (!settings.sponsorBlock) return { remove: null, mark: null };

  const cats = settings.sponsorBlockCategories || DEFAULT_SPONSORBLOCK_CATEGORIES;

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

// Per-video download status
export interface VideoDownloadState {
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  speed: string;
  error?: string;
}

interface ChannelsContextType {
  // Followed channels
  followedChannels: FollowedChannel[];
  loadingChannels: boolean;
  refreshChannels: () => Promise<void>;
  followChannel: (url: string, name: string, thumbnail?: string) => Promise<string>;
  unfollowChannel: (id: string) => Promise<void>;
  refreshFollowedChannelInfo: () => Promise<void>;
  updateChannelSettings: (settings: {
    id: string;
    checkInterval: number;
    autoDownload: boolean;
    downloadQuality: string;
    downloadFormat: string;
    filterMinDuration?: number | null;
    filterMaxDuration?: number | null;
    filterIncludeKeywords?: string | null;
    filterExcludeKeywords?: string | null;
    filterMaxVideos?: number | null;
    downloadThreads?: number;
  }) => Promise<void>;

  // Channel browsing
  browseUrl: string;
  setBrowseUrl: (url: string) => void;
  browseVideos: PlaylistVideoEntry[];
  browseLoading: boolean;
  browseError: string | null;
  browseChannelName: string | null;
  browseChannelAvatar: string | null;
  browseFetchProgress: { fetched: number; limit: number } | null;
  fetchChannelVideos: (url: string, limit?: number) => Promise<void>;
  clearBrowse: () => void;

  // Video selection & download
  selectedVideoIds: Set<string>;
  toggleVideoSelection: (id: string) => void;
  selectAllVideos: () => void;
  deselectAllVideos: () => void;
  downloadSelectedVideos: (quality?: string, format?: string, videoCodec?: string) => Promise<void>;
  stopDownload: () => Promise<void>;
  isDownloading: boolean;
  downloadingIds: Set<string>;

  // Per-video progress
  videoStates: Map<string, VideoDownloadState>;

  // Output folder
  outputPath: string;
  selectOutputFolder: () => Promise<void>;

  // Active channel detail
  activeChannel: FollowedChannel | null;
  setActiveChannel: (channel: FollowedChannel | null) => void;
  activeChannelVideos: ChannelVideo[];
  loadingActiveVideos: boolean;
  refreshActiveChannelVideos: () => Promise<void>;

  // New videos count per channel
  channelNewCounts: Record<string, number>;
  refreshChannelNewCounts: () => Promise<void>;
}

const ChannelsContext = createContext<ChannelsContextType | null>(null);

export function ChannelsProvider({ children }: { children: ReactNode }) {
  // Followed channels state
  const [followedChannels, setFollowedChannels] = useState<FollowedChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Browse state
  const [browseUrl, setBrowseUrl] = useState('');
  const [browseVideos, setBrowseVideos] = useState<PlaylistVideoEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [browseChannelName, setBrowseChannelName] = useState<string | null>(null);
  const [browseChannelAvatar, setBrowseChannelAvatar] = useState<string | null>(null);

  // Fetch progress (for non-flat-playlist platforms like Bilibili)
  const [browseFetchProgress, setBrowseFetchProgress] = useState<{
    fetched: number;
    limit: number;
  } | null>(null);

  // Selection state
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  // Per-video download progress: videoId -> state
  const [videoStates, setVideoStates] = useState<Map<string, VideoDownloadState>>(new Map());
  // Map downloadId -> { videoId, channelUrl } (to match progress events back to videos and update DB)
  const downloadIdMapRef = useRef<Map<string, { videoId: string; channelUrl: string }>>(new Map());

  // Output folder
  const [outputPath, setOutputPath] = useState(() => {
    try {
      const saved = localStorage.getItem('youwee-settings');
      if (saved) return JSON.parse(saved).outputPath || '';
    } catch {
      /* ignore */
    }
    return '';
  });

  // Active channel detail
  const [activeChannel, setActiveChannel] = useState<FollowedChannel | null>(null);
  const [activeChannelVideos, setActiveChannelVideos] = useState<ChannelVideo[]>([]);
  const [loadingActiveVideos, setLoadingActiveVideos] = useState(false);

  // Per-channel new videos count
  const [channelNewCounts, setChannelNewCounts] = useState<Record<string, number>>({});

  // Ref for followedChannels to avoid stale closures
  const followedChannelsRef = useRef<FollowedChannel[]>([]);

  // Select output folder
  const selectOutputFolder = useCallback(async () => {
    try {
      const folder = await open({
        directory: true,
        multiple: false,
        title: 'Select Download Folder',
        defaultPath: outputPath || undefined,
      });

      if (folder) {
        const path = folder as string;
        setOutputPath(path);
        // Save to youwee-settings in localStorage
        try {
          const saved = localStorage.getItem('youwee-settings');
          const settings = saved ? JSON.parse(saved) : {};
          settings.outputPath = path;
          localStorage.setItem('youwee-settings', JSON.stringify(settings));
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  }, [outputPath]);

  // Load cookie/proxy settings from localStorage
  const getCookieSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem('youwee-cookie-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          cookieMode: parsed.mode || 'off',
          cookieBrowser: parsed.browser || null,
          cookieBrowserProfile: parsed.browserProfile || null,
          cookieFilePath: parsed.filePath || null,
        };
      }
    } catch (_e) {
      /* ignore */
    }
    return {
      cookieMode: 'off',
      cookieBrowser: null,
      cookieBrowserProfile: null,
      cookieFilePath: null,
    };
  }, []);

  const getProxyUrl = useCallback(() => {
    try {
      const saved = localStorage.getItem('youwee-proxy-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.mode !== 'off' && parsed.host && parsed.port) {
          const protocol = parsed.mode === 'socks5' ? 'socks5' : 'http';
          const auth =
            parsed.username && parsed.password
              ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}@`
              : '';
          return `${protocol}://${auth}${parsed.host}:${parsed.port}`;
        }
      }
    } catch (_e) {
      /* ignore */
    }
    return null;
  }, []);

  // Sync browse videos to channel_videos DB for a followed channel
  const syncVideosToDb = useCallback(async (channelId: string, videos: PlaylistVideoEntry[]) => {
    if (videos.length === 0) return;

    const now = new Date().toISOString();
    const channelVideos: ChannelVideo[] = videos.map((v) => ({
      id: crypto.randomUUID(),
      channel_id: channelId,
      video_id: v.id,
      title: v.title,
      url: v.url,
      thumbnail: v.thumbnail,
      duration: v.duration,
      upload_date: v.upload_date,
      status: 'new',
      created_at: now,
    }));

    try {
      await invoke('save_channel_videos', {
        channelId,
        videos: channelVideos,
      });

      // Update last_video_id to the newest video
      await invoke('update_channel_last_checked', {
        id: channelId,
        lastVideoId: videos[0].id,
      });
    } catch (error) {
      console.error('Failed to sync videos to DB:', error);
    }
  }, []);

  // Refresh followed channels list
  const refreshChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const channels = await invoke<FollowedChannel[]>('get_followed_channels');
      setFollowedChannels(channels);
      followedChannelsRef.current = channels;
    } catch (error) {
      console.error('Failed to fetch followed channels:', error);
    } finally {
      setLoadingChannels(false);
    }
  }, []);

  // Refresh per-channel new videos counts
  const refreshChannelNewCounts = useCallback(async () => {
    try {
      const channels = await invoke<FollowedChannel[]>('get_followed_channels');
      const counts: Record<string, number> = {};
      for (const ch of channels) {
        try {
          const count = await invoke<number>('get_new_videos_count', { channelId: ch.id });
          if (count > 0) counts[ch.id] = count;
        } catch {
          // ignore per-channel errors
        }
      }
      setChannelNewCounts(counts);
    } catch (_error) {
      // ignore
    }
  }, []);

  // Follow a channel
  const followChannel = useCallback(
    async (url: string, name: string, thumbnail?: string) => {
      const id = await invoke<string>('follow_channel', {
        url,
        name,
        thumbnail: thumbnail || null,
        platform: detectPlatform(url),
      });
      await refreshChannels();

      // Immediately sync current browseVideos to DB (no need to wait for polling)
      if (browseVideos.length > 0) {
        await syncVideosToDb(id, browseVideos);
        await refreshChannelNewCounts();
      }

      // Update tray menu with new channel
      invoke('rebuild_tray_menu_cmd').catch(() => {});

      return id;
    },
    [refreshChannels, browseVideos, syncVideosToDb, refreshChannelNewCounts],
  );

  // Unfollow a channel
  const unfollowChannel = useCallback(
    async (id: string) => {
      await invoke('unfollow_channel', { id });
      setFollowedChannels((prev) => prev.filter((c) => c.id !== id));
      if (activeChannel?.id === id) {
        setActiveChannel(null);
        setActiveChannelVideos([]);
      }
      // Update tray menu
      invoke('rebuild_tray_menu_cmd').catch(() => {});
    },
    [activeChannel],
  );

  // Update channel settings (check interval, auto-download, filters)
  const updateChannelSettings = useCallback(
    async (settings: {
      id: string;
      checkInterval: number;
      autoDownload: boolean;
      downloadQuality: string;
      downloadFormat: string;
      filterMinDuration?: number | null;
      filterMaxDuration?: number | null;
      filterIncludeKeywords?: string | null;
      filterExcludeKeywords?: string | null;
      filterMaxVideos?: number | null;
      downloadThreads?: number;
    }) => {
      await invoke('update_channel_settings', {
        id: settings.id,
        checkInterval: settings.checkInterval,
        autoDownload: settings.autoDownload,
        downloadQuality: settings.downloadQuality,
        downloadFormat: settings.downloadFormat,
        filterMinDuration: settings.filterMinDuration ?? null,
        filterMaxDuration: settings.filterMaxDuration ?? null,
        filterIncludeKeywords: settings.filterIncludeKeywords ?? null,
        filterExcludeKeywords: settings.filterExcludeKeywords ?? null,
        filterMaxVideos: settings.filterMaxVideos ?? null,
        downloadThreads: settings.downloadThreads ?? 1,
      });
      await refreshChannels();
    },
    [refreshChannels],
  );

  // Fetch videos from a channel URL (browse mode)
  // Request ID ref to detect stale responses from concurrent/cancelled fetches
  const fetchRequestIdRef = useRef(0);

  const fetchChannelVideos = useCallback(
    async (url: string, limit = 50) => {
      const requestId = ++fetchRequestIdRef.current;

      setBrowseLoading(true);
      setBrowseError(null);
      setBrowseVideos([]);
      setBrowseChannelName(null);
      setBrowseChannelAvatar(null);
      setBrowseFetchProgress(null);
      setSelectedVideoIds(new Set());
      setVideoStates(new Map());

      const { cookieMode, cookieBrowser, cookieBrowserProfile, cookieFilePath } =
        getCookieSettings();
      const proxyUrl = getProxyUrl();

      try {
        // Fetch videos and channel info in parallel
        const [videos, channelInfo] = await Promise.all([
          invoke<PlaylistVideoEntry[]>('get_channel_videos', {
            url,
            limit,
            cookieMode,
            cookieBrowser,
            cookieBrowserProfile,
            cookieFilePath,
            proxyUrl,
          }),
          invoke<{ name: string; avatar_url: string | null }>('get_channel_info', {
            url,
            cookieMode,
            cookieBrowser,
            cookieBrowserProfile,
            cookieFilePath,
            proxyUrl,
          }).catch(() => null), // Don't fail if channel info fetch fails
        ]);

        // Discard stale response if a newer fetch was triggered
        if (requestId !== fetchRequestIdRef.current) return;

        setBrowseVideos(videos);

        // Use channel info from dedicated command, fallback to video metadata
        // Treat "Channel" (the Rust default) as a failure so we can use better fallbacks
        const hasValidChannelInfo = channelInfo?.name && channelInfo.name !== 'Channel';

        if (hasValidChannelInfo) {
          setBrowseChannelName(channelInfo.name);
          setBrowseChannelAvatar(channelInfo.avatar_url);
        } else {
          // Fallback: use video metadata or URL-based extraction
          if (videos.length > 0) {
            const name = videos[0].channel || extractChannelFromUrl(url) || 'Channel';
            setBrowseChannelName(name);
          }
          // Use channelInfo avatar if available (even when name was bad)
          if (channelInfo?.avatar_url) {
            setBrowseChannelAvatar(channelInfo.avatar_url);
          }
        }

        // If this channel is already followed, sync videos to DB and load statuses
        const followedChannel = followedChannelsRef.current.find((c) => c.url === url);
        if (followedChannel && videos.length > 0) {
          await syncVideosToDb(followedChannel.id, videos);
          await refreshChannelNewCounts();

          // Load statuses from DB and merge into videoStates
          try {
            const savedVideos = await invoke<ChannelVideo[]>('get_saved_channel_videos', {
              channelId: followedChannel.id,
              status: null,
              limit: videos.length + 50,
            });

            // Build a map: YouTube videoId -> DB status
            const statusMap = new Map<string, string>();
            for (const sv of savedVideos) {
              statusMap.set(sv.video_id, sv.status);
            }

            // Discard if stale (another fetch started while syncing)
            if (requestId !== fetchRequestIdRef.current) return;

            // Apply DB statuses to videoStates
            setVideoStates((prev) => {
              const next = new Map(prev);
              for (const video of videos) {
                const dbStatus = statusMap.get(video.id);
                if (dbStatus === 'downloaded') {
                  next.set(video.id, { status: 'completed', progress: 100, speed: '' });
                }
              }
              return next;
            });
          } catch {
            // ignore status loading errors
          }
        }
      } catch (error) {
        // Discard stale error
        if (requestId !== fetchRequestIdRef.current) return;
        const msg = error instanceof Error ? error.message : String(error);
        setBrowseError(msg);
      } finally {
        // Only update loading state if this is still the current request
        if (requestId === fetchRequestIdRef.current) {
          setBrowseLoading(false);
          setBrowseFetchProgress(null);
        }
      }
    },
    [getCookieSettings, getProxyUrl, syncVideosToDb, refreshChannelNewCounts],
  );

  // Clear browse state
  const clearBrowse = useCallback(() => {
    setBrowseUrl('');
    setBrowseVideos([]);
    setBrowseError(null);
    setBrowseChannelName(null);
    setBrowseChannelAvatar(null);
    setSelectedVideoIds(new Set());
    setVideoStates(new Map());
  }, []);

  // Video selection
  const toggleVideoSelection = useCallback((id: string) => {
    setSelectedVideoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllVideos = useCallback(() => {
    setSelectedVideoIds(new Set(browseVideos.map((v) => v.id)));
  }, [browseVideos]);

  const deselectAllVideos = useCallback(() => {
    setSelectedVideoIds(new Set());
  }, []);

  // Download selected videos (with concurrency pool + per-channel subfolder)
  const downloadSelectedVideos = useCallback(
    async (overrideQuality?: string, overrideFormat?: string, overrideVideoCodec?: string) => {
      const videosToDownload = browseVideos.filter((v) => selectedVideoIds.has(v.id));
      if (videosToDownload.length === 0) return;

      let currentOutputPath = outputPath;
      let quality = overrideQuality || 'best';
      let format = overrideFormat || 'mp4';
      let videoCodec: string = overrideVideoCodec || 'auto';
      let audioBitrate = 'auto';
      let subtitleMode = 'off';
      let subtitleLangs: string[] = [];
      let subtitleEmbed = false;
      let subtitleFormat = 'srt';
      let logStderr = true;
      let useBunRuntime = false;
      let useActualPlayerJs = false;
      let embedMetadata = false;
      let embedThumbnail = false;
      let liveFromStart = false;
      let speedLimit: string | null = null;
      let sponsorBlockArgs = { remove: null as string | null, mark: null as string | null };

      try {
        const saved = localStorage.getItem('youwee-settings');
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<DownloadSettings>;
          currentOutputPath = currentOutputPath || parsed.outputPath || '';
          if (!overrideQuality) quality = parsed.quality || 'best';
          if (!overrideFormat) format = parsed.format || 'mp4';
          if (!overrideVideoCodec) videoCodec = parsed.videoCodec || 'auto';
          audioBitrate = parsed.audioBitrate || 'auto';
          subtitleMode = parsed.subtitleMode || 'off';
          subtitleLangs = parsed.subtitleLangs || [];
          subtitleEmbed = parsed.subtitleEmbed || false;
          subtitleFormat = parsed.subtitleFormat || 'srt';
          useBunRuntime = parsed.useBunRuntime || false;
          useActualPlayerJs = parsed.useActualPlayerJs || false;
          embedMetadata = parsed.embedMetadata || false;
          embedThumbnail = parsed.embedThumbnail || false;
          liveFromStart = parsed.liveFromStart || false;
          if (parsed.speedLimitEnabled && parsed.speedLimitValue) {
            speedLimit = `${parsed.speedLimitValue}${parsed.speedLimitUnit || 'M'}`;
          }
          sponsorBlockArgs = buildSponsorBlockArgs(parsed);
        }
        logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
      } catch (_e) {
        /* ignore */
      }

      if (!currentOutputPath) {
        throw new Error('No output path configured. Please set a download folder in Settings.');
      }

      // Per-channel subfolder: append sanitized channel name
      const channelName =
        browseChannelName ||
        followedChannelsRef.current.find((c) => c.url === browseUrl)?.name ||
        null;
      if (channelName) {
        const folderName = sanitizeChannelFolderName(channelName);
        currentOutputPath = `${currentOutputPath}/${folderName}`;
      }

      const { cookieMode, cookieBrowser, cookieBrowserProfile, cookieFilePath } =
        getCookieSettings();
      const proxyUrl = getProxyUrl();

      // Determine concurrency from followed channel settings
      const followedCh = followedChannelsRef.current.find((c) => c.url === browseUrl);
      const maxConcurrent = Math.max(1, followedCh?.download_threads ?? 1);

      setIsDownloading(true);

      // Mark all selected as pending
      setVideoStates((prev) => {
        const next = new Map(prev);
        for (const video of videosToDownload) {
          next.set(video.id, { status: 'pending', progress: 0, speed: '' });
        }
        return next;
      });

      const downloadOne = async (video: PlaylistVideoEntry) => {
        const downloadId = `channel-${video.id}-${Date.now()}`;
        downloadIdMapRef.current.set(downloadId, { videoId: video.id, channelUrl: browseUrl });

        setDownloadingIds((prev) => new Set([...prev, video.id]));

        // Mark as downloading
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(video.id, { status: 'downloading', progress: 0, speed: '' });
          return next;
        });

        try {
          await invoke('download_video', {
            id: downloadId,
            url: video.url,
            outputPath: currentOutputPath,
            quality,
            format,
            downloadPlaylist: false,
            videoCodec,
            audioBitrate,
            playlistLimit: null,
            subtitleMode,
            subtitleLangs: subtitleLangs.join(','),
            subtitleEmbed,
            subtitleFormat,
            logStderr,
            useBunRuntime,
            useActualPlayerJs,
            cookieMode,
            cookieBrowser,
            cookieBrowserProfile,
            cookieFilePath,
            proxyUrl,
            embedMetadata,
            embedThumbnail,
            liveFromStart,
            speedLimit,
            sponsorblockRemove: sponsorBlockArgs.remove,
            sponsorblockMark: sponsorBlockArgs.mark,
            historyId: null,
            title: video.title || null,
            thumbnail: video.thumbnail || null,
            source: detectPlatform(browseUrl) || 'youtube',
          });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`Failed to download ${video.title}:`, error);
          setVideoStates((prev) => {
            const next = new Map(prev);
            next.set(video.id, { status: 'error', progress: 0, speed: '', error: msg });
            return next;
          });
        }
      };

      try {
        // Concurrency pool: run up to maxConcurrent downloads at once
        const queue = [...videosToDownload];
        const running: Promise<void>[] = [];

        while (queue.length > 0 || running.length > 0) {
          // Fill up to maxConcurrent slots
          while (running.length < maxConcurrent && queue.length > 0) {
            const video = queue.shift();
            if (!video) break;
            const promise = downloadOne(video).then(() => {
              running.splice(running.indexOf(promise), 1);
            });
            running.push(promise);
          }
          // Wait for at least one to finish
          if (running.length > 0) {
            await Promise.race(running);
          }
        }
      } finally {
        setIsDownloading(false);
        setDownloadingIds(new Set());
      }
    },
    [
      browseUrl,
      browseVideos,
      browseChannelName,
      selectedVideoIds,
      outputPath,
      getCookieSettings,
      getProxyUrl,
    ],
  );

  // Stop all downloads
  const stopDownload = useCallback(async () => {
    try {
      await invoke('stop_download');
    } catch (error) {
      console.error('Failed to stop downloads:', error);
    } finally {
      setIsDownloading(false);
      setDownloadingIds(new Set());
    }
  }, []);

  // Listen for download progress events — match downloadId back to videoId
  useEffect(() => {
    const unlisten = listen<DownloadProgress>('download-progress', (event) => {
      const progress = event.payload;
      const mapping = downloadIdMapRef.current.get(progress.id);
      if (!mapping) return; // Not a channel download

      const { videoId, channelUrl } = mapping;

      if (progress.status === 'finished') {
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(videoId, { status: 'completed', progress: 100, speed: '' });
          return next;
        });
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
        downloadIdMapRef.current.delete(progress.id);

        // Persist download status to DB
        invoke('update_channel_video_status_by_video_id', {
          channelUrl,
          videoId,
          status: 'downloaded',
        }).catch((e) => console.error('Failed to update video status in DB:', e));

        // Update tray menu (download completed = count changed)
        invoke('rebuild_tray_menu_cmd').catch(() => {});
      } else if (progress.status === 'error') {
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            status: 'error',
            progress: 0,
            speed: '',
            error: progress.error_message || 'Download failed',
          });
          return next;
        });
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
        downloadIdMapRef.current.delete(progress.id);
      } else {
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            status: 'downloading',
            progress: progress.percent,
            speed: progress.speed,
          });
          return next;
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Refresh active channel videos
  const refreshActiveChannelVideos = useCallback(async () => {
    if (!activeChannel) return;
    setLoadingActiveVideos(true);
    try {
      const videos = await invoke<ChannelVideo[]>('get_saved_channel_videos', {
        channelId: activeChannel.id,
        status: null,
        limit: 100,
      });
      setActiveChannelVideos(videos);
    } catch (error) {
      console.error('Failed to fetch channel videos:', error);
    } finally {
      setLoadingActiveVideos(false);
    }
  }, [activeChannel]);

  // Refresh followed channels' name and avatar from YouTube
  const refreshFollowedChannelInfo = useCallback(async () => {
    const { cookieMode, cookieBrowser, cookieBrowserProfile, cookieFilePath } = getCookieSettings();
    const proxyUrl = getProxyUrl();

    try {
      const channels = await invoke<FollowedChannel[]>('get_followed_channels');
      let updated = false;

      for (const ch of channels) {
        try {
          const info = await invoke<{ name: string; avatar_url: string | null }>(
            'get_channel_info',
            {
              url: ch.url,
              cookieMode,
              cookieBrowser,
              cookieBrowserProfile,
              cookieFilePath,
              proxyUrl,
            },
          );

          // Update if name or avatar changed, but guard against overwriting
          // good values with bad fallback defaults (e.g. "Channel" / null)
          const fetchedNameIsBad = !info.name || info.name === 'Channel';
          const storedNameIsGood = ch.name && ch.name !== 'Channel';

          // Don't overwrite a good name with the generic fallback
          if (fetchedNameIsBad && storedNameIsGood) {
            continue;
          }

          const newName = fetchedNameIsBad ? ch.name : info.name;
          // Keep existing avatar if the new one is null
          const newAvatar = info.avatar_url || ch.thumbnail || null;

          const nameChanged = newName !== ch.name;
          const avatarChanged = (newAvatar || null) !== (ch.thumbnail || null);

          if (nameChanged || avatarChanged) {
            await invoke('update_channel_info', {
              id: ch.id,
              name: newName,
              thumbnail: newAvatar,
            });
            updated = true;
          }
        } catch {
          // Skip channels that fail
        }
      }

      if (updated) {
        await refreshChannels();
      }
    } catch {
      // ignore
    }
  }, [getCookieSettings, getProxyUrl, refreshChannels]);

  // Load on mount
  useEffect(() => {
    refreshChannels();
    refreshChannelNewCounts();
    // Refresh channel names/avatars in background (non-blocking)
    refreshFollowedChannelInfo();
  }, [refreshChannels, refreshChannelNewCounts, refreshFollowedChannelInfo]);

  // Listen for new videos events from backend polling
  useEffect(() => {
    const unlisten = listen<{
      channel_id: string;
      channel_name: string;
      new_count: number;
      total_new: number;
    }>('channel-new-videos', (event) => {
      // Update the specific channel's count
      setChannelNewCounts((prev) => ({
        ...prev,
        [event.payload.channel_id]: event.payload.new_count,
      }));
      refreshChannels();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshChannels]);

  // Listen for fetch progress events (non-flat-playlist platforms)
  useEffect(() => {
    const unlisten = listen<{ fetched: number; limit: number }>(
      'channel-fetch-progress',
      (event) => {
        setBrowseFetchProgress(event.payload);
      },
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for tray menu channel clicks — navigate to the clicked channel
  useEffect(() => {
    const unlisten = listen<string>('tray-open-channel', (event) => {
      const channelId = event.payload;
      const channel = followedChannelsRef.current.find((c) => c.id === channelId);
      if (channel) {
        setActiveChannel(channel);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for auto-download events from backend polling
  useEffect(() => {
    const unlisten = listen<{
      channel_id: string;
      channel_name: string;
      quality: string;
      format: string;
      download_threads: number;
    }>('channel-auto-download', async (event) => {
      const { channel_id, channel_name, quality, format, download_threads } = event.payload;

      try {
        const newVideos = await invoke<ChannelVideo[]>('get_saved_channel_videos', {
          channelId: channel_id,
          status: 'new',
          limit: 50,
        });

        if (newVideos.length === 0) return;

        let autoOutputPath = '';
        let logStderr = true;
        let useBunRuntime = false;
        let useActualPlayerJs = false;

        try {
          const saved = localStorage.getItem('youwee-settings');
          if (saved) {
            const parsed = JSON.parse(saved);
            autoOutputPath = parsed.outputPath || '';
            useBunRuntime = parsed.useBunRuntime || false;
            useActualPlayerJs = parsed.useActualPlayerJs || false;
          }
          logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
        } catch (_e) {
          /* ignore */
        }

        if (!autoOutputPath) return;

        // Per-channel subfolder
        const folderName = sanitizeChannelFolderName(channel_name);
        autoOutputPath = `${autoOutputPath}/${folderName}`;

        const { cookieMode, cookieBrowser, cookieBrowserProfile, cookieFilePath } =
          getCookieSettings();
        const proxyUrl = getProxyUrl();

        const maxConcurrent = Math.max(1, download_threads || 1);

        const downloadOneAuto = async (video: ChannelVideo) => {
          const downloadId = `auto-${video.video_id}-${Date.now()}`;

          await invoke('update_channel_video_status', { id: video.id, status: 'downloading' });

          try {
            await invoke('download_video', {
              id: downloadId,
              url: video.url,
              outputPath: autoOutputPath,
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
              cookieMode,
              cookieBrowser,
              cookieBrowserProfile,
              cookieFilePath,
              proxyUrl,
            });

            await invoke('update_channel_video_status', { id: video.id, status: 'downloaded' });
          } catch (error) {
            console.error(`Auto-download failed for ${video.title}:`, error);
            await invoke('update_channel_video_status', { id: video.id, status: 'new' });
          }
        };

        // Concurrency pool for auto-download
        const queue = [...newVideos];
        const running: Promise<void>[] = [];

        while (queue.length > 0 || running.length > 0) {
          while (running.length < maxConcurrent && queue.length > 0) {
            const video = queue.shift();
            if (!video) break;
            const promise = downloadOneAuto(video).then(() => {
              running.splice(running.indexOf(promise), 1);
            });
            running.push(promise);
          }
          if (running.length > 0) {
            await Promise.race(running);
          }
        }

        refreshChannelNewCounts();
        // Update tray menu after auto-downloads
        invoke('rebuild_tray_menu_cmd').catch(() => {});
      } catch (error) {
        console.error('Auto-download error:', error);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [getCookieSettings, getProxyUrl, refreshChannelNewCounts]);

  // Refresh active channel videos when activeChannel changes
  useEffect(() => {
    if (activeChannel) {
      refreshActiveChannelVideos();
    }
  }, [activeChannel, refreshActiveChannelVideos]);

  return (
    <ChannelsContext.Provider
      value={{
        followedChannels,
        loadingChannels,
        refreshChannels,
        followChannel,
        unfollowChannel,
        refreshFollowedChannelInfo,
        updateChannelSettings,
        browseUrl,
        setBrowseUrl,
        browseVideos,
        browseLoading,
        browseError,
        browseChannelName,
        browseChannelAvatar,
        browseFetchProgress,
        fetchChannelVideos,
        clearBrowse,
        selectedVideoIds,
        toggleVideoSelection,
        selectAllVideos,
        deselectAllVideos,
        downloadSelectedVideos,
        stopDownload,
        isDownloading,
        downloadingIds,
        videoStates,
        outputPath,
        selectOutputFolder,
        activeChannel,
        setActiveChannel,
        activeChannelVideos,
        loadingActiveVideos,
        refreshActiveChannelVideos,
        channelNewCounts,
        refreshChannelNewCounts,
      }}
    >
      {children}
    </ChannelsContext.Provider>
  );
}

export function useChannels() {
  const context = useContext(ChannelsContext);
  if (!context) {
    throw new Error('useChannels must be used within a ChannelsProvider');
  }
  return context;
}

export { isSupportedPlatform };
