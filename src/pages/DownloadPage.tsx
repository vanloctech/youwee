import { Play, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UrlInput, SettingsPanel, QueueList } from '@/components/download';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { useDownload } from '@/contexts/DownloadContext';
import { useDependencies } from '@/contexts/DependenciesContext';
import { cn } from '@/lib/utils';

interface DownloadPageProps {
  onNavigateToSettings?: () => void;
}

export function DownloadPage({ onNavigateToSettings }: DownloadPageProps) {
  const {
    items,
    isDownloading,
    isExpandingPlaylist,
    settings,
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
  } = useDownload();

  const { ffmpegStatus } = useDependencies();

  const pendingCount = items.filter(i => i.status !== 'completed').length;
  const hasItems = items.length > 0;

  // Calculate total file size from fetched video info (in bytes)
  // Only show if we have actual filesize data from videos
  const totalFileSize = items.reduce((sum, item) => {
    return sum + (item.filesize || 0);
  }, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <h1 className="text-base sm:text-lg font-semibold">YouTube</h1>
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
            ffmpegInstalled={ffmpegStatus?.installed ?? true}
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
            onGoToSettings={onNavigateToSettings}
          />
        </div>

        {/* Subtle divider */}
        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Queue Section */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          <QueueList
            items={items}
            isDownloading={isDownloading}
            showPlaylistBadge={settings.downloadPlaylist}
            currentPlaylistInfo={currentPlaylistInfo}
            onRemove={removeItem}
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
              {!isDownloading ? (
                <button 
                  className={cn(
                    "flex-1 h-11 px-6 rounded-xl font-medium text-sm sm:text-base",
                    "btn-gradient flex items-center justify-center gap-2",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "shadow-lg shadow-primary/20",
                    pendingCount > 0 && "animate-pulse-subtle"
                  )} 
                  onClick={startDownload}
                  disabled={pendingCount === 0}
                  title="Start downloading all pending videos"
                >
                  <Play className="w-5 h-5" />
                  <span>Start Download</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ) : (
                <Button 
                  className="flex-1 h-11 text-sm sm:text-base rounded-xl" 
                  variant="destructive"
                  onClick={stopDownload}
                  title="Stop current download"
                >
                  <Square className="w-5 h-5 mr-2" />
                  Stop Download
                </Button>
              )}
              
              <Button
                variant="outline"
                size="icon"
                onClick={clearAll}
                disabled={isDownloading || items.length === 0}
                className="h-11 w-11 rounded-xl flex-shrink-0 bg-transparent border-border/50 hover:bg-white/10"
                title="Clear all items from queue"
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
