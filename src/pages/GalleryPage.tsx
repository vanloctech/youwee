import { ExternalLink, Play, RefreshCw, Square, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GalleryQueueList } from '@/components/download/GalleryQueueList';
import { GallerySettingsPanel } from '@/components/download/GallerySettingsPanel';
import { GalleryUrlInput } from '@/components/download/GalleryUrlInput';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/contexts/DependenciesContext';
import { useGalleryDl } from '@/contexts/GalleryDlContext';
import { cn } from '@/lib/utils';

interface GalleryPageProps {
  onNavigateToSettings?: () => void;
}

export function GalleryPage({ onNavigateToSettings }: GalleryPageProps) {
  const { t } = useTranslation('gallery');
  const {
    items,
    focusedItemId,
    isDownloading,
    settings,
    error,
    addFromText,
    importFromFile,
    importFromClipboard,
    selectOutputFolder,
    removeItem,
    clearAll,
    clearCompleted,
    startDownload,
    stopDownload,
    updateConcurrentDownloads,
  } = useGalleryDl();
  const { galleryDlStatus, galleryDlLoading, galleryDlError, checkGalleryDl } = useDependencies();

  const pendingCount = items.filter((i) => i.status !== 'completed').length;
  const hasItems = items.length > 0;
  const isReady = galleryDlStatus?.installed === true;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <h1 className="text-base sm:text-lg font-semibold">{t('title')}</h1>
        <ThemePicker />
      </header>

      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-shrink-0 p-4 sm:p-6 space-y-3">
          {!isReady && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{t('missing.title')}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {galleryDlLoading
                          ? t('missing.checking')
                          : galleryDlError || error || t('missing.description')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void checkGalleryDl()}
                      disabled={galleryDlLoading}
                      title={t('missing.refresh')}
                    >
                      <RefreshCw className={cn('w-4 h-4', galleryDlLoading && 'animate-spin')} />
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {onNavigateToSettings && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={onNavigateToSettings}
                      >
                        {t('missing.openDependencies')}
                      </Button>
                    )}
                    <a
                      href="https://github.com/mikf/gallery-dl"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center gap-1.5 h-8 rounded-md border border-dashed px-3 text-xs font-medium',
                        'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
                      )}
                    >
                      {t('missing.installGuide')}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          <GalleryUrlInput
            disabled={!isReady}
            onAddUrls={addFromText}
            onImportFile={importFromFile}
            onImportClipboard={importFromClipboard}
          />

          <GallerySettingsPanel
            settings={settings}
            disabled={!isReady || isDownloading}
            onSelectFolder={selectOutputFolder}
            onConcurrentChange={updateConcurrentDownloads}
          />
        </div>

        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          <GalleryQueueList
            items={items}
            focusedItemId={focusedItemId}
            isDownloading={isDownloading}
            onRemove={removeItem}
            onClearCompleted={clearCompleted}
          />
        </div>
      </div>

      {hasItems && (
        <footer className="flex-shrink-0">
          <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />
          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              {!isDownloading ? (
                <>
                  <button
                    type="button"
                    className={cn(
                      'flex-1 h-11 px-6 rounded-xl font-medium text-sm sm:text-base',
                      'btn-gradient flex items-center justify-center gap-2',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'shadow-lg shadow-primary/20',
                      pendingCount > 0 && 'animate-pulse-subtle',
                    )}
                    onClick={() => void startDownload()}
                    disabled={!isReady || pendingCount === 0 || !settings.outputPath}
                    title={t('actions.startDownload')}
                  >
                    <Play className="w-5 h-5" />
                    <span>{t('actions.startDownload')}</span>
                    {pendingCount > 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                        {pendingCount}
                      </span>
                    )}
                  </button>

                  <Button
                    variant="outline"
                    className="h-11 rounded-xl px-4 gap-2"
                    onClick={clearAll}
                    disabled={isDownloading}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('actions.clearAll')}</span>
                  </Button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className={cn(
                      'flex-1 h-11 px-6 rounded-xl font-medium text-sm sm:text-base',
                      'bg-red-500 text-white hover:bg-red-600',
                      'flex items-center justify-center gap-2 shadow-lg shadow-red-500/20',
                    )}
                    onClick={() => void stopDownload()}
                    title={t('actions.stopDownload')}
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>{t('actions.stopDownload')}</span>
                  </button>

                  <Button variant="outline" className="h-11 rounded-xl px-4 gap-2" disabled>
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('actions.clearAll')}</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
