import { Play, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserCookieErrorDialog } from '@/components/BrowserCookieErrorDialog';
import {
  ScheduleActiveControls,
  SchedulePopover,
  UniversalQueueList,
  UniversalSettingsPanel,
  UniversalUrlInput,
} from '@/components/download';
import { FFmpegRequiredDialog } from '@/components/FFmpegRequiredDialog';
import { FreshCookieRequiredDialog } from '@/components/FreshCookieRequiredDialog';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/contexts/DependenciesContext';
import { useUniversal } from '@/contexts/UniversalContext';
import { useSchedule } from '@/hooks/useSchedule';
import { loadCookieSettings } from '@/lib/network-config';
import type { Quality } from '@/lib/types';
import { cn } from '@/lib/utils';

// Qualities that require FFmpeg for video+audio merging
const FFMPEG_REQUIRED_QUALITIES: Quality[] = ['best', '8k', '4k', '2k'];

interface UniversalPageProps {
  onNavigateToSettings?: () => void;
}

export function UniversalPage({ onNavigateToSettings }: UniversalPageProps) {
  const { t } = useTranslation('universal');
  const {
    items,
    focusedItemId,
    isDownloading,
    settings,
    addFromText,
    importFromFile,
    importFromClipboard,
    selectOutputFolder,
    removeItem,
    clearAll,
    clearCompleted,
    startDownload,
    stopDownload,
    updateQuality,
    updateFormat,
    updateAudioBitrate,
    updateConcurrentDownloads,
    updateLiveFromStart,
    updateSkipLive,
    cookieError,
    clearCookieError,
    retryFailedDownload,
    updateItemTimeRange,
    selectItemOutputFolder,
    renameCompletedItem,
  } = useUniversal();

  const { ffmpegStatus } = useDependencies();

  const [showFfmpegDialog, setShowFfmpegDialog] = useState(false);

  const schedule = useSchedule({
    storageKey: 'youwee-schedule-universal',
    onStart: startDownload,
    onStop: stopDownload,
    isDownloading,
    sourceLabel: 'Universal',
  });

  const pendingCount = items.filter((i) => i.status !== 'completed').length;
  const hasItems = items.length > 0;

  // Check if FFmpeg is required for current quality setting
  const ffmpegRequired =
    FFMPEG_REQUIRED_QUALITIES.includes(settings.quality) && ffmpegStatus?.installed === false;

  // Handle start download with FFmpeg check
  const handleStartDownload = () => {
    if (ffmpegRequired) {
      setShowFfmpegDialog(true);
      return;
    }
    startDownload();
  };

  // Continue download after FFmpeg dialog
  const handleFfmpegDialogContinue = () => {
    setShowFfmpegDialog(false);
    startDownload();
  };

  // Calculate total file size from fetched video info (in bytes)
  const totalFileSize = items.reduce((sum, item) => {
    return sum + (item.filesize || 0);
  }, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <h1 className="text-base sm:text-lg font-semibold">{t('title')}</h1>
        <ThemePicker />
      </header>

      {/* Subtle divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Section: URL Input + Settings */}
        <div className="flex-shrink-0 p-4 sm:p-6 space-y-3">
          {/* URL Input */}
          <UniversalUrlInput
            onAddUrls={addFromText}
            onImportFile={importFromFile}
            onImportClipboard={importFromClipboard}
          />

          {/* Settings Bar */}
          <UniversalSettingsPanel
            settings={settings}
            disabled={isDownloading}
            totalFileSize={totalFileSize > 0 ? totalFileSize : undefined}
            onQualityChange={updateQuality}
            onFormatChange={updateFormat}
            onAudioBitrateChange={updateAudioBitrate}
            onConcurrentChange={updateConcurrentDownloads}
            onSelectFolder={selectOutputFolder}
            onLiveFromStartChange={updateLiveFromStart}
            onSkipLiveChange={updateSkipLive}
          />
        </div>

        {/* Subtle divider */}
        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Queue Section */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          <UniversalQueueList
            items={items}
            focusedItemId={focusedItemId}
            isDownloading={isDownloading}
            onRemove={removeItem}
            onUpdateTimeRange={updateItemTimeRange}
            onSelectOutputFolder={selectItemOutputFolder}
            onRename={renameCompletedItem}
            onClearCompleted={clearCompleted}
            onScheduleUpcomingLive={schedule.setSchedule}
          />
        </div>
      </div>

      {/* Floating Action Bar - Only render when has items */}
      {hasItems && (
        <footer className="flex-shrink-0">
          {/* Subtle top divider */}
          <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              {!isDownloading && !schedule.isScheduled ? (
                <>
                  {/* Start Download button */}
                  <button
                    type="button"
                    className={cn(
                      'flex-1 h-11 px-6 rounded-xl font-medium text-sm sm:text-base',
                      'btn-gradient flex items-center justify-center gap-2',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'shadow-lg shadow-primary/20',
                      pendingCount > 0 && 'animate-pulse-subtle',
                    )}
                    onClick={handleStartDownload}
                    disabled={pendingCount === 0}
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

                  {/* Schedule button */}
                  <SchedulePopover
                    onSchedule={schedule.setSchedule}
                    disabled={pendingCount === 0}
                    ns="universal"
                    triggerVariant="inline"
                    triggerLabel={t('schedule.setSchedule')}
                    triggerClassName="h-11 flex-shrink-0 rounded-xl border-border/50 bg-transparent px-4 text-sm font-medium hover:bg-white/10"
                  />
                </>
              ) : schedule.isScheduled && !isDownloading ? (
                <ScheduleActiveControls
                  schedule={schedule.schedule}
                  countdown={schedule.countdown}
                  onCancel={schedule.cancelSchedule}
                  onStartNow={() => {
                    schedule.cancelSchedule();
                    handleStartDownload();
                  }}
                  ns="universal"
                />
              ) : (
                <Button
                  className="flex-1 h-11 text-sm sm:text-base rounded-xl"
                  variant="destructive"
                  onClick={stopDownload}
                  title={t('actions.stopDownload')}
                >
                  <Square className="w-5 h-5 mr-2" />
                  {t('actions.stopDownload')}
                </Button>
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={clearAll}
                disabled={isDownloading || items.length === 0}
                className="h-11 w-11 rounded-xl flex-shrink-0 bg-transparent border-border/50 hover:bg-white/10"
                title={t('actions.clearAll')}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </footer>
      )}

      {/* FFmpeg Required Dialog - shown when starting download without FFmpeg */}
      {showFfmpegDialog && (
        <FFmpegRequiredDialog
          quality={settings.quality}
          onDismiss={() => setShowFfmpegDialog(false)}
          onContinue={handleFfmpegDialogContinue}
          onGoToSettings={onNavigateToSettings}
        />
      )}

      {/* Browser Cookie Error Dialog - shown when cookie extraction fails on Windows */}
      {(() => {
        const itemId = cookieError?.itemId;
        if (!cookieError?.show || !itemId) return null;
        if (cookieError.kind === 'fresh_cookies') {
          return (
            <FreshCookieRequiredDialog
              onDismiss={clearCookieError}
              onGoToSettings={onNavigateToSettings}
            />
          );
        }
        return (
          <BrowserCookieErrorDialog
            browserName={loadCookieSettings().browser}
            onRetry={() => retryFailedDownload(itemId)}
            onDismiss={clearCookieError}
            onGoToSettings={onNavigateToSettings}
          />
        );
      })()}
    </div>
  );
}
