import { useCallback, useEffect, useRef, useState } from 'react';
import { localizeProgressError, localizeUnknownError } from '@/lib/backend-error';
import { buildCookieProxyInvokeOptions, loadNetworkSettings } from '@/lib/network-config';
import {
  enqueuePluginWorkflowTrigger,
  loadPluginWorkflowSnapshots,
  loadPostDownloadWorkflowSteps,
  refreshPostDownloadWorkflowSteps,
} from '@/lib/post-download-plugins';
import type {
  ChannelVideo,
  DownloadSettings,
  FollowedChannel,
  PlaylistVideoEntry,
  PostDownloadPluginPayload,
} from '@/lib/types';
import { DEFAULT_SPONSORBLOCK_CATEGORIES } from '@/lib/types';
import {
  type ChannelAutoDownloadEvent,
  downloadVideoCommand,
  followChannelCommand,
  getChannelInfo,
  getChannelVideos,
  getFollowedChannels,
  getNewVideosCount,
  getSavedChannelVideos,
  onChannelAutoDownload,
  onChannelFetchProgress,
  onChannelNewVideos,
  onDownloadProgress,
  onTrayOpenChannel,
  pickChannelsOutputFolder,
  rebuildTrayMenu,
  saveChannelVideos,
  stopDownloadCommand,
  unfollowChannelCommand,
  updateChannelInfoCommand,
  updateChannelLastChecked,
  updateChannelSettingsCommand,
  updateChannelVideoStatus,
  updateChannelVideoStatusByVideoId,
} from './channels-client';

/** Supported platform definitions for channel detection.
 *  Easily extensible — add a new entry to support more platforms. */
const SUPPORTED_PLATFORMS = [
  { platform: 'youtube', hosts: ['youtube.com', 'youtu.be'] },
  { platform: 'bilibili', hosts: ['bilibili.com', 'b23.tv'] },
  { platform: 'youku', hosts: ['youku.com'] },
] as const;

const CHANNEL_BROWSE_BATCH_SIZE = 100;

export type Platform = (typeof SUPPORTED_PLATFORMS)[number]['platform'] | 'other';

