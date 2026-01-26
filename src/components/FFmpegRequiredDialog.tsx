import { AlertTriangle, CheckCircle2, Download, Loader2, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/contexts/DependenciesContext';

interface FFmpegRequiredDialogProps {
  quality: string;
  onDismiss: () => void;
  onContinue: () => void;
  onGoToSettings?: () => void;
}

export function FFmpegRequiredDialog({
  quality,
  onDismiss,
  onContinue,
  onGoToSettings,
}: FFmpegRequiredDialogProps) {
  const { ffmpegDownloading, ffmpegError, ffmpegSuccess, downloadFfmpeg } = useDependencies();

  const handleGoToSettings = () => {
    onDismiss();
    onGoToSettings?.();
  };

  const handleInstall = async () => {
    await downloadFfmpeg();
  };

  // Auto-close on success after a short delay
  if (ffmpegSuccess) {
    setTimeout(() => {
      onContinue();
    }, 1500);
  }

  const qualityLabel = quality === 'best' ? 'Best quality' : quality.toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-500/20 to-orange-500/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">FFmpeg Required</h2>
              <p className="text-sm text-muted-foreground">For {qualityLabel} video downloads</p>
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
              <p className="text-sm text-muted-foreground">
                FFmpeg installed successfully! You can now download {qualityLabel} videos.
              </p>
            </div>
          ) : ffmpegError ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{ffmpegError}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                You can try again or install FFmpeg manually from Settings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                High-resolution videos ({qualityLabel}) require FFmpeg to merge separate video and
                audio streams from YouTube.
              </p>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Without FFmpeg:</strong>
                </p>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5 list-disc list-inside">
                  <li>Download may fail or produce errors</li>
                  <li>Video may have no audio</li>
                  <li>Limited to lower quality (720p or below)</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border">
          {ffmpegDownloading ? (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" disabled>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Installing...
              </Button>
            </div>
          ) : ffmpegSuccess ? (
            <div className="flex justify-end">
              <Button size="sm" onClick={onContinue}>
                <CheckCircle2 className="w-4 h-4 mr-1" />
                Continue
              </Button>
            </div>
          ) : ffmpegError ? (
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={onContinue}>
                Continue Anyway
              </Button>
              <Button size="sm" onClick={handleInstall}>
                Try Again
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Primary action */}
              <Button className="w-full" onClick={handleInstall}>
                <Download className="w-4 h-4 mr-2" />
                Install FFmpeg
              </Button>

              {/* Secondary actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleGoToSettings}>
                  <Settings className="w-4 h-4 mr-1" />
                  Go to Settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-muted-foreground"
                  onClick={onContinue}
                >
                  Continue Anyway
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
