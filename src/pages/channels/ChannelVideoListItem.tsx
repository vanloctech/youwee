import { Check, CheckCircle2, Clock, Loader2, Play, Tv, XCircle } from 'lucide-react';
import {
  ThumbnailCompletedBadge,
  ThumbnailFailedBadge,
} from '@/components/download/ThumbnailStatusBadge';
import type { VideoDownloadState } from '@/contexts/channels/useChannelsController';
import type { PlaylistVideoEntry } from '@/lib/types';
import { cn } from '@/lib/utils';

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

type ChannelVideoListItemProps = {
  video: PlaylistVideoEntry;
  isSelected: boolean;
  videoState?: VideoDownloadState;
  onToggle: () => void;
};

export function ChannelVideoListItem({
  video,
  isSelected,
  videoState,
  onToggle,
}: ChannelVideoListItemProps) {
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

      <div className="relative flex-shrink-0 w-28 h-[72px] sm:w-36 sm:h-20 rounded-lg overflow-hidden bg-muted">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            className={cn(
              'w-full h-full object-cover transition-all duration-300',
              isCompleted && 'brightness-90 saturate-95',
            )}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <Tv className="w-8 h-8 text-muted-foreground/30" />
          </div>
        )}

        {video.duration && !isActive && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white font-medium tabular-nums">
            {formatDuration(video.duration)}
          </span>
        )}

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

        {isCompleted && <ThumbnailCompletedBadge />}
        {isError && <ThumbnailFailedBadge />}
      </div>

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

          {video.upload_date && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatUploadDate(video.upload_date)}
            </span>
          )}

          {video.duration && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Play className="w-3 h-3" />
              {formatDuration(video.duration)}
            </span>
          )}

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
