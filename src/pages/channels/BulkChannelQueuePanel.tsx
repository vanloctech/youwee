import { Loader2, Maximize2, Pause, Play, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type {
  BulkChannelState,
  ChannelBatchProgress,
} from '@/contexts/channels/useChannelsController';

type BulkChannelQueuePanelProps = {
  state: BulkChannelState;
  progressByUrl: Record<string, ChannelBatchProgress>;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

export function BulkChannelQueuePanel({
  state,
  progressByUrl,
  onPause,
  onResume,
  onStop,
}: BulkChannelQueuePanelProps) {
  const { t } = useTranslation('channels');
  const [managerOpen, setManagerOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'failed' | 'completed'>('all');
  const [query, setQuery] = useState('');
  const filteredJobs = useMemo(
    () =>
      state.jobs.filter((job) => {
        const matchesFilter =
          filter === 'all' ||
          (filter === 'active' &&
            ['pending', 'fetching', 'downloading', 'paused'].includes(job.status)) ||
          job.status === filter;
        return matchesFilter && job.url.toLowerCase().includes(query.trim().toLowerCase());
      }),
    [filter, query, state.jobs],
  );

  if (state.jobs.length === 0) return null;

  return (
    <div className="flex-shrink-0 border-b border-border/50 bg-card/40 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('bulkChannels.title')}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {Math.min(state.currentIndex + (state.running ? 1 : 0), state.jobs.length)}/
            {state.jobs.length}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title={t('bulkChannels.openManager')}
            onClick={() => setManagerOpen(true)}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1">
        <div className="rounded bg-muted/40 px-1.5 py-1 text-center text-[10px]">
          <strong className="block text-xs text-emerald-500">
            {state.jobs.filter((job) => job.status === 'completed').length}
          </strong>
          {t('bulkChannels.status.completed')}
        </div>
        <div className="rounded bg-muted/40 px-1.5 py-1 text-center text-[10px]">
          <strong className="block text-xs text-destructive">
            {state.jobs.filter((job) => job.status === 'failed').length}
          </strong>
          {t('bulkChannels.status.failed')}
        </div>
        <div className="rounded bg-muted/40 px-1.5 py-1 text-center text-[10px]">
          <strong className="block text-xs text-primary">
            {
              state.jobs.filter((job) =>
                ['pending', 'fetching', 'downloading', 'paused'].includes(job.status),
              ).length
            }
          </strong>
          {t('bulkChannels.status.pending')}
        </div>
      </div>
      {state.running && state.jobs[state.currentIndex] && (
        <button
          type="button"
          onClick={() => setManagerOpen(true)}
          className="flex w-full items-center gap-1.5 rounded bg-primary/10 px-2 py-1.5 text-left text-[11px] text-primary hover:bg-primary/15"
        >
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span className="min-w-0 flex-1 truncate" title={state.jobs[state.currentIndex].url}>
            {state.jobs[state.currentIndex].url}
          </span>
        </button>
      )}
      {state.error && <p className="mt-2 text-[10px] text-destructive">{state.error}</p>}
      {(state.running || state.phase === 'paused') && (
        <div className="mt-2 flex gap-1.5">
          {state.running ? (
            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onPause}>
              <Pause className="mr-1 h-3.5 w-3.5" />
              {t('bulkChannels.pause')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={onResume}>
              <Play className="mr-1 h-3.5 w-3.5" />
              {t('bulkChannels.resume')}
            </Button>
          )}
          <Button size="sm" variant="destructive" className="h-7 flex-1 text-xs" onClick={onStop}>
            <Square className="mr-1 h-3.5 w-3.5" />
            {t('bulkChannels.stop')}
          </Button>
        </div>
      )}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-4xl flex-col">
          <DialogHeader>
            <DialogTitle>{t('bulkChannels.managerTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(['all', 'active', 'failed', 'completed'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                onClick={() => setFilter(value)}
              >
                {t(`bulkChannels.filters.${value}`)}
              </Button>
            ))}
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('bulkChannels.searchPlaceholder')}
          />
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredJobs.map((job, index) => {
              const progress = progressByUrl[job.url];
              const finished = progress ? progress.completed + progress.failed : 0;
              return (
                <div key={`${job.url}-${index}`} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 break-all font-medium">{job.url}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {progress?.total ? `${finished}/${progress.total} · ` : ''}
                      {t(`bulkChannels.status.${job.status}`)}
                    </span>
                  </div>
                  {progress?.currentDownloadTitle && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {progress.currentDownloadTitle}
                    </p>
                  )}
                  {job.error && <p className="mt-2 text-xs text-destructive">{job.error}</p>}
                  {progress?.errors?.map((error) => (
                    <div
                      key={`${error.videoId}-${error.message}`}
                      className="mt-2 rounded bg-destructive/5 p-2 text-xs"
                    >
                      <p className="font-medium">{error.title}</p>
                      <p className="mt-0.5 break-words text-destructive/80">{error.message}</p>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
