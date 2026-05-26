import { Download, RefreshCw, RotateCcw, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import type { UpdateInfo, UpdateProgress, UpdateStatus } from '@/hooks/useAppUpdater';

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-primary/20 to-primary/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {status === 'error' ? t('update.error') : t('update.available')}
              </h2>
              {updateInfo && status !== 'error' && (
                <p className="text-sm text-muted-foreground">
                  v{updateInfo.currentVersion} → v{updateInfo.version}
                </p>
              )}
            </div>
          </div>
          {(status === 'available' || status === 'error') && (
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
          {status === 'available' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('update.description')}</p>
              {localizedBody && (
                <div className="p-3 bg-muted/50 rounded-lg max-h-48 overflow-y-auto">
                  <SimpleMarkdown
                    content={localizedBody}
                    className="text-xs text-muted-foreground"
                  />
                </div>
              )}
            </div>
          )}

          {status === 'downloading' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('update.downloading')}</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              {progress && progress.total > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
                </p>
              )}
            </div>
          )}

          {status === 'ready' && (
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-full mb-2">
                <Download className="w-6 h-6 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">{t('update.ready')}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{error || t('update.errorGeneric')}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border flex gap-3 justify-end">
          {status === 'available' && (
            <>
              <Button variant="outline" size="sm" onClick={onDismiss}>
                {t('update.later')}
              </Button>
              <Button size="sm" onClick={onDownload}>
                <Download className="w-4 h-4 mr-1" />
                {t('update.updateNow')}
              </Button>
            </>
          )}

          {status === 'downloading' && (
            <Button variant="outline" size="sm" disabled>
              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
              {t('update.downloading')}
            </Button>
          )}

          {status === 'ready' && (
            <Button size="sm" onClick={onRestart}>
              <RotateCcw className="w-4 h-4 mr-1" />
              {t('update.restartNow')}
            </Button>
          )}

          {status === 'error' && (
            <>
              <Button variant="outline" size="sm" onClick={onDismiss}>
                {t('update.dismiss')}
              </Button>
              <Button size="sm" onClick={onRetry}>
                <RefreshCw className="w-4 h-4 mr-1" />
                {t('update.retry')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
