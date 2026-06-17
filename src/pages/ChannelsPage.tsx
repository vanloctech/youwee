import {
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  Download,
  Heart,
  Link,
  ListPlus,
  Loader2,
  RefreshCw,
  Search,
  Square,
  Tv,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FFmpegRequiredDialog } from '@/components/FFmpegRequiredDialog';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { detectPlatform, isSupportedPlatform, useChannels } from '@/contexts/ChannelsContext';
import { useDependencies } from '@/contexts/DependenciesContext';
import type { Format, Quality, VideoCodec, YoutubeChannelContentType } from '@/lib/types';
import { cn } from '@/lib/utils';
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
    loadMoreChannelVideos,
  } = useChannels();

  const { ffmpegStatus } = useDependencies();

  const [urlInput, setUrlInput] = useState(browseUrl);
  const [youtubeContentType, setYoutubeContentType] =
    useState<YoutubeChannelContentType>(browseYoutubeContentType);
  const [followingUrl, setFollowingUrl] = useState(false);
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);
  const showYoutubeContentType = isYoutubeChannelContentUrl(urlInput.trim());

  // Settings state - initialized from shared localStorage (same as DownloadPage)
  const [initSettings] = useState(loadInitialSettings);
  const [quality, setQuality] = useState<Quality>(initSettings.quality);
  const [format, setFormat] = useState<Format>(initSettings.format);
  const [videoCodec, setVideoCodec] = useState<VideoCodec>(initSettings.videoCodec);
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
    const url = urlInput.trim();
    if (!url) return;
    if (!isSupportedPlatform(url)) {
      return;
    }
    const contentType = isYoutubeChannelContentUrl(url) ? youtubeContentType : 'videos';
    setBrowseUrl(url);
    fetchChannelVideos(url, undefined, contentType);
  }, [urlInput, youtubeContentType, setBrowseUrl, fetchChannelVideos]);

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
      await downloadSelectedVideos(quality, format, videoCodec);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, [downloadSelectedVideos, quality, format, videoCodec, ffmpegRequired]);

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
          audioBitrate: '192',
        },
        isYoutubeChannelContentUrl(browseUrl) ? youtubeContentType : 'videos',
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
    isAudioMode,
    youtubeContentType,
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
      <div className="flex-shrink-0 p-4 sm:p-6 space-y-3">
        {/* URL Input */}
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="url"
              value={urlInput}
              onChange={(e) => {
                const nextUrl = e.target.value;
                setUrlInput(nextUrl);
                if (isYoutubeChannelContentUrl(nextUrl)) {
                  setYoutubeContentType(getYoutubeContentTypeFromUrl(nextUrl));
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
          <button
            type="button"
            className={cn(
              'h-11 px-4 rounded-md font-medium text-sm',
              'btn-gradient flex items-center gap-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
            onClick={handleFetch}
            disabled={browseLoading || !urlInput.trim()}
            title={t('fetchVideos')}
          >
            {browseLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">
              {browseLoading
                ? browseFetchProgress
                  ? browseFetchProgress.limit
                    ? `${browseFetchProgress.fetched}/${browseFetchProgress.limit}`
                    : `${browseFetchProgress.fetched}`
                  : t('fetching')
                : t('fetchVideos')}
            </span>
          </button>
        </div>

        {/* Supported platforms hint */}
        <div className="flex items-center gap-1.5 px-1">
          <span className="text-[10px] text-muted-foreground/60">{t('supportedSites')}:</span>
          <PlatformTag platform="youtube" size="xs" />
          <PlatformTag platform="bilibili" size="xs" />
          <PlatformTag platform="youku" size="xs" />
        </div>

        {/* Settings Bar */}
        <ChannelSettingsBar
          quality={quality}
          format={format}
          videoCodec={videoCodec}
          isAudioMode={isAudioMode}
          onQualityChange={handleQualityChange}
          onFormatChange={setFormat}
          onVideoCodecChange={setVideoCodec}
          onAudioModeToggle={handleAudioModeToggle}
          outputPath={outputPath}
          onSelectFolder={selectOutputFolder}
          youtubeContentType={youtubeContentType}
          onYoutubeContentTypeChange={setYoutubeContentType}
          showYoutubeContentType={showYoutubeContentType}
          disabled={isDownloading}
        />
      </div>

      {/* Divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      {/* Main Content - Split Layout */}
      <div className="flex-1 flex overflow-hidden">
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
          {browseVideos.length > 0 && (
            <div className="flex-shrink-0 px-4 sm:px-6 py-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedVideoIds.size > 0
                    ? t('selected', { count: selectedVideoIds.size })
                    : t('videoCount', { count: browseVideos.length })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={
                    selectedVideoIds.size === browseVideos.length
                      ? deselectAllVideos
                      : selectAllVideos
                  }
                  className="h-7 text-xs"
                  disabled={isDownloading}
                >
                  {selectedVideoIds.size === browseVideos.length ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  {selectedVideoIds.size === browseVideos.length
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
              {browseVideos.length > 0 && (
                <div className="space-y-2 pb-20">
                  {browseVideos.map((video) => (
                    <ChannelVideoListItem
                      key={video.id}
                      video={video}
                      isSelected={selectedVideoIds.has(video.id)}
                      videoState={videoStates.get(video.id)}
                      onToggle={() => toggleVideoSelection(video.id)}
                    />
                  ))}
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
        {followedChannels.length > 0 && (
          <div
            className={cn(
              'flex-shrink-0 border-l border-border/50 flex flex-col overflow-hidden transition-all duration-300',
              channelsCollapsed ? 'w-10' : 'w-64',
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
