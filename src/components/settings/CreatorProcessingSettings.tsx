import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type CreatorQueueItem,
  type CreatorProcessingSettings as CreatorSettings,
  deleteCreatorJobs,
  listCreatorJobs,
  loadCreatorProcessingSettings,
  pickCreatorFolder,
  retryAllCreatorJobs,
  retryCreatorJob,
  retryCreatorJobs,
  saveCreatorProcessingSettings,
  stopCreatorProcessingQueue,
} from '@/lib/creator-processing';
import { watchCreatorQueue } from '@/lib/creator-queue-events';

function creatorJobPathParts(inputPath: string): { channel: string; filename: string } {
  const parts = inputPath.replaceAll('\\', '/').split('/').filter(Boolean);
  return {
    channel: parts.at(-2) || '',
    filename: parts.at(-1) || inputPath,
  };
}

export function CreatorProcessingSettings() {
  const { t } = useTranslation('channels');
  const [settings, setSettings] = useState(loadCreatorProcessingSettings);
  const [jobs, setJobs] = useState<CreatorQueueItem[]>([]);
  const [partProgress, setPartProgress] = useState<{
    inputPath: string;
    completed: number;
    total: number;
    currentSeconds?: number;
    durationSeconds?: number;
    percent?: number;
  } | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);
  const [mutatingSelected, setMutatingSelected] = useState(false);
  const [stoppingQueue, setStoppingQueue] = useState(false);
  const [encoderNotice, setEncoderNotice] = useState<{
    requested: string;
    actual: string;
    fallback: boolean;
    fallbackStage?: string;
  } | null>(null);
  const refreshJobs = useCallback(async () => {
    try {
      const nextJobs = await listCreatorJobs();
      setJobs(nextJobs);
      const availableIds = new Set(nextJobs.map((job) => job.id));
      setSelectedJobIds((current) => new Set([...current].filter((id) => availableIds.has(id))));
    } catch (error) {
      console.error('Cannot load creator jobs:', error);
    }
  }, []);
  useEffect(() => {
    const stopWatching = watchCreatorQueue(refreshJobs);
    const unlisten = listen<{
      inputPath: string;
      completed: number;
      total: number;
      currentSeconds?: number;
      durationSeconds?: number;
      percent?: number;
    }>('creator-processing-progress', (event) => {
      setPartProgress(event.payload);
    });
    const unlistenEncoder = listen<{
      requested: string;
      actual: string;
      fallback: boolean;
      fallbackStage?: string;
    }>('creator-processing-encoder', (event) => {
      setEncoderNotice(event.payload);
    });
    return () => {
      stopWatching();
      unlisten.then((stop) => stop());
      unlistenEncoder.then((stop) => stop());
    };
  }, [refreshJobs]);

  const failedJobs = useMemo(() => jobs.filter((job) => job.status === 'failed'), [jobs]);
  const pendingJobs = jobs.filter((job) => job.status === 'pending');
  const runningJobs = jobs.filter((job) => job.status === 'running');
  const completedJobs = jobs.filter((job) => job.status === 'completed');
  const cancelledJobs = jobs.filter((job) => job.status === 'cancelled');
  // Failed and cancelled jobs need attention; they must not make the success
  // progress bar look complete.
  const overallProgress = jobs.length > 0 ? (completedJobs.length / jobs.length) * 100 : 0;
  const selectedFailedJobs = failedJobs.filter((job) => selectedJobIds.has(job.id));
  const allFailedSelected =
    failedJobs.length > 0 && failedJobs.every((job) => selectedJobIds.has(job.id));
  const update = (patch: Partial<CreatorSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveCreatorProcessingSettings(next);
      return next;
    });
  };

  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('creator.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('creator.settingsHint')}</p>
      </div>
      {failedJobs.length > 0 && (
        <div className="space-y-2 rounded-lg bg-destructive/5 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allFailedSelected}
                onChange={(event) =>
                  setSelectedJobIds(
                    event.target.checked ? new Set(failedJobs.map((job) => job.id)) : new Set(),
                  )
                }
              />
              <span>{t('creator.failedJobs', { count: failedJobs.length })}</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {selectedFailedJobs.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retryingAll || mutatingSelected}
                    onClick={async () => {
                      setMutatingSelected(true);
                      try {
                        await retryCreatorJobs(selectedFailedJobs.map((job) => job.id));
                        setSelectedJobIds(new Set());
                      } catch (error) {
                        console.error('Cannot retry selected creator jobs:', error);
                      } finally {
                        setMutatingSelected(false);
                      }
                    }}
                  >
                    {t('creator.retrySelected', { count: selectedFailedJobs.length })}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retryingAll || mutatingSelected}
                    onClick={async () => {
                      setMutatingSelected(true);
                      try {
                        await deleteCreatorJobs(selectedFailedJobs.map((job) => job.id));
                        setSelectedJobIds(new Set());
                      } catch (error) {
                        console.error('Cannot delete selected creator jobs:', error);
                      } finally {
                        setMutatingSelected(false);
                      }
                    }}
                  >
                    {t('creator.deleteSelected', { count: selectedFailedJobs.length })}
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={retryingAll || mutatingSelected}
                onClick={async () => {
                  setRetryingAll(true);
                  try {
                    await retryAllCreatorJobs();
                    setSelectedJobIds(new Set());
                  } catch (error) {
                    console.error('Cannot retry all creator jobs:', error);
                  } finally {
                    setRetryingAll(false);
                  }
                }}
              >
                {retryingAll
                  ? t('creator.retryingAll')
                  : t('creator.retryAll', { count: failedJobs.length })}
              </Button>
            </div>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {(showAllErrors ? failedJobs : failedJobs.slice(0, 10)).map((job) => (
              <div
                key={job.id}
                className="rounded-md border border-destructive/10 bg-background/30 p-2"
              >
                {(() => {
                  const pathParts = creatorJobPathParts(job.inputPath);
                  return (
                    <div className="mb-1 flex min-w-0 items-center gap-2 pl-6">
                      <span className="truncate font-medium" title={job.inputPath}>
                        {pathParts.filename}
                      </span>
                      {pathParts.channel && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {pathParts.channel}
                        </span>
                      )}
                      <span
                        className={
                          job.inputExists
                            ? 'shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400'
                            : 'shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground'
                        }
                      >
                        {job.inputExists ? t('creator.sourceExists') : t('creator.sourceMissing')}
                      </span>
                      {job.outputExists && (
                        <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                          {t('creator.outputReady')}
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJobIds.has(job.id)}
                    onChange={(event) =>
                      setSelectedJobIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(job.id);
                        else next.delete(job.id);
                        return next;
                      })
                    }
                    aria-label={t('creator.selectJob')}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-muted-foreground"
                    title={job.inputPath}
                  >
                    {job.inputPath}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retryingAll || retryingJobId === job.id}
                    onClick={async () => {
                      setRetryingJobId(job.id);
                      try {
                        await retryCreatorJob(job.id);
                      } finally {
                        setRetryingJobId(null);
                      }
                    }}
                  >
                    {retryingJobId === job.id ? t('creator.retrying') : t('creator.retry')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={retryingAll || mutatingSelected || retryingJobId === job.id}
                    onClick={async () => {
                      setMutatingSelected(true);
                      try {
                        await deleteCreatorJobs([job.id]);
                        setSelectedJobIds((current) => {
                          const next = new Set(current);
                          next.delete(job.id);
                          return next;
                        });
                      } finally {
                        setMutatingSelected(false);
                      }
                    }}
                  >
                    {t('creator.delete')}
                  </Button>
                </div>
                {job.errorMessage && (
                  <p className="mt-1 break-words text-[11px] text-destructive/80">
                    {job.errorMessage}
                  </p>
                )}
              </div>
            ))}
          </div>
          {failedJobs.length > 10 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setShowAllErrors((current) => !current)}
            >
              {showAllErrors
                ? t('creator.showLess')
                : t('creator.showAll', { count: failedJobs.length })}
            </Button>
          )}
        </div>
      )}
      {jobs.length > 0 && (
        <div className="space-y-2 rounded-lg border border-border/50 bg-background/30 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium">{t('creator.queueProgress')}</span>
            <span className="text-muted-foreground">
              {completedJobs.length}/{jobs.length}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${overallProgress}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
            {(pendingJobs.length > 0 || runningJobs.length > 0) && (
              <Button
                size="sm"
                variant="outline"
                disabled={stoppingQueue}
                onClick={async () => {
                  setStoppingQueue(true);
                  try {
                    await stopCreatorProcessingQueue();
                  } catch (error) {
                    console.error('Cannot stop creator processing:', error);
                  } finally {
                    setStoppingQueue(false);
                  }
                }}
              >
                {stoppingQueue ? t('creator.stopping') : t('creator.stop')}
              </Button>
            )}
            <span>
              {t('creator.queued')}: {pendingJobs.length}
            </span>
            <span>
              {t('creator.processing')}: {runningJobs.length}
            </span>
            <span>
              {t('creator.completed')}: {completedJobs.length}
            </span>
            <span>
              {t('creator.failed')}: {failedJobs.length}
            </span>
            <span>
              {t('creator.cancelled')}: {cancelledJobs.length}
            </span>
          </div>
          {partProgress && partProgress.total > 0 && (
            <div className="space-y-1 border-t border-border/50 pt-2">
              {(() => {
                const percent = Math.min(100, Math.max(0, partProgress.percent ?? 0));
                return (
                  <>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="max-w-[75%] truncate" title={partProgress.inputPath}>
                        {partProgress.inputPath}
                      </span>
                      <span>{Math.round(percent)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-orange-400 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </>
                );
              })()}
              <div className="flex items-center justify-between text-muted-foreground">
                <span>
                  {partProgress.completed}/{partProgress.total}
                </span>
                {partProgress.currentSeconds !== undefined &&
                  partProgress.durationSeconds !== undefined && (
                    <span>
                      {Math.floor(partProgress.currentSeconds)}s /{' '}
                      {Math.ceil(partProgress.durationSeconds)}s
                    </span>
                  )}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{
                    width: `${Math.min(100, (partProgress.completed / partProgress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{t('creator.partProgress')}</p>
            </div>
          )}
        </div>
      )}
      {encoderNotice && (
        <div
          className={
            encoderNotice.fallback
              ? 'rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400'
              : 'rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400'
          }
        >
          {encoderNotice.fallback
            ? encoderNotice.fallbackStage === 'cpu-decode-filter'
              ? t('creator.gpuDecodeFallback', { encoder: encoderNotice.requested })
              : t('creator.gpuFallback', { encoder: encoderNotice.requested })
            : t('creator.gpuActive', { encoder: encoderNotice.actual })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={settings.mode}
          onChange={(event) => {
            const mode = event.target.value as CreatorSettings['mode'];
            update({ mode });
            if (mode === 'none' && (pendingJobs.length > 0 || runningJobs.length > 0)) {
              void stopCreatorProcessingQueue()
                .then(refreshJobs)
                .catch((error) => {
                  console.error('Cannot stop creator processing:', error);
                });
            }
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="none">{t('creator.none')}</option>
          <option value="duet">{t('creator.duet')}</option>
          <option value="portrait">{t('creator.portrait')}</option>
          <option value="parts">{t('creator.parts')}</option>
        </select>
        {settings.mode === 'duet' && (
          <Button
            variant="outline"
            onClick={async () => {
              const folder = await pickCreatorFolder(settings.rightFolder || undefined);
              if (folder) update({ rightFolder: folder });
            }}
            title={settings.rightFolder}
          >
            {settings.rightFolder ? t('creator.changeRight') : t('creator.selectRight')}
          </Button>
        )}
        {settings.mode === 'parts' && (
          <>
            <select
              value={settings.splitBy}
              onChange={(event) =>
                update({ splitBy: event.target.value === 'count' ? 'count' : 'duration' })
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="duration">{t('creator.splitByDuration')}</option>
              <option value="count">{t('creator.splitByCount')}</option>
            </select>
            <label
              htmlFor="settings-creator-split-value"
              className="flex items-center gap-2 text-sm"
            >
              {settings.splitBy === 'count' ? t('creator.partCount') : t('creator.partSeconds')}
              <Input
                id="settings-creator-split-value"
                type="number"
                min={1}
                value={settings.splitBy === 'count' ? settings.partCount : settings.partSeconds}
                onChange={(event) =>
                  settings.splitBy === 'count'
                    ? update({ partCount: Math.max(1, Number(event.target.value)) })
                    : update({ partSeconds: Math.max(1, Number(event.target.value)) })
                }
                className="w-24"
              />
            </label>
          </>
        )}
        {settings.mode !== 'none' && (
          <select
            value={settings.encoder}
            onChange={(event) =>
              update({ encoder: event.target.value as CreatorSettings['encoder'] })
            }
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="libx264">CPU x264</option>
            <option value="h264_nvenc">NVIDIA NVENC</option>
            <option value="h264_qsv">Intel Quick Sync</option>
            <option value="h264_amf">AMD AMF</option>
          </select>
        )}
      </div>
    </section>
  );
}
