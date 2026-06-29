import { createContext, useContext } from 'react';
import type { DownloadContextType } from './DownloadContext';

export const DownloadContext = createContext<DownloadContextType | null>(null);

export function useDownload() {
  const context = useContext(DownloadContext);
  if (!context) {
    throw new Error('useDownload must be used within a DownloadProvider');
  }
  return context;
}
