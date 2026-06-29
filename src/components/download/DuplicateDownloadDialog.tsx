import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, CheckCircle2, FileQuestion, FolderOpen, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { toAssetUrl } from '@/lib/asset-access';
import type {
  DownloadDuplicateReview,
  DownloadDuplicateReviewAction,
  DownloadDuplicateReviewItem,
} from '@/lib/types';
import { cn } from '@/lib/utils';

interface DuplicateDownloadDialogProps {
  review: DownloadDuplicateReview | null;
  onResolve: (action: DownloadDuplicateReviewAction, applyToAll: boolean) => void;
}

function filenameFromPath(filepath: string): string {
  const parts = filepath.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || filepath;
}

function formatDownloadedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function duplicateThumbnailKey(item: DownloadDuplicateReviewItem): string {
  return item.duplicate.historyId || item.duplicate.filepath || item.url;
}

function canGenerateThumbnailFromFile(filepath: string): boolean {
  return /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|ts|webm|wmv)$/i.test(filepath);
}

export function DuplicateDownloadDialog({ review, onResolve }: DuplicateDownloadDialogProps) {
  const { t } = useTranslation('download');
  const [generatedThumbnails, setGeneratedThumbnails] = useState<Record<string, string>>({});
  const attemptedGeneratedThumbnailKeys = useRef(new Set<string>());
  const previewItems = useMemo(() => review?.duplicates.slice(0, 5) ?? [], [review]);
  const reviewKey = useMemo(
    () =>
      previewItems
        .map((item) => `${item.duplicate.historyId}:${item.duplicate.filepath}:${item.url}`)
        .join('|'),
    [previewItems],
  );
  const remainingCount = Math.max(0, (review?.duplicates.length ?? 0) - previewItems.length);

  useEffect(() => {
    if (!reviewKey) {
      attemptedGeneratedThumbnailKeys.current.clear();
      setGeneratedThumbnails((current) => (Object.keys(current).length > 0 ? {} : current));
      return;
    }

    attemptedGeneratedThumbnailKeys.current.clear();
    setGeneratedThumbnails((current) => (Object.keys(current).length > 0 ? {} : current));
  }, [reviewKey]);

  useEffect(() => {
    if (!review) return;

    let cancelled = false;
    const missingThumbnailItems = previewItems.filter((item) => {
      const key = duplicateThumbnailKey(item);
      return (
        !item.thumbnail &&
        !item.duplicate.thumbnail &&
        item.duplicate.fileExists &&
        canGenerateThumbnailFromFile(item.duplicate.filepath) &&
        !attemptedGeneratedThumbnailKeys.current.has(key)
      );
    });

    for (const item of missingThumbnailItems) {
      const key = duplicateThumbnailKey(item);
      attemptedGeneratedThumbnailKeys.current.add(key);

      void invoke<string>('generate_video_thumbnail', { inputPath: item.duplicate.filepath })
        .then((thumbnailPath) => toAssetUrl(thumbnailPath))
        .then((thumbnailUrl) => {
          if (cancelled) return;
          setGeneratedThumbnails((current) =>
            current[key] ? current : { ...current, [key]: thumbnailUrl },
          );
        })
        .catch(() => {
          // Some duplicate entries are audio-only or have unsupported local files.
          // Keep the existing placeholder when thumbnail generation is not possible.
        });
    }

    return () => {
      cancelled = true;
    };
  }, [previewItems, review]);

  return (
    <Dialog
      open={Boolean(review)}
      onOpenChange={(open) => {
        if (!open) onResolve('cancel', true);
      }}
    >
      <DialogContent className="max-h-[86vh] max-w-3xl gap-0 overflow-hidden border-white/10 bg-card/95 p-0 shadow-2xl backdrop-blur-xl">
        <DialogHeader className="border-b border-border/40 bg-background/20 px-5 py-3 pr-12 sm:px-6 sm:py-3.5 sm:pr-12">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-amber-500/85 ring-1 ring-border/60 dark:text-amber-400/80">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <DialogTitle className="text-base font-semibold leading-6">
                {t('duplicates.title')}
              </DialogTitle>
              <DialogDescription className="text-xs leading-5 text-muted-foreground">
                {t('duplicates.description', {
                  count: review?.duplicates.length ?? 0,
                  newCount: review?.newCount ?? 0,
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-2">
            {previewItems.map((item) => {
              const thumbnailSrc =
                item.thumbnail ||
                item.duplicate.thumbnail ||
                generatedThumbnails[duplicateThumbnailKey(item)] ||
                null;

              return (
                <div
                  key={`${item.duplicate.historyId}:${item.url}`}
                  className="group rounded-xl border border-border/60 bg-background/45 p-3 transition-colors hover:border-border/90 hover:bg-background/60"
                >
                  <div className="flex flex-col gap-3 sm:flex-row">
                    {thumbnailSrc ? (
                      <img
                        src={thumbnailSrc}
                        alt=""
                        className="aspect-video w-full shrink-0 rounded-lg object-cover ring-1 ring-white/10 sm:w-32"
                      />
                    ) : (
                      <div className="flex aspect-video w-full shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground ring-1 ring-white/10 sm:w-32">
                        <FileQuestion className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {filenameFromPath(item.duplicate.filepath)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-md bg-muted/70 px-2 py-1 text-muted-foreground">
                          {t('duplicates.downloadedAt', {
                            date: formatDownloadedAt(item.duplicate.downloadedAt),
                          })}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-1',
                            item.duplicate.fileExists
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-amber-500/10 text-amber-500',
                          )}
                        >
                          {item.duplicate.fileExists ? (
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          ) : (
                            <FolderOpen className="h-3.5 w-3.5" />
                          )}
                          {item.duplicate.fileExists
                            ? t('duplicates.fileExists')
                            : t('duplicates.fileMissing')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {remainingCount > 0 && (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/30 px-3 py-2 text-center text-xs text-muted-foreground">
                {t('duplicates.moreItems', { count: remainingCount })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-border/50 bg-background/25 px-5 py-4 sm:flex-row sm:justify-end sm:space-x-0">
          <Button variant="outline" onClick={() => onResolve('cancel', true)}>
            {t('duplicates.cancel')}
          </Button>
          <Button variant="outline" onClick={() => onResolve('add', true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('duplicates.addAgain')}
          </Button>
          <Button onClick={() => onResolve('skip', true)}>{t('duplicates.skip')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
