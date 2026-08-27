import { AlarmClock, CalendarClock, Check, Clock, Plus, TimerOff, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

function localInputToDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dateToLocalInput(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
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
  const [startValue, setStartValue] = useState('');
  const [stopEnabled, setStopEnabled] = useState(false);
  const [stopValue, setStopValue] = useState('');
  const startDate = useMemo(() => localInputToDate(startValue), [startValue]);
  const stopDate = useMemo(() => {
    if (!startDate || !stopEnabled || !stopValue) return null;
    const nextStopDate = localInputToDate(stopValue);
    if (!nextStopDate) return null;
    if (nextStopDate.getTime() <= startDate.getTime()) {
      nextStopDate.setDate(nextStopDate.getDate() + 1);
    }
    return nextStopDate;
  }, [startDate, stopEnabled, stopValue]);
  const selectedPreset = useMemo(() => {
    if (!startDate) return null;
    return (
      SCHEDULE_PRESETS.find((preset) => {
        const presetDate = getPresetTime(preset);
        return Math.abs(presetDate.getTime() - startDate.getTime()) < 60 * 1000;
      }) ?? null
    );
  }, [startDate]);

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
    setStartValue(dateToLocalInput(date));
    if (!stopValue) {
      const defaultStop = new Date(date);
      defaultStop.setHours(6, 0, 0, 0);
      if (defaultStop.getTime() <= date.getTime()) {
        defaultStop.setDate(defaultStop.getDate() + 1);
      }
      setStopValue(dateToLocalInput(defaultStop));
    }
  };

  const handleSubmit = () => {
    if (!startDate) return;
    const config: ScheduleConfig = { startAt: startDate.getTime() };
    if (stopDate) {
      config.stopAt = stopDate.getTime();
    }
    onSchedule(config);
    setOpen(false);
    setStartValue('');
    setStopEnabled(false);
    setStopValue('');
  };

  const resetDraft = () => {
    setStartValue('');
    setStopEnabled(false);
    setStopValue('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetDraft();
    }
  };

  const handleEnableStop = () => {
    setStopEnabled(true);
    if (stopValue) return;
    const baseDate = startDate ?? new Date(Date.now() + 60 * 60 * 1000);
    const defaultStop = new Date(baseDate);
    defaultStop.setHours(6, 0, 0, 0);
    if (defaultStop.getTime() <= baseDate.getTime()) {
      defaultStop.setDate(defaultStop.getDate() + 1);
    }
    setStopValue(dateToLocalInput(defaultStop));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
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
      </DialogTrigger>
      <DialogContent className="max-h-[min(calc(100vh-2rem),42rem)] w-[min(calc(100vw-2rem),26rem)] max-w-none gap-0 overflow-y-auto overflow-x-hidden rounded-3xl border-border/70 p-0 shadow-2xl sm:rounded-3xl">
        <div className="relative bg-card">
          <div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative border-b border-border/60 px-4 py-4 pe-12">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <CalendarClock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm font-semibold text-foreground">
                  {t('schedule.title')}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('schedule.subtitle')}
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="relative space-y-4 p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('schedule.quickPresets')}
                </p>
                {startDate && (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                    {formatPreview(startDate)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {SCHEDULE_PRESETS.map((preset) => {
                  const isSelected = selectedPreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handlePreset(preset)}
                      className={cn(
                        'flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                          : 'bg-muted/60 text-foreground hover:bg-muted',
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                      {t(`schedule.preset_${preset}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-border/60 bg-background/70 p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <AlarmClock className="h-3.5 w-3.5" />
                    </span>
                    {t('schedule.startAt')}
                  </div>
                  {startDate && (
                    <span className="text-[11px] font-medium text-primary">
                      {formatPreview(startDate)}
                    </span>
                  )}
                </div>
                <input
                  type="datetime-local"
                  value={startValue}
                  min={dateToLocalInput(new Date())}
                  onChange={(event) => setStartValue(event.target.value)}
                  className="h-10 w-full rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </div>

              <div
                className={cn(
                  'rounded-2xl border p-3 shadow-sm transition-colors',
                  stopEnabled
                    ? 'border-primary/20 bg-primary/5'
                    : 'border-border/60 bg-background/70',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-xl',
                        stopEnabled
                          ? 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      <TimerOff className="h-3.5 w-3.5" />
                    </span>
                    {t('schedule.stopAt')}
                  </div>
                  {!stopEnabled ? (
                    <button
                      type="button"
                      onClick={handleEnableStop}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t('schedule.addStopTime')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStopEnabled(false)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
                    >
                      {t('schedule.removeStopTime')}
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {stopEnabled && (
                  <div className="mt-3 space-y-2">
                    {stopDate && (
                      <span className="inline-flex rounded-full bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        {formatPreview(stopDate)}
                      </span>
                    )}
                    <input
                      type="datetime-local"
                      value={stopValue}
                      min={startDate ? dateToLocalInput(startDate) : dateToLocalInput(new Date())}
                      onChange={(event) => setStopValue(event.target.value)}
                      className="h-10 w-full rounded-xl border border-border/60 bg-card px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-muted/60 p-3">
              {startDate ? (
                <div className="flex items-start gap-2.5 text-xs leading-5 text-muted-foreground">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-background text-primary">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <p>
                    <span className="font-semibold text-foreground">{t('schedule.preview')}</span>{' '}
                    {t('schedule.previewStart', { time: formatPreview(startDate) })}
                    {stopDate
                      ? ` · ${t('schedule.previewStop', { time: formatPreview(stopDate) })}`
                      : ''}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <span>{t('schedule.startAt')}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border/60 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 flex-1 rounded-xl"
                onClick={() => handleOpenChange(false)}
              >
                {t('schedule.cancel')}
              </Button>
              <Button
                size="sm"
                className="h-10 flex-[1.4] rounded-xl font-semibold"
                onClick={handleSubmit}
                disabled={!startDate}
              >
                {t('schedule.setSchedule')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
