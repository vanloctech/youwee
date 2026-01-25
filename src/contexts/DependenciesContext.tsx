import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

export interface BunStatus {
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

export interface BunUpdateInfo {
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
  
  // Bun state
  bunStatus: BunStatus | null;
  bunLoading: boolean;
  bunDownloading: boolean;
  bunError: string | null;
  bunSuccess: boolean;
  bunUpdateInfo: BunUpdateInfo | null;
  bunCheckingUpdate: boolean;
  
  // Bun actions
  checkBun: () => Promise<void>;
  checkBunUpdate: () => Promise<void>;
  downloadBun: () => Promise<void>;
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
  
  // Bun state
  const [bunStatus, setBunStatus] = useState<BunStatus | null>(null);
  const [bunLoading, setBunLoading] = useState(false);
  const [bunDownloading, setBunDownloading] = useState(false);
  const [bunError, setBunError] = useState<string | null>(null);
  const [bunSuccess, setBunSuccess] = useState(false);
  const [bunUpdateInfo, setBunUpdateInfo] = useState<BunUpdateInfo | null>(null);
  const [bunCheckingUpdate, setBunCheckingUpdate] = useState(false);

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
      setFfmpegUpdateInfo(null); // Clear update info after successful download
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

  // Check Bun status
  const checkBun = useCallback(async () => {
    setBunLoading(true);
    setBunError(null);
    try {
      const status = await invoke<BunStatus>('check_bun');
      setBunStatus(status);
    } catch (err) {
      setBunError(err instanceof Error ? err.message : String(err));
    } finally {
      setBunLoading(false);
    }
  }, []);

  // Check Bun update
  const checkBunUpdate = useCallback(async () => {
    setBunCheckingUpdate(true);
    setBunError(null);
    try {
      const updateInfo = await invoke<BunUpdateInfo>('check_bun_update');
      setBunUpdateInfo(updateInfo);
    } catch (err) {
      setBunError(err instanceof Error ? err.message : String(err));
    } finally {
      setBunCheckingUpdate(false);
    }
  }, []);

  // Download Bun
  const downloadBun = useCallback(async () => {
    setBunDownloading(true);
    setBunError(null);
    setBunSuccess(false);
    try {
      const version = await invoke<string>('download_bun');
      setBunStatus({
        installed: true,
        version,
        binary_path: null, // Will be updated on next check
        is_system: false,
      });
      setBunSuccess(true);
      setBunUpdateInfo(null); // Clear update info after successful download
      // Hide success message after 3 seconds
      setTimeout(() => setBunSuccess(false), 3000);
      // Refresh to get full status
      await checkBun();
    } catch (err) {
      setBunError(err instanceof Error ? err.message : String(err));
    } finally {
      setBunDownloading(false);
    }
  }, [checkBun]);

  // Initialize on first mount
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      refreshYtdlpVersion();
      checkFfmpeg();
      checkBun();
    }
  }, [initialized, refreshYtdlpVersion, checkFfmpeg, checkBun]);

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
      setYtdlpInfo(prev => prev ? { ...prev, version: newVersion } : null);
      setLatestVersion(null);
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
        // Bun
        bunStatus,
        bunLoading,
        bunDownloading,
        bunError,
        bunSuccess,
        bunUpdateInfo,
        bunCheckingUpdate,
        checkBun,
        checkBunUpdate,
        downloadBun,
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
