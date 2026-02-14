import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { YtdlpAllVersions, YtdlpChannel, YtdlpChannelUpdateInfo } from '../lib/types';

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
  checkForUpdate: () => Promise<void>;
  updateYtdlp: () => Promise<void>;

  // yt-dlp channel actions
  setYtdlpChannel: (channel: YtdlpChannel) => Promise<void>;
  refreshAllYtdlpVersions: () => Promise<YtdlpAllVersions | null>;
  checkChannelUpdate: (channel: YtdlpChannel) => Promise<void>;
  downloadChannelBinary: (channel: YtdlpChannel) => Promise<void>;

  // FFmpeg actions
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
}

const DependenciesContext = createContext<DependenciesContextType | null>(null);

export function DependenciesProvider({ children }: { children: ReactNode }) {
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
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
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

  // Load yt-dlp version (only once on first mount)
  const refreshYtdlpVersion = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await invoke<YtdlpVersionInfo>('get_ytdlp_version');
      setYtdlpInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setChannelError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setIsChannelLoading(false);
    }
  }, []);

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
        setChannelError(err instanceof Error ? err.message : String(err));
      }
    },
    [refreshYtdlpVersion],
  );

  // Check for channel update
  const checkChannelUpdate = useCallback(async (channel: YtdlpChannel) => {
    if (channel === 'bundled') return; // Bundled doesn't have updates
    setIsChannelCheckingUpdate(true);
    setChannelError(null);
    try {
      const updateInfo = await invoke<YtdlpChannelUpdateInfo>('check_ytdlp_channel_update', {
        channel,
      });
      setYtdlpChannelUpdateInfo(updateInfo);
    } catch (err) {
      setChannelError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsChannelCheckingUpdate(false);
    }
  }, []);

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
        setChannelError(err instanceof Error ? err.message : String(err));
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
      setFfmpegError(err instanceof Error ? err.message : String(err));
    } finally {
      setFfmpegLoading(false);
    }
  }, []);

  // Check FFmpeg update
  const checkFfmpegUpdate = useCallback(async () => {
    setFfmpegCheckingUpdate(true);
    setFfmpegError(null);
    try {
      const updateInfo = await invoke<FfmpegUpdateInfo>('check_ffmpeg_update');
      setFfmpegUpdateInfo(updateInfo);
    } catch (err) {
      setFfmpegError(err instanceof Error ? err.message : String(err));
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
      setFfmpegError(err instanceof Error ? err.message : String(err));
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
      setDenoError(err instanceof Error ? err.message : String(err));
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
      setDenoError(err instanceof Error ? err.message : String(err));
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
      setDenoError(err instanceof Error ? err.message : String(err));
    } finally {
      setDenoDownloading(false);
    }
  }, [checkDeno]);

  // Initialize on first mount - auto download Deno and yt-dlp stable if not installed
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      refreshYtdlpVersion();
      checkFfmpeg().then(() => {
        // Auto-check for FFmpeg updates after status check completes
        // The backend skips if FFmpeg is not installed or is a system install
        checkFfmpegUpdate().catch(() => {
          // Silently fail - update check is non-critical
        });
      });

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
            setDenoError(err instanceof Error ? err.message : String(err));
          } finally {
            setDenoDownloading(false);
            // Keep isAutoDownloadingDeno true until user dismisses or success auto-closes
          }
        }
      });
    }
  }, [
    initialized,
    refreshYtdlpVersion,
    refreshAllYtdlpVersions,
    checkFfmpeg,
    checkFfmpegUpdate,
    checkDeno,
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
  const checkForUpdate = useCallback(async () => {
    setIsChecking(true);
    setError(null);
    setUpdateSuccess(false);
    try {
      const latest = await invoke<string>('check_ytdlp_update');
      setLatestVersion(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdating(false);
    }
  }, [refreshYtdlpVersion]);

  return (
    <DependenciesContext.Provider
      value={{
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
        setYtdlpChannel,
        refreshAllYtdlpVersions,
        checkChannelUpdate,
        downloadChannelBinary,
        // FFmpeg
        ffmpegStatus,
        ffmpegLoading,
        ffmpegDownloading,
        ffmpegError,
        ffmpegSuccess,
        ffmpegUpdateInfo,
        ffmpegCheckingUpdate,
        ffmpegDownloadProgress,
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
