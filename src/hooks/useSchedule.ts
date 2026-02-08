import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScheduleConfig {
  startAt: number; // Unix timestamp ms
  stopAt?: number; // Unix timestamp ms (optional)
}

interface UseScheduleOptions {
  storageKey: string;
  onStart: () => void;
  onStop: () => void;
  isDownloading: boolean;
}

function loadSchedule(key: string): ScheduleConfig | null {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      // If startAt is in the past and we're not downloading, clear it
      if (parsed.startAt && parsed.startAt < Date.now()) {
        localStorage.removeItem(key);
        return null;
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveSchedule(key: string, schedule: ScheduleConfig | null) {
  if (schedule) {
    localStorage.setItem(key, JSON.stringify(schedule));
  } else {
    localStorage.removeItem(key);
  }
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function useSchedule({ storageKey, onStart, onStop, isDownloading }: UseScheduleOptions) {
  const [schedule, setScheduleState] = useState<ScheduleConfig | null>(() =>
    loadSchedule(storageKey),
  );
  const [countdown, setCountdown] = useState('');
  const startTriggeredRef = useRef(false);
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);

  // Keep refs in sync
  useEffect(() => {
    onStartRef.current = onStart;
    onStopRef.current = onStop;
  }, [onStart, onStop]);

  // When download completes and there's no more pending, clear schedule
  useEffect(() => {
    if (schedule && startTriggeredRef.current && !isDownloading) {
      // Download finished after schedule triggered - clear schedule
      setScheduleState(null);
      saveSchedule(storageKey, null);
      startTriggeredRef.current = false;
    }
  }, [isDownloading, schedule, storageKey]);

  // Timer: check schedule every second
  useEffect(() => {
    if (!schedule) {
      setCountdown('');
      return;
    }

    const tick = () => {
      const now = Date.now();

      // Check stop time first
      if (schedule.stopAt && now >= schedule.stopAt && isDownloading) {
        onStopRef.current();
        setScheduleState(null);
        saveSchedule(storageKey, null);
        startTriggeredRef.current = false;
        return;
      }

      // Check start time
      if (now >= schedule.startAt && !startTriggeredRef.current && !isDownloading) {
        startTriggeredRef.current = true;
        onStartRef.current();
        // If there's a stopAt, keep the schedule for stop monitoring
        if (!schedule.stopAt) {
          setScheduleState(null);
          saveSchedule(storageKey, null);
        }
        return;
      }

      // Update countdown
      const remaining = schedule.startAt - now;
      if (remaining > 0) {
        setCountdown(formatCountdown(remaining));
      } else if (schedule.stopAt && isDownloading) {
        const stopRemaining = schedule.stopAt - now;
        if (stopRemaining > 0) {
          setCountdown(`stops in ${formatCountdown(stopRemaining)}`);
        }
      }
    };

    tick(); // run immediately
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [schedule, isDownloading, storageKey]);

  // beforeunload warning
  useEffect(() => {
    if (!schedule) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [schedule]);

  const setSchedule = useCallback(
    (config: ScheduleConfig) => {
      startTriggeredRef.current = false;
      setScheduleState(config);
      saveSchedule(storageKey, config);
    },
    [storageKey],
  );

  const cancelSchedule = useCallback(() => {
    startTriggeredRef.current = false;
    setScheduleState(null);
    saveSchedule(storageKey, null);
  }, [storageKey]);

  return {
    schedule,
    countdown,
    isScheduled: !!schedule,
    setSchedule,
    cancelSchedule,
  };
}
