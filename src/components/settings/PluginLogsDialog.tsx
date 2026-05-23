import { RefreshCw, TerminalSquare, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LogEntry } from '@/components/logs';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LogEntry as PluginLogEntry, PluginSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PluginLogsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plugin: PluginSummary | null;
  logs: PluginLogEntry[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  clearing: boolean;
  hasMore: boolean;
  error: string | null;
  onRefresh: () => Promise<void> | void;
  onLoadMore: () => Promise<void> | void;
  onClear: () => Promise<void> | void;
}

export function PluginLogsDialog({
  open,
  onOpenChange,
  plugin,
  logs,
  total,
  loading,
  loadingMore,
  clearing,
  hasMore,
  error,
  onRefresh,
  onLoadMore,
  onClear,
}: PluginLogsDialogProps) {
  const { t } = useTranslation('settings');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] w-[calc(100vw-2rem)] max-w-[min(72rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border/60 px-6 py-5 pr-16">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
                  <TerminalSquare className="h-4 w-4" />
                </span>
                <span className="truncate">
                  {plugin
                    ? t('download.pluginLogsTitle', { name: plugin.manifest.name })
                    : t('download.pluginLogsTitleFallback')}
                </span>
              </DialogTitle>
              <DialogDescription className="mt-2 text-xs sm:text-sm">
                {t('download.pluginLogsDesc')}
              </DialogDescription>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-dashed text-red-500 hover:text-red-500"
                onClick={onClear}
                disabled={clearing || loading}
              >
                <Trash2 className={cn('h-4 w-4', clearing && 'animate-pulse')} />
                {t('download.pluginLogsClear')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={onRefresh}
                disabled={loading}
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                {t('download.pluginLogsRefresh')}
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b border-border/60 px-6 py-3 text-xs text-muted-foreground">
          {plugin && (
            <div className="flex flex-wrap items-center gap-2 break-words [overflow-wrap:anywhere]">
              <span className="break-words [overflow-wrap:anywhere]">{plugin.manifest.id}</span>
              <span>•</span>
              <span>{t('download.pluginLogsCount', { count: total })}</span>
              {total > logs.length && (
                <>
                  <span>•</span>
                  <span>{t('download.pluginLogsShowingCount', { shown: logs.length })}</span>
                </>
              )}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-3 px-6 py-5">
            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {error}
              </div>
            )}

            {loading && logs.length === 0 ? (
              <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-6 text-sm text-muted-foreground">
                {t('download.pluginLogsLoading')}
              </div>
            ) : logs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-8 text-center">
                <p className="text-sm font-medium">{t('download.pluginLogsEmptyTitle')}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('download.pluginLogsEmptyDesc')}
                </p>
              </div>
            ) : (
              <>
                {logs.map((log) => (
                  <LogEntry key={log.id} log={log} />
                ))}

                {hasMore && (
                  <div className="flex justify-center pt-2">
                    <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
                      <RefreshCw className={cn('h-4 w-4', loadingMore && 'animate-spin')} />
                      {t('download.pluginLogsLoadMore')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
