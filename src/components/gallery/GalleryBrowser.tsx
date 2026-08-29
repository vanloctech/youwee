import { invoke } from '@tauri-apps/api/core';
import {
  FolderOpen,
  Images,
  Loader2,
  RefreshCw,
  Search,
  SearchX,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { toAssetUrl } from '@/lib/asset-access';
import { openFileLocation } from '@/lib/open-file-location';
import type { DownloadItem, GalleryLibraryItem } from '@/lib/types';
import { cn } from '@/lib/utils';

interface GalleryBrowserProps {
  /** Gallery queue items: drives auto-refresh + the "downloading" indicator. */
  queueItems: DownloadItem[];
  onGoToQueue: () => void;
  onAddUrls: (text: string) => void;
}

interface DiscoverSite {
  id: string;
  label: string;
  buildUrl: ((keyword: string) => string) | null;
}

const DISCOVER_SITES: DiscoverSite[] = [
  {
    id: 'pixiv',
    label: 'Pixiv',
    buildUrl: (kw) => `https://www.pixiv.net/tags/${encodeURIComponent(kw)}/artworks`,
  },
  {
    id: 'danbooru',
    label: 'Danbooru',
    buildUrl: (kw) => `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(kw)}`,
  },
  {
    id: 'gelbooru',
    label: 'Gelbooru',
    buildUrl: (kw) =>
      `https://gelbooru.com/index.php?page=post&s=list&tags=${encodeURIComponent(kw)}`,
  },
  {
    id: 'nhentai',
    label: 'nhentai',
    buildUrl: (kw) => `https://nhentai.net/search/?q=${encodeURIComponent(kw)}`,
  },
  {
    id: 'mangadex',
    label: 'MangaDex',
    buildUrl: (kw) => `https://mangadex.org/search?q=${encodeURIComponent(kw)}`,
  },
  {
    id: 'asura',
    label: 'AsuraScans',
    buildUrl: (kw) => `https://www.asurascans.com/?s=${encodeURIComponent(kw)}`,
  },
  { id: 'generic', label: 'Paste URL…', buildUrl: null },
];

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

function siteInitial(item: GalleryLibraryItem): string {
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, '');
    return host.charAt(0).toUpperCase();
  } catch {
    return (item.source || '?').charAt(0).toUpperCase();
  }
}

// Module-level cache so repeated renders don't regenerate thumbnails.
const coverUrlCache = new Map<string, Promise<string | null>>();

function useCoverUrl(coverPath: string | undefined, enabled: boolean) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !coverPath) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    if (!coverUrlCache.has(coverPath)) {
      coverUrlCache.set(
        coverPath,
        (async () => {
          try {
            const thumb = await invoke<string>('get_gallery_thumbnail', { filepath: coverPath });
            return await toAssetUrl(thumb);
          } catch {
            try {
              return await toAssetUrl(coverPath);
            } catch {
              return null;
            }
          }
        })(),
      );
    }
    void coverUrlCache.get(coverPath)!.then((resolved) => {
      if (cancelled) return;
      if (resolved) setUrl(resolved);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [coverPath, enabled]);

  return { url, failed };
}

