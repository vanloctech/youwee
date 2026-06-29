import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import type { Page } from '@/components/layout';
import { useDownload } from '@/contexts/download-context';
import { useUniversal } from '@/contexts/universal-context';
import {
  type ExternalLinkAction,
  type ExternalLinkTarget,
  isPublicHttpUrl,
  isTrustedExternalSource,
  isYouTubeUrl,
  normalizeExternalVideoUrl,
  parseExternalDeepLink,
  parseExternalSummaryDeepLink,
} from '@/lib/external-link';
import type { ExternalEnqueueOptions, Quality, SubtitleFormat, SubtitleMode } from '@/lib/types';

type StartLockRef = MutableRefObject<{
  youtube: boolean;
  universal: boolean;
}>;

interface ExternalOpenUrlEventPayload {
  urls: string[];
}

interface CliDownloadRequestPayload {
  url: string;
  target: string;
  action: string;
  media: string;
  quality: string;
  output_path?: string | null;
  skip_live?: boolean;
  download_playlist?: boolean | null;
  subtitle_mode?: string;
  subtitle_langs?: string[];
  subtitle_embed?: boolean;
  subtitle_format?: string;
  download_sections?: string | null;
  live_from_start?: boolean;
  trusted_local?: boolean;
}

interface ExternalCliDownloadEventPayload {
  requests: CliDownloadRequestPayload[];
}

interface ExternalDownloadRequest {
  url: string;
  target: ExternalLinkTarget;
  action: ExternalLinkAction;
  enqueueOptions: ExternalEnqueueOptions;
  source: string | null;
  trustedLocal: boolean;
}

const ALLOWED_VIDEO_QUALITIES = new Set<Quality>([
  'best',
  '8k',
  '4k',
  '2k',
  '1080',
  '720',
  '480',
  '360',
]);
const ALLOWED_SUBTITLE_MODES = new Set<SubtitleMode>(['off', 'auto', 'manual']);
const ALLOWED_SUBTITLE_FORMATS = new Set<SubtitleFormat>(['srt', 'vtt', 'ass']);

function parseDownloadSections(section: string | null | undefined):
  | {
      timeRangeStart: string;
      timeRangeEnd: string;
    }
  | undefined {
  const normalized = section?.trim().replace(/^\*/, '') ?? '';
  const [start, end] = normalized.split('-', 2);
  if (!start || !end) return undefined;
  return { timeRangeStart: start, timeRangeEnd: end };
}

