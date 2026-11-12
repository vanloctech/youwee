import type { TFunction } from 'i18next';
import type { DownloadProgress } from '@/contexts/DependenciesContext';

/**
 * Label for a dependency download stage, shared by Settings → Dependencies and the setup dialog
 * so both say the same thing. `t` must be bound to the `settings` namespace.
 */
export function formatDependencyProgressLabel(
  t: TFunction,
  progress: DownloadProgress | null,
  fallback: string,
): string {
  if (!progress) return fallback;
  switch (progress.stage) {
    case 'checksum':
      return t('dependencies.checkingChecksum');
    case 'downloading':
      return `${t('dependencies.downloading')} ${progress.percent}%`;
    case 'verifying':
      return t('dependencies.verifying');
    case 'extracting':
      return t('dependencies.extracting');
    default:
      return fallback;
  }
}

const MB = 1024 * 1024;

/** "5.1 / 12.0 MB" while downloading with a known size, otherwise null. */
export function formatDependencyProgressSize(progress: DownloadProgress | null): string | null {
  if (progress?.stage !== 'downloading' || progress.total <= 0) return null;
  return `${(progress.downloaded / MB).toFixed(1)} / ${(progress.total / MB).toFixed(1)} MB`;
}

/** Percent for a progress bar, or null when the bar should be indeterminate. */
export function dependencyProgressPercent(progress: DownloadProgress | null): number | null {
  if (!progress) return null;
  if (progress.stage === 'downloading') return progress.total > 0 ? progress.percent : null;
  if (progress.stage === 'verifying' || progress.stage === 'extracting') return 100;
  return null;
}
