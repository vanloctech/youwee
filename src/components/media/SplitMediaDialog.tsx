import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Check, Clock, Loader2, Scissors, Trash2, Wand2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { VideoMetadata } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SplitMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputPath: string;
  title: string;
  sourceUrl: string;
  thumbnail?: string | null;
  source?: string | null;
  quality?: string | null;
  format?: string | null;
  autoCollection?: boolean;
  ffmpegInstalled?: boolean;
  onComplete?: () => void | Promise<void>;
}

interface SegmentDraft {
  id: string;
  startSeconds: number;
  endSeconds: number;
  name: string;
}

interface SplitMediaResult {
  outputDir: string;
  segments: Array<{
    historyId: string;
    title: string;
    filepath: string;
    filesize?: number | null;
    duration: number;
    timeRange: string;
  }>;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function buildSegments(
  duration: number,
  cuts: number[],
  names: Map<string, string>,
): SegmentDraft[] {
  const points = [0, ...cuts, duration]
    .filter((value) => value >= 0 && value <= duration)
    .sort((a, b) => a - b);
  const segments: SegmentDraft[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startSeconds = points[index];
    const endSeconds = points[index + 1];
    if (endSeconds - startSeconds < 1) continue;
    const id = `${Math.round(startSeconds)}-${Math.round(endSeconds)}`;
    segments.push({
      id,
      startSeconds,
      endSeconds,
      name: names.get(id) || `Part ${String(index + 1).padStart(2, '0')}`,
    });
  }
  return segments;
}

function normalizeCut(seconds: number, duration: number): number | null {
  const rounded = Math.round(seconds);
  if (rounded <= 0 || rounded >= Math.round(duration)) {
    return null;
  }
  return rounded;
}

export function SplitMediaDialog({
  open,
  onOpenChange,
  inputPath,
  title,
  sourceUrl,
  thumbnail,
  source,
  quality,
  format,
  autoCollection,
  ffmpegInstalled,
  onComplete,
}: SplitMediaDialogProps) {
  const { t } = useTranslation('pages');
  const toast = useToast();
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [cuts, setCuts] = useState<number[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteOriginal, setDeleteOriginal] = useState(false);

  const duration = metadata?.duration || 0;
  const segments = useMemo(() => buildSegments(duration, cuts, names), [cuts, duration, names]);
  const hasUsableDuration = duration > 1;
  const hasCuts = cuts.length > 0;

  useEffect(() => {
    if (!open) {
      setError(null);
      setIsSplitting(false);
      return;
    }

    setCuts([]);
    setNames(new Map());
    setMetadata(null);
    setDeleteOriginal(false);
    setError(null);

    if (!inputPath || ffmpegInstalled === false) {
      return;
    }

    let cancelled = false;
    setLoadingMetadata(true);
    invoke<VideoMetadata>('get_video_metadata', { path: inputPath })
      .then((result) => {
        if (!cancelled) setMetadata(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingMetadata(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ffmpegInstalled, inputPath, open]);

  const setPreset = useCallback(
    (intervalSeconds: number) => {
      if (!hasUsableDuration) return;
      const nextCuts: number[] = [];
      for (let cursor = intervalSeconds; cursor < duration; cursor += intervalSeconds) {
        const cut = normalizeCut(cursor, duration);
        if (cut !== null) nextCuts.push(cut);
      }
      setCuts(nextCuts);
      setNames(new Map());
    },
    [duration, hasUsableDuration],
  );

  const addCutFromTimeline = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!hasUsableDuration || isSplitting) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / rect.width;
      const cut = normalizeCut(ratio * duration, duration);
      if (cut === null) return;
      setCuts((current) => {
        if (current.some((value) => Math.abs(value - cut) < 3)) return current;
        return [...current, cut].sort((a, b) => a - b);
      });
    },
    [duration, hasUsableDuration, isSplitting],
  );

  const removeCut = useCallback((cut: number) => {
    setCuts((current) => current.filter((value) => value !== cut));
    setNames(new Map());
  }, []);

  const updateSegmentName = useCallback((segmentId: string, name: string) => {
    setNames((current) => {
      const next = new Map(current);
      next.set(segmentId, name);
      return next;
    });
  }, []);

  const handleSplit = useCallback(async () => {
    if (ffmpegInstalled === false) {
      setError(t('library.split.ffmpegMissing'));
      return;
    }
    if (!hasUsableDuration || segments.length === 0) {
      setError(t('library.split.durationUnavailable'));
      return;
    }

    setIsSplitting(true);
    setError(null);
    try {
      const result = await invoke<SplitMediaResult>('split_media_segments', {
        request: {
          inputPath,
          sourceUrl,
          parentTitle: title,
          thumbnail: thumbnail || null,
          source: source || null,
          quality: quality || null,
          format: format || null,
          autoCollection: autoCollection === true,
          deleteOriginal,
          segments: segments.map((segment) => ({
            name: segment.name,
            startSeconds: segment.startSeconds,
            endSeconds: segment.endSeconds,
          })),
        },
      });
      toast.success({
        title: t('library.split.successTitle'),
        message: t('library.split.successMessage', { count: result.segments.length }),
      });
      await onComplete?.();
      onOpenChange(false);
    } catch (err) {
      await onComplete?.();
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSplitting(false);
    }
  }, [
    autoCollection,
    deleteOriginal,
    ffmpegInstalled,
    format,
    hasUsableDuration,
    inputPath,
    onComplete,
    onOpenChange,
    quality,
    segments,
    source,
    sourceUrl,
    t,
    thumbnail,
    title,
    toast,
  ]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !isSplitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[88vh] w-[min(920px,calc(100vw-2rem))] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Scissors className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base">{t('library.split.title')}</DialogTitle>
              <DialogDescription className="mt-1 line-clamp-1">{title}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          {ffmpegInstalled === false ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t('library.split.ffmpegRequiredTitle')}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('library.split.ffmpegRequiredDesc')}
                  </p>
                </div>
              </div>
            </div>
          ) : loadingMetadata ? (
            <div className="flex min-h-48 items-center justify-center rounded-xl border border-border/50 bg-muted/20">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('library.split.loading')}
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {hasUsableDuration
                    ? t('library.split.duration', { duration: formatDuration(duration) })
                    : t('library.split.durationUnknown')}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                  <Scissors className="h-3.5 w-3.5" />
                  {t('library.split.segmentCount', { count: segments.length })}
                </span>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{t('library.split.timeline')}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('library.split.timelineHint')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 10, 15].map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        disabled={!hasUsableDuration || isSplitting}
                        onClick={() => setPreset(minutes * 60)}
                        className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary disabled:opacity-50"
                      >
                        <Wand2 className="h-3 w-3" />
                        {t('library.split.everyMinutes', { minutes })}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={cuts.length === 0 || isSplitting}
                      onClick={() => {
                        setCuts([]);
                        setNames(new Map());
                      }}
                      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      {t('library.split.clearCuts')}
                    </button>
                  </div>
                </div>

