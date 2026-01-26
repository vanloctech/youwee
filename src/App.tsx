import { useEffect, useState } from 'react';
import { FFmpegDialog } from '@/components/FFmpegDialog';
import type { Page } from '@/components/layout';
import { MainLayout } from '@/components/layout';
import { UpdateDialog } from '@/components/UpdateDialog';
import { AIProvider } from '@/contexts/AIContext';
import { DependenciesProvider, useDependencies } from '@/contexts/DependenciesContext';
import { DownloadProvider, useDownload } from '@/contexts/DownloadContext';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { LogProvider } from '@/contexts/LogContext';
import { ProcessingProvider } from '@/contexts/ProcessingContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { UniversalProvider } from '@/contexts/UniversalContext';
import { UpdaterProvider, useUpdater } from '@/contexts/UpdaterContext';
import {
  DownloadPage,
  HistoryPage,
  LogsPage,
  ProcessingPage,
  SettingsPage,
  SummaryPage,
  UniversalPage,
} from '@/pages';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('youtube');
  const [showFfmpegDialog, setShowFfmpegDialog] = useState(false);
  const [ffmpegChecked, setFfmpegChecked] = useState(false);
  const updater = useUpdater();
  const { ffmpegStatus, ffmpegLoading } = useDependencies();

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

  return (
    <>
      <MainLayout currentPage={currentPage} onPageChange={setCurrentPage}>
        {currentPage === 'youtube' && (
          <DownloadPage onNavigateToSettings={() => setCurrentPage('settings')} />
        )}
        {currentPage === 'universal' && <UniversalPage />}
        {currentPage === 'summary' && <SummaryPage />}
        {currentPage === 'processing' && <ProcessingPage />}
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
            <LogProvider>
              <HistoryProvider>
                <AIProvider>
                  <ProcessingProvider>
                    <UpdaterWrapper>
                      <AppContent />
                    </UpdaterWrapper>
                  </ProcessingProvider>
                </AIProvider>
              </HistoryProvider>
            </LogProvider>
          </UniversalProvider>
        </DownloadProvider>
      </DependenciesProvider>
    </ThemeProvider>
  );
}
