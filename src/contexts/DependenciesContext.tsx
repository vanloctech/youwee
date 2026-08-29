import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { localizeUnknownError } from '@/lib/backend-error';
import type {
  DependencySource,
  YtdlpAllVersions,
  YtdlpChannel,
  YtdlpChannelUpdateInfo,
} from '../lib/types';

export interface YtdlpVersionInfo {
  version: string;
  latest_version: string | null;
  update_available: boolean;
  is_bundled: boolean;
  binary_path: string;
}

export interface FfmpegStatus {
  installed: boolean;
  version: string | null;
  binary_path: string | null;
  is_system: boolean;
}

export interface DenoStatus {
  installed: boolean;
  version: string | null;
  binary_path: string | null;
  is_system: boolean;
}

export interface GalleryDlStatus {
  installed: boolean;
  version: string | null;
  binary_path: string | null;
  is_system: boolean;
}

export interface FfmpegUpdateInfo {
  has_update: boolean;
  current_version: string | null;
  latest_version: string | null;
  release_url: string | null;
}

export interface DenoUpdateInfo {
  has_update: boolean;
  current_version: string | null;
  latest_version: string | null;
  release_url: string | null;
}

// Download progress from backend
export interface DownloadProgress {
  stage: 'checksum' | 'downloading' | 'verifying' | 'extracting' | 'complete';
  percent: number;
  downloaded: number;
  total: number;
}

interface DependenciesContextType {
  // yt-dlp state
  ytdlpSource: DependencySource;
  ytdlpInfo: YtdlpVersionInfo | null;
  latestVersion: string | null;
  isLoading: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  error: string | null;
  updateSuccess: boolean;

  // yt-dlp channel state
  ytdlpChannel: YtdlpChannel;
  ytdlpAllVersions: YtdlpAllVersions | null;
  ytdlpChannelUpdateInfo: YtdlpChannelUpdateInfo | null;
  isChannelLoading: boolean;
  isChannelDownloading: boolean;
  isChannelCheckingUpdate: boolean;
  channelError: string | null;
  channelDownloadSuccess: boolean;
  isAutoDownloadingYtdlp: boolean; // True when auto-downloading stable on first launch

  // FFmpeg state
  ffmpegSource: DependencySource;
  ffmpegStatus: FfmpegStatus | null;
  ffmpegLoading: boolean;
  ffmpegDownloading: boolean;
  ffmpegError: string | null;
  ffmpegSuccess: boolean;
  ffmpegUpdateInfo: FfmpegUpdateInfo | null;
  ffmpegCheckingUpdate: boolean;
  ffmpegDownloadProgress: DownloadProgress | null;

  // Actions
  refreshYtdlpVersion: () => Promise<void>;
  checkForUpdate: (options?: { silent?: boolean }) => Promise<string | null>;
  updateYtdlp: () => Promise<void>;

  // yt-dlp channel actions
  setYtdlpSource: (source: DependencySource) => Promise<void>;
  setYtdlpChannel: (channel: YtdlpChannel) => Promise<void>;
  refreshAllYtdlpVersions: () => Promise<YtdlpAllVersions | null>;
  checkChannelUpdate: (
    channel: YtdlpChannel,
    options?: { silent?: boolean },
  ) => Promise<YtdlpChannelUpdateInfo | null>;
  downloadChannelBinary: (channel: YtdlpChannel) => Promise<void>;

  // FFmpeg actions
  setFfmpegSource: (source: DependencySource) => Promise<void>;
  checkFfmpeg: () => Promise<void>;
  checkFfmpegUpdate: () => Promise<void>;
  downloadFfmpeg: () => Promise<void>;

  // Deno state
  denoStatus: DenoStatus | null;
  denoLoading: boolean;
  denoDownloading: boolean;
  denoError: string | null;
  denoSuccess: boolean;
  denoUpdateInfo: DenoUpdateInfo | null;
  denoCheckingUpdate: boolean;
  isAutoDownloadingDeno: boolean; // True when auto-downloading on first launch
  denoDownloadProgress: DownloadProgress | null;

