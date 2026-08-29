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
  checkForUpdate: (silent?: boolean) => Promise<boolean>;
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
      updater.checkForUpdate(true);
    }, 2000); // Wait 2s after app start (silent: no blocking dialog on failure)

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
