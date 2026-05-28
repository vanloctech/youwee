import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type MutableRefObject, useCallback, useEffect } from 'react';
import type { Page } from '@/components/layout';
import { useDownload } from '@/contexts/DownloadContext';
import { useUniversal } from '@/contexts/UniversalContext';
import { normalizeExternalVideoUrl, resolveExternalRouteTarget } from '@/lib/external-link';
import type { DownloadItem, ExternalEnqueueOptions, Quality } from '@/lib/types';
import { isSafeUrl } from '@/lib/utils';

interface TelegramDownloadCommandEvent {
  command: 'add' | 'download' | 'status' | 'queue' | 'stop';
  url?: string | null;
  quality?: string | null;
  chatId: string;
}

type StartLockRef = MutableRefObject<{
  youtube: boolean;
  universal: boolean;
}>;

type QueueSource = 'YouTube' | 'Universal';

interface QueueEntry {
  item: DownloadItem;
  source: QueueSource;
  index: number;
}

function summarizeItems(items: DownloadItem[]) {
  return items.reduce(
    (summary, item) => {
      if (item.status === 'pending') {
        summary.pending += 1;
      } else if (item.status === 'downloading' || item.status === 'fetching') {
        summary.downloading += 1;
      } else if (item.status === 'completed') {
        summary.completed += 1;
      } else if (item.status === 'error') {
        summary.error += 1;
      }
      return summary;
    },
    { pending: 0, downloading: 0, completed: 0, error: 0 },
  );
}

