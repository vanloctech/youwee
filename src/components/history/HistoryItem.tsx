import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileAudio,
  FileVideo,
  Folder,
  FolderOpen,
  HardDrive,
  Hash,
  Loader2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Scissors,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollectionManagerDialog } from '@/components/history/CollectionManagerDialog';
import { HistorySummaryDialog } from '@/components/history/HistorySummaryDialog';
import { HistoryTagsCollectionsDialog } from '@/components/history/HistoryTagsCollectionsDialog';
import { FaIcon } from '@/components/shared/FaIcon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAI } from '@/contexts/AIContext';
import { useHistory } from '@/contexts/HistoryContext';
import { usePlayer } from '@/contexts/PlayerContext';
import {
  type LibraryDeleteFileBehavior,
  loadLibraryDeleteFileBehavior,
} from '@/lib/library-delete-behavior';
import { buildPlayableAudioQueue, isPlayableAudioEntry } from '@/lib/player-queue';
import { detectSource } from '@/lib/sources';
import type { HistoryEntry } from '@/lib/types';
import { cn, isSafeUrl } from '@/lib/utils';
import { getHistoryItemActionLayout } from './historyItemActions';

interface HistoryItemProps {
  entry: HistoryEntry;
}

// Format file size
function formatSize(bytes: number | undefined, unknownLabel: string): string {
  if (!bytes) return unknownLabel;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Format relative time with translations
function formatRelativeTime(
  dateStr: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('library.item.justNow');
  if (diffMins < 60) return t('library.item.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('library.item.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('library.item.daysAgo', { count: diffDays });
  return date.toLocaleDateString();
}

function createSummaryPreview(summary: string): string {
  return summary
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function HistoryItem({ entry }: HistoryItemProps) {
  const { t } = useTranslation('pages');
  const {
    entries,
    openFileLocation,
    deleteEntry,
    renameEntry,
    redownload,
    getRedownloadTask,
    setAdvancedFilters,
  } = useHistory();
  const ai = useAI();
  const { currentEntry, isPlaying, playFrom, togglePlay } = usePlayer();
  const [isDeleting, setIsDeleting] = useState(false);
  const [redownloadError, setRedownloadError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [localSummary, setLocalSummary] = useState<string | undefined>(entry.summary);
  const [thumbError, setThumbError] = useState(false);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const [isRenameEditorOpen, setIsRenameEditorOpen] = useState(false);
  const [isTaggingDialogOpen, setIsTaggingDialogOpen] = useState(false);
  const [isCollectionsManagerOpen, setIsCollectionsManagerOpen] = useState(false);
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteFileBehavior, setDeleteFileBehavior] = useState<LibraryDeleteFileBehavior>('ask');
  const [renameName, setRenameName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Get redownload task from context (persists across page changes)
  const redownloadTask = getRedownloadTask(entry.id);
  const isRedownloading = redownloadTask?.status === 'downloading';
  const redownloadProgress = redownloadTask?.progress || 0;
  const redownloadSpeed = redownloadTask?.speed || '';

  const isDataExport = entry.source === 'data_export' || entry.quality === 'data export';
  const sourceConfig = detectSource(isDataExport ? 'data_export' : entry.source);
  const sourceLabel = isDataExport ? t('library.toolbar.filterDataExport') : sourceConfig.label;
  const canPlayAudio = isPlayableAudioEntry(entry);
  const isAudioMedia = canPlayAudio;
  const isCurrentAudio = currentEntry?.id === entry.id;
  const isActivePlayback = isCurrentAudio && isPlaying;
  const thumbnailUrl = entry.thumbnail ? entry.thumbnail.replace(/^http:\/\//, 'https://') : null;
  const summaryPreview = useMemo(
    () => (localSummary ? createSummaryPreview(localSummary) : ''),
    [localSummary],
  );

  // Reset local summary when entry changes (important for component reuse)
  useEffect(() => {
    setLocalSummary(entry.summary);
  }, [entry.summary]);

  useEffect(() => {
    if (!thumbnailUrl) {
      setThumbLoaded(false);
      setThumbError(false);
      return;
    }
    setThumbLoaded(false);
    setThumbError(false);
  }, [thumbnailUrl]);

  // Get background task status from context
  const task = ai.getSummaryTask(entry.id);
  const aiEnabled = ai.config.enabled;
  const isGeneratingSummary = task?.status === 'fetching' || task?.status === 'generating';
  // Don't show AI errors if AI is disabled (user didn't explicitly use AI)
  const summaryError = aiEnabled && task?.status === 'error' ? task.error : null;
  const actionLayout = useMemo(
    () =>
      getHistoryItemActionLayout({
        fileExists: entry.file_exists,
        isDataExport,
        aiEnabled,
      }),
    [aiEnabled, entry.file_exists, isDataExport],
  );
  const canDeleteMediaFile = Boolean(entry.file_exists && entry.filepath.trim());

  // Update local summary when task completes
  useEffect(() => {
    if (task?.status === 'completed' && task.summary) {
      setLocalSummary(task.summary);
      // Clear task after applying
      ai.clearSummaryTask(entry.id);
    }
  }, [task, entry.id, ai]);

  const handleOpenFolder = useCallback(async () => {
    try {
      await openFileLocation(entry.filepath);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, [openFileLocation, entry.filepath]);

  const handleDelete = useCallback(async () => {
    setDeleteFileBehavior(loadLibraryDeleteFileBehavior());
    setIsActionsPopoverOpen(false);
    setIsDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(
    async (deleteFile: boolean) => {
      setIsDeleteDialogOpen(false);
      setIsDeleting(true);
      try {
        await deleteEntry(entry.id, deleteFile && canDeleteMediaFile);
      } catch (error) {
        console.error('Failed to delete:', error);
      } finally {
        setIsDeleting(false);
      }
    },
    [canDeleteMediaFile, deleteEntry, entry.id],
  );

  const handleRedownload = useCallback(async () => {
    setRedownloadError(null);
    try {
      await redownload(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('library.item.failedToRedownload');
      setRedownloadError(message);
    }
  }, [redownload, entry, t]);

  const handleOpenRenameEditor = useCallback(() => {
    setRenameName(entry.title);
    setRenameError(null);
    setIsRenameEditorOpen(true);
    setIsActionsPopoverOpen(false);
  }, [entry.title]);

  const handleCancelRename = useCallback(() => {
    setIsRenameEditorOpen(false);
    setRenameError(null);
    setRenameName('');
  }, []);

  const handleRename = useCallback(async () => {
    if (isRenaming) return;

    setRenameError(null);
    setIsRenaming(true);
    try {
      await renameEntry(entry.id, renameName);
      setIsRenameEditorOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('library.item.renameFailed');
      setRenameError(message);
    } finally {
      setIsRenaming(false);
    }
  }, [isRenaming, renameEntry, entry.id, renameName, t]);

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(entry.url);
    setCopied(true);
    setIsActionsPopoverOpen(false);
    setTimeout(() => setCopied(false), 2000);
  }, [entry.url]);

  const handleCopySummary = useCallback(() => {
    if (localSummary) {
      navigator.clipboard.writeText(localSummary);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2000);
    }
  }, [localSummary]);

  const handleGenerateSummary = useCallback(() => {
    // Don't do anything if AI is disabled
    if (!ai.config.enabled) {
      return;
    }
    // Start background task - this will continue even if component unmounts
    ai.startSummaryTask(entry.id, entry.url);
  }, [ai, entry.url, entry.id]);

  const handleOpenTagsDialog = useCallback(() => {
    setIsTaggingDialogOpen(true);
    setIsActionsPopoverOpen(false);
  }, []);

  const handleTagFilter = useCallback(
    (tagId: string) => {
      setAdvancedFilters({ tagIds: [tagId], matchMode: 'any' });
    },
    [setAdvancedFilters],
  );

  const handleCollectionFilter = useCallback(
    (collectionId: string) => {
      setAdvancedFilters({ collectionIds: [collectionId], matchMode: 'any' });
    },
    [setAdvancedFilters],
  );

  const handlePlayAudio = useCallback(() => {
    if (!canPlayAudio) return;

    if (isCurrentAudio) {
      togglePlay();
      return;
    }

    const audioQueue = buildPlayableAudioQueue(entries);
    const startIndex = audioQueue.findIndex((queueEntry) => queueEntry.id === entry.id);
    if (startIndex === -1) return;

    playFrom(audioQueue, startIndex);
  }, [canPlayAudio, entries, entry.id, isCurrentAudio, playFrom, togglePlay]);

  const cardContent = (
    <div className="flex gap-4">
      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-32 h-20 sm:w-40 sm:h-24 rounded-lg overflow-hidden bg-muted">
        {thumbnailUrl && !thumbError ? (
          <>
            {!thumbLoaded && (
              <div className="absolute inset-0 bg-muted">
                <div className="h-full w-full animate-pulse bg-[linear-gradient(110deg,hsl(var(--muted)),hsl(var(--background)/0.75),hsl(var(--muted)))] bg-[length:200%_100%]" />
              </div>
            )}
            <img
              src={thumbnailUrl}
              alt=""
              className={cn(
                'w-full h-full object-cover transition-opacity duration-300',
                thumbLoaded ? 'opacity-100' : 'opacity-0',
              )}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              onLoad={() => setThumbLoaded(true)}
              onError={() => setThumbError(true)}
              referrerPolicy="no-referrer"
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[inherit] bg-[linear-gradient(135deg,hsl(var(--muted)/0.98),hsl(var(--background)/0.86))]">
            <div className="relative flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-background/45 text-muted-foreground shadow-sm backdrop-blur-sm">
                {isAudioMedia ? (
                  <FileAudio className="h-5 w-5" />
                ) : (
                  <FileVideo className="h-5 w-5" />
                )}
              </div>
              <span className="rounded bg-background/35 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
                Youwee
              </span>
            </div>
          </div>
        )}

        {/* Source badge */}
        <div
          className={cn(
            'absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60',
            sourceConfig.color,
          )}
        >
          <FaIcon icon={sourceConfig.icon} className="text-[9px]" />
          <span className="hidden sm:inline">{sourceLabel}</span>
        </div>

        {/* File missing indicator */}
        {!entry.file_exists && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-6 h-6 text-yellow-500 mx-auto mb-1" />
              <span className="text-[10px] text-yellow-500 font-medium">
                {t('library.item.fileMissing')}
              </span>
            </div>
          </div>
        )}

        {/* Quality badge */}
        {entry.quality && !isDataExport && (
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white font-medium">
            {entry.quality}
          </div>
        )}

        {canPlayAudio && (
          <button
            type="button"
            onClick={handlePlayAudio}
            className={cn(
              'absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-sm',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              isCurrentAudio && 'opacity-100',
            )}
          >
            {isCurrentAudio && isActivePlayback ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        {/* Title */}
        <div>
          <h3 className="font-medium text-sm line-clamp-2 leading-snug mb-1.5" title={entry.title}>
            {entry.title}
          </h3>

          {/* Meta info */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {entry.format && (
              <span className="uppercase font-medium px-1.5 py-0.5 rounded bg-muted">
                {entry.format}
              </span>
            )}
            {entry.time_range && (
              <span className="inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Scissors className="w-3 h-3" />
                {entry.time_range}
              </span>
            )}
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatSize(entry.filesize, t('library.item.unknown'))}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatRelativeTime(entry.downloaded_at, t)}
            </span>
          </div>

          {(entry.tags.length > 0 || entry.collections.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {entry.tags.map((tag) => (
                <button
                  type="button"
                  key={tag.id}
                  onClick={() => handleTagFilter(tag.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-500/20 dark:text-blue-400"
                >
                  <Hash className="w-3 h-3" />
                  {tag.name}
                </button>
              ))}
              {entry.collections.map((collection) => (
                <button
                  type="button"
                  key={collection.id}
                  onClick={() => handleCollectionFilter(collection.id)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                >
                  <span
                    className="h-2 w-2 rounded-full bg-amber-500/80"
                    style={collection.color ? { backgroundColor: collection.color } : undefined}
                  />
                  {collection.name}
                </button>
              ))}
            </div>
          )}

          {/* AI Summary */}
          {!isDataExport && (localSummary || summaryError) && (
            <div className="mt-2">
              {localSummary ? (
                <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground overflow-hidden">
                        <p className="line-clamp-3 leading-relaxed">
                          {summaryPreview.length > 260
                            ? `${summaryPreview.slice(0, 260).trimEnd()}...`
                            : summaryPreview}
                        </p>
                      </div>
                      {localSummary.length > 200 && (
                        <button
                          type="button"
                          onClick={() => setIsSummaryDialogOpen(true)}
                          className="text-xs text-purple-500 hover:text-purple-400 mt-1 flex items-center gap-0.5"
                        >
                          {t('library.item.viewFullSummary')}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={handleCopySummary}
                        className="p-1 rounded text-muted-foreground hover:text-purple-500 transition-colors"
                        title={t('library.item.copySummary')}
                      >
                        {copiedSummary ? (
                          <Check className="w-3 h-3 text-green-500" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary}
                        className="p-1 rounded text-muted-foreground hover:text-purple-500 transition-colors"
                        title={t('library.item.regenerateSummary')}
                      >
                        {isGeneratingSummary ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              {summaryError && <p className="text-xs text-destructive mt-1">{summaryError}</p>}
            </div>
          )}
        </div>

        {/* Error message */}
        {!isDataExport && (redownloadError || redownloadTask?.error) && (
          <p className="text-xs text-destructive mt-2">
            {redownloadError || redownloadTask?.error}
          </p>
        )}
        {renameError && <p className="text-xs text-destructive mt-2">{renameError}</p>}

        {/* Re-download progress bar */}
        {!isDataExport && isRedownloading && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t('library.item.downloading')}
              </span>
              <span className="text-muted-foreground">
                {redownloadProgress.toFixed(0)}%{redownloadSpeed && ` · ${redownloadSpeed}`}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${redownloadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {actionLayout.primary.includes('open-folder') && (
            <button
              type="button"
              onClick={handleOpenFolder}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'bg-primary/10 hover:bg-primary/20 text-primary transition-colors',
              )}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              {t('library.item.openFolder')}
            </button>
          )}

          {actionLayout.primary.includes('redownload') && (
            <button
              type="button"
              onClick={handleRedownload}
              disabled={isRedownloading}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'bg-primary/10 hover:bg-primary/20 text-primary transition-colors',
                isRedownloading && 'opacity-50',
              )}
            >
              {isRedownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {t('library.item.redownload')}
            </button>
          )}

          {actionLayout.summary && (
            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'bg-primary/10 hover:bg-primary/15 transition-colors',
                isGeneratingSummary && 'opacity-60',
              )}
            >
              {isGeneratingSummary ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span className="gradient-text">
                    {task?.status === 'fetching'
                      ? t('library.item.fetchingTranscript')
                      : t('library.item.generatingSummary')}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span className="gradient-text">
                    {localSummary
                      ? t('library.item.regenerateSummary')
                      : t('library.item.generateAiSummary')}
                  </span>
                </>
              )}
            </button>
          )}

          <Popover open={isActionsPopoverOpen} onOpenChange={setIsActionsPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                  'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors',
                )}
                title={t('library.item.moreActions')}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
                {t('library.item.moreActions')}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="space-y-1">
                {actionLayout.overflow.includes('rename') && (
                  <button
                    type="button"
                    onClick={handleOpenRenameEditor}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      'text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {t('library.item.rename')}
                  </button>
                )}

                {actionLayout.overflow.includes('open-url') && (
                  <a
                    href={isSafeUrl(entry.url) ? entry.url : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsActionsPopoverOpen(false)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      'text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t('library.item.openUrl')}
                  </a>
                )}

                {actionLayout.overflow.includes('copy-url') && (
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      'text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        {t('library.item.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        {t('library.item.copy')}
                      </>
                    )}
                  </button>
                )}

                {actionLayout.overflow.includes('manage-tags') && (
                  <button
                    type="button"
                    onClick={handleOpenTagsDialog}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      'text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Folder className="w-3.5 h-3.5" />
                    {t('library.item.manageTagsCollections')}
                  </button>
                )}

                {actionLayout.overflow.includes('delete') && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                      'text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300',
                      isDeleting && 'opacity-50',
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('library.item.delete')}
                  </button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {isRenameEditorOpen && entry.file_exists && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/50 p-2">
            <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder={t('library.item.renamePlaceholder')}
              className="h-7 flex-1 rounded border border-border/50 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
            />
            <button
              type="button"
              onClick={handleRename}
              disabled={isRenaming}
              className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {isRenaming ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                t('library.item.renameSave')
              )}
            </button>
            <button
              type="button"
              onClick={handleCancelRename}
              disabled={isRenaming}
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
            >
              {t('library.item.renameCancel')}
            </button>
          </div>
        )}

        <HistoryTagsCollectionsDialog
          entry={entry}
          open={isTaggingDialogOpen}
          onOpenChange={setIsTaggingDialogOpen}
          onOpenCollectionsManager={() => setIsCollectionsManagerOpen(true)}
        />
        <CollectionManagerDialog
          open={isCollectionsManagerOpen}
          onOpenChange={setIsCollectionsManagerOpen}
        />
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteFileBehavior === 'delete-file' && canDeleteMediaFile
                  ? t('library.item.deleteWithFileTitle')
                  : t('library.item.deleteTitle')}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteFileBehavior === 'delete-file' && canDeleteMediaFile
                  ? t('library.item.deleteWithFileConfirm', { title: entry.title })
                  : t('library.item.deleteConfirm', { title: entry.title })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2 sm:space-x-0">
              <AlertDialogCancel disabled={isDeleting}>
                {t('library.item.deleteCancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={() =>
                  void confirmDelete(deleteFileBehavior === 'delete-file' && canDeleteMediaFile)
                }
                className={
                  deleteFileBehavior === 'delete-file' && canDeleteMediaFile
                    ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                    : undefined
                }
              >
                {deleteFileBehavior === 'delete-file' && canDeleteMediaFile
                  ? t('library.item.deleteWithFile')
                  : t('library.item.deleteLibraryOnly')}
              </AlertDialogAction>
              {deleteFileBehavior === 'ask' && canDeleteMediaFile && (
                <AlertDialogAction
                  disabled={isDeleting}
                  onClick={() => void confirmDelete(true)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('library.item.deleteWithFile')}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {localSummary && (
          <HistorySummaryDialog
            entry={entry}
            open={isSummaryDialogOpen}
            onOpenChange={setIsSummaryDialogOpen}
            summary={localSummary}
            copied={copiedSummary}
            isGenerating={isGeneratingSummary}
            onCopy={handleCopySummary}
            onRegenerate={handleGenerateSummary}
          />
        )}
      </div>
    </div>
  );

  if (canPlayAudio) {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper only provides a double-click shortcut while child action buttons remain semantic.
      <div
        onDoubleClick={handlePlayAudio}
        className={cn(
          'group relative rounded-xl border p-4 transition-all duration-200',
          'bg-card/50 hover:bg-card/80',
          'border-white/[0.08] dark:border-white/[0.05]',
          'cursor-pointer',
          isCurrentAudio &&
            'border-emerald-500/40 bg-emerald-500/[0.06] shadow-[0_0_0_1px_rgba(16,185,129,0.12)]',
          !entry.file_exists && 'opacity-70',
        )}
      >
        {cardContent}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all duration-200',
        'bg-card/50 hover:bg-card/80',
        'border-white/[0.08] dark:border-white/[0.05]',
        !entry.file_exists && 'opacity-70',
      )}
    >
      {cardContent}
    </div>
  );
}
