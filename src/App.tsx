import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DenoDialog } from '@/components/DenoDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MeteorTransition } from '@/components/effects/MeteorTransition';
import { FFmpegDialog } from '@/components/FFmpegDialog';
import type { Page } from '@/components/layout';
import { MainLayout } from '@/components/layout';
import { MusicPlayer } from '@/components/player';
import type { SettingsSectionId } from '@/components/settings';
import { UpdateDialog } from '@/components/UpdateDialog';
import { AIProvider } from '@/contexts/AIContext';
import { ChannelsProvider } from '@/contexts/ChannelsContext';
import { DependenciesProvider, useDependencies } from '@/contexts/DependenciesContext';
import { DownloadProvider, useDownload } from '@/contexts/DownloadContext';
import { GalleryDlProvider } from '@/contexts/GalleryDlContext';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { LogProvider } from '@/contexts/LogContext';
import { MetadataProvider } from '@/contexts/MetadataContext';
import { PlayerProvider } from '@/contexts/PlayerContext';
import { ProcessingProvider } from '@/contexts/ProcessingContext';
import { SubtitleProvider } from '@/contexts/SubtitleContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { UniversalProvider, useUniversal } from '@/contexts/UniversalContext';
import { UpdaterProvider, useUpdater } from '@/contexts/UpdaterContext';
import {
  isTrustedExternalSource,
  parseExternalDeepLink,
  resolveExternalRouteTarget,
} from '@/lib/external-link';
import {
  appendPluginToastOutput,
  type PluginToastState,
  upsertPluginToast,
} from '@/lib/plugin-toast';
import type { PluginExecutionOutputEvent, PluginExecutionStatusEvent } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  ChannelsPage,
  DownloadPage,
  GalleryPage,
  HistoryPage,
  LogsPage,
  MetadataPage,
  ProcessingPage,
  SettingsPage,
  SubtitlesPage,
  SummaryPage,
  UniversalPage,
} from '@/pages';

async function notify(title: string, body: string) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    if (granted) {
      sendNotification({ title, body });
    }
  } catch {
    // best effort only
  }
}

