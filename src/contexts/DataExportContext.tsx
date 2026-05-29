import { invoke } from '@tauri-apps/api/core';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { localizeUnknownError } from '@/lib/backend-error';
import type { ExportRow, ExportSource, ExtractDataRowsOutput } from '@/lib/types';
import { useDownload } from './DownloadContext';

const STORAGE_KEY = 'youwee_data_export_settings';

interface DataExportSettings {
  source: ExportSource;
  limit: number;
  detailMode: boolean;
}

interface DataExportContextType {
  source: ExportSource;
  inputText: string;
  limit: number;
  detailMode: boolean;
  rows: ExportRow[];
  title: string | null;
  warnings: string[];
  isExtracting: boolean;
  error: string | null;
  setSource: (source: ExportSource) => void;
  setInputText: (text: string) => void;
  setLimit: (limit: number) => void;
  setDetailMode: (detailMode: boolean) => void;
  extractRows: () => Promise<void>;
  cancelExtract: () => Promise<void>;
  clearRows: () => void;
}

function loadSettings(): DataExportSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        source: parsed.source || 'auto',
        limit: Number(parsed.limit) || 100,
        detailMode: parsed.detailMode === true,
      };
    }
  } catch (error) {
    console.error('Failed to load data export settings:', error);
  }

  return { source: 'auto', limit: 100, detailMode: false };
}

function saveSettings(settings: DataExportSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Failed to save data export settings:', error);
  }
}

const DataExportContext = createContext<DataExportContextType | null>(null);

export function DataExportProvider({ children }: { children: ReactNode }) {
  const { cookieSettings, getProxyUrl } = useDownload();
  const [settings, setSettings] = useState<DataExportSettings>(() => loadSettings());
  const [inputText, setInputText] = useState('');
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [title, setTitle] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSettings = useCallback((updates: Partial<DataExportSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  const extractRows = useCallback(async () => {
    if (!inputText.trim()) return;

    setIsExtracting(true);
    setError(null);
    setWarnings([]);

    try {
      const result = await invoke<ExtractDataRowsOutput>('extract_data_rows', {
        input: {
          source: settings.source,
          text: inputText,
          limit: settings.limit,
          detailMode: settings.detailMode,
          cookieMode: cookieSettings.mode,
          cookieBrowser: cookieSettings.browser || null,
          cookieBrowserProfile: cookieSettings.browserProfile || null,
          cookieFilePath: cookieSettings.filePath || null,
          proxyUrl: getProxyUrl() || null,
        },
      });

      setRows(result.rows);
      setTitle(result.title || null);
      setWarnings(result.warnings || []);
    } catch (error) {
      setError(localizeUnknownError(error));
    } finally {
      setIsExtracting(false);
    }
  }, [cookieSettings, getProxyUrl, inputText, settings]);

  const cancelExtract = useCallback(async () => {
    try {
      await invoke('cancel_data_export');
    } catch (error) {
      console.error('Failed to cancel data export:', error);
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const clearRows = useCallback(() => {
    setRows([]);
    setTitle(null);
    setWarnings([]);
    setError(null);
  }, []);

  const value = useMemo<DataExportContextType>(
    () => ({
      source: settings.source,
      inputText,
      limit: settings.limit,
      detailMode: settings.detailMode,
      rows,
      title,
      warnings,
      isExtracting,
      error,
      setSource: (source) => updateSettings({ source }),
      setInputText,
      setLimit: (limit) => updateSettings({ limit }),
      setDetailMode: (detailMode) => updateSettings({ detailMode }),
      extractRows,
      cancelExtract,
      clearRows,
    }),
    [
      cancelExtract,
      clearRows,
      error,
      extractRows,
      inputText,
      isExtracting,
      rows,
      settings,
      title,
      updateSettings,
      warnings,
    ],
  );

  return <DataExportContext.Provider value={value}>{children}</DataExportContext.Provider>;
}

export function useDataExport() {
  const context = useContext(DataExportContext);
  if (!context) {
    throw new Error('useDataExport must be used within a DataExportProvider');
  }
  return context;
}