  // Deno actions
  checkDeno: () => Promise<DenoStatus | null>;
  checkDenoUpdate: () => Promise<void>;
  downloadDeno: () => Promise<void>;

  // gallery-dl state/actions
  galleryDlStatus: GalleryDlStatus | null;
  galleryDlLoading: boolean;
  galleryDlError: string | null;
  checkGalleryDl: () => Promise<GalleryDlStatus | null>;

  // Engine maintenance (P0-1)
  runCompatTest: () => Promise<void>;
  compatResults: EngineCompatResult[] | null;
  compatLoading: boolean;
  backupsStatus: EngineBackupsStatus | null;
  backupsLoading: boolean;
  rollbackEngine: (engine: string) => Promise<void>;
  rollbackLoading: string | null;
  rollbackSuccess: string | null;
  checkGalleryDlUpdate: () => Promise<void>;
  galleryDlUpdateInfo: GalleryDlUpdateInfo | null;
  downloadGalleryDl: () => Promise<void>;
  galleryDlUpdating: boolean;
  galleryDlUpdated: string | null;
}

const DependenciesContext = createContext<DependenciesContextType | null>(null);

interface EngineCompatResult {
  engine: string;
  ok: boolean;
  version: string | null;
  error: string | null;
}

interface EngineBackupInfo {
  available: boolean;
  version: string | null;
}

interface EngineBackupsStatus {
  ytdlp: EngineBackupInfo;
  ytdlp_stable: EngineBackupInfo;
  ytdlp_nightly: EngineBackupInfo;
  ffmpeg: EngineBackupInfo;
  deno: EngineBackupInfo;
  gallerydl: EngineBackupInfo;
}

interface GalleryDlUpdateInfo {
  has_update: boolean;
  current_version: string | null;
  latest_version: string | null;
  release_url: string | null;
}

