import { Clock, FileDown, Film, History, Maximize2, Music, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChatPanel,
  HistoryDialog,
  PreviewConfirmDialog,
  VideoPlayer,
} from '@/components/processing';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useProcessing } from '@/contexts/ProcessingContext';

export function ProcessingPage() {
  const { t } = useTranslation('pages');
  // Get state and actions from context (persistent across navigation)
  const {
    videoPath,
    videoSrc,
    audioSrc,
    thumbnailSrc,
    videoMetadata: metadata,
    videoError,
    isLoadingVideo,
    isGeneratingPreview,
    isUsingPreview,
    selection,
    isProcessing,
    progress,
    messages,
    isGenerating,
    outputDirectory,
    history,
    selectVideo,
    selectOutputDirectory,
    setVideoError,
    sendMessage,
    cancelProcessing,
    loadHistory,
    deleteJob,
    clearHistory,
    attachedImages,
    attachImages,
    removeAttachment,
    clearAttachments,
    pendingPreviewConfirm,
    confirmPreview,
  } = useProcessing();

  // History dialog
  const [showHistory, setShowHistory] = useState(false);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatTime = (seconds: number): string => {
    if (!seconds || !Number.isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 MB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getDisplayTitle = (filename: string): string => {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex <= 0) return filename;
    return filename.slice(0, dotIndex);
  };

  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
          <h1 className="text-base sm:text-lg font-semibold">{t('processing.title')}</h1>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="gap-1"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">{t('processing.history')}</span>
              {history.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {history.length}
                </Badge>
              )}
            </Button>
            <ThemePicker />
          </div>
        </header>

        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Video + Controls */}
          <div className="w-[60%] flex flex-col p-4 sm:p-6 gap-4 overflow-hidden">
            {/* Video Player Container with Processing Overlay */}
            <div className="relative">
              {/* Memoized Video Player - no longer receives processing state */}
              <VideoPlayer
                videoSrc={videoSrc}
                audioSrc={audioSrc}
                thumbnailSrc={thumbnailSrc}
                videoPath={videoPath}
                metadata={metadata}
                videoError={videoError}
                isLoadingVideo={isLoadingVideo}
                isGeneratingPreview={isGeneratingPreview}
                isUsingPreview={isUsingPreview}
                selection={selection}
                onSelectVideo={selectVideo}
                onVideoError={setVideoError}
              />
            </div>

            {/* Video Info (YouTube-style below player) */}
            {metadata && (
              <div className="px-1">
                <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-background to-muted/20 px-4 py-3.5 sm:px-5 sm:py-4">
                  <h2 className="text-sm sm:text-base font-semibold leading-snug line-clamp-2">
                    {getDisplayTitle(metadata.filename)}
                  </h2>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-muted/60">
                      <Clock className="w-3 h-3" />
                      {formatTime(metadata.duration)}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-muted/60">
                      <Maximize2 className="w-3 h-3" />
                      {metadata.width}×{metadata.height}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-muted/60">
                      <FileDown className="w-3 h-3" />
                      {formatFileSize(metadata.file_size)}
                    </span>
                    {metadata.fps > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-muted/60">
                        <Zap className="w-3 h-3" />
                        {metadata.fps.toFixed(0)} fps
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge className="rounded-full border-0 shadow-none bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-400">
                      <Film className="w-3 h-3 mr-1.5" />
                      {metadata.video_codec}
                    </Badge>
                    {metadata.audio_codec && (
                      <Badge className="rounded-full border-0 shadow-none bg-teal-500/10 text-teal-600 hover:bg-teal-500/10 hover:text-teal-600 dark:text-teal-400 dark:hover:text-teal-400">
                        <Music className="w-3 h-3 mr-1.5" />
                        {metadata.audio_codec}
                      </Badge>
                    )}
                    <Badge className="rounded-full border-0 shadow-none bg-amber-500/10 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400">
                      {metadata.format.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: Chat Panel */}
          <ChatPanel
            messages={messages}
            isGenerating={isGenerating}
            isProcessing={isProcessing}
            progress={progress}
            hasVideo={!!metadata && !!videoPath}
            outputDirectory={outputDirectory}
            attachedImages={attachedImages}
            onSendMessage={sendMessage}
            onSelectOutputDirectory={selectOutputDirectory}
            onCancelProcessing={cancelProcessing}
            onAttachImages={attachImages}
            onRemoveAttachment={removeAttachment}
            onClearAttachments={clearAttachments}
          />
        </div>

        {/* History Dialog */}
        <HistoryDialog
          open={showHistory}
          onOpenChange={setShowHistory}
          history={history}
          onDelete={deleteJob}
          onClearAll={clearHistory}
        />

        {/* Preview Confirm Dialog for large files */}
        <PreviewConfirmDialog info={pendingPreviewConfirm} onConfirm={confirmPreview} />
      </div>
    </TooltipProvider>
  );
}
