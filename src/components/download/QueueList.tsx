import { CheckCircle2, Trash2, Youtube } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { DownloadItem } from '@/lib/types';
import { QueueItem } from './QueueItem';

interface QueueListProps {
  items: DownloadItem[];
  isDownloading: boolean;
  showPlaylistBadge?: boolean;
  currentPlaylistInfo?: {
    index: number;
    total: number;
    title: string;
  } | null;
  onRemove: (id: string) => void;
  onClearCompleted: () => void;
}

export function QueueList({
  items,
  isDownloading,
  showPlaylistBadge,
  currentPlaylistInfo,
  onRemove,
  onClearCompleted,
}: QueueListProps) {
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const totalCount = items.length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between py-2 px-1 gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium">Queue</h2>
            <div className="flex items-center gap-1.5">
              {pendingCount > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {pendingCount} pending
                </Badge>
              )}
              {completedCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-emerald-500 border-emerald-500/30"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  {completedCount}
                </Badge>
              )}
              {currentPlaylistInfo && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-primary border-primary/30"
                >
                  {currentPlaylistInfo.index}/{currentPlaylistInfo.total}
                </Badge>
              )}
            </div>
          </div>

          {completedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearCompleted}
              disabled={isDownloading}
              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="w-3 h-3 mr-1.5" />
              Clear done
            </Button>
          )}
        </div>
      )}

      {/* Queue Items or Empty State */}
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 px-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-4">
            <Youtube className="w-10 h-10 text-primary/50" />
          </div>
          <h3 className="text-base font-medium mb-1">No videos yet</h3>
          <p className="text-sm text-muted-foreground text-center max-w-[240px]">
            Paste a YouTube URL above to start downloading videos
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1 -mx-3 px-3">
          <div className="space-y-2 pb-2">
            {items.map((item) => (
              <QueueItem
                key={item.id}
                item={item}
                showPlaylistBadge={showPlaylistBadge}
                disabled={isDownloading}
                onRemove={onRemove}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
