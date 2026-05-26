import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { ToastRecord, ToastVariant } from './toast.types';

interface ToastItemProps {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

function getVariantStyles(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
        badgeClassName: 'bg-emerald-500/10',
      };
    case 'error':
      return {
        icon: <XCircle className="h-4 w-4 text-red-500" />,
        badgeClassName: 'bg-red-500/10',
      };
    case 'warning':
      return {
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        badgeClassName: 'bg-amber-500/10',
      };
    case 'loading':
      return {
        icon: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
        badgeClassName: 'bg-primary/10',
      };
    default:
      return {
        icon: <Info className="h-4 w-4 text-sky-500" />,
        badgeClassName: 'bg-sky-500/10',
      };
  }
}

export function ToastItem({ toast, onDismiss, onPause, onResume }: ToastItemProps) {
  const { t } = useTranslation(['download', 'settings']);
  const { icon, badgeClassName } = getVariantStyles(toast.variant);
  const pluginRun = toast.layout === 'plugin-run' ? toast.pluginRun : null;
  const hasPermissionError = pluginRun?.status === 'error' && Boolean(pluginRun.errorKind);
  const mediaLabel = pluginRun
    ? pluginRun.mediaTitle || pluginRun.filename || pluginRun.mediaUrl
    : null;
  const statusLabel = pluginRun
    ? pluginRun.status === 'running'
      ? t('download.pluginToastRunning', { ns: 'settings' })
      : pluginRun.status === 'success'
        ? t('download.pluginToastSuccess', { ns: 'settings' })
        : hasPermissionError
          ? t('download.pluginToastPermissionError', { ns: 'settings' })
          : t('download.pluginToastError', { ns: 'settings' })
    : null;
  const title = pluginRun
    ? pluginRun.pluginName ||
      toast.title ||
      t('download.pluginToastFallbackTitle', { ns: 'settings' })
    : toast.title;

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-2xl border border-border/70 bg-background/95 p-3 shadow-lg shadow-black/10 backdrop-blur-sm dark:shadow-black/30',
        toast.closing ? 'app-toast-exit' : 'app-toast-enter',
      )}
      onPointerEnter={() => onPause(toast.id)}
      onPointerLeave={() => onResume(toast.id)}
    >
      <div className="flex items-start gap-3">
        <div className={cn('mt-0.5 rounded-xl p-2', badgeClassName)}>{icon}</div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              {statusLabel ? (
                <p className="text-[11px] text-muted-foreground">{statusLabel}</p>
              ) : toast.message ? null : (
                <p className="text-[11px] text-muted-foreground">&nbsp;</p>
              )}
            </div>

            {toast.dismissible ? (
              <button
                type="button"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
                onClick={() => onDismiss(toast.id)}
                aria-label={t('dismissNotice', { ns: 'download' })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          {mediaLabel ? (
            <div className="rounded-xl bg-muted/60 px-2.5 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('download.pluginToastVideoLabel', { ns: 'settings' })}
              </p>
              <p className="line-clamp-2 break-words text-xs font-medium text-foreground">
                {mediaLabel}
              </p>
            </div>
          ) : null}

          {toast.message ? (
            <p className="break-words text-xs leading-5 text-muted-foreground">{toast.message}</p>
          ) : null}

          {hasPermissionError ? (
            <div className="rounded-xl bg-red-500/10 px-2.5 py-2 text-xs">
              <p className="font-medium text-red-600 dark:text-red-400">
                {t('download.pluginToastPermissionNeeded', { ns: 'settings' })}
              </p>
              <p className="mt-1 break-words text-red-700/80 dark:text-red-300/80">
                {t('download.pluginToastPermissionScope', {
                  ns: 'settings',
                  permission: pluginRun?.errorKind ?? 'runtime',
                  resource:
                    pluginRun?.errorResource ||
                    t('download.pluginToastPermissionUnknownResource', { ns: 'settings' }),
                })}
              </p>
            </div>
          ) : null}

          {hasPermissionError && pluginRun?.details ? (
            <details className="rounded-xl bg-muted/60 px-2.5 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">
                {t('download.pluginToastTechnicalDetails', { ns: 'settings' })}
              </summary>
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4">
                {pluginRun.details}
              </pre>
            </details>
          ) : null}

          {toast.action ? (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="rounded-md border border-dashed border-border/80 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
