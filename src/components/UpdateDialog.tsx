import {
  ArrowRight,
  Check,
  Download,
  Info,
  RefreshCw,
  Rocket,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import type { UpdateInfo, UpdateProgress, UpdateStatus } from '@/hooks/useAppUpdater';
import { cn } from '@/lib/utils';

// Get the localized release notes based on current language
function getLocalizedBody(updateInfo: UpdateInfo | null, lang: string): string | undefined {
  if (!updateInfo) return undefined;
  if (lang.startsWith('vi')) return updateInfo.bodyVi || updateInfo.body;
  if (lang.startsWith('zh')) return updateInfo.bodyZhCN || updateInfo.body;
  return updateInfo.body;
}

interface UpdateDialogProps {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  onDownload: () => void;
  onRestart: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}

export function UpdateDialog({
  status,
  updateInfo,
  progress,
  error,
  onDownload,
  onRestart,
  onDismiss,
  onRetry,
}: UpdateDialogProps) {
  const { t, i18n } = useTranslation('common');

  // Only show dialog for specific states
  if (status === 'idle' || status === 'checking' || status === 'up-to-date') {
    return null;
  }

  const progressPercent =
    progress && progress.total > 0 ? Math.round((progress.downloaded / progress.total) * 100) : 0;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
  };

  const localizedBody = getLocalizedBody(updateInfo, i18n.language);
  const canDismiss = status === 'available' || status === 'error';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-500">
      <div className="relative w-full max-w-lg max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] bg-background/85 backdrop-blur-2xl border border-white/10 dark:border-white/5 rounded-[2rem] shadow-[0_0_80px_-15px_rgba(0,0,0,0.5)] overflow-hidden animate-in zoom-in-[0.96] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col">
        {/* Ambient Glow Effects */}
        <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[50%] bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[50%] bg-purple-500/10 rounded-full blur-[100px] pointer-events-none" />

        {canDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute top-5 right-5 p-2 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 transition-colors text-muted-foreground z-20"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Hero Header */}
        <div className="relative px-6 sm:px-8 pt-8 pb-5 flex items-center gap-4 sm:gap-5 z-10">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/40 blur-xl rounded-full" />
            <div
              className={cn(
                'relative flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-lg border border-white/10 text-white transform transition-transform hover:scale-105 duration-500',
                status === 'error'
                  ? 'bg-gradient-to-br from-red-500 to-red-600'
                  : status === 'ready'
                    ? 'bg-gradient-to-br from-green-500 to-green-600'
                    : 'bg-gradient-to-br from-primary to-primary/80',
              )}
            >
              {status === 'error' ? (
                <Info className="w-6 h-6 sm:w-7 sm:h-7" />
              ) : status === 'ready' ? (
                <Check className="w-6 h-6 sm:w-7 sm:h-7" />
              ) : (
                <Rocket className="w-6 h-6 sm:w-7 sm:h-7" />
              )}
            </div>
          </div>

          <div className="flex-1 text-left">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground mb-1.5">
              {status === 'error'
                ? t('update.error')
                : status === 'ready'
                  ? t('update.ready')
                  : t('update.available')}
            </h2>

            {updateInfo && status !== 'error' && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border border-border/50 text-xs sm:text-sm font-semibold shadow-sm backdrop-blur-md">
                <span className="text-muted-foreground opacity-60 line-through decoration-muted-foreground/50">
                  v{updateInfo.currentVersion}
                </span>
                <ArrowRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-primary" />
                <span className="text-foreground bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/80">
                  v{updateInfo.version}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Changelog Content */}
        <div className="px-6 sm:px-8 pb-6 relative z-10 flex-1 min-h-0 overflow-y-auto">
          {status === 'available' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              {localizedBody ? (
                <div className="flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">
                      {t('update.description')}
                    </h3>
                  </div>
                  <div className="pr-2">
                    <SimpleMarkdown
                      content={localizedBody}
                      className={cn(
                        'text-sm text-foreground/80 space-y-3',
                        '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-foreground',
                        '[&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground',
                        '[&_h3]:text-sm [&_h3]:font-medium',
                        '[&_ul]:list-none [&_ul]:pl-0 [&_ul]:space-y-1.5',
                        '[&_li]:relative [&_li]:pl-5',
                        "[&_li::before]:content-[''] [&_li::before]:absolute [&_li::before]:left-1.5 [&_li::before]:top-2 [&_li::before]:w-1.5 [&_li::before]:h-1.5 [&_li::before]:bg-primary/60 [&_li::before]:rounded-full",
                      )}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  {t('update.description')}
                </p>
              )}
            </div>
          )}

          {status === 'downloading' && (
            <div className="bg-card/40 backdrop-blur-md rounded-2xl p-6 border border-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] text-center animate-in fade-in duration-500">
              <div className="flex justify-between items-end mb-3">
                <span className="text-sm font-semibold text-foreground">
                  {t('update.downloading')}
                </span>
                <span className="text-2xl font-black text-primary tracking-tighter">
                  {progressPercent}%
                </span>
              </div>
              <div className="h-3 w-full bg-muted/80 rounded-full overflow-hidden mb-3 ring-1 ring-inset ring-black/5 dark:ring-white/5">
                <div
                  className="h-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {progress && progress.total > 0 && (
                <div className="text-xs font-medium text-muted-foreground">
                  {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
                </div>
              )}
            </div>
          )}

          {status === 'error' && (
            <div className="bg-destructive/10 rounded-2xl p-6 border border-destructive/20 text-center animate-in fade-in duration-500">
              <p className="text-sm text-destructive font-semibold">
                {error || t('update.errorGeneric')}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 sm:px-8 pb-8 pt-2 relative z-10 flex flex-col-reverse sm:flex-row gap-3">
          {status === 'available' && (
            <>
              <Button
                variant="ghost"
                className="sm:w-1/3 h-12 rounded-xl font-medium"
                onClick={onDismiss}
              >
                {t('update.later')}
              </Button>
              <Button
                onClick={onDownload}
                className="sm:w-2/3 h-12 rounded-xl font-bold bg-foreground text-background hover:bg-foreground/90 shadow-xl shadow-foreground/10"
              >
                {t('update.updateNow')}
                <Download className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}

          {status === 'downloading' && (
            <Button
              variant="secondary"
              className="w-full h-12 rounded-xl font-semibold opacity-80"
              disabled
            >
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              {t('update.downloading')}
            </Button>
          )}

          {status === 'ready' && (
            <Button
              onClick={onRestart}
              className="w-full h-12 rounded-xl font-bold bg-green-500 text-white hover:bg-green-600 shadow-xl shadow-green-500/20"
            >
              {t('update.restartNow')}
              <RotateCcw className="w-4 h-4 ml-2" />
            </Button>
          )}

          {status === 'error' && (
            <>
              <Button
                variant="ghost"
                className="sm:w-1/3 h-12 rounded-xl font-medium"
                onClick={onDismiss}
              >
                {t('update.dismiss')}
              </Button>
              <Button
                onClick={onRetry}
                className="sm:w-2/3 h-12 rounded-xl font-bold bg-foreground text-background hover:bg-foreground/90"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {t('update.retry')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
