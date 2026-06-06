import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CheckSquare,
  Filter,
  ListPlus,
  Loader2,
  Plus,
  Search,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { extractBackendError, localizeBackendError } from '@/lib/backend-error';
import type {
  YoutubeSearchDurationFilter,
  YoutubeSearchFeatureFilter,
  YoutubeSearchFilters,
  YoutubeSearchQueueResult,
  YoutubeSearchResponse,
  YoutubeSearchSortFilter,
  YoutubeSearchUploadDateFilter,
  YoutubeSearchVideo,
} from '@/lib/types';
import { cn } from '@/lib/utils';

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const STORAGE_KEY = 'youwee-youtube-keyword-search-state';
const DEFAULT_FILTERS: YoutubeSearchFilters = {
  uploadDate: null,
  duration: null,
  sort: 'relevance',
  features: [],
};

interface YoutubeKeywordSearchProps {
  disabled?: boolean;
  onAddResults: (results: YoutubeSearchVideo[]) => Promise<YoutubeSearchQueueResult>;
  queuedVideoIds: Set<string>;
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.round(value)));
}

function mergeVideos(
  current: YoutubeSearchVideo[],
  incoming: YoutubeSearchVideo[],
): YoutubeSearchVideo[] {
  const seen = new Set(current.map((video) => video.id));
  const merged = [...current];
  for (const video of incoming) {
    if (seen.has(video.id)) continue;
    seen.add(video.id);
    merged.push(video);
  }
  return merged;
}

interface StoredYoutubeKeywordSearchState {
  query?: string;
  limit?: number;
  filters?: Partial<YoutubeSearchFilters>;
  videos?: YoutubeSearchVideo[];
  selectedIds?: string[];
  continuation?: string | null;
}

interface SelectOption<T extends string> {
  value: T;
  labelKey: string;
}

const UPLOAD_DATE_OPTIONS: SelectOption<YoutubeSearchUploadDateFilter>[] = [
  { value: 'today', labelKey: 'today' },
  { value: 'thisWeek', labelKey: 'thisWeek' },
  { value: 'thisMonth', labelKey: 'thisMonth' },
  { value: 'thisYear', labelKey: 'thisYear' },
];

const DURATION_OPTIONS: SelectOption<YoutubeSearchDurationFilter>[] = [
  { value: 'short', labelKey: 'short' },
  { value: 'medium', labelKey: 'medium' },
  { value: 'long', labelKey: 'long' },
];

const SORT_OPTIONS: SelectOption<YoutubeSearchSortFilter>[] = [
  { value: 'relevance', labelKey: 'relevance' },
  { value: 'viewCount', labelKey: 'viewCount' },
];

const FEATURE_OPTIONS: SelectOption<YoutubeSearchFeatureFilter>[] = [
  { value: 'live', labelKey: 'live' },
  { value: 'fourK', labelKey: 'fourK' },
  { value: 'hd', labelKey: 'hd' },
  { value: 'subtitles', labelKey: 'subtitles' },
  { value: 'creativeCommons', labelKey: 'creativeCommons' },
  { value: 'threeSixty', labelKey: 'threeSixty' },
  { value: 'vr180', labelKey: 'vr180' },
  { value: 'threeD', labelKey: 'threeD' },
  { value: 'hdr', labelKey: 'hdr' },
];

function normalizeFilters(filters?: Partial<YoutubeSearchFilters>): YoutubeSearchFilters {
  return {
    uploadDate: filters?.uploadDate || null,
    duration: filters?.duration || null,
    sort: filters?.sort === 'viewCount' ? 'viewCount' : DEFAULT_FILTERS.sort,
    features: Array.isArray(filters?.features) ? filters.features : [],
  };
}

function countActiveFilters(filters: YoutubeSearchFilters): number {
  return (
    (filters.uploadDate ? 1 : 0) +
    (filters.duration ? 1 : 0) +
    (filters.sort && filters.sort !== 'relevance' ? 1 : 0) +
    filters.features.length
  );
}

