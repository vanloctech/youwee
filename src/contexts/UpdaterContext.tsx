import { createContext, type ReactNode, useContext, useEffect } from 'react';
import {
  type UpdateInfo,
  type UpdateProgress,
  type UpdateStatus,
  useAppUpdater,
} from '@/hooks/useAppUpdater';

interface UpdaterContextType {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  checkForUpdate: () => Promise<boolean>;
  downloadAndInstall: () => Promise<void>;
  restartApp: () => Promise<void>;
  dismissUpdate: () => void;
}

const UpdaterContext = createContext<UpdaterContextType | null>(null);

interface UpdaterProviderProps {
  children: ReactNode;
  autoCheck: boolean;
}

export function UpdaterProvider({ children, autoCheck }: UpdaterProviderProps) {
  const updater = useAppUpdater();

  // Auto check for updates on mount if enabled
  useEffect(() => {
    if (!autoCheck) return;

    const timer = setTimeout(() => {
      updater.checkForUpdate();
    }, 2000); // Wait 2s after app start

    return () => clearTimeout(timer);
  }, [autoCheck, updater.checkForUpdate]);

  return <UpdaterContext.Provider value={updater}>{children}</UpdaterContext.Provider>;
}

export function useUpdater() {
  const context = useContext(UpdaterContext);
  if (!context) {
    throw new Error('useUpdater must be used within UpdaterProvider');
  }
  return context;
}
