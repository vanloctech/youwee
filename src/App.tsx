import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
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
import { ToastProvider, useToast } from '@/components/ui/toast';
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
import { createPluginToastId, formatPluginToastText } from '@/lib/plugin-toast';
import type { PluginExecutionOutputEvent, PluginExecutionStatusEvent } from '@/lib/types';
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
  const { i18n } = useTranslation('settings');
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
  const pluginRuntimeNameRef = useRef(new Map<string, string>());
  const toast = useToast();

  const openSettingsPage = useCallback((section: SettingsSectionId = 'general') => {
    setSettingsInitialSection(section);
    setCurrentPage('settings');
  }, []);

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
      const normalizedChunk = formatPluginToastText(chunk).trimEnd();
      if (!normalizedChunk) {
        return;
      }

      const resolvedPluginName = pluginName ?? pluginRuntimeNameRef.current.get(pluginId);
      toast.show({
        id: createPluginToastId(pluginId, activeRunId),
        layout: 'plugin-run',
        variant: 'loading',
        title: resolvedPluginName ?? '',
        message: normalizedChunk,
        durationMs: 0,
        pluginRun: {
          pluginId,
          runId: activeRunId,
          pluginName: resolvedPluginName,
          mediaTitle,
          filename,
          mediaUrl,
          status: 'running',
        },
      });
    },
    [toast],
  );

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
      runtimeError?: {
        errorKind?: string | null;
        errorResource?: string | null;
        details?: string | null;
      },
    ) => {
      const normalizedRunId = runId ?? 'unknown';
      const toastId = createPluginToastId(pluginId, normalizedRunId);
      if (status === 'running') {
        activePluginRunRef.current.set(pluginId, normalizedRunId);
      }
      const resolvedMessage =
        message ||
        (status === 'running'
          ? `Plugin ${pluginName ?? pluginId} is running`
          : status === 'error'
            ? `Plugin ${pluginName ?? pluginId} failed`
            : `Plugin ${pluginName ?? pluginId} finished`);
      const resolvedPluginName = pluginName ?? pluginRuntimeNameRef.current.get(pluginId);
      const toastStatus =
        status === 'error' ? 'error' : status === 'success' ? 'success' : 'running';

      toast.show({
        id: toastId,
        layout: 'plugin-run',
        variant:
          toastStatus === 'running' ? 'loading' : toastStatus === 'error' ? 'error' : 'success',
        title: resolvedPluginName ?? '',
        message: resolvedMessage,
        durationMs: durationMs ?? (toastStatus === 'running' ? 0 : 7000),
        pluginRun: {
          pluginId,
          runId: normalizedRunId,
          pluginName: resolvedPluginName,
          mediaTitle,
          filename,
          mediaUrl,
          status: toastStatus,
          errorKind: runtimeError?.errorKind,
          errorResource: runtimeError?.errorResource,
          details: runtimeError?.details,
        },
      });
    },
    [toast],
  );

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
      openSettingsPage('about');
      void updater.checkForUpdate();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openSettingsPage, updater.checkForUpdate]);

  // Open settings page from system tray action
  useEffect(() => {
    const unlisten = listen('tray-open-settings', () => {
      openSettingsPage('general');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openSettingsPage]);

  // Open extension section from system tray action
  useEffect(() => {
    const unlisten = listen('tray-open-extension', () => {
      openSettingsPage('extension');
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [openSettingsPage]);

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
        details,
        errorKind,
        errorResource,
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
          !errorKind && (resolvedProvider || resolvedSource)
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
          { errorKind, errorResource, details },
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
      unlisten.then((fn) => fn());
    };
  }, [pushPluginToast]);

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
          <DownloadPage onNavigateToSettings={() => openSettingsPage('general')} />
        )}
        {currentPage === 'universal' && (
          <UniversalPage onNavigateToSettings={() => openSettingsPage('general')} />
        )}
        {currentPage === 'gallery' && (
          <GalleryPage onNavigateToSettings={() => openSettingsPage('general')} />
        )}
        {currentPage === 'channels' && <ChannelsPage />}
        {currentPage === 'summary' && (
          <SummaryPage
            onNavigateToSettings={(section) => {
              openSettingsPage(section === 'ai' ? 'ai' : 'general');
            }}
          />
        )}
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
                              <ToastProvider>
                                <UpdaterWrapper>
                                  <AppContent />
                                </UpdaterWrapper>
                              </ToastProvider>
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
