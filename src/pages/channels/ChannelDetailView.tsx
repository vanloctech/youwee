import {
  ArrowLeft,
  CheckSquare,
  Download,
  ListPlus,
  Loader2,
  RefreshCw,
  Settings,
  Square,
  Tv,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FFmpegRequiredDialog } from '@/components/FFmpegRequiredDialog';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useChannels } from '@/contexts/channels-context';
import { useDependencies } from '@/contexts/DependenciesContext';
import type {
  FollowedChannel,
  PreferredFps,
  Quality,
  YoutubeChannelContentType,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChannelFetchLoadingState } from '@/pages/channels/ChannelFetchLoadingState';
import { ChannelSettingsBar, YoutubeContentTypeSelect } from '@/pages/channels/ChannelSettingsBar';
import { ChannelVideoListItem } from '@/pages/channels/ChannelVideoListItem';
import {
  FFMPEG_REQUIRED_QUALITIES,
  isYoutubeChannelContentUrl,
  loadInitialSettings,
} from '@/pages/channels/channelUtils';
import { PlatformTag } from '@/pages/channels/PlatformTag';

type ChannelDetailViewProps = {
  channel: FollowedChannel;
  onBack: () => void;
};

export function ChannelDetailView({ channel, onBack }: ChannelDetailViewProps) {
  const { t } = useTranslation('channels');
  const {
    unfollowChannel,
    updateChannelSettings,
    fetchChannelVideos,
    clearBrowse,
    browseUrl,
    browseVideos,
    browseLoading,
    browseFetchProgress,
    browseHasMore,
    browseLoadingMore,
    loadMoreChannelVideos,
    stopChannelFetch,
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
    setActiveChannel,
  } = useChannels();

  const { ffmpegStatus } = useDependencies();

  const [confirmUnfollow, setConfirmUnfollow] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsCheckInterval, setSettingsCheckInterval] = useState(channel.check_interval);
  const [settingsAutoDownload, setSettingsAutoDownload] = useState(channel.auto_download);
  const [settingsFilterMinDuration, setSettingsFilterMinDuration] = useState<string>(
    channel.filter_min_duration != null ? String(channel.filter_min_duration) : '',
  );
  const [settingsFilterMaxDuration, setSettingsFilterMaxDuration] = useState<string>(
    channel.filter_max_duration != null ? String(channel.filter_max_duration) : '',
  );
  const [settingsFilterIncludeKeywords, setSettingsFilterIncludeKeywords] = useState(
    channel.filter_include_keywords || '',
  );
  const [settingsFilterExcludeKeywords, setSettingsFilterExcludeKeywords] = useState(
    channel.filter_exclude_keywords || '',
  );
  const [settingsFilterMaxVideos, setSettingsFilterMaxVideos] = useState<string>(
    channel.filter_max_videos != null ? String(channel.filter_max_videos) : '20',
  );
  const [settingsDownloadThreads, setSettingsDownloadThreads] = useState(
    channel.download_threads || 1,
  );
  const [settingsDownloadQuality, setSettingsDownloadQuality] = useState(
    channel.download_quality || 'best',
  );
  const [settingsDownloadFormat, setSettingsDownloadFormat] = useState(
    channel.download_format || 'mp4',
  );
  const [settingsDownloadVideoCodec, setSettingsDownloadVideoCodec] = useState(
    channel.download_video_codec || 'h264',
  );
  const [settingsDownloadPreferredFps, setSettingsDownloadPreferredFps] = useState<PreferredFps>(
    channel.download_preferred_fps === '30' ? '30' : 'original',
  );
  const [settingsDownloadAudioBitrate, setSettingsDownloadAudioBitrate] = useState(
    channel.download_audio_bitrate || '192',
  );
  const [settingsYoutubeContentType, setSettingsYoutubeContentType] =
    useState<YoutubeChannelContentType>(channel.youtube_content_type || 'videos');
  const [settingsIsAudioMode, setSettingsIsAudioMode] = useState(
    channel.download_quality === 'audio' ||
      ['mp3', 'm4a', 'opus'].includes(channel.download_format),
  );
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    setSettingsCheckInterval(channel.check_interval);
    setSettingsAutoDownload(channel.auto_download);
    setSettingsFilterMinDuration(
      channel.filter_min_duration != null ? String(channel.filter_min_duration) : '',
    );
    setSettingsFilterMaxDuration(
      channel.filter_max_duration != null ? String(channel.filter_max_duration) : '',
    );
    setSettingsFilterIncludeKeywords(channel.filter_include_keywords || '');
    setSettingsFilterExcludeKeywords(channel.filter_exclude_keywords || '');
    setSettingsFilterMaxVideos(
      channel.filter_max_videos != null ? String(channel.filter_max_videos) : '20',
    );
    setSettingsDownloadThreads(channel.download_threads || 1);
    setSettingsDownloadQuality(channel.download_quality || 'best');
    setSettingsDownloadFormat(channel.download_format || 'mp4');
    setSettingsDownloadVideoCodec(channel.download_video_codec || 'h264');
    setSettingsDownloadPreferredFps(channel.download_preferred_fps === '30' ? '30' : 'original');
    setSettingsDownloadAudioBitrate(channel.download_audio_bitrate || '192');
    setSettingsYoutubeContentType(channel.youtube_content_type || 'videos');
    setSettingsIsAudioMode(
      channel.download_quality === 'audio' ||
        ['mp3', 'm4a', 'opus'].includes(channel.download_format),
    );
  }, [channel]);

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await updateChannelSettings({
        id: channel.id,
        checkInterval: Math.max(5, settingsCheckInterval),
        autoDownload: settingsAutoDownload,
        downloadQuality: settingsIsAudioMode ? 'audio' : settingsDownloadQuality,
        downloadFormat: settingsDownloadFormat,
        downloadVideoCodec: settingsDownloadVideoCodec,
        downloadPreferredFps: settingsDownloadPreferredFps,
        downloadAudioBitrate: settingsDownloadAudioBitrate,
        filterMinDuration: settingsFilterMinDuration ? Number(settingsFilterMinDuration) : null,
        filterMaxDuration: settingsFilterMaxDuration ? Number(settingsFilterMaxDuration) : null,
        filterIncludeKeywords: settingsFilterIncludeKeywords || null,
        filterExcludeKeywords: settingsFilterExcludeKeywords || null,
        filterMaxVideos: settingsFilterMaxVideos ? Number(settingsFilterMaxVideos) : null,
        downloadThreads: Math.max(1, settingsDownloadThreads),
        youtubeContentType: isYoutubeChannelContentUrl(channel.url)
          ? settingsYoutubeContentType
          : 'videos',
      });
      setActiveChannel({
        ...channel,
        check_interval: Math.max(5, settingsCheckInterval),
        auto_download: settingsAutoDownload,
        download_quality: settingsIsAudioMode ? 'audio' : settingsDownloadQuality,
        download_format: settingsDownloadFormat,
        download_video_codec: settingsDownloadVideoCodec,
        download_preferred_fps: settingsDownloadPreferredFps,
        download_audio_bitrate: settingsDownloadAudioBitrate,
        filter_min_duration: settingsFilterMinDuration
          ? Number(settingsFilterMinDuration)
          : undefined,
        filter_max_duration: settingsFilterMaxDuration
          ? Number(settingsFilterMaxDuration)
          : undefined,
        filter_include_keywords: settingsFilterIncludeKeywords || undefined,
        filter_exclude_keywords: settingsFilterExcludeKeywords || undefined,
        filter_max_videos: settingsFilterMaxVideos ? Number(settingsFilterMaxVideos) : undefined,
        download_threads: Math.max(1, settingsDownloadThreads),
        youtube_content_type: isYoutubeChannelContentUrl(channel.url)
          ? settingsYoutubeContentType
          : 'videos',
      });
      setShowSettings(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSavingSettings(false);
    }
  }, [
    channel,
    settingsCheckInterval,
    settingsAutoDownload,
    settingsDownloadQuality,
    settingsDownloadFormat,
    settingsDownloadVideoCodec,
    settingsDownloadPreferredFps,
    settingsDownloadAudioBitrate,
    settingsYoutubeContentType,
    settingsIsAudioMode,
    settingsFilterMinDuration,
    settingsFilterMaxDuration,
    settingsFilterIncludeKeywords,
    settingsFilterExcludeKeywords,
    settingsFilterMaxVideos,
    settingsDownloadThreads,
    setActiveChannel,
    updateChannelSettings,
  ]);

  const [initSettings] = useState(loadInitialSettings);
  const [quality, setQuality] = useState<Quality>(initSettings.quality);
  const [format, setFormat] = useState(initSettings.format);
  const [videoCodec, setVideoCodec] = useState(initSettings.videoCodec);
  const [preferredFps, setPreferredFps] = useState<PreferredFps>(initSettings.preferredFps);
  const [isAudioMode, setIsAudioMode] = useState(initSettings.isAudioMode);

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

  const handleQualityChange = useCallback(
    (nextQuality: Quality) => {
      if (FFMPEG_REQUIRED_QUALITIES.includes(nextQuality) && ffmpegStatus?.installed === false) {
        setPendingQuality(nextQuality);
        setShowFfmpegDialog(true);
        return;
      }
      setQuality(nextQuality);
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

  const handleUnfollow = useCallback(async () => {
    await unfollowChannel(channel.id);
    onBack();
  }, [channel.id, unfollowChannel, onBack]);

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

  const pendingCount = selectedVideoIds.size;
  const canReuseInitialBrowseRef = useRef(browseUrl === channel.url && browseVideos.length > 0);

  useEffect(() => {
    if (!canReuseInitialBrowseRef.current) {
      fetchChannelVideos(channel.url, undefined, channel.youtube_content_type || 'videos');
    }

    return () => {
      clearBrowse();
    };
  }, [channel.url, channel.youtube_content_type, fetchChannelVideos, clearBrowse]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-muted ring-1 ring-white/[0.08]">
              {channel.thumbnail ? (
                <img
                  src={channel.thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Tv className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-semibold">{channel.name}</h1>
            <PlatformTag platform={channel.platform} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={browseLoading || browseLoadingMore ? 'destructive' : 'ghost'}
            size="sm"
            onClick={() =>
              browseLoading || browseLoadingMore
                ? stopChannelFetch()
                : fetchChannelVideos(
                    channel.url,
                    undefined,
                    channel.youtube_content_type || 'videos',
                  )
            }
            disabled={false}
          >
            {browseLoading || browseLoadingMore ? (
              <Square className="w-3.5 h-3.5" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {browseLoading || browseLoadingMore ? t('stopFetch') : t('checkNow')}
          </Button>
          <Button
            variant={showSettings ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowSettings((prev) => !prev)}
            title={t('settings')}
          >
            <Settings className="w-3.5 h-3.5" />
          </Button>
          {confirmUnfollow ? (
            <div className="flex items-center gap-1">
              <Button variant="destructive" size="sm" onClick={handleUnfollow}>
                {t('unfollow')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmUnfollow(false)}>
                {t('cancel')}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setConfirmUnfollow(true)}>
              {t('unfollow')}
            </Button>
          )}
          <ThemePicker />
        </div>
      </header>

      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {showSettings && (
        <div className="flex-shrink-0 px-4 sm:px-6 py-4">
          <div className="bg-card/50 border border-border/50 rounded-xl p-5 space-y-5">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3 flex-1">
                <Switch checked={settingsAutoDownload} onCheckedChange={setSettingsAutoDownload} />
                <div>
                  <Label className="text-sm font-medium">{t('autoDownload')}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('autoDownloadDescription')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Label className="text-sm text-muted-foreground">{t('checkInterval')}</Label>
                <Input
                  type="number"
                  min={5}
                  value={settingsCheckInterval}
                  onChange={(event) =>
                    setSettingsCheckInterval(Math.max(5, Number(event.target.value)))
                  }
                  className="w-20 h-9 text-sm bg-background/50 border-border/50"
                />
                <span className="text-sm text-muted-foreground">{t('minutes')}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Label className="text-sm text-muted-foreground">{t('downloadThreads')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={settingsDownloadThreads}
                  onChange={(event) =>
                    setSettingsDownloadThreads(Math.max(1, Math.min(5, Number(event.target.value))))
                  }
                  className="w-16 h-9 text-sm bg-background/50 border-border/50"
                />
              </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

            <div className="space-y-3">
              <Label className="text-sm font-medium">{t('downloadSettings')}</Label>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsIsAudioMode(false);
                      setSettingsDownloadQuality('best');
                      setSettingsDownloadFormat('mp4');
                    }}
                    className={cn(
                      'px-3 h-8 rounded-md text-xs font-medium transition-colors',
                      !settingsIsAudioMode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t('videoMode')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsIsAudioMode(true);
                      setSettingsDownloadQuality('audio');
                      setSettingsDownloadFormat('mp3');
                    }}
                    className={cn(
                      'px-3 h-8 rounded-md text-xs font-medium transition-colors',
                      settingsIsAudioMode
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t('audioMode')}
                  </button>
                </div>

                {isYoutubeChannelContentUrl(channel.url) && (
                  <YoutubeContentTypeSelect
                    value={settingsYoutubeContentType}
                    onChange={setSettingsYoutubeContentType}
                    disabled={savingSettings}
                  />
                )}

                {!settingsIsAudioMode && (
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">{t('quality')}</Label>
                    <select
                      value={settingsDownloadQuality}
                      onChange={(event) => setSettingsDownloadQuality(event.target.value)}
                      className="h-8 px-2 rounded-md text-xs bg-background/50 border border-border/50"
                    >
                      <option value="best">Best</option>
                      <option value="4k">4K</option>
                      <option value="2k">2K</option>
                      <option value="1080">1080p</option>
                      <option value="720">720p</option>
                      <option value="480">480p</option>
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('format')}</Label>
                  <select
                    value={settingsDownloadFormat}
                    onChange={(event) => setSettingsDownloadFormat(event.target.value)}
                    className="h-8 px-2 rounded-md text-xs bg-background/50 border border-border/50"
                  >
                    {settingsIsAudioMode ? (
                      <>
                        <option value="mp3">MP3</option>
                        <option value="m4a">M4A</option>
                        <option value="opus">Opus</option>
                      </>
                    ) : (
                      <>
                        <option value="mp4">MP4</option>
                        <option value="mkv">MKV</option>
                        <option value="webm">WebM</option>
                      </>
                    )}
                  </select>
                </div>

                {!settingsIsAudioMode && (
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">{t('codec')}</Label>
                    <select
                      value={settingsDownloadVideoCodec}
                      onChange={(event) => setSettingsDownloadVideoCodec(event.target.value)}
                      className="h-8 px-2 rounded-md text-xs bg-background/50 border border-border/50"
                    >
                      <option value="h264">H.264</option>
                      <option value="vp9">VP9</option>
                      <option value="av1">AV1</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>
                )}

                {!settingsIsAudioMode && (
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">{t('frameRate')}</Label>
                    <select
                      value={settingsDownloadPreferredFps}
                      onChange={(event) =>
                        setSettingsDownloadPreferredFps(event.target.value as PreferredFps)
                      }
                      className="h-8 px-2 rounded-md text-xs bg-background/50 border border-border/50"
                    >
                      <option value="original">{t('frameRateOriginal')}</option>
                      <option value="30">{t('frameRate30')}</option>
                    </select>
                  </div>
                )}

                {settingsIsAudioMode && (
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">{t('audioBitrate')}</Label>
                    <select
                      value={settingsDownloadAudioBitrate}
                      onChange={(event) => setSettingsDownloadAudioBitrate(event.target.value)}
                      className="h-8 px-2 rounded-md text-xs bg-background/50 border border-border/50"
                    >
                      <option value="128">128 kbps</option>
                      <option value="192">192 kbps</option>
                      <option value="256">256 kbps</option>
                      <option value="320">320 kbps</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

            <div className="space-y-4">
              <Label className="text-sm font-medium">{t('filters')}</Label>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('minDuration')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settingsFilterMinDuration}
                    onChange={(event) => setSettingsFilterMinDuration(event.target.value)}
                    placeholder="0"
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('maxDuration')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settingsFilterMaxDuration}
                    onChange={(event) => setSettingsFilterMaxDuration(event.target.value)}
                    placeholder="0"
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('maxVideosPerCheck')}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settingsFilterMaxVideos}
                    onChange={(event) => setSettingsFilterMaxVideos(event.target.value)}
                    placeholder="20"
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('includeKeywords')}</Label>
                  <Input
                    value={settingsFilterIncludeKeywords}
                    onChange={(event) => setSettingsFilterIncludeKeywords(event.target.value)}
                    placeholder={t('includeKeywordsPlaceholder')}
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('excludeKeywords')}</Label>
                  <Input
                    value={settingsFilterExcludeKeywords}
                    onChange={(event) => setSettingsFilterExcludeKeywords(event.target.value)}
                    placeholder={t('excludeKeywordsPlaceholder')}
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="h-9 text-sm px-4"
              >
                {t('cancel')}
              </Button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className={cn(
                  'h-9 px-4 rounded-md text-sm font-medium',
                  'btn-gradient flex items-center gap-1.5',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
              >
                {savingSettings && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-shrink-0 p-4 sm:px-6">
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
          disabled={isDownloading}
        />
      </div>

      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      {browseVideos.length > 0 && (
        <div className="flex-shrink-0 px-4 sm:px-6 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selectedVideoIds.size > 0
              ? t('selected', { count: selectedVideoIds.size })
              : t('videoCount', { count: browseVideos.length })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={
              selectedVideoIds.size === browseVideos.length ? deselectAllVideos : selectAllVideos
            }
            className="h-7 text-xs"
            disabled={isDownloading}
          >
            {selectedVideoIds.size === browseVideos.length ? (
              <CheckSquare className="w-3.5 h-3.5" />
            ) : (
              <Square className="w-3.5 h-3.5" />
            )}
            {selectedVideoIds.size === browseVideos.length ? t('deselectAll') : t('selectAll')}
          </Button>
        </div>
      )}

      <div className="relative flex-1 min-h-0">
        <div className="h-full overflow-y-auto px-4 sm:px-6">
          {browseLoading && <ChannelFetchLoadingState progress={browseFetchProgress} />}

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
