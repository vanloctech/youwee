import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHistory } from '@/contexts/HistoryContext';
import { ensureAssetPathAccess } from '@/lib/asset-access';
import { reconcilePlayableAudioQueue } from '@/lib/player-queue';
import type { HistoryEntry } from '@/lib/types';

export type PlayMode = 'sequence' | 'repeat-one' | 'shuffle';

const PLAYER_ENTRY_KEYS: Array<keyof HistoryEntry> = [
  'id',
  'url',
  'title',
  'thumbnail',
  'filepath',
  'filesize',
  'duration',
  'quality',
  'format',
  'source',
  'downloaded_at',
  'file_exists',
  'summary',
  'time_range',
];

function areHistoryEntriesEqual(
  left: HistoryEntry | null | undefined,
  right: HistoryEntry | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  return PLAYER_ENTRY_KEYS.every((key) => left[key] === right[key]);
}

interface PlayerContextType {
  queue: HistoryEntry[];
  currentIndex: number;
  currentEntry: HistoryEntry | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  playbackRate: number;
  mode: PlayMode;
  playFrom: (queue: HistoryEntry[], index: number) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  setPlaybackRate: (rate: number) => void;
  setMode: (mode: PlayMode) => void;
  close: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { historyVersion } = useHistory();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queue, setQueue] = useState<HistoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('youwee_player_volume');
    return saved ? parseFloat(saved) : 1;
  });
  const [playbackRate, setPlaybackRateState] = useState(() => {
    const saved = localStorage.getItem('youwee_player_playback_rate');
    const parsed = saved ? parseFloat(saved) : 1;
    return Number.isFinite(parsed) ? parsed : 1;
  });
  const [mode, setModeState] = useState<PlayMode>(() => {
    return (localStorage.getItem('youwee_player_mode') as PlayMode) ?? 'sequence';
  });

  const getNextIndex = useCallback((current: number, total: number, m: PlayMode): number => {
    if (m === 'repeat-one') return current;
    if (m === 'shuffle') return Math.floor(Math.random() * total);
    return (current + 1) % total;
  }, []);

  // Use refs to keep the ended handler in sync without recreating the audio element.
  const modeRef = useRef(mode);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  // Monotonic id to ensure only the latest load/play request can win.
  const playRequestIdRef = useRef(0);

  const commitQueueState = useCallback((nextQueue: HistoryEntry[], nextIndex: number) => {
    queueRef.current = nextQueue;
    currentIndexRef.current = nextIndex;
    setQueue(nextQueue);
    setCurrentIndex(nextIndex);
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const loadAndPlayAtIndex = useCallback(
    async (queueToUse: HistoryEntry[], index: number, autoPlay: boolean = true) => {
      // Capture a unique id for this play request so that if multiple
      // requests overlap in time (e.g. user quickly clicks different
      // tracks), only the most recent one is allowed to actually
      // change the audio source and start playback.
      const requestId = ++playRequestIdRef.current;

      const audio = audioRef.current;
      if (!audio || queueToUse.length === 0) return;
      const entry = queueToUse[index];
      if (!entry) return;

      // Optimistically reset timing state so the UI reflects that
      // we are preparing a new track, but do not yet commit queue/index.
      audio.pause();
      audio.src = '';
      audio.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);

      try {
        const cleanPath = await ensureAssetPathAccess(entry.filepath);

        // If a newer request has been issued while we were awaiting
        // asset access, abandon this load to avoid older requests
        // overriding the user's latest choice.
        if (requestId !== playRequestIdRef.current) {
          return;
        }

        const latestAudio = audioRef.current;
        if (!latestAudio) return;

        // Commit queue/index only when this request is still the latest.
        commitQueueState(queueToUse, index);

        const src = convertFileSrc(cleanPath);
        latestAudio.pause();
        latestAudio.src = src;
        latestAudio.currentTime = 0;

        if (autoPlay) {
          const tryPlay = async (attempt: number) => {
            try {
              await latestAudio.play();
            } catch (err) {
              // On some setups the very first play attempt after launching the app
              // can fail while asset scopes/decoders warm up. Retry once so that
              // the user's first click still results in playback.
              if (attempt < 2) {
                setTimeout(() => {
                  void tryPlay(attempt + 1);
                }, 80);
              } else {
                console.warn('[Player] Failed to start playback after retry:', err);
                setIsPlaying(false);
              }
            }
          };

          void tryPlay(1);
        }
      } catch (error) {
        console.error('[Player] Failed to authorize asset path:', error);
        setIsPlaying(false);
      }
    },
    [commitQueueState],
  );

  // Init audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      const q = queueRef.current;
      const m = modeRef.current;
      const ci = currentIndexRef.current;
      if (q.length === 0) return;
      const next = getNextIndex(ci, q.length, m);
      void loadAndPlayAtIndex(q, next);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      console.error('[Player] Audio error:', audio.error?.message, 'src:', audio.src);
      setIsPlaying(false);

      const currentQueue = queueRef.current;
      const currentIndexSnapshot = currentIndexRef.current;
      const failedEntryId = currentQueue[currentIndexSnapshot]?.id;

      // If we don't have a valid current track or there's only one track,
      // keep the queue as-is and just stop playback so the user can retry.
      if (!failedEntryId || currentQueue.length <= 1) {
        return;
      }

      // For multi-track queues, skip the failed track but keep the player open.
      const nextQueue = currentQueue.filter((entry) => entry.id !== failedEntryId);
      if (nextQueue.length === 0) {
        return;
      }

      const nextIndex = Math.min(currentIndexSnapshot, nextQueue.length - 1);
      void loadAndPlayAtIndex(nextQueue, nextIndex);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, [getNextIndex, loadAndPlayAtIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const playFrom = useCallback(
    (newQueue: HistoryEntry[], index: number) => {
      void loadAndPlayAtIndex(newQueue, index);
    },
    [loadAndPlayAtIndex],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || queue.length === 0) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [queue.length]);

  const playNext = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const next = getNextIndex(currentIndexRef.current, q.length, modeRef.current);
    void loadAndPlayAtIndex(q, next);
  }, [getNextIndex, loadAndPlayAtIndex]);

  const playPrev = useCallback(() => {
    const q = queueRef.current;
    if (q.length === 0) return;
    const audio = audioRef.current;
    // If more than 3s in, restart current track; otherwise go to previous
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const prev = (currentIndexRef.current - 1 + q.length) % q.length;
    void loadAndPlayAtIndex(q, prev);
  }, [loadAndPlayAtIndex]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const maxTime = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : time;
    const nextTime = Math.min(maxTime, Math.max(0, time));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    localStorage.setItem('youwee_player_volume', String(clamped));
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2, rate));
    setPlaybackRateState(clamped);
    localStorage.setItem('youwee_player_playback_rate', String(clamped));
    if (audioRef.current) audioRef.current.playbackRate = clamped;
  }, []);

  const setMode = useCallback((m: PlayMode) => {
    setModeState(m);
    localStorage.setItem('youwee_player_mode', m);
  }, []);

  // Keep a ref of the latest queue/currentIndex for effects that shouldn't
  // re-run just because playback state changes.
  const close = useCallback(() => {
    // Invalidate any in-flight load/play requests so that they
    // cannot reopen the player after it has been closed.
    playRequestIdRef.current += 1;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    commitQueueState([], 0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [commitQueueState]);

  useEffect(() => {
    void historyVersion;
    const queuedIds = queueRef.current.map((entry) => entry.id);
    if (queuedIds.length === 0) return;

    let cancelled = false;

    const reconcileQueue = async () => {
      try {
        const latestEntries = await invoke<HistoryEntry[]>('get_history_entries_by_ids', {
          ids: queuedIds,
        });

        if (cancelled) return;

        const currentQueue = queueRef.current;
        const currentIndexSnapshot = currentIndexRef.current;

        if (
          currentQueue.length !== queuedIds.length ||
          currentQueue.some((entry, index) => entry.id !== queuedIds[index])
        ) {
          return;
        }

        const reconciled = reconcilePlayableAudioQueue(
          currentQueue,
          currentIndexSnapshot,
          latestEntries,
        );
        const sameQueue =
          reconciled.queue.length === currentQueue.length &&
          reconciled.currentIndex === currentIndexSnapshot &&
          reconciled.queue.every((entry, index) =>
            areHistoryEntriesEqual(entry, currentQueue[index]),
          );

        if (sameQueue) return;

        if (reconciled.queue.length === 0) {
          close();
          return;
        }

        const previousEntry = currentQueue[currentIndexSnapshot] ?? null;
        const nextEntry = reconciled.queue[reconciled.currentIndex] ?? null;
        const shouldReload =
          reconciled.currentIndex !== currentIndexSnapshot ||
          previousEntry?.id !== nextEntry?.id ||
          previousEntry?.filepath !== nextEntry?.filepath;

        if (shouldReload) {
          const audio = audioRef.current;
          const shouldAutoplay = audio ? !audio.paused : true;
          void loadAndPlayAtIndex(reconciled.queue, reconciled.currentIndex, shouldAutoplay);
          return;
        }

        commitQueueState(reconciled.queue, reconciled.currentIndex);
      } catch (error) {
        console.error('[Player] Failed to refresh queued history entries:', error);
      }
    };

    void reconcileQueue();

    return () => {
      cancelled = true;
    };
  }, [historyVersion, close, loadAndPlayAtIndex, commitQueueState]);

  const currentEntry = queue[currentIndex] ?? null;

  const value = useMemo(
    () => ({
      queue,
      currentIndex,
      currentEntry,
      isPlaying,
      duration,
      currentTime,
      volume,
      playbackRate,
      mode,
      playFrom,
      togglePlay,
      playNext,
      playPrev,
      seek,
      setVolume,
      setPlaybackRate,
      setMode,
      close,
    }),
    [
      queue,
      currentIndex,
      currentEntry,
      isPlaying,
      duration,
      currentTime,
      volume,
      playbackRate,
      mode,
      playFrom,
      togglePlay,
      playNext,
      playPrev,
      seek,
      setVolume,
      setPlaybackRate,
      setMode,
      close,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
