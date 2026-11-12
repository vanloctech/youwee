import type { FfmpegStatus } from '@/contexts/DependenciesContext';
import type { DependencySource, YtdlpAllVersions, YtdlpChannel } from '@/lib/types';

export type SetupItem = 'ytdlp' | 'ffmpeg';

/** Set once the first-run setup dialog has been shown and closed, or was not needed. */
export const SETUP_DIALOG_SEEN_KEY = 'youwee_setup_dialog_seen';

const OPEN_SETUP_DIALOG_EVENT = 'youwee:open-setup-dialog';

export function hasSeenSetupDialog(): boolean {
  try {
    return localStorage.getItem(SETUP_DIALOG_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markSetupDialogSeen(): void {
  try {
    localStorage.setItem(SETUP_DIALOG_SEEN_KEY, 'true');
  } catch {
    // Non-critical: the dialog may show again on the next launch.
  }
}

/** Ask the app shell to open the setup dialog (e.g. from the download guide). */
export function requestOpenSetupDialog(): void {
  window.dispatchEvent(new Event(OPEN_SETUP_DIALOG_EVENT));
}

export function onOpenSetupDialogRequest(handler: () => void): () => void {
  window.addEventListener(OPEN_SETUP_DIALOG_EVENT, handler);
  return () => window.removeEventListener(OPEN_SETUP_DIALOG_EVENT, handler);
}

export interface SetupDependencyState {
  ytdlpSource: DependencySource;
  ytdlpChannel: YtdlpChannel;
  ytdlpAllVersions: YtdlpAllVersions | null;
  ffmpegSource: DependencySource;
  ffmpegStatus: FfmpegStatus | null;
}

/** Items that the setup dialog can manage. System-managed dependencies are left alone. */
export function getApplicableSetupItems(state: SetupDependencyState): SetupItem[] {
  const items: SetupItem[] = [];
  if (state.ytdlpSource !== 'system' && state.ytdlpAllVersions) {
    items.push('ytdlp');
  }
  if (state.ffmpegSource !== 'system' && state.ffmpegStatus) {
    items.push('ffmpeg');
  }
  return items;
}

/**
 * Where yt-dlp stands relative to the recommended setup:
 * - `notDownloaded`: using bundled, Stable binary not on disk yet
 * - `downloadedNotActive`: Stable binary is on disk but the bundled build is still in use
 * - `missingFile`: Stable/Nightly is selected but its binary is missing (bundled fallback)
 * - `active`: Stable or Nightly is selected and installed
 */
export type YtdlpSetupState = 'notDownloaded' | 'downloadedNotActive' | 'missingFile' | 'active';

export function getYtdlpSetupState(state: SetupDependencyState): YtdlpSetupState {
  const versions = state.ytdlpAllVersions;
  if (state.ytdlpChannel === 'bundled') {
    return versions?.stable.installed ? 'downloadedNotActive' : 'notDownloaded';
  }
  return versions?.[state.ytdlpChannel].installed ? 'active' : 'missingFile';
}

/** The channel the dialog installs: keep Nightly users on Nightly, everyone else gets Stable. */
export function getYtdlpTargetChannel(
  state: SetupDependencyState,
): Exclude<YtdlpChannel, 'bundled'> {
  return state.ytdlpChannel === 'nightly' ? 'nightly' : 'stable';
}

/** Whether reaching the target needs a download (switching to an installed binary does not). */
export function ytdlpSetupNeedsDownload(setupState: YtdlpSetupState): boolean {
  return setupState === 'notDownloaded' || setupState === 'missingFile';
}

export function isSetupItemDone(item: SetupItem, state: SetupDependencyState): boolean {
  if (item === 'ytdlp') {
    return getYtdlpSetupState(state) === 'active';
  }
  return state.ffmpegStatus?.installed === true;
}

/** Items still missing, i.e. the ones worth showing on first launch. */
export function getMissingSetupItems(state: SetupDependencyState): SetupItem[] {
  return getApplicableSetupItems(state).filter((item) => !isSetupItemDone(item, state));
}
