import { Loader2, Waves, Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { cn } from '@/lib/utils';

interface DragState {
  entryId: string;
  mode: 'move' | 'start' | 'end';
  startX: number;
  initialStartMs: number;
  initialEndMs: number;
}

interface SpectrogramFrame {
  values: number[];
}

const MIN_ENTRY_DURATION_MS = 120;

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function formatTimelineTick(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

async function decodeAudioDataFromPath(path: string) {
  const src = (await import('@tauri-apps/api/core')).convertFileSrc(path);
  const response = await fetch(src);
  const arrayBuffer = await response.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    const channelCount = buffer.numberOfChannels;
    const length = buffer.length;
    const merged = new Float32Array(length);

    for (let channel = 0; channel < channelCount; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        merged[i] += data[i] / channelCount;
      }
    }
    return {
      sampleRate: buffer.sampleRate,
      data: merged,
    };
  } finally {
    await audioContext.close();
  }
}

function buildPeaks(samples: Float32Array, width: number): number[] {
  const peaks = new Array(width).fill(0);
  const step = Math.max(1, Math.floor(samples.length / width));
  for (let x = 0; x < width; x++) {
    const start = x * step;
    const end = Math.min(samples.length, start + step);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const amp = Math.abs(samples[i]);
      if (amp > peak) peak = amp;
    }
    peaks[x] = peak;
  }
  return peaks;
}

function buildSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  frameCount = 240,
  bandCount = 28,
): SpectrogramFrame[] {
  const frames: SpectrogramFrame[] = [];
  const fftSize = 96;
  const hop = Math.max(1, Math.floor(samples.length / frameCount));

  for (let frame = 0; frame < frameCount; frame++) {
    const offset = frame * hop;
    const values: number[] = [];

    for (let band = 0; band < bandCount; band++) {
      const freq = 80 + ((sampleRate / 2 - 80) * band) / bandCount;
      let real = 0;
      let imag = 0;
      for (let n = 0; n < fftSize; n++) {
        const idx = offset + n;
        if (idx >= samples.length) break;
        const sample = samples[idx];
        const phase = (2 * Math.PI * freq * n) / sampleRate;
        real += sample * Math.cos(phase);
        imag -= sample * Math.sin(phase);
      }
      const magnitude = Math.sqrt(real * real + imag * imag);
      values.push(magnitude);
    }

    const max = Math.max(...values, 1);
    frames.push({
      values: values.map((value) => Math.min(1, value / max)),
    });
  }

  return frames;
}

