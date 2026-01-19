import { useState } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DependenciesProvider } from '@/contexts/DependenciesContext';
import { DownloadProvider } from '@/contexts/DownloadContext';
import { MainLayout } from '@/components/layout';
import type { Page } from '@/components/layout';
import { DownloadPage, SettingsPage } from '@/pages';
import { UpdateDialog } from '@/components/UpdateDialog';
import { useAppUpdater } from '@/hooks';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('download');
  const updater = useAppUpdater();

  return (
    <>
      <MainLayout currentPage={currentPage} onPageChange={setCurrentPage}>
        {currentPage === 'download' && <DownloadPage />}
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
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <DependenciesProvider>
        <DownloadProvider>
          <AppContent />
        </DownloadProvider>
      </DependenciesProvider>
    </ThemeProvider>
  );
}

export default App;
