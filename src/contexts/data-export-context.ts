import { createContext, useContext } from 'react';
import type { DataExportContextType } from './DataExportContext';

export const DataExportContext = createContext<DataExportContextType | null>(null);

export function useDataExport() {
  const context = useContext(DataExportContext);
  if (!context) {
    throw new Error('useDataExport must be used within a DataExportProvider');
  }
  return context;
}
