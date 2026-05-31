import { invoke } from '@tauri-apps/api/core';
import type { DownloadItem } from './types';

export type PersistedQueueKind = 'youtube' | 'universal' | 'gallery';

function normalizeQueueItem(item: DownloadItem): DownloadItem {
  const isTransient = item.status === 'fetching' || item.status === 'downloading';
  const shouldResetProgress = isTransient || item.retryState !== undefined;
  const shouldClearError = isTransient || item.status !== 'error';

  return {
    ...item,
    status: isTransient ? 'pending' : item.status,
    progress: shouldResetProgress ? 0 : item.progress,
    speed: '',
    eta: '',
    error: shouldClearError ? undefined : item.error,
    downloadedSize: isTransient ? undefined : item.downloadedSize,
    elapsedTime: isTransient ? undefined : item.elapsedTime,
    retryState: undefined,
  };
}

export function normalizeDownloadQueueItems(items: DownloadItem[]): DownloadItem[] {
  return items.map(normalizeQueueItem);
}

export function serializeDownloadQueueItems(items: DownloadItem[]): string {
  return JSON.stringify(normalizeDownloadQueueItems(items));
}

export async function loadPersistedDownloadQueue(
  queueKind: PersistedQueueKind,
): Promise<DownloadItem[]> {
  const itemsJson = await invoke<string | null>('load_download_queue', { queueKind });
  if (!itemsJson) return [];

  const parsed = JSON.parse(itemsJson) as unknown;
  if (!Array.isArray(parsed)) return [];

  return normalizeDownloadQueueItems(parsed as DownloadItem[]);
}

export async function savePersistedDownloadQueueJson(
  queueKind: PersistedQueueKind,
  itemsJson: string,
): Promise<void> {
  await invoke('save_download_queue', {
    queueKind,
    itemsJson,
  });
}

export async function clearPersistedDownloadQueue(queueKind: PersistedQueueKind): Promise<void> {
  await invoke('clear_download_queue', { queueKind });
}
