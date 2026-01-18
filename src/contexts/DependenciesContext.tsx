import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface YtdlpVersionInfo {
  version: string;
  latest_version: string | null;
  update_available: boolean;
  is_bundled: boolean;
  binary_path: string;
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
  
  // Actions
  refreshYtdlpVersion: () => Promise<void>;
  checkForUpdate: () => Promise<void>;
  updateYtdlp: () => Promise<void>;
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

  // Initialize on first mount
  useEffect(() => {
    if (!initialized) {
      setInitialized(true);
      refreshYtdlpVersion();
    }
  }, [initialized, refreshYtdlpVersion]);

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
