import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  Lightbulb,
  ListVideo,
  Loader2,
  MonitorPlay,
  Play,
  RefreshCw,
  Scissors,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { type ChangeEvent, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import { useAI } from '@/contexts/AIContext';
import type { DownloadItem, ItemDownloadSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

// Parse a duration string like "5:30" or "1:05:30" to total seconds
function parseDurationString(dur: string): number {
  const parts = dur.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

// Auto-format digits into M:SS or H:MM:SS
function autoFormatTimeInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 2) return digits;
  if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`;
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  if (digits.length === 5) return `${digits[0]}:${digits.slice(1, 3)}:${digits.slice(3)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
}

// Validate time string format (M:SS or H:MM:SS) and return seconds, or -1 if invalid
function parseTimeToSeconds(val: string): number {
  if (!val) return -1;
  const match = val.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return -1;
  if (match[3] !== undefined) {
    // H:MM:SS
    const h = Number(match[1]);
    const m = Number(match[2]);
    const s = Number(match[3]);
    if (m >= 60 || s >= 60) return -1;
    return h * 3600 + m * 60 + s;
  }
  // M:SS
  const m = Number(match[1]);
  const s = Number(match[2]);
  if (s >= 60) return -1;
  return m * 60 + s;
}

// Helper to format file size
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}

// Helper to format quality display
function formatQuality(quality: string): string {
  const qualityMap: Record<string, string> = {
    best: 'Best',
    '8k': '8K',
    '4k': '4K',
    '2k': '2K',
    '1080': '1080p',
    '720': '720p',
    '480': '480p',
    '360': '360p',
    audio: 'Audio',
  };
  return qualityMap[quality] || quality;
}

interface QueueItemProps {
  item: DownloadItem;
  isFocused?: boolean;
  showPlaylistBadge?: boolean;
  disabled?: boolean;
  onRemove: (id: string) => void;
  onUpdateTimeRange: (id: string, start?: string, end?: string) => void;
}

export function QueueItem({
  item,
  isFocused = false,
  showPlaylistBadge,
  disabled,
  onRemove,
  onUpdateTimeRange,
}: QueueItemProps) {
  const { t } = useTranslation('download');
  const ai = useAI();
  const [showFullSummary, setShowFullSummary] = useState(false);
  const [showTimeRange, setShowTimeRange] = useState(false);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  // Use background task for summary - taskId is based on item.id
  const taskId = `queue-${item.id}`;
  const task = ai.getSummaryTask(taskId);

  // Only show AI features if enabled
  const aiEnabled = ai.config.enabled;

  // Local summary state (from task or regenerated)
  const summary = task?.status === 'completed' ? task.summary : null;
  // Don't show AI errors if AI is disabled (user didn't explicitly use AI)
  const summaryError = aiEnabled && task?.status === 'error' ? task.error : null;
  const isGenerating = task?.status === 'fetching' || task?.status === 'generating';
  const generatingStatus =
    task?.status === 'fetching' ? 'fetching' : task?.status === 'generating' ? 'generating' : null;

  // Extract video ID for thumbnail
  const getVideoId = (url: string) => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/);
    return match ? match[1] : null;
  };

  const handleGenerateSummary = () => {
    if (isGenerating) return;

    // Clear previous error if any
    if (task?.status === 'error') {
      ai.clearSummaryTask(taskId);
    }

    // Start background task (will check if AI is enabled)
    ai.startQueueSummaryTask(taskId, {
      url: item.url,
      title: item.title,
      thumbnail: item.thumbnail,
      duration: item.duration ? parseFloat(item.duration) : undefined,
      source: 'youtube',
    });
  };

  const videoId = getVideoId(item.url);
  const thumbnailUrl =
    item.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null);

  const isActive = item.status === 'downloading' || item.status === 'fetching';
  const isCompleted = item.status === 'completed';
  const isError = item.status === 'error';
  const isPending = item.status === 'pending';

  // Get saved settings for pending items
  const itemSettings = item.settings as ItemDownloadSettings | undefined;

  const hasTimeRange = !!(itemSettings?.timeRangeStart && itemSettings?.timeRangeEnd);

  const handleApplyTimeRange = useCallback(() => {
    if (timeStart && timeEnd) {
      onUpdateTimeRange(item.id, timeStart, timeEnd);
      setShowTimeRange(false);
    }
  }, [item.id, onUpdateTimeRange, timeStart, timeEnd]);

  const handleClearTimeRange = useCallback(() => {
    onUpdateTimeRange(item.id, undefined, undefined);
    setTimeStart('');
    setTimeEnd('');
    setShowTimeRange(false);
  }, [item.id, onUpdateTimeRange]);

  const handleToggleTimeRange = useCallback(() => {
    setShowTimeRange((v) => {
      if (!v) {
        // Restore saved values when opening
        setTimeStart(itemSettings?.timeRangeStart ?? '');
        setTimeEnd(itemSettings?.timeRangeEnd ?? '');
      }
      return !v;
    });
  }, [itemSettings?.timeRangeStart, itemSettings?.timeRangeEnd]);

  const handleTimeStartChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setTimeStart(autoFormatTimeInput(e.target.value));
  }, []);

  const handleTimeEndChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setTimeEnd(autoFormatTimeInput(e.target.value));
  }, []);

  // Compute duration info and validation
  const durationSeconds = useMemo(
    () => (item.duration ? parseDurationString(item.duration) : 0),
    [item.duration],
  );
  const isLongVideo = durationSeconds >= 3600;
  const timePlaceholder = isLongVideo ? 'H:MM:SS' : 'M:SS';

  const startSeconds = useMemo(() => parseTimeToSeconds(timeStart), [timeStart]);
  const endSeconds = useMemo(() => parseTimeToSeconds(timeEnd), [timeEnd]);
  const isStartValid = timeStart === '' || startSeconds >= 0;
  const isEndValid = timeEnd === '' || endSeconds >= 0;
  const isRangeValid =
    !timeStart || !timeEnd || (startSeconds >= 0 && endSeconds >= 0 && startSeconds < endSeconds);
  const canApply = timeStart !== '' && timeEnd !== '' && isStartValid && isEndValid && isRangeValid;

  return (
    <div
      data-queue-item-id={item.id}
      className={cn(
        'group relative flex gap-3 p-2 rounded-xl border border-transparent transition-all duration-200',
        'bg-card/50 hover:bg-card/80',
        isFocused && 'border-primary/35 bg-primary/[0.08]',
        isActive && 'bg-primary/5',
        isCompleted && 'bg-emerald-500/5',
        isError && 'bg-red-500/5',
      )}
    >
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-28 h-[72px] sm:w-36 sm:h-20 rounded-lg overflow-hidden bg-muted">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className={cn(
              'w-full h-full object-cover transition-all duration-300',
              isCompleted && 'opacity-60',
            )}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <ListVideo className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}

        {/* Progress Overlay - Only when downloading */}
        {isActive && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
            {/* Progress Bar at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <div className="h-1.5 rounded-full overflow-hidden bg-white/20 mb-1 backdrop-blur-sm">
                {/* Live stream: indeterminate shimmer progress bar */}
                {item.isLive && item.progress === 0 ? (
                  <div
                    className="h-full w-full rounded-full animate-shimmer"
                    style={{
                      background:
                        'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.5) 25%, hsl(var(--primary)) 50%, hsl(var(--primary)/0.5) 75%, hsl(var(--primary)) 100%)',
                      backgroundSize: '200% 100%',
                    }}
                  />
                ) : (
                  <div
                    className="h-full rounded-full transition-all duration-300 relative overflow-hidden"
                    style={{
                      width: `${item.progress}%`,
                      background:
                        'linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.8) 50%, hsl(var(--primary)) 100%)',
                    }}
                  >
                    {/* Shimmer effect */}
                    <div
                      className="absolute inset-0 w-full h-full animate-shimmer"
                      style={{
                        background:
                          'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                        backgroundSize: '200% 100%',
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-white/90 font-medium">
                {/* Live stream: show "LIVE • elapsed time" only */}
                {item.isLive && item.progress === 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="flex items-center gap-1 text-red-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      LIVE
                    </span>
                    {item.elapsedTime && (
                      <>
                        <span className="text-white/50">•</span>
                        <span>{item.elapsedTime}</span>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <span>{item.progress.toFixed(0)}%</span>
                    {item.speed && <span>{item.speed}</span>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Completed Overlay */}
        {isCompleted && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
          </div>
        )}

        {/* Error Overlay */}
        {isError && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
              <XCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        )}

        {/* Pending Overlay */}
        {isPending && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play className="w-5 h-5 text-black ml-0.5" />
            </div>
          </div>
        )}

        {/* Playlist Badge */}
        {item.isPlaylist && showPlaylistBadge && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] flex items-center gap-1">
            <ListVideo className="w-3 h-3" />
            <span>{t('queue.playlist')}</span>
          </div>
        )}

        {/* Live Badge */}
        {item.isLive && (
          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] flex items-center gap-1 font-medium animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>{t('queue.live')}</span>
          </div>
        )}

        {/* Playlist Progress */}
        {item.playlistIndex && item.playlistTotal && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium tabular-nums">
            {item.playlistIndex}/{item.playlistTotal}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        {/* Title */}
        <p
          className={cn(
            'text-sm font-medium leading-snug line-clamp-2 transition-colors',
            isCompleted && 'text-muted-foreground',
          )}
          title={item.title}
        >
          {item.title}
        </p>

        {/* Info Row — static badges */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {/* Status Badge */}
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
              {isPending && t('queue.status.pending')}
              {isActive &&
                (item.status === 'fetching'
                  ? t('queue.status.fetching')
                  : t('queue.status.downloading'))}
              {isCompleted && t('queue.status.completed')}
              {isError && t('queue.status.failed')}
            </span>
          </span>

          {/* Settings badges for pending/downloading items */}
          {(isPending || isActive) && itemSettings && (
            <>
              <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                <MonitorPlay className="w-3 h-3" />
                {formatQuality(itemSettings.quality)}
              </span>
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium uppercase">
                {itemSettings.format}
              </span>
            </>
          )}

          {/* Time range info badge (read-only, shown when time range is set and not pending) */}
          {!isPending && hasTimeRange && itemSettings && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
              <Scissors className="w-3 h-3" />
              {itemSettings.timeRangeStart}-{itemSettings.timeRangeEnd}
            </span>
          )}

          {/* Completed Info: Resolution, Size, Format */}
          {isCompleted && (
            <>
              {item.completedResolution && (
                <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  <MonitorPlay className="w-3 h-3" />
                  {item.completedResolution}
                </span>
              )}
              {item.completedFilesize && item.completedFilesize > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">
                  <HardDrive className="w-3 h-3" />
                  {formatFileSize(item.completedFilesize)}
                </span>
              )}
              {item.completedFormat && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground uppercase">
                  {item.completedFormat}
                </span>
              )}
            </>
          )}

          {/* Error Message */}
          {isError && item.error && (
            <span className="text-xs text-red-500/80 line-clamp-2" title={item.error}>
              {item.error}
            </span>
          )}

          {/* Failed Hint - View Logs */}
          {isError && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <Lightbulb className="w-3 h-3" />
              {t('queue.status.failedHint')}
            </span>
          )}

          {/* Generating Status (inline with info badges) */}
          {isGenerating && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              {generatingStatus === 'fetching'
                ? t('queue.fetchingTranscript')
                : t('queue.generating')}
            </span>
          )}
        </div>

        {/* Actions Row — interactive buttons, visually distinct */}
        {!isActive && !isError && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {/* Time Range button (only when pending) */}
            {isPending && itemSettings && (
              <button
                type="button"
                onClick={handleToggleTimeRange}
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border transition-colors font-medium',
                  hasTimeRange
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                    : 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-muted/50',
                )}
              >
                <Scissors className="w-3 h-3" />
                {hasTimeRange
                  ? `${itemSettings.timeRangeStart}-${itemSettings.timeRangeEnd}`
                  : t('queue.timeRange.title')}
              </button>
            )}

            {/* AI Summarize Button */}
            {aiEnabled && !summary && !isGenerating && !summaryError && (
              <button
                type="button"
                onClick={handleGenerateSummary}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-purple-500/30 text-purple-600 dark:text-purple-400 hover:border-purple-500/50 hover:bg-purple-500/10 transition-colors font-medium"
              >
                <Sparkles className="w-3 h-3" />
                {t('queue.summarize')}
              </button>
            )}
          </div>
        )}

        {/* AI Summary Section */}
        {(summary || summaryError) && (
          <div className="mt-2">
            {summary ? (
              <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs text-muted-foreground overflow-hidden"
                      style={!showFullSummary ? { maxHeight: '3em' } : undefined}
                    >
                      <SimpleMarkdown content={summary} />
                    </div>
                    {summary.length > 100 && (
                      <button
                        type="button"
                        onClick={() => setShowFullSummary(!showFullSummary)}
                        className="text-[11px] text-purple-500 hover:text-purple-400 mt-1 flex items-center gap-0.5"
                      >
                        {showFullSummary ? (
                          <>
                            {t('queue.showLess')} <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            {t('queue.showMore')} <ChevronDown className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateSummary}
                    disabled={isGenerating}
                    className="p-1 rounded text-muted-foreground hover:text-purple-500 transition-colors"
                    title={t('queue.regenerateSummary')}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            ) : summaryError ? (
              <div className="p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                <p className="text-xs text-destructive">{summaryError}</p>
              </div>
            ) : null}
          </div>
        )}

        {/* Time Range Inline Panel */}
        {showTimeRange && isPending && (
          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <Scissors className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <input
              type="text"
              placeholder={timePlaceholder}
              value={timeStart}
              onChange={handleTimeStartChange}
              maxLength={8}
              className={cn(
                'w-[5.5rem] text-xs px-2 py-1 rounded bg-background border border-border/50 text-center font-mono',
                'focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50',
                'placeholder:text-muted-foreground/40',
                timeStart &&
                  (!isStartValid || !isRangeValid) &&
                  'border-red-500/60 focus:ring-red-500/50 focus:border-red-500/50',
              )}
            />
            <span className="text-xs text-muted-foreground">-</span>
            <input
              type="text"
              placeholder={timePlaceholder}
              value={timeEnd}
              onChange={handleTimeEndChange}
              maxLength={8}
              className={cn(
                'w-[5.5rem] text-xs px-2 py-1 rounded bg-background border border-border/50 text-center font-mono',
                'focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50',
                'placeholder:text-muted-foreground/40',
                timeEnd &&
                  (!isEndValid || !isRangeValid) &&
                  'border-red-500/60 focus:ring-red-500/50 focus:border-red-500/50',
              )}
            />
            {durationSeconds > 0 && (
              <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
                {t('queue.timeRange.duration', { duration: item.duration })}
              </span>
            )}
            <button
              type="button"
              onClick={handleApplyTimeRange}
              disabled={!canApply}
              className="text-[11px] px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t('queue.timeRange.apply')}
            </button>
            {hasTimeRange && (
              <button
                type="button"
                onClick={handleClearTimeRange}
                className="text-[11px] px-2 py-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 font-medium transition-colors"
              >
                {t('queue.timeRange.clear')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Remove Button */}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={disabled}
        title={t('queue.remove')}
        className={cn(
          'absolute top-2 right-2 p-1.5 rounded-full transition-all',
          'bg-black/50 hover:bg-black/70 text-white/70 hover:text-white',
          'opacity-0 group-hover:opacity-100',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