export function SubtitleWaveformTimeline() {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(720);
  const [viewMode, setViewMode] = useState<'waveform' | 'spectrogram'>('waveform');
  const [zoom, setZoom] = useState(1.5);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [spectrogram, setSpectrogram] = useState<SpectrogramFrame[] | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [previewRange, setPreviewRange] = useState<Record<string, { start: number; end: number }>>(
    {},
  );
  const previewRangeRef = useRef<Record<string, { start: number; end: number }>>({});

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setCanvasWidth(el.clientWidth);
    });
    observer.observe(el);
    setCanvasWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const path = subtitle.videoPath;
    if (!path) {
      setPeaks(null);
      setSpectrogram(null);
      setDecodeError(null);
      return;
    }

    const load = async () => {
      try {
        setIsDecoding(true);
        setDecodeError(null);
        const decoded = await decodeAudioDataFromPath(path);
        if (cancelled) return;
        setPeaks(buildPeaks(decoded.data, 1600));
        setSpectrogram(buildSpectrogram(decoded.data, decoded.sampleRate));
      } catch (err) {
        if (cancelled) return;
        setDecodeError(String(err));
        setPeaks(null);
        setSpectrogram(null);
      } finally {
        if (!cancelled) {
          setIsDecoding(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [subtitle.videoPath]);

  const durationMs = Math.max(0, subtitle.videoDurationMs);
  const timelineWidth = useMemo(() => {
    if (durationMs <= 0) return canvasWidth;
    const sec = durationMs / 1000;
    const pxPerSec = 70 * zoom;
    return Math.max(canvasWidth, Math.round(sec * pxPerSec));
  }, [canvasWidth, durationMs, zoom]);

  const msPerPx = durationMs > 0 ? durationMs / timelineWidth : 0;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const height = 100;
    canvas.width = Math.round(timelineWidth * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${timelineWidth}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, timelineWidth, height);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(148,163,184,0.18)');
    gradient.addColorStop(1, 'rgba(148,163,184,0.04)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, timelineWidth, height);

    if (viewMode === 'waveform' && peaks) {
      const step = peaks.length / timelineWidth;
      ctx.fillStyle = 'rgba(14,165,233,0.65)';
      for (let x = 0; x < timelineWidth; x++) {
        const idx = Math.floor(x * step);
        const value = peaks[idx] ?? 0;
        const bar = Math.max(1, value * (height - 18));
        const y = Math.round((height - bar) / 2);
        ctx.fillRect(x, y, 1, bar);
      }
    } else if (viewMode === 'spectrogram' && spectrogram) {
      const frames = spectrogram.length;
      const bands = spectrogram[0]?.values.length ?? 0;
      if (frames > 0 && bands > 0) {
        const frameWidth = timelineWidth / frames;
        const bandHeight = height / bands;

        for (let frame = 0; frame < frames; frame++) {
          for (let band = 0; band < bands; band++) {
            const energy = spectrogram[frame].values[band];
            const hue = 200 - band * 2.5;
            const alpha = clamp(energy * 1.2, 0.08, 0.95);
            ctx.fillStyle = `hsla(${hue}, 90%, 58%, ${alpha})`;
            ctx.fillRect(
              frame * frameWidth,
              height - (band + 1) * bandHeight,
              frameWidth + 1,
              bandHeight + 1,
            );
          }
        }
      }
    }

    if (durationMs > 0) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
      ctx.lineWidth = 1;
      const tickMs = durationMs > 20 * 60_000 ? 30_000 : durationMs > 10 * 60_000 ? 15_000 : 10_000;
      for (let ms = 0; ms <= durationMs; ms += tickMs) {
        const x = (ms / durationMs) * timelineWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
    }
  }, [timelineWidth, viewMode, peaks, spectrogram, durationMs]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const timeToPercent = useCallback(
    (ms: number) => {
      if (durationMs <= 0) return 0;
      return (ms / durationMs) * 100;
    },
    [durationMs],
  );

  const pxToTime = useCallback(
    (x: number) => {
      if (durationMs <= 0) return 0;
      return clamp(Math.round(x * msPerPx), 0, durationMs);
    },
    [durationMs, msPerPx],
  );

  const startDrag = useCallback(
    (
      event: React.MouseEvent,
      entryId: string,
      mode: 'move' | 'start' | 'end',
      startMs: number,
      endMs: number,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      setDragState({
        entryId,
        mode,
        startX: event.clientX,
        initialStartMs: startMs,
        initialEndMs: endMs,
      });
    },
    [],
  );

  useEffect(() => {
    if (!dragState) return;

    const onMove = (event: MouseEvent) => {
      const deltaPx = event.clientX - dragState.startX;
      const deltaMs = Math.round(deltaPx * msPerPx);
      const initialDuration = dragState.initialEndMs - dragState.initialStartMs;
      let nextStart = dragState.initialStartMs;
      let nextEnd = dragState.initialEndMs;

      if (dragState.mode === 'move') {
        nextStart = clamp(dragState.initialStartMs + deltaMs, 0, durationMs - initialDuration);
        nextEnd = nextStart + initialDuration;
      } else if (dragState.mode === 'start') {
        nextStart = clamp(
          dragState.initialStartMs + deltaMs,
          0,
          dragState.initialEndMs - MIN_ENTRY_DURATION_MS,
        );
      } else if (dragState.mode === 'end') {
        nextEnd = clamp(
          dragState.initialEndMs + deltaMs,
          dragState.initialStartMs + MIN_ENTRY_DURATION_MS,
          durationMs,
        );
      }

      const nextPreview = { [dragState.entryId]: { start: nextStart, end: nextEnd } };
      previewRangeRef.current = nextPreview;
      setPreviewRange(nextPreview);
    };

    const onUp = () => {
      const preview = previewRangeRef.current[dragState.entryId];
      if (
        preview &&
        (preview.start !== dragState.initialStartMs || preview.end !== dragState.initialEndMs)
      ) {
        subtitle.updateEntry(dragState.entryId, {
          startTime: preview.start,
          endTime: preview.end,
        });
      }
      setDragState(null);
      setPreviewRange({});
      previewRangeRef.current = {};
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragState, durationMs, msPerPx, subtitle]);

  const onTimelineClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + (scrollRef.current?.scrollLeft || 0);
    const seekMs = pxToTime(x);
    subtitle.setVideoCurrentTime(seekMs);
  };

  const tickMarks = useMemo(() => {
    if (durationMs <= 0) return [];
    const step = durationMs > 30 * 60_000 ? 60_000 : durationMs > 10 * 60_000 ? 30_000 : 15_000;
    const marks: number[] = [];
    for (let ms = 0; ms <= durationMs; ms += step) {
      marks.push(ms);
    }
    return marks;
  }, [durationMs]);

  const getRange = useCallback(
    (entryId: string, startTime: number, endTime: number) => {
      return previewRange[entryId] || { start: startTime, end: endTime };
    },
    [previewRange],
  );

  if (!subtitle.videoPath) {
    return (
      <div className="px-3 py-3 border-b border-border/50 text-xs text-muted-foreground">
        {t('waveform.needVideo')}
      </div>
    );
  }

  return (
    <div className="border-b border-border/50 bg-background/40">
      <div className="flex items-center justify-between gap-3 px-3 py-2 flex-wrap">
        <div className="ml-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('waveform')}
            className={cn(
              'h-7 px-2 rounded-md text-[11px] border transition-colors inline-flex items-center gap-1.5',
              viewMode === 'waveform'
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/70 text-muted-foreground hover:text-foreground',
            )}
          >
            <Waves className="w-3.5 h-3.5" />
            {t('waveform.waveform')}
          </button>
          <button
            type="button"
            onClick={() => setViewMode('spectrogram')}
            className={cn(
              'h-7 px-2 rounded-md text-[11px] border transition-colors inline-flex items-center gap-1.5',
              viewMode === 'spectrogram'
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/70 text-muted-foreground hover:text-foreground',
            )}
          >
            <Workflow className="w-3.5 h-3.5" />
            {t('waveform.spectrogram')}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{t('waveform.zoom')}</span>
          <input
            type="range"
            min={1}
            max={6}
            step={0.25}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="w-24 h-1 accent-primary"
          />
          <span className="text-[10px] text-muted-foreground tabular-nums">{zoom.toFixed(1)}x</span>
        </div>
      </div>

      <div ref={wrapperRef} className="px-3 pb-3">
        <div
          ref={scrollRef}
          className="relative overflow-x-auto rounded-xl border border-border/60 bg-muted/10"
        >
          {isDecoding && (
            <div className="absolute inset-0 z-20 bg-background/70 backdrop-blur-[1px] flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('waveform.decoding')}
            </div>
          )}
          {decodeError && (
            <div className="absolute inset-0 z-20 bg-background/85 flex items-center justify-center text-xs text-red-500 px-3 text-center">
              {t('waveform.decodeError')}
            </div>
          )}

          <div className="relative h-[132px]" style={{ width: timelineWidth }}>
            <canvas ref={canvasRef} className="absolute top-0 left-0" />
            <button
              type="button"
              aria-label={t('waveform.seekTimeline')}
              className="absolute inset-0 z-[1] bg-transparent"
              onClick={onTimelineClick}
            />

            <div className="absolute left-0 right-0 top-[102px] h-[20px]">
              {subtitle.entries.map((entry) => {
                const range = getRange(entry.id, entry.startTime, entry.endTime);
                const left = timeToPercent(range.start);
                const width = Math.max(0.3, timeToPercent(range.end) - left);
                const isActive = subtitle.activeEntryId === entry.id;
                const isSelected = subtitle.selectedIds.has(entry.id);
                const isDragging = dragState?.entryId === entry.id;

                return (
                  <button
                    type="button"
                    key={entry.id}
                    className={cn(
                      'absolute h-[20px] rounded-sm border transition-colors pointer-events-auto z-[2]',
                      isActive
                        ? 'bg-primary/35 border-primary/60'
                        : isSelected
                          ? 'bg-blue-500/20 border-blue-400/60'
                          : 'bg-emerald-500/10 border-emerald-500/35 hover:bg-emerald-500/18',
                      isDragging && 'shadow-[0_0_0_1px_rgba(59,130,246,0.6)]',
                    )}
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      minWidth: 8,
                    }}
                    title={entry.text.replace(/\n/g, ' ')}
                    onMouseDown={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const offset = event.clientX - rect.left;
                      const mode =
                        offset <= 6 ? 'start' : offset >= rect.width - 6 ? 'end' : 'move';
                      startDrag(event, entry.id, mode, range.start, range.end);
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      subtitle.selectEntry(entry.id);
                    }}
                  >
                    <span className="absolute left-0 top-0 bottom-0 w-[5px] bg-black/15 pointer-events-none" />
                    <span className="absolute right-0 top-0 bottom-0 w-[5px] bg-black/15 pointer-events-none" />
                  </button>
                );
              })}
            </div>

            {durationMs > 0 && (
              <div
                className="absolute top-0 bottom-[20px] w-[1.5px] bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.4)]"
                style={{ left: `${timeToPercent(subtitle.videoCurrentTime)}%` }}
              />
            )}
          </div>

          <div className="flex items-center text-[10px] text-muted-foreground/80 px-1 pb-1 min-w-max">
            {tickMarks.map((mark) => (
              <div
                key={mark}
                className="absolute -translate-x-1/2"
                style={{ left: `${timeToPercent(mark)}%` }}
              >
                {formatTimelineTick(mark)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
