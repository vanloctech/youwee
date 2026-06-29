import { createContext, useContext } from 'react';
import type { MetadataContextType } from './MetadataContext';

export const MetadataContext = createContext<MetadataContextType | null>(null);

export function useMetadata() {
  const context = useContext(MetadataContext);
  if (!context) {
    throw new Error('useMetadata must be used within a MetadataProvider');
  }
  return context;
}
