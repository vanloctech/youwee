import { Trash2, Youtube } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScheduleConfig } from '@/hooks/useSchedule';
import type { DownloadItem } from '@/lib/types';
import { QueueItem } from './QueueItem';
import {
  filterQueueItems,
  getQueueStatusCounts,
  QueueStatusEmptyState,
  QueueStatusFilter,
  type QueueStatusFilterValue,
} from './QueueStatusFilter';

interface QueueListProps {
  items: DownloadItem[];
  focusedItemId?: string | null;
  isDownloading: boolean;
  showPlaylistBadge?: boolean;
  currentPlaylistInfo?: {
    index: number;
    total: number;
    title: string;
  } | null;
  onRemove: (id: string) => void;
  onUpdateTimeRange: (id: string, start?: string, end?: string) => void;
  onSelectOutputFolder: (id: string) => Promise<void>;
  onRename: (id: string, newName: string) => Promise<void>;
  onClearCompleted: () => void;
  onScheduleUpcomingLive?: (config: ScheduleConfig) => void;
}

export function QueueList({
  items,
  focusedItemId,
  isDownloading,
  showPlaylistBadge,
  currentPlaylistInfo,
  onRemove,
  onUpdateTimeRange,
  onSelectOutputFolder,
  onRename,
  onClearCompleted,
  onScheduleUpcomingLive,
}: QueueListProps) {
  const { t } = useTranslation('download');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilterValue>('all');
  const statusCounts = useMemo(() => getQueueStatusCounts(items), [items]);
  const totalCount = items.length;
  const filteredItems = useMemo(() => filterQueueItems(items, statusFilter), [items, statusFilter]);

  useEffect(() => {
    if (!focusedItemId || !containerRef.current) return;
    const target = containerRef.current.querySelector<HTMLElement>(
      `[data-queue-item-id="${focusedItemId}"]`,
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [focusedItemId]);

  useEffect(() => {
    if (items.length === 0 && statusFilter !== 'all') {
      setStatusFilter('all');
    }
  }, [items.length, statusFilter]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      {totalCount > 0 && (
        <div className="sticky top-0 z-10 mb-2 space-y-1.5 rounded-lg bg-background/85 py-1.5 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-sm font-medium">{t('queue.title')}</h2>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {statusCounts.completed}/{totalCount}
              </Badge>
              {currentPlaylistInfo && (
                <Badge
                  variant="outline"
                  className="px-1.5 py-0 text-[10px] text-primary border-primary/30"
                >
                  {currentPlaylistInfo.index}/{currentPlaylistInfo.total}
                </Badge>
              )}
            </div>

            {statusCounts.clearable > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearCompleted}
                disabled={isDownloading}
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="w-3 h-3 mr-1.5" />
                {t('queue.clearDone')}
              </Button>
            )}
          </div>

          <QueueStatusFilter
            value={statusFilter}
            counts={statusCounts}
            onChange={setStatusFilter}
            labels={{
              all: t('queue.filters.all'),
              pending: t('queue.status.pending'),
              active: t('queue.filters.active'),
              completed: t('queue.status.completed'),
              error: t('queue.status.failed'),
              skipped: t('queue.status.skipped'),
            }}
          />
        </div>
      )}

      {/* Queue Items or Empty State */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
          <EmptyStateIllustration className="mb-5" icon={Youtube} />
          <h3 className="text-base font-medium mb-1">{t('queue.empty.title')}</h3>
          <p className="text-sm text-muted-foreground text-center max-w-[240px]">
            {t('queue.empty.description')}
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {filteredItems.length === 0 ? (
            <QueueStatusEmptyState
              title={t('queue.filters.emptyTitle')}
              actionLabel={t('queue.filters.showAll')}
              onShowAll={() => setStatusFilter('all')}
            />
          ) : (
            <div className="space-y-2 pb-2">
              {filteredItems.map((item) => (
                <QueueItem
                  key={item.id}
                  item={item}
                  isFocused={focusedItemId === item.id}
                  showPlaylistBadge={showPlaylistBadge}
                  disabled={isDownloading}
                  onRemove={onRemove}
                  onUpdateTimeRange={onUpdateTimeRange}
                  onSelectOutputFolder={onSelectOutputFolder}
                  onRename={onRename}
                  onScheduleUpcomingLive={onScheduleUpcomingLive}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
}
