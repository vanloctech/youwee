import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Filter,
  Folder,
  Hash,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollectionManagerDialog } from '@/components/history/CollectionManagerDialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useHistory } from '@/contexts/HistoryContext';
import type { HistoryDatePreset, HistoryFilter, HistorySort } from '@/lib/types';
import { cn } from '@/lib/utils';

export function HistoryToolbar() {
  const { t } = useTranslation('pages');
  const {
    filter,
    search,
    loading,
    totalCount,
    setFilter,
    setSearch,
    advancedFilters,
    tags,
    collections,
    setAdvancedFilters,
    clearAdvancedFilters,
    sort,
    setSort,
    refreshHistory,
    clearHistory,
  } = useHistory();

  const [clearing, setClearing] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [collectionsManagerOpen, setCollectionsManagerOpen] = useState(false);

  const filterOptions: { value: HistoryFilter; label: string }[] = [
    { value: 'all', label: t('library.toolbar.filterAll') },
    { value: 'youtube', label: t('library.toolbar.filterYouTube') },
    { value: 'tiktok', label: t('library.toolbar.filterTikTok') },
    { value: 'facebook', label: t('library.toolbar.filterFacebook') },
    { value: 'instagram', label: t('library.toolbar.filterInstagram') },
    { value: 'twitter', label: t('library.toolbar.filterTwitter') },
    { value: 'bilibili', label: t('library.toolbar.filterBilibili') },
    { value: 'data_export', label: t('library.toolbar.filterDataExport') },
    { value: 'other', label: t('library.toolbar.filterOther') },
  ];

  const sortOptions: { value: HistorySort; label: string }[] = [
    { value: 'recent', label: t('library.toolbar.sortRecent') },
    { value: 'oldest', label: t('library.toolbar.sortOldest') },
    { value: 'size', label: t('library.toolbar.sortSize') },
    { value: 'title', label: t('library.toolbar.sortTitle') },
  ];

  const mediaTypeOptions: { value: 'all' | 'video' | 'audio'; label: string }[] = [
    { value: 'all', label: t('library.toolbar.mediaAll') },
    { value: 'video', label: t('library.toolbar.mediaVideo') },
    { value: 'audio', label: t('library.toolbar.mediaAudio') },
  ];

  const datePresetOptions: { value: HistoryDatePreset; label: string }[] = [
    { value: 'all', label: t('library.toolbar.dateAll') },
    { value: 'today', label: t('library.toolbar.dateToday') },
    { value: 'last7days', label: t('library.toolbar.dateLast7Days') },
    { value: 'last30days', label: t('library.toolbar.dateLast30Days') },
    { value: 'custom', label: t('library.toolbar.dateCustom') },
  ];

  const formatOptions = [
    'mp4',
    'mkv',
    'webm',
    'mp3',
    'm4a',
    'opus',
    'csv',
    'xls',
    'txt',
    'html',
    'json',
    'md',
    'xml',
    'yaml',
    'sqlite',
    'doc',
  ];
  const qualityOptions = ['best', 'audio', '8k', '4k', '2k', '1080', '720', '480', '360'];

  const activeAdvancedCount =
    (advancedFilters.mediaType !== 'all' ? 1 : 0) +
    (advancedFilters.datePreset !== 'all' ? 1 : 0) +
    (advancedFilters.formats.length > 0 ? 1 : 0) +
    (advancedFilters.qualities.length > 0 ? 1 : 0) +
    (advancedFilters.tagIds.length > 0 ? 1 : 0) +
    (advancedFilters.collectionIds.length > 0 ? 1 : 0);

  const toggleFormat = useCallback(
    (format: string) => {
      const current = advancedFilters.formats;
      const next = current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format];
      setAdvancedFilters({ formats: next });
    },
    [advancedFilters.formats, setAdvancedFilters],
  );

  const toggleQuality = useCallback(
    (quality: string) => {
      const current = advancedFilters.qualities;
      const next = current.includes(quality)
        ? current.filter((item) => item !== quality)
        : [...current, quality];
      setAdvancedFilters({ qualities: next });
    },
    [advancedFilters.qualities, setAdvancedFilters],
  );

  const toggleTag = useCallback(
    (tagId: string) => {
      const current = advancedFilters.tagIds;
      const next = current.includes(tagId)
        ? current.filter((item) => item !== tagId)
        : [...current, tagId];
      setAdvancedFilters({ tagIds: next, matchMode: 'any' });
    },
    [advancedFilters.tagIds, setAdvancedFilters],
  );

  const toggleCollection = useCallback(
    (collectionId: string) => {
      const current = advancedFilters.collectionIds;
      const next = current.includes(collectionId)
        ? current.filter((item) => item !== collectionId)
        : [...current, collectionId];
      setAdvancedFilters({ collectionIds: next, matchMode: 'any' });
    },
    [advancedFilters.collectionIds, setAdvancedFilters],
  );

  const handleClear = useCallback(async () => {
    if (!confirm(t('library.toolbar.clearConfirm'))) return;
    setClearing(true);
    try {
      await clearHistory();
    } finally {
      setClearing(false);
    }
  }, [clearHistory, t]);

  return (
    <div className="space-y-3">
      {/* Search - styled like URL input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('library.toolbar.searchPlaceholder')}
          className={cn(
            'pl-10 pr-4 h-11 text-sm',
            'bg-background/50 border-border/50',
            'focus:bg-background transition-colors',
            'placeholder:text-muted-foreground/50',
          )}
        />
      </div>

      {/* Filter tabs and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filter tabs */}
        <div className="inline-flex items-center rounded-lg bg-muted/50 p-1">
          {filterOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                filter === option.value
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Select value={sort} onValueChange={(value) => setSort(value as HistorySort)}>
            <SelectTrigger
              className={cn(
                'h-8 w-auto min-w-[98px] max-w-[130px] rounded-lg px-2.5 gap-1.5',
                'bg-background/70 border-border/50 text-xs text-muted-foreground hover:text-foreground',
                '[&>span]:truncate',
              )}
            >
              <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            type="button"
            onClick={() => setAdvancedOpen((prev) => !prev)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-muted/50 hover:bg-muted transition-colors',
              'text-muted-foreground hover:text-foreground',
            )}
          >
            <Filter className="w-4 h-4" />
            {t('library.toolbar.advancedFilters')}
            {activeAdvancedCount > 0 && (
              <span className="px-1.5 py-0 rounded bg-primary/15 text-primary text-[10px]">
                {activeAdvancedCount}
              </span>
            )}
            {advancedOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            type="button"
            onClick={() => setCollectionsManagerOpen(true)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-muted/50 hover:bg-muted transition-colors',
              'text-muted-foreground hover:text-foreground',
            )}
          >
            <Folder className="w-4 h-4" />
            {t('library.collections.manage')}
          </button>

          <button
            type="button"
            onClick={() => refreshHistory()}
            disabled={loading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-muted/50 hover:bg-muted transition-colors',
              'text-muted-foreground hover:text-foreground',
              loading && 'opacity-50',
            )}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t('library.toolbar.refresh')}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={clearing || totalCount === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-red-500/10 hover:bg-red-500/20 transition-colors',
              'text-red-400 hover:text-red-300',
              (clearing || totalCount === 0) && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Trash2 className="w-4 h-4" />
            {t('library.toolbar.clear')}
          </button>
        </div>
      </div>

      {advancedOpen && (
        <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('library.toolbar.mediaType')}
              </p>
              <div className="inline-flex items-center rounded-md bg-muted/50 p-1">
                {mediaTypeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setAdvancedFilters({ mediaType: option.value })}
                    className={cn(
                      'px-2.5 py-1 text-xs rounded-sm transition-all',
                      advancedFilters.mediaType === option.value
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('library.toolbar.dateRange')}
              </p>
              <Select
                value={advancedFilters.datePreset}
                onValueChange={(value) => {
                  const preset = value as HistoryDatePreset;
                  if (preset === 'custom') {
                    setAdvancedFilters({ datePreset: preset });
                  } else {
                    setAdvancedFilters({
                      datePreset: preset,
                      customDateFrom: null,
                      customDateTo: null,
                      downloadedAtFrom: null,
                      downloadedAtTo: null,
                    });
                  }
                }}
              >
                <SelectTrigger className="h-8 bg-background/70 border-border/50 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {datePresetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {advancedFilters.datePreset === 'custom' && (
            <div className="grid gap-3 md:grid-cols-2">
              <label htmlFor="history-date-from" className="space-y-1.5">
                <span className="text-xs text-muted-foreground">
                  {t('library.toolbar.dateFrom')}
                </span>
                <Input
                  id="history-date-from"
                  type="date"
                  value={advancedFilters.customDateFrom || ''}
                  onChange={(e) => setAdvancedFilters({ customDateFrom: e.target.value || null })}
                  className="h-8 bg-background/70 border-border/50 text-xs"
                />
              </label>
              <label htmlFor="history-date-to" className="space-y-1.5">
                <span className="text-xs text-muted-foreground">{t('library.toolbar.dateTo')}</span>
                <Input
                  id="history-date-to"
                  type="date"
                  value={advancedFilters.customDateTo || ''}
                  onChange={(e) => setAdvancedFilters({ customDateTo: e.target.value || null })}
                  className="h-8 bg-background/70 border-border/50 text-xs"
                />
              </label>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('library.toolbar.formats')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {formatOptions.map((format) => (
                  <button
                    type="button"
                    key={format}
                    onClick={() => toggleFormat(format)}
                    className={cn(
                      'px-2 py-1 rounded-md text-xs border transition-colors uppercase',
                      advancedFilters.formats.includes(format)
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-background/60 border-border/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('library.toolbar.qualities')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {qualityOptions.map((quality) => (
                  <button
                    type="button"
                    key={quality}
                    onClick={() => toggleQuality(quality)}
                    className={cn(
                      'px-2 py-1 rounded-md text-xs border transition-colors uppercase',
                      advancedFilters.qualities.includes(quality)
                        ? 'bg-primary/10 border-primary/40 text-primary'
                        : 'bg-background/60 border-border/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {quality}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('library.tagging.tags')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t('library.tagging.noTagsYet')}
                  </span>
                ) : (
                  tags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
                        advancedFilters.tagIds.includes(tag.id)
                          ? 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400'
                          : 'bg-background/60 border-border/50 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Hash className="w-3 h-3" />
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t('library.collections.title')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {collections.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t('library.collections.empty')}
                  </span>
                ) : (
                  collections.map((collection) => (
                    <button
                      type="button"
                      key={collection.id}
                      onClick={() => toggleCollection(collection.id)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors',
                        advancedFilters.collectionIds.includes(collection.id)
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                          : 'bg-background/60 border-border/50 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full bg-amber-500/80"
                        style={collection.color ? { backgroundColor: collection.color } : undefined}
                      />
                      {collection.name}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {t('library.toolbar.activeFilters', { count: activeAdvancedCount })}
            </span>
            <button
              type="button"
              onClick={clearAdvancedFilters}
              className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
              disabled={activeAdvancedCount === 0}
            >
              {t('library.toolbar.clearFilters')}
            </button>
          </div>
        </div>
      )}

      <CollectionManagerDialog
        open={collectionsManagerOpen}
        onOpenChange={setCollectionsManagerOpen}
      />
    </div>
  );
}
