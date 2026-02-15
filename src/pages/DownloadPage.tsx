import { Clock, Play, Square, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserCookieErrorDialog } from '@/components/BrowserCookieErrorDialog';
import { QueueList, SchedulePopover, SettingsPanel, UrlInput } from '@/components/download';
import { FFmpegRequiredDialog } from '@/components/FFmpegRequiredDialog';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/contexts/DependenciesContext';
import { useDownload } from '@/contexts/DownloadContext';
import { formatTime, useSchedule } from '@/hooks/useSchedule';
import type { Quality } from '@/lib/types';
import { cn } from '@/lib/utils';

// Qualities that require FFmpeg for video+audio merging
const FFMPEG_REQUIRED_QUALITIES: Quality[] = ['best', '8k', '4k', '2k'];

interface DownloadPageProps {
  onNavigateToSettings?: () => void;
}

export function DownloadPage({ onNavigateToSettings }: DownloadPageProps) {
  const { t } = useTranslation('download');
  const {
    items,
    focusedItemId,
    isDownloading,
    isExpandingPlaylist,
    settings,
    cookieSettings,
    currentPlaylistInfo,
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
    updateVideoCodec,
    updateAudioBitrate,
    updateConcurrentDownloads,
    updatePlaylistLimit,
    togglePlaylist,
    updateSubtitleMode,
    updateSubtitleLangs,
    updateSubtitleEmbed,
    updateSubtitleFormat,
    updateLiveFromStart,
    cookieError,
    clearCookieError,
    retryFailedDownload,
    updateItemTimeRange,
  } = useDownload();

  const { ffmpegStatus } = useDependencies();

  const [showFfmpegDialog, setShowFfmpegDialog] = useState(false);

  const schedule = useSchedule({
    storageKey: 'youwee-schedule-download',
    onStart: startDownload,
    onStop: stopDownload,
    isDownloading,
    sourceLabel: 'YouTube',
  });

  const pendingCount = items.filter((i) => i.status !== 'completed').length;
  const hasItems = items.length > 0;

  // Check if FFmpeg is required for current quality setting
  const ffmpegRequired =
    FFMPEG_REQUIRED_QUALITIES.includes(settings.quality) && !ffmpegStatus?.installed;

  // Handle start download with FFmpeg check
  const handleStartDownload = () => {
    if (ffmpegRequired) {
      setShowFfmpegDialog(true);
      return;
    }
    startDownload();
  };

  // Continue download after FFmpeg dialog (user chose to continue anyway or installed FFmpeg)
  const handleFfmpegDialogContinue = () => {
    setShowFfmpegDialog(false);
    startDownload();
  };

  // Calculate total file size from fetched video info (in bytes)
  // Only show if we have actual filesize data from videos
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
          <UrlInput
            disabled={isDownloading}
            isExpandingPlaylist={isExpandingPlaylist}
            onAddUrls={addFromText}
            onImportFile={importFromFile}
            onImportClipboard={importFromClipboard}
          />

          {/* Settings Bar */}
          <SettingsPanel
            settings={settings}
            disabled={isDownloading}
            totalFileSize={totalFileSize > 0 ? totalFileSize : undefined}
            ffmpegInstalled={ffmpegStatus?.installed ?? false}
            onQualityChange={updateQuality}
            onFormatChange={updateFormat}
            onVideoCodecChange={updateVideoCodec}
            onAudioBitrateChange={updateAudioBitrate}
            onConcurrentChange={updateConcurrentDownloads}
            onPlaylistLimitChange={updatePlaylistLimit}
            onPlaylistToggle={togglePlaylist}
            onSelectFolder={selectOutputFolder}
            onSubtitleModeChange={updateSubtitleMode}
            onSubtitleLangsChange={updateSubtitleLangs}
            onSubtitleEmbedChange={updateSubtitleEmbed}
            onSubtitleFormatChange={updateSubtitleFormat}
            onLiveFromStartChange={updateLiveFromStart}
            onGoToSettings={onNavigateToSettings}
          />
        </div>

        {/* Subtle divider */}
        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Queue Section */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          <QueueList
            items={items}
            focusedItemId={focusedItemId}
            isDownloading={isDownloading}
            showPlaylistBadge={settings.downloadPlaylist}
            currentPlaylistInfo={currentPlaylistInfo}
            onRemove={removeItem}
            onUpdateTimeRange={updateItemTimeRange}
            onClearCompleted={clearCompleted}
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
                    ns="download"
                  />
                </>
              ) : schedule.isScheduled && !isDownloading ? (
                <>
                  {/* Schedule active display */}
                  <div className="flex-1 h-11 px-4 rounded-xl bg-muted/50 border border-border/50 flex items-center gap-2.5">
                    <Clock className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">
                        {formatTime(schedule.schedule?.startAt ?? 0)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-1.5">
                        {schedule.countdown}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={schedule.cancelSchedule}
                      className="text-muted-foreground hover:text-foreground p-0.5"
                      title={t('schedule.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Start Now button */}
                  <button
                    type="button"
                    className={cn(
                      'h-11 px-4 rounded-xl font-medium text-sm',
                      'btn-gradient flex items-center justify-center gap-1.5',
                      'shadow-lg shadow-primary/20',
                    )}
                    onClick={() => {
                      schedule.cancelSchedule();
                      handleStartDownload();
                    }}
                    title={t('schedule.startNow')}
                  >
                    <Play className="w-4 h-4" />
                    <span>{t('schedule.startNow')}</span>
                  </button>
                </>
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
        return (
          <BrowserCookieErrorDialog
            browserName={cookieSettings.browser}
            onRetry={() => retryFailedDownload(itemId)}
            onDismiss={clearCookieError}
            onGoToSettings={onNavigateToSettings}
          />
        );
      })()}
    </div>
  );
}
