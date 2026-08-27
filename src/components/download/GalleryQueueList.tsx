import {
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderOpen,
  Globe,
  Images,
  Loader2,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { convertFileSrc } from '@tauri-apps/api/core';
import { openFileLocation } from '@/lib/open-file-location';
import type { DownloadItem } from '@/lib/types';
import { cn } from '@/lib/utils';

const POPULAR_SITES = [
  { name: 'Pixiv', color: 'text-sky-500' },
  { name: 'Instagram', color: 'text-pink-500' },
  { name: 'Twitter/X', color: 'text-slate-500' },
  { name: 'Reddit', color: 'text-orange-600' },
  { name: 'Patreon', color: 'text-orange-500' },
  { name: 'Danbooru', color: 'text-blue-600' },
  { name: 'MangaDex', color: 'text-emerald-500' },
  { name: 'Pinterest', color: 'text-red-500' },
];

interface GalleryQueueListProps {
  items: DownloadItem[];
  focusedItemId?: string | null;
  isDownloading: boolean;
  onRemove: (id: string) => void;
  onClearCompleted: () => void;
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

function fileNameOf(item: DownloadItem): string {
  if (item.completedFilepath) {
    const normalized = item.completedFilepath.replace(/\\/g, '/');
    const last = normalized.split('/').filter(Boolean).pop();
    if (last) return last;
  }
  return item.title || item.url;
}

function thumbnailSrc(item: DownloadItem): string | undefined {
  if (!item.thumbnail) return undefined;
  // Remote URLs / data / blob pass through; local file paths must go through
  // the Tauri asset protocol (same as GalleryBrowser).
  if (/^(https?:|data:|blob:)/i.test(item.thumbnail)) return item.thumbnail;
  try {
    return convertFileSrc(item.thumbnail);
  } catch {
    return item.thumbnail;
  }
}

function siteInitial(item: DownloadItem): string {
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, '');
    return host.charAt(0).toUpperCase();
  } catch {
    return (item.extractor || '?').charAt(0).toUpperCase();
  }
}

