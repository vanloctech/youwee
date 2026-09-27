import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { localizeProgressError, localizeUnknownError } from '@/lib/backend-error';
import { isTikTokChannelContentUrl, matchesChannelContentType } from '@/lib/channel-content';
import { createClientId } from '@/lib/client-id';
import {
  type CreatorProcessingSettings,
  enqueueCreatorVideo,
  listCreatorJobs,
  loadCreatorProcessingSettings,
  pauseCreatorProcessingQueue,
  resumeCreatorProcessingQueue,
  stopCreatorProcessingQueue,
  withCreatorOutputFolder,
} from '@/lib/creator-processing';
import {
  buildDownloadDuplicateIdentity,
  getDownloadDuplicateIdentityKey,
} from '@/lib/download-duplicates';
import { sanitizeFilenameMetadataFields } from '@/lib/download-settings';
import { announceGlobalOutputPath, onGlobalOutputPathChanged } from '@/lib/global-output-path';
import { buildCookieProxyInvokeOptions, loadNetworkSettings } from '@/lib/network-config';
import {
  enqueuePluginWorkflowTrigger,
  loadPluginWorkflowSnapshots,
  loadPostDownloadWorkflowSteps,
  refreshPostDownloadWorkflowSteps,
} from '@/lib/post-download-plugins';
import type {
  ChannelScanOrder,
  ChannelVideo,
  DownloadDuplicateMatch,
  DownloadSettings,
  FollowedChannel,
  PlaylistVideoEntry,
  PostDownloadPluginPayload,
  YoutubeChannelContentType,
  YtdlpAdvancedOption,
} from '@/lib/types';
import { DEFAULT_SPONSORBLOCK_CATEGORIES } from '@/lib/types';
import { sanitizeYtdlpAdvancedOptions } from '@/lib/ytdlp-advanced-options';
import { useDownload } from '../download-context';
import {
  buildChannelCollectionOptions,
  persistManualChannelDownloadCompletion,
} from './channel-downloads';
import {
  bulkFollowChannelsCommand,
  bulkUnfollowChannelsCommand,
  bulkUpdateChannelCreatorProcessingCommand,
  bulkUpdateChannelSettingsCommand,
  type ChannelAutoDownloadEvent,
  completeChannelBatchItem,
  discardChannelBatch,
  downloadVideoCommand,
  followChannelCommand,
  getChannelInfo,
  getChannelVideos,
  getFollowedChannels,
  getNewVideosCount,
  getSavedChannelVideos,
  getSavedChannelVideosByVideoIds,
  listPendingChannelBatch,
  onChannelAutoDownload,
  onChannelFetchProgress,
  onChannelNewVideos,
  onDownloadProgress,
  onTrayOpenChannel,
  pickChannelsOutputFolder,
  rebuildTrayMenu,
  saveChannelBatchItems,
  saveChannelVideos,
  setChannelBatchItemStatus,
  stopChannelFetchCommand,
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
  { platform: 'tiktok', hosts: ['tiktok.com'] },
] as const;

const CHANNEL_BROWSE_BATCH_SIZE = 100;
const CHANNEL_FETCH_LIMIT_STORAGE_KEY = 'youwee-channel-fetch-limit';
const SHOW_DOWNLOADED_VIDEOS_STORAGE_KEY = 'youwee-show-downloaded-channel-videos';
const CHANNEL_SCAN_ORDER_STORAGE_KEY = 'youwee-channel-scan-order';
const MIN_CHANNEL_FETCH_LIMIT = 1;
const MAX_CHANNEL_FETCH_LIMIT = 500;
const BULK_CHANNEL_STATE_STORAGE_KEY = 'youwee-bulk-channel-state';
const DEFAULT_YOUTUBE_CONTENT_TYPE: YoutubeChannelContentType = 'videos';

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
  const platform = detectPlatform(url);
  return platform !== 'other' && (platform !== 'tiktok' || isTikTokChannelContentUrl(url));
}

