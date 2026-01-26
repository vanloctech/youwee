import { RefreshCw, Search, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useHistory } from '@/contexts/HistoryContext';
import type { HistoryFilter } from '@/lib/types';
import { cn } from '@/lib/utils';

const filterOptions: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'Twitter' },
  { value: 'other', label: 'Other' },
];

export function HistoryToolbar() {
  const {
    filter,
    search,
    loading,
    totalCount,
    setFilter,
    setSearch,
    refreshHistory,
    clearHistory,
  } = useHistory();

  const [clearing, setClearing] = useState(false);

  const handleClear = useCallback(async () => {
    if (!confirm('Are you sure you want to clear all download history?')) return;
    setClearing(true);
    try {
      await clearHistory();
    } finally {
      setClearing(false);
    }
  }, [clearHistory]);

  return (
    <div className="space-y-3">
      {/* Search - styled like URL input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search downloads..."
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
            Refresh
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
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
