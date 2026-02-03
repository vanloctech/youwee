import { AlertTriangle, CheckCircle2, Loader2, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDependencies } from '@/contexts/DependenciesContext';

interface DenoDialogProps {
  onDismiss: () => void;
}

export function DenoDialog({ onDismiss }: DenoDialogProps) {
  const { denoStatus, denoDownloading, denoError, denoSuccess, downloadDeno } =
    useDependencies();

  // Don't show if Deno is already installed
  if (denoStatus?.installed || denoSuccess) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-green-500/20 to-emerald-500/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <Terminal className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Setting Up YouTube Support</h2>
              <p className="text-sm text-muted-foreground">Installing Deno runtime</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {denoDownloading ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/20 rounded-full">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">
                Downloading Deno runtime... This is required for YouTube downloads.
              </p>
              <p className="text-xs text-muted-foreground/70">
                This only needs to happen once.
              </p>
            </div>
          ) : denoSuccess ? (
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-full">
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">Deno installed successfully!</p>
              <p className="text-xs text-muted-foreground/70">
                YouTube downloads are now fully supported.
              </p>
            </div>
          ) : denoError ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{denoError}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                You can try again or install Deno manually later from Settings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Deno is a JavaScript runtime required for YouTube video extraction.
              </p>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Why is this needed?</strong>
                  <br />
                  YouTube uses JavaScript challenges to protect video streams. Deno helps solve
                  these challenges to enable downloads.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border flex gap-3 justify-end">
          {denoDownloading ? (
            <Button variant="outline" size="sm" disabled>
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              Installing...
            </Button>
          ) : denoSuccess ? (
            <Button size="sm" onClick={onDismiss}>
              Continue
            </Button>
          ) : denoError ? (
            <>
              <Button variant="outline" size="sm" onClick={onDismiss}>
                Skip
              </Button>
              <Button size="sm" onClick={downloadDeno}>
                Try Again
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
