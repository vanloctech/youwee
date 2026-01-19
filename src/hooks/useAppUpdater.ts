import { useState, useEffect, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export interface UpdateProgress {
  downloaded: number;
  total: number;
}

export type UpdateStatus = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'up-to-date';

export function useAppUpdater() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    setStatus('checking');
    setError(null);

    try {
      const update = await check();
      
      if (update) {
        setUpdateInfo({
          version: update.version,
          currentVersion: update.currentVersion,
          body: update.body ?? undefined,
          date: update.date ?? undefined,
        });
        setStatus('available');
        return true;
      } else {
        setStatus('up-to-date');
        return false;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check for updates';
      setError(message);
      setStatus('error');
      return false;
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    setStatus('downloading');
    setProgress({ downloaded: 0, total: 0 });

    try {
      const update = await check();
      
      if (!update) {
        setStatus('up-to-date');
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            setProgress({ downloaded: 0, total: contentLength });
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            setProgress({ downloaded, total: contentLength });
            break;
          case 'Finished':
            setProgress({ downloaded: contentLength, total: contentLength });
            break;
        }
      });

      setStatus('ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download update';
      setError(message);
      setStatus('error');
    }
  }, []);

  const restartApp = useCallback(async () => {
    await relaunch();
  }, []);

  const dismissUpdate = useCallback(() => {
    setStatus('idle');
    setUpdateInfo(null);
  }, []);

  // Check for updates on mount (once)
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 2000); // Wait 2s after app start

    return () => clearTimeout(timer);
  }, [checkForUpdate]);

  return {
    status,
    updateInfo,
    progress,
    error,
    checkForUpdate,
    downloadAndInstall,
    restartApp,
    dismissUpdate,
  };
}