export function GalleryQueueList({
  items,
  focusedItemId,
  isDownloading,
  onRemove,
  onClearCompleted,
}: GalleryQueueListProps) {
  const { t } = useTranslation('gallery');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const completedCount = items.filter((i) => i.status === 'completed').length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const totalCount = items.length;
  const hasCompleted = completedCount > 0;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Filter by title / source (extractor) / host as the user types
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const haystack = [item.title, item.extractor, item.url, item.channel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((item) => selectedIds.has(item.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((item) => next.delete(item.id));
      } else {
        filtered.forEach((item) => next.add(item.id));
      }
      return next;
    });
  };

  const deleteSelected = () => {
    const ids = items.filter((item) => selectedIds.has(item.id)).map((item) => item.id);
    ids.forEach((id) => onRemove(id));
    setSelectedIds(new Set());
  };

  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    if (!focusedItemId || !containerRef.current) return;
    const target = containerRef.current.querySelector<HTMLElement>(
      `[data-queue-item-id="${focusedItemId}"]`,
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusedItemId]);

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
        <EmptyStateIllustration className="mb-5" icon={Images} size="sm" />
        <h3 className="text-sm font-medium text-foreground mb-1">{t('queue.empty.title')}</h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-[320px]">
          {t('queue.empty.description')}
        </p>

        <div className="flex flex-wrap justify-center gap-2 mb-4 max-w-[380px]">
          {POPULAR_SITES.map((site) => (
            <span
              key={site.name}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 text-[11px]',
                site.color,
              )}
            >
              <span>{site.name}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 text-[11px] text-muted-foreground">
            <span>{t('queue.empty.moreCount')}</span>
          </span>
        </div>

        <a
          href="https://gdl-org.github.io/docs/supportedsites.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <span>{t('queue.empty.viewFullList')}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar: search + batch controls */}
      <div className="mb-2 space-y-2 rounded-lg bg-background/80 px-1 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('browser.searchPlaceholder')}
              className={cn(
                'w-full h-8 ps-8 pe-8 rounded-lg border border-border bg-muted/40 text-xs',
                'placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40',
              )}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
                title={t('urlInput.clearInput')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs flex-shrink-0"
            onClick={toggleSelectAll}
            disabled={filtered.length === 0}
          >
            <span
              className={cn(
                'w-3.5 h-3.5 rounded border flex items-center justify-center',
                allFilteredSelected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/50',
              )}
            >
              {allFilteredSelected && <Check className="w-2.5 h-2.5" />}
            </span>
            {allFilteredSelected ? t('browser.selectNone') : t('browser.selectAll')}
          </Button>

          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs flex-shrink-0"
              onClick={deleteSelected}
              disabled={isDownloading}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('browser.deleteSelected')}
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {selectedIds.size}
              </Badge>
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t('queue.title')}</span>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {completedCount}/{totalCount}
            </Badge>
            {pendingCount > 0 && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {t('queue.pending', { count: pendingCount })}
              </Badge>
            )}
            {hasCompleted && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                {completionRate}%
              </Badge>
            )}
          </div>
          {hasCompleted && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                clearSelection();
                onClearCompleted();
              }}
              disabled={isDownloading}
            >
              <CheckCircle2 className="w-3 h-3" />
              {t('queue.clearCompleted', { count: completedCount })}
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 -mx-1 px-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">{t('browser.noResults')}</p>
            <p className="text-xs text-muted-foreground">{t('browser.noResultsHint')}</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 pb-2">
            {filtered.map((item) => (
              <GalleryGridCard
                key={item.id}
                item={item}
                isFocused={focusedItemId === item.id}
                disabled={isDownloading}
                selected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface GalleryGridCardProps {
  item: DownloadItem;
  isFocused?: boolean;
  disabled?: boolean;
  selected?: boolean;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
}

function GalleryGridCard({
  item,
  isFocused = false,
  disabled,
  selected = false,
  onToggleSelect,
  onRemove,
}: GalleryGridCardProps) {
  const { t } = useTranslation('gallery');
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isActive = item.status === 'downloading' || item.status === 'fetching';
  const isCompleted = item.status === 'completed';
  const isError = item.status === 'error';
  const isPending = item.status === 'pending';

  // Lazy reveal: fade the card in when it scrolls into view
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      el.classList.add('gallery-card-visible');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            el.classList.add('gallery-card-visible');
            observer.disconnect();
          }
        });
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleOpenFolder = async () => {
    if (!item.completedFilepath) return;
    try {
      await openFileLocation(item.completedFilepath);
    } catch (error) {
      console.error('Failed to open gallery output folder:', error);
    }
  };

  const size = formatBytes(item.completedFilesize ?? item.filesize);
  const filename = fileNameOf(item);
  const hasThumbnail = Boolean(item.thumbnail);
  const statusLabel = isCompleted
    ? t('queue.status.completed')
    : isError
      ? t('queue.status.failed')
      : isActive
        ? t('queue.status.downloading')
        : t('queue.status.pending');

  return (
    <div
      ref={cardRef}
      data-queue-item-id={item.id}
      className={cn(
        'gallery-card relative mb-3 break-inside-avoid rounded-xl border bg-card/60 overflow-hidden',
        'transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
        isFocused && 'border-primary/40 ring-1 ring-primary/20',
        selected && 'border-primary/50 ring-1 ring-primary/30',
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted group">
        {hasThumbnail ? (
          <img
            src={thumbnailSrc(item)}
            alt={item.title || filename}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted/40">
            <span className="text-2xl font-bold text-foreground/15 select-none">
              {siteInitial(item)}
            </span>
          </div>
        )}

        {/* File count (from probe) */}
        {item.fileCount ? (
          <span className="absolute bottom-2 start-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 text-[10px] font-medium text-white backdrop-blur-sm">
            <Images className="w-2.5 h-2.5" />
            {t('queue.countFiles', { count: item.fileCount })}
          </span>
        ) : null}

        {/* Status chip */}
        <span
          className={cn(
            'absolute top-2 end-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm',
            isPending && 'bg-muted/80 text-muted-foreground',
            isActive && 'bg-primary/80 text-primary-foreground',
            isCompleted && 'bg-emerald-500/80 text-white',
            isError && 'bg-red-500/80 text-white',
          )}
        >
          {isPending && <Clock className="w-2.5 h-2.5" />}
          {isActive && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
          {isCompleted && <CheckCircle2 className="w-2.5 h-2.5" />}
          {isError && <XCircle className="w-2.5 h-2.5" />}
          {statusLabel}
        </span>

        {/* Selection checkbox */}
        <button
          type="button"
          onClick={() => onToggleSelect(item.id)}
          disabled={disabled}
          title={t('browser.selectItem')}
          aria-pressed={selected}
          className={cn(
            'absolute top-2 start-2 p-1 rounded-md transition-all',
            selected
              ? 'bg-primary text-primary-foreground'
              : 'bg-black/40 text-white/80 hover:bg-black/60',
            'opacity-0 group-hover:opacity-100 focus:opacity-100',
            selected && 'opacity-100',
          )}
        >
          {selected ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <span className="block w-3.5 h-3.5 rounded-sm border border-white/50" />
          )}
        </button>

        {/* Remove (per-item history delete) */}
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          disabled={disabled}
          title={t('queue.remove')}
          className={cn(
            'absolute top-2 start-9 p-1 rounded-full transition-all',
            'bg-black/40 hover:bg-red-500/80 text-white/70 hover:text-white',
            'opacity-0 group-hover:opacity-100 focus:opacity-100',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Hover reveal: filename + size */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0',
            'transition-transform duration-200 ease-out',
            'px-2.5 pt-6 pb-2 bg-gradient-to-t from-black/85 via-black/60 to-transparent',
          )}
        >
          <p className="text-[11px] font-medium text-white truncate" title={filename}>
            {filename}
          </p>
          {size && <p className="text-[10px] text-white/70 mt-0.5">{size}</p>}
        </div>

        {/* Indeterminate activity overlay for active items */}
        {isActive && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-black/40">
            <div className="gallery-progress-indeterminate h-full bg-primary" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-2.5 space-y-1.5">
        <p className="text-xs font-medium leading-snug line-clamp-2" title={item.title}>
          {item.title}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.extractor && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
              <Globe className="w-2.5 h-2.5" />
              {item.extractor}
            </span>
          )}
          {isCompleted && item.completedFilepath && (
            <button
              type="button"
              onClick={() => void handleOpenFolder()}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-dashed border-blue-500/30 text-blue-600 dark:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/10 transition-colors font-medium"
            >
              <FolderOpen className="w-2.5 h-2.5" />
              {t('queue.openFolder')}
            </button>
          )}
          {isError && item.error && (
            <span className="text-[10px] text-red-500/80 line-clamp-1 w-full" title={item.error}>
              {item.error}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
