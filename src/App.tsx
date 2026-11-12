import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DenoDialog } from '@/components/DenoDialog';
import { DuplicateDownloadReviewHost } from '@/components/download';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { MeteorTransition } from '@/components/effects/MeteorTransition';
import type { Page } from '@/components/layout';
import { MainLayout } from '@/components/layout';
import { MusicPlayer } from '@/components/player';
import { SetupDialog } from '@/components/SetupDialog';
import type { SettingsSectionId } from '@/components/settings';
import { UpdateDialog } from '@/components/UpdateDialog';
import { ToastProvider } from '@/components/ui/toast';
import { AIProvider } from '@/contexts/AIContext';
import { ChannelsProvider } from '@/contexts/ChannelsContext';
import { DataExportProvider } from '@/contexts/DataExportContext';
import { DependenciesProvider, useDependencies } from '@/contexts/DependenciesContext';
import { DownloadProvider } from '@/contexts/DownloadContext';
import { useDownload } from '@/contexts/download-context';
import { GalleryDlProvider } from '@/contexts/GalleryDlContext';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { LogProvider } from '@/contexts/LogContext';
import { MetadataProvider } from '@/contexts/MetadataContext';
import { PlayerProvider } from '@/contexts/PlayerContext';
import { ProcessingProvider } from '@/contexts/ProcessingContext';
import { SubtitleProvider } from '@/contexts/SubtitleContext';
import { SummarySessionProvider } from '@/contexts/SummarySessionProvider';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { UniversalProvider } from '@/contexts/UniversalContext';
import { UpdaterProvider, useUpdater } from '@/contexts/UpdaterContext';
import { useExternalDownloadLinks } from '@/hooks/useExternalDownloadLinks';
import { usePluginExecutionToasts } from '@/hooks/usePluginExecutionToasts';
import { useTelegramRemoteCommands } from '@/hooks/useTelegramRemoteCommands';
import { useTrayDownloadStatus } from '@/hooks/useTrayDownloadStatus';
import { useTrayEvents } from '@/hooks/useTrayEvents';
import { useYtdlpAutoUpdateToast } from '@/hooks/useYtdlpAutoUpdateToast';
import {
  getApplicableSetupItems,
  getMissingSetupItems,
  hasSeenSetupDialog,
  markSetupDialogSeen,
  onOpenSetupDialogRequest,
  type SetupDependencyState,
  type SetupItem,
} from '@/lib/setup-dialog';
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

