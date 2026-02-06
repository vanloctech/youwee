import { AlertTriangle, Cookie, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BrowserCookieErrorDialogProps {
  browserName?: string;
  onRetry: () => void;
  onDismiss: () => void;
  onGoToSettings?: () => void;
}

export function BrowserCookieErrorDialog({
  browserName = 'browser',
  onRetry,
  onDismiss,
  onGoToSettings,
}: BrowserCookieErrorDialogProps) {
  const displayBrowserName =
    browserName.charAt(0).toUpperCase() + browserName.slice(1).toLowerCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-500/20 to-orange-500/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Cookie className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Cookie Access Failed</h2>
              <p className="text-sm text-muted-foreground">Browser is blocking cookie access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-4 right-4 p-1 rounded-md hover:bg-black/10 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">{displayBrowserName} is currently open</p>
              <p className="text-muted-foreground mt-1">
                Chromium-based browsers lock their cookie database while running. Please close{' '}
                {displayBrowserName} completely and try again.
              </p>
            </div>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-foreground mb-2">To fix this issue:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Close all {displayBrowserName} windows</li>
              <li>
                Make sure {displayBrowserName} is not running in the background (check system tray)
              </li>
              <li>Click "Retry Download" below</li>
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Alternative:</strong> Use "Cookie File" mode in Settings → Network to export
            cookies using a browser extension.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border">
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={onRetry}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Download
            </Button>
            <div className="flex gap-2">
              {onGoToSettings && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    onDismiss();
                    onGoToSettings();
                  }}
                >
                  Go to Settings
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-muted-foreground"
                onClick={onDismiss}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
