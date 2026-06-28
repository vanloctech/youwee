import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faFacebook,
  faInstagram,
  faReddit,
  faSoundcloud,
  faSpotify,
  faTiktok,
  faTumblr,
  faTwitch,
  faTwitter,
  faVimeo,
} from '@fortawesome/free-brands-svg-icons';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { CheckCircle2, ExternalLink, Globe } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { FaIcon } from '@/components/shared/FaIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ScheduleConfig } from '@/hooks/useSchedule';
import type { DownloadItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  filterQueueItems,
  getQueueStatusCounts,
  QueueStatusEmptyState,
  QueueStatusFilter,
  type QueueStatusFilterValue,
} from './QueueStatusFilter';
import { UniversalQueueItem } from './UniversalQueueItem';

const POPULAR_SITES: Array<{ name: string; icon: IconDefinition; color: string }> = [
  { name: 'TikTok', icon: faTiktok, color: 'text-pink-500' },
  { name: 'Instagram', icon: faInstagram, color: 'text-purple-500' },
  { name: 'Twitter/X', icon: faTwitter, color: 'text-sky-400' },
  { name: 'Facebook', icon: faFacebook, color: 'text-blue-600' },
  { name: 'Vimeo', icon: faVimeo, color: 'text-cyan-500' },
  { name: 'Twitch', icon: faTwitch, color: 'text-purple-400' },
  { name: 'SoundCloud', icon: faSoundcloud, color: 'text-orange-500' },
  { name: 'Reddit', icon: faReddit, color: 'text-orange-600' },
  { name: 'Spotify', icon: faSpotify, color: 'text-green-500' },
  { name: 'Tumblr', icon: faTumblr, color: 'text-blue-900' },
];

interface UniversalQueueListProps {
  items: DownloadItem[];
  focusedItemId?: string | null;
  isDownloading: boolean;
  onRemove: (id: string) => void;
  onUpdateTimeRange: (id: string, start?: string, end?: string) => void;
  onSelectOutputFolder: (id: string) => Promise<void>;
  onRename: (id: string, newName: string) => Promise<void>;
  onClearCompleted: () => void;
  onScheduleUpcomingLive?: (config: ScheduleConfig) => void;
}

export function UniversalQueueList({
  items,
  focusedItemId,
  isDownloading,
  onRemove,
  onUpdateTimeRange,
  onSelectOutputFolder,
  onRename,
  onClearCompleted,
  onScheduleUpcomingLive,
}: UniversalQueueListProps) {
  const { t } = useTranslation('universal');
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

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
        <EmptyStateIllustration className="mb-5" icon={Globe} size="sm" />
        <h3 className="text-sm font-medium text-foreground mb-1">{t('queue.empty.title')}</h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-[280px]">
          Supports <span className="font-semibold text-primary">1,800+</span> websites via yt-dlp
        </p>

        {/* Popular sites grid */}
        <div className="flex flex-wrap justify-center gap-2 mb-4 max-w-[340px]">
          {POPULAR_SITES.map((site) => (
            <span
              key={site.name}
              className={cn(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 text-[11px]',
                site.color,
              )}
            >
              <FaIcon icon={site.icon} className="text-[10px]" />
              <span>{site.name}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 text-[11px] text-muted-foreground">
            <FaIcon icon={faPlus} className="text-[10px]" />
            <span>{t('queue.empty.moreCount')}</span>
          </span>
        </div>

        {/* Link to full list */}
        <a
          href="https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md"
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
      {/* Queue Header */}
      <div className="sticky top-0 z-10 mb-2 space-y-1.5 rounded-lg bg-background/85 py-1.5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t('queue.title')}</span>
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {statusCounts.completed}/{totalCount}
            </Badge>
          </div>
          {statusCounts.clearable > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={onClearCompleted}
              disabled={isDownloading}
            >
              <CheckCircle2 className="w-3 h-3" />
              {t('queue.clearCompleted', { count: statusCounts.clearable })}
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

      {/* Queue Items */}
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
              <UniversalQueueItem
                key={item.id}
                item={item}
                isFocused={focusedItemId === item.id}
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
    </div>
  );
}
