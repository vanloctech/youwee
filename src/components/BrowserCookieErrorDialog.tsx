import { invoke } from '@tauri-apps/api/core';
import { AlertTriangle, Cookie, RefreshCw, ShieldAlert, UserX, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { CookieErrorKind } from '@/lib/cookie-errors';

type BrowserCookieErrorKind = Exclude<CookieErrorKind, 'fresh_cookies'>;

interface BrowserCookieErrorDialogProps {
  kind?: BrowserCookieErrorKind;
  browserName?: string;
  onRetry: () => void;
  onDismiss: () => void;
  onGoToSettings?: () => void;
}

const isMacOS = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

const KIND_ICON = {
  db_locked: Cookie,
  access_denied: ShieldAlert,
  profile_not_found: UserX,
} as const;

export function BrowserCookieErrorDialog({
  kind = 'db_locked',
  browserName = 'browser',
  onRetry,
  onDismiss,
  onGoToSettings,
}: BrowserCookieErrorDialogProps) {
  const { t } = useTranslation('common');
  const browser = browserName.charAt(0).toUpperCase() + browserName.slice(1).toLowerCase();
  // Full Disk Access is a macOS concept; other systems get a generic permission hint.
  const textKey = kind === 'access_denied' && !isMacOS ? 'access_denied_other' : kind;
  const Icon = KIND_ICON[kind];
  const steps = [1, 2, 3].map((step) => t(`cookieErrorDialog.${textKey}.step${step}`, { browser }));

  const openPrivacySettings = () => {
    invoke('open_macos_privacy_settings').catch((error) => {
      console.error('Failed to open Privacy Settings:', error);
    });
  };

  const goToSettings = onGoToSettings
    ? () => {
        onDismiss();
        onGoToSettings();
      }
    : undefined;

  // The most useful next step depends on the cause: fix permissions, pick a profile, or retry.
  const primary =
    kind === 'access_denied' && isMacOS
      ? {
          label: t('cookieErrorDialog.openPrivacySettings'),
          icon: <ShieldAlert className="w-4 h-4 mr-2" />,
          onClick: openPrivacySettings,
        }
      : kind === 'profile_not_found' && goToSettings
        ? { label: t('cookieErrorDialog.chooseProfile'), icon: null, onClick: goToSettings }
        : {
            label: t('cookieErrorDialog.retry'),
            icon: <RefreshCw className="w-4 h-4 mr-2" />,
            onClick: onRetry,
          };
  const showSecondaryRetry = primary.onClick !== onRetry;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-amber-500/20 to-orange-500/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Icon className="w-5 h-5 text-amber-500" />
            </div>
            <div className="pr-6">
              <h2 className="text-lg font-semibold text-foreground">
                {t(`cookieErrorDialog.${textKey}.title`, { browser })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(`cookieErrorDialog.${textKey}.subtitle`, { browser })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('cookieErrorDialog.dismiss')}
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
              <p className="font-medium text-foreground">
                {t(`cookieErrorDialog.${textKey}.heading`, { browser })}
              </p>
              <p className="text-muted-foreground mt-1">
                {t(`cookieErrorDialog.${textKey}.body`, { browser })}
              </p>
            </div>
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-foreground mb-2">
              {t('cookieErrorDialog.stepsTitle')}
            </p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>{t('cookieErrorDialog.alternativeLabel')}</strong>{' '}
            {t('cookieErrorDialog.alternative')}
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-muted/30 border-t border-border">
          <div className="flex flex-col gap-2">
            <Button className="w-full" onClick={primary.onClick}>
              {primary.icon}
              {primary.label}
            </Button>
            <div className="flex gap-2">
              {showSecondaryRetry && (
                <Button variant="outline" size="sm" className="flex-1" onClick={onRetry}>
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  {t('cookieErrorDialog.retry')}
                </Button>
              )}
              {goToSettings && primary.onClick !== goToSettings && (
                <Button variant="outline" size="sm" className="flex-1" onClick={goToSettings}>
                  {t('cookieErrorDialog.goToSettings')}
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-muted-foreground"
                onClick={onDismiss}
              >
                {t('cookieErrorDialog.dismiss')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