function AppContent() {
  const { t, i18n } = useTranslation('settings');
  const [currentPage, setCurrentPage] = useState<Page>('youtube');
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSectionId>('general');
  const [showFfmpegDialog, setShowFfmpegDialog] = useState(false);
  const [showDenoDialog, setShowDenoDialog] = useState(false);
  const [ffmpegChecked, setFfmpegChecked] = useState(false);
  const updater = useUpdater();
  const download = useDownload();
  const universal = useUniversal();
  const { ffmpegStatus, ffmpegLoading, isAutoDownloadingDeno, denoStatus, denoSuccess } =
    useDependencies();
  const { isTransitioning, oldMode, applyPendingTheme, onTransitionComplete } = useTheme();
  const externalDedupRef = useRef<Map<string, number>>(new Map());
  const externalStartLockRef = useRef({ youtube: false, universal: false });
  const externalRequestRateRef = useRef<number[]>([]);
  const externalApprovalCacheRef = useRef<Map<string, number>>(new Map());
  const pluginNotificationRef = useRef<Map<string, { status: string; at: number }>>(new Map());
  const activePluginRunRef = useRef<Map<string, string>>(new Map());
  const toastTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pluginRuntimeNameRef = useRef(new Map<string, string>());
  const [pluginToasts, setPluginToasts] = useState<PluginToastState[]>([]);

  useEffect(() => {
    const locale = i18n.resolvedLanguage || i18n.language || 'en';
    const direction =
      typeof document !== 'undefined' ? document.documentElement.dir || 'ltr' : 'ltr';

    void invoke('set_plugin_runtime_locale', {
      input: {
        locale,
        fallbackLocale: 'en',
        direction,
      },
    }).catch((error) => {
      console.error('Failed to sync plugin runtime locale:', error);
    });
  }, [i18n.language, i18n.resolvedLanguage]);

  const appendOutputToToast = useCallback(
    (
      pluginId: string,
      pluginName: string | undefined,
      runId: string | undefined,
      chunk: string,
      mediaTitle?: string,
      filename?: string,
      mediaUrl?: string,
    ) => {
      const activeRunId = runId ?? activePluginRunRef.current.get(pluginId) ?? 'unknown';
      setPluginToasts((current) =>
        appendPluginToastOutput(current, {
          pluginId,
          pluginName: pluginName ?? pluginRuntimeNameRef.current.get(pluginId),
          runId: activeRunId,
          chunk,
          mediaTitle,
          filename,
          mediaUrl,
        }),
      );
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setPluginToasts((current) => current.filter((item) => item.id !== id));
    const timeout = toastTimeoutRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      toastTimeoutRef.current.delete(id);
    }
  }, []);

  const pushPluginToast = useCallback(
    (
      pluginId: string,
      status: string,
      runId: string | undefined,
      pluginName?: string,
      message?: string,
      mediaTitle?: string,
      filename?: string,
      mediaUrl?: string,
      durationMs?: number,
    ) => {
      const normalizedRunId = runId ?? 'unknown';
      if (status === 'running') {
        activePluginRunRef.current.set(pluginId, normalizedRunId);
      }
      const toastId = `${pluginId}-${status}-${Date.now()}`;
      const resolvedMessage =
        message ||
        (status === 'running'
          ? `Plugin ${pluginName ?? pluginId} is running`
          : status === 'error'
            ? `Plugin ${pluginName ?? pluginId} failed`
            : `Plugin ${pluginName ?? pluginId} finished`);

      setPluginToasts((current) =>
        upsertPluginToast(current, {
          toastId,
          pluginId,
          runId: normalizedRunId,
          pluginName,
          mediaTitle,
          filename,
          mediaUrl,
          status,
          message: resolvedMessage,
        }),
      );

      if (durationMs === 0) {
        return;
      }
      const timeout = setTimeout(
        () => {
          removeToast(toastId);
        },
        durationMs ?? (status === 'running' ? 15000 : 7000),
      );
      toastTimeoutRef.current.set(toastId, timeout);
    },
    [removeToast],
  );

  const clearPluginToasts = useCallback(() => {
    for (const timeout of toastTimeoutRef.current.values()) {
      clearTimeout(timeout);
    }
    toastTimeoutRef.current.clear();
    setPluginToasts([]);
  }, []);

  // Show FFmpeg dialog on startup if not installed
  useEffect(() => {
    if (!ffmpegLoading && !ffmpegChecked) {
      setFfmpegChecked(true);
      if (ffmpegStatus && !ffmpegStatus.installed) {
        // Small delay to let the app render first
        const timer = setTimeout(() => {
          setShowFfmpegDialog(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [ffmpegStatus, ffmpegLoading, ffmpegChecked]);

  // Close FFmpeg dialog when FFmpeg gets installed
  useEffect(() => {
    if (ffmpegStatus?.installed && showFfmpegDialog) {
      setShowFfmpegDialog(false);
    }
  }, [ffmpegStatus, showFfmpegDialog]);

  // Show Deno dialog when auto-downloading on first launch
  useEffect(() => {
    if (isAutoDownloadingDeno && !showDenoDialog) {
      setShowDenoDialog(true);
    }
  }, [isAutoDownloadingDeno, showDenoDialog]);

  // Close Deno dialog when Deno gets installed successfully
  useEffect(() => {
    if ((denoStatus?.installed || denoSuccess) && showDenoDialog) {
      // Small delay to show success state
      const timer = setTimeout(() => {
        setShowDenoDialog(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [denoStatus, denoSuccess, showDenoDialog]);

  // Navigate to Channels page when a channel is clicked from the system tray
  useEffect(() => {
    const unlisten = listen<string>('tray-open-channel', () => {
      setCurrentPage('channels');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Check app updates from system tray action
  useEffect(() => {
    const unlisten = listen('tray-check-update', () => {
      setCurrentPage('settings');
      setSettingsInitialSection('about');
      void updater.checkForUpdate();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updater.checkForUpdate]);

  // Open settings page from system tray action
  useEffect(() => {
    const unlisten = listen('tray-open-settings', () => {
      setCurrentPage('settings');
      setSettingsInitialSection('general');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Open extension section from system tray action
  useEffect(() => {
    const unlisten = listen('tray-open-extension', () => {
      setCurrentPage('settings');
      setSettingsInitialSection('extension');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Show desktop notifications when plugins start / finish / fail
  useEffect(() => {
    const unlisten = listen<PluginExecutionStatusEvent>('plugin-execution-status', (event) => {
      const {
        pluginId,
        runId,
        pluginName,
        status,
        message,
        resolvedProvider,
        resolvedSource,
        mediaTitle,
        filename,
        mediaUrl,
      } = event.payload;
      const normalizedRunId = runId ?? activePluginRunRef.current.get(pluginId) ?? 'unknown';
      const now = Date.now();
      const notificationKey = `${pluginId}:${normalizedRunId}:${status}`;
      const last = pluginNotificationRef.current.get(notificationKey);
      if (last && last.status === status && now - last.at < 1500) {
        return;
      }
      if (pluginName) {
        pluginRuntimeNameRef.current.set(pluginId, pluginName);
      }
      activePluginRunRef.current.set(pluginId, normalizedRunId);

      const normalizedMessage = message ?? undefined;
      const normalizedPluginName =
        pluginName ||
        pluginRuntimeNameRef.current.get(pluginId) ||
        normalizedMessage?.replace('Running ', '').replace(' failed', '') ||
        undefined;

      if (status === 'running') {
        pluginNotificationRef.current.set(notificationKey, { status, at: now });
        const statusMessage =
          normalizedMessage || `Plugin ${normalizedPluginName ?? pluginId} is running`;
        void notify('Youwee Plugin', statusMessage);
        pushPluginToast(
          pluginId,
          status,
          normalizedRunId,
          normalizedPluginName,
          statusMessage,
          mediaTitle ?? undefined,
          filename ?? undefined,
          mediaUrl ?? undefined,
          status === 'running' ? 0 : 7000,
        );
        return;
      }

      if (status === 'error') {
        pluginNotificationRef.current.set(notificationKey, { status, at: now });
        const statusMessage =
          normalizedMessage || `Plugin ${normalizedPluginName ?? pluginId} failed`;
        const toastMessage =
          resolvedProvider || resolvedSource
            ? `${statusMessage}\n${resolvedProvider || ''} ${resolvedSource || ''}`.trim()
            : statusMessage;
        void notify('Youwee Plugin', statusMessage);
        pushPluginToast(
          pluginId,
          status,
          normalizedRunId,
          normalizedPluginName,
          toastMessage,
          mediaTitle ?? undefined,
          filename ?? undefined,
          mediaUrl ?? undefined,
          7000,
        );
        return;
      }

      if (status === 'success') {
        pluginNotificationRef.current.set(notificationKey, { status, at: now });
        const statusMessage =
          normalizedMessage || `Plugin ${normalizedPluginName ?? pluginId} finished successfully`;
        void notify('Youwee Plugin', statusMessage);
        pushPluginToast(
          pluginId,
          status,
          normalizedRunId,
          normalizedPluginName,
          statusMessage,
          mediaTitle ?? undefined,
          filename ?? undefined,
          mediaUrl ?? undefined,
          7000,
        );
      }
    });

    return () => {
      clearPluginToasts();
      unlisten.then((fn) => fn());
    };
  }, [clearPluginToasts, pushPluginToast]);

  // Stream plugin logs while they run
  useEffect(() => {
    const unlisten = listen<PluginExecutionOutputEvent>('plugin-execution-output', (event) => {
      const { pluginId, pluginName, runId, chunk, mediaTitle, filename, mediaUrl } = event.payload;
      if (pluginName) {
        pluginRuntimeNameRef.current.set(pluginId, pluginName);
      }
      appendOutputToToast(
        pluginId,
        pluginName ?? undefined,
        runId ?? undefined,
        chunk,
        mediaTitle ?? undefined,
        filename ?? undefined,
        mediaUrl ?? undefined,
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [appendOutputToToast]);

  // Sync UI language to system tray on mount
  useEffect(() => {
    const lang = localStorage.getItem('i18nextLng') || 'en';
    invoke('rebuild_tray_menu_cmd', { lang }).catch(() => {});

    // Sync hideDockOnClose preference to Rust on startup
    const hideDock = localStorage.getItem('youwee_hide_dock_on_close') === 'true';
    if (hideDock) {
      invoke('set_hide_dock_on_close', { hide: true }).catch(() => {});
    }
  }, []);

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
        setCurrentPage('youtube');
        await download.enqueueExternalUrl(parsed.url, parsed.enqueueOptions);

        if (allowAutoStart && !download.isDownloading && !externalStartLockRef.current.youtube) {
          externalStartLockRef.current.youtube = true;
          try {
            await download.startDownload();
          } finally {
            externalStartLockRef.current.youtube = false;
          }
        }
        return;
      }

      setCurrentPage('universal');
      await universal.enqueueExternalUrl(parsed.url, parsed.enqueueOptions);

      if (allowAutoStart && !universal.isDownloading && !externalStartLockRef.current.universal) {
        externalStartLockRef.current.universal = true;
        try {
          await universal.startDownload();
        } finally {
          externalStartLockRef.current.universal = false;
        }
      }
    },
    [
      download.enqueueExternalUrl,
      download.isDownloading,
      download.startDownload,
      universal.enqueueExternalUrl,
      universal.isDownloading,
      universal.startDownload,
    ],
  );

  // Handle deep links delivered by Rust runtime (single-instance callback).
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

  // Handle deep links on macOS via plugin event bridge.
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

  // Consume pending deep links captured before frontend mount (cold start).
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

  return (
    <>
      <MainLayout currentPage={currentPage} onPageChange={setCurrentPage}>
        {currentPage === 'youtube' && (
          <DownloadPage onNavigateToSettings={() => setCurrentPage('settings')} />
        )}
        {currentPage === 'universal' && (
          <UniversalPage onNavigateToSettings={() => setCurrentPage('settings')} />
        )}
        {currentPage === 'gallery' && (
          <GalleryPage onNavigateToSettings={() => setCurrentPage('settings')} />
        )}
        {currentPage === 'channels' && <ChannelsPage />}
        {currentPage === 'summary' && <SummaryPage />}
        {currentPage === 'processing' && (
          <ErrorBoundary
            fallbackTitle="Processing Error"
            fallbackMessage="The video processing page encountered an error. This may be caused by an unsupported video format or insufficient system resources."
          >
            <ProcessingPage />
          </ErrorBoundary>
        )}
        {currentPage === 'metadata' && <MetadataPage />}
        {currentPage === 'subtitles' && <SubtitlesPage />}
        {currentPage === 'library' && <HistoryPage />}
        {currentPage === 'logs' && <LogsPage />}
        {currentPage === 'settings' && <SettingsPage initialSection={settingsInitialSection} />}
        <MusicPlayer />
      </MainLayout>

      <UpdateDialog
        status={updater.status}
        updateInfo={updater.updateInfo}
        progress={updater.progress}
        error={updater.error}
        onDownload={updater.downloadAndInstall}
        onRestart={updater.restartApp}
        onDismiss={updater.dismissUpdate}
        onRetry={updater.checkForUpdate}
      />

      {showFfmpegDialog && <FFmpegDialog onDismiss={() => setShowFfmpegDialog(false)} />}

      {showDenoDialog && <DenoDialog onDismiss={() => setShowDenoDialog(false)} />}

      <div className="fixed top-4 right-4 z-50 flex w-[min(420px,calc(100%-2rem))] flex-col gap-3">
        {pluginToasts.map((toast) => {
          const icon =
            toast.status === 'running' ? (
              <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
            ) : toast.status === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            );
          const mediaLabel = toast.mediaTitle || toast.filename || toast.mediaUrl;
          const statusLabel =
            toast.status === 'running'
              ? t('download.pluginToastRunning')
              : toast.status === 'success'
                ? t('download.pluginToastSuccess')
                : t('download.pluginToastError');

          return (
            <div
              key={toast.id}
              className="toast-slide-in rounded-2xl border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur-sm"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 rounded-xl p-2',
                    toast.status === 'running' && 'bg-sky-500/10',
                    toast.status === 'success' && 'bg-emerald-500/10',
                    toast.status === 'error' && 'bg-red-500/10',
                  )}
                >
                  {icon}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {toast.pluginName ?? t('download.pluginToastFallbackTitle')}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{statusLabel}</p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => removeToast(toast.id)}
                      aria-label="Dismiss plugin notification"
                    >
                      ×
                    </button>
                  </div>

                  {mediaLabel && (
                    <div className="rounded-xl bg-muted/60 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('download.pluginToastVideoLabel')}
                      </p>
                      <p className="line-clamp-2 break-words text-xs font-medium text-foreground">
                        {mediaLabel}
                      </p>
                    </div>
                  )}

                  <p className="break-words text-xs leading-5 text-muted-foreground">
                    {toast.message}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <MeteorTransition
        isActive={isTransitioning}
        oldMode={oldMode}
        onRevealStart={applyPendingTheme}
        onComplete={onTransitionComplete}
      />
    </>
  );
}

// Wrapper to get settings and pass to UpdaterProvider
function UpdaterWrapper({ children }: { children: React.ReactNode }) {
  const { settings } = useDownload();

  return <UpdaterProvider autoCheck={settings.autoCheckUpdate}>{children}</UpdaterProvider>;
}

export function App() {
  return (
    <ThemeProvider>
      <DependenciesProvider>
        <DownloadProvider>
          <UniversalProvider>
            <GalleryDlProvider>
              <ChannelsProvider>
                <LogProvider>
                  <HistoryProvider>
                    <PlayerProvider>
                      <AIProvider>
                        <ProcessingProvider>
                          <SubtitleProvider>
                            <MetadataProvider>
                              <UpdaterWrapper>
                                <AppContent />
                              </UpdaterWrapper>
                            </MetadataProvider>
                          </SubtitleProvider>
                        </ProcessingProvider>
                      </AIProvider>
                    </PlayerProvider>
                  </HistoryProvider>
                </LogProvider>
              </ChannelsProvider>
            </GalleryDlProvider>
          </UniversalProvider>
        </DownloadProvider>
      </DependenciesProvider>
    </ThemeProvider>
  );
}
