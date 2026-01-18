import { useState } from 'react';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { DependenciesProvider } from '@/contexts/DependenciesContext';
import { MainLayout } from '@/components/layout';
import type { Page } from '@/components/layout';
import { DownloadPage, SettingsPage } from '@/pages';

function AppContent() {
  const [currentPage, setCurrentPage] = useState<Page>('download');

  return (
    <MainLayout currentPage={currentPage} onPageChange={setCurrentPage}>
      {currentPage === 'download' && <DownloadPage />}
      {currentPage === 'settings' && <SettingsPage />}
    </MainLayout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <DependenciesProvider>
        <AppContent />
      </DependenciesProvider>
    </ThemeProvider>
  );
}

export default App;