function loadStoredState(): StoredYoutubeKeywordSearchState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredYoutubeKeywordSearchState;
    return {
      query: typeof parsed.query === 'string' ? parsed.query : '',
      limit: clampLimit(Number(parsed.limit)),
      filters: normalizeFilters(parsed.filters),
      videos: Array.isArray(parsed.videos) ? parsed.videos : [],
      selectedIds: Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [],
      continuation: typeof parsed.continuation === 'string' ? parsed.continuation : null,
    };
  } catch {
    return {};
  }
}

function SearchResultGridItem({
  video,
  selected,
  isAdded,
  onToggle,
  disabled,
}: {
  video: YoutubeSearchVideo;
  selected: boolean;
  isAdded: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const { t } = useTranslation('download');

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || isAdded}
      className={cn(
        'group relative flex flex-col text-left transition-all duration-300 rounded-xl focus:outline-none',
        isAdded ? 'cursor-not-allowed opacity-70 grayscale-[0.4]' : 'cursor-pointer',
      )}
    >
      {/* Thumbnail Area */}
      <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            className={cn(
              'w-full h-full object-cover transition-transform duration-500',
              !isAdded && 'group-hover:scale-105',
            )}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <Video className="w-8 h-8" />
          </div>
        )}

        {/* Selected Border & Tint Overlay */}
        {selected && !isAdded && (
          <div className="absolute inset-0 rounded-xl ring-2 ring-inset ring-primary bg-primary/10 z-10 pointer-events-none transition-all duration-300" />
        )}

        {/* Checkbox Icon (Hover & Selected) */}
        {!isAdded && (
          <div
            className={cn(
              'absolute top-2 left-2 z-20 transition-opacity duration-200',
              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            {selected ? (
              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md ring-2 ring-background">
                <Check className="w-4 h-4 stroke-[3]" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full border-2 border-white/80 bg-black/20 backdrop-blur-sm flex items-center justify-center shadow-sm transition-colors hover:bg-black/40" />
            )}
          </div>
        )}

        {/* Subtle top gradient for hover checkbox visibility */}
        {!isAdded && !selected && (
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />
        )}

        {/* Added Overlay */}
        {isAdded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="absolute inset-0 bg-background/20 backdrop-blur-[1px]" />
            <div className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/90 backdrop-blur-md border border-border shadow-sm text-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold">{t('urlInput.keyword.added')}</span>
            </div>
          </div>
        )}

        {/* Duration */}
        {video.duration && !isAdded && (
          <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded text-[12px] font-medium text-white bg-black/80 tracking-wide backdrop-blur-md">
            {video.duration}
          </span>
        )}
      </div>

      {/* Info Area */}
      <div className="flex gap-3 items-start mt-3 px-1">
        <div className="flex-1 min-w-0 flex flex-col">
          <p
            className="text-sm font-medium leading-tight line-clamp-2 text-foreground"
            title={video.title}
          >
            {video.title}
          </p>
          <div className="mt-1 flex flex-col gap-0.5 text-[13px] text-muted-foreground/80">
            {video.channel && (
              <span className="truncate hover:text-foreground transition-colors">
                {video.channel}
              </span>
            )}
            <div className="flex items-center gap-1.5 truncate">
              {video.viewCountText && <span>{video.viewCountText}</span>}
              {video.viewCountText && video.publishedTimeText && <span>•</span>}
              {video.publishedTimeText && <span>{video.publishedTimeText}</span>}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export function YoutubeKeywordSearch({
  disabled,
  onAddResults,
  queuedVideoIds,
}: YoutubeKeywordSearchProps) {
  const { t } = useTranslation('download');
  const [storedState] = useState(loadStoredState);
  const [query, setQuery] = useState(storedState.query || '');
  const [limit, setLimit] = useState(clampLimit(storedState.limit || DEFAULT_LIMIT));
  const [filters, setFilters] = useState<YoutubeSearchFilters>(() =>
    normalizeFilters(storedState.filters),
  );
  const [videos, setVideos] = useState<YoutubeSearchVideo[]>(storedState.videos || []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(storedState.selectedIds || []),
  );
  const [continuation, setContinuation] = useState<string | null>(storedState.continuation || null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedVideos = useMemo(
    () => videos.filter((video) => selectedIds.has(video.id) && !queuedVideoIds.has(video.id)),
    [queuedVideoIds, selectedIds, videos],
  );

  useEffect(() => {
    try {
      const state: StoredYoutubeKeywordSearchState = {
        query,
        limit,
        filters,
        videos,
        selectedIds: Array.from(selectedIds),
        continuation,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage failures
    }
  }, [continuation, filters, limit, query, selectedIds, videos]);

  const updateFilters = useCallback(
    (updater: (current: YoutubeSearchFilters) => YoutubeSearchFilters) => {
      setFilters((current) => updater(current));
      setContinuation(null);
    },
    [],
  );

  const activeFilterCount = countActiveFilters(filters);

  const runSearch = useCallback(
    async (nextContinuation?: string | null) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) return;

      const loadingMore = Boolean(nextContinuation);
      if (loadingMore) {
        setIsLoadingMore(true);
      } else {
        setIsSearching(true);
        setVideos([]);
        setSelectedIds(new Set());
        setContinuation(null);
      }
      setError(null);

      try {
        const response = await invoke<YoutubeSearchResponse>('search_youtube_videos', {
          query: trimmedQuery,
          limit: clampLimit(limit),
          filters,
          continuation: nextContinuation || null,
        });

        setVideos((current) =>
          loadingMore ? mergeVideos(current, response.videos) : response.videos,
        );
        setContinuation(response.continuation || null);
      } catch (searchError) {
        const payload = extractBackendError(searchError);
        setError(localizeBackendError(payload));
      } finally {
        setIsSearching(false);
        setIsLoadingMore(false);
      }
    },
    [filters, limit, query],
  );

  const toggleSelected = useCallback(
    (id: string) => {
      if (queuedVideoIds.has(id)) return;
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [queuedVideoIds],
  );

  const selectAll = useCallback(() => {
    setSelectedIds(
      new Set(videos.filter((video) => !queuedVideoIds.has(video.id)).map((video) => video.id)),
    );
  }, [queuedVideoIds, videos]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const clearSearchResults = useCallback(() => {
    setVideos([]);
    setSelectedIds(new Set());
    setContinuation(null);
    setError(null);
  }, []);

  const addSelected = useCallback(async () => {
    if (selectedVideos.length === 0) return;
    setIsAdding(true);
    try {
      const result = await onAddResults(selectedVideos);
      if (result.queuedIds.length > 0) {
        setSelectedIds((current) => {
          const next = new Set(current);
          for (const id of result.queuedIds) {
            next.delete(id);
          }
          return next;
        });
      }
    } finally {
      setIsAdding(false);
    }
  }, [onAddResults, selectedVideos]);

  const setUploadDateFilter = useCallback(
    (value: string) => {
      updateFilters((current) => ({
        ...current,
        uploadDate: value === 'any' ? null : (value as YoutubeSearchUploadDateFilter),
      }));
    },
    [updateFilters],
  );

  const setDurationFilter = useCallback(
    (value: string) => {
      updateFilters((current) => ({
        ...current,
        duration: value === 'any' ? null : (value as YoutubeSearchDurationFilter),
      }));
    },
    [updateFilters],
  );

  const setSortFilter = useCallback(
    (value: string) => {
      updateFilters((current) => ({
        ...current,
        sort: value as YoutubeSearchSortFilter,
      }));
    },
    [updateFilters],
  );

  const toggleFeatureFilter = useCallback(
    (feature: YoutubeSearchFeatureFilter) => {
      updateFilters((current) => {
        const enabled = current.features.includes(feature);
        return {
          ...current,
          features: enabled
            ? current.features.filter((item) => item !== feature)
            : [...current.features, feature],
        };
      });
    },
    [updateFilters],
  );

  const clearFilters = useCallback(() => {
    updateFilters(() => ({ ...DEFAULT_FILTERS }));
  }, [updateFilters]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runSearch();
  };

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (!value.trim()) {
        clearSearchResults();
      }
    },
    [clearSearchResults],
  );

  const clearQuery = useCallback(() => {
    setQuery('');
    clearSearchResults();
    searchInputRef.current?.focus();
  }, [clearSearchResults]);

  const hasResults = videos.length > 0;
  const busy = disabled || isSearching || isLoadingMore || isAdding;

  return (
    <div className="flex flex-col h-full bg-background rounded-xl border border-border/50 overflow-hidden shadow-sm relative">
      {/* Search Form */}
      <div className="flex-shrink-0 border-b border-border/50 bg-card/20">
        <div className="p-4 sm:p-6 sm:pb-5">
          {/* Search Form */}
          <form
            onSubmit={handleSubmit}
            className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                disabled={disabled || isSearching}
                placeholder={t('urlInput.keyword.placeholder')}
                className="pl-10 pr-10 h-12 rounded-xl bg-background border-border/60 focus:bg-background text-base sm:text-sm shadow-sm"
              />
              {query ? (
                <button
                  type="button"
                  onClick={clearQuery}
                  disabled={disabled || isSearching}
                  className="absolute right-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  title={t('urlInput.clearInput')}
                  aria-label={t('urlInput.clearInput')}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled || isSearching}
                    className={cn(
                      'h-12 rounded-xl border-border/60 bg-background px-4 shadow-sm',
                      activeFilterCount > 0 && 'border-primary/40 bg-primary/5 text-primary',
                    )}
                  >
                    <Filter className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">{t('urlInput.keyword.filters.title')}</span>
                    {activeFilterCount > 0 && (
                      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(420px,calc(100vw-2rem))] rounded-2xl p-0 shadow-xl"
                >
                  <div className="border-b border-border/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">
                          {t('urlInput.keyword.filters.title')}
                        </h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t('urlInput.keyword.filters.description')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        disabled={activeFilterCount === 0}
                        className="h-8 rounded-lg text-xs"
                      >
                        {t('urlInput.keyword.filters.clear')}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 p-4">
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t('urlInput.keyword.limitLabel')}
                      </div>
                      <Select
                        value={String(limit)}
                        onValueChange={(val) => setLimit(Number(val))}
                        disabled={disabled || isSearching}
                      >
                        <SelectTrigger className="h-9 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t('urlInput.keyword.filters.uploadDate')}
                        </div>
                        <Select
                          value={filters.uploadDate || 'any'}
                          onValueChange={setUploadDateFilter}
                        >
                          <SelectTrigger className="h-9 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">{t('urlInput.keyword.filters.any')}</SelectItem>
                            {UPLOAD_DATE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(`urlInput.keyword.filters.uploadDateOptions.${option.labelKey}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t('urlInput.keyword.filters.duration')}
                        </div>
                        <Select value={filters.duration || 'any'} onValueChange={setDurationFilter}>
                          <SelectTrigger className="h-9 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="any">{t('urlInput.keyword.filters.any')}</SelectItem>
                            {DURATION_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(`urlInput.keyword.filters.durationOptions.${option.labelKey}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-xs font-medium text-muted-foreground">
                          {t('urlInput.keyword.filters.sort')}
                        </div>
                        <Select value={filters.sort || 'relevance'} onValueChange={setSortFilter}>
                          <SelectTrigger className="h-9 rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SORT_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {t(`urlInput.keyword.filters.sortOptions.${option.labelKey}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t('urlInput.keyword.filters.features')}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {FEATURE_OPTIONS.map((option) => {
                          const active = filters.features.includes(option.value);
                          return (
                            <button
                              type="button"
                              key={option.value}
                              onClick={() => toggleFeatureFilter(option.value)}
                              className={cn(
                                'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
                                active
                                  ? 'border-primary/40 bg-primary/10 text-primary'
                                  : 'border-border/70 bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                              )}
                            >
                              {t(`urlInput.keyword.filters.featureOptions.${option.labelKey}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                type="submit"
                disabled={disabled || isSearching || !query.trim()}
                className="h-12 px-6 rounded-xl font-medium shadow-sm transition-all"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 sm:mr-2" />
                )}
                <span className="hidden sm:inline">{t('urlInput.keyword.search')}</span>
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-h-[300px] relative bg-muted/20">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-destructive" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              {t('urlInput.keyword.errorTitle')}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
          </div>
        ) : isSearching ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-muted-foreground">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary/40" />
            <p className="text-sm font-medium animate-pulse">{t('urlInput.keyword.searching')}</p>
          </div>
        ) : !hasResults ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 rounded-3xl bg-background flex items-center justify-center mb-5 border border-border/50 shadow-sm">
              <Video className="w-10 h-10 text-muted-foreground/40" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1.5">
              {t('urlInput.keyword.emptyTitle')}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t('urlInput.keyword.emptyDescription')}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 pb-24 sm:pb-28">
              {videos.map((video) => (
                <SearchResultGridItem
                  key={video.id}
                  video={video}
                  selected={selectedIds.has(video.id)}
                  isAdded={queuedVideoIds.has(video.id)}
                  onToggle={() => toggleSelected(video.id)}
                  disabled={busy}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Action Bar (Floating Pill Style) */}
      {hasResults && (
        <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-fit px-4 pointer-events-none animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-background/80 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/60 border border-border/50 shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-full p-1.5 flex items-center gap-1 sm:gap-2 pointer-events-auto ring-1 ring-white/10 transition-all">
            {/* Selection Status */}
            <div className="hidden sm:flex items-center pl-4 pr-2 py-1.5">
              <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                {t('urlInput.keyword.selectedCount', {
                  selected: selectedVideos.length,
                  total: videos.length,
                })}
              </span>
            </div>

            {/* Mobile Selection Status */}
            <div className="sm:hidden flex items-center pl-3 pr-1 py-1.5">
              <span className="text-sm font-bold text-foreground whitespace-nowrap">
                {selectedVideos.length}/{videos.length}
              </span>
            </div>

            <div className="w-px h-5 bg-border/60 mx-1" />

            {/* Controls */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={selectAll}
                disabled={busy || videos.every((v) => queuedVideoIds.has(v.id))}
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
                title={t('urlInput.keyword.selectAll')}
              >
                <CheckSquare className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearSelection}
                disabled={busy || selectedVideos.length === 0}
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title={t('urlInput.keyword.clearSelection')}
              >
                <X className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearSearchResults}
                disabled={busy}
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title={t('urlInput.keyword.clearResults')}
                aria-label={t('urlInput.keyword.clearResults')}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="w-px h-5 bg-border/60 mx-1" />

            {/* Load More & Add */}
            <div className="flex items-center gap-1.5 pr-0.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void runSearch(continuation)}
                disabled={busy || !continuation}
                className="h-9 px-4 rounded-full text-sm font-medium bg-secondary/60 hover:bg-secondary/80 transition-colors"
              >
                {isLoadingMore ? (
                  <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" />
                ) : (
                  <ListPlus className="w-4 h-4 sm:mr-1.5" />
                )}
                <span className="hidden sm:inline">{t('urlInput.keyword.loadMore')}</span>
              </Button>
              <Button
                type="button"
                onClick={() => void addSelected()}
                disabled={busy || selectedVideos.length === 0}
                className="h-9 px-5 rounded-full text-sm font-semibold shadow-md bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
              >
                {isAdding ? (
                  <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 sm:mr-1.5" />
                )}
                <span className="hidden sm:inline">{t('urlInput.keyword.addSelected')}</span>
                <span className="sm:hidden">{t('urlInput.keyword.addSelected').split(' ')[0]}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
