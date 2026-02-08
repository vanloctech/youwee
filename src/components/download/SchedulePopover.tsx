import { Clock, X } from 'lucide-react';
import { useState } from 'react';
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
}

function getPresetTime(preset: 'in1h' | 'in3h' | 'tonight' | 'tomorrow'): Date {
  const now = new Date();
  switch (preset) {
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

function timeToDate(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  // If time is in the past, assume tomorrow
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function dateToTimeStr(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function SchedulePopover({ onSchedule, disabled, ns }: SchedulePopoverProps) {
  const { t } = useTranslation(ns);
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [stopEnabled, setStopEnabled] = useState(false);
  const [stopTime, setStopTime] = useState('06:00');

  const handlePreset = (preset: 'in1h' | 'in3h' | 'tonight' | 'tomorrow') => {
    const date = getPresetTime(preset);
    setStartTime(dateToTimeStr(date));
  };

  const handleSubmit = () => {
    if (!startTime) return;
    const startDate = timeToDate(startTime);
    const config: ScheduleConfig = { startAt: startDate.getTime() };
    if (stopEnabled && stopTime) {
      const stopDate = timeToDate(stopTime);
      // Ensure stop is after start
      if (stopDate.getTime() <= startDate.getTime()) {
        stopDate.setDate(stopDate.getDate() + 1);
      }
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
          size="icon"
          disabled={disabled}
          className="h-11 w-11 rounded-xl flex-shrink-0 bg-transparent border-border/50 hover:bg-white/10"
          title={t('schedule.title')}
        >
          <Clock className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="center" className="w-72 p-3">
        <div className="space-y-3">
          {/* Header */}
          <p className="text-sm font-medium">{t('schedule.title')}</p>

          {/* Quick presets */}
          <div className="grid grid-cols-2 gap-1.5">
            {(['in1h', 'in3h', 'tonight', 'tomorrow'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handlePreset(preset)}
                className={cn(
                  'px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all',
                  'border border-border/50 hover:bg-muted/80 hover:border-border',
                  'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`schedule.preset_${preset}`)}
              </button>
            ))}
          </div>

          {/* Custom start time */}
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">{t('schedule.startAt')}</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Stop at (optional) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('schedule.stopAt')}</span>
              {!stopEnabled ? (
                <button
                  type="button"
                  onClick={() => setStopEnabled(true)}
                  className="text-[10px] text-primary hover:underline"
                >
                  {t('schedule.addStopTime')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStopEnabled(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            {stopEnabled && (
              <input
                type="time"
                value={stopTime}
                onChange={(e) => setStopTime(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border/50 bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
          </div>

          {/* Submit */}
          <Button size="sm" className="w-full" onClick={handleSubmit} disabled={!startTime}>
            {t('schedule.setSchedule')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