function getYoutubeContentTypeSourceCount(contentType: YoutubeChannelContentType): number {
  return contentType === 'videos_shorts' ? 2 : 1;
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

    // TikTok creator profiles: /@handle
    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) {
      const tiktokMatch = u.pathname.match(/^\/@([^/]+)\/?$/);
      if (tiktokMatch) return `@${tiktokMatch[1]}`;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/** Sanitize a channel name to be safe as a filesystem folder name.
 *  Works across macOS, Windows, and Linux. */
export function sanitizeChannelFolderName(name: string): string {
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
  filepath?: string;
}

export interface ChannelBatchProgress {
  channelUrl: string;
  channelName: string | null;
  total: number;
  completed: number;
  failed: number;
  active: number;
  queued: number;
  editTotal: number;
  editCompleted: number;
  editActive: number;
  editInputPrefix?: string;
  editCurrentInputPath?: string;
  editCurrentCompleted?: number;
  editCurrentTotal?: number;
  editCurrentSeconds?: number;
  editCurrentDuration?: number;
  editCurrentPercent?: number;
  currentDownloadTitle?: string;
  errors?: Array<{ videoId: string; title: string; message: string }>;
}

export type BulkChannelPhase =
  | 'idle'
  | 'prepare'
  | 'fetching'
  | 'selecting'
  | 'downloading'
  | 'paused'
  | 'complete'
  | 'stopped';

export type BulkChannelJobStatus =
  | 'pending'
  | 'fetching'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'skipped'
  | 'failed'
  | 'stopped';

export interface BulkChannelJob {
  url: string;
  status: BulkChannelJobStatus;
  error?: string;
}

export interface BulkChannelOptions {
  urls: string[];
  videoCount: number;
  scanOrder: ChannelScanOrder;
  youtubeContentType: YoutubeChannelContentType;
  quality: string;
  format: string;
  videoCodec: string;
  preferredFps: string;
  creatorSettings: CreatorProcessingSettings;
}

export interface BulkChannelState {
  running: boolean;
  jobs: BulkChannelJob[];
  currentIndex: number;
  phase: BulkChannelPhase;
  error: string | null;
  options: BulkChannelOptions | null;
}

function loadPersistedBulkChannelState(): BulkChannelState {
  const empty: BulkChannelState = {
    running: false,
    jobs: [],
    currentIndex: 0,
    phase: 'idle',
    error: null,
    options: null,
  };
  try {
    const stored = localStorage.getItem(BULK_CHANNEL_STATE_STORAGE_KEY);
    if (!stored) return empty;
    const parsed = JSON.parse(stored) as Partial<BulkChannelState>;
    if (parsed.phase === 'stopped' || parsed.phase === 'idle') {
      localStorage.removeItem(BULK_CHANNEL_STATE_STORAGE_KEY);
      return empty;
    }
    if (!Array.isArray(parsed.jobs) || parsed.jobs.length === 0 || !parsed.options) return empty;
    const currentIndex = Math.min(
      Math.max(0, Number(parsed.currentIndex) || 0),
      parsed.jobs.length,
    );
    const unfinished = currentIndex < parsed.jobs.length;
    return {
      running: false,
      jobs: parsed.jobs,
      currentIndex,
      phase: unfinished ? 'paused' : 'complete',
      error: typeof parsed.error === 'string' ? parsed.error : null,
      options: parsed.options,
    };
  } catch {
    return empty;
  }
}

function normalizeProgressPath(value: string): string {
  return value
    .replace(/^\\\\\?\\/, '')
    .replace(/^\/\/\?\//, '')
    .replace(/[\\/]+/g, '/')
    .toLowerCase();
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
      preferredFps: string;
      audioBitrate: string;
    },
    youtubeContentType?: YoutubeChannelContentType,
    creatorProcessing?: CreatorProcessingSettings,
  ) => Promise<string>;
  unfollowChannel: (id: string) => Promise<void>;
  bulkFollowChannels: (input: {
    urls: string[];
    downloadQuality?: string;
    downloadFormat?: string;
    downloadVideoCodec?: string;
    downloadPreferredFps?: string;
    downloadAudioBitrate?: string;
    youtubeContentType?: YoutubeChannelContentType;
    creatorProcessing?: CreatorProcessingSettings;
  }) => Promise<void>;
  bulkUnfollowChannels: (ids: string[]) => Promise<void>;
  bulkUpdateChannelSettings: (input: {
    ids: string[];
    checkInterval: number;
    autoDownload: boolean;
    downloadQuality: string;
    downloadFormat: string;
    downloadVideoCodec: string;
    downloadPreferredFps?: string;
    downloadAudioBitrate: string;
    downloadThreads: number;
    youtubeContentType?: YoutubeChannelContentType;
    creatorProcessing?: CreatorProcessingSettings;
  }) => Promise<void>;
  bulkUpdateChannelCreatorProcessing: (input: {
    ids: string[];
    creatorProcessing: CreatorProcessingSettings;
  }) => Promise<void>;
  refreshFollowedChannelInfo: () => Promise<void>;
  updateChannelSettings: (settings: {
    id: string;
    checkInterval: number;
    autoDownload: boolean;
    downloadQuality: string;
    downloadFormat: string;
    downloadVideoCodec?: string;
    downloadPreferredFps?: string;
    downloadAudioBitrate?: string;
    filterMinDuration?: number | null;
    filterMaxDuration?: number | null;
    filterIncludeKeywords?: string | null;
    filterExcludeKeywords?: string | null;
    filterMaxVideos?: number | null;
    downloadThreads?: number;
    youtubeContentType?: YoutubeChannelContentType;
    creatorProcessing?: CreatorProcessingSettings;
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
  browseYoutubeContentType: YoutubeChannelContentType;
  channelScanOrder: ChannelScanOrder;
  setChannelScanOrder: (order: ChannelScanOrder) => void;
  channelFetchLimit: number;
  setChannelFetchLimit: (limit: number) => void;
  showDownloadedVideos: boolean;
  setShowDownloadedVideos: (show: boolean) => void;
  fetchChannelVideos: (
    url: string,
    limit?: number | null,
    youtubeContentType?: YoutubeChannelContentType,
    scanOrder?: ChannelScanOrder,
  ) => Promise<void>;
  loadMoreChannelVideos: () => Promise<void>;
  stopChannelFetch: () => Promise<void>;
  clearBrowse: () => void;

  // Video selection & download
  selectedVideoIds: Set<string>;
  toggleVideoSelection: (id: string) => void;
  selectAllVideos: (contentType?: YoutubeChannelContentType) => void;
  selectNewestUndownloaded: (
    count: number | null,
    contentType?: YoutubeChannelContentType,
  ) => Promise<void>;
  deselectAllVideos: () => void;
  downloadSelectedVideos: (
    quality?: string,
    format?: string,
    videoCodec?: string,
    preferredFps?: string,
    creatorSettingsOverride?: CreatorProcessingSettings,
  ) => Promise<void>;
  stopDownload: () => Promise<void>;
  isDownloading: boolean;
  downloadingIds: Set<string>;
  channelProgressByUrl: Record<string, ChannelBatchProgress>;
  bulkChannelState: BulkChannelState;
  startBulkChannelDownload: (options: BulkChannelOptions) => void;
  stopBulkChannelDownload: () => void;
  pauseBulkChannelDownload: () => void;
  resumeBulkChannelDownload: () => void;

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
  const { filterDownloadedDuplicateCandidates } = useDownload();

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
  const [browseYoutubeContentType, setBrowseYoutubeContentType] =
    useState<YoutubeChannelContentType>(DEFAULT_YOUTUBE_CONTENT_TYPE);
  const [channelScanOrder, setChannelScanOrderState] = useState<ChannelScanOrder>(() => {
    try {
      return localStorage.getItem(CHANNEL_SCAN_ORDER_STORAGE_KEY) === 'popular'
        ? 'popular'
        : 'latest';
    } catch {
      return 'latest';
    }
  });
  const [channelFetchLimit, setChannelFetchLimitState] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(CHANNEL_FETCH_LIMIT_STORAGE_KEY));
      return Number.isFinite(saved) && saved > 0
        ? Math.min(MAX_CHANNEL_FETCH_LIMIT, Math.max(MIN_CHANNEL_FETCH_LIMIT, Math.floor(saved)))
        : CHANNEL_BROWSE_BATCH_SIZE;
    } catch {
      return CHANNEL_BROWSE_BATCH_SIZE;
    }
  });
  const [showDownloadedVideos, setShowDownloadedVideosState] = useState(() => {
    try {
      return localStorage.getItem(SHOW_DOWNLOADED_VIDEOS_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setChannelFetchLimit = useCallback((limit: number) => {
    const next = Number.isFinite(limit)
      ? Math.min(MAX_CHANNEL_FETCH_LIMIT, Math.max(MIN_CHANNEL_FETCH_LIMIT, Math.floor(limit)))
      : CHANNEL_BROWSE_BATCH_SIZE;
    setChannelFetchLimitState(next);
    try {
      localStorage.setItem(CHANNEL_FETCH_LIMIT_STORAGE_KEY, String(next));
    } catch {
      // Ignore unavailable local storage.
    }
  }, []);

  const setShowDownloadedVideos = useCallback((show: boolean) => {
    setShowDownloadedVideosState(show);
    try {
      localStorage.setItem(SHOW_DOWNLOADED_VIDEOS_STORAGE_KEY, String(show));
    } catch {
      // Ignore unavailable local storage.
    }
  }, []);

  const setChannelScanOrder = useCallback((order: ChannelScanOrder) => {
    setChannelScanOrderState(order);
    try {
      localStorage.setItem(CHANNEL_SCAN_ORDER_STORAGE_KEY, order);
    } catch {
      // Ignore unavailable local storage.
    }
  }, []);

  // Selection state
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [restoredBatchReady, setRestoredBatchReady] = useState(false);
  const [channelProgressByUrl, setChannelProgressByUrl] = useState<
    Record<string, ChannelBatchProgress>
  >({});
  const channelProgressRef = useRef<Record<string, ChannelBatchProgress>>({});
  const downloadStopGenerationRef = useRef<Record<string, number>>({});
  const bulkRunGenerationRef = useRef(0);
  const [bulkChannelState, setBulkChannelState] = useState<BulkChannelState>(
    loadPersistedBulkChannelState,
  );

  useEffect(() => {
    localStorage.setItem(BULK_CHANNEL_STATE_STORAGE_KEY, JSON.stringify(bulkChannelState));
  }, [bulkChannelState]);

  const currentChannelProgress = channelProgressByUrl[browseUrl];
  const isDownloading = Boolean(
    currentChannelProgress &&
      (currentChannelProgress.active > 0 || currentChannelProgress.queued > 0),
  );

  // Creator processing is a persistent queue. Polling keeps channel progress accurate even
  // when the queue continues while the user switches to another channel.
  useEffect(() => {
    let disposed = false;
    const refreshCreatorProgress = async () => {
      if (Object.keys(channelProgressRef.current).length === 0) return;
      try {
        const jobs = await listCreatorJobs();
        if (disposed) return;
        setChannelProgressByUrl((previous) => {
          const next = { ...previous };
          for (const [url, progress] of Object.entries(next)) {
            const channelJobs = progress.editInputPrefix
              ? jobs.filter((job) =>
                  normalizeProgressPath(job.inputPath).startsWith(
                    normalizeProgressPath(progress.editInputPrefix || ''),
                  ),
                )
              : jobs;
            next[url] = {
              ...progress,
              editTotal: Math.max(progress.editTotal, channelJobs.length),
              editCompleted: channelJobs.filter((job) => job.status === 'completed').length,
              editActive: channelJobs.filter(
                (job) => job.status === 'pending' || job.status === 'running',
              ).length,
            };
            channelProgressRef.current[url] = next[url];
          }
          return next;
        });
      } catch {
        // The queue is unavailable during first-run database initialization.
      }
    };
    void refreshCreatorProgress();
    const timer = window.setInterval(() => void refreshCreatorProgress(), 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<{
      inputPath: string;
      completed: number;
      total: number;
      currentSeconds?: number;
      durationSeconds?: number;
      percent?: number;
    }>('creator-processing-progress', (event) => {
      const payload = event.payload;
      setChannelProgressByUrl((previous) => {
        const next = { ...previous };
        for (const [url, progress] of Object.entries(next)) {
          if (
            progress.editInputPrefix &&
            normalizeProgressPath(payload.inputPath).startsWith(
              normalizeProgressPath(progress.editInputPrefix),
            )
          ) {
            next[url] = {
              ...progress,
              editCurrentInputPath: payload.inputPath,
              editCurrentCompleted: payload.completed,
              editCurrentTotal: payload.total,
              editCurrentSeconds: payload.currentSeconds,
              editCurrentDuration: payload.durationSeconds,
              editCurrentPercent: payload.percent,
            };
            channelProgressRef.current[url] = next[url];
          }
        }
        return next;
      });
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  const updateChannelProgress = useCallback(
    (
      channelUrl: string,
      update:
        | Partial<ChannelBatchProgress>
        | ((current: ChannelBatchProgress) => ChannelBatchProgress),
    ) => {
      setChannelProgressByUrl((previous) => {
        const current = channelProgressRef.current[channelUrl] ||
          previous[channelUrl] || {
            channelUrl,
            channelName: null,
            total: 0,
            completed: 0,
            failed: 0,
            active: 0,
            queued: 0,
            editTotal: 0,
            editCompleted: 0,
            editActive: 0,
            editInputPrefix: undefined,
          };
        const next = typeof update === 'function' ? update(current) : { ...current, ...update };
        channelProgressRef.current[channelUrl] = next;
        return { ...previous, [channelUrl]: next };
      });
    },
    [],
  );

  useEffect(() => {
    refreshPostDownloadWorkflowSteps();
    // Persisted jobs already contain their own settings snapshot. Resume them
    // regardless of the current global template used for future downloads.
    void resumeCreatorProcessingQueue();
    void listPendingChannelBatch()
      .then((batch) => {
        if (!batch) return;
        setBrowseUrl(batch.channelUrl);
        setBrowseChannelName(batch.channelName);
        setBrowseYoutubeContentType(batch.contentType);
        browseYoutubeContentTypeRef.current = batch.contentType;
        browseFetchedCountRef.current = batch.videos.length;
        setBrowseVideos(batch.videos);
        setSelectedVideoIds(new Set(batch.videos.map((video) => video.id)));
        setRestoredBatchReady(true);
      })
      .catch((error) => console.error('Cannot restore channel batch:', error));
  }, []);

  // Per-video download progress: videoId -> state
  const [videoStates, setVideoStates] = useState<Map<string, VideoDownloadState>>(new Map());
  // Map downloadId -> { videoId, channelUrl } (to match progress events back to videos and update DB)
  const downloadIdMapRef = useRef<
    Map<
      string,
      { videoId: string; channelUrl: string; title?: string; persistChannelStatus: boolean }
    >
  >(new Map());
  const creatorSettingsByDownloadRef = useRef<Map<string, CreatorProcessingSettings>>(new Map());

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

  useEffect(() => onGlobalOutputPathChanged(setOutputPath), []);

  // Active channel detail
  const [activeChannel, setActiveChannel] = useState<FollowedChannel | null>(null);
  const [activeChannelVideos, setActiveChannelVideos] = useState<ChannelVideo[]>([]);
  const [loadingActiveVideos, setLoadingActiveVideos] = useState(false);

  // Per-channel new videos count
  const [channelNewCounts, setChannelNewCounts] = useState<Record<string, number>>({});

  // Ref for followedChannels to avoid stale closures
  const followedChannelsRef = useRef<FollowedChannel[]>([]);
  const browseVideosRef = useRef<PlaylistVideoEntry[]>([]);
  const browseFetchedCountRef = useRef(0);
  const browseYoutubeContentTypeRef = useRef<YoutubeChannelContentType>(
    DEFAULT_YOUTUBE_CONTENT_TYPE,
  );
  const browseScanOrderRef = useRef<ChannelScanOrder>('latest');

  useEffect(() => {
    browseVideosRef.current = browseVideos;
  }, [browseVideos]);

  useEffect(() => {
    browseYoutubeContentTypeRef.current = browseYoutubeContentType;
  }, [browseYoutubeContentType]);

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
        announceGlobalOutputPath(folder);
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
        id: createClientId(),
        channel_id: channelId,
        video_id: v.id,
        title: v.title,
        url: v.url,
        thumbnail: v.thumbnail,
        duration: v.duration,
        upload_date: v.upload_date,
        status: initialStatus,
        created_at: now,
        downloaded_at: undefined,
        output_path: undefined,
        edited_output_paths: [],
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
        preferredFps: string;
        audioBitrate: string;
      },
      youtubeContentType?: YoutubeChannelContentType,
      creatorProcessing?: CreatorProcessingSettings,
    ) => {
      const platform = detectPlatform(url);
      const id = await followChannelCommand({
        url,
        name,
        thumbnail: thumbnail || null,
        platform,
        downloadQuality: downloadSettings?.quality || 'best',
        downloadFormat: downloadSettings?.format || 'mp4',
        downloadVideoCodec: downloadSettings?.videoCodec || 'auto',
        downloadPreferredFps: downloadSettings?.preferredFps === '30' ? '30' : 'original',
        downloadAudioBitrate: downloadSettings?.audioBitrate || '192',
        youtubeContentType:
          platform === 'youtube' || platform === 'tiktok'
            ? (youtubeContentType ?? browseYoutubeContentTypeRef.current)
            : DEFAULT_YOUTUBE_CONTENT_TYPE,
        creatorProcessing: creatorProcessing ?? {
          ...loadCreatorProcessingSettings(),
          outputFolder: '',
        },
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

  const bulkFollowChannels = useCallback(
    async (input: {
      urls: string[];
      downloadQuality?: string;
      downloadFormat?: string;
      downloadVideoCodec?: string;
      downloadPreferredFps?: string;
      downloadAudioBitrate?: string;
      youtubeContentType?: YoutubeChannelContentType;
      creatorProcessing?: CreatorProcessingSettings;
    }) => {
      await bulkFollowChannelsCommand(input);
      await refreshChannels();
      await refreshChannelNewCounts();
      rebuildTrayMenu().catch(() => {});
    },
    [refreshChannels, refreshChannelNewCounts],
  );

  const bulkUnfollowChannels = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await bulkUnfollowChannelsCommand(ids);
      setFollowedChannels((prev) => prev.filter((channel) => !ids.includes(channel.id)));
      if (activeChannel && ids.includes(activeChannel.id)) {
        setActiveChannel(null);
        setActiveChannelVideos([]);
      }
      await refreshChannelNewCounts();
      rebuildTrayMenu().catch(() => {});
    },
    [activeChannel, refreshChannelNewCounts],
  );

  const bulkUpdateChannelSettings = useCallback(
    async (input: {
      ids: string[];
      checkInterval: number;
      autoDownload: boolean;
      downloadQuality: string;
      downloadFormat: string;
      downloadVideoCodec: string;
      downloadPreferredFps?: string;
      downloadAudioBitrate: string;
      downloadThreads: number;
      youtubeContentType?: YoutubeChannelContentType;
      creatorProcessing?: CreatorProcessingSettings;
    }) => {
      await bulkUpdateChannelSettingsCommand(input);
      await refreshChannels();
    },
    [refreshChannels],
  );

  const bulkUpdateChannelCreatorProcessing = useCallback(
    async (input: { ids: string[]; creatorProcessing: CreatorProcessingSettings }) => {
      await bulkUpdateChannelCreatorProcessingCommand(input);
      await refreshChannels();
    },
    [refreshChannels],
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
      downloadPreferredFps?: string;
      downloadAudioBitrate?: string;
      filterMinDuration?: number | null;
      filterMaxDuration?: number | null;
      filterIncludeKeywords?: string | null;
      filterExcludeKeywords?: string | null;
      filterMaxVideos?: number | null;
      downloadThreads?: number;
      youtubeContentType?: YoutubeChannelContentType;
      creatorProcessing?: CreatorProcessingSettings;
    }) => {
      await updateChannelSettingsCommand({
        id: settings.id,
        checkInterval: settings.checkInterval,
        autoDownload: settings.autoDownload,
        downloadQuality: settings.downloadQuality,
        downloadFormat: settings.downloadFormat,
        downloadVideoCodec: settings.downloadVideoCodec ?? 'auto',
        downloadPreferredFps: settings.downloadPreferredFps === '30' ? '30' : 'original',
        downloadAudioBitrate: settings.downloadAudioBitrate ?? '192',
        filterMinDuration: settings.filterMinDuration ?? null,
        filterMaxDuration: settings.filterMaxDuration ?? null,
        filterIncludeKeywords: settings.filterIncludeKeywords ?? null,
        filterExcludeKeywords: settings.filterExcludeKeywords ?? null,
        filterMaxVideos: settings.filterMaxVideos ?? null,
        downloadThreads: settings.downloadThreads ?? 1,
        youtubeContentType: settings.youtubeContentType ?? DEFAULT_YOUTUBE_CONTENT_TYPE,
        creatorProcessing: settings.creatorProcessing ??
          activeChannel?.creator_processing ?? {
            ...loadCreatorProcessingSettings(),
            mode: 'none',
            outputFolder: '',
          },
      });
      await refreshChannels();
    },
    [activeChannel, refreshChannels],
  );

  // Fetch videos from a channel URL (browse mode)
  // Request ID ref to detect stale responses from concurrent/cancelled fetches
  const fetchRequestIdRef = useRef(0);

  const fetchChannelVideosBatch = useCallback(
    async (
      url: string,
      options?: {
        limit?: number | null;
        append?: boolean;
        youtubeContentType?: YoutubeChannelContentType;
        scanOrder?: ChannelScanOrder;
      },
    ) => {
      await stopChannelFetchCommand().catch(() => {});

      const requestId = ++fetchRequestIdRef.current;
      const effectiveLimit = options?.limit ?? channelFetchLimit;
      const isLoadMore = options?.append ?? false;
      const youtubeContentType = options?.youtubeContentType ?? browseYoutubeContentTypeRef.current;
      const scanOrder = options?.scanOrder ?? browseScanOrderRef.current;
      const sourceCount =
        detectPlatform(url) === 'youtube'
          ? getYoutubeContentTypeSourceCount(youtubeContentType)
          : 1;
      const start = isLoadMore ? Math.floor(browseFetchedCountRef.current / sourceCount) + 1 : 1;

      if (isLoadMore) {
        setBrowseLoadingMore(true);
        setBrowseError(null);
      } else {
        setBrowseUrl(url);
        setBrowseYoutubeContentType(youtubeContentType);
        browseYoutubeContentTypeRef.current = youtubeContentType;
        browseScanOrderRef.current = scanOrder;
        setBrowseLoading(true);
        setBrowseError(null);
        setBrowseVideos([]);
        setBrowseChannelName(null);
        setBrowseChannelAvatar(null);
        setBrowseHasMore(false);
        setSelectedVideoIds(new Set());
        setVideoStates(new Map());
        browseFetchedCountRef.current = 0;
      }
      setBrowseFetchProgress(null);

      const networkOptions = getNetworkOptions();

      try {
        const channelInfoPromise = isLoadMore
          ? Promise.resolve(null)
          : getChannelInfo({
              url,
              youtubeContentType,
              ...networkOptions,
            }).catch(() => null);

        // The limit is the number of videos to show, not the number of entries
        // yt-dlp happened to inspect. Keep paging until we have enough new
        // videos when downloaded items are hidden.
        const fetchedVideos: PlaylistVideoEntry[] = [];
        const fetchedIds = new Set<string>();
        let nextStart = start;
        let lastPageWasFull = false;
        let lastPageLength = 0;
        let visibleVideos: PlaylistVideoEntry[] = [];

        for (let page = 0; page < 50; page += 1) {
          const pageVideos = await getChannelVideos({
            url,
            limit: effectiveLimit,
            start: nextStart,
            requestId,
            youtubeContentType,
            scanOrder,
            ...networkOptions,
          });
          if (requestId !== fetchRequestIdRef.current) return;
          lastPageLength = pageVideos.length;
          for (const video of pageVideos) {
            if (fetchedIds.has(video.id)) continue;
            fetchedIds.add(video.id);
            fetchedVideos.push(video);
          }

          lastPageWasFull =
            pageVideos.length >=
            (scanOrder === 'popular' ? effectiveLimit : effectiveLimit * sourceCount);
          visibleVideos = showDownloadedVideos
            ? fetchedVideos.slice(0, effectiveLimit)
            : (
                await filterDownloadedDuplicateCandidates(
                  fetchedVideos.map((video) => ({
                    video,
                    url: video.url,
                    title: video.title || video.url,
                    duplicateIdentity: buildDownloadDuplicateIdentity(
                      video.url,
                      detectPlatform(video.url) === 'youtube' ? video.id : null,
                    ),
                  })),
                  { ask: false, notify: false, force: true, trustHistory: true },
                )
              ).map((candidate) => candidate.video);

          if (
            visibleVideos.length >= effectiveLimit ||
            !lastPageWasFull ||
            pageVideos.length === 0
          ) {
            break;
          }
          const pageAdvance = Math.max(
            1,
            scanOrder === 'popular'
              ? pageVideos.length
              : Math.floor(pageVideos.length / sourceCount),
          );
          const previousStart = nextStart;
          nextStart += pageAdvance;
          if (nextStart <= previousStart || fetchedVideos.length === 0) break;
        }

        // Discard stale response if duplicate lookup took long enough for another fetch.
        if (requestId !== fetchRequestIdRef.current) return;

        const videos = fetchedVideos;
        browseFetchedCountRef.current = isLoadMore
          ? browseFetchedCountRef.current + videos.length
          : videos.length;
        visibleVideos = visibleVideos.slice(0, effectiveLimit);
        setBrowseHasMore(
          lastPageWasFull && (lastPageLength > 0 || visibleVideos.length >= effectiveLimit),
        );
        setBrowseVideos((prev) => {
          if (!isLoadMore) return visibleVideos;

          const next = new Map(prev.map((video) => [video.id, video]));
          for (const video of visibleVideos) {
            next.set(video.id, video);
          }
          return Array.from(next.values());
        });

        if (showDownloadedVideos && videos.length > 0) {
          try {
            const identities = videos.map((video) =>
              buildDownloadDuplicateIdentity(
                video.url,
                detectPlatform(video.url) === 'youtube' ? video.id : null,
              ),
            );
            const matches = await invoke<DownloadDuplicateMatch[]>('find_duplicate_downloads', {
              identities,
            });
            const matchByKey = new Map<string, DownloadDuplicateMatch>();
            for (const match of matches) {
              for (const identity of [
                { mediaId: match.mediaId, canonicalUrl: null },
                { mediaId: null, canonicalUrl: match.canonicalUrl },
              ]) {
                const key = getDownloadDuplicateIdentityKey(identity);
                if (key) matchByKey.set(key, match);
              }
            }
            setVideoStates((previous) => {
              const next = new Map(previous);
              for (const video of videos) {
                const identity = buildDownloadDuplicateIdentity(
                  video.url,
                  detectPlatform(video.url) === 'youtube' ? video.id : null,
                );
                const match = matchByKey.get(getDownloadDuplicateIdentityKey(identity));
                if (match?.fileExists) {
                  next.set(video.id, {
                    status: 'completed',
                    progress: 100,
                    speed: '',
                    filepath: match.filepath,
                  });
                }
              }
              return next;
            });
          } catch {
            // Duplicate status is supplemental; keep the channel result visible.
          }
        }

        const channelInfo = await channelInfoPromise;

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
            const savedVideos = await getSavedChannelVideosByVideoIds({
              channelId: followedChannel.id,
              videoIds: videos.map((video) => video.id),
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
                  const existing = next.get(video.id);
                  next.set(video.id, {
                    status: 'completed',
                    progress: 100,
                    speed: '',
                    filepath: existing?.filepath,
                  });
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
    [
      channelFetchLimit,
      filterDownloadedDuplicateCandidates,
      getNetworkOptions,
      showDownloadedVideos,
      syncVideosToDb,
      refreshChannelNewCounts,
    ],
  );

  const fetchChannelVideos = useCallback(
    async (
      url: string,
      limit?: number | null,
      youtubeContentType?: YoutubeChannelContentType,
      scanOrder?: ChannelScanOrder,
    ) => {
      await fetchChannelVideosBatch(url, {
        limit,
        append: false,
        youtubeContentType,
        scanOrder,
      });
    },
    [fetchChannelVideosBatch],
  );

  const loadMoreChannelVideos = useCallback(async () => {
    if (!browseUrl || browseLoading || browseLoadingMore || !browseHasMore) return;
    await fetchChannelVideosBatch(browseUrl, {
      limit: channelFetchLimit,
      append: true,
      youtubeContentType: browseYoutubeContentTypeRef.current,
      scanOrder: browseScanOrderRef.current,
    });
  }, [
    browseHasMore,
    browseLoading,
    browseLoadingMore,
    browseUrl,
    channelFetchLimit,
    fetchChannelVideosBatch,
  ]);

  const stopChannelFetch = useCallback(async () => {
    fetchRequestIdRef.current += 1;
    await stopChannelFetchCommand().catch((error) => {
      console.error('Failed to stop channel fetch:', error);
    });
    setBrowseLoading(false);
    setBrowseLoadingMore(false);
    setBrowseFetchProgress(null);
  }, []);

  // Clear browse state
  const clearBrowse = useCallback(() => {
    fetchRequestIdRef.current += 1;
    stopChannelFetchCommand().catch(() => {});
    browseVideosRef.current = [];
    browseFetchedCountRef.current = 0;
    browseYoutubeContentTypeRef.current = DEFAULT_YOUTUBE_CONTENT_TYPE;
    browseScanOrderRef.current = 'latest';
    setBrowseUrl('');
    setBrowseVideos([]);
    setBrowseError(null);
    setBrowseChannelName(null);
    setBrowseChannelAvatar(null);
    setBrowseHasMore(false);
    setBrowseLoading(false);
    setBrowseLoadingMore(false);
    setBrowseYoutubeContentType(DEFAULT_YOUTUBE_CONTENT_TYPE);
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

  const selectAllVideos = useCallback(
    (contentType?: YoutubeChannelContentType) => {
      const platform = detectPlatform(browseUrl);
      const selectedContentType = contentType ?? browseYoutubeContentTypeRef.current;
      setSelectedVideoIds(
        new Set(
          browseVideos
            .filter((video) =>
              matchesChannelContentType(platform, selectedContentType, video.duration),
            )
            .map((video) => video.id),
        ),
      );
    },
    [browseUrl, browseVideos],
  );

  const selectNewestUndownloaded = useCallback(
    async (count: number | null, selectedContentType?: YoutubeChannelContentType) => {
      if (!browseUrl || browseLoading || browseLoadingMore) return;
      const contentType = selectedContentType ?? browseYoutubeContentTypeRef.current;
      browseYoutubeContentTypeRef.current = contentType;
      setBrowseYoutubeContentType(contentType);
      const requestId = ++fetchRequestIdRef.current;
      setBrowseLoading(true);
      setBrowseError(null);
      setSelectedVideoIds(new Set());
      setBrowseFetchProgress(null);

      const batchSize = 100;
      const isTikTok = detectPlatform(browseUrl) === 'tiktok';
      const fetchAllAtOnce = isTikTok && count === null;
      const unseenVideos: PlaylistVideoEntry[] = [];
      const unseenIds = new Set<string>();
      let start = 1;
      browseFetchedCountRef.current = 0;
      try {
        while (true) {
          const batch = await getChannelVideos({
            url: browseUrl,
            limit: fetchAllAtOnce ? null : batchSize,
            start,
            requestId,
            youtubeContentType: contentType,
            ...getNetworkOptions(),
          });
          if (requestId !== fetchRequestIdRef.current) return;
          browseFetchedCountRef.current += batch.length;

          const candidates = batch
            .filter((video) =>
              matchesChannelContentType(detectPlatform(browseUrl), contentType, video.duration),
            )
            .map((video) => ({
              video,
              url: video.url,
              title: video.title || video.url,
              duplicateIdentity: buildDownloadDuplicateIdentity(
                video.url,
                detectPlatform(video.url) === 'youtube' ? video.id : null,
              ),
            }));
          const unseen = await filterDownloadedDuplicateCandidates(candidates, {
            ask: false,
            notify: false,
            force: true,
            throwOnError: true,
            trustHistory: true,
          });
          for (const item of unseen) {
            if (!unseenIds.has(item.video.id)) {
              unseenIds.add(item.video.id);
              unseenVideos.push(item.video);
            }
          }
          if (count !== null && unseenVideos.length >= count) {
            const selected = unseenVideos.slice(0, count).map((video) => video.id);
            setBrowseVideos(unseenVideos);
            setSelectedVideoIds(new Set(selected));
            setBrowseHasMore(batch.length >= batchSize);
            return;
          }
          if (fetchAllAtOnce || batch.length < batchSize) {
            const selected = unseenVideos.map((video) => video.id);
            setBrowseVideos(unseenVideos);
            setSelectedVideoIds(new Set(selected));
            setBrowseHasMore(false);
            return;
          }
          start += batchSize;
        }
      } catch (error) {
        if (requestId === fetchRequestIdRef.current) setBrowseError(localizeUnknownError(error));
      } finally {
        if (requestId === fetchRequestIdRef.current) {
          setBrowseLoading(false);
          setBrowseFetchProgress(null);
        }
      }
    },
    [
      browseLoading,
      browseLoadingMore,
      browseUrl,
      filterDownloadedDuplicateCandidates,
      getNetworkOptions,
    ],
  );

  const deselectAllVideos = useCallback(() => {
    setSelectedVideoIds(new Set());
  }, []);

  // Download selected videos (with concurrency pool + per-channel subfolder)
  const downloadSelectedVideos = useCallback(
    async (
      overrideQuality?: string,
      overrideFormat?: string,
      overrideVideoCodec?: string,
      overridePreferredFps?: string,
      creatorSettingsOverride?: CreatorProcessingSettings,
    ) => {
      // Capture this synchronously on the click turn, before any duplicate
      // lookup awaits or channel switching can change the global setting.
      const creatorSettingsAtStart = creatorSettingsOverride ?? loadCreatorProcessingSettings();
      const currentProgress = channelProgressRef.current[browseUrl];
      if (currentProgress && (currentProgress.active > 0 || currentProgress.queued > 0)) {
        return;
      }
      const selectedVideosToDownload = browseVideos.filter((v) => selectedVideoIds.has(v.id));
      const duplicateCandidates = selectedVideosToDownload.map((video) => ({
        video,
        url: video.url,
        title: video.title || video.url,
        thumbnail: video.thumbnail,
        duplicateIdentity: buildDownloadDuplicateIdentity(
          video.url,
          detectPlatform(video.url) === 'youtube' ? video.id : null,
        ),
      }));
      const filteredDuplicateCandidates = await filterDownloadedDuplicateCandidates(
        duplicateCandidates,
        { ask: false, force: true, throwOnError: true, trustHistory: true },
      );
      const videosToDownload = filteredDuplicateCandidates.map((candidate) => candidate.video);
      const downloadIds = new Set(videosToDownload.map((video) => video.id));
      const alreadyDownloaded = selectedVideosToDownload.filter(
        (video) => !downloadIds.has(video.id),
      );
      await Promise.all(
        alreadyDownloaded.map((video) => completeChannelBatchItem(browseUrl, video.id)),
      );
      if (videosToDownload.length === 0) return;

      let currentOutputPath = outputPath;
      let quality = overrideQuality || 'best';
      let format = overrideFormat || 'mp4';
      let videoCodec: string = overrideVideoCodec || 'auto';
      let preferredFps = overridePreferredFps === '30' ? '30' : 'original';
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
      let ytdlpAdvancedOptionsEnabled = false;
      let ytdlpAdvancedOptions: YtdlpAdvancedOption[] = [];
      let embedMetadata = false;
      let embedThumbnail = false;
      let filenameMetadataEnabled = false;
      let filenameMetadataFields: DownloadSettings['filenameMetadataFields'] = [];
      let liveFromStart = false;
      let autoOrganizeCollections = false;
      let speedLimit: string | null = null;
      let sponsorBlockArgs = { remove: null as string | null, mark: null as string | null };

      try {
        const saved = localStorage.getItem('youwee-settings');
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<DownloadSettings>;
          currentOutputPath = parsed.outputPath || currentOutputPath || '';
          if (!overrideQuality) quality = parsed.quality || 'best';
          if (!overrideFormat) format = parsed.format || 'mp4';
          if (!overrideVideoCodec) videoCodec = parsed.videoCodec || 'auto';
          if (!overridePreferredFps) {
            preferredFps = parsed.preferredFps === '30' ? '30' : 'original';
          }
          audioBitrate = parsed.audioBitrate || 'auto';
          subtitleMode = parsed.subtitleMode || 'off';
          subtitleLangs = parsed.subtitleLangs || [];
          subtitleEmbed = parsed.subtitleEmbed || false;
          subtitleFormat = parsed.subtitleFormat || 'srt';
          useBunRuntime = parsed.useBunRuntime || false;
          useActualPlayerJs = parsed.useActualPlayerJs || false;
          useAria2 = parsed.useAria2 === true;
          aria2Args = parsed.aria2Args || '';
          ytdlpAdvancedOptionsEnabled = parsed.ytdlpAdvancedOptionsEnabled === true;
          ytdlpAdvancedOptions = sanitizeYtdlpAdvancedOptions(parsed.ytdlpAdvancedOptions);
          embedMetadata = parsed.embedMetadata || false;
          embedThumbnail = parsed.embedThumbnail || false;
          filenameMetadataEnabled = parsed.filenameMetadataEnabled === true;
          filenameMetadataFields = sanitizeFilenameMetadataFields(parsed.filenameMetadataFields);
          liveFromStart = parsed.liveFromStart || false;
          autoOrganizeCollections = parsed.autoOrganizeCollections === true;
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
      const channelCollectionName =
        channelName ||
        videosToDownload.find((video) => video.channel)?.channel ||
        extractChannelFromUrl(browseUrl) ||
        'Unknown channel';
      if (channelCollectionName) {
        const folderName = sanitizeChannelFolderName(channelCollectionName);
        currentOutputPath = `${currentOutputPath}/${folderName}`;
      }
      const collectionOptions = buildChannelCollectionOptions(
        { autoOrganizeCollections },
        channelCollectionName,
      );
      // Snapshot creator settings once per channel batch. Downloads can stay in
      // the queue for a while; reading localStorage inside each worker would let
      // a later channel's edit mode leak into this batch.
      const creatorSettingsSnapshot = withCreatorOutputFolder(
        creatorSettingsAtStart,
        currentOutputPath,
      );

      const networkOptions = getNetworkOptions();

      // Determine concurrency from followed channel settings
      const followedCh = followedChannelsRef.current.find((c) => c.url === browseUrl);
      const maxConcurrent = Math.min(5, Math.max(1, followedCh?.download_threads ?? 3));
      const workflowSnapshots = loadPluginWorkflowSnapshots();
      const queuedDownloads = videosToDownload.map((video) => ({
        video,
        downloadId: `channel-${video.id}-${Date.now()}-${createClientId()}`,
      }));

      await saveChannelBatchItems({
        channelUrl: browseUrl,
        channelName,
        contentType: browseYoutubeContentTypeRef.current,
        videos: videosToDownload,
      });

      const downloadGeneration = (downloadStopGenerationRef.current[browseUrl] || 0) + 1;
      downloadStopGenerationRef.current[browseUrl] = downloadGeneration;
      updateChannelProgress(browseUrl, {
        channelUrl: browseUrl,
        channelName,
        total: selectedVideosToDownload.length,
        completed: alreadyDownloaded.length,
        failed: 0,
        active: 0,
        queued: queuedDownloads.length,
        editTotal: creatorSettingsSnapshot.mode === 'none' ? 0 : queuedDownloads.length,
        editInputPrefix: currentOutputPath,
        errors: [],
      });

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
        downloadIdMapRef.current.set(downloadId, {
          videoId: video.id,
          channelUrl: browseUrl,
          title: video.title,
          persistChannelStatus: Boolean(followedCh),
        });
        creatorSettingsByDownloadRef.current.set(downloadId, creatorSettingsSnapshot);

        setDownloadingIds((prev) => new Set([...prev, video.id]));
        updateChannelProgress(browseUrl, (current) => ({
          ...current,
          active: current.active + 1,
          queued: Math.max(0, current.queued - 1),
          currentDownloadTitle: video.title,
        }));

        // Mark as downloading
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(video.id, { status: 'downloading', progress: 0, speed: '' });
          return next;
        });

        try {
          await setChannelBatchItemStatus(browseUrl, video.id, 'running');
          await persistManualChannelDownloadCompletion({
            downloadVideo: () =>
              downloadVideoCommand({
                id: downloadId,
                url: video.url,
                outputPath: currentOutputPath,
                quality,
                format,
                downloadPlaylist: false,
                videoCodec,
                preferredFps,
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
                filenameMetadataEnabled,
                filenameMetadataFields,
                liveFromStart,
                ...collectionOptions,
                speedLimit,
                useAria2,
                aria2Args,
                ytdlpAdvancedOptionsEnabled,
                ytdlpAdvancedOptions,
                sponsorblockRemove: sponsorBlockArgs.remove,
                sponsorblockMark: sponsorBlockArgs.mark,
                historyId: null,
                title: video.title || null,
                thumbnail: video.thumbnail || null,
                source: detectPlatform(browseUrl) || 'youtube',
                pluginWorkflowSnapshots: workflowSnapshots,
                postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
                downloadKind: 'channel-manual',
              }),
            markDownloaded: () =>
              followedCh
                ? updateChannelVideoStatusByVideoId({
                    channelUrl: browseUrl,
                    videoId: video.id,
                    status: 'downloaded',
                  })
                : Promise.resolve(),
            onPersistError: (error) => {
              console.error('Failed to update video status in DB:', error);
            },
          });
          await completeChannelBatchItem(browseUrl, video.id);
          updateChannelProgress(browseUrl, (current) => ({
            ...current,
            active: Math.max(0, current.active - 1),
            completed: current.completed + 1,
            currentDownloadTitle:
              Math.max(0, current.active - 1) === 0 ? undefined : current.currentDownloadTitle,
          }));
        } catch (error) {
          await setChannelBatchItemStatus(browseUrl, video.id, 'failed').catch((statusError) => {
            console.error('Failed to persist channel item failure:', statusError);
          });
          const msg = localizeUnknownError(error);
          console.error(`Failed to download ${video.title}:`, error);
          setVideoStates((prev) => {
            const next = new Map(prev);
            next.set(video.id, { status: 'error', progress: 0, speed: '', error: msg });
            return next;
          });
          updateChannelProgress(browseUrl, (current) => ({
            ...current,
            active: Math.max(0, current.active - 1),
            failed: current.failed + 1,
            errors: [
              ...(current.errors ?? []),
              { videoId: video.id, title: video.title, message: msg },
            ],
            currentDownloadTitle:
              Math.max(0, current.active - 1) === 0 ? undefined : current.currentDownloadTitle,
          }));
        }
      };

      try {
        // Concurrency pool: run up to maxConcurrent downloads at once
        const queue = [...queuedDownloads];
        const running: Promise<void>[] = [];

        while (queue.length > 0 || running.length > 0) {
          // Fill up to maxConcurrent slots
          while (
            downloadGeneration === downloadStopGenerationRef.current[browseUrl] &&
            running.length < maxConcurrent &&
            queue.length > 0
          ) {
            const queuedDownload = queue.shift();
            if (!queuedDownload) break;
            const promise = downloadOne(queuedDownload).finally(() => {
              running.splice(running.indexOf(promise), 1);
            });
            running.push(promise);
          }
          // Wait for at least one to finish
          if (running.length > 0) {
            await Promise.race(running);
          }
          if (
            downloadGeneration !== downloadStopGenerationRef.current[browseUrl] &&
            running.length === 0
          ) {
            break;
          }
        }
      } finally {
        updateChannelProgress(browseUrl, (current) => ({
          ...current,
          queued: 0,
          active: Math.max(0, current.active),
        }));
      }
    },
    [
      browseUrl,
      browseVideos,
      browseChannelName,
      selectedVideoIds,
      outputPath,
      getNetworkOptions,
      filterDownloadedDuplicateCandidates,
      updateChannelProgress,
    ],
  );

  useEffect(() => {
    if (!restoredBatchReady || isDownloading || selectedVideoIds.size === 0) return;
    setRestoredBatchReady(false);
    void downloadSelectedVideos().catch((error) => {
      console.error('Cannot resume channel batch:', error);
      setBrowseError(localizeUnknownError(error));
    });
  }, [downloadSelectedVideos, isDownloading, restoredBatchReady, selectedVideoIds.size]);

  // Stop all downloads
  const stopDownload = useCallback(async () => {
    if (browseUrl) {
      downloadStopGenerationRef.current[browseUrl] =
        (downloadStopGenerationRef.current[browseUrl] || 0) + 1;
      updateChannelProgress(browseUrl, (current) => ({
        ...current,
        queued: 0,
        active: 0,
        currentDownloadTitle: undefined,
      }));
    }
    setSelectedVideoIds(new Set());
    try {
      await stopDownloadCommand();
    } catch (error) {
      console.error('Failed to stop downloads:', error);
    } finally {
    }
  }, [browseUrl, updateChannelProgress]);

  const updateBulkJob = useCallback((index: number, patch: Partial<BulkChannelJob>) => {
    setBulkChannelState((current) => ({
      ...current,
      jobs: current.jobs.map((job, jobIndex) => (jobIndex === index ? { ...job, ...patch } : job)),
    }));
  }, []);

  const startBulkChannelDownload = useCallback((options: BulkChannelOptions) => {
    const urls = Array.from(new Set(options.urls.map((url) => url.trim()).filter(Boolean)));
    if (urls.length === 0) return;
    bulkRunGenerationRef.current += 1;
    setBulkChannelState({
      running: true,
      jobs: urls.map((url) => ({ url, status: 'pending' })),
      currentIndex: 0,
      phase: 'prepare',
      error: null,
      options: {
        ...options,
        urls,
        videoCount: Math.max(1, Math.floor(options.videoCount)),
        creatorSettings: { ...options.creatorSettings },
      },
    });
  }, []);

  const stopBulkChannelDownload = useCallback(() => {
    bulkRunGenerationRef.current += 1;
    setBulkChannelState({
      running: false,
      phase: 'idle',
      jobs: [],
      currentIndex: 0,
      error: null,
      options: null,
    });
    localStorage.removeItem(BULK_CHANNEL_STATE_STORAGE_KEY);
    void stopChannelFetch();
    void stopDownload();
    void stopCreatorProcessingQueue();
    void discardChannelBatch();
  }, [stopChannelFetch, stopDownload]);

  const pauseBulkChannelDownload = useCallback(() => {
    bulkRunGenerationRef.current += 1;
    if (browseUrl) {
      downloadStopGenerationRef.current[browseUrl] =
        (downloadStopGenerationRef.current[browseUrl] || 0) + 1;
    }
    setBulkChannelState((current) => ({
      ...current,
      running: false,
      phase: 'paused',
      jobs: current.jobs.map((job, index) =>
        index === current.currentIndex &&
        (job.status === 'fetching' || job.status === 'downloading')
          ? { ...job, status: 'paused' }
          : job,
      ),
    }));
    void stopChannelFetch();
    void pauseCreatorProcessingQueue();
  }, [browseUrl, stopChannelFetch]);

  const resumeBulkChannelDownload = useCallback(() => {
    bulkRunGenerationRef.current += 1;
    setBulkChannelState((current) => {
      if (current.phase !== 'paused' || !current.jobs[current.currentIndex]) return current;
      const currentUrl = current.jobs[current.currentIndex].url;
      return {
        ...current,
        running: true,
        phase: browseUrl === currentUrl && browseVideos.length > 0 ? 'selecting' : 'prepare',
        error: null,
      };
    });
    void resumeCreatorProcessingQueue();
  }, [browseUrl, browseVideos.length]);

  useEffect(() => {
    if (!bulkChannelState.running || bulkChannelState.phase !== 'prepare') return;
    const job = bulkChannelState.jobs[bulkChannelState.currentIndex];
    if (!job) {
      setBulkChannelState((current) => ({
        ...current,
        running: false,
        phase: 'complete',
      }));
      return;
    }
    clearBrowse();
    setBrowseUrl(job.url);
    updateBulkJob(bulkChannelState.currentIndex, { status: 'fetching', error: undefined });
    setBulkChannelState((current) => ({ ...current, phase: 'fetching' }));
  }, [
    bulkChannelState.currentIndex,
    bulkChannelState.jobs,
    bulkChannelState.phase,
    bulkChannelState.running,
    clearBrowse,
    updateBulkJob,
  ]);

  useEffect(() => {
    if (!bulkChannelState.running || bulkChannelState.phase !== 'fetching') return;
    const options = bulkChannelState.options;
    const job = bulkChannelState.jobs[bulkChannelState.currentIndex];
    if (!options || !job || browseUrl !== job.url) return;
    const generation = bulkRunGenerationRef.current;
    const contentType = isTikTokChannelContentUrl(job.url)
      ? 'videos_shorts'
      : options.youtubeContentType;
    void fetchChannelVideos(job.url, options.videoCount, contentType, options.scanOrder)
      .then(() => {
        if (generation !== bulkRunGenerationRef.current) return;
        setBulkChannelState((current) => ({ ...current, phase: 'selecting' }));
      })
      .catch((error) => {
        if (generation !== bulkRunGenerationRef.current) return;
        const message = localizeUnknownError(error);
        updateBulkJob(bulkChannelState.currentIndex, { status: 'failed', error: message });
        setBulkChannelState((current) => ({
          ...current,
          currentIndex: current.currentIndex + 1,
          phase: 'prepare',
          error: message,
        }));
      });
  }, [
    browseUrl,
    bulkChannelState.currentIndex,
    bulkChannelState.jobs,
    bulkChannelState.options,
    bulkChannelState.phase,
    bulkChannelState.running,
    fetchChannelVideos,
    updateBulkJob,
  ]);

  useEffect(() => {
    if (!bulkChannelState.running || bulkChannelState.phase !== 'selecting') return;
    const options = bulkChannelState.options;
    const job = bulkChannelState.jobs[bulkChannelState.currentIndex];
    if (!options || !job) return;
    const contentType = isTikTokChannelContentUrl(job.url)
      ? 'videos_shorts'
      : options.youtubeContentType;
    const platform = detectPlatform(job.url);
    const selectable = browseVideos.filter((video) =>
      matchesChannelContentType(platform, contentType, video.duration),
    );
    if (selectable.length === 0) {
      updateBulkJob(bulkChannelState.currentIndex, { status: 'skipped' });
      setBulkChannelState((current) => ({
        ...current,
        currentIndex: current.currentIndex + 1,
        phase: 'prepare',
      }));
      return;
    }
    setSelectedVideoIds(new Set(selectable.map((video) => video.id)));
    updateBulkJob(bulkChannelState.currentIndex, { status: 'downloading' });
    setBulkChannelState((current) => ({ ...current, phase: 'downloading' }));
  }, [
    browseVideos,
    bulkChannelState.currentIndex,
    bulkChannelState.jobs,
    bulkChannelState.options,
    bulkChannelState.phase,
    bulkChannelState.running,
    updateBulkJob,
  ]);

  useEffect(() => {
    if (!bulkChannelState.running || bulkChannelState.phase !== 'downloading') return;
    const options = bulkChannelState.options;
    const jobIndex = bulkChannelState.currentIndex;
    const job = bulkChannelState.jobs[jobIndex];
    if (!options || !job || selectedVideoIds.size === 0) return;
    const generation = bulkRunGenerationRef.current;
    void downloadSelectedVideos(
      options.quality,
      options.format,
      options.videoCodec,
      options.preferredFps,
      options.creatorSettings,
    )
      .then(() => {
        if (generation !== bulkRunGenerationRef.current) return;
        const progress = channelProgressRef.current[job.url];
        if (progress?.failed) {
          updateBulkJob(jobIndex, {
            status: 'failed',
            error: `${progress.failed}/${progress.total} video failed`,
          });
        } else {
          updateBulkJob(jobIndex, { status: 'completed', error: undefined });
        }
      })
      .catch((error) => {
        if (generation !== bulkRunGenerationRef.current) return;
        const message = localizeUnknownError(error);
        updateBulkJob(jobIndex, { status: 'failed', error: message });
        setBulkChannelState((current) => ({ ...current, error: message }));
      })
      .finally(() => {
        if (generation !== bulkRunGenerationRef.current) return;
        setBulkChannelState((current) => ({
          ...current,
          currentIndex: current.currentIndex + 1,
          phase: 'prepare',
        }));
      });
  }, [
    bulkChannelState.currentIndex,
    bulkChannelState.jobs,
    bulkChannelState.options,
    bulkChannelState.phase,
    bulkChannelState.running,
    downloadSelectedVideos,
    selectedVideoIds.size,
    updateBulkJob,
  ]);

  // Listen for download progress events — match downloadId back to videoId
  useEffect(() => {
    const unlisten = onDownloadProgress((event) => {
      const progress = event.payload;
      const mapping = downloadIdMapRef.current.get(progress.id);
      if (!mapping) return; // Not a channel download

      const { videoId, channelUrl, title, persistChannelStatus } = mapping;

      if (progress.status === 'finished') {
        setVideoStates((prev) => {
          const next = new Map(prev);
          next.set(videoId, {
            status: 'completed',
            progress: 100,
            speed: '',
            filepath: progress.filepath,
          });
          return next;
        });
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
        downloadIdMapRef.current.delete(progress.id);

        // Persist download status to DB
        if (persistChannelStatus) {
          updateChannelVideoStatusByVideoId({
            channelUrl,
            videoId,
            status: 'downloaded',
            filepath: progress.filepath || null,
          }).catch((e) => console.error('Failed to update video status in DB:', e));
        }

        // Update tray menu (download completed = count changed)
        rebuildTrayMenu().catch(() => {});

        const creatorSettings = creatorSettingsByDownloadRef.current.get(progress.id);
        creatorSettingsByDownloadRef.current.delete(progress.id);
        if (
          creatorSettings &&
          creatorSettings.mode !== 'none' &&
          progress.filepath &&
          creatorSettings.outputFolder
        ) {
          void enqueueCreatorVideo(progress.filepath, title, creatorSettings, {
            channelUrl,
            videoId,
          }).catch((error) => {
            console.error('Cannot queue creator processing:', error);
          });
        }
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
        status: 'downloaded',
        limit: 10_000,
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
            youtubeContentType: ch.youtube_content_type ?? DEFAULT_YOUTUBE_CONTENT_TYPE,
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
        preferred_fps,
        audio_bitrate,
        download_threads,
        creator_processing,
      } = event.payload;
      const autoChannelUrl =
        followedChannelsRef.current.find((channel) => channel.id === channel_id)?.url || '';

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
        let ytdlpAdvancedOptionsEnabled = false;
        let ytdlpAdvancedOptions: YtdlpAdvancedOption[] = [];
        let autoOrganizeCollections = false;
        let filenameMetadataEnabled = false;
        let filenameMetadataFields: DownloadSettings['filenameMetadataFields'] = [];

        try {
          const saved = localStorage.getItem('youwee-settings');
          if (saved) {
            const parsed = JSON.parse(saved) as Partial<DownloadSettings>;
            autoOutputPath = parsed.outputPath || '';
            useBunRuntime = parsed.useBunRuntime || false;
            useActualPlayerJs = parsed.useActualPlayerJs || false;
            useAria2 = parsed.useAria2 === true;
            aria2Args = parsed.aria2Args || '';
            ytdlpAdvancedOptionsEnabled = parsed.ytdlpAdvancedOptionsEnabled === true;
            ytdlpAdvancedOptions = sanitizeYtdlpAdvancedOptions(parsed.ytdlpAdvancedOptions);
            autoOrganizeCollections = parsed.autoOrganizeCollections === true;
            filenameMetadataEnabled = parsed.filenameMetadataEnabled === true;
            filenameMetadataFields = sanitizeFilenameMetadataFields(parsed.filenameMetadataFields);
          }
          logStderr = localStorage.getItem('youwee_log_stderr') !== 'false';
        } catch (_e) {
          /* ignore */
        }

        if (!autoOutputPath) return;

        // Per-channel subfolder
        const folderName = sanitizeChannelFolderName(channel_name);
        autoOutputPath = `${autoOutputPath}/${folderName}`;
        const collectionOptions = buildChannelCollectionOptions(
          { autoOrganizeCollections },
          channel_name,
        );

        const networkOptions = getNetworkOptions();

        const duplicateCandidates = newVideos.map((video) => ({
          video,
          url: video.url,
          title: video.title || video.url,
          thumbnail: video.thumbnail || undefined,
          duplicateIdentity: buildDownloadDuplicateIdentity(
            video.url,
            detectPlatform(video.url) === 'youtube' ? video.video_id : null,
          ),
        }));
        const filteredDuplicateCandidates = await filterDownloadedDuplicateCandidates(
          duplicateCandidates,
          { ask: false, notify: false, trustHistory: true },
        );
        const videosToAutoDownload = filteredDuplicateCandidates.map(
          (candidate) => candidate.video,
        );
        const autoDownloadVideoIds = new Set(videosToAutoDownload.map((video) => video.id));
        const skippedDuplicateVideos = newVideos.filter(
          (video) => !autoDownloadVideoIds.has(video.id),
        );
        if (skippedDuplicateVideos.length > 0) {
          await Promise.all(
            skippedDuplicateVideos.map((video) =>
              updateChannelVideoStatus({ id: video.id, status: 'downloaded' }).catch((error) => {
                console.error('Failed to mark duplicate channel video as downloaded:', error);
              }),
            ),
          );
        }
        if (videosToAutoDownload.length === 0) {
          refreshChannelNewCounts();
          rebuildTrayMenu().catch(() => {});
          return;
        }

        const maxConcurrent = Math.min(5, Math.max(1, download_threads || 3));
        const workflowSnapshots = loadPluginWorkflowSnapshots();
        const queuedAutoDownloads = videosToAutoDownload.map((video) => ({
          video,
          downloadId: `auto-${video.video_id}-${Date.now()}-${createClientId()}`,
        }));
        const creatorSettingsSnapshot = withCreatorOutputFolder(creator_processing, autoOutputPath);

        updateChannelProgress(autoChannelUrl, {
          channelUrl: autoChannelUrl,
          channelName: channel_name,
          total: newVideos.length,
          completed: skippedDuplicateVideos.length,
          failed: 0,
          active: 0,
          queued: queuedAutoDownloads.length,
          editTotal: creatorSettingsSnapshot.mode === 'none' ? 0 : queuedAutoDownloads.length,
          editInputPrefix: autoOutputPath,
        });

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
          downloadIdMapRef.current.set(downloadId, {
            videoId: video.video_id,
            channelUrl: autoChannelUrl,
            title: video.title,
            persistChannelStatus: true,
          });
          creatorSettingsByDownloadRef.current.set(downloadId, creatorSettingsSnapshot);
          await updateChannelVideoStatus({ id: video.id, status: 'downloading' });
          updateChannelProgress(autoChannelUrl, (current) => ({
            ...current,
            active: current.active + 1,
            queued: Math.max(0, current.queued - 1),
          }));

          try {
            await downloadVideoCommand({
              id: downloadId,
              url: video.url,
              outputPath: autoOutputPath,
              quality,
              format,
              downloadPlaylist: false,
              videoCodec: video_codec,
              preferredFps: preferred_fps === '30' ? '30' : 'original',
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
              ...collectionOptions,
              filenameMetadataEnabled,
              filenameMetadataFields,
              useAria2,
              aria2Args,
              ytdlpAdvancedOptionsEnabled,
              ytdlpAdvancedOptions,
              pluginWorkflowSnapshots: workflowSnapshots,
              postDownloadWorkflowSteps: loadPostDownloadWorkflowSteps(),
              downloadKind: 'channel-auto',
            });

            await updateChannelVideoStatus({ id: video.id, status: 'downloaded' });
            updateChannelProgress(autoChannelUrl, (current) => ({
              ...current,
              active: Math.max(0, current.active - 1),
              completed: current.completed + 1,
            }));
          } catch (error) {
            console.error(`Auto-download failed for ${video.title}:`, error);
            await updateChannelVideoStatus({ id: video.id, status: 'new' });
            updateChannelProgress(autoChannelUrl, (current) => ({
              ...current,
              active: Math.max(0, current.active - 1),
              failed: current.failed + 1,
            }));
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
  }, [
    filterDownloadedDuplicateCandidates,
    getNetworkOptions,
    refreshChannelNewCounts,
    updateChannelProgress,
  ]);

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
    bulkFollowChannels,
    bulkUnfollowChannels,
    bulkUpdateChannelSettings,
    bulkUpdateChannelCreatorProcessing,
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
    browseYoutubeContentType,
    channelScanOrder,
    setChannelScanOrder,
    channelFetchLimit,
    setChannelFetchLimit,
    showDownloadedVideos,
    setShowDownloadedVideos,
    fetchChannelVideos,
    loadMoreChannelVideos,
    stopChannelFetch,
    clearBrowse,
    selectedVideoIds,
    toggleVideoSelection,
    selectAllVideos,
    selectNewestUndownloaded,
    deselectAllVideos,
    downloadSelectedVideos,
    stopDownload,
    isDownloading,
    downloadingIds,
    channelProgressByUrl,
    bulkChannelState,
    startBulkChannelDownload,
    stopBulkChannelDownload,
    pauseBulkChannelDownload,
    resumeBulkChannelDownload,
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
