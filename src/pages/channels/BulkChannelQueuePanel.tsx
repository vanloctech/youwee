import { Loader2, Maximize2, OctagonX, Pause, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
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
  onStopAll: () => void;
  onRetryFailed: () => void;
  onRemoveQueuedBatch: (batchId: string) => void;
};

export function BulkChannelQueuePanel({
  state,
  progressByUrl,
  onPause,
  onResume,
  onStop,
  onStopAll,
  onRetryFailed,
  onRemoveQueuedBatch,
}: BulkChannelQueuePanelProps) {
  const { t } = useTranslation('channels');
  const [managerOpen, setManagerOpen] = useState(false);
  const [view, setView] = useState<'current' | 'history'>('current');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'failed' | 'completed' | 'skipped'>(
    'all',
  );
  const [query, setQuery] = useState('');
  const selectedHistory =
    state.history.find((batch) => batch.id === selectedHistoryId) ?? state.history.at(-1) ?? null;
  const displayedJobs = view === 'history' ? selectedHistory?.jobs || [] : state.jobs;
  const currentFailedCount = state.jobs.filter((job) =>
    ['failed', 'edit_failed'].includes(job.status),
  ).length;
  const retryableFailedCount = state.jobs.filter((job) => job.status === 'failed').length;
  const currentSkippedCount = state.jobs.filter((job) => job.status === 'skipped').length;
  const currentAwaitingEditCount = state.jobs.filter((job) =>
    ['downloaded', 'editing'].includes(job.status),
  ).length;
  const currentCompletedCount = state.jobs.filter((job) => job.status === 'completed').length;
  const currentPendingCount = state.jobs.filter((job) =>
    ['pending', 'fetching', 'downloading', 'paused'].includes(job.status),
  ).length;
  const displayedFailedCount = displayedJobs.filter((job) =>
    ['failed', 'edit_failed'].includes(job.status),
  ).length;
  const displayedAwaitingEditCount = displayedJobs.filter((job) =>
    ['downloaded', 'editing'].includes(job.status),
  ).length;
  const filteredJobs = useMemo(
    () =>
      displayedJobs.filter((job) => {
        const matchesFilter =
          filter === 'all' ||
          (filter === 'active' &&
            ['pending', 'fetching', 'downloading', 'downloaded', 'editing', 'paused'].includes(
              job.status,
            )) ||
          (filter === 'failed' && ['failed', 'edit_failed'].includes(job.status)) ||
          (filter !== 'failed' && job.status === filter);
        const normalizedQuery = query.trim().toLowerCase();
        return (
          matchesFilter &&
          (job.url.toLowerCase().includes(normalizedQuery) ||
            job.channelName?.toLowerCase().includes(normalizedQuery))
        );
      }),
    [displayedJobs, filter, query],
  );

  if (state.jobs.length === 0 && state.history.length === 0) return null;

  return (
    <div className="max-h-[42dvh] flex-shrink overflow-y-auto border-b border-border/50 bg-card/40 px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('bulkChannels.title')}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {Math.min(state.currentIndex + (state.running ? 1 : 0), state.jobs.length)}/
            {state.jobs.length}
            {state.queuedBatches.length > 0 ? ` · +${state.queuedBatches.length}` : ''}
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
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded bg-muted/30 px-2 py-1.5 text-[10px]">
        <span className="text-emerald-500">
          {currentCompletedCount} {t('bulkChannels.status.completed')}
        </span>
        {currentAwaitingEditCount > 0 && (
          <span className="text-amber-500">
            {currentAwaitingEditCount} {t('bulkChannels.awaitingEdit')}
          </span>
        )}
        {currentFailedCount > 0 && (
          <span className="text-destructive">
            {currentFailedCount} {t('bulkChannels.status.failed')}
          </span>
        )}
        {currentSkippedCount > 0 && (
          <span className="text-muted-foreground">
            {currentSkippedCount} {t('bulkChannels.status.skipped')}
          </span>
        )}
        <span className="ml-auto text-primary">
          {currentPendingCount} {t('bulkChannels.status.pending')}
        </span>
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
      {!state.running && state.phase === 'complete' && retryableFailedCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 w-full text-xs"
          onClick={onRetryFailed}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          {t('common:update.retry')} ({retryableFailedCount})
        </Button>
      )}
      <Dialog open={managerOpen} onOpenChange={setManagerOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-3 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{t('bulkChannels.managerTitle')}</DialogTitle>
          </DialogHeader>
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <Button
              size="sm"
              variant={view === 'current' ? 'default' : 'outline'}
              onClick={() => setView('current')}
            >
              {t('bulkChannels.currentRun')}
            </Button>
            <Button
              size="sm"
              variant={view === 'history' ? 'default' : 'outline'}
              onClick={() => setView('history')}
            >
              {t('bulkChannels.history')} ({state.history.length})
            </Button>
          </div>
          {view === 'current' &&
            (state.running || state.phase === 'paused' || currentAwaitingEditCount > 0) && (
              <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
                {(state.running || state.phase === 'paused') && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={state.running ? onPause : onResume}
                    >
                      {state.running ? (
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Play className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {state.running ? t('bulkChannels.pause') : t('bulkChannels.resume')}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={onStop}>
                      <Square className="mr-1.5 h-3.5 w-3.5" />
                      {t('bulkChannels.stop')}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="destructive" className="ml-auto h-8" onClick={onStopAll}>
                  <OctagonX className="mr-1.5 h-3.5 w-3.5" />
                  {t('bulkChannels.stopAll')}
                </Button>
              </div>
            )}
          {view === 'history' && state.history.length > 0 && (
            <div className="max-w-full shrink-0 overflow-x-auto pb-4">
              <div className="flex w-max min-w-full items-stretch gap-2">
                {[...state.history].reverse().map((batch, index) => (
                  <button
                    key={batch.id}
                    type="button"
                    onClick={() => setSelectedHistoryId(batch.id)}
                    className={`min-h-16 w-56 shrink-0 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                      selectedHistory?.id === batch.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border/60 bg-muted/20 hover:bg-muted/40'
                    }`}
                  >
                    <p className="font-medium">
                      {t('bulkChannels.historyBatch', { number: state.history.length - index })}
                    </p>
                    <p
                      className="mt-0.5 truncate text-muted-foreground"
                      title={batch.options.outputPath}
                    >
                      {batch.options.outputPath}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(batch.finishedAt).toLocaleString()} · {batch.jobs.length}{' '}
                      {t('bulkChannels.channelsUnit')}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {view === 'history' && state.history.length === 0 && (
            <p className="shrink-0 rounded-md bg-muted/30 p-3 text-center text-xs text-muted-foreground">
              {t('bulkChannels.noHistory')}
            </p>
          )}
          <div className="grid shrink-0 grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div className="rounded bg-muted/40 px-2 py-1.5 text-center">
              <strong className="block text-emerald-500">
                {displayedJobs.filter((job) => job.status === 'completed').length}
              </strong>
              {t('bulkChannels.status.completed')}
            </div>
            <div className="rounded bg-muted/40 px-2 py-1.5 text-center">
              <strong className="block text-destructive">{displayedFailedCount}</strong>
              {t('bulkChannels.status.failed')}
            </div>
            <div className="rounded bg-muted/40 px-2 py-1.5 text-center">
              <strong className="block text-amber-500">{displayedAwaitingEditCount}</strong>
              {t('bulkChannels.awaitingEdit')}
            </div>
            <div className="rounded bg-muted/40 px-2 py-1.5 text-center">
              <strong className="block text-amber-500">
                {displayedJobs.filter((job) => job.status === 'skipped').length}
              </strong>
              {t('bulkChannels.status.skipped')}
            </div>
            <div className="rounded bg-muted/40 px-2 py-1.5 text-center">
              <strong className="block text-primary">
                {
                  displayedJobs.filter((job) =>
                    ['pending', 'fetching', 'downloading', 'paused'].includes(job.status),
                  ).length
                }
              </strong>
              {t('bulkChannels.status.pending')}
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-5">
            {(['all', 'active', 'failed', 'completed', 'skipped'] as const).map((value) => (
              <Button
                key={value}
                size="sm"
                variant={filter === value ? 'default' : 'outline'}
                onClick={() => setFilter(value)}
              >
                {value === 'skipped'
                  ? t('bulkChannels.status.skipped')
                  : t(`bulkChannels.filters.${value}`)}
              </Button>
            ))}
          </div>
          <Input
            className="shrink-0"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('bulkChannels.searchPlaceholder')}
          />
          {view === 'current' && state.queuedBatches.length > 0 && (
            <div className="max-h-32 shrink-0 space-y-2 overflow-y-auto rounded-lg border border-dashed border-border/60 p-3">
              {state.queuedBatches.map((batch, index) => (
                <div
                  key={batch.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/30 px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t('bulkChannels.batch', {
                        number: index + 2,
                        count: batch.jobs.length,
                      })}
                    </p>
                    <p
                      className="mt-0.5 max-w-xl truncate text-muted-foreground"
                      title={batch.options.outputPath}
                    >
                      {batch.options.outputPath}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded bg-primary/10 px-2 py-1 text-primary">
                      {t('bulkChannels.status.pending')}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title={t('bulkChannels.removeBatch')}
                      onClick={() => onRemoveQueuedBatch(batch.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {filteredJobs.map((job, index) => {
              const progress = view === 'current' ? progressByUrl[job.url] : undefined;
              const finished = progress ? progress.completed + progress.failed : 0;
              return (
                <div key={`${job.url}-${index}`} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {job.channelName || job.url}
                      </span>
                      {job.channelName && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {job.url}
                        </span>
                      )}
                    </span>
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
