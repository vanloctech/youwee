import { CheckCircle2, ExternalLink, Inbox } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DownloadItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { UniversalQueueItem } from './UniversalQueueItem';

// Popular supported sites with Font Awesome v4 icons
const POPULAR_SITES = [
  { name: 'TikTok', faIcon: 'fa-music', color: 'text-pink-500' },
  { name: 'Instagram', faIcon: 'fa-instagram', color: 'text-purple-500' },
  { name: 'Twitter/X', faIcon: 'fa-twitter', color: 'text-sky-400' },
  { name: 'Facebook', faIcon: 'fa-facebook', color: 'text-blue-600' },
  { name: 'Vimeo', faIcon: 'fa-vimeo', color: 'text-cyan-500' },
  { name: 'Twitch', faIcon: 'fa-twitch', color: 'text-purple-400' },
  { name: 'SoundCloud', faIcon: 'fa-soundcloud', color: 'text-orange-500' },
  { name: 'Reddit', faIcon: 'fa-reddit', color: 'text-orange-600' },
  { name: 'Spotify', faIcon: 'fa-spotify', color: 'text-green-500' },
  { name: 'Tumblr', faIcon: 'fa-tumblr', color: 'text-blue-900' },
];

interface UniversalQueueListProps {
  items: DownloadItem[];
  focusedItemId?: string | null;
  isDownloading: boolean;
  onRemove: (id: string) => void;
  onUpdateTimeRange: (id: string, start?: string, end?: string) => void;
  onClearCompleted: () => void;
}

export function UniversalQueueList({
  items,
  focusedItemId,
  isDownloading,
  onRemove,
  onUpdateTimeRange,
  onClearCompleted,
}: UniversalQueueListProps) {
  const { t } = useTranslation('universal');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const totalCount = items.length;
  const hasCompleted = completedCount > 0;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Inbox className="w-8 h-8 text-muted-foreground/50" />
        </div>
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
              <i className={cn('fa', site.faIcon, 'text-[10px]')} aria-hidden="true" />
              <span>{site.name}</span>
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 text-[11px] text-muted-foreground">
            <i className="fa fa-plus text-[10px]" aria-hidden="true" />
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
      <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-2 rounded-lg bg-background/80 px-1 py-2 backdrop-blur-sm">
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
            onClick={onClearCompleted}
            disabled={isDownloading}
          >
            <CheckCircle2 className="w-3 h-3" />
            {t('queue.clearCompleted', { count: completedCount })}
          </Button>
        )}
      </div>

      {/* Queue Items */}
      <ScrollArea className="flex-1 -mx-1 px-1">
        <div className="space-y-2 pb-2">
          {items.map((item) => (
            <UniversalQueueItem
              key={item.id}
              item={item}
              isFocused={focusedItemId === item.id}
              disabled={isDownloading}
              onRemove={onRemove}
              onUpdateTimeRange={onUpdateTimeRange}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
