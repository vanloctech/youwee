import { AlertTriangle, Check, CheckCircle, Copy, Info, Terminal, XCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { LogEntry as LogEntryType } from '@/lib/types';
import { cn } from '@/lib/utils';

interface LogEntryProps {
  log: LogEntryType;
}

const logTypeConfig = {
  command: {
    icon: Terminal,
    label: 'COMMAND',
    className: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    iconClassName: 'text-blue-500',
  },
  success: {
    icon: CheckCircle,
    label: 'SUCCESS',
    className: 'text-green-500 bg-green-500/10 border-green-500/20',
    iconClassName: 'text-green-500',
  },
  error: {
    icon: XCircle,
    label: 'ERROR',
    className: 'text-red-500 bg-red-500/10 border-red-500/20',
    iconClassName: 'text-red-500',
  },
  stderr: {
    icon: AlertTriangle,
    label: 'STDERR',
    className: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    iconClassName: 'text-yellow-500',
  },
  info: {
    icon: Info,
    label: 'INFO',
    className: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
    iconClassName: 'text-gray-500',
  },
};

function formatTimestamp(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function LogEntry({ log }: LogEntryProps) {
  const [copied, setCopied] = useState(false);
  const config = logTypeConfig[log.log_type] || logTypeConfig.info;
  const Icon = config.icon;

  const handleCopy = useCallback(() => {
    const textToCopy = [
      `[${log.log_type.toUpperCase()}] ${log.timestamp}`,
      log.message,
      log.details ? `Details: ${log.details}` : null,
      log.url ? `URL: ${log.url}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [log]);

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all duration-200',
        'bg-card/50 hover:bg-card/80',
        'border-white/[0.08] dark:border-white/[0.05]',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border',
              config.className,
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{config.label}</span>
          </div>
          <span className="text-xs text-muted-foreground">{formatTimestamp(log.timestamp)}</span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-md text-xs',
            'opacity-0 group-hover:opacity-100 transition-opacity',
            'hover:bg-white/10 text-muted-foreground hover:text-foreground',
          )}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-500" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <p
          className={cn(
            'text-sm font-mono break-all',
            log.log_type === 'command' && 'text-blue-400',
            log.log_type === 'error' && 'text-red-400',
            log.log_type === 'stderr' && 'text-yellow-400',
          )}
        >
          {log.message}
        </p>

        {log.details && <p className="text-xs text-muted-foreground">{log.details}</p>}

        {log.url && (
          <p className="text-xs text-muted-foreground truncate">
            <span className="opacity-60">URL:</span>{' '}
            <a
              href={log.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {log.url}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
