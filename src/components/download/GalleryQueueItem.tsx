import {
  ArrowUpToLine,
  Ban,
  CheckCircle2,
  Clock,
  CopyPlus,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  X,
  XCircle,
} from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useGalleryDl } from '@/contexts/gallerydl-context';
import { openFileLocation } from '@/lib/open-file-location';
import type { DownloadItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const ERROR_CLASS_BADGE_STYLES: Record<string, string> = {
  transient: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  auth: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  geo: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  unavailable: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  disk: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  config: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  unknown: 'bg-muted/50 text-muted-foreground',
};

interface GalleryQueueItemProps {
  item: DownloadItem;
  isFocused?: boolean;
  disabled?: boolean;
  onRemove: (id: string) => void;
}

export function GalleryQueueItem({
  item,
  isFocused = false,
  disabled,
  onRemove,
}: GalleryQueueItemProps) {
  const { t } = useTranslation('gallery');
  const { retryFailedDownload, pauseItem, resumeItem, cancelItem, duplicateItem, moveItemToTop, toggleItemIncognito } =
    useGalleryDl();
  const isActive = item.status === 'downloading' || item.status === 'fetching';
  const isCompleted = item.status === 'completed';
  const isError = item.status === 'error';
  const isPending = item.status === 'pending';
  const isPaused = item.status === 'paused';

  const handleOpenFolder = useCallback(async () => {
    if (!item.completedFilepath) return;
    try {
      await openFileLocation(item.completedFilepath);
    } catch (error) {
      console.error('Failed to open gallery output folder:', error);
    }
  }, [item.completedFilepath]);

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
      <div className="relative flex-shrink-0 w-28 h-[72px] sm:w-36 sm:h-20 rounded-lg overflow-hidden bg-muted">
        <div className="w-full h-full flex items-center justify-center bg-muted">
          {isCompleted ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-500/70" />
          ) : isError ? (
            <XCircle className="w-8 h-8 text-red-500/70" />
          ) : isActive ? (
            <Loader2 className="w-8 h-8 text-primary/70 animate-spin" />
          ) : (
            <Globe className="w-8 h-8 text-muted-foreground/30" />
          )}
        </div>

        {/* P0-5: incognito indicator */}
        {item.incognito && (
          <div className="absolute top-1.5 start-1.5 px-1.5 py-0.5 rounded bg-black/70 text-amber-300 text-[10px] flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            <span>{t('download:queue.incognito')}</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
        <p
          className={cn(
            'text-sm font-medium leading-snug line-clamp-2 transition-colors',
            isCompleted && 'text-muted-foreground',
          )}
          title={item.title}
        >
          {item.title}
        </p>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {item.extractor && (
            <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
              <Globe className="w-3 h-3" />
              {item.extractor}
            </span>
          )}

          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
              isPending && 'bg-muted text-muted-foreground',
              isPaused && 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
              isActive && 'bg-primary/10 text-primary',
              isCompleted && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
              isError && 'bg-red-500/10 text-red-600 dark:text-red-400',
            )}
          >
            {isPending && <Clock className="w-3 h-3" />}
            {isPaused && <Pause className="w-3 h-3" />}
            {isActive && <Loader2 className="w-3 h-3 animate-spin" />}
            {isCompleted && <CheckCircle2 className="w-3 h-3" />}
            {isError && <XCircle className="w-3 h-3" />}
            <span>
              {isPending && t('queue.status.pending')}
              {isPaused && t('download:queue.status.paused')}
              {isActive && t('queue.status.downloading')}
              {isCompleted && t('queue.status.completed')}
              {isError && t('queue.status.failed')}
            </span>
          </span>

          {item.error && isError && (
            <span className="text-xs text-red-500/80 line-clamp-2" title={item.error}>
              {item.error}
            </span>
          )}

          {/* P0-7: error class badge + suggested action */}
          {isError && item.errorClass && (
            <span
              className={cn(
                'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
                ERROR_CLASS_BADGE_STYLES[item.errorClass] ?? 'bg-muted/50 text-muted-foreground',
              )}
            >
              {t(`download:queue.errorClass.${item.errorClass}`)}
              <span className="opacity-60">·</span>
              {t(`download:queue.errorClassAction.${item.errorClass}`)}
            </span>
          )}
        </div>

        {!isActive && !isError && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {isCompleted && item.completedFilepath && (
              <button
                type="button"
                onClick={handleOpenFolder}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-blue-500/30 text-blue-600 dark:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/10 transition-colors font-medium"
              >
                <FolderOpen className="w-3 h-3" />
                {t('queue.openFolder')}
              </button>
            )}
          </div>
        )}

        {/* P0-7: per-item controls cluster */}
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {!isActive && isError && (
            <button
              type="button"
              onClick={() => retryFailedDownload(item.id)}
              disabled={disabled}
              title={t('download:queue.retry')}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors font-medium disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              {t('download:queue.retry')}
            </button>
          )}
          {!isActive && (isPending || isError) && (
            <button
              type="button"
              onClick={() => pauseItem(item.id)}
              disabled={disabled}
              title={t('download:queue.pause')}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors font-medium disabled:opacity-50"
            >
              <Pause className="w-3 h-3" />
              {t('download:queue.pause')}
            </button>
          )}
          {isPaused && (
            <button
              type="button"
              onClick={() => resumeItem(item.id)}
              disabled={disabled}
              title={t('download:queue.resume')}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors font-medium disabled:opacity-50"
            >
              <Play className="w-3 h-3" />
              {t('download:queue.resume')}
            </button>
          )}
          {(isPending || isPaused || isError || isActive) && (
            <button
              type="button"
              onClick={() => cancelItem(item.id)}
              disabled={disabled}
              title={t('download:queue.cancel')}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-red-500/30 text-red-500 hover:border-red-500/50 hover:bg-red-500/10 transition-colors font-medium disabled:opacity-50"
            >
              <Ban className="w-3 h-3" />
              {t('download:queue.cancel')}
            </button>
          )}
          {!isActive && (
            <button
              type="button"
              onClick={() => duplicateItem(item.id)}
              disabled={disabled}
              title={t('download:queue.duplicate')}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors font-medium disabled:opacity-50"
            >
              <CopyPlus className="w-3 h-3" />
              {t('download:queue.duplicate')}
            </button>
          )}
          <button
            type="button"
            onClick={() => moveItemToTop(item.id)}
            disabled={disabled}
            title={t('download:queue.moveToTop')}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors font-medium disabled:opacity-50"
          >
            <ArrowUpToLine className="w-3 h-3" />
            {t('download:queue.moveToTop')}
          </button>
          {!isActive && (
            <button
              type="button"
              onClick={() => toggleItemIncognito(item.id)}
              disabled={disabled}
              title={t('download:queue.incognitoToggle')}
              className={cn(
                'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border border-dashed font-medium disabled:opacity-50 transition-colors',
                item.incognito
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground hover:bg-muted/50',
              )}
            >
              {item.incognito ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {t('download:queue.incognito')}
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={disabled}
        title={t('queue.remove')}
        className={cn(
          'absolute top-2 end-2 p-1.5 rounded-full transition-all',
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
