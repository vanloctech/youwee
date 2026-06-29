import { createContext, useContext } from 'react';
import type { UniversalContextType } from './UniversalContext';

export const UniversalContext = createContext<UniversalContextType | null>(null);

export function useUniversal() {
  const context = useContext(UniversalContext);
  if (!context) {
    throw new Error('useUniversal must be used within a UniversalProvider');
  }
  return context;
}
