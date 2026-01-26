import { invoke } from '@tauri-apps/api/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { LogEntry, LogFilter } from '@/lib/types';

interface LogContextType {
  logs: LogEntry[];
  filter: LogFilter;
  search: string;
  loading: boolean;
  logStderr: boolean;
  setFilter: (filter: LogFilter) => void;
  setSearch: (search: string) => void;
  setLogStderr: (enabled: boolean) => void;
  refreshLogs: () => Promise<void>;
  clearLogs: () => Promise<void>;
  exportLogs: () => Promise<string>;
}

const LogContext = createContext<LogContextType | null>(null);

const LOG_STDERR_KEY = 'youwee_log_stderr';

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [logStderr, setLogStderrState] = useState(() => {
    const saved = localStorage.getItem(LOG_STDERR_KEY);
    return saved !== null ? saved === 'true' : true; // Default: true
  });

  const setLogStderr = useCallback((enabled: boolean) => {
    setLogStderrState(enabled);
    localStorage.setItem(LOG_STDERR_KEY, String(enabled));
  }, []);

  const refreshLogs = useCallback(async () => {
    setLoading(true);
    try {
      const filterParam = filter === 'all' ? null : filter;
      const searchParam = search.trim() || null;
      const result = await invoke<LogEntry[]>('get_logs', {
        filter: filterParam,
        search: searchParam,
        limit: 500,
      });
      setLogs(result);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  const clearLogs = useCallback(async () => {
    try {
      await invoke('clear_logs');
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
      throw error;
    }
  }, []);

  const exportLogs = useCallback(async () => {
    try {
      const json = await invoke<string>('export_logs');
      return json;
    } catch (error) {
      console.error('Failed to export logs:', error);
      throw error;
    }
  }, []);

  // Fetch logs on mount and when filter/search changes
  useEffect(() => {
    refreshLogs();
  }, [refreshLogs]);

  // Auto-refresh logs every 5 seconds when viewing
  useEffect(() => {
    const interval = setInterval(() => {
      refreshLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshLogs]);

  return (
    <LogContext.Provider
      value={{
        logs,
        filter,
        search,
        loading,
        logStderr,
        setFilter,
        setSearch,
        setLogStderr,
        refreshLogs,
        clearLogs,
        exportLogs,
      }}
    >
      {children}
    </LogContext.Provider>
  );
}

export function useLogs() {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error('useLogs must be used within a LogProvider');
  }
  return context;
}
