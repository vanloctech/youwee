import { createContext, useContext } from 'react';
import type { ChannelsContextType } from './channels/useChannelsController';

export const ChannelsContext = createContext<ChannelsContextType | null>(null);

export function useChannels() {
  const context = useContext(ChannelsContext);
  if (!context) {
    throw new Error('useChannels must be used within a ChannelsProvider');
  }
  return context;
}
