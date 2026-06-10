import { AlarmClock, Clock, TimerOff, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ScheduleConfig } from '@/hooks/useSchedule';
import { cn } from '@/lib/utils';

interface SchedulePopoverProps {
  onSchedule: (config: ScheduleConfig) => void;
  disabled?: boolean;
  /** translation namespace - 'download' or 'universal' */
  ns: string;
  triggerVariant?: 'icon' | 'inline';
  triggerLabel?: string;
  triggerClassName?: string;
}

type SchedulePreset = 'in15m' | 'in30m' | 'in1h' | 'in3h' | 'tonight' | 'tomorrow';

const SCHEDULE_PRESETS: SchedulePreset[] = [
  'in15m',
  'in30m',
  'in1h',
  'in3h',
  'tonight',
  'tomorrow',
];

function getPresetTime(preset: SchedulePreset): Date {
  const now = new Date();
  switch (preset) {
    case 'in15m':
      return new Date(now.getTime() + 15 * 60 * 1000);
    case 'in30m':
      return new Date(now.getTime() + 30 * 60 * 1000);
    case 'in1h':
      return new Date(now.getTime() + 60 * 60 * 1000);
    case 'in3h':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000);
    case 'tonight': {
      const d = new Date(now);
      d.setHours(23, 0, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d;
    }
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(2, 0, 0, 0);
      return d;
    }
  }
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function timeToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function dateToTimeStr(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatScheduleTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function SchedulePopover({
  onSchedule,
  disabled,
  ns,
  triggerVariant = 'icon',
  triggerLabel,
  triggerClassName,
}: SchedulePopoverProps) {
  const { t } = useTranslation(ns);
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [stopEnabled, setStopEnabled] = useState(false);
  const [stopTime, setStopTime] = useState('06:00');
  const startDate = useMemo(() => (startTime ? timeToDate(startTime) : null), [startTime]);
  const stopDate = useMemo(() => {
    if (!startDate || !stopEnabled || !stopTime) return null;
    const nextStopDate = timeToDate(stopTime);
    if (nextStopDate.getTime() <= startDate.getTime()) {
      nextStopDate.setDate(nextStopDate.getDate() + 1);
    }
    return nextStopDate;
  }, [startDate, stopEnabled, stopTime]);

  const formatPreview = (date: Date): string => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const day = isSameDay(date, today)
      ? t('schedule.today')
      : isSameDay(date, tomorrow)
        ? t('schedule.tomorrow')
        : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return `${day} ${formatScheduleTime(date)}`;
  };

  const handlePreset = (preset: SchedulePreset) => {
    const date = getPresetTime(preset);
    setStartTime(dateToTimeStr(date));
  };

  const handleSubmit = () => {
    if (!startDate) return;
    const config: ScheduleConfig = { startAt: startDate.getTime() };
    if (stopDate) {
      config.stopAt = stopDate.getTime();
    }
    onSchedule(config);
    setOpen(false);
    setStartTime('');
    setStopEnabled(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size={triggerVariant === 'inline' ? 'sm' : 'icon'}
          disabled={disabled}
          className={cn(
            triggerVariant === 'inline'
              ? 'h-7 gap-1.5 rounded-md border-dashed px-2 text-[11px] font-medium'
              : 'h-11 w-11 rounded-xl flex-shrink-0 bg-transparent border-border/50 hover:bg-white/10',
            triggerClassName,
          )}
          title={t('schedule.title')}
        >
          <Clock className={triggerVariant === 'inline' ? 'h-3 w-3' : 'h-5 w-5'} />
          {triggerVariant === 'inline' && <span>{triggerLabel ?? t('schedule.setSchedule')}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-80 p-3">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <AlarmClock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t('schedule.title')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('schedule.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              {t('schedule.quickPresets')}
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {SCHEDULE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handlePreset(preset)}
                  className={cn(
                    'min-h-8 px-2 py-1.5 text-xs font-medium rounded-lg transition-all',
                    'border border-border/50 hover:bg-muted/80 hover:border-border',
                    'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`schedule.preset_${preset}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-card/50 p-2.5">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('schedule.startAt')}
              </span>
              {startDate && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {formatPreview(startDate)}
                </span>
              )}
            </div>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div className="rounded-xl border border-border/50 bg-card/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {t('schedule.stopAt')}
              </span>
              {!stopEnabled ? (
                <button
                  type="button"
                  onClick={() => setStopEnabled(true)}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  {t('schedule.addStopTime')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStopEnabled(false)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <TimerOff className="h-3 w-3" />
                  {t('schedule.removeStopTime')}
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {stopEnabled && (
              <div className="mt-1.5 space-y-1.5">
                {stopDate && (
                  <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {formatPreview(stopDate)}
                  </span>
                )}
                <input
                  type="time"
                  value={stopTime}
                  onChange={(e) => setStopTime(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            )}
          </div>

          {startDate && (
            <div className="rounded-lg bg-primary/5 px-2.5 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('schedule.preview')}</span>{' '}
              {t('schedule.previewStart', { time: formatPreview(startDate) })}
              {stopDate ? ` · ${t('schedule.previewStop', { time: formatPreview(stopDate) })}` : ''}
            </div>
          )}

          <Button size="sm" className="w-full" onClick={handleSubmit} disabled={!startDate}>
            {t('schedule.setSchedule')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
