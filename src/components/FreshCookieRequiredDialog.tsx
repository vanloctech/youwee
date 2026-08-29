import { Cookie, KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FreshCookieRequiredDialogProps {
  onDismiss: () => void;
  onGoToSettings?: () => void;
}

export function FreshCookieRequiredDialog({
  onDismiss,
  onGoToSettings,
}: FreshCookieRequiredDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <div className="relative bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Cookie className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Login Cookies Required</h2>
              <p className="text-sm text-muted-foreground">
                This content requires authenticated cookies
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-4 end-4 p-1 rounded-md hover:bg-black/10 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-violet-500/10 rounded-lg border border-violet-500/20">
            <KeyRound className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">The video needs a logged-in session</p>
              <p className="text-muted-foreground mt-1">
                The current request does not have valid login cookies, or the cookies need to be
                refreshed.
              </p>
            </div>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-foreground mb-2">To fix this issue:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open Settings → Network</li>
              <li>Enable Browser Cookie mode or Cookie File mode</li>
              <li>If Browser Cookie mode is already enabled, refresh your login and try again</li>
            </ol>
          </div>
        </div>

        <div className="px-6 py-4 bg-muted/30 border-t border-border">
          <div className="flex gap-2">
            {onGoToSettings && (
              <Button
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
              variant={onGoToSettings ? 'ghost' : 'outline'}
              className="flex-1"
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
