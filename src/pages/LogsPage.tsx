import { ScrollText, Terminal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogEntry, LogToolbar } from '@/components/logs';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
import { useLogs } from '@/contexts/LogContext';

const INITIAL_VISIBLE_LOGS = 40;
const LOG_RENDER_BATCH_SIZE = 120;

export function LogsPage() {
  const { t } = useTranslation('pages');
  const { logs, loading } = useLogs();
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_LOGS);
  const visibleLogs = useMemo(() => logs.slice(0, visibleCount), [logs, visibleCount]);

  useEffect(() => {
    setVisibleCount(logs.length === 0 ? 0 : Math.min(INITIAL_VISIBLE_LOGS, logs.length));
  }, [logs]);

  useEffect(() => {
    if (visibleCount >= logs.length) return;

    const timeout = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(logs.length, current + LOG_RENDER_BATCH_SIZE));
    }, 32);

    return () => window.clearTimeout(timeout);
  }, [logs.length, visibleCount]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-w-0">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <h1 className="text-base sm:text-lg font-semibold">{t('logs.title')}</h1>
        <ThemePicker />
      </header>

      {/* Subtle divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="flex-shrink-0 p-4 sm:p-6">
          <LogToolbar />
        </div>

        {/* Subtle divider */}
        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Log list */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
            {loading && logs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-pulse text-muted-foreground">{t('logs.loading')}</div>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <EmptyStateIllustration className="mb-5" icon={ScrollText} />
                <h3 className="text-lg font-semibold mb-2">{t('logs.emptyTitle')}</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {t('logs.emptyDescription')}
                </p>
                <div className="mt-6 p-4 rounded-xl bg-background/50 border border-white/[0.08]">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Terminal className="w-4 h-4" />
                    <code className="font-mono">
                      yt-dlp --newline -f "bestvideo+bestaudio" -o "..." URL
                    </code>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {visibleLogs.map((log) => (
                  <LogEntry key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