function AppContent() {
  const { i18n } = useTranslation('settings');
  const [currentPage, setCurrentPage] = useState<Page>('youtube');
  const [settingsInitialSection, setSettingsInitialSection] =
    useState<SettingsSectionId>('general');
  const [externalSummaryRequest, setExternalSummaryRequest] = useState<{
    id: number;
    url: string;
  } | null>(null);
  const [setupDialogItems, setSetupDialogItems] = useState<SetupItem[] | null>(null);
  const [setupChecked, setSetupChecked] = useState(false);
  const [showDenoDialog, setShowDenoDialog] = useState(false);
  const updater = useUpdater();
  const {
    ytdlpSource,
    ytdlpChannel,
    ytdlpAllVersions,
    channelError,
    ffmpegSource,
    ffmpegStatus,
    ffmpegLoading,
    isAutoDownloadingDeno,
    denoStatus,
    denoError,
    denoDownloading,
    denoSuccess,
  } = useDependencies();
  const { isTransitioning, oldMode, applyPendingTheme, onTransitionComplete } = useTheme();
  const externalStartLockRef = useRef({ youtube: false, universal: false });
  const externalSummaryRequestIdRef = useRef(0);

  const openSettingsPage = useCallback((section: SettingsSectionId = 'general') => {
    setSettingsInitialSection(section);
    setCurrentPage('settings');
  }, []);

  const openDependenciesSettings = useCallback(() => {
    openSettingsPage('dependencies');
  }, [openSettingsPage]);

  const openExternalSummary = useCallback((url: string) => {
    externalSummaryRequestIdRef.current += 1;
    setExternalSummaryRequest({
      id: externalSummaryRequestIdRef.current,
      url,
    });
    setCurrentPage('summary');
  }, []);

  const clearExternalSummaryRequest = useCallback(() => {
    setExternalSummaryRequest(null);
  }, []);

  useExternalDownloadLinks(setCurrentPage, externalStartLockRef, openExternalSummary);
  useTelegramRemoteCommands(setCurrentPage, externalStartLockRef);
  useTrayDownloadStatus();
  useTrayEvents(setCurrentPage, openSettingsPage, updater.checkForUpdate);
  usePluginExecutionToasts();
  useYtdlpAutoUpdateToast({
    onOpenDependencies: openDependenciesSettings,
  });

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

  const setupState: SetupDependencyState = {
    ytdlpSource,
    ytdlpChannel,
    ytdlpAllVersions,
    ffmpegSource,
    ffmpegStatus,
  };
  const setupStateRef = useRef(setupState);
  setupStateRef.current = setupState;

  // Startup checks are done once FFmpeg, the yt-dlp channel info and Deno have all been looked at.
  const setupStateReady =
    !ffmpegLoading &&
    ffmpegStatus !== null &&
    (ytdlpSource === 'system' || ytdlpAllVersions !== null || channelError !== null) &&
    (denoStatus !== null || denoError !== null);

  // First launch (or first launch after this dialog was added): suggest switching yt-dlp to
  // Stable and installing FFmpeg for high-quality downloads. Shown at most once automatically.
  useEffect(() => {
    if (setupChecked || !setupStateReady) return;
    // Let the Deno first-run install finish first so two dialogs never stack.
    if (showDenoDialog || denoDownloading) return;

    // Small delay to let the app render and late startup state settle.
    const timer = setTimeout(() => {
      setSetupChecked(true);
      if (hasSeenSetupDialog()) return;
      const missing = getMissingSetupItems(setupStateRef.current);
      if (missing.length === 0) {
        markSetupDialogSeen();
        return;
      }
      setSetupDialogItems(missing);
    }, 800);
    return () => clearTimeout(timer);
  }, [setupChecked, setupStateReady, showDenoDialog, denoDownloading]);

  // Manual open (e.g. from the download guide) lists every item that applies.
  useEffect(
    () =>
      onOpenSetupDialogRequest(() => {
        const items = getApplicableSetupItems(setupStateRef.current);
        if (items.length === 0) {
          openSettingsPage('dependencies');
          return;
        }
        setSetupDialogItems(items);
      }),
    [openSettingsPage],
  );

  const closeSetupDialog = useCallback(() => {
    markSetupDialogSeen();
    setSetupDialogItems(null);
  }, []);

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
            externalRequestId={externalSummaryRequest?.id}
            externalUrl={externalSummaryRequest?.url}
            onExternalRequestConsumed={clearExternalSummaryRequest}
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

      {setupDialogItems && (
        <SetupDialog
          items={setupDialogItems}
          onClose={closeSetupDialog}
          onOpenDependencies={openDependenciesSettings}
        />
      )}

      {showDenoDialog && <DenoDialog onDismiss={() => setShowDenoDialog(false)} />}
      <DuplicateDownloadReviewHost />
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
                        <SummarySessionProvider>
                          <ProcessingProvider>
                            <SubtitleProvider>
                              <MetadataProvider>
                                <DataExportProvider>
                                  <ToastProvider>
                                    <UpdaterWrapper>
                                      <AppContent />
                                    </UpdaterWrapper>
                                  </ToastProvider>
                                </DataExportProvider>
                              </MetadataProvider>
                            </SubtitleProvider>
                          </ProcessingProvider>
                        </SummarySessionProvider>
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
