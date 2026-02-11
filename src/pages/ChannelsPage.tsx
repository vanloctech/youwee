import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  Download,
  FileVideo,
  FolderOpen,
  Heart,
  Link,
  Loader2,
  Music,
  Play,
  RefreshCw,
  Search,
  Settings,
  Square,
  Tv,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FFmpegRequiredDialog } from '@/components/FFmpegRequiredDialog';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { VideoDownloadState } from '@/contexts/ChannelsContext';
import { useChannels } from '@/contexts/ChannelsContext';
import { useDependencies } from '@/contexts/DependenciesContext';
import type { FollowedChannel, Format, PlaylistVideoEntry, Quality, VideoCodec } from '@/lib/types';
import { cn } from '@/lib/utils';

// ── Quality / Format options (matching SettingsPanel) ─────────────────

const videoQualityOptions: { value: Quality; label: string; short: string }[] = [
  { value: 'best', label: 'Best Quality', short: 'Best' },
  { value: '8k', label: '8K (4320p)', short: '8K' },
  { value: '4k', label: '4K (2160p)', short: '4K' },
  { value: '2k', label: '2K (1440p)', short: '2K' },
  { value: '1080', label: '1080p (Full HD)', short: '1080p' },
  { value: '720', label: '720p (HD)', short: '720p' },
  { value: '480', label: '480p (SD)', short: '480p' },
  { value: '360', label: '360p', short: '360p' },
];

const videoFormatOptions: { value: Format; label: string }[] = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mkv', label: 'MKV' },
  { value: 'webm', label: 'WebM' },
];

const audioFormatOptions: { value: Format; label: string }[] = [
  { value: 'mp3', label: 'MP3' },
  { value: 'm4a', label: 'M4A' },
  { value: 'opus', label: 'Opus' },
];

const videoCodecOptions: { value: VideoCodec; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'h264', label: 'H.264' },
  { value: 'vp9', label: 'VP9' },
  { value: 'av1', label: 'AV1' },
];

// Qualities that require FFmpeg for video+audio merging
const FFMPEG_REQUIRED_QUALITIES: Quality[] = ['best', '8k', '4k', '2k'];