export function GalleryBrowser({ queueItems, onGoToQueue, onAddUrls }: GalleryBrowserProps) {
  const { t, i18n } = useTranslation('gallery');
  const toast = useToast();

  const [items, setItems] = useState<GalleryLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const requestRef = useRef(0);

  const [discoverSite, setDiscoverSite] = useState('pixiv');
  const [discoverKeyword, setDiscoverKeyword] = useState('');
  const [discoverUrl, setDiscoverUrl] = useState('');

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const result = await invoke<GalleryLibraryItem[]>('list_gallery_items');
      if (requestId === requestRef.current) {
        setItems(result);
        setError(null);
        setSelected(new Set());
      }
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(String(err));
      }
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-refresh shortly after the queue changes (new gallery finished).
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 900);
    return () => window.clearTimeout(timer);
  }, [queueItems, refresh]);

  const activeDownloads = useMemo(
    () => queueItems.filter((i) => i.status === 'downloading' || i.status === 'fetching'),
    [queueItems],
  );
  const activePercent = useMemo(() => {
    if (activeDownloads.length === 0) return 0;
    const total = activeDownloads.reduce(
      (sum, i) => sum + Math.min(100, Math.max(0, i.progress || 0)),
      0,
    );
    return Math.round(total / activeDownloads.length);
  }, [activeDownloads]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) => {
      const title = (item.title ?? '').toLowerCase();
      const source = (item.source ?? '').toLowerCase();
      const folder = item.folder_name.toLowerCase();
      return title.includes(keyword) || source.includes(keyword) || folder.includes(keyword);
    });
  }, [items, query]);

  const toggleItem = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(filtered.map((item) => item.id)));
  }, [filtered]);

  const selectNone = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleDelete = useCallback(async () => {
    if (selected.size === 0 || deleting) return;
    setDeleting(true);
    try {
      for (const id of selected) {
        await invoke('delete_history', { id, deleteFile: false });
      }
      const count = selected.size;
      setSelected(new Set());
      setConfirmingDelete(false);
      await refresh();
      toast.success({ title: t('browser.deleteTitle'), message: t('browser.deleted', { count }) });
    } catch (err) {
      toast.error({ title: t('browser.deleteTitle'), message: String(err) });
    } finally {
      setDeleting(false);
    }
  }, [selected, deleting, refresh, t, toast]);

  const handleDiscover = useCallback(() => {
    const site = DISCOVER_SITES.find((s) => s.id === discoverSite);
    let url = '';
    if (site?.buildUrl) {
      const keyword = discoverKeyword.trim();
      if (!keyword) {
        toast.error({ title: t('browser.discoverTitle'), message: t('browser.discoverEmpty') });
        return;
      }
      url = site.buildUrl(keyword);
    } else {
      url = discoverUrl.trim();
      if (!url) {
        toast.error({ title: t('browser.discoverTitle'), message: t('browser.discoverEmpty') });
        return;
      }
    }
    onAddUrls(url);
    toast.success({ title: t('browser.discoverAdded'), message: url });
  }, [discoverSite, discoverKeyword, discoverUrl, onAddUrls, t, toast]);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language],
  );

  const hasItems = items.length > 0;
  const nothingMatches = hasItems && filtered.length === 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 space-y-3 p-4 sm:p-6">
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('browser.searchPlaceholder')}
              className="h-9 ps-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => void refresh()}
            disabled={loading}
            title={t('browser.refresh')}
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        {/* Downloading indicator */}
        {activeDownloads.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-xs font-medium">
              {t('browser.downloading', { count: activeDownloads.length, percent: activePercent })}
            </span>
            <div className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${activePercent}%` }}
              />
            </div>
            <Button variant="ghost" size="sm" className="h-7 ms-auto" onClick={onGoToQueue}>
              {t('browser.viewQueue')}
            </Button>
          </div>
        )}

        {/* Selection bar */}
        {hasItems && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8" onClick={selectAll}>
              {t('browser.selectAll')}
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={selectNone}>
              {t('browser.selectNone')}
            </Button>
            <span className="mx-1 text-xs text-muted-foreground">
              {t('browser.selectedCount', { count: selected.size })}
            </span>
            <div className="flex-1" />
            {!confirmingDelete ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-red-600 dark:text-red-400"
                onClick={() => setConfirmingDelete(true)}
                disabled={selected.size === 0}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('browser.deleteSelected')}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5">
                <span className="text-xs text-red-600 dark:text-red-400">
                  {t('browser.deleteConfirm', { count: selected.size })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  {t('browser.cancel')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-red-600 dark:text-red-400"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                >
                  {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t('browser.delete')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Discover: search new galleries by keyword */}
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-medium">{t('browser.discoverTitle')}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t('browser.discoverHint')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={discoverSite}
              onChange={(e) => setDiscoverSite(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {DISCOVER_SITES.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.label}
                </option>
              ))}
            </select>
            {discoverSite === 'generic' ? (
              <Input
                value={discoverUrl}
                onChange={(e) => setDiscoverUrl(e.target.value)}
                placeholder={t('browser.discoverGeneric')}
                className="h-9 flex-1 min-w-[200px] text-xs"
              />
            ) : (
              <Input
                value={discoverKeyword}
                onChange={(e) => setDiscoverKeyword(e.target.value)}
                placeholder={t('browser.discoverKeyword')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDiscover();
                }}
                className="h-9 flex-1 min-w-[200px] text-xs"
              />
            )}
            <Button size="sm" className="h-9" onClick={handleDiscover}>
              <Search className="h-3.5 w-3.5" />
              {t('browser.discoverSearch')}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loading && items.length === 0 ? (
          <div className="flex h-full min-h-[240px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <SearchX className="h-8 w-8 text-muted-foreground/60" />
            <p className="max-w-md text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-1" onClick={() => void refresh()}>
              {t('browser.refresh')}
            </Button>
          </div>
        ) : !hasItems ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <Images className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t('browser.emptyTitle')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {t('browser.emptyDescription')}
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onGoToQueue}>
              {t('browser.goToQueue')}
            </Button>
          </div>
        ) : nothingMatches ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center">
            <SearchX className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t('browser.noResults')}</p>
            <p className="max-w-sm text-xs text-muted-foreground">{t('browser.noResultsHint')}</p>
          </div>
        ) : (
          <div className="columns-1 gap-3 pb-2 sm:columns-2 lg:columns-3">
            {filtered.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onToggleSelect={toggleItem}
                onOpenFolder={() => void openFileLocation(item.filepath)}
                dateFormatter={dateFormatter}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface LibraryCardProps {
  item: GalleryLibraryItem;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenFolder: () => void;
  dateFormatter: Intl.DateTimeFormat;
}

function LibraryCard({
  item,
  selected,
  onToggleSelect,
  onOpenFolder,
  dateFormatter,
}: LibraryCardProps) {
  const { t } = useTranslation('gallery');
  const { url: coverUrl, failed: coverFailed } = useCoverUrl(item.cover_image, item.file_exists);

  const size = formatBytes(item.file_size);
  const folder = item.folder_name || item.title;
  const source = item.source || 'gallery-dl';
  const date = item.downloaded_at ? dateFormatter.format(new Date(item.downloaded_at)) : '';

  return (
    <div
      className={cn(
        'group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border bg-card/60 transition-all duration-300',
        'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
        selected && 'border-primary/50 ring-1 ring-primary/30',
      )}
    >
      <div className="relative w-full overflow-hidden bg-muted/40">
        {coverUrl ? (
          <img src={coverUrl} alt={item.title} loading="lazy" className="w-full h-auto" />
        ) : (
          <div
            className={cn(
              'flex w-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted/40',
              !coverFailed && 'aspect-[4/3]',
            )}
          >
            <span className="text-3xl font-bold text-foreground/15 select-none">
              {siteInitial(item)}
            </span>
          </div>
        )}

        {/* Selection checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(item.id)}
          aria-label={item.title}
          style={{ accentColor: 'var(--primary)' }}
          className={cn(
            'absolute start-2 top-2 h-4 w-4 cursor-pointer rounded',
            'opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100',
            selected && 'opacity-100',
          )}
        />

        {/* Missing file badge */}
        {!item.file_exists && (
          <span className="absolute end-2 top-2 rounded-md bg-red-500/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {t('browser.fileMissing')}
          </span>
        )}

        {/* Hover reveal: filename + size + open folder */}
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 translate-y-full transition-transform duration-200 ease-out group-hover:translate-y-0',
            'px-2.5 pb-2 pt-6 bg-gradient-to-t from-black/85 via-black/60 to-transparent',
          )}
        >
          <p className="truncate text-[11px] font-medium text-white" title={folder}>
            {folder}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            {size && <span className="text-[10px] text-white/70">{size}</span>}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onOpenFolder();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  onOpenFolder();
                }
              }}
              className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] text-white/80 hover:bg-white/15"
            >
              <FolderOpen className="h-3 w-3" />
              {t('browser.openFolder')}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 text-xs font-medium leading-snug" title={item.title}>
          {item.title}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {source}
          {date ? ` · ${date}` : ''}
        </p>
      </div>
    </div>
  );
}
