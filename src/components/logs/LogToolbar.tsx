import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { Download, FileText, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { useLogs } from '@/contexts/LogContext';
import type { LogFilter } from '@/lib/types';
import { cn } from '@/lib/utils';

export function LogToolbar() {
  const { t } = useTranslation(['pages', 'common']);
  const toast = useToast();
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
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filterOptions: { value: LogFilter; label: string }[] = [
    { value: 'all', label: t('logs.toolbar.filterAll') },
    { value: 'command', label: t('logs.toolbar.filterCommands') },
    { value: 'success', label: t('logs.toolbar.filterSuccess') },
    { value: 'info', label: t('logs.toolbar.filterInfo') },
    { value: 'error', label: t('logs.toolbar.filterErrors') },
    { value: 'stderr', label: t('logs.toolbar.filterDetail') },
  ];

  const handleClear = useCallback(() => {
    setClearConfirmOpen(true);
  }, []);

  const handleConfirmClear = useCallback(async () => {
    setClearing(true);
    try {
      await clearLogs();
      setClearConfirmOpen(false);
    } finally {
      setClearing(false);
    }
  }, [clearLogs]);

  const handleExport = useCallback(async () => {
    setExporting(true);
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

      toast.success({
        title: t('logs.toolbar.exportSuccess'),
        message: filePath,
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast.error({
        title: t('logs.toolbar.exportFailed', { error: String(error) }),
      });
    } finally {
      setExporting(false);
    }
  }, [exportLogs, t, toast]);

  return (
    <div className="space-y-3">
      {/* Search - styled like URL input */}
      <div className="relative flex-1">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('logs.toolbar.searchPlaceholder')}
          className={cn(
            'ps-10 pe-4 h-11 text-sm',
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
      <AlertDialog
        open={clearConfirmOpen}
        onOpenChange={(open) => {
          if (!clearing) {
            setClearConfirmOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('logs.toolbar.clear')}</AlertDialogTitle>
            <AlertDialogDescription>{t('logs.toolbar.clearConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>
              {t('actions.cancel', { ns: 'common' })}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmClear();
              }}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {t('logs.toolbar.clear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
