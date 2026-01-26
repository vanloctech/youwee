import { AlertTriangle, CheckCircle2, Download, Film, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/contexts/DependenciesContext';

interface FFmpegDialogProps {
  onDismiss: () => void;
}

export function FFmpegDialog({ onDismiss }: FFmpegDialogProps) {
  const { ffmpegStatus, ffmpegDownloading, ffmpegError, ffmpegSuccess, downloadFfmpeg } =
    useDependencies();

  // Don't show if FFmpeg is already installed
  if (ffmpegStatus?.installed || ffmpegSuccess) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-500/20 to-orange-500/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Film className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">FFmpeg Required</h2>
              <p className="text-sm text-muted-foreground">For high-quality video downloads</p>
            </div>
          </div>
          {!ffmpegDownloading && (
            <button
              type="button"
              onClick={onDismiss}
              className="absolute top-4 right-4 p-1 rounded-md hover:bg-black/10 transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {ffmpegDownloading ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/20 rounded-full">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">
                Downloading FFmpeg... This may take a few minutes.
              </p>
            </div>
          ) : ffmpegSuccess ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-full">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">FFmpeg installed successfully!</p>
            </div>
          ) : ffmpegError ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{ffmpegError}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                You can try again or install FFmpeg manually later from Settings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                FFmpeg is required for downloading high-resolution videos (2K, 4K) where YouTube
                provides separate video and audio streams that need to be merged.
              </p>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">What happens without FFmpeg:</strong>
                  <br />
                  Downloads above 1080p may fail or produce video-only files without audio.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border flex gap-3 justify-end">
          {ffmpegDownloading ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Installing...
            </Button>
          ) : ffmpegSuccess ? (
            <Button size="sm" onClick={onDismiss}>
              Continue
            </Button>
          ) : ffmpegError ? (
            <>
              <Button variant="outline" size="sm" onClick={onDismiss}>
                Skip
              </Button>
              <Button size="sm" onClick={downloadFfmpeg}>
                Try Again
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={onDismiss}>
                Skip for Now
              </Button>
              <Button size="sm" onClick={downloadFfmpeg}>
                <Download className="w-4 h-4 mr-1" />
                Install FFmpeg
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
