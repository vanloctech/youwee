import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef } from 'react';
import {
  clearPersistedDownloadQueue,
  loadPersistedDownloadQueue,
  type PersistedQueueKind,
  savePersistedDownloadQueueJson,
  serializeDownloadQueueItems,
} from '@/lib/persisted-download-queue';
import type { DownloadItem } from '@/lib/types';

const SAVE_DEBOUNCE_MS = 300;
const SAVE_MAX_WAIT_MS = 1000;

interface UsePersistedDownloadQueueOptions {
  queueKind: PersistedQueueKind;
  enabled: boolean;
  items: DownloadItem[];
  setItems: Dispatch<SetStateAction<DownloadItem[]>>;
  logLabel: string;
}

function mergeRestoredItems(
  savedItems: DownloadItem[],
  currentItems: DownloadItem[],
): DownloadItem[] {
  if (currentItems.length === 0) return savedItems;

  const restoredItems = savedItems.filter(
    (savedItem) =>
      !currentItems.some(
        (currentItem) => currentItem.id === savedItem.id || currentItem.url === savedItem.url,
      ),
  );

  return [...restoredItems, ...currentItems];
}

export function usePersistedDownloadQueue({
  queueKind,
  enabled,
  items,
  setItems,
  logLabel,
}: UsePersistedDownloadQueueOptions) {
  const hydratedRef = useRef(false);
  const itemsRef = useRef(items);
  const lastSavedJsonRef = useRef<string | null>(null);
  const pendingSaveJsonRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const maxWaitTimerRef = useRef<number | null>(null);
  const operationChainRef = useRef<Promise<void>>(Promise.resolve());
  const generationRef = useRef(0);
  const disabledClearedRef = useRef(false);

  const clearSaveTimers = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (maxWaitTimerRef.current !== null) {
      window.clearTimeout(maxWaitTimerRef.current);
      maxWaitTimerRef.current = null;
    }
  }, []);

  const enqueueOperation = useCallback((operation: () => Promise<void>) => {
    operationChainRef.current = operationChainRef.current
      .catch(() => undefined)
      .then(operation)
      .catch((error) => {
        console.error(error);
      });
  }, []);

  const flushLatestQueue = useCallback(() => {
    clearSaveTimers();

    const itemsJson = serializeDownloadQueueItems(itemsRef.current);
    if (itemsJson === lastSavedJsonRef.current || itemsJson === pendingSaveJsonRef.current) {
      return;
    }

    pendingSaveJsonRef.current = itemsJson;
    const generation = generationRef.current;

    enqueueOperation(async () => {
      if (generation !== generationRef.current) return;

      await savePersistedDownloadQueueJson(queueKind, itemsJson);

      if (generation === generationRef.current && pendingSaveJsonRef.current === itemsJson) {
        lastSavedJsonRef.current = itemsJson;
        pendingSaveJsonRef.current = null;
      }
    });
  }, [clearSaveTimers, enqueueOperation, queueKind]);

  const scheduleSave = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(flushLatestQueue, SAVE_DEBOUNCE_MS);

    if (maxWaitTimerRef.current === null) {
      maxWaitTimerRef.current = window.setTimeout(flushLatestQueue, SAVE_MAX_WAIT_MS);
    }
  }, [flushLatestQueue]);

  useEffect(() => {
    if (hydratedRef.current) return;

    let cancelled = false;

    if (!enabled) {
      hydratedRef.current = true;
      generationRef.current += 1;
      disabledClearedRef.current = true;
      enqueueOperation(() => clearPersistedDownloadQueue(queueKind));
      return () => {
        cancelled = true;
      };
    }

    loadPersistedDownloadQueue(queueKind)
      .then((savedItems) => {
        if (cancelled) return;
        hydratedRef.current = true;
        lastSavedJsonRef.current = serializeDownloadQueueItems(savedItems);
        if (savedItems.length > 0) {
          setItems((currentItems) => mergeRestoredItems(savedItems, currentItems));
        }
      })
      .catch((error) => {
        console.error(`Failed to load persisted ${logLabel}:`, error);
        hydratedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, enqueueOperation, logLabel, queueKind, setItems]);

  useEffect(() => {
    itemsRef.current = items;

    if (!hydratedRef.current) return;

    if (!enabled) {
      if (disabledClearedRef.current) return;

      generationRef.current += 1;
      disabledClearedRef.current = true;
      clearSaveTimers();
      pendingSaveJsonRef.current = null;
      lastSavedJsonRef.current = null;

      enqueueOperation(async () => {
        await clearPersistedDownloadQueue(queueKind);
      });
      return;
    }

    disabledClearedRef.current = false;
    scheduleSave();
  }, [clearSaveTimers, enabled, enqueueOperation, items, queueKind, scheduleSave]);

  useEffect(() => {
    return () => {
      clearSaveTimers();
    };
  }, [clearSaveTimers]);
}
