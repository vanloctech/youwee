import { createContext, type ReactNode, useContext } from 'react';
import {
  type ChannelsContextType,
  detectPlatform,
  isSupportedPlatform,
  useChannelsController,
  type VideoDownloadState,
} from './channels/useChannelsController';

const ChannelsContext = createContext<ChannelsContextType | null>(null);

export function ChannelsProvider({ children }: { children: ReactNode }) {
  const value = useChannelsController();
  return <ChannelsContext.Provider value={value}>{children}</ChannelsContext.Provider>;
}

export function useChannels() {
  const context = useContext(ChannelsContext);
  if (!context) {
    throw new Error('useChannels must be used within a ChannelsProvider');
  }
  return context;
}

export { detectPlatform, isSupportedPlatform };
export type { ChannelsContextType, VideoDownloadState };
