import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { CheckCircle, Download, FileText, RefreshCw, Search, Trash2, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useLogs } from '@/contexts/LogContext';
import type { LogFilter } from '@/lib/types';
import { cn } from '@/lib/utils';

interface ExportNotification {
  type: 'success' | 'error';
  message: string;
  path?: string;
}

export function LogToolbar() {
  const { t } = useTranslation('pages');
  const {
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
  } = useLogs();

  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notification, setNotification] = useState<ExportNotification | null>(null);

  const filterOptions: { value: LogFilter; label: string }[] = [
    { value: 'all', label: t('logs.toolbar.filterAll') },
    { value: 'command', label: t('logs.toolbar.filterCommands') },
    { value: 'success', label: t('logs.toolbar.filterSuccess') },
    { value: 'info', label: t('logs.toolbar.filterInfo') },
    { value: 'error', label: t('logs.toolbar.filterErrors') },
    { value: 'stderr', label: t('logs.toolbar.filterDetail') },
  ];

  const handleClear = useCallback(async () => {
    if (!confirm(t('logs.toolbar.clearConfirm'))) return;
    setClearing(true);
    try {
      await clearLogs();
    } finally {
      setClearing(false);
    }
  }, [clearLogs, t]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setNotification(null);
    try {
      // Show save dialog
      const defaultFileName = `youwee-logs-${new Date().toISOString().split('T')[0]}.json`;
      const filePath = await save({
        defaultPath: defaultFileName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        title: t('logs.toolbar.exportLogs'),
      });

      if (!filePath) {
        // User cancelled
        setExporting(false);
        return;
      }

      const json = await exportLogs();
      await writeTextFile(filePath, json);

      setNotification({
        type: 'success',
        message: t('logs.toolbar.exportSuccess'),
        path: filePath,
      });

      // Auto-hide notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    } catch (error) {
      console.error('Export failed:', error);
      setNotification({
        type: 'error',
        message: t('logs.toolbar.exportFailed', { error: String(error) }),
      });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setExporting(false);
    }
  }, [exportLogs, t]);

  return (
    <div className="space-y-3">
      {/* Export notification */}
      {notification && (
        <div
          className={cn(
            'flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
            notification.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20',
          )}
        >
          {notification.type === 'success' ? (
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-medium">{notification.message}</p>
            {notification.path && (
              <p className="text-xs opacity-80 truncate mt-0.5" title={notification.path}>
                {notification.path}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            {t('logs.toolbar.dismiss')}
          </button>
        </div>
      )}

      {/* Search - styled like URL input */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('logs.toolbar.searchPlaceholder')}
          className={cn(
            'pl-10 pr-4 h-11 text-sm',
            'bg-background/50 border-border/50',
            'focus:bg-background transition-colors',
            'placeholder:text-muted-foreground/50',
          )}
        />
      </div>

      {/* Filter tabs and actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Filter tabs */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="inline-flex items-center rounded-lg bg-muted/50 p-1">
            {filterOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap',
                  filter === option.value
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 overflow-x-auto">
          {/* Log detail toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 whitespace-nowrap">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('logs.toolbar.logDetail')}</span>
            <Switch
              checked={logStderr}
              onCheckedChange={setLogStderr}
              className="data-[state=checked]:bg-primary"
            />
          </div>

          <button
            type="button"
            onClick={() => refreshLogs()}
            disabled={loading}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
              'bg-muted/50 hover:bg-muted transition-colors',
              'text-muted-foreground hover:text-foreground',
              loading && 'opacity-50',
            )}
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {t('logs.toolbar.refresh')}
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
              'bg-muted/50 hover:bg-muted transition-colors',
              'text-muted-foreground hover:text-foreground',
              exporting && 'opacity-50',
            )}
          >
            <Download className="w-4 h-4" />
            {t('logs.toolbar.export')}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap',
              'bg-red-500/10 hover:bg-red-500/20 transition-colors',
              'text-red-400 hover:text-red-300',
              clearing && 'opacity-50',
            )}
          >
            <Trash2 className="w-4 h-4" />
            {t('logs.toolbar.clear')}
          </button>
        </div>
      </div>
    </div>
  );
}
