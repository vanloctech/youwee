import { useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TimelineSelection {
  start: number;
  end: number;
}

interface VideoTimelineProps {
  duration: number;
  currentTime: number;
  selection: TimelineSelection | null;
  onSeek: (time: number) => void;
  onSelectionChange: (selection: TimelineSelection | null) => void;
  className?: string;
}

export function VideoTimeline({
  duration,
  currentTime,
  selection,
  onSeek,
  onSelectionChange,
  className,
}: VideoTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const getTimeFromX = useCallback(
    (clientX: number): number => {
      if (!trackRef.current || duration <= 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const progress = Math.max(0, Math.min(1, x / rect.width));
      return progress * duration;
    },
    [duration],
  );

  const handleTrackClick = (e: React.MouseEvent) => {
    const time = getTimeFromX(e.clientX);
    onSeek(time);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const time = getTimeFromX(e.clientX);
    if (!selection) {
      const selDuration = Math.min(5, duration - time);
      onSelectionChange({ start: time, end: time + selDuration });
    } else {
      onSelectionChange(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (duration <= 0) return;
    const step = 5;
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        onSeek(Math.max(0, currentTime - step));
        break;
      case 'ArrowRight':
        event.preventDefault();
        onSeek(Math.min(duration, currentTime + step));
        break;
      case 'Home':
        event.preventDefault();
        onSeek(0);
        break;
      case 'End':
        event.preventDefault();
        onSeek(duration);
        break;
      default:
        break;
    }
  };

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const selectionStartPercent = selection && duration > 0 ? (selection.start / duration) * 100 : 0;
  const selectionWidthPercent =
    selection && duration > 0 ? ((selection.end - selection.start) / duration) * 100 : 0;

  return (
    <div
      ref={trackRef}
      className={cn(
        'relative h-12 rounded-lg cursor-pointer select-none group',
        'bg-gradient-to-b from-muted/50 to-muted/30',
        'border border-white/10',
        className,
      )}
      onClick={handleTrackClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      role="slider"
      tabIndex={0}
      aria-label="Timeline"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, duration)}
      aria-valuenow={Math.max(0, Math.min(duration, currentTime))}
    >
      {/* Progress background */}
      <div className="absolute inset-0 rounded-lg overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/20 to-primary/10"
          style={{ width: `${playheadPercent}%` }}
        />
      </div>

      {/* Selection range */}
      {selection && (
        <div
          className="absolute inset-y-0 bg-primary/30 border-x-2 border-primary/60"
          style={{
            left: `${selectionStartPercent}%`,
            width: `${selectionWidthPercent}%`,
          }}
        >
          {/* Selection handles */}
          <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-8 bg-primary rounded cursor-ew-resize hover:bg-primary/80 transition-colors" />
          <div className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-8 bg-primary rounded cursor-ew-resize hover:bg-primary/80 transition-colors" />
        </div>
      )}

      {/* Time markers */}
      <div className="absolute bottom-1 left-0 right-0 flex justify-between px-2 text-[10px] text-muted-foreground/60 pointer-events-none">
        <span>0:00</span>
        <span>{formatTimeShort(duration / 4)}</span>
        <span>{formatTimeShort(duration / 2)}</span>
        <span>{formatTimeShort((duration * 3) / 4)}</span>
        <span>{formatTimeShort(duration)}</span>
      </div>

      {/* Playhead */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)] pointer-events-none z-10"
        style={{ left: `${playheadPercent}%` }}
      >
        {/* Playhead handle */}
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
      </div>

      {/* Hover effect */}
      <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity bg-white/5" />
    </div>
  );
}

function formatTimeShort(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
