import { AlarmClock, Play, Timer, X } from 'lucide-react';
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
    <div className="flex-1 flex items-center justify-between h-11 sm:h-[3.25rem] bg-zinc-950 text-white rounded-full ps-2 sm:ps-3 pe-1.5 sm:pe-2 ring-1 ring-white/10 shadow-lg shadow-black/20 transition-colors duration-300 overflow-hidden relative group">
      <div className="absolute top-1/2 left-10 -translate-y-1/2 w-36 h-36 bg-primary/20 blur-[28px] rounded-full opacity-45 group-hover:opacity-65 transition-opacity duration-500 pointer-events-none" />

      <div className="flex items-center gap-2.5 sm:gap-3 relative z-10 min-w-0">
        <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 shrink-0">
          <div
            className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary shadow-[0_0_8px_hsl(var(--primary)/0.35)] animate-spin"
            style={{ animationDuration: '3s' }}
          />
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Timer className="w-3.5 h-3.5 text-primary animate-pulse" />
          </div>
        </div>

        <div className="flex flex-col min-w-0 justify-center mt-0.5">
          <span className="text-sm sm:text-base font-bold text-primary tracking-wider tabular-nums leading-none mb-1">
            {countdown || t('schedule.title')}
          </span>
          <span className="text-[10px] sm:text-xs font-medium text-zinc-400 truncate flex items-center gap-1.5 leading-none">
            <AlarmClock className="w-3 h-3 text-zinc-500" />
            <span>
              {t('schedule.title')} • {formatTime(schedule?.startAt ?? 0)}
            </span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-1.5 relative z-10 shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          title={t('schedule.cancel')}
        >
          <X className="w-4 h-4" />
        </button>

        <button
          type="button"
          className={cn(
            'h-8 sm:h-9 px-3 sm:px-4 rounded-full font-semibold text-xs sm:text-sm transition-all duration-300 flex items-center gap-1.5',
            'bg-primary text-primary-foreground hover:opacity-90 active:opacity-85 shadow-[0_0_12px_hsl(var(--primary)/0.28)] hover:shadow-[0_0_16px_hsl(var(--primary)/0.4)]',
          )}
          onClick={onStartNow}
          title={t('schedule.startNow')}
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span className="hidden sm:inline">{t('schedule.startNow')}</span>
        </button>
      </div>
    </div>
  );
}
