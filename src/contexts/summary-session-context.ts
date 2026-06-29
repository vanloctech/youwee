import { createContext, useContext } from 'react';
import type { SummarySessionOptions, SummarySessionState } from '@/lib/summary-session';

export interface SummarySessionContextValue {
  state: SummarySessionState;
  setUrl: (url: string) => void;
  updateOptions: (options: Partial<SummarySessionOptions>) => void;
  setShowSettings: (showSettings: boolean) => void;
  setShowFullSummary: (showFullSummary: boolean) => void;
  runSummary: (url: string) => Promise<void>;
  stopSummary: () => void;
  setError: (error: string) => void;
  markSaved: () => void;
  clearError: () => void;
}

export const SummarySessionContext = createContext<SummarySessionContextValue | null>(null);

export function useSummarySession() {
  const context = useContext(SummarySessionContext);
  if (!context) {
    throw new Error('useSummarySession must be used within a SummarySessionProvider');
  }
  return context;
}
