import { createContext, type ReactNode, useContext } from 'react';
import {
  type PreviewConfirmInfo,
  type ProcessingContextValue,
  useProcessingController,
} from './processing/useProcessingController';

const ProcessingContext = createContext<ProcessingContextValue | null>(null);

export function ProcessingProvider({ children }: { children: ReactNode }) {
  const value = useProcessingController();
  return <ProcessingContext.Provider value={value}>{children}</ProcessingContext.Provider>;
}

export function useProcessing() {
  const context = useContext(ProcessingContext);
  if (!context) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return context;
}

export type { PreviewConfirmInfo, ProcessingContextValue };
