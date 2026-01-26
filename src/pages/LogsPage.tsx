import { ScrollText, Terminal } from 'lucide-react';
import { LogEntry, LogToolbar } from '@/components/logs';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { useLogs } from '@/contexts/LogContext';
import { cn } from '@/lib/utils';

export function LogsPage() {
  const { logs, loading } = useLogs();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <h1 className="text-base sm:text-lg font-semibold">Logs</h1>
        <ThemePicker />
      </header>

      {/* Subtle divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex-shrink-0 p-4 sm:p-6">
          <LogToolbar />
        </div>

        {/* Subtle divider */}
        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Log list */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && logs.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-pulse text-muted-foreground">Loading logs...</div>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div
                  className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center mb-4',
                    'bg-primary/10 text-primary',
                  )}
                >
                  <ScrollText className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No logs yet</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Logs will appear here when you start downloading videos. You'll see the yt-dlp
                  commands executed, success/error messages, and debug output.
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
                {logs.map((log) => (
                  <LogEntry key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>

          {/* Footer stats */}
          {logs.length > 0 && (
            <div className="flex-shrink-0 py-3 border-t border-white/[0.08]">
              <p className="text-xs text-muted-foreground text-center">
                Showing {logs.length} log entries · Auto-refreshes every 5 seconds
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
