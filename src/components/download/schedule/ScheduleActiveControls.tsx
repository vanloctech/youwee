import { AlarmClock, Play, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ScheduleConfig } from '@/hooks/useSchedule';
import { formatTime } from '@/hooks/useSchedule';
import { cn } from '@/lib/utils';

interface ScheduleActiveControlsProps {
  schedule: ScheduleConfig | null;
  countdown: string;
  onCancel: () => void;
  onStartNow: () => void;
  ns: string;
}

export function ScheduleActiveControls({
  schedule,
  countdown,
  onCancel,
  onStartNow,
  ns,
}: ScheduleActiveControlsProps) {
  const { t } = useTranslation(ns);

  return (
    <>
      <div className="flex-1 h-11 px-3 rounded-xl bg-primary/5 border border-primary/15 flex items-center gap-2.5 shadow-sm shadow-primary/5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <AlarmClock className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-medium">{formatTime(schedule?.startAt ?? 0)}</span>
            {countdown && (
              <span className="rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {countdown}
              </span>
            )}
          </div>
          <p className="truncate text-[10px] text-muted-foreground">{t('schedule.title')}</p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
          title={t('schedule.cancel')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <button
        type="button"
        className={cn(
          'h-11 px-4 rounded-xl font-medium text-sm',
          'btn-gradient flex items-center justify-center gap-1.5',
          'shadow-lg shadow-primary/20',
        )}
        onClick={onStartNow}
        title={t('schedule.startNow')}
      >
        <Play className="w-4 h-4" />
        <span>{t('schedule.startNow')}</span>
      </button>
    </>
  );
}
