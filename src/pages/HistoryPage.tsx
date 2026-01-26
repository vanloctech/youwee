import { FolderDown } from 'lucide-react';
import { HistoryItem, HistoryToolbar } from '@/components/history';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { useHistory } from '@/contexts/HistoryContext';
import { cn } from '@/lib/utils';

export function HistoryPage() {
  const { entries, loading, totalCount } = useHistory();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-base sm:text-lg font-semibold">Library</h1>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {totalCount} downloads
            </span>
          )}
        </div>
        <ThemePicker />
      </header>

      {/* Subtle divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex-shrink-0 p-4 sm:p-6">
          <HistoryToolbar />
        </div>

        {/* Subtle divider */}
        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* History list */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && entries.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-pulse text-muted-foreground">Loading history...</div>
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div
                  className={cn(
                    'w-16 h-16 rounded-2xl flex items-center justify-center mb-4',
                    'bg-primary/10 text-primary',
                  )}
                >
                  <FolderDown className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No downloads yet</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Your download history will appear here. Start downloading videos from YouTube or
                  other platforms to see them in your library.
                </p>
              </div>
            ) : (
              <div className="space-y-2 pb-4">
                {entries.map((entry) => (
                  <HistoryItem key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
