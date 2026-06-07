import {
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
  const progressRef = useRef<HTMLDivElement | null>(null);

  // Reset thumbnail error whenever the current track changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we intentionally depend on the current entry id
  useEffect(() => {
    setThumbError(false);
  }, [currentEntry?.id]);

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    [setVolume],
  );

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

  if (!currentEntry) return null;

  const displayTime = isSeeking ? seekPreviewTime : currentTime;
  const progress = duration > 0 ? (displayTime / duration) * 100 : 0;
  const queueLabel =
    queue.length > 1 ? t('player.trackCount', { count: queue.length }) : t('player.oneTrack');

  return (
    <div className="flex-shrink-0 px-3 pb-3 bg-background/20 backdrop-blur-xl">
      <div
        className={cn(
          'relative overflow-hidden rounded-[1.4rem] border border-white/[0.1]',
          'bg-background/78 shadow-[0_16px_40px_rgba(0,0,0,0.12)] backdrop-blur-2xl',
          'dark:border-white/[0.07] dark:shadow-[0_22px_50px_rgba(0,0,0,0.3)]',
        )}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.14),_transparent_32%),radial-gradient(circle_at_bottom_right,_hsl(var(--gradient-via)/0.16),_transparent_34%)]" />

        <div className="relative flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4 sm:py-3.5">
          {/* Track info */}
          <div className="flex min-w-0 items-center gap-3 sm:w-64 sm:flex-shrink-0">
            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-white/10">
              {currentEntry.thumbnail && !thumbError ? (
                <img
                  src={currentEntry.thumbnail.replace(/^http:\/\//, 'https://')}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setThumbError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary/10">
                  <Volume2 className="h-4 w-4 text-primary/60" />
                </div>
              )}
              {isPlaying && (
                <span className="absolute bottom-1 right-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.8)] animate-pulse" />
              )}
            </div>

            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold leading-tight"
                title={currentEntry.title}
              >
                {currentEntry.title}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {currentEntry.format && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
                    {currentEntry.format}
                  </span>
                )}
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {queueLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Center: controls + progress */}
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={playPrev}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                title={t('player.prev')}
              >
                <SkipBack className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className={cn(
                  'inline-flex h-10 w-10 items-center justify-center rounded-xl transition-all',
                  'bg-primary text-primary-foreground shadow-[0_10px_24px_hsl(var(--primary)/0.34)] hover:scale-[1.03] hover:opacity-95',
                )}
                title={isPlaying ? t('player.pause') : t('player.play')}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 translate-x-px fill-current" />
                )}
              </button>

              <button
                type="button"
                onClick={playNext}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                title={t('player.next')}
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>

            <div className="flex w-full items-center gap-2.5 sm:max-w-xl sm:self-center lg:max-w-2xl">
              <span className="w-9 flex-shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                {formatTime(displayTime)}
              </span>
              <div
                ref={progressRef}
                className="group relative h-5 flex-1 cursor-pointer touch-none select-none"
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
                <div className="absolute top-1/2 h-2 w-full -translate-y-1/2 rounded-full bg-muted/80 ring-1 ring-white/[0.05]" />
                <div
                  className={cn(
                    'absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-primary',
                    !isSeeking && 'transition-[width]',
                  )}
                  style={{ width: `${progress}%` }}
                />
                <div
                  className={cn(
                    'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/40 bg-background shadow-[0_2px_10px_rgba(0,0,0,0.18)] transition-transform group-hover:scale-110',
                    isSeeking && 'scale-110 border-primary/70',
                  )}
                  style={{ left: `${progress}%` }}
                />
              </div>
              <span className="w-9 flex-shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Right: mode + speed + volume */}
          <div className="flex items-center justify-between gap-2 sm:flex-shrink-0 sm:justify-end">
            <div className="flex items-center gap-1.5 rounded-2xl bg-background/60 px-2 py-1.5 ring-1 ring-white/[0.06]">
              <button
                type="button"
                onClick={cycleMode}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                  mode === 'sequence'
                    ? 'text-muted-foreground hover:text-foreground'
                    : 'text-primary',
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
                  <Shuffle className="h-3.5 w-3.5" />
                ) : mode === 'repeat-one' ? (
                  <Repeat1 className="h-3.5 w-3.5" />
                ) : (
                  <Repeat className="h-3.5 w-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={cyclePlaybackRate}
                className={cn(
                  'min-w-11 rounded-md border border-dashed px-2 py-1 text-[10px] font-medium tabular-nums transition-colors',
                  'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  playbackRate !== 1 && 'border-primary/45 bg-primary/10 text-primary',
                )}
                title={t('player.playbackSpeed', { rate: playbackRate })}
              >
                {playbackRate}x
              </button>

              <div className="flex items-center gap-1.5 rounded-xl bg-muted/50 px-2 py-1">
                <button
                  type="button"
                  onClick={() => setVolume(volume > 0 ? 0 : 1)}
                  className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {volume === 0 ? (
                    <VolumeX className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <div className="group relative h-1.5 w-16">
                  <div className="absolute inset-y-0 w-full rounded-full bg-background/90" />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    style={{ width: `${volume * 100}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={volume}
                    onChange={handleVolume}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={close}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                title={t('player.close')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
