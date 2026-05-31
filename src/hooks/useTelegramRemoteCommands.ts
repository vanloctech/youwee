import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import type { Page } from '@/components/layout';
import { useDownload } from '@/contexts/DownloadContext';
import { useUniversal } from '@/contexts/UniversalContext';
import { normalizeExternalVideoUrl, resolveExternalRouteTarget } from '@/lib/external-link';
import type { DownloadItem, ExternalEnqueueOptions, Quality } from '@/lib/types';
import { isSafeUrl } from '@/lib/utils';

interface TelegramDownloadCommandEvent {
  command: 'add' | 'download' | 'status' | 'queue' | 'run' | 'stop';
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

function statusIcon(status: DownloadItem['status']) {
  if (status === 'pending') return '⏳';
  if (status === 'downloading' || status === 'fetching') return '⬇️';
  if (status === 'completed') return '✅';
  if (status === 'error') return '❌';
  return '•';
}

function formatStatusLabel(status: DownloadItem['status']) {
  if (status === 'fetching') return 'fetching';
  return status;
}

function formatQueueEntry(entry: QueueEntry, displayIndex: number) {
  const { item, source, index } = entry;
  const title = truncateText(item.title || item.url, 90);
  const progress =
    item.status === 'downloading' || item.status === 'fetching' ? ` · ${item.progress}%` : '';
  return [
    `${displayIndex}. ${statusIcon(item.status)} ${formatStatusLabel(item.status)}${progress}`,
    `${source} #${index + 1}`,
    title,
  ].join('\n');
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
  const isActive = isDownloading || total.downloading > 0;
  const totalItems = total.pending + total.downloading + total.completed + total.error;

  return [
    `${isActive ? '⬇️' : '🟢'} Youwee ${isActive ? 'is downloading' : 'is idle'}`,
    '',
    '📊 Queue status',
    `⏳ Pending: ${total.pending}`,
    `⬇️ Downloading: ${total.downloading}`,
    `✅ Completed: ${total.completed}`,
    `❌ Error: ${total.error}`,
    '',
    `📦 Total: ${totalItems}`,
  ].join('\n');
}

function buildQueueReply(youtubeItems: DownloadItem[], universalItems: DownloadItem[]) {
  const entries: QueueEntry[] = [
    ...youtubeItems.map((item, index) => ({ item, source: 'YouTube' as const, index })),
    ...universalItems.map((item, index) => ({ item, source: 'Universal' as const, index })),
  ];

  if (entries.length === 0) {
    return ['📭 Queue is empty.', '', 'Send a link or use /add <url> to add one.'].join('\n');
  }

  const activeEntries = entries.filter((entry) => entry.item.status !== 'completed');
  const recentEntries = (activeEntries.length > 0 ? activeEntries : entries).slice(-5).reverse();

  return [
    '📋 Recent queue items',
    '',
    recentEntries.map((entry, index) => formatQueueEntry(entry, index + 1)).join('\n\n'),
  ].join('\n');
}

function hasStartableItems(items: DownloadItem[]) {
  return items.some((item) => item.status === 'pending' || item.status === 'error');
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
  const latestRef = useRef({ download, setCurrentPage, universal });
  latestRef.current = { download, setCurrentPage, universal };

  const sendTelegramReply = useCallback(async (chatId: string, text: string) => {
    try {
      await invoke('send_telegram_reply', { chatId, text });
    } catch (error) {
      console.error('Failed to send Telegram reply:', error);
    }
  }, []);

  const handleTelegramDownloadCommand = useCallback(
    async (payload: TelegramDownloadCommandEvent) => {
      const { download, setCurrentPage, universal } = latestRef.current;

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

      if (payload.command === 'run') {
        const isBusy =
          download.isDownloading ||
          universal.isDownloading ||
          startLockRef.current.youtube ||
          startLockRef.current.universal;

        if (isBusy) {
          await sendTelegramReply(payload.chatId, 'Youwee is already downloading.');
          return;
        }

        const shouldStartYoutube = hasStartableItems(download.items);
        const shouldStartUniversal = hasStartableItems(universal.items);

        if (!shouldStartYoutube && !shouldStartUniversal) {
          await sendTelegramReply(payload.chatId, 'No pending downloads in the queue.');
          return;
        }

        if (shouldStartYoutube) {
          setCurrentPage('youtube');
          startLockRef.current.youtube = true;
          void download.startDownload().finally(() => {
            startLockRef.current.youtube = false;
          });
        }

        if (shouldStartUniversal) {
          if (!shouldStartYoutube) {
            setCurrentPage('universal');
          }
          startLockRef.current.universal = true;
          void universal.startDownload().finally(() => {
            startLockRef.current.universal = false;
          });
        }

        await sendTelegramReply(payload.chatId, 'Started pending downloads.');
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
    [sendTelegramReply, startLockRef],
  );

  useEffect(() => {
    let disposed = false;
    const unlistenPromise = listen<TelegramDownloadCommandEvent>(
      'telegram-download-command',
      (event) => {
        void handleTelegramDownloadCommand(event.payload);
      },
    );

    unlistenPromise.then((unlisten) => {
      if (disposed) {
        unlisten();
      }
    });

    return () => {
      disposed = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [handleTelegramDownloadCommand]);
}