                {/* biome-ignore lint/a11y/useSemanticElements: the timeline includes removable marker buttons, so it cannot be a native button. */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={addCutFromTimeline}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setPreset(Math.max(60, Math.round(duration / 2)));
                    }
                  }}
                  className={cn(
                    'relative h-20 cursor-crosshair overflow-hidden rounded-xl border border-border/50 bg-muted/35',
                    'focus:outline-none focus:ring-1 focus:ring-primary/50',
                    !hasUsableDuration && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 bg-primary/15">
                    <div className="h-full w-full bg-primary/55" />
                  </div>
                  {cuts.map((cut) => (
                    <button
                      key={cut}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeCut(cut);
                      }}
                      className="absolute top-2 flex -translate-x-1/2 flex-col items-center gap-1 text-primary"
                      style={{ left: `${(cut / duration) * 100}%` }}
                      title={t('library.split.removeCut', { time: formatDuration(cut) })}
                    >
                      <span className="h-10 w-0.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.6)]" />
                      <span className="rounded bg-background px-1 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                        {formatDuration(cut)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {segments.map((segment, index) => (
                  <div
                    key={segment.id}
                    className="grid gap-3 rounded-xl border border-border/50 bg-card/40 p-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(segment.startSeconds)} -{' '}
                        {formatDuration(segment.endSeconds)}
                      </span>
                    </div>
                    <Input
                      value={segment.name}
                      onChange={(event) => updateSegmentName(segment.id, event.currentTarget.value)}
                      disabled={isSplitting}
                      className="h-9 bg-background"
                      placeholder={t('library.split.segmentNamePlaceholder')}
                    />
                    {segments.length > 1 && index > 0 && index < segments.length ? (
                      <button
                        type="button"
                        disabled={isSplitting}
                        onClick={() => removeCut(segment.startSeconds)}
                        className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        title={t('library.split.removeSegment')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/50 bg-card/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={deleteOriginal}
                  disabled={isSplitting}
                  onChange={(event) => setDeleteOriginal(event.currentTarget.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span className="space-y-0.5">
                  <span className="block font-medium text-foreground">
                    {t('library.split.deleteOriginal')}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t('library.split.deleteOriginalDesc')}
                  </span>
                </span>
              </label>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/60 px-5 py-4">
          <Button
            type="button"
            variant="outline"
            disabled={isSplitting}
            onClick={() => onOpenChange(false)}
          >
            <X className="me-2 h-4 w-4" />
            {t('library.split.cancel')}
          </Button>
          <Button
            type="button"
            disabled={
              isSplitting ||
              loadingMetadata ||
              ffmpegInstalled === false ||
              !hasUsableDuration ||
              !hasCuts ||
              segments.length === 0
            }
            onClick={handleSplit}
          >
            {isSplitting ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="me-2 h-4 w-4" />
            )}
            {isSplitting ? t('library.split.splitting') : t('library.split.splitFiles')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
