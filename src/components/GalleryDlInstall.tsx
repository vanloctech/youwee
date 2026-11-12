import { Check, Copy, Download, Loader2, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useDependencies } from '@/contexts/DependenciesContext';
import {
  dependencyProgressPercent,
  formatDependencyProgressLabel,
  formatDependencyProgressSize,
} from '@/lib/dependency-progress';

const isMacOS = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

/** Command for platforms without an official standalone gallery-dl build. */
export function galleryDlManualInstallCommand(): string {
  return isMacOS ? 'brew install gallery-dl' : 'pip install -U gallery-dl';
}

/**
 * Install controls for gallery-dl, shared by Settings → Dependencies and the Gallery page:
 * one-click install with progress where an official build exists, otherwise a copyable
 * Homebrew/pip command and a re-check button.
 */
export function GalleryDlInstall() {
  const { t } = useTranslation('settings');
  const {
    galleryDlStatus,
    galleryDlLoading,
    galleryDlDownloading,
    galleryDlDownloadProgress,
    galleryDlInstallError,
    checkGalleryDl,
    downloadGalleryDl,
  } = useDependencies();
  const [copied, setCopied] = useState(false);

  if (!galleryDlStatus || galleryDlStatus.installed) return null;

  if (galleryDlDownloading) {
    const percent = dependencyProgressPercent(galleryDlDownloadProgress);
    const size = formatDependencyProgressSize(galleryDlDownloadProgress);
    return (
      <div className="w-full space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs text-primary">
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            {formatDependencyProgressLabel(
              t,
              galleryDlDownloadProgress,
              t('dependencies.installing'),
            )}
          </span>
          {size && <span className="font-mono text-[11px] text-muted-foreground">{size}</span>}
        </div>
        {percent !== null ? (
          <Progress value={percent} className="h-1.5" />
        ) : (
          <div className="h-1.5 overflow-hidden rounded-full bg-primary/20">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
          </div>
        )}
      </div>
    );
  }

  if (galleryDlStatus.can_install) {
    return (
      <div className="space-y-1">
        <Button size="sm" onClick={() => void downloadGalleryDl()} disabled={galleryDlLoading}>
          {galleryDlInstallError ? <RefreshCw /> : <Download />}
          {galleryDlInstallError
            ? t('dependencies.retryInstall')
            : t('dependencies.installGallerydl')}
        </Button>
        {galleryDlInstallError && (
          <p className="text-xs text-destructive">{galleryDlInstallError}</p>
        )}
      </div>
    );
  }

  const command = galleryDlManualInstallCommand();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable; the command stays visible to copy by hand.
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {isMacOS ? t('dependencies.gallerydlHomebrewHint') : t('dependencies.gallerydlPipHint')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs">{command}</code>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? t('dependencies.copied') : t('dependencies.copyCommand')}
        </button>
        <button
          type="button"
          onClick={() => void checkGalleryDl()}
          disabled={galleryDlLoading}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={galleryDlLoading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          {t('dependencies.checkAgain')}
        </button>
      </div>
    </div>
  );
}