function truncateText(text: string, maxLength = 80) {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function formatQueueEntry(entry: QueueEntry, displayIndex: number) {
  const { item, source, index } = entry;
  const title = truncateText(item.title || item.url);
  const progress =
    item.status === 'downloading' || item.status === 'fetching' ? ` ${item.progress}%` : '';
  return `${displayIndex}. [${source} #${index + 1} ${item.status}${progress}] ${title}`;
}

function buildStatusReply(
  youtubeItems: DownloadItem[],
  universalItems: DownloadItem[],
  isDownloading: boolean,
) {
  const youtube = summarizeItems(youtubeItems);
  const universal = summarizeItems(universalItems);
  const total = {
    pending: youtube.pending + universal.pending,
    downloading: youtube.downloading + universal.downloading,
    completed: youtube.completed + universal.completed,
    error: youtube.error + universal.error,
  };
  const state =
    isDownloading || total.downloading > 0 ? 'Youwee is downloading.' : 'Youwee is idle.';

  return [
    state,
    `Pending: ${total.pending}`,
    `Downloading: ${total.downloading}`,
    `Completed: ${total.completed}`,
    `Error: ${total.error}`,
  ].join('\n');
}

function buildQueueReply(youtubeItems: DownloadItem[], universalItems: DownloadItem[]) {
  const entries: QueueEntry[] = [
    ...youtubeItems.map((item, index) => ({ item, source: 'YouTube' as const, index })),
    ...universalItems.map((item, index) => ({ item, source: 'Universal' as const, index })),
  ];

  if (entries.length === 0) {
    return 'Queue is empty.';
  }

  const activeEntries = entries.filter((entry) => entry.item.status !== 'completed');
  const recentEntries = (activeEntries.length > 0 ? activeEntries : entries).slice(-5).reverse();

  return [
    'Recent queue items:',
    ...recentEntries.map((entry, index) => formatQueueEntry(entry, index + 1)),
  ].join('\n');
}

function parseTelegramQuality(token?: string | null): ExternalEnqueueOptions | null {
  const normalized = token?.trim().toLowerCase();
  if (!normalized) return {};

  if (normalized === 'audio' || normalized === 'mp3') {
    return {
      mediaType: 'audio',
      quality: 'audio',
    };
  }

  const allowedQualities = new Set<Quality>([
    'best',
    '8k',
    '4k',
    '2k',
    '1080',
    '720',
    '480',
    '360',
  ]);

  if (allowedQualities.has(normalized as Quality)) {
    return {
      mediaType: 'video',
      quality: normalized as Quality,
    };
  }

  return null;
}

export function useTelegramRemoteCommands(
  setCurrentPage: (page: Page) => void,
  startLockRef: StartLockRef,
) {
  const download = useDownload();
  const universal = useUniversal();

  const sendTelegramReply = useCallback(async (chatId: string, text: string) => {
    try {
      await invoke('send_telegram_reply', { chatId, text });
    } catch (error) {
      console.error('Failed to send Telegram reply:', error);
    }
  }, []);

  const handleTelegramDownloadCommand = useCallback(
    async (payload: TelegramDownloadCommandEvent) => {
      if (payload.command === 'status') {
        await sendTelegramReply(
          payload.chatId,
          buildStatusReply(
            download.items,
            universal.items,
            download.isDownloading || universal.isDownloading,
          ),
        );
        return;
      }

      if (payload.command === 'queue') {
        await sendTelegramReply(payload.chatId, buildQueueReply(download.items, universal.items));
        return;
      }

      if (payload.command === 'stop') {
        const wasDownloading = download.isDownloading || universal.isDownloading;
        if (download.isDownloading) {
          await download.stopDownload();
        }
        if (universal.isDownloading) {
          await universal.stopDownload();
        }
        startLockRef.current.youtube = false;
        startLockRef.current.universal = false;
        await sendTelegramReply(
          payload.chatId,
          wasDownloading ? 'Stopped the current download.' : 'Youwee is not downloading.',
        );
        return;
      }

      if (!payload.url) {
        await sendTelegramReply(payload.chatId, 'No valid URL found in that command.');
        return;
      }

      const normalizedUrl = normalizeExternalVideoUrl(payload.url.trim());
      if (!isSafeUrl(normalizedUrl)) {
        await sendTelegramReply(payload.chatId, 'No valid URL found in that command.');
        return;
      }

      const enqueueOptions = parseTelegramQuality(payload.quality);
      if (!enqueueOptions) {
        await sendTelegramReply(
          payload.chatId,
          'Unsupported quality. Use: best, 8k, 4k, 2k, 1080, 720, 480, 360, audio, or mp3.',
        );
        return;
      }

      const routeTarget = resolveExternalRouteTarget('auto', normalizedUrl);

      try {
        if (routeTarget === 'youtube') {
          setCurrentPage('youtube');
          const result = await download.enqueueExternalUrl(normalizedUrl, enqueueOptions);
          if (!result.added) {
            await sendTelegramReply(payload.chatId, 'This URL is already in the Youwee queue.');
            return;
          }

          if (payload.command === 'download') {
            if (download.isDownloading || startLockRef.current.youtube) {
              await sendTelegramReply(
                payload.chatId,
                'Added to the queue. Youwee is already downloading.',
              );
              return;
            }

            startLockRef.current.youtube = true;
            void download.startDownload().finally(() => {
              startLockRef.current.youtube = false;
            });
            await sendTelegramReply(payload.chatId, 'Added to the queue and started download.');
            return;
          }

          await sendTelegramReply(payload.chatId, 'Added to the Youwee queue.');
          return;
        }

        setCurrentPage('universal');
        const result = await universal.enqueueExternalUrl(normalizedUrl, enqueueOptions);
        if (!result.added) {
          await sendTelegramReply(payload.chatId, 'This URL is already in the Youwee queue.');
          return;
        }

        if (payload.command === 'download') {
          if (universal.isDownloading || startLockRef.current.universal) {
            await sendTelegramReply(
              payload.chatId,
              'Added to the queue. Youwee is already downloading.',
            );
            return;
          }

          startLockRef.current.universal = true;
          void universal.startDownload().finally(() => {
            startLockRef.current.universal = false;
          });
          await sendTelegramReply(payload.chatId, 'Added to the queue and started download.');
          return;
        }

        await sendTelegramReply(payload.chatId, 'Added to the Youwee queue.');
      } catch (error) {
        console.error('Failed to handle Telegram command:', error);
        await sendTelegramReply(payload.chatId, 'Failed to add that URL to Youwee.');
      }
    },
    [
      download.enqueueExternalUrl,
      download.isDownloading,
      download.items,
      download.startDownload,
      download.stopDownload,
      sendTelegramReply,
      setCurrentPage,
      startLockRef,
      universal.enqueueExternalUrl,
      universal.isDownloading,
      universal.items,
      universal.startDownload,
      universal.stopDownload,
    ],
  );

  useEffect(() => {
    const unlisten = listen<TelegramDownloadCommandEvent>('telegram-download-command', (event) => {
      void handleTelegramDownloadCommand(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleTelegramDownloadCommand]);
}
