import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import type { Page } from '@/components/layout';
import { useDownload } from '@/contexts/DownloadContext';
import { useUniversal } from '@/contexts/UniversalContext';
import {
  isTrustedExternalSource,
  parseExternalDeepLink,
  resolveExternalRouteTarget,
} from '@/lib/external-link';

type StartLockRef = MutableRefObject<{
  youtube: boolean;
  universal: boolean;
}>;

export function useExternalDownloadLinks(
  setCurrentPage: (page: Page) => void,
  startLockRef: StartLockRef,
) {
  const download = useDownload();
  const universal = useUniversal();
  const downloadRef = useRef(download);
  const universalRef = useRef(universal);
  const externalDedupRef = useRef<Map<string, number>>(new Map());
  const externalRequestRateRef = useRef<number[]>([]);
  const externalApprovalCacheRef = useRef<Map<string, number>>(new Map());

  downloadRef.current = download;
  universalRef.current = universal;

  const handleExternalLink = useCallback(
    async (rawLink: string) => {
      const parsed = parseExternalDeepLink(rawLink);
      if (!parsed) return;

      const now = Date.now();
      externalRequestRateRef.current = externalRequestRateRef.current.filter(
        (timestamp) => now - timestamp < 60_000,
      );
      if (externalRequestRateRef.current.length >= 20) {
        return;
      }
      externalRequestRateRef.current.push(now);

      const dedupeKey = `${parsed.action}:${parsed.target}:${parsed.url}:${parsed.enqueueOptions.mediaType ?? 'video'}:${parsed.enqueueOptions.quality ?? 'best'}:${parsed.enqueueOptions.audioBitrate ?? 'auto'}`;
      const lastSeen = externalDedupRef.current.get(dedupeKey);
      if (lastSeen && now - lastSeen < 1500) {
        return;
      }
      externalDedupRef.current.set(dedupeKey, now);

      for (const [key, seenAt] of externalDedupRef.current.entries()) {
        if (now - seenAt > 15000) {
          externalDedupRef.current.delete(key);
        }
      }

      let allowAutoStart = parsed.action === 'download_now';
      if (allowAutoStart) {
        const host = (() => {
          try {
            return new URL(parsed.url).hostname;
          } catch {
            return 'this page';
          }
        })();
        const approvalKey = `${host}:${parsed.source ?? 'unknown'}`;
        const approvedUntil = externalApprovalCacheRef.current.get(approvalKey) ?? 0;
        if (approvedUntil <= now) {
          const sourceLabel = isTrustedExternalSource(parsed.source)
            ? parsed.source
            : 'unknown source';
          const confirmed = window.confirm(
            `External request from ${sourceLabel} wants to start downloading immediately for ${host}.\n\nPress OK to start now, or Cancel to only add this item to queue.`,
          );
          if (!confirmed) {
            allowAutoStart = false;
          } else {
            externalApprovalCacheRef.current.set(approvalKey, now + 30_000);
          }
        }
      }

      const routeTarget = resolveExternalRouteTarget(parsed.target, parsed.url);
      if (routeTarget === 'youtube') {
        const downloadApi = downloadRef.current;
        setCurrentPage('youtube');
        await downloadApi.enqueueExternalUrl(parsed.url, parsed.enqueueOptions);

        if (allowAutoStart && !downloadApi.isDownloading && !startLockRef.current.youtube) {
          startLockRef.current.youtube = true;
          try {
            await downloadApi.startDownload();
          } finally {
            startLockRef.current.youtube = false;
          }
        }
        return;
      }

      const universalApi = universalRef.current;
      setCurrentPage('universal');
      await universalApi.enqueueExternalUrl(parsed.url, parsed.enqueueOptions);

      if (allowAutoStart && !universalApi.isDownloading && !startLockRef.current.universal) {
        startLockRef.current.universal = true;
        try {
          await universalApi.startDownload();
        } finally {
          startLockRef.current.universal = false;
        }
      }
    },
    [setCurrentPage, startLockRef],
  );

  useEffect(() => {
    const unlisten = listen<{ urls: string[] }>('external-open-url', (event) => {
      const urls = event.payload?.urls ?? [];
      for (const url of urls) {
        void handleExternalLink(url);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleExternalLink]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    onOpenUrl((urls) => {
      for (const url of urls) {
        void handleExternalLink(url);
      }
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {});

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [handleExternalLink]);

  useEffect(() => {
    let cancelled = false;

    const consumePendingExternalLinks = async () => {
      try {
        const urls = await invoke<string[]>('consume_pending_external_links');
        for (const url of urls) {
          if (cancelled) break;
          await handleExternalLink(url);
        }
      } catch {
        // Ignore; app still works without extension integration.
      }
    };

    void consumePendingExternalLinks();

    return () => {
      cancelled = true;
    };
  }, [handleExternalLink]);
}