type ChannelFetchProgress = {
  requestId: number | null;
  fetched: number;
  limit: number | null;
};

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
export function isSupportedPlatform(url: string): boolean {
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

    // Youku patterns: i.youku.com/i/{uid} or youku.com/profile/index/?uid={uid}
    if (host === 'i.youku.com') {
      const uidMatch = u.pathname.match(/^\/i\/([^/]+)/);
      if (uidMatch) return uidMatch[1];
    }
    if (host === 'youku.com' && u.pathname.includes('/profile/')) {
      const uid = u.searchParams.get('uid');
      if (uid) return uid;
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

export interface ChannelsContextType {
  // Followed channels
  followedChannels: FollowedChannel[];
  loadingChannels: boolean;
  refreshChannels: () => Promise<void>;
  followChannel: (
    url: string,
    name: string,
    thumbnail?: string,
    downloadSettings?: {
      quality: string;
      format: string;
      videoCodec: string;
      audioBitrate: string;
    },
  ) => Promise<string>;
  unfollowChannel: (id: string) => Promise<void>;
  refreshFollowedChannelInfo: () => Promise<void>;
  updateChannelSettings: (settings: {
    id: string;
    checkInterval: number;
    autoDownload: boolean;
    downloadQuality: string;
    downloadFormat: string;
    downloadVideoCodec?: string;
    downloadAudioBitrate?: string;
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
  browseFetchProgress: ChannelFetchProgress | null;
  browseHasMore: boolean;
  browseLoadingMore: boolean;
  fetchChannelVideos: (url: string, limit?: number | null) => Promise<void>;
  loadMoreChannelVideos: () => Promise<void>;
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

export function useChannelsController(): ChannelsContextType {
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
  const [browseFetchProgress, setBrowseFetchProgress] = useState<ChannelFetchProgress | null>(null);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);

  // Selection state
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    refreshPostDownloadWorkflowSteps();
  }, []);

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
  const browseVideosRef = useRef<PlaylistVideoEntry[]>([]);

  useEffect(() => {
    browseVideosRef.current = browseVideos;
  }, [browseVideos]);

  // Select output folder
  const selectOutputFolder = useCallback(async () => {
    try {
      const folder = await pickChannelsOutputFolder(outputPath || undefined);

      if (folder) {
        setOutputPath(folder);
        // Save to youwee-settings in localStorage
        try {
          const saved = localStorage.getItem('youwee-settings');
          const settings = saved ? JSON.parse(saved) : {};
          settings.outputPath = folder;
          localStorage.setItem('youwee-settings', JSON.stringify(settings));
        } catch {
          /* ignore */
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
    }
  }, [outputPath]);

  const getNetworkOptions = useCallback(() => {
    const { cookieSettings, proxySettings } = loadNetworkSettings();
    return buildCookieProxyInvokeOptions(cookieSettings, proxySettings);
  }, []);

  // Sync browse videos to channel_videos DB for a followed channel
  const syncVideosToDb = useCallback(
    async (
      channelId: string,
      videos: PlaylistVideoEntry[],
      options?: { updateLastVideoId?: boolean; initialStatus?: ChannelVideo['status'] },
    ) => {
      if (videos.length === 0) return;

      const now = new Date().toISOString();
      const initialStatus = options?.initialStatus ?? 'new';
      const channelVideos: ChannelVideo[] = videos.map((v) => ({
        id: crypto.randomUUID(),
        channel_id: channelId,
        video_id: v.id,
        title: v.title,
        url: v.url,
        thumbnail: v.thumbnail,
        duration: v.duration,
        upload_date: v.upload_date,
        status: initialStatus,
        created_at: now,
      }));

      try {
        await saveChannelVideos(channelId, channelVideos);

        if (options?.updateLastVideoId ?? true) {
          // Update last_video_id to the newest video from the first fetched batch only.
          await updateChannelLastChecked(channelId, videos[0].id);
        }
      } catch (error) {
        console.error('Failed to sync videos to DB:', error);
      }
    },
    [],
  );

  // Refresh followed channels list
  const refreshChannels = useCallback(async () => {
    setLoadingChannels(true);
    try {
      const channels = await getFollowedChannels();
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
      const channels = await getFollowedChannels();
      const counts: Record<string, number> = {};
      for (const ch of channels) {
        try {
          const count = await getNewVideosCount(ch.id);
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
    async (
      url: string,
      name: string,
      thumbnail?: string,
      downloadSettings?: {
        quality: string;
        format: string;
        videoCodec: string;
        audioBitrate: string;
      },
    ) => {
      const id = await followChannelCommand({
        url,
        name,
        thumbnail: thumbnail || null,
        platform: detectPlatform(url),
        downloadQuality: downloadSettings?.quality || 'best',
        downloadFormat: downloadSettings?.format || 'mp4',
        downloadVideoCodec: downloadSettings?.videoCodec || 'auto',
        downloadAudioBitrate: downloadSettings?.audioBitrate || '192',
      });
      await refreshChannels();

      // Immediately sync current browseVideos to DB (no need to wait for polling)
      if (browseVideos.length > 0) {
        await syncVideosToDb(id, browseVideos);
        await refreshChannelNewCounts();
      }

      // Update tray menu with new channel
      rebuildTrayMenu().catch(() => {});

      return id;
    },
    [refreshChannels, browseVideos, syncVideosToDb, refreshChannelNewCounts],
  );

  // Unfollow a channel
  const unfollowChannel = useCallback(
    async (id: string) => {
      await unfollowChannelCommand(id);
      setFollowedChannels((prev) => prev.filter((c) => c.id !== id));
      if (activeChannel?.id === id) {
        setActiveChannel(null);
        setActiveChannelVideos([]);
      }
      // Update tray menu
      rebuildTrayMenu().catch(() => {});
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
      downloadVideoCodec?: string;
      downloadAudioBitrate?: string;
      filterMinDuration?: number | null;
      filterMaxDuration?: number | null;
      filterIncludeKeywords?: string | null;
      filterExcludeKeywords?: string | null;
      filterMaxVideos?: number | null;
      downloadThreads?: number;
    }) => {
      await updateChannelSettingsCommand({
        id: settings.id,
        checkInterval: settings.checkInterval,
        autoDownload: settings.autoDownload,
        downloadQuality: settings.downloadQuality,
        downloadFormat: settings.downloadFormat,
        downloadVideoCodec: settings.downloadVideoCodec ?? 'auto',
        downloadAudioBitrate: settings.downloadAudioBitrate ?? '192',
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

  const fetchChannelVideosBatch = useCallback(
    async (url: string, options?: { limit?: number | null; append?: boolean }) => {
      const requestId = ++fetchRequestIdRef.current;
      const effectiveLimit = options?.limit ?? CHANNEL_BROWSE_BATCH_SIZE;
      const isLoadMore = options?.append ?? false;
      const start = isLoadMore ? browseVideosRef.current.length + 1 : 1;

      if (isLoadMore) {
        setBrowseLoadingMore(true);
        setBrowseError(null);
      } else {
        setBrowseUrl(url);
        setBrowseLoading(true);
        setBrowseError(null);
        setBrowseVideos([]);
        setBrowseChannelName(null);
        setBrowseChannelAvatar(null);
        setBrowseHasMore(false);
        setSelectedVideoIds(new Set());
        setVideoStates(new Map());
      }
      setBrowseFetchProgress(null);

      const networkOptions = getNetworkOptions();

      try {
        const videosPromise = getChannelVideos({
          url,
          limit: effectiveLimit,
          start,
          requestId: requestId,
          ...networkOptions,
        });
        const channelInfoPromise = isLoadMore
          ? Promise.resolve(null)
          : getChannelInfo({
              url,
              ...networkOptions,
            }).catch(() => null);

        const [videos, channelInfo] = await Promise.all([videosPromise, channelInfoPromise]);

        // Discard stale response if a newer fetch was triggered
        if (requestId !== fetchRequestIdRef.current) return;

        setBrowseHasMore(videos.length === effectiveLimit);
        setBrowseVideos((prev) => {
          if (!isLoadMore) return videos;

          const next = new Map(prev.map((video) => [video.id, video]));
          for (const video of videos) {
            next.set(video.id, video);
          }
          return Array.from(next.values());
        });

        // Use channel info from dedicated command, fallback to video metadata
        // Treat "Channel" (the Rust default) as a failure so we can use better fallbacks
        const hasValidChannelInfo =
          !isLoadMore && channelInfo?.name && channelInfo.name !== 'Channel';

        if (hasValidChannelInfo) {
          setBrowseChannelName(channelInfo.name);
          setBrowseChannelAvatar(channelInfo.avatar_url);
        } else if (!isLoadMore) {
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
          await syncVideosToDb(followedChannel.id, videos, {
            updateLastVideoId: !isLoadMore,
            initialStatus: isLoadMore ? 'skipped' : 'new',
          });
          await refreshChannelNewCounts();

          // Load statuses from DB and merge into videoStates
          try {
            const savedVideos = await getSavedChannelVideos({
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
        const msg = localizeUnknownError(error);
        setBrowseError(msg);
      } finally {
        // Only update loading state if this is still the current request
        if (requestId === fetchRequestIdRef.current) {
          if (isLoadMore) {
            setBrowseLoadingMore(false);
          } else {
            setBrowseLoading(false);
          }
          setBrowseFetchProgress(null);
        }
      }
    },
    [getNetworkOptions, syncVideosToDb, refreshChannelNewCounts],
  );

  const fetchChannelVideos = useCallback(
    async (url: string, limit?: number | null) => {
      await fetchChannelVideosBatch(url, { limit, append: false });
    },
    [fetchChannelVideosBatch],
  );

  const loadMoreChannelVideos = useCallback(async () => {
    if (!browseUrl || browseLoading || browseLoadingMore || !browseHasMore) return;
    await fetchChannelVideosBatch(browseUrl, {
      limit: CHANNEL_BROWSE_BATCH_SIZE,
      append: true,
    });
  }, [browseHasMore, browseLoading, browseLoadingMore, browseUrl, fetchChannelVideosBatch]);

  // Clear browse state
  const clearBrowse = useCallback(() => {
    fetchRequestIdRef.current += 1;
    browseVideosRef.current = [];
    setBrowseUrl('');
    setBrowseVideos([]);
    setBrowseError(null);
    setBrowseChannelName(null);
    setBrowseChannelAvatar(null);
    setBrowseHasMore(false);
    setBrowseLoadingMore(false);
    setBrowseFetchProgress(null);
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
      let useAria2 = false;
      let aria2Args = '';
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
          useAria2 = parsed.useAria2 === true;
          aria2Args = parsed.aria2Args || '';
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

      const networkOptions = getNetworkOptions();

      // Determine concurrency from followed channel settings
      const followedCh = followedChannelsRef.current.find((c) => c.url === browseUrl);
      const maxConcurrent = Math.max(1, followedCh?.download_threads ?? 1);
      const workflowSnapshots = loadPluginWorkflowSnapshots();
      const queuedDownloads = videosToDownload.map((video) => ({
        video,
        downloadId: `channel-${video.id}-${Date.now()}-${crypto.randomUUID()}`,
      }));

      setIsDownloading(true);

      // Mark all selected as pending
      setVideoStates((prev) => {
        const next = new Map(prev);
        for (const video of videosToDownload) {
          next.set(video.id, { status: 'pending', progress: 0, speed: '' });
        }
        return next;
      });

      for (const { video, downloadId } of queuedDownloads) {
        const payload: PostDownloadPluginPayload = {
          jobId: downloadId,
          source: detectPlatform(browseUrl) || 'youtube',
          trigger: 'download.queued',
          filepath: '',
          filename: video.title || video.url,
          directory: currentOutputPath,
          filesize: null,
          format,
          quality,
          url: video.url,
          title: video.title || null,
          thumbnail: video.thumbnail || null,
          historyId: null,
          timeRange: null,
          downloadKind: 'channel-manual',
          workflowRunId: null,
          workflowStepIndex: null,
          workflowStepPluginId: null,
          chainState: null,
        };
        void enqueuePluginWorkflowTrigger('download.queued', payload, workflowSnapshots).catch(
          (error) => {
            console.error('Failed to enqueue channel manual download.queued workflow:', error);
          },
        );
      }

      const downloadOne = async ({
        video,
        downloadId,
      }: {
        video: PlaylistVideoEntry;
        downloadId: string;
      }) => {
        downloadIdMapRef.current.set(downloadId, { videoId: video.id, channelUrl: browseUrl });

        setDownloadingIds((prev) => new Set([...prev, video.id]));

        // Mark as downloading
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(video.id, { status: 'downloading', progress: 0, speed: '' });
          return next;
        });

        try {
          await downloadVideoCommand({
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
            ...networkOptions,
            embedMetadata,
            embedThumbnail,
            liveFromStart,
            speedLimit,
            useAria2,
            aria2Args,
            sponsorblockRemove: sponsorBlockArgs.remove,
            sponsorblockMark: sponsorBlockArgs.mark,
            historyId: null,
            title: video.title || null,
            thumbnail: video.thumbnail || null,
            source: detectPlatform(browseUrl) || 'youtube',
            pluginWorkflowSnapshots: workflowSnapshots,
            postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
            downloadKind: 'channel-manual',
          });
        } catch (error) {
          const msg = localizeUnknownError(error);
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
        const queue = [...queuedDownloads];
        const running: Promise<void>[] = [];

        while (queue.length > 0 || running.length > 0) {
          // Fill up to maxConcurrent slots
          while (running.length < maxConcurrent && queue.length > 0) {
            const queuedDownload = queue.shift();
            if (!queuedDownload) break;
            const promise = downloadOne(queuedDownload).then(() => {
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
    [browseUrl, browseVideos, browseChannelName, selectedVideoIds, outputPath, getNetworkOptions],
  );

  // Stop all downloads
  const stopDownload = useCallback(async () => {
    try {
      await stopDownloadCommand();
    } catch (error) {
      console.error('Failed to stop downloads:', error);
    } finally {
      setIsDownloading(false);
      setDownloadingIds(new Set());
    }
  }, []);

  // Listen for download progress events — match downloadId back to videoId
  useEffect(() => {
    const unlisten = onDownloadProgress((event) => {
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
        updateChannelVideoStatusByVideoId({
          channelUrl,
          videoId,
          status: 'downloaded',
        }).catch((e) => console.error('Failed to update video status in DB:', e));

        // Update tray menu (download completed = count changed)
        rebuildTrayMenu().catch(() => {});
      } else if (progress.status === 'error') {
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            status: 'error',
            progress: 0,
            speed: '',
            error:
              localizeProgressError(
                progress.error_code,
                progress.error_message,
                progress.error_params,
              ) || 'Download failed',
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
      const videos = await getSavedChannelVideos({
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
    const networkOptions = getNetworkOptions();

    try {
      const channels = await getFollowedChannels();
      let updated = false;

      for (const ch of channels) {
        try {
          const info = await getChannelInfo({
            url: ch.url,
            ...networkOptions,
          });

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
            await updateChannelInfoCommand({
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
  }, [getNetworkOptions, refreshChannels]);

  // Load on mount
  useEffect(() => {
    refreshChannels();
    refreshChannelNewCounts();
    // Refresh channel names/avatars in background (non-blocking)
    refreshFollowedChannelInfo();
  }, [refreshChannels, refreshChannelNewCounts, refreshFollowedChannelInfo]);

  // Listen for new videos events from backend polling
  useEffect(() => {
    const unlisten = onChannelNewVideos((event) => {
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
    const unlisten = onChannelFetchProgress<ChannelFetchProgress>((event) => {
      if (event.payload.requestId !== fetchRequestIdRef.current) return;
      setBrowseFetchProgress(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for tray menu channel clicks — navigate to the clicked channel
  useEffect(() => {
    const unlisten = onTrayOpenChannel((event) => {
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
    const unlisten = onChannelAutoDownload(async (event: { payload: ChannelAutoDownloadEvent }) => {
      const {
        channel_id,
        channel_name,
        quality,
        format,
        video_codec,
        audio_bitrate,
        download_threads,
      } = event.payload;

      try {
        const newVideos = await getSavedChannelVideos({
          channelId: channel_id,
          status: 'new',
          limit: 50,
        });

        if (newVideos.length === 0) return;

        let autoOutputPath = '';
        let logStderr = true;
        let useBunRuntime = false;
        let useActualPlayerJs = false;
        let useAria2 = false;
        let aria2Args = '';

        try {
          const saved = localStorage.getItem('youwee-settings');
          if (saved) {
            const parsed = JSON.parse(saved);
            autoOutputPath = parsed.outputPath || '';
            useBunRuntime = parsed.useBunRuntime || false;
            useActualPlayerJs = parsed.useActualPlayerJs || false;
            useAria2 = parsed.useAria2 === true;
            aria2Args = parsed.aria2Args || '';
          }
          logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
        } catch (_e) {
          /* ignore */
        }

        if (!autoOutputPath) return;

        // Per-channel subfolder
        const folderName = sanitizeChannelFolderName(channel_name);
        autoOutputPath = `${autoOutputPath}/${folderName}`;

        const networkOptions = getNetworkOptions();

        const maxConcurrent = Math.max(1, download_threads || 1);
        const workflowSnapshots = loadPluginWorkflowSnapshots();
        const queuedAutoDownloads = newVideos.map((video) => ({
          video,
          downloadId: `auto-${video.video_id}-${Date.now()}-${crypto.randomUUID()}`,
        }));

        for (const { video, downloadId } of queuedAutoDownloads) {
          const payload: PostDownloadPluginPayload = {
            jobId: downloadId,
            source: detectPlatform(video.url) || 'youtube',
            trigger: 'download.queued',
            filepath: '',
            filename: video.title || video.url,
            directory: autoOutputPath,
            filesize: null,
            format,
            quality,
            url: video.url,
            title: video.title || null,
            thumbnail: video.thumbnail || null,
            historyId: null,
            timeRange: null,
            downloadKind: 'channel-auto',
            workflowRunId: null,
            workflowStepIndex: null,
            workflowStepPluginId: null,
            chainState: null,
          };
          void enqueuePluginWorkflowTrigger('download.queued', payload, workflowSnapshots).catch(
            (error) => {
              console.error('Failed to enqueue channel auto download.queued workflow:', error);
            },
          );
        }

        const downloadOneAuto = async ({
          video,
          downloadId,
        }: {
          video: ChannelVideo;
          downloadId: string;
        }) => {
          await updateChannelVideoStatus({ id: video.id, status: 'downloading' });

          try {
            await downloadVideoCommand({
              id: downloadId,
              url: video.url,
              outputPath: autoOutputPath,
              quality,
              format,
              downloadPlaylist: false,
              videoCodec: video_codec,
              audioBitrate: audio_bitrate,
              playlistLimit: null,
              subtitleMode: 'off',
              subtitleLangs: '',
              subtitleEmbed: false,
              subtitleFormat: 'srt',
              logStderr,
              useBunRuntime,
              useActualPlayerJs,
              ...networkOptions,
              useAria2,
              aria2Args,
              pluginWorkflowSnapshots: workflowSnapshots,
              postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
              downloadKind: 'channel-auto',
            });

            await updateChannelVideoStatus({ id: video.id, status: 'downloaded' });
          } catch (error) {
            console.error(`Auto-download failed for ${video.title}:`, error);
            await updateChannelVideoStatus({ id: video.id, status: 'new' });
          }
        };

        // Concurrency pool for auto-download
        const queue = [...queuedAutoDownloads];
        const running: Promise<void>[] = [];

        while (queue.length > 0 || running.length > 0) {
          while (running.length < maxConcurrent && queue.length > 0) {
            const queuedDownload = queue.shift();
            if (!queuedDownload) break;
            const promise = downloadOneAuto(queuedDownload).then(() => {
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
        rebuildTrayMenu().catch(() => {});
      } catch (error) {
        console.error('Auto-download error:', error);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [getNetworkOptions, refreshChannelNewCounts]);

  // Refresh active channel videos when activeChannel changes
  useEffect(() => {
    if (activeChannel) {
      refreshActiveChannelVideos();
    }
  }, [activeChannel, refreshActiveChannelVideos]);

  return {
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
    browseHasMore,
    browseLoadingMore,
    fetchChannelVideos,
    loadMoreChannelVideos,
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
  };
}
