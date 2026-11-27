import { openUrl } from '@tauri-apps/plugin-opener';
import {
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  Download,
  FolderOpen,
  Heart,
  Link,
  ListPlus,
  Loader2,
  Pause,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FFmpegRequiredDialog } from '@/components/FFmpegRequiredDialog';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  detectPlatform,
  isSupportedPlatform,
  sanitizeChannelFolderName,
} from '@/contexts/channels/useChannelsController';
import { useChannels } from '@/contexts/channels-context';
import { useDependencies } from '@/contexts/DependenciesContext';
import {
  FIFTY_MINUTES_SECONDS,
  MAX_BULK_CHANNEL_VIDEO_COUNT,
  normalizeBulkChannelVideoCount,
} from '@/lib/bulk-channel-filter';
import { isTikTokChannelContentUrl, matchesChannelContentType } from '@/lib/channel-content';
import {
  type CreatorProcessingSettings,
  loadCreatorProcessingSettings,
  pickCreatorFolder,
  saveCreatorProcessingSettings,
} from '@/lib/creator-processing';
import {
  openChannelFolderLocation,
  openFileLocation,
  openFolderLocation,
} from '@/lib/open-file-location';
import type {
  Format,
  PreferredFps,
  Quality,
  VideoCodec,
  YoutubeChannelContentType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { BulkChannelQueuePanel } from '@/pages/channels/BulkChannelQueuePanel';
import { ChannelActivityPanel } from '@/pages/channels/ChannelActivityPanel';
import { ChannelDetailView } from '@/pages/channels/ChannelDetailView';
import { ChannelFetchLoadingState } from '@/pages/channels/ChannelFetchLoadingState';
import { ChannelSettingsBar } from '@/pages/channels/ChannelSettingsBar';
import { ChannelVideoListItem } from '@/pages/channels/ChannelVideoListItem';
import {
  FFMPEG_REQUIRED_QUALITIES,
  getYoutubeContentTypeFromUrl,
  isYoutubeChannelContentUrl,
  loadInitialSettings,
} from '@/pages/channels/channelUtils';
import { PlatformTag } from '@/pages/channels/PlatformTag';

// ── Main Page ────────────────────────────────────────────────────────

export function ChannelsPage() {
  const { t } = useTranslation('channels');
  const {
    followedChannels,
    refreshChannels,
    followChannel,
    unfollowChannel,
    bulkFollowChannels,
    bulkUnfollowChannels,
    bulkUpdateChannelCreatorProcessing,
    browseUrl,
    setBrowseUrl,
    browseVideos,
    browseLoading,
    browseError,
    browseChannelName,
    fetchChannelVideos,
    clearBrowse,
    selectedVideoIds,
    toggleVideoSelection,
    selectAllVideos,
    selectNewestUndownloaded,
    deselectAllVideos,
    downloadSelectedVideos,
    stopDownload,
    isDownloading,
    videoStates,
    outputPath,
    selectOutputFolder,
    activeChannel,
    setActiveChannel,
    channelNewCounts,
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
    channelProgressByUrl,
    bulkChannelState,
    startBulkChannelDownload,
    stopBulkChannelDownload,
    stopAllChannelWork,
    pauseBulkChannelDownload,
    resumeBulkChannelDownload,
    retryFailedBulkChannelDownloads,
    removeQueuedBulkChannelBatch,
    loadMoreChannelVideos,
    stopChannelFetch,
  } = useChannels();

  const { ffmpegStatus } = useDependencies();

  const [urlInput, setUrlInput] = useState(browseUrl);
  useEffect(() => {
    if (browseUrl) setUrlInput(browseUrl);
  }, [browseUrl]);
  const [youtubeContentType, setYoutubeContentType] =
    useState<YoutubeChannelContentType>(browseYoutubeContentType);
  const [followingUrl, setFollowingUrl] = useState(false);
  const [channelDownloadCount, setChannelDownloadCount] = useState('20');
  const [visibleVideoCount, setVisibleVideoCount] = useState(200);
  const [preparingChannelDownload, setPreparingChannelDownload] = useState(false);
  const [creatorSettings, setCreatorSettings] = useState(loadCreatorProcessingSettings);
  const [bulkChannelUrls, setBulkChannelUrls] = useState(
    () => localStorage.getItem('youwee-bulk-channel-urls') || '',
  );
  const [bulkVideoCount, setBulkVideoCount] = useState(
    () => localStorage.getItem('youwee-bulk-video-count') || '20',
  );
  const [bulkUnderFiftyMinutes, setBulkUnderFiftyMinutes] = useState(
    () => localStorage.getItem('youwee-bulk-under-50-minutes') === 'true',
  );
  const [bulkOutputPath, setBulkOutputPath] = useState(
    () => localStorage.getItem('youwee-bulk-output-path') || outputPath,
  );
  const [bulkFollowUrls, setBulkFollowUrls] = useState(
    () => localStorage.getItem('youwee-bulk-follow-urls') || '',
  );
  const [selectedFollowedChannelIds, setSelectedFollowedChannelIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkChannelMutationRunning, setBulkChannelMutationRunning] = useState(false);
  const [bulkSubmitError, setBulkSubmitError] = useState<string | null>(null);
  const [bulkSubmitNotice, setBulkSubmitNotice] = useState<string | null>(null);
  const previousShowDownloaded = useRef(showDownloadedVideos);
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const showYoutubeContentType = isYoutubeChannelContentUrl(urlInput.trim());
  const showTikTokContentType = isTikTokChannelContentUrl(urlInput.trim());
  const browsePlatform = detectPlatform(browseUrl);
  const displayedBrowseVideos = useMemo(
    () =>
      browseVideos.filter((video) =>
        matchesChannelContentType(browsePlatform, youtubeContentType, video.duration),
      ),
    [browsePlatform, browseVideos, youtubeContentType],
  );

  useEffect(() => {
    if (bulkChannelState.running) setChannelsCollapsed(false);
  }, [bulkChannelState.running]);

  useEffect(() => {
    if (!bulkOutputPath && outputPath) setBulkOutputPath(outputPath);
  }, [bulkOutputPath, outputPath]);

  useEffect(() => {
    const validIds = new Set(followedChannels.map((channel) => channel.id));
    setSelectedFollowedChannelIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [followedChannels]);

  useEffect(() => {
    if (
      previousShowDownloaded.current !== showDownloadedVideos &&
      browseUrl &&
      !browseLoading &&
      !browseLoadingMore
    ) {
      void fetchChannelVideos(browseUrl, channelFetchLimit, youtubeContentType, channelScanOrder);
    }
    previousShowDownloaded.current = showDownloadedVideos;
  }, [
    browseLoading,
    browseLoadingMore,
    browseUrl,
    channelFetchLimit,
    channelScanOrder,
    fetchChannelVideos,
    showDownloadedVideos,
    youtubeContentType,
  ]);

  // Settings state - initialized from shared localStorage (same as DownloadPage)
  const [initSettings] = useState(loadInitialSettings);
  const [quality, setQuality] = useState<Quality>(initSettings.quality);
  const [format, setFormat] = useState<Format>(initSettings.format);
  const [videoCodec, setVideoCodec] = useState<VideoCodec>(initSettings.videoCodec);
  const [preferredFps, setPreferredFps] = useState<PreferredFps>(initSettings.preferredFps);
  const [isAudioMode, setIsAudioMode] = useState(initSettings.isAudioMode);

  // FFmpeg dialog state
  const [showFfmpegDialog, setShowFfmpegDialog] = useState(false);
  const [pendingQuality, setPendingQuality] = useState<Quality | null>(null);

  const handleAudioModeToggle = useCallback(() => {
    setIsAudioMode((prev) => {
      const next = !prev;
      if (next) {
        setQuality('audio');
        setFormat('mp3');
      } else {
        setQuality('best');
        setFormat('mp4');
      }
      return next;
    });
  }, []);

  // Quality change with FFmpeg check (matching SettingsPanel behavior)
  const handleQualityChange = useCallback(
    (q: Quality) => {
      if (FFMPEG_REQUIRED_QUALITIES.includes(q) && ffmpegStatus?.installed === false) {
        setPendingQuality(q);
        setShowFfmpegDialog(true);
        return;
      }
      setQuality(q);
    },
    [ffmpegStatus?.installed],
  );

  const handleFfmpegDialogContinue = useCallback(() => {
    setShowFfmpegDialog(false);
    if (pendingQuality) {
      setQuality(pendingQuality);
    }
    setPendingQuality(null);
  }, [pendingQuality]);

  const handleFfmpegDialogDismiss = useCallback(() => {
    setShowFfmpegDialog(false);
    setPendingQuality(null);
  }, []);

  const handleFetch = useCallback(() => {
    if (browseLoading || browseLoadingMore) {
      stopChannelFetch();
      return;
    }

    const url = urlInput.trim();
    if (!url) return;
    if (!isSupportedPlatform(url)) {
      return;
    }
    const contentType = isYoutubeChannelContentUrl(url)
      ? youtubeContentType
      : isTikTokChannelContentUrl(url)
        ? youtubeContentType
        : 'videos';
    setBrowseUrl(url);
    fetchChannelVideos(url, channelFetchLimit, contentType, channelScanOrder);
  }, [
    browseLoading,
    browseLoadingMore,
    channelFetchLimit,
    channelScanOrder,
    fetchChannelVideos,
    setBrowseUrl,
    stopChannelFetch,
    urlInput,
    youtubeContentType,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleFetch();
      }
    },
    [handleFetch],
  );

  // Check if FFmpeg is required for current quality (for download button)
  const ffmpegRequired =
    FFMPEG_REQUIRED_QUALITIES.includes(quality) && ffmpegStatus?.installed === false;

  const handleStartDownload = useCallback(async () => {
    if (ffmpegRequired) {
      setShowFfmpegDialog(true);
      return;
    }
    try {
      await downloadSelectedVideos(quality, format, videoCodec, preferredFps);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, [downloadSelectedVideos, quality, format, videoCodec, preferredFps, ffmpegRequired]);

  const handleFollow = useCallback(async () => {
    if (!browseChannelName || !browseUrl) return;
    setFollowingUrl(true);
    try {
      const thumbnail =
        browseChannelAvatar || (browseVideos.length > 0 ? browseVideos[0].thumbnail : undefined);
      await followChannel(
        browseUrl,
        browseChannelName,
        thumbnail ?? undefined,
        {
          quality: isAudioMode ? 'audio' : quality,
          format,
          videoCodec,
          preferredFps,
          audioBitrate: '192',
        },
        isYoutubeChannelContentUrl(browseUrl) || isTikTokChannelContentUrl(browseUrl)
          ? youtubeContentType
          : 'videos',
        { ...creatorSettings, outputFolder: '' },
      );
    } catch (error) {
      console.error('Follow failed:', error);
    } finally {
      setFollowingUrl(false);
    }
  }, [
    browseUrl,
    browseChannelName,
    browseChannelAvatar,
    browseVideos,
    followChannel,
    quality,
    format,
    videoCodec,
    preferredFps,
    isAudioMode,
    youtubeContentType,
    creatorSettings,
  ]);

  const isAlreadyFollowing = followedChannels.some(
    (c) => c.url === browseUrl || c.url === urlInput.trim(),
  );

  const followedChannelId = followedChannels.find(
    (c) => c.url === browseUrl || c.url === urlInput.trim(),
  )?.id;

  const [confirmBrowseUnfollow, setConfirmBrowseUnfollow] = useState(false);
  const [confirmPanelUnfollowId, setConfirmPanelUnfollowId] = useState<string | null>(null);

  const handleBrowseUnfollow = useCallback(async () => {
    if (!followedChannelId) return;
    await unfollowChannel(followedChannelId);
    setConfirmBrowseUnfollow(false);
  }, [followedChannelId, unfollowChannel]);

  const pendingCount = selectedVideoIds.size;

  const updateCreatorSettings = useCallback((patch: Partial<CreatorProcessingSettings>) => {
    setCreatorSettings((current) => {
      const next = { ...current, ...patch };
      saveCreatorProcessingSettings(next);
      return next;
    });
  }, []);

  const startBulkChannels = useCallback(() => {
    const urls = Array.from(
      new Set(
        bulkChannelUrls
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter((value) => value && isSupportedPlatform(value)),
      ),
    );
    if (urls.length === 0) {
      setBulkSubmitNotice(null);
      setBulkSubmitError(t('bulkChannels.noValidUrls'));
      return;
    }
    if (!bulkOutputPath.trim()) {
      setBulkSubmitNotice(null);
      setBulkSubmitError(t('bulkChannels.noOutputFolder'));
      return;
    }
    setBulkSubmitError(null);
    setBulkSubmitNotice(t('bulkChannels.commandAccepted', { count: urls.length }));
    const videoCount = normalizeBulkChannelVideoCount(Number.parseInt(bulkVideoCount, 10));
    try {
      try {
        localStorage.setItem('youwee-bulk-video-count', String(videoCount));
      } catch {
        // The in-memory queue remains usable when browser storage is unavailable.
      }
      startBulkChannelDownload({
        urls,
        outputPath: bulkOutputPath.trim(),
        videoCount,
        scanOrder: channelScanOrder,
        youtubeContentType,
        quality,
        format,
        videoCodec,
        preferredFps,
        maxDurationSeconds: bulkUnderFiftyMinutes ? FIFTY_MINUTES_SECONDS : null,
        creatorSettings: { ...creatorSettings },
      });
      setBulkChannelUrls('');
      try {
        localStorage.removeItem('youwee-bulk-channel-urls');
      } catch {
        // Ignore unavailable local storage.
      }
    } catch (error) {
      setBulkSubmitNotice(null);
      setBulkSubmitError(error instanceof Error ? error.message : String(error));
    }
  }, [
    bulkChannelUrls,
    bulkOutputPath,
    bulkVideoCount,
    bulkUnderFiftyMinutes,
    channelScanOrder,
    creatorSettings,
    format,
    preferredFps,
    quality,
    startBulkChannelDownload,
    t,
    videoCodec,
    youtubeContentType,
  ]);

  const selectBulkOutputFolder = useCallback(async () => {
    const folder = await pickCreatorFolder(bulkOutputPath || outputPath || undefined);
    if (!folder) return;
    setBulkOutputPath(folder);
    localStorage.setItem('youwee-bulk-output-path', folder);
  }, [bulkOutputPath, outputPath]);

  const handleBulkFollow = useCallback(async () => {
    const urls = Array.from(
      new Set(
        bulkFollowUrls
          .split(/\r?\n|,/)
          .map((value) => value.trim())
          .filter((value) => value && isSupportedPlatform(value)),
      ),
    );
    if (urls.length === 0) return;
    setBulkChannelMutationRunning(true);
    try {
      localStorage.setItem('youwee-bulk-follow-urls', bulkFollowUrls);
      await bulkFollowChannels({
        urls,
        downloadQuality: isAudioMode ? 'audio' : quality,
        downloadFormat: format,
        downloadVideoCodec: videoCodec,
        downloadPreferredFps: preferredFps,
        downloadAudioBitrate: '192',
        youtubeContentType,
        creatorProcessing: { ...creatorSettings, outputFolder: '' },
      });
      setBulkFollowUrls('');
      localStorage.removeItem('youwee-bulk-follow-urls');
    } catch (error) {
      console.error('Bulk follow failed:', error);
    } finally {
      setBulkChannelMutationRunning(false);
    }
  }, [
    bulkFollowChannels,
    bulkFollowUrls,
    format,
    isAudioMode,
    preferredFps,
    quality,
    videoCodec,
    youtubeContentType,
    creatorSettings,
  ]);

  const toggleFollowedChannelSelection = useCallback((id: string) => {
    setSelectedFollowedChannelIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllFollowedChannelSelection = useCallback(() => {
    setSelectedFollowedChannelIds((current) => {
      if (current.size === followedChannels.length) return new Set();
      return new Set(followedChannels.map((channel) => channel.id));
    });
  }, [followedChannels]);

  const handleBulkUnfollow = useCallback(async () => {
    const ids = Array.from(selectedFollowedChannelIds);
    if (ids.length === 0 || !window.confirm(t('confirmUnfollow'))) return;
    setBulkChannelMutationRunning(true);
    try {
      await bulkUnfollowChannels(ids);
      setSelectedFollowedChannelIds(new Set());
    } catch (error) {
      console.error('Bulk unfollow failed:', error);
    } finally {
      setBulkChannelMutationRunning(false);
    }
  }, [bulkUnfollowChannels, selectedFollowedChannelIds, t]);

  const handleBulkUpdateCreatorProcessing = useCallback(async () => {
    const ids = Array.from(selectedFollowedChannelIds);
    if (ids.length === 0) return;
    setBulkChannelMutationRunning(true);
    try {
      await bulkUpdateChannelCreatorProcessing({
        ids,
        creatorProcessing: { ...creatorSettings, outputFolder: '' },
      });
    } catch (error) {
      console.error('Bulk channel creator settings update failed:', error);
    } finally {
      setBulkChannelMutationRunning(false);
    }
  }, [bulkUpdateChannelCreatorProcessing, selectedFollowedChannelIds, creatorSettings]);

  const handlePrepareChannelDownload = useCallback(
    async (all: boolean) => {
      setPreparingChannelDownload(true);
      try {
        const parsed = Number.parseInt(channelDownloadCount, 10);
        await selectNewestUndownloaded(
          all ? null : Math.max(1, Number.isFinite(parsed) ? parsed : 1),
          youtubeContentType,
        );
      } finally {
        setPreparingChannelDownload(false);
      }
    },
    [channelDownloadCount, selectNewestUndownloaded, youtubeContentType],
  );

  // If viewing a specific followed channel detail
  if (activeChannel) {
    return <ChannelDetailView channel={activeChannel} onBack={() => setActiveChannel(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-base sm:text-lg font-semibold">{t('title')}</h1>
          {followedChannels.length > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {followedChannels.length} {t('following')}
            </span>
          )}
        </div>
        <ThemePicker />
      </header>

      {/* Divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Top Section: URL Input + Settings */}
      <div className="max-h-[55dvh] min-h-0 shrink overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-3">
        {/* URL Input */}
        <div className="relative flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="url"
              value={urlInput}
              onChange={(e) => {
                const nextUrl = e.target.value;
                setUrlInput(nextUrl);
                if (isYoutubeChannelContentUrl(nextUrl)) {
                  setYoutubeContentType(getYoutubeContentTypeFromUrl(nextUrl));
                } else if (
                  isTikTokChannelContentUrl(nextUrl) &&
                  !isTikTokChannelContentUrl(urlInput)
                ) {
                  setYoutubeContentType('videos_shorts');
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('urlPlaceholder')}
              disabled={browseLoading}
              className={cn(
                'pl-10 pr-10 h-11 text-sm',
                'bg-background/50 border-border/50',
                'focus:bg-background transition-colors',
                'placeholder:text-muted-foreground/50',
              )}
            />
            {urlInput && (
              <button
                type="button"
                onClick={() => {
                  setUrlInput('');
                  setYoutubeContentType('videos');
                  clearBrowse();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <label
            htmlFor="channels-fetch-limit"
            className="flex h-11 items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-2"
          >
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {t('fetchLimit')}
            </span>
            <Input
              id="channels-fetch-limit"
              type="number"
              min={1}
              max={500}
              value={channelFetchLimit}
              onChange={(event) => setChannelFetchLimit(Number(event.target.value))}
              className="h-8 w-16 border-0 bg-transparent p-1 text-center text-sm focus-visible:ring-0"
              aria-label={t('fetchLimit')}
            />
          </label>
          <select
            value={channelScanOrder}
            onChange={(event) =>
              setChannelScanOrder(event.target.value === 'popular' ? 'popular' : 'latest')
            }
            className="h-11 rounded-md border border-border/50 bg-background/50 px-2 text-xs"
            aria-label={t('scanOrder.title')}
          >
            <option value="latest">{t('scanOrder.latest')}</option>
            <option value="popular">{t('scanOrder.popular')}</option>
          </select>
          <label className="flex h-11 items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showDownloadedVideos}
              onChange={(event) => setShowDownloadedVideos(event.target.checked)}
            />
            <span className="hidden sm:inline">{t('showDownloaded')}</span>
          </label>
          <button
            type="button"
            className={cn(
              'h-11 px-4 rounded-md font-medium text-sm',
              browseLoading || browseLoadingMore
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-2'
                : 'btn-gradient flex items-center gap-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            onClick={handleFetch}
            disabled={!browseLoading && !browseLoadingMore && !urlInput.trim()}
            title={browseLoading || browseLoadingMore ? t('stopFetch') : t('fetchVideos')}
          >
            {browseLoading || browseLoadingMore ? (
              <Square className="w-4 h-4" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {browseLoading || browseLoadingMore ? t('stopFetch') : t('fetchVideos')}
            </span>
          </button>
        </div>

        {/* Supported platforms hint */}
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] text-muted-foreground/60">{t('supportedSites')}:</span>
          <PlatformTag platform="youtube" size="xs" />
          <PlatformTag platform="bilibili" size="xs" />
          <PlatformTag platform="youku" size="xs" />
          <PlatformTag platform="tiktok" size="xs" />
        </div>

        {/* Settings Bar */}
        <ChannelSettingsBar
          quality={quality}
          format={format}
          videoCodec={videoCodec}
          preferredFps={preferredFps}
          isAudioMode={isAudioMode}
          onQualityChange={handleQualityChange}
          onFormatChange={setFormat}
          onVideoCodecChange={setVideoCodec}
          onPreferredFpsChange={setPreferredFps}
          onAudioModeToggle={handleAudioModeToggle}
          outputPath={outputPath}
          onSelectFolder={selectOutputFolder}
          youtubeContentType={youtubeContentType}
          showYoutubeContentType={showYoutubeContentType}
          showTikTokContentType={showTikTokContentType}
          onYoutubeContentTypeChange={(contentType) => {
            setYoutubeContentType(contentType);
            deselectAllVideos();
          }}
          disabled={isDownloading}
        />
        {browseUrl && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 p-2">
            <span className="px-1 text-xs text-muted-foreground">{t('channelBatch.title')}</span>
            <Input
              type="number"
              min={1}
              value={channelDownloadCount}
              onChange={(event) => setChannelDownloadCount(event.target.value)}
              className="h-8 w-24"
              aria-label={t('channelBatch.count')}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={preparingChannelDownload || browseLoading || isDownloading}
              onClick={() => handlePrepareChannelDownload(false)}
            >
              {t('channelBatch.selectNewest')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={preparingChannelDownload || browseLoading || isDownloading}
              onClick={() => handlePrepareChannelDownload(true)}
            >
              {preparingChannelDownload ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t('channelBatch.selectAll')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('channelBatch.unseenHint')}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 p-2">
          <span className="px-1 text-xs font-medium">{t('creator.title')}</span>
          <select
            value={creatorSettings.mode}
            onChange={(event) =>
              updateCreatorSettings({
                mode: event.target.value as CreatorProcessingSettings['mode'],
              })
            }
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="none">{t('creator.none')}</option>
            <option value="duet">{t('creator.duet')}</option>
            <option value="portrait">{t('creator.portrait')}</option>
            <option value="parts">{t('creator.parts')}</option>
          </select>
          {creatorSettings.mode === 'duet' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                const folder = await pickCreatorFolder(creatorSettings.rightFolder || undefined);
                if (folder) updateCreatorSettings({ rightFolder: folder });
              }}
              title={creatorSettings.rightFolder}
            >
              {creatorSettings.rightFolder ? t('creator.changeRight') : t('creator.selectRight')}
            </Button>
          )}
          {creatorSettings.mode === 'parts' && (
            <>
              <select
                value={creatorSettings.splitBy}
                onChange={(event) =>
                  updateCreatorSettings({
                    splitBy: event.target.value === 'count' ? 'count' : 'duration',
                  })
                }
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="duration">{t('creator.splitByDuration')}</option>
                <option value="count">{t('creator.splitByCount')}</option>
              </select>
              <label
                htmlFor="creator-split-value"
                className="flex items-center gap-1 text-xs text-muted-foreground"
              >
                {creatorSettings.splitBy === 'count'
                  ? t('creator.partCount')
                  : t('creator.partSeconds')}
                <Input
                  id="creator-split-value"
                  type="number"
                  min={1}
                  value={
                    creatorSettings.splitBy === 'count'
                      ? creatorSettings.partCount
                      : creatorSettings.partSeconds
                  }
                  onChange={(event) =>
                    creatorSettings.splitBy === 'count'
                      ? updateCreatorSettings({
                          partCount: Math.max(1, Number(event.target.value)),
                        })
                      : updateCreatorSettings({
                          partSeconds: Math.max(1, Number(event.target.value)),
                        })
                  }
                  className="h-8 w-20"
                />
              </label>
            </>
          )}
          {creatorSettings.mode !== 'none' && (
            <select
              value={creatorSettings.encoder}
              onChange={(event) =>
                updateCreatorSettings({
                  encoder: event.target.value as CreatorProcessingSettings['encoder'],
                })
              }
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="libx264">CPU x264</option>
              <option value="h264_nvenc">NVIDIA NVENC</option>
              <option value="h264_qsv">Intel Quick Sync</option>
              <option value="h264_amf">AMD AMF</option>
            </select>
          )}
        </div>
        <form
          className="rounded-lg border border-dashed border-border/60 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            startBulkChannels();
          }}
        >
          <div className="mb-2 flex items-center gap-2">
            <ListPlus className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">{t('bulkChannels.title')}</span>
            <span className="text-[11px] text-muted-foreground">{t('bulkChannels.hint')}</span>
          </div>
          <div className="flex flex-col gap-2 lg:flex-row">
            <Textarea
              value={bulkChannelUrls}
              onChange={(event) => {
                setBulkChannelUrls(event.target.value);
                localStorage.setItem('youwee-bulk-channel-urls', event.target.value);
              }}
              placeholder={t('bulkChannels.placeholder')}
              className="min-h-20 flex-1 resize-y text-xs"
            />
            <div className="flex min-w-64 flex-wrap content-start items-center gap-2">
              <label htmlFor="bulk-video-count" className="text-xs text-muted-foreground">
                {t('bulkChannels.videoCount')}
              </label>
              <Input
                id="bulk-video-count"
                type="number"
                min={1}
                max={MAX_BULK_CHANNEL_VIDEO_COUNT}
                value={bulkVideoCount}
                onChange={(event) => {
                  setBulkVideoCount(event.target.value);
                  localStorage.setItem('youwee-bulk-video-count', event.target.value);
                }}
                className="h-8 w-20"
              />
              <label
                htmlFor="bulk-under-fifty-minutes"
                className="flex h-8 items-center gap-2 rounded-md border border-dashed border-border px-2 text-xs"
              >
                <Switch
                  id="bulk-under-fifty-minutes"
                  checked={bulkUnderFiftyMinutes}
                  onCheckedChange={(checked) => {
                    setBulkUnderFiftyMinutes(checked);
                    localStorage.setItem('youwee-bulk-under-50-minutes', String(checked));
                  }}
                  aria-label={t('bulkChannels.underFiftyMinutes')}
                />
                <span>{t('bulkChannels.underFiftyMinutes')}</span>
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-w-full"
                onClick={() => void selectBulkOutputFolder()}
                title={bulkOutputPath || t('creator.selectOutput')}
              >
                <FolderOpen className="mr-1 h-4 w-4 shrink-0" />
                <span className="max-w-52 truncate">
                  {bulkOutputPath || t('creator.selectOutput')}
                </span>
              </Button>
              {bulkChannelState.running ? (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!bulkOutputPath || !bulkChannelUrls.trim()}
                >
                  <ListPlus className="mr-1 h-4 w-4" />
                  {t('bulkChannels.addToQueue')}
                </Button>
              ) : bulkChannelState.phase === 'paused' ? (
                <>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!bulkOutputPath || !bulkChannelUrls.trim()}
                  >
                    <ListPlus className="mr-1 h-4 w-4" />
                    {t('bulkChannels.addToQueue')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resumeBulkChannelDownload}
                  >
                    {t('bulkChannels.resume')}
                  </Button>
                </>
              ) : (
                <Button
                  type="submit"
                  size="sm"
                  disabled={!bulkOutputPath || !bulkChannelUrls.trim()}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {t('bulkChannels.start')}
                </Button>
              )}
              {bulkChannelState.running && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pauseBulkChannelDownload}
                >
                  <Pause className="mr-1 h-4 w-4" />
                  {t('bulkChannels.pause')}
                </Button>
              )}
              <p className="w-full text-[11px] text-muted-foreground">
                {creatorSettings.mode === 'none'
                  ? t('bulkChannels.downloadOnly')
                  : t('bulkChannels.withEdit')}
              </p>
              {bulkSubmitError && (
                <p className="w-full text-[11px] text-destructive">{bulkSubmitError}</p>
              )}
              {bulkSubmitNotice && (
                <p className="w-full text-[11px] text-emerald-500">{bulkSubmitNotice}</p>
              )}
            </div>
          </div>
          {((bulkChannelState.jobs.length > 0 &&
            !['complete', 'idle', 'stopped'].includes(bulkChannelState.phase)) ||
            bulkChannelState.queuedBatches.length > 0) && (
            <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{t('bulkChannels.queueOverview')}</p>
                <span className="rounded bg-primary/10 px-2 py-1 text-[11px] text-primary">
                  {t('bulkChannels.waitingBatches', {
                    count: bulkChannelState.queuedBatches.length,
                  })}
                </span>
              </div>
              {bulkChannelState.jobs.length > 0 &&
                bulkChannelState.options &&
                !['complete', 'idle', 'stopped'].includes(bulkChannelState.phase) && (
                  <div className="grid gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5 text-xs sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="font-medium text-primary">{t('bulkChannels.currentBatch')}</p>
                      <p
                        className="mt-0.5 truncate text-muted-foreground"
                        title={bulkChannelState.options.outputPath}
                      >
                        {bulkChannelState.options.outputPath}
                      </p>
                    </div>
                    <p className="self-center text-muted-foreground">
                      {bulkChannelState.jobs.length} {t('bulkChannels.channelsUnit')} ·{' '}
                      {bulkChannelState.options.videoCount} {t('bulkChannels.videosEach')}
                    </p>
                  </div>
                )}
              {bulkChannelState.queuedBatches.length > 0 && (
                <div className="flex snap-x gap-2 overflow-x-auto pb-1">
                  {bulkChannelState.queuedBatches.map((batch, index) => (
                    <div
                      key={batch.id}
                      className="flex min-w-64 max-w-sm flex-1 snap-start items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="shrink-0 font-medium">
                            {t('bulkChannels.queuedBatch', { number: index + 1 })}
                          </p>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {batch.jobs.length} {t('bulkChannels.channelsUnit')} ·{' '}
                            {batch.options.videoCount} {t('bulkChannels.videosEach')}
                          </span>
                        </div>
                        <p
                          className="mt-0.5 truncate text-muted-foreground"
                          title={batch.options.outputPath}
                        >
                          {batch.options.outputPath}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                        title={t('bulkChannels.removeBatch')}
                        onClick={() => removeQueuedBulkChannelBatch(batch.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </form>
        <div className="rounded-lg border border-dashed border-border/60 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium">{t('followedChannels')}</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Textarea
              value={bulkFollowUrls}
              onChange={(event) => {
                setBulkFollowUrls(event.target.value);
                localStorage.setItem('youwee-bulk-follow-urls', event.target.value);
              }}
              disabled={bulkChannelMutationRunning}
              placeholder={t('bulkChannels.placeholder')}
              className="min-h-16 flex-1 resize-y text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="self-start"
              onClick={() => void handleBulkFollow()}
              disabled={bulkChannelMutationRunning || bulkFollowUrls.trim().length === 0}
            >
              {bulkChannelMutationRunning ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Heart className="mr-1 h-4 w-4" />
              )}
              {t('follow')}
            </Button>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      {/* Main Content - Split Layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Panel - Video List */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Channel Info Bar */}
          {browseChannelName && (
            <div className="flex-shrink-0 px-4 sm:px-6 pt-3 pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                    {browseChannelAvatar ? (
                      <img
                        src={browseChannelAvatar}
                        alt=""
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Tv className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h2 className="font-semibold text-sm leading-tight">{browseChannelName}</h2>
                      <PlatformTag platform={detectPlatform(browseUrl)} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('videoCount', { count: browseVideos.length })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {outputPath && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title={t('openChannelFolder')}
                      onClick={() => {
                        const folderName = sanitizeChannelFolderName(
                          browseChannelName || 'Unknown channel',
                        );
                        const fallbackFolder = `${outputPath}/${folderName}`;
                        const openFolder = openChannelFolderLocation(
                          followedChannelId || null,
                          browseVideos.map((video) => video.url),
                          fallbackFolder,
                        );
                        void openFolder.catch((error) => {
                          console.error('Failed to open channel folder:', error);
                        });
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  )}
                  {isAlreadyFollowing ? (
                    confirmBrowseUnfollow ? (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={handleBrowseUnfollow}
                          className="h-7 text-xs px-2.5"
                        >
                          {t('unfollow')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmBrowseUnfollow(false)}
                          className="h-7 text-xs px-2.5"
                        >
                          {t('cancel')}
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmBrowseUnfollow(true)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        {t('following')}
                      </button>
                    )
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleFollow}
                      disabled={followingUrl}
                      className="gap-1.5"
                    >
                      {followingUrl ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Heart className="w-3.5 h-3.5" />
                      )}
                      {t('follow')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Selection toolbar */}
          {displayedBrowseVideos.length > 0 && (
            <div className="flex-shrink-0 px-4 sm:px-6 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedVideoIds.size > 0
                    ? t('selected', { count: selectedVideoIds.size })
                    : t('videoCount', { count: displayedBrowseVideos.length })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={
                    selectedVideoIds.size === displayedBrowseVideos.length
                      ? deselectAllVideos
                      : () => selectAllVideos(youtubeContentType)
                  }
                  className="h-7 text-xs"
                  disabled={isDownloading}
                >
                  {selectedVideoIds.size === displayedBrowseVideos.length ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {selectedVideoIds.size === displayedBrowseVideos.length
                    ? t('deselectAll')
                    : t('selectAll')}
                </Button>
              </div>
            </div>
          )}

          {/* Video List */}
          <div className="relative flex-1 min-h-0">
            <div className="h-full overflow-y-auto px-4 sm:px-6 pt-1">
              {/* Error state */}
              {browseError && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
                    <X className="w-6 h-6 text-destructive" />
                  </div>
                  <p className="text-sm font-medium text-destructive">{t('error.fetchFailed')}</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[320px]">{browseError}</p>
                </div>
              )}

              {/* Empty state */}
              {!browseLoading &&
                browseVideos.length === 0 &&
                !browseError &&
                !browseChannelName && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <EmptyStateIllustration className="mb-5" icon={Tv} size="sm" />
                    <h3 className="text-sm font-medium text-muted-foreground mb-1">
                      {followedChannels.length === 0 ? t('noChannels') : t('browseChannel')}
                    </h3>
                    <p className="text-xs text-muted-foreground/60 max-w-[280px]">
                      {followedChannels.length === 0
                        ? t('noChannelsDescription')
                        : t('description')}
                    </p>
                  </div>
                )}

              {/* Loading state */}
              {browseLoading && <ChannelFetchLoadingState progress={browseFetchProgress} />}

              {/* Video List - QueueItem style */}
              {displayedBrowseVideos.length === 0 && browseVideos.length > 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">{t('noVideos')}</p>
              )}
              {displayedBrowseVideos.length > 0 && (
                <div className="space-y-2 pb-20">
                  {displayedBrowseVideos.slice(0, visibleVideoCount).map((video) => (
                    <ChannelVideoListItem
                      key={video.id}
                      video={video}
                      isSelected={selectedVideoIds.has(video.id)}
                      videoState={videoStates.get(video.id)}
                      onToggle={() => toggleVideoSelection(video.id)}
                      onOpenFolder={
                        videoStates.get(video.id)?.filepath
                          ? () => void openFileLocation(videoStates.get(video.id)?.filepath || '')
                          : outputPath && browseChannelName
                            ? () =>
                                void openFolderLocation(
                                  `${outputPath}/${sanitizeChannelFolderName(browseChannelName)}`,
                                )
                            : undefined
                      }
                      onOpenUrl={() => void openUrl(video.url)}
                      openFolderLabel={t('openFileLocation')}
                      openUrlLabel={t('openVideoWeb')}
                    />
                  ))}
                  {displayedBrowseVideos.length > visibleVideoCount && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setVisibleVideoCount((current) => current + 200)}
                    >
                      {t('loadMore')} ({displayedBrowseVideos.length - visibleVideoCount})
                    </Button>
                  )}
                </div>
              )}
            </div>

            {(browseHasMore || browseLoadingMore) && browseVideos.length > 0 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-4 pointer-events-none animate-in slide-in-from-bottom-4 fade-in duration-300">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={loadMoreChannelVideos}
                  disabled={browseLoadingMore}
                  className="h-9 px-4 rounded-full text-sm font-medium bg-background/80 hover:bg-background/90 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60 border border-border/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] ring-1 ring-white/10 pointer-events-auto"
                >
                  {browseLoadingMore ? (
                    <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" />
                  ) : (
                    <ListPlus className="w-4 h-4 sm:mr-1.5" />
                  )}
                  <span>{t('loadMore')}</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Followed Channels */}
        {(followedChannels.length > 0 ||
          Object.keys(channelProgressByUrl).length > 0 ||
          bulkChannelState.jobs.length > 0 ||
          bulkChannelState.history.length > 0) && (
          <div
            className={cn(
              'min-h-0 flex-shrink-0 border-l border-border/50 flex flex-col overflow-hidden transition-all duration-300',
              channelsCollapsed ? 'w-10' : 'w-72',
            )}
          >
            <div className="flex items-center justify-between px-3 py-3">
              {!channelsCollapsed && (
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t('followedChannels')}
                </h3>
              )}
              <div className={cn('flex items-center gap-0.5', channelsCollapsed && 'mx-auto')}>
                {!channelsCollapsed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => refreshChannels()}
                  >
                    <RefreshCw className="w-3 h-3" />
                  </Button>
                )}
                {!channelsCollapsed && followedChannels.length > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={toggleAllFollowedChannelSelection}
                      title={t('selectAll')}
                    >
                      {selectedFollowedChannelIds.size === followedChannels.length ? (
                        <CheckSquare className="w-3.5 h-3.5" />
                      ) : (
                        <Square className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => void handleBulkUpdateCreatorProcessing()}
                      disabled={selectedFollowedChannelIds.size === 0 || bulkChannelMutationRunning}
                      title={t('creator.title')}
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => void handleBulkUnfollow()}
                      disabled={selectedFollowedChannelIds.size === 0 || bulkChannelMutationRunning}
                      title={t('unfollow')}
                    >
                      {bulkChannelMutationRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setChannelsCollapsed((prev) => !prev)}
                  title={channelsCollapsed ? 'Expand' : 'Collapse'}
                >
                  <ChevronRight
                    className={cn(
                      'w-3.5 h-3.5 transition-transform duration-200',
                      !channelsCollapsed && 'rotate-180',
                    )}
                  />
                </Button>
              </div>
            </div>

            {!channelsCollapsed && (
              <>
                <BulkChannelQueuePanel
                  state={bulkChannelState}
                  progressByUrl={channelProgressByUrl}
                  onPause={pauseBulkChannelDownload}
                  onResume={resumeBulkChannelDownload}
                  onStop={stopBulkChannelDownload}
                  onStopAll={stopAllChannelWork}
                  onRetryFailed={retryFailedBulkChannelDownloads}
                  onRemoveQueuedBatch={removeQueuedBulkChannelBatch}
                />
                <ChannelActivityPanel
                  compact
                  progressByUrl={channelProgressByUrl}
                  followedChannels={followedChannels}
                />
              </>
            )}

            {!channelsCollapsed && (
              <>
                <div className="mx-3 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                  {followedChannels.map((channel) => (
                    <div key={channel.id} className="group relative">
                      {confirmPanelUnfollowId === channel.id ? (
                        <div className="flex items-center gap-1.5 p-2.5 rounded-xl bg-destructive/5 border border-destructive/20">
                          <p className="flex-1 text-xs text-muted-foreground truncate">
                            {t('confirmUnfollow')}
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => {
                              unfollowChannel(channel.id);
                              setConfirmPanelUnfollowId(null);
                            }}
                          >
                            {t('unfollow')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] px-2"
                            onClick={() => setConfirmPanelUnfollowId(null)}
                          >
                            {t('cancel')}
                          </Button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveChannel(channel);
                            }}
                            className={cn(
                              'w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all duration-200',
                              'hover:bg-accent/50 cursor-pointer text-left',
                              'border border-transparent',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={selectedFollowedChannelIds.has(channel.id)}
                              onChange={() => toggleFollowedChannelSelection(channel.id)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-3.5 w-3.5 flex-shrink-0 accent-primary"
                              aria-label={channel.name}
                            />
                            <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-muted ring-1 ring-white/[0.08]">
                              {channel.thumbnail ? (
                                <img
                                  src={channel.thumbnail}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                                  <Tv className="w-3.5 h-3.5 text-muted-foreground/40" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-medium truncate">{channel.name}</p>
                                <PlatformTag platform={channel.platform} size="xs" />
                                {(channelNewCounts[channel.id] || 0) > 0 && (
                                  <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground leading-none">
                                    {channelNewCounts[channel.id] > 99
                                      ? '99+'
                                      : channelNewCounts[channel.id]}
                                  </span>
                                )}
                              </div>
                              {channel.last_checked_at && (
                                <p className="text-[10px] text-muted-foreground/70 truncate mt-0.5 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {new Date(channel.last_checked_at).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          </button>
                          {outputPath && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                const folderName = sanitizeChannelFolderName(channel.name);
                                void openChannelFolderLocation(
                                  channel.id,
                                  [],
                                  `${outputPath}/${folderName}`,
                                ).catch((error) => {
                                  console.error('Failed to open channel folder:', error);
                                });
                              }}
                              className="absolute top-1.5 right-8 flex h-5 w-5 items-center justify-center rounded-full bg-muted/80 text-muted-foreground opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                              title={t('openChannelFolder')}
                            >
                              <FolderOpen className="h-3 w-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmPanelUnfollowId(channel.id);
                            }}
                            className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-muted/80 hover:bg-destructive/20 hover:text-destructive"
                            title={t('unfollow')}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      {(pendingCount > 0 || isDownloading) && (
        <footer className="flex-shrink-0">
          <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              {!isDownloading ? (
                <button
                  type="button"
                  className={cn(
                    'flex-1 h-11 px-6 rounded-xl font-medium text-sm sm:text-base',
                    'btn-gradient flex items-center justify-center gap-2',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'shadow-lg shadow-primary/20',
                    pendingCount > 0 && 'animate-pulse-subtle',
                  )}
                  onClick={handleStartDownload}
                  disabled={pendingCount === 0}
                >
                  <Download className="w-5 h-5" />
                  <span>{t('downloadSelected')}</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ) : (
                <Button
                  className="flex-1 h-11 text-sm sm:text-base rounded-xl"
                  variant="destructive"
                  onClick={stopDownload}
                >
                  <Square className="w-5 h-5 mr-2" />
                  Stop Download
                </Button>
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={deselectAllVideos}
                disabled={isDownloading}
                className="h-11 w-11 rounded-xl flex-shrink-0 bg-transparent border-border/50 hover:bg-white/10"
                title={t('deselectAll')}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </footer>
      )}

      {/* FFmpeg Required Dialog */}
      {showFfmpegDialog && (
        <FFmpegRequiredDialog
          quality={pendingQuality || quality}
          onDismiss={handleFfmpegDialogDismiss}
          onContinue={handleFfmpegDialogContinue}
        />
      )}
    </div>
  );
}

// ── Channel Detail View ──────────────────────────────────────────────
