import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DenoDialog } from '@/components/DenoDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MeteorTransition } from '@/components/effects/MeteorTransition';
import { FFmpegDialog } from '@/components/FFmpegDialog';
import type { Page } from '@/components/layout';
import { MainLayout } from '@/components/layout';
import { UpdateDialog } from '@/components/UpdateDialog';
import { AIProvider } from '@/contexts/AIContext';
import { ChannelsProvider } from '@/contexts/ChannelsContext';
import { DependenciesProvider, useDependencies } from '@/contexts/DependenciesContext';
import { DownloadProvider, useDownload } from '@/contexts/DownloadContext';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { LogProvider } from '@/contexts/LogContext';
import { MetadataProvider } from '@/contexts/MetadataContext';
import { ProcessingProvider } from '@/contexts/ProcessingContext';
import { SubtitleProvider } from '@/contexts/SubtitleContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { UniversalProvider, useUniversal } from '@/contexts/UniversalContext';
import { UpdaterProvider, useUpdater } from '@/contexts/UpdaterContext';
import { parseExternalDeepLink, resolveExternalRouteTarget } from '@/lib/external-link';
import {
  ChannelsPage,
  DownloadPage,
  HistoryPage,
  LogsPage,
  MetadataPage,
  ProcessingPage,
  SettingsPage,
  SubtitlesPage,
  SummaryPage,
  UniversalPage,
} from '@/pages';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('youtube');
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
      void updater.checkForUpdate();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updater.checkForUpdate]);

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

      const dedupeKey = `${parsed.action}:${parsed.target}:${parsed.url}:${parsed.enqueueOptions.mediaType ?? 'video'}:${parsed.enqueueOptions.quality ?? 'best'}:${parsed.enqueueOptions.audioBitrate ?? 'auto'}`;
      const now = Date.now();
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

      const routeTarget = resolveExternalRouteTarget(parsed.target, parsed.url);
      if (routeTarget === 'youtube') {
        setCurrentPage('youtube');
        await download.enqueueExternalUrl(parsed.url, parsed.enqueueOptions);

        if (
          parsed.action === 'download_now' &&
          !download.isDownloading &&
          !externalStartLockRef.current.youtube
        ) {
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

      if (
        parsed.action === 'download_now' &&
        !universal.isDownloading &&
        !externalStartLockRef.current.universal
      ) {
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
        {currentPage === 'settings' && <SettingsPage />}
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
            <ChannelsProvider>
              <LogProvider>
                <HistoryProvider>
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
                </HistoryProvider>
              </LogProvider>
            </ChannelsProvider>
          </UniversalProvider>
        </DownloadProvider>
      </DependenciesProvider>
    </ThemeProvider>
  );
}
