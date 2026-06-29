import type { ReactNode } from 'react';
import {
  type ChannelsContextType,
  useChannelsController,
  type VideoDownloadState,
} from './channels/useChannelsController';
import { ChannelsContext } from './channels-context';

export function ChannelsProvider({ children }: { children: ReactNode }) {
  const value = useChannelsController();
  return <ChannelsContext.Provider value={value}>{children}</ChannelsContext.Provider>;
}

export type { ChannelsContextType, VideoDownloadState };
