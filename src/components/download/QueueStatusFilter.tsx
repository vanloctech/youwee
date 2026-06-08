import { ListFilter } from 'lucide-react';
import type { DownloadItem } from '@/lib/types';
import { cn } from '@/lib/utils';

export type QueueStatusFilterValue =
  | 'all'
  | 'pending'
  | 'active'
  | 'completed'
  | 'error'
  | 'skipped';

interface QueueStatusFilterLabels {
  all: string;
  pending: string;
  active: string;
  completed: string;
  error: string;
  skipped: string;
}

interface QueueStatusFilterProps {
  value: QueueStatusFilterValue;
  counts: QueueStatusCounts;
  labels: QueueStatusFilterLabels;
  onChange: (value: QueueStatusFilterValue) => void;
}

interface QueueStatusEmptyStateProps {
  title: string;
  actionLabel: string;
  onShowAll: () => void;
}

export type QueueStatusCounts = Record<QueueStatusFilterValue, number> & {
  clearable: number;
};

const FILTERS: QueueStatusFilterValue[] = [
  'all',
  'pending',
  'active',
  'completed',
  'error',
  'skipped',
];

function matchesFilter(item: DownloadItem, filter: QueueStatusFilterValue): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return item.status === 'fetching' || item.status === 'downloading';
  return item.status === filter;
}

export function filterQueueItems(
  items: DownloadItem[],
  filter: QueueStatusFilterValue,
): DownloadItem[] {
  if (filter === 'all') return items;
  return items.filter((item) => matchesFilter(item, filter));
}

export function getQueueStatusCounts(items: DownloadItem[]): QueueStatusCounts {
  const counts: QueueStatusCounts = {
    all: items.length,
    pending: 0,
    active: 0,
    completed: 0,
    error: 0,
    skipped: 0,
    clearable: 0,
  };

  for (const item of items) {
    if (item.status === 'pending') counts.pending += 1;
    if (item.status === 'fetching' || item.status === 'downloading') counts.active += 1;
    if (item.status === 'completed') {
      counts.completed += 1;
      counts.clearable += 1;
    }
    if (item.status === 'error') counts.error += 1;
    if (item.status === 'skipped') {
      counts.skipped += 1;
      counts.clearable += 1;
    }
  }

  return counts;
}

export function QueueStatusFilter({ value, counts, labels, onChange }: QueueStatusFilterProps) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex w-max items-center gap-0.5 rounded-lg bg-muted/50 p-1">
        {FILTERS.map((filter) => {
          const active = value === filter;
          const count = counts[filter];

          return (
            <button
              key={filter}
              type="button"
              onClick={() => onChange(filter)}
              className={cn(
                'group flex h-7 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all',
                active
                  ? 'bg-background text-foreground shadow-sm ring-1 ring-border/50'
                  : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground',
              )}
            >
              <span className="leading-none">{labels[filter]}</span>
              <span
                className={cn(
                  'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 tabular-nums text-[10px] font-bold leading-none transition-all duration-200',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted-foreground/15 text-muted-foreground group-hover:bg-muted-foreground/25 group-hover:text-foreground',
                  count === 0 && 'opacity-50 font-medium',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function QueueStatusEmptyState({
  title,
  actionLabel,
  onShowAll,
}: QueueStatusEmptyStateProps) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <ListFilter className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <button
        type="button"
        onClick={onShowAll}
        className="mt-3 inline-flex h-8 items-center rounded-full bg-primary/10 px-4 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 hover:text-primary"
      >
        {actionLabel}
      </button>
    </div>
  );
}