/** Load initial download settings from localStorage (same source as DownloadPage) */
function loadInitialSettings(): {
  quality: Quality;
  format: Format;
  videoCodec: VideoCodec;
  isAudioMode: boolean;
} {
  try {
    const saved = localStorage.getItem('youwee-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      const quality: Quality = parsed.quality || 'best';
      const format: Format = parsed.format || 'mp4';
      const videoCodec: VideoCodec = parsed.videoCodec || 'h264';
      const isAudioMode = quality === 'audio' || ['mp3', 'm4a', 'opus'].includes(format);

      // Normalize: if not audio mode but format is audio, reset to mp4
      // If audio mode but format is video, reset to mp3
      const normalizedFormat = isAudioMode
        ? ['mp3', 'm4a', 'opus'].includes(format)
          ? format
          : 'mp3'
        : ['mp4', 'mkv', 'webm'].includes(format)
          ? format
          : 'mp4';
      const normalizedQuality = isAudioMode ? 'audio' : quality === 'audio' ? 'best' : quality;

      return {
        quality: normalizedQuality,
        format: normalizedFormat,
        videoCodec,
        isAudioMode,
      };
    }
  } catch {
    /* ignore */
  }
  return { quality: 'best', format: 'mp4', videoCodec: 'h264', isAudioMode: false };
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatUploadDate(dateStr?: string): string {
  if (!dateStr) return '';
  if (dateStr.length === 8) {
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    return `${y}-${m}-${d}`;
  }
  return dateStr;
}

// ── Quality / Format Settings Bar (matching SettingsPanel) ───────────

function ChannelSettingsBar({
  quality,
  format,
  videoCodec,
  isAudioMode,
  onQualityChange,
  onFormatChange,
  onVideoCodecChange,
  onAudioModeToggle,
  outputPath,
  onSelectFolder,
  disabled,
}: {
  quality: Quality;
  format: Format;
  videoCodec: VideoCodec;
  isAudioMode: boolean;
  onQualityChange: (q: Quality) => void;
  onFormatChange: (f: Format) => void;
  onVideoCodecChange: (c: VideoCodec) => void;
  onAudioModeToggle: () => void;
  outputPath: string;
  onSelectFolder: () => void;
  disabled?: boolean;
}) {
  const formatOptions = isAudioMode ? audioFormatOptions : videoFormatOptions;
  const currentVideoQuality = isAudioMode ? '1080' : quality;
  const outputFolderName = outputPath ? outputPath.split('/').pop() || outputPath : '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Video / Audio toggle */}
      <div className="flex items-center p-0.5 rounded-lg bg-muted/50 border border-border/50">
        <button
          type="button"
          onClick={() => isAudioMode && onAudioModeToggle()}
          disabled={disabled}
          className={cn(
            'h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
            !isAudioMode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <FileVideo className="w-3.5 h-3.5" />
          Video
        </button>
        <button
          type="button"
          onClick={() => !isAudioMode && onAudioModeToggle()}
          disabled={disabled}
          className={cn(
            'h-8 px-3 rounded-md text-xs font-medium transition-all flex items-center gap-1.5',
            isAudioMode
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Music className="w-3.5 h-3.5" />
          Audio
        </button>
      </div>

      {/* Quality Select - Video mode only */}
      {!isAudioMode && (
        <Select
          value={currentVideoQuality}
          onValueChange={(v) => onQualityChange(v as Quality)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[85px] h-9 text-xs bg-card/50 border-border/50">
            <SelectValue>
              {videoQualityOptions.find((q) => q.value === currentVideoQuality)?.short || 'Best'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="min-w-[180px]">
            {videoQualityOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Format Select */}
      <Select value={format} onValueChange={(v) => onFormatChange(v as Format)} disabled={disabled}>
        <SelectTrigger className="w-[75px] h-9 text-xs bg-card/50 border-border/50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {formatOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value} className="text-xs">
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Video Codec Select - Video mode only */}
      {!isAudioMode && (
        <Select
          value={videoCodec}
          onValueChange={(v) => onVideoCodecChange(v as VideoCodec)}
          disabled={disabled}
        >
          <SelectTrigger className="w-[80px] h-9 text-xs bg-card/50 border-border/50">
            <SelectValue>
              {videoCodecOptions.find((c) => c.value === videoCodec)?.label || 'Auto'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {videoCodecOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Output Folder */}
      <button
        type="button"
        onClick={onSelectFolder}
        disabled={disabled}
        className="h-9 px-2.5 rounded-md border bg-card/50 border-border/50 text-xs flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors max-w-[180px]"
        title={outputPath || 'Select download folder'}
      >
        <FolderOpen className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{outputFolderName || 'Select Folder'}</span>
      </button>
    </div>
  );
}

// ── Video List Item (matches QueueItem style with progress) ──────────

function VideoListItem({
  video,
  isSelected,
  videoState,
  onToggle,
}: {
  video: PlaylistVideoEntry;
  isSelected: boolean;
  videoState?: VideoDownloadState;
  onToggle: () => void;
}) {
  const isActive = videoState?.status === 'downloading';
  const isCompleted = videoState?.status === 'completed';
  const isError = videoState?.status === 'error';
  const isPending = videoState?.status === 'pending';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'group w-full flex gap-3 p-2 rounded-xl transition-all duration-200 text-left',
        'bg-card/50 hover:bg-card/80',
        isSelected && !videoState && 'bg-primary/5',
        isActive && 'bg-primary/5',
        isCompleted && 'bg-emerald-500/5',
        isError && 'bg-red-500/5',
      )}
    >
      {/* Checkbox */}
      <div className="flex-shrink-0 flex items-center">
        <div
          className={cn(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
            isSelected
              ? 'bg-primary border-primary text-primary-foreground'
              : 'border-muted-foreground/30 group-hover:border-muted-foreground/50',
          )}
        >
          {isSelected && <Check className="w-3 h-3" />}
        </div>
      </div>

      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-28 h-[72px] sm:w-36 sm:h-20 rounded-lg overflow-hidden bg-muted">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            className={cn(
              'w-full h-full object-cover transition-all duration-300',
              isCompleted && 'opacity-60',
            )}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Tv className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}

        {/* Duration badge */}
        {video.duration && !isActive && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white font-medium tabular-nums">
            {formatDuration(video.duration)}
          </span>
        )}

        {/* Progress overlay (downloading) */}
        {isActive && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <div className="h-1.5 rounded-full overflow-hidden bg-white/20 mb-1 backdrop-blur-sm">
                <div
                  className="h-full rounded-full transition-all duration-300 relative overflow-hidden"
                  style={{
                    width: `${videoState?.progress || 0}%`,
                    background:
                      'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.8) 50%, hsl(var(--primary)) 100%)',
                  }}
                >
                  <div
                    className="absolute inset-0 w-full h-full animate-shimmer"
                    style={{
                      background:
                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                      backgroundSize: '200% 100%',
                    }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-white/90 font-medium">
                <span>{(videoState?.progress || 0).toFixed(0)}%</span>
                {videoState?.speed && <span>{videoState.speed}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Completed overlay */}
        {isCompleted && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
          </div>
        )}

        {/* Error overlay */}
        {isError && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
              <XCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <p
          className={cn(
            'text-sm font-medium leading-snug line-clamp-2 transition-colors',
            isCompleted && 'text-muted-foreground',
          )}
          title={video.title}
        >
          {video.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Status badge */}
          {videoState && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                isPending && 'bg-muted text-muted-foreground',
                isActive && 'bg-primary/10 text-primary',
                isCompleted && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                isError && 'bg-red-500/10 text-red-600 dark:text-red-400',
              )}
            >
              {isPending && <Clock className="w-3 h-3" />}
              {isActive && <Loader2 className="w-3 h-3 animate-spin" />}
              {isCompleted && <CheckCircle2 className="w-3 h-3" />}
              {isError && <XCircle className="w-3 h-3" />}
              <span>
                {isPending && 'Pending'}
                {isActive && `${(videoState.progress || 0).toFixed(0)}%`}
                {isCompleted && 'Completed'}
                {isError && 'Failed'}
              </span>
            </span>
          )}

          {/* Upload date */}
          {video.upload_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatUploadDate(video.upload_date)}
            </span>
          )}

          {/* Duration (inline text when not showing on thumbnail) */}
          {video.duration && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Play className="w-3 h-3" />
              {formatDuration(video.duration)}
            </span>
          )}

          {/* Error message */}
          {isError && videoState?.error && (
            <span className="text-xs text-red-500/80 line-clamp-1" title={videoState.error}>
              {videoState.error}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

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
  } = useChannels();

  const { ffmpegStatus } = useDependencies();

  const [urlInput, setUrlInput] = useState(browseUrl);
  const [followingUrl, setFollowingUrl] = useState(false);
  const [channelsCollapsed, setChannelsCollapsed] = useState(false);

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
      if (FFMPEG_REQUIRED_QUALITIES.includes(q) && !ffmpegStatus?.installed) {
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
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      return;
    }
    setBrowseUrl(url);
    fetchChannelVideos(url);
  }, [urlInput, setBrowseUrl, fetchChannelVideos]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleFetch();
      }
    },
    [handleFetch],
  );

  // Check if FFmpeg is required for current quality (for download button)
  const ffmpegRequired = FFMPEG_REQUIRED_QUALITIES.includes(quality) && !ffmpegStatus?.installed;

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
      await followChannel(browseUrl, browseChannelName, thumbnail ?? undefined);
    } catch (error) {
      console.error('Follow failed:', error);
    } finally {
      setFollowingUrl(false);
    }
  }, [browseUrl, browseChannelName, browseChannelAvatar, browseVideos, followChannel]);

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
              onChange={(e) => setUrlInput(e.target.value)}
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
              {browseLoading ? t('fetching') : t('fetchVideos')}
            </span>
          </button>
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
                      />
                    ) : (
                      <Tv className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div>
                    <h2 className="font-semibold text-sm leading-tight">{browseChannelName}</h2>
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
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-1">
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
            {!browseLoading && browseVideos.length === 0 && !browseError && !browseChannelName && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mb-4">
                  <Tv className="w-7 h-7 text-primary/40" />
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">
                  {followedChannels.length === 0 ? t('noChannels') : t('browseChannel')}
                </h3>
                <p className="text-xs text-muted-foreground/60 max-w-[280px]">
                  {followedChannels.length === 0 ? t('noChannelsDescription') : t('description')}
                </p>
              </div>
            )}

            {/* Loading state */}
            {browseLoading && (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                <p className="text-sm text-muted-foreground">{t('fetching')}</p>
              </div>
            )}

            {/* Video List - QueueItem style */}
            {browseVideos.length > 0 && (
              <div className="space-y-2 pb-4">
                {browseVideos.map((video) => (
                  <VideoListItem
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
                              activeChannel?.id === channel.id &&
                                'bg-primary/5 border-primary/20 hover:bg-primary/10',
                            )}
                          >
                            <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-muted ring-1 ring-white/[0.08]">
                              {channel.thumbnail ? (
                                <img
                                  src={channel.thumbnail}
                                  alt=""
                                  className="w-full h-full object-cover"
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

function ChannelDetailView({ channel, onBack }: { channel: FollowedChannel; onBack: () => void }) {
  const { t } = useTranslation('channels');
  const {
    unfollowChannel,
    updateChannelSettings,
    fetchChannelVideos,
    browseVideos,
    browseLoading,
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
  } = useChannels();

  const { ffmpegStatus } = useDependencies();

  const [confirmUnfollow, setConfirmUnfollow] = useState(false);

  // Channel settings panel state
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
  const [savingSettings, setSavingSettings] = useState(false);

  // Reset settings form when channel changes
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
  }, [channel]);

  const handleSaveSettings = useCallback(async () => {
    setSavingSettings(true);
    try {
      await updateChannelSettings({
        id: channel.id,
        checkInterval: Math.max(5, settingsCheckInterval),
        autoDownload: settingsAutoDownload,
        downloadQuality: channel.download_quality,
        downloadFormat: channel.download_format,
        filterMinDuration: settingsFilterMinDuration ? Number(settingsFilterMinDuration) : null,
        filterMaxDuration: settingsFilterMaxDuration ? Number(settingsFilterMaxDuration) : null,
        filterIncludeKeywords: settingsFilterIncludeKeywords || null,
        filterExcludeKeywords: settingsFilterExcludeKeywords || null,
        filterMaxVideos: settingsFilterMaxVideos ? Number(settingsFilterMaxVideos) : null,
      });
      setShowSettings(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSavingSettings(false);
    }
  }, [
    channel.id,
    channel.download_quality,
    channel.download_format,
    settingsCheckInterval,
    settingsAutoDownload,
    settingsFilterMinDuration,
    settingsFilterMaxDuration,
    settingsFilterIncludeKeywords,
    settingsFilterExcludeKeywords,
    settingsFilterMaxVideos,
    updateChannelSettings,
  ]);

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
      if (FFMPEG_REQUIRED_QUALITIES.includes(q) && !ffmpegStatus?.installed) {
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

  const handleUnfollow = useCallback(async () => {
    await unfollowChannel(channel.id);
    onBack();
  }, [channel.id, unfollowChannel, onBack]);

  // Check if FFmpeg is required for current quality (for download button)
  const ffmpegRequired = FFMPEG_REQUIRED_QUALITIES.includes(quality) && !ffmpegStatus?.installed;

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

  const pendingCount = selectedVideoIds.size;

  // Auto-fetch on mount
  useState(() => {
    fetchChannelVideos(channel.url);
  });

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-muted ring-1 ring-white/[0.08]">
              {channel.thumbnail ? (
                <img src={channel.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Tv className="w-4 h-4 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-semibold">{channel.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fetchChannelVideos(channel.url)}
            disabled={browseLoading}
          >
            {browseLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {t('checkNow')}
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

      {/* Divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Channel Settings Panel (collapsible) */}
      {showSettings && (
        <div className="flex-shrink-0 px-4 sm:px-6 py-4">
          <div className="bg-card/50 border border-border/50 rounded-xl p-5 space-y-5">
            {/* Auto Download + Check Interval row */}
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
                  onChange={(e) => setSettingsCheckInterval(Math.max(5, Number(e.target.value)))}
                  className="w-20 h-9 text-sm bg-background/50 border-border/50"
                />
                <span className="text-sm text-muted-foreground">{t('minutes')}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

            {/* Filters */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">{t('filters')}</Label>

              {/* Duration + Max Videos row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('minDuration')}</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settingsFilterMinDuration}
                    onChange={(e) => setSettingsFilterMinDuration(e.target.value)}
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
                    onChange={(e) => setSettingsFilterMaxDuration(e.target.value)}
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
                    onChange={(e) => setSettingsFilterMaxVideos(e.target.value)}
                    placeholder="20"
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
              </div>

              {/* Keywords row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('includeKeywords')}</Label>
                  <Input
                    value={settingsFilterIncludeKeywords}
                    onChange={(e) => setSettingsFilterIncludeKeywords(e.target.value)}
                    placeholder={t('includeKeywordsPlaceholder')}
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('excludeKeywords')}</Label>
                  <Input
                    value={settingsFilterExcludeKeywords}
                    onChange={(e) => setSettingsFilterExcludeKeywords(e.target.value)}
                    placeholder={t('excludeKeywordsPlaceholder')}
                    className="h-9 text-sm bg-background/50 border-border/50"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
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

      {/* Settings Bar */}
      <div className="flex-shrink-0 p-4 sm:px-6">
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
          disabled={isDownloading}
        />
      </div>

      {/* Divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      {/* Selection toolbar */}
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

      {/* Video List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6">
        {browseLoading && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">{t('fetching')}</p>
          </div>
        )}

        {browseVideos.length > 0 && (
          <div className="space-y-2 pb-4">
            {browseVideos.map((video) => (
              <VideoListItem
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
