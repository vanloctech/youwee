import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelBatchProgress } from '@/contexts/channels/useChannelsController';
import type { FollowedChannel } from '@/lib/types';

type ChannelActivityPanelProps = {
  progressByUrl: Record<string, ChannelBatchProgress>;
  followedChannels: FollowedChannel[];
  compact?: boolean;
};

export function ChannelActivityPanel({
  progressByUrl,
  followedChannels,
  compact = false,
}: ChannelActivityPanelProps) {
  const { t } = useTranslation('channels');
  const activities = useMemo(
    () =>
      Object.values(progressByUrl)
        .filter(
          (progress) =>
            progress.total > 0 &&
            (progress.active > 0 || progress.queued > 0 || progress.editActive > 0),
        )
        .sort((left, right) => {
          const leftBusy = left.active > 0 || left.queued > 0;
          const rightBusy = right.active > 0 || right.queued > 0;
          return Number(rightBusy) - Number(leftBusy);
        }),
    [progressByUrl],
  );

  if (activities.length === 0) return null;

  return (
    <div className={compact ? 'flex-shrink-0' : 'flex-shrink-0 px-4 pt-3 sm:px-6'}>
      <div
        className={
          compact
            ? 'max-h-56 space-y-3 overflow-y-auto border-y border-border/50 bg-card/40 px-3 py-2.5'
            : 'max-h-64 space-y-3 overflow-y-auto rounded-lg border border-border/50 bg-card/50 px-3 py-2.5'
        }
      >
        {compact && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('activeTransfers')}
          </p>
        )}
        {activities.map((progress) => {
          const channel = followedChannels.find((item) => item.url === progress.channelUrl);
          const completed = progress.completed + progress.failed;
          const downloadPercent = Math.min(100, (completed / progress.total) * 100);
          const editPercent =
            progress.editTotal > 0
              ? Math.min(100, (progress.editCompleted / progress.editTotal) * 100)
              : 0;
          const currentPartPercent = Math.min(100, Math.max(0, progress.editCurrentPercent ?? 0));
          const currentPart = progress.editCurrentTotal
            ? Math.min(progress.editCurrentTotal, (progress.editCurrentCompleted ?? 0) + 1)
            : 0;
          const busy = progress.active > 0 || progress.queued > 0;
          return (
            <div key={progress.channelUrl} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-medium">
                  {channel?.name || progress.channelName || progress.channelUrl}
                  {busy && <span className="ml-1.5 text-primary">•</span>}
                </span>
                <span className="shrink-0 font-medium">
                  {completed}/{progress.total}
                  {progress.failed > 0 && (
                    <span className="ml-1 text-destructive">({progress.failed} lỗi)</span>
                  )}
                </span>
              </div>
              {progress.currentDownloadTitle && (
                <p
                  className="truncate text-[11px] text-muted-foreground"
                  title={progress.currentDownloadTitle}
                >
                  {progress.currentDownloadTitle}
                </p>
              )}
              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${downloadPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>{t('batchDownloadProgress')}</span>
                  <span>{Math.round(downloadPercent)}%</span>
                </div>
              </div>
              {progress.editTotal > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t('batchEditProgress')}</span>
                    <span className="font-medium">
                      {progress.editCompleted}/{progress.editTotal}
                      {progress.editActive > 0 && (
                        <span className="ml-1 text-amber-500">{t('batchEditActive')}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${editPercent}%` }}
                    />
                  </div>
                  {progress.editCurrentTotal && progress.editCurrentTotal > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span
                          className="max-w-[75%] truncate"
                          title={progress.editCurrentInputPath}
                        >
                          {t('batchEditCurrent')} {currentPart}/{progress.editCurrentTotal}
                        </span>
                        <span>{Math.round(currentPartPercent)}%</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-orange-400 transition-all"
                          style={{ width: `${currentPartPercent}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
