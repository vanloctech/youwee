import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  ListVideo,
  Loader2,
  MonitorPlay,
  Play,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import { useAI } from '@/contexts/AIContext';
import type { DownloadItem, ItemDownloadSettings } from '@/lib/types';
import { cn } from '@/lib/utils';

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
  showPlaylistBadge?: boolean;
  disabled?: boolean;
  onRemove: (id: string) => void;
}

export function QueueItem({ item, showPlaylistBadge, disabled, onRemove }: QueueItemProps) {
  const ai = useAI();
  const [showFullSummary, setShowFullSummary] = useState(false);

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

  return (
    <div
      className={cn(
        'group relative flex gap-3 p-2 rounded-xl transition-all duration-200',
        'bg-card/50 hover:bg-card/80',
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
              </div>
              <div className="flex items-center justify-between text-[10px] text-white/90 font-medium">
                <span>{item.progress.toFixed(0)}%</span>
                {item.speed && <span>{item.speed}</span>}
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
            <span>Playlist</span>
          </div>
        )}

        {/* Playlist Progress */}
        {item.playlistIndex && item.playlistTotal && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-medium tabular-nums">
            {item.playlistIndex}/{item.playlistTotal}
          </div>
        )}

        {/* Duration/ETA Badge */}
        {isActive && item.eta && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-primary text-primary-foreground text-[10px] font-medium">
            {item.eta}
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

        {/* Status Row */}
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
              {isPending && 'Pending'}
              {isActive && (item.status === 'fetching' ? 'Fetching' : 'Downloading')}
              {isCompleted && 'Completed'}
              {isError && 'Failed'}
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

          {/* AI Summarize Button - Only show when AI enabled and not in error/active state */}
          {aiEnabled && !isActive && !isError && !summary && !isGenerating && !summaryError && (
            <button
              type="button"
              onClick={handleGenerateSummary}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 transition-colors font-medium"
            >
              <Sparkles className="w-3 h-3" />
              Summarize
            </button>
          )}

          {/* Generating Status */}
          {isGenerating && (
            <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium">
              <Loader2 className="w-3 h-3 animate-spin" />
              {generatingStatus === 'fetching' ? 'Fetching transcript...' : 'Generating...'}
            </span>
          )}
        </div>

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
                            Show less <ChevronUp className="w-3 h-3" />
                          </>
                        ) : (
                          <>
                            Show more <ChevronDown className="w-3 h-3" />
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
                    title="Regenerate summary"
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
      </div>

      {/* Remove Button */}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={disabled}
        title="Remove from queue"
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
