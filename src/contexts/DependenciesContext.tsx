import { invoke } from '@tauri-apps/api/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

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

interface DependenciesContextType {
  // yt-dlp state
  ytdlpInfo: YtdlpVersionInfo | null;
  latestVersion: string | null;
  isLoading: boolean;
  isChecking: boolean;
  isUpdating: boolean;
  error: string | null;
  updateSuccess: boolean;

  // FFmpeg state
  ffmpegStatus: FfmpegStatus | null;
  ffmpegLoading: boolean;
  ffmpegDownloading: boolean;
  ffmpegError: string | null;
  ffmpegSuccess: boolean;
  ffmpegUpdateInfo: FfmpegUpdateInfo | null;
  ffmpegCheckingUpdate: boolean;

  // Actions
  refreshYtdlpVersion: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
  updateYtdlp: () => Promise<void>;

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

  // Deno actions
  checkDeno: () => Promise<void>;
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

  // FFmpeg state
  const [ffmpegStatus, setFfmpegStatus] = useState<FfmpegStatus | null>(null);
  const [ffmpegLoading, setFfmpegLoading] = useState(false);
  const [ffmpegDownloading, setFfmpegDownloading] = useState(false);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [ffmpegSuccess, setFfmpegSuccess] = useState(false);
  const [ffmpegUpdateInfo, setFfmpegUpdateInfo] = useState<FfmpegUpdateInfo | null>(null);
  const [ffmpegCheckingUpdate, setFfmpegCheckingUpdate] = useState(false);

  // Deno state
  const [denoStatus, setDenoStatus] = useState<DenoStatus | null>(null);
  const [denoLoading, setDenoLoading] = useState(false);
  const [denoDownloading, setDenoDownloading] = useState(false);
  const [denoError, setDenoError] = useState<string | null>(null);
  const [denoSuccess, setDenoSuccess] = useState(false);
  const [denoUpdateInfo, setDenoUpdateInfo] = useState<DenoUpdateInfo | null>(null);
  const [denoCheckingUpdate, setDenoCheckingUpdate] = useState(false);
  const [isAutoDownloadingDeno, setIsAutoDownloadingDeno] = useState(false);

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
    } catch (err) {
      setDenoError(err instanceof Error ? err.message : String(err));
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

  // Initialize on first mount - auto download Deno if not installed
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      refreshYtdlpVersion();
      checkFfmpeg();
      // Check Deno and auto-download if not installed
      checkDeno().then(async () => {
        // Auto-download Deno if not installed (for YouTube support)
        const status = await invoke<DenoStatus>('check_deno');
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
  }, [initialized, refreshYtdlpVersion, checkFfmpeg, checkDeno]);

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
      setUpdateSuccess(true);
      // Hide success message after 3 seconds
      setTimeout(() => setUpdateSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdating(false);
    }
  }, []);

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
        // FFmpeg
        ffmpegStatus,
        ffmpegLoading,
        ffmpegDownloading,
        ffmpegError,
        ffmpegSuccess,
        ffmpegUpdateInfo,
        ffmpegCheckingUpdate,
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
