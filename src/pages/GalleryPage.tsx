import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GalleryQueueList } from '@/components/download/GalleryQueueList';
import { GallerySettingsPanel } from '@/components/download/GallerySettingsPanel';
import { GalleryUrlInput } from '@/components/download/GalleryUrlInput';
import { GalleryBrowser } from '@/components/gallery/GalleryBrowser';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/contexts/DependenciesContext';
import { useGalleryDl } from '@/contexts/gallerydl-context';
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
    updateSettings,
  } = useGalleryDl();
  const { galleryDlStatus, galleryDlLoading, galleryDlError, checkGalleryDl } = useDependencies();
  const [tab, setTab] = useState<'queue' | 'library'>('queue');

  const pendingCount = items.filter((i) => i.status !== 'completed').length;
  const hasItems = items.length > 0;
  const isReady = galleryDlStatus?.installed === true;

  const activeItems = items.filter((i) => i.status === 'downloading' || i.status === 'fetching');
  // Track downloads that finished during this session so the user can jump to the Library.
  const [finishedCount, setFinishedCount] = useState(0);
  // Seed from initial items so returning to the page with already-completed
  // downloads doesn't flash a spurious "finished" banner.
  const prevCompletedRef = useRef(items.filter((i) => i.status === 'completed').length);
  useEffect(() => {
    const completed = items.filter((i) => i.status === 'completed').length;
    if (completed > prevCompletedRef.current) {
      setFinishedCount((f) => f + (completed - prevCompletedRef.current));
    }
    prevCompletedRef.current = completed;
  }, [items]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="text-base sm:text-lg font-semibold">{t('title')}</h1>
          <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
            <button
              type="button"
              onClick={() => setTab('queue')}
              className={cn(
                'h-7 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all',
                tab === 'queue'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('tabs.queue')}
            </button>
            <button
              type="button"
              onClick={() => setTab('library')}
              className={cn(
                'h-7 px-3 rounded-lg text-xs sm:text-sm font-medium transition-all',
                tab === 'library'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('tabs.library')}
            </button>
          </div>
        </div>
        <ThemePicker />
      </header>

      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {isDownloading ? (
        <div className="flex-shrink-0 border-b border-border/40 bg-primary/5 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-xs font-medium">
              {t('browser.downloading', { count: activeItems.length })}
            </span>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="gallery-progress-indeterminate h-full rounded-full bg-primary" />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 ms-auto"
              onClick={() => setTab('queue')}
            >
              {t('browser.viewQueue')}
            </Button>
          </div>
        </div>
      ) : finishedCount > 0 ? (
        <div className="flex-shrink-0 border-b border-border/40 bg-emerald-500/5 px-4 py-2 sm:px-6">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium">
              {t('browser.finished', { count: finishedCount })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 ms-auto"
              onClick={() => setTab('library')}
            >
              {t('browser.viewLibrary')}
            </Button>
          </div>
        </div>
      ) : null}

      {tab === 'library' ? (
        <GalleryBrowser
          queueItems={items}
          onGoToQueue={() => setTab('queue')}
          onAddUrls={addFromText}
        />
      ) : (
        <>
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
                          <RefreshCw
                            className={cn('w-4 h-4', galleryDlLoading && 'animate-spin')}
                          />
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
                onSettingsChange={updateSettings}
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
                          <span className="ms-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">
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
        </>
      )}
    </div>
  );
}
