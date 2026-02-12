import { Clock, FileDown, Film, History, Maximize2, Music, Wand2, Zap } from 'lucide-react';
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
    history,
    selectVideo,
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

  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold">{t('processing.title')}</h1>
          </div>
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
          <div className="w-[70%] flex flex-col p-4 sm:p-6 gap-4 overflow-hidden">
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

            {/* Metadata Bar */}
            {metadata && (
              <div className="flex items-center gap-4 px-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <Maximize2 className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">
                      {metadata.width}×{metadata.height}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <Film className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">{metadata.video_codec}</span>
                  </div>
                  {metadata.audio_codec && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                        <Music className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">{metadata.audio_codec}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">{formatTime(metadata.duration)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <FileDown className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">
                      {(metadata.file_size / 1_000_000).toFixed(1)} MB
                    </span>
                  </div>
                  {metadata.fps && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">{metadata.fps.toFixed(0)} fps</span>
                    </div>
                  )}
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
            attachedImages={attachedImages}
            onSendMessage={sendMessage}
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