export function DependenciesProvider({ children }: { children: ReactNode }) {
  const [ytdlpSource, setYtdlpSourceState] = useState<DependencySource>('auto');
  const [ytdlpInfo, setYtdlpInfo] = useState<YtdlpVersionInfo | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // yt-dlp channel state
  const [ytdlpChannel, setYtdlpChannelState] = useState<YtdlpChannel>('stable'); // Default to stable
  const [ytdlpAllVersions, setYtdlpAllVersions] = useState<YtdlpAllVersions | null>(null);
  const [ytdlpChannelUpdateInfo, setYtdlpChannelUpdateInfo] =
    useState<YtdlpChannelUpdateInfo | null>(null);
  const [isChannelLoading, setIsChannelLoading] = useState(false);
  const [isChannelDownloading, setIsChannelDownloading] = useState(false);
  const [isChannelCheckingUpdate, setIsChannelCheckingUpdate] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [channelDownloadSuccess, setChannelDownloadSuccess] = useState(false);
  const [isAutoDownloadingYtdlp, setIsAutoDownloadingYtdlp] = useState(false);

  // FFmpeg state
  const [ffmpegSource, setFfmpegSourceState] = useState<DependencySource>('auto');
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);
  const [ffmpegLoading, setFfmpegLoading] = useState(true);
  const [ffmpegDownloading, setFfmpegDownloading] = useState(false);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [ffmpegSuccess, setFfmpegSuccess] = useState(false);
  const [ffmpegUpdateInfo, setFfmpegUpdateInfo] = useState<FfmpegUpdateInfo | null>(null);
  const [ffmpegCheckingUpdate, setFfmpegCheckingUpdate] = useState(false);
  const [ffmpegDownloadProgress, setFfmpegDownloadProgress] = useState<DownloadProgress | null>(
    null,
  );

  // Deno state
  const [denoStatus, setDenoStatus] = useState<DenoStatus | null>(null);
  const [denoLoading, setDenoLoading] = useState(false);
  const [denoDownloading, setDenoDownloading] = useState(false);
  const [denoError, setDenoError] = useState<string | null>(null);
  const [denoSuccess, setDenoSuccess] = useState(false);
  const [denoUpdateInfo, setDenoUpdateInfo] = useState<DenoUpdateInfo | null>(null);
  const [denoCheckingUpdate, setDenoCheckingUpdate] = useState(false);
  const [isAutoDownloadingDeno, setIsAutoDownloadingDeno] = useState(false);
  const [denoDownloadProgress, setDenoDownloadProgress] = useState<DownloadProgress | null>(null);
  const [galleryDlStatus, setGalleryDlStatus] = useState<GalleryDlStatus | null>(null);
  const [galleryDlLoading, setGalleryDlLoading] = useState(false);
  const [galleryDlError, setGalleryDlError] = useState<string | null>(null);

  // Engine maintenance (compat test, previous-version rollback, gallery-dl update)
  const [compatResults, setCompatResults] = useState<EngineCompatResult[] | null>(null);
  const [compatLoading, setCompatLoading] = useState(false);
  const [backupsStatus, setBackupsStatus] = useState<EngineBackupsStatus | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState<string | null>(null);
  const [rollbackSuccess, setRollbackSuccess] = useState<string | null>(null);
  const [galleryDlUpdateInfo, setGalleryDlUpdateInfo] = useState<GalleryDlUpdateInfo | null>(null);
  const [galleryDlUpdating, setGalleryDlUpdating] = useState(false);
  const [galleryDlUpdated, setGalleryDlUpdated] = useState<string | null>(null);

  // Load yt-dlp version (only once on first mount)
  const refreshYtdlpVersion = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await invoke<YtdlpVersionInfo>('get_ytdlp_version');
      setYtdlpInfo(info);
    } catch (err) {
      setError(localizeUnknownError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh all yt-dlp versions (bundled, stable, nightly)
  const refreshAllYtdlpVersions = useCallback(async () => {
    setIsChannelLoading(true);
    setChannelError(null);
    try {
      const versions = await invoke<YtdlpAllVersions>('get_all_ytdlp_versions_cmd');
      setYtdlpAllVersions(versions);
      setYtdlpChannelState(versions.current_channel as YtdlpChannel);
      return versions;
    } catch (err) {
      setChannelError(localizeUnknownError(err));
      return null;
    } finally {
      setIsChannelLoading(false);
    }
  }, []);

  const setYtdlpSource = useCallback(
    async (source: DependencySource) => {
      setChannelError(null);
      try {
        await invoke('set_ytdlp_source_cmd', { source });
        setYtdlpSourceState(source);
        await refreshYtdlpVersion();
        if (source !== 'system') {
          await refreshAllYtdlpVersions();
        }
      } catch (err) {
        setChannelError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshAllYtdlpVersions, refreshYtdlpVersion],
  );

  // Set yt-dlp channel
  const setYtdlpChannel = useCallback(
    async (channel: YtdlpChannel) => {
      setChannelError(null);
      try {
        await invoke('set_ytdlp_channel_cmd', { channel });
        setYtdlpChannelState(channel);
        // Refresh yt-dlp version info to reflect the change
        await refreshYtdlpVersion();
      } catch (err) {
        setChannelError(localizeUnknownError(err));
      }
    },
    [refreshYtdlpVersion],
  );

  // Check for channel update
  const checkChannelUpdate = useCallback(
    async (channel: YtdlpChannel, options?: { silent?: boolean }) => {
      if (channel === 'bundled') return null; // Bundled doesn't have updates
      setIsChannelCheckingUpdate(true);
      if (!options?.silent) {
        setChannelError(null);
      }
      try {
        const updateInfo = await invoke<YtdlpChannelUpdateInfo>('check_ytdlp_channel_update', {
          channel,
        });
        setYtdlpChannelUpdateInfo(updateInfo);
        return updateInfo;
      } catch (err) {
        if (!options?.silent) {
          setChannelError(localizeUnknownError(err));
        }
        return null;
      } finally {
        setIsChannelCheckingUpdate(false);
      }
    },
    [],
  );

  // Download channel binary
  const downloadChannelBinary = useCallback(
    async (channel: YtdlpChannel) => {
      if (channel === 'bundled') return; // Bundled doesn't need download
      setIsChannelDownloading(true);
      setChannelError(null);
      setChannelDownloadSuccess(false);
      try {
        const newVersion = await invoke<string>('download_ytdlp_channel', { channel });
        setChannelDownloadSuccess(true);
        // Refresh all versions to update UI
        await refreshAllYtdlpVersions();
        // If current channel is the one we downloaded, refresh main version too
        if (channel === ytdlpChannel) {
          await refreshYtdlpVersion();
        }
        // Reset update info to show "Up to date" instead of "available"
        setYtdlpChannelUpdateInfo({
          channel: channel,
          current_version: newVersion,
          latest_version: newVersion,
          update_available: false,
        });
        // Hide success message after 3 seconds
        setTimeout(() => setChannelDownloadSuccess(false), 3000);
      } catch (err) {
        setChannelError(localizeUnknownError(err));
      } finally {
        setIsChannelDownloading(false);
      }
    },
    [refreshAllYtdlpVersions, refreshYtdlpVersion, ytdlpChannel],
  );

  // Check FFmpeg status
  const checkFfmpeg = useCallback(async () => {
    setFfmpegLoading(true);
    setFfmpegError(null);
    try {
      const status = await invoke<FfmpegStatus>('check_ffmpeg');
      setFfmpegStatus(status);
    } catch (err) {
      setFfmpegError(localizeUnknownError(err));
    } finally {
      setFfmpegLoading(false);
    }
  }, []);

  const setFfmpegSource = useCallback(
    async (source: DependencySource) => {
      setFfmpegError(null);
      try {
        await invoke('set_ffmpeg_source_cmd', { source });
        setFfmpegSourceState(source);
        await checkFfmpeg();
        if (source !== 'system') {
          const updateInfo = await invoke<FfmpegUpdateInfo>('check_ffmpeg_update');
          setFfmpegUpdateInfo(updateInfo);
        } else {
          setFfmpegUpdateInfo(null);
        }
      } catch (err) {
        setFfmpegError(err instanceof Error ? err.message : String(err));
      }
    },
    [checkFfmpeg],
  );

  // Check FFmpeg update
  const checkFfmpegUpdate = useCallback(async () => {
    setFfmpegCheckingUpdate(true);
    setFfmpegError(null);
    try {
      const updateInfo = await invoke<FfmpegUpdateInfo>('check_ffmpeg_update');
      setFfmpegUpdateInfo(updateInfo);
    } catch (err) {
      setFfmpegError(localizeUnknownError(err));
    } finally {
      setFfmpegCheckingUpdate(false);
    }
  }, []);

  // Download FFmpeg
  const downloadFfmpeg = useCallback(async () => {
    setFfmpegDownloading(true);
    setFfmpegError(null);
    setFfmpegSuccess(false);
    try {
      const version = await invoke<string>('download_ffmpeg');
      setFfmpegStatus({
        installed: true,
        version,
        binary_path: null, // Will be updated on next check
        is_system: false,
      });
      setFfmpegSuccess(true);
      // Set update info to show "Up to date" instead of null
      setFfmpegUpdateInfo({
        has_update: false,
        current_version: version,
        latest_version: version,
        release_url: null,
      });
      // Hide success message after 3 seconds
      setTimeout(() => setFfmpegSuccess(false), 3000);
      // Refresh to get full status
      await checkFfmpeg();
    } catch (err) {
      setFfmpegError(localizeUnknownError(err));
    } finally {
      setFfmpegDownloading(false);
    }
  }, [checkFfmpeg]);

  // Check Deno status
  const checkDeno = useCallback(async () => {
    setDenoLoading(true);
    setDenoError(null);
    try {
      const status = await invoke<DenoStatus>('check_deno');
      setDenoStatus(status);
      return status;
    } catch (err) {
      setDenoError(localizeUnknownError(err));
      return null;
    } finally {
      setDenoLoading(false);
    }
  }, []);

  // Check Deno update
  const checkDenoUpdate = useCallback(async () => {
    setDenoCheckingUpdate(true);
    setDenoError(null);
    try {
      const updateInfo = await invoke<DenoUpdateInfo>('check_deno_update');
      setDenoUpdateInfo(updateInfo);
    } catch (err) {
      setDenoError(localizeUnknownError(err));
    } finally {
      setDenoCheckingUpdate(false);
    }
  }, []);

  // Download Deno
  const downloadDeno = useCallback(async () => {
    setDenoDownloading(true);
    setDenoError(null);
    setDenoSuccess(false);
    try {
      const version = await invoke<string>('download_deno');
      setDenoStatus({
        installed: true,
        version,
        binary_path: null, // Will be updated on next check
        is_system: false,
      });
      setDenoSuccess(true);
      // Set update info to show "Up to date" instead of null
      setDenoUpdateInfo({
        has_update: false,
        current_version: version,
        latest_version: version,
        release_url: null,
      });
      // Hide success message after 3 seconds
      setTimeout(() => setDenoSuccess(false), 3000);
      // Refresh to get full status
      await checkDeno();
    } catch (err) {
      setDenoError(localizeUnknownError(err));
    } finally {
      setDenoDownloading(false);
    }
  }, [checkDeno]);

  const checkGalleryDl = useCallback(async () => {
    setGalleryDlLoading(true);
    setGalleryDlError(null);
    try {
      const status = await invoke<GalleryDlStatus>('check_gallerydl');
      setGalleryDlStatus(status);
      return status;
    } catch (err) {
      setGalleryDlError(localizeUnknownError(err));
      return null;
    } finally {
      setGalleryDlLoading(false);
    }
  }, []);

  // Initialize on first mount - auto download Deno and yt-dlp stable if not installed
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      Promise.all([
        invoke<DependencySource>('get_ytdlp_source_cmd').catch(() => 'auto' as DependencySource),
        invoke<DependencySource>('get_ffmpeg_source_cmd').catch(() => 'auto' as DependencySource),
      ]).then(async ([ySource, fSource]) => {
        setYtdlpSourceState(ySource);
        setFfmpegSourceState(fSource);

        await Promise.all([refreshYtdlpVersion(), checkFfmpeg()]);
        if (fSource !== 'system') {
          checkFfmpegUpdate().catch(() => {
            // Silently fail - update check is non-critical
          });
        }

        if (ySource !== 'system') {
          // Load channel info and auto-download stable if needed
          refreshAllYtdlpVersions().then(async (versions) => {
            if (!versions) return;
            // Auto-download stable if channel is stable/nightly but binary not installed
            if (versions.using_fallback && versions.current_channel !== 'bundled') {
              setIsAutoDownloadingYtdlp(true);
              setIsChannelDownloading(true);
              try {
                await invoke<string>('download_ytdlp_channel', {
                  channel: versions.current_channel,
                });
                setChannelDownloadSuccess(true);
                await refreshAllYtdlpVersions();
                await refreshYtdlpVersion();
                // Hide success message after 3 seconds
                setTimeout(() => {
                  setChannelDownloadSuccess(false);
                  setIsAutoDownloadingYtdlp(false);
                }, 3000);
              } catch {
                // Silently fail - continue using bundled
                // Will retry on next app launch
                setIsAutoDownloadingYtdlp(false);
              } finally {
                setIsChannelDownloading(false);
              }
            }
          });
        }
      });

      // Check Deno and auto-download if not installed
      checkDeno().then(async (status) => {
        if (!status) return;
        // Auto-download Deno if not installed (for YouTube support)
        if (!status.installed) {
          setIsAutoDownloadingDeno(true);
          setDenoDownloading(true);
          try {
            const version = await invoke<string>('download_deno');
            setDenoStatus({
              installed: true,
              version,
              binary_path: null,
              is_system: false,
            });
            setDenoSuccess(true);
            await checkDeno();
            // Hide success message after 3 seconds
            setTimeout(() => setDenoSuccess(false), 3000);
          } catch (err) {
            setDenoError(localizeUnknownError(err));
          } finally {
            setDenoDownloading(false);
            // Keep isAutoDownloadingDeno true until user dismisses or success auto-closes
          }
        }
      });

      checkGalleryDl().catch(() => {
        // gallery-dl is system-managed only, so failure here is non-fatal
      });
    }
  }, [
    initialized,
    refreshYtdlpVersion,
    refreshAllYtdlpVersions,
    checkFfmpeg,
    checkFfmpegUpdate,
    checkDeno,
    checkGalleryDl,
  ]);

  // Listen to download progress events
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    // FFmpeg download progress
    listen<DownloadProgress>('ffmpeg-download-progress', (event) => {
      setFfmpegDownloadProgress(event.payload);
      if (event.payload.stage === 'complete') {
        // Clear progress after completion
        setTimeout(() => setFfmpegDownloadProgress(null), 1000);
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    // Deno download progress
    listen<DownloadProgress>('deno-download-progress', (event) => {
      setDenoDownloadProgress(event.payload);
      if (event.payload.stage === 'complete') {
        // Clear progress after completion
        setTimeout(() => setDenoDownloadProgress(null), 1000);
      }
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []);

  // Check for updates
  const checkForUpdate = useCallback(async (options?: { silent?: boolean }) => {
    setIsChecking(true);
    if (!options?.silent) {
      setError(null);
    }
    setUpdateSuccess(false);
    try {
      const latest = await invoke<string>('check_ytdlp_update');
      setLatestVersion(latest);
      return latest;
    } catch (err) {
      if (!options?.silent) {
        setError(localizeUnknownError(err));
      }
      return null;
    } finally {
      setIsChecking(false);
    }
  }, []);

  // Update yt-dlp
  const updateYtdlp = useCallback(async () => {
    setIsUpdating(true);
    setError(null);
    setUpdateSuccess(false);
    try {
      const newVersion = await invoke<string>('update_ytdlp');
      setYtdlpInfo((prev) => (prev ? { ...prev, version: newVersion } : null));
      // Keep latestVersion same as newVersion to show "Up to date"
      setLatestVersion(newVersion);
      // Refresh to ensure binary path/channel source is reflected correctly
      await refreshYtdlpVersion();
      setUpdateSuccess(true);
      // Hide success message after 3 seconds
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      setError(localizeUnknownError(err));
    } finally {
      setIsUpdating(false);
    }
  }, [refreshYtdlpVersion]);

  // Run compatibility test + refresh backup availability
  const runCompatTest = useCallback(async () => {
    setCompatLoading(true);
    setBackupsLoading(true);
    try {
      const [compat, backups] = await Promise.all([
        invoke<EngineCompatResult[]>('check_engine_compat'),
        invoke<EngineBackupsStatus>('check_engine_backups'),
      ]);
      setCompatResults(compat);
      setBackupsStatus(backups);
    } catch (err) {
      setError(localizeUnknownError(err));
    } finally {
      setCompatLoading(false);
      setBackupsLoading(false);
    }
  }, []);

  // One-click rollback to the last working binary for an engine
  const rollbackEngine = useCallback(
    async (engine: string) => {
      setRollbackLoading(engine);
      setRollbackSuccess(null);
      try {
        const version = await invoke<string>('rollback_' + engine);
        setRollbackSuccess(version);
        setTimeout(() => setRollbackSuccess(null), 5000);
        await runCompatTest();
        if (engine === 'ytdlp') {
          await refreshYtdlpVersion();
        } else if (engine === 'ffmpeg') {
          await checkFfmpeg();
        } else if (engine === 'gallerydl') {
          await checkGalleryDl();
        } else if (engine === 'deno') {
          await checkDeno();
        }
      } catch (err) {
        setError(localizeUnknownError(err));
      } finally {
        setRollbackLoading(null);
      }
    },
    [runCompatTest, refreshYtdlpVersion, checkFfmpeg, checkGalleryDl, checkDeno],
  );

  // gallery-dl update support
  const checkGalleryDlUpdate = useCallback(async () => {
    try {
      const info = await invoke<GalleryDlUpdateInfo>('check_gallerydl_update');
      setGalleryDlUpdateInfo(info);
    } catch {
      setGalleryDlUpdateInfo(null);
    }
  }, []);

  const downloadGalleryDl = useCallback(async () => {
    setGalleryDlUpdating(true);
    try {
      const version = await invoke<string>('download_gallerydl');
      setGalleryDlUpdateInfo(null);
      setGalleryDlUpdated(version);
      setTimeout(() => setGalleryDlUpdated(null), 5000);
      await checkGalleryDl();
    } catch (err) {
      setError(localizeUnknownError(err));
    } finally {
      setGalleryDlUpdating(false);
    }
  }, [checkGalleryDl]);

  return (
    <DependenciesContext.Provider
      value={{
        ytdlpSource,
        ytdlpInfo,
        latestVersion,
        isLoading,
        isChecking,
        isUpdating,
        error,
        updateSuccess,
        refreshYtdlpVersion,
        checkForUpdate,
        updateYtdlp,
        // yt-dlp channel
        ytdlpChannel,
        ytdlpAllVersions,
        ytdlpChannelUpdateInfo,
        isChannelLoading,
        isChannelDownloading,
        isChannelCheckingUpdate,
        channelError,
        channelDownloadSuccess,
        isAutoDownloadingYtdlp,
        setYtdlpSource,
        setYtdlpChannel,
        refreshAllYtdlpVersions,
        checkChannelUpdate,
        downloadChannelBinary,
        // FFmpeg
        ffmpegSource,
        ffmpegStatus,
        ffmpegLoading,
        ffmpegDownloading,
        ffmpegError,
        ffmpegSuccess,
        ffmpegUpdateInfo,
        ffmpegCheckingUpdate,
        ffmpegDownloadProgress,
        setFfmpegSource,
        checkFfmpeg,
        checkFfmpegUpdate,
        downloadFfmpeg,
        // Deno
        denoStatus,
        denoLoading,
        denoDownloading,
        denoError,
        denoSuccess,
        denoUpdateInfo,
        denoCheckingUpdate,
        isAutoDownloadingDeno,
        denoDownloadProgress,
        checkDeno,
        checkDenoUpdate,
        downloadDeno,
        galleryDlStatus,
        galleryDlLoading,
        galleryDlError,
        checkGalleryDl,
        runCompatTest,
        compatResults,
        compatLoading,
        backupsStatus,
        backupsLoading,
        rollbackEngine,
        rollbackLoading,
        rollbackSuccess,
        checkGalleryDlUpdate,
        galleryDlUpdateInfo,
        downloadGalleryDl,
        galleryDlUpdating,
        galleryDlUpdated,
      }}
    >
      {children}
    </DependenciesContext.Provider>
  );
}

export function useDependencies() {
  const context = useContext(DependenciesContext);
  if (!context) {
    throw new Error('useDependencies must be used within a DependenciesProvider');
  }
  return context;
}
