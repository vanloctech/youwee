import {
  ChevronDown,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type PlayMode, usePlayer } from '@/contexts/PlayerContext';
import { cn } from '@/lib/utils';

function formatTime(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5, 2];
const MINI_PLAYER_SIZE = 56;
const MINI_PLAYER_MARGIN = 24;
const MINI_PLAYER_DRAG_THRESHOLD = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function MusicPlayer() {
  const { t } = useTranslation('pages');
  const {
    currentEntry,
    isPlaying,
    duration,
    currentTime,
    volume,
    playbackRate,
    mode,
    queue,
    togglePlay,
    playNext,
    playPrev,
    seek,
    setVolume,
    setPlaybackRate,
    setMode,
    close,
  } = usePlayer();

  const [thumbError, setThumbError] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState(0);
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMiniPlayerDragging, setIsMiniPlayerDragging] = useState(false);
  const [miniPlayerBottom, setMiniPlayerBottom] = useState(MINI_PLAYER_MARGIN);
  const miniPlayerDragRef = useRef({
    active: false,
    dragged: false,
    startBottom: MINI_PLAYER_MARGIN,
    startY: 0,
  });

  // Reset thumbnail error whenever the current track changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we intentionally depend on the current entry id
  useEffect(() => {
    setThumbError(false);
  }, [currentEntry?.id]);

  const cycleMode = useCallback(() => {
    const modes: PlayMode[] = ['sequence', 'repeat-one', 'shuffle'];
    const next = modes[(modes.indexOf(mode) + 1) % modes.length];
    setMode(next);
  }, [mode, setMode]);

  const cyclePlaybackRate = useCallback(() => {
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length] ?? 1;
    setPlaybackRate(nextRate);
  }, [playbackRate, setPlaybackRate]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const rect = progressRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || duration <= 0) return currentTime;

      const percent = clamp((clientX - rect.left) / rect.width, 0, 1);
      const nextTime = percent * duration;
      setSeekPreviewTime(nextTime);
      seek(nextTime);
      return nextTime;
    },
    [currentTime, duration, seek],
  );

  const handleProgressPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (duration <= 0) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsSeeking(true);
      seekFromClientX(event.clientX);
    },
    [duration, seekFromClientX],
  );

  const handleProgressPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isSeeking) return;

      event.preventDefault();
      seekFromClientX(event.clientX);
    },
    [isSeeking, seekFromClientX],
  );

  const handleProgressPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isSeeking) return;

      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      seekFromClientX(event.clientX);
      setIsSeeking(false);
    },
    [isSeeking, seekFromClientX],
  );

  const handleProgressKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (duration <= 0) return;

      const smallStep = 5;
      const largeStep = 30;
      let nextTime: number | null = null;

      if (event.key === 'ArrowLeft') nextTime = currentTime - smallStep;
      if (event.key === 'ArrowRight') nextTime = currentTime + smallStep;
      if (event.key === 'PageDown') nextTime = currentTime - largeStep;
      if (event.key === 'PageUp') nextTime = currentTime + largeStep;
      if (event.key === 'Home') nextTime = 0;
      if (event.key === 'End') nextTime = duration;

      if (nextTime === null) return;

      event.preventDefault();
      seek(clamp(nextTime, 0, duration));
    },
    [currentTime, duration, seek],
  );

  const setVolumeFromClientX = useCallback(
    (clientX: number) => {
      const rect = volumeRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return volume;

      const nextVolume = clamp((clientX - rect.left) / rect.width, 0, 1);
      setVolume(nextVolume);
      return nextVolume;
    },
    [setVolume, volume],
  );

  const handleVolumePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsVolumeDragging(true);
      setVolumeFromClientX(event.clientX);
    },
    [setVolumeFromClientX],
  );

  const handleVolumePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isVolumeDragging) return;

      event.preventDefault();
      setVolumeFromClientX(event.clientX);
    },
    [isVolumeDragging, setVolumeFromClientX],
  );

  const handleVolumePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isVolumeDragging) return;

      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setVolumeFromClientX(event.clientX);
      setIsVolumeDragging(false);
    },
    [isVolumeDragging, setVolumeFromClientX],
  );

  const handleVolumeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const smallStep = 0.05;
      const largeStep = 0.1;
      let nextVolume: number | null = null;

      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        nextVolume = volume - smallStep;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        nextVolume = volume + smallStep;
      }
      if (event.key === 'PageDown') nextVolume = volume - largeStep;
      if (event.key === 'PageUp') nextVolume = volume + largeStep;
      if (event.key === 'Home') nextVolume = 0;
      if (event.key === 'End') nextVolume = 1;

      if (nextVolume === null) return;

      event.preventDefault();
      setVolume(clamp(nextVolume, 0, 1));
    },
    [setVolume, volume],
  );

  const clampMiniPlayerBottom = useCallback((bottom: number) => {
    if (typeof window === 'undefined') return bottom;
    const maxBottom = Math.max(MINI_PLAYER_MARGIN, window.innerHeight - MINI_PLAYER_SIZE - 16);
    return clamp(bottom, 16, maxBottom);
  }, []);

  const handleMiniPlayerPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      miniPlayerDragRef.current = {
        active: true,
        dragged: false,
        startBottom: miniPlayerBottom,
        startY: event.clientY,
      };
      setIsMiniPlayerDragging(true);
    },
    [miniPlayerBottom],
  );

  const handleMiniPlayerPointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = miniPlayerDragRef.current;
      if (!drag.active) return;

      const deltaY = drag.startY - event.clientY;
      if (Math.abs(deltaY) > MINI_PLAYER_DRAG_THRESHOLD) {
        drag.dragged = true;
      }
      if (!drag.dragged) return;

      event.preventDefault();
      setMiniPlayerBottom(clampMiniPlayerBottom(drag.startBottom + deltaY));
    },
    [clampMiniPlayerBottom],
  );

  const handleMiniPlayerPointerEnd = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = miniPlayerDragRef.current;
    if (!drag.active) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drag.active = false;
    setIsMiniPlayerDragging(false);
  }, []);

  const handleMiniPlayerClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (miniPlayerDragRef.current.dragged) {
      event.preventDefault();
      event.stopPropagation();
      miniPlayerDragRef.current.dragged = false;
      return;
    }

    setIsCollapsed(false);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setMiniPlayerBottom((bottom) => clampMiniPlayerBottom(bottom));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampMiniPlayerBottom]);

  if (!currentEntry) return null;

  const displayTime = isSeeking ? seekPreviewTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const volumeProgress = volume * 100;
  const queueLabel =
    queue.length > 1 ? t('player.trackCount', { count: queue.length }) : t('player.oneTrack');

  return (
    <>
      {/* Expanded Player */}
      <div
        className={cn(
          'absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-fit px-4 pointer-events-none transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
          isCollapsed
            ? 'opacity-0 translate-y-4 scale-95 pointer-events-none'
            : 'opacity-100 translate-y-0 scale-100',
        )}
      >
        <div
          className={cn(
            'pointer-events-auto flex items-center gap-1.5 sm:gap-2.5 rounded-full p-2 ring-1 ring-white/10 transition-all',
            'bg-background/85 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60',
            'border border-border/50 shadow-[0_16px_40px_rgb(0,0,0,0.15)] dark:shadow-[0_16px_40px_rgb(0,0,0,0.4)]',
          )}
        >
          {/* Track Info */}
          <div className="flex items-center gap-3 pl-1 sm:pl-2 pr-1">
            <div className="relative h-10 w-10 sm:h-11 sm:w-11 flex-shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-black/10 dark:ring-white/20 shadow-sm">
              {currentEntry.thumbnail && !thumbError ? (
                <img
                  src={currentEntry.thumbnail.replace(/^http:\/\//, 'https://')}
                  alt=""
                  className="h-full w-full object-cover transition-all duration-700"
                  style={isPlaying ? { animation: 'spin 30s linear infinite' } : undefined}
                  referrerPolicy="no-referrer"
                  onError={() => setThumbError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary/10">
                  <Volume2 className="h-4 w-4 text-primary/60" />
                </div>
              )}
              {/* Vinyl Center Hole */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="h-3 w-3 rounded-full bg-background shadow-sm border border-border/50 backdrop-blur-sm" />
              </div>
            </div>

            <div className="hidden sm:flex flex-col min-w-[100px] max-w-[150px] md:max-w-[180px]">
              <p
                className="truncate text-sm font-bold leading-tight text-foreground"
                title={currentEntry.title}
              >
                {currentEntry.title}
              </p>
              <p className="truncate text-[11px] font-medium text-muted-foreground mt-0.5">
                {queueLabel}
              </p>
            </div>
          </div>

          <div className="hidden sm:block w-px h-6 bg-border/60 mx-1" />

          {/* Controls */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            <button
              type="button"
              onClick={playPrev}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-foreground hover:bg-foreground/5 active:scale-95"
              title={t('player.prev')}
            >
              <SkipBack className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className={cn(
                'inline-flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300',
                isPlaying
                  ? 'bg-primary/15 text-primary hover:bg-primary/25'
                  : 'bg-primary text-primary-foreground shadow-md hover:scale-105 active:scale-95 hover:shadow-lg hover:shadow-primary/20',
              )}
              title={isPlaying ? t('player.pause') : t('player.play')}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 translate-x-px fill-current" />
              )}
            </button>

            <button
              type="button"
              onClick={playNext}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-foreground hover:bg-foreground/5 active:scale-95"
              title={t('player.next')}
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          <div className="hidden md:block w-px h-6 bg-border/60 mx-1" />

          {/* Progress Bar */}
          <div className="hidden md:flex items-center gap-3 w-[200px] lg:w-[280px]">
            <span className="w-8 flex-shrink-0 text-right text-[11px] font-medium tabular-nums text-muted-foreground">
              {formatTime(displayTime)}
            </span>
            <div
              ref={progressRef}
              className="group relative h-6 flex-1 cursor-pointer touch-none select-none flex items-center"
              onPointerDown={handleProgressPointerDown}
              onPointerMove={handleProgressPointerMove}
              onPointerUp={handleProgressPointerEnd}
              onPointerCancel={handleProgressPointerEnd}
              onKeyDown={handleProgressKeyDown}
              role="slider"
              tabIndex={0}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration || 0)}
              aria-valuenow={Math.round(displayTime)}
              aria-valuetext={`${formatTime(displayTime)} / ${formatTime(duration)}`}
            >
              <div className="absolute left-0 right-0 h-1.5 rounded-full bg-muted/80 ring-1 ring-white/[0.05] overflow-hidden">
                <div
                  className={cn(
                    'h-full bg-primary',
                    !isSeeking && 'transition-[width] duration-150',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div
                className={cn(
                  'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/40 bg-background shadow-sm transition-transform',
                  isSeeking
                    ? 'scale-125 border-primary shadow-md'
                    : 'scale-0 opacity-0 group-hover:opacity-100 group-hover:scale-125',
                )}
                style={{ left: `${progress}%` }}
              />
            </div>
            <span className="w-8 flex-shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {formatTime(duration)}
            </span>
          </div>

          <div className="hidden sm:block w-px h-6 bg-border/60 mx-1" />

          {/* Right Controls */}
          <div className="flex items-center gap-1 pr-1">
            <button
              type="button"
              onClick={cycleMode}
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full transition-all hover:bg-foreground/5',
                mode === 'sequence'
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-primary bg-primary/5',
              )}
              title={
                mode === 'sequence'
                  ? t('player.modeSequence')
                  : mode === 'repeat-one'
                    ? t('player.modeRepeatOne')
                    : t('player.modeShuffle')
              }
            >
              {mode === 'shuffle' ? (
                <Shuffle className="h-4 w-4" />
              ) : mode === 'repeat-one' ? (
                <Repeat1 className="h-4 w-4" />
              ) : (
                <Repeat className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={cyclePlaybackRate}
              className={cn(
                'hidden sm:inline-flex min-w-[36px] h-9 items-center justify-center rounded-full text-[11px] font-bold tabular-nums transition-all hover:bg-foreground/5',
                playbackRate !== 1
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              title={t('player.playbackSpeed', { rate: playbackRate })}
            >
              {playbackRate}x
            </button>

            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-1 sm:gap-2 pl-1 pr-1 sm:pr-2 group/vol">
              <button
                type="button"
                onClick={() => setVolume(volume > 0 ? 0 : 1)}
                className="flex-shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/5"
              >
                {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <div
                ref={volumeRef}
                className="relative h-6 w-12 sm:w-16 cursor-pointer touch-none select-none flex items-center opacity-70 group-hover/vol:opacity-100 transition-opacity"
                onPointerDown={handleVolumePointerDown}
                onPointerMove={handleVolumePointerMove}
                onPointerUp={handleVolumePointerEnd}
                onPointerCancel={handleVolumePointerEnd}
                onKeyDown={handleVolumeKeyDown}
                role="slider"
                tabIndex={0}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(volumeProgress)}
                aria-valuetext={`${Math.round(volumeProgress)}%`}
              >
                <div className="absolute left-0 right-0 h-1.5 rounded-full bg-muted/80 overflow-hidden">
                  <div
                    className={cn('h-full bg-primary', !isVolumeDragging && 'transition-[width]')}
                    style={{ width: `${volumeProgress}%` }}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-foreground hover:bg-foreground/5 ml-1"
              title={t('player.minimize')}
            >
              <ChevronDown className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-all hover:text-destructive hover:bg-destructive/10"
              title={t('player.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Collapsed Player (Mini) */}
      <div
        className={cn(
          'absolute right-4 sm:right-6 z-50',
          !isMiniPlayerDragging &&
            'transition-all duration-500 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]',
          isCollapsed
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-8 scale-95 pointer-events-none',
        )}
        style={{ bottom: miniPlayerBottom }}
      >
        <button
          type="button"
          onClick={handleMiniPlayerClick}
          onPointerDown={handleMiniPlayerPointerDown}
          onPointerMove={handleMiniPlayerPointerMove}
          onPointerUp={handleMiniPlayerPointerEnd}
          onPointerCancel={handleMiniPlayerPointerEnd}
          className="group relative flex h-14 w-14 touch-none select-none items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.2)] transition-transform hover:scale-105 active:scale-95 dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)]"
          title={currentEntry.title}
        >
          {currentEntry.thumbnail && !thumbError ? (
            <img
              src={currentEntry.thumbnail.replace(/^http:\/\//, 'https://')}
              alt=""
              className="h-full w-full object-cover transition-all duration-700"
              style={isPlaying ? { animation: 'spin 30s linear infinite' } : undefined}
              referrerPolicy="no-referrer"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 backdrop-blur-xl">
              <Volume2 className="h-5 w-5 text-primary/60" />
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-4 w-4 rounded-full bg-background shadow-sm border border-border/50 backdrop-blur-sm" />
          </div>

          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
            <Maximize2 className="h-5 w-5 text-white" />
          </div>

          {!isPlaying && (
            <div className="absolute bottom-0 right-0 bg-background/90 rounded-full p-0.5 shadow-sm ring-1 ring-white/10">
              <Pause className="h-3 w-3 text-muted-foreground" />
            </div>
          )}
        </button>
      </div>
    </>
  );
}