function normalizeCliOutputPath(path: string | null | undefined): string | undefined {
  const normalized = path?.trim().replace(/^['"]+|['"]+$/g, '') ?? '';
  const hasControlCharacter = [...normalized].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (!normalized || normalized.length > 4096 || hasControlCharacter) {
    return undefined;
  }
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('\\\\') ||
    normalized.startsWith('//') ||
    /^[A-Za-z]:[\\/]/.test(normalized)
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeCliDownloadRequest(
  payload: CliDownloadRequestPayload,
): ExternalDownloadRequest | null {
  const normalizedUrl = normalizeExternalVideoUrl(payload.url?.trim() ?? '');
  if (!isPublicHttpUrl(normalizedUrl)) return null;

  const target: ExternalLinkTarget =
    payload.target === 'youtube' || payload.target === 'universal' ? payload.target : 'auto';
  const action: ExternalLinkAction =
    payload.action === 'queue_only' ? 'queue_only' : 'download_now';
  const media = payload.media === 'audio' ? 'audio' : 'video';
  const qualityParam = payload.quality || '';

  const enqueueOptions: ExternalEnqueueOptions =
    media === 'audio'
      ? {
          mediaType: 'audio',
          quality: 'audio',
          audioBitrate: qualityParam === '128' ? '128' : 'auto',
        }
      : {
          mediaType: 'video',
          quality: ALLOWED_VIDEO_QUALITIES.has(qualityParam as Quality)
            ? (qualityParam as Quality)
            : 'best',
        };
  const outputPath = normalizeCliOutputPath(payload.output_path);
  const downloadSections = parseDownloadSections(payload.download_sections);
  if (outputPath) {
    enqueueOptions.outputPath = outputPath;
  }
  if (payload.skip_live === true) {
    enqueueOptions.skipLive = true;
  }
  if (payload.live_from_start === true) {
    enqueueOptions.liveFromStart = true;
  }
  if (typeof payload.download_playlist === 'boolean') {
    enqueueOptions.downloadPlaylist = payload.download_playlist;
  }
  if (downloadSections) {
    enqueueOptions.timeRangeStart = downloadSections.timeRangeStart;
    enqueueOptions.timeRangeEnd = downloadSections.timeRangeEnd;
  }
  if (ALLOWED_SUBTITLE_MODES.has(payload.subtitle_mode as SubtitleMode)) {
    enqueueOptions.subtitleMode = payload.subtitle_mode as SubtitleMode;
  }
  if (ALLOWED_SUBTITLE_FORMATS.has(payload.subtitle_format as SubtitleFormat)) {
    enqueueOptions.subtitleFormat = payload.subtitle_format as SubtitleFormat;
  }
  if (Array.isArray(payload.subtitle_langs) && payload.subtitle_langs.length > 0) {
    enqueueOptions.subtitleLangs = payload.subtitle_langs;
  }
  if (payload.subtitle_embed === true) {
    enqueueOptions.subtitleEmbed = true;
  }

  return {
    url: normalizedUrl,
    target,
    action,
    enqueueOptions,
    source: 'cli',
    trustedLocal: payload.trusted_local === true,
  };
}

export function useExternalDownloadLinks(
  setCurrentPage: (page: Page) => void,
  startLockRef: StartLockRef,
  handleExternalSummaryUrl?: (url: string) => void,
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

  const handleExternalDownloadRequest = useCallback(
    async (request: ExternalDownloadRequest) => {
      const now = Date.now();
      externalRequestRateRef.current = externalRequestRateRef.current.filter(
        (timestamp) => now - timestamp < 60_000,
      );
      if (externalRequestRateRef.current.length >= 20) {
        return;
      }
      externalRequestRateRef.current.push(now);

      const dedupeKey = JSON.stringify({
        action: request.action,
        target: request.target,
        url: request.url,
        ...request.enqueueOptions,
      });
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

      let allowAutoStart = request.action === 'download_now';
      if (allowAutoStart && !request.trustedLocal) {
        const host = (() => {
          try {
            return new URL(request.url).hostname;
          } catch {
            return 'this page';
          }
        })();
        const approvalKey = `${host}:${request.source ?? 'unknown'}`;
        const approvedUntil = externalApprovalCacheRef.current.get(approvalKey) ?? 0;
        if (approvedUntil <= now) {
          const sourceLabel = isTrustedExternalSource(request.source)
            ? request.source
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

      const routeTarget =
        request.target === 'auto'
          ? isYouTubeUrl(request.url)
            ? 'youtube'
            : 'universal'
          : request.target;
      if (routeTarget === 'youtube') {
        const downloadApi = downloadRef.current;
        setCurrentPage('youtube');
        await downloadApi.enqueueExternalUrl(request.url, request.enqueueOptions);

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
      await universalApi.enqueueExternalUrl(request.url, request.enqueueOptions);

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

  const handleExternalLink = useCallback(
    async (rawLink: string) => {
      const parsed = parseExternalDeepLink(rawLink);
      if (!parsed) {
        const summary = parseExternalSummaryDeepLink(rawLink);
        if (summary) {
          handleExternalSummaryUrl?.(summary.url);
        }
        return;
      }

      await handleExternalDownloadRequest({
        url: parsed.url,
        target: parsed.target,
        action: parsed.action,
        enqueueOptions: parsed.enqueueOptions,
        source: parsed.source,
        trustedLocal: false,
      });
    },
    [handleExternalDownloadRequest, handleExternalSummaryUrl],
  );

  const handleCliDownloadRequest = useCallback(
    async (payload: CliDownloadRequestPayload) => {
      const request = normalizeCliDownloadRequest(payload);
      if (!request) return;
      await handleExternalDownloadRequest(request);
    },
    [handleExternalDownloadRequest],
  );

  useEffect(() => {
    const unlisten = listen<ExternalOpenUrlEventPayload>('external-open-url', (event) => {
      for (const url of event.payload?.urls ?? []) {
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
    const unlisten = listen<ExternalCliDownloadEventPayload>('external-cli-download', (event) => {
      for (const request of event.payload?.requests ?? []) {
        void handleCliDownloadRequest(request);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleCliDownloadRequest]);

  useEffect(() => {
    let cancelled = false;

    const consumeStartupExternalLinks = async () => {
      const processedStartupLinks = new Set<string>();

      const collectStartupLinks = async (): Promise<string[]> => {
        const links = new Set<string>();

        try {
          const urls = await invoke<string[]>('consume_pending_external_links');
          for (const url of urls) {
            links.add(url);
          }
        } catch {
          // Ignore; app still works without extension integration.
        }

        try {
          const urls = await getCurrent();
          for (const url of urls ?? []) {
            links.add(url);
          }
        } catch {
          // Ignore; app still works without extension integration.
        }

        return [...links].filter((url) => !processedStartupLinks.has(url));
      };

      const drainStartupLinks = async () => {
        const urls = await collectStartupLinks();
        for (const url of urls) {
          if (cancelled) break;
          processedStartupLinks.add(url);
          await handleExternalLink(url);
        }
      };

      await drainStartupLinks();
      if (cancelled) return;

      await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (cancelled) return;
      await drainStartupLinks();
      if (cancelled) return;

      await new Promise((resolve) => window.setTimeout(resolve, 750));
      if (cancelled) return;
      await drainStartupLinks();
    };

    void consumeStartupExternalLinks();

    return () => {
      cancelled = true;
    };
  }, [handleExternalLink]);

  useEffect(() => {
    let cancelled = false;

    const consumePendingCliDownloadRequests = async () => {
      try {
        const requests = await invoke<CliDownloadRequestPayload[]>(
          'consume_pending_cli_download_requests',
        );
        for (const request of requests) {
          if (cancelled) break;
          await handleCliDownloadRequest(request);
        }
      } catch {
        // Ignore; app still works without CLI integration.
      }
    };

    void consumePendingCliDownloadRequests();

    return () => {
      cancelled = true;
    };
  }, [handleCliDownloadRequest]);
}
