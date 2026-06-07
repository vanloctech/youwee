import { CheckCircle2, ExternalLink, Images } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DownloadItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { GalleryQueueItem } from './GalleryQueueItem';

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

export function GalleryQueueList({
  items,
  focusedItemId,
  isDownloading,
  onRemove,
  onClearCompleted,
}: GalleryQueueListProps) {
  const { t } = useTranslation('gallery');
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

      <ScrollArea className="flex-1 -mx-1 px-1">
        <div className="space-y-2 pb-2">
          {items.map((item) => (
            <GalleryQueueItem
              key={item.id}
              item={item}
              isFocused={focusedItemId === item.id}
              disabled={isDownloading}
              onRemove={onRemove}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
