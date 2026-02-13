import {
  AlertTriangle,
  Check,
  CheckCircle,
  Copy,
  Info,
  Lightbulb,
  Terminal,
  XCircle,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LogEntry as LogEntryType } from '@/lib/types';
import { cn, isSafeUrl } from '@/lib/utils';

interface LogEntryProps {
  log: LogEntryType;
}

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

// Error pattern matching for troubleshooting hints
type TroubleshootingKey =
  | 'ffmpegMissing'
  | 'ytdlpError'
  | 'authRequired'
  | 'privateVideo'
  | 'videoUnavailable'
  | 'rateLimit'
  | 'proxyError'
  | 'networkError'
  | 'cookieLocked'
  | 'cookieDpapi';

interface ErrorPattern {
  patterns: RegExp[];
  hint: TroubleshootingKey;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    patterns: [/ffmpeg.*not found/i, /ffprobe.*not found/i, /ffmpeg is not installed/i],
    hint: 'ffmpegMissing',
  },
  {
    patterns: [/yt-dlp.*not found/i, /yt-dlp.*error/i, /unable to extract/i],
    hint: 'ytdlpError',
  },
  {
    patterns: [/sign in to confirm/i, /403 forbidden/i, /login required/i],
    hint: 'authRequired',
  },
  {
    patterns: [/private video/i, /members.only/i, /join this channel/i],
    hint: 'privateVideo',
  },
  {
    patterns: [/video unavailable/i, /video.*removed/i, /video.*deleted/i, /not available/i],
    hint: 'videoUnavailable',
  },
  {
    patterns: [/rate.limit/i, /too many requests/i, /429/i],
    hint: 'rateLimit',
  },
  {
    patterns: [/proxy.*error/i, /proxy.*failed/i, /socks/i],
    hint: 'proxyError',
  },
  {
    patterns: [/connection.*refused/i, /network.*error/i, /timeout/i, /econnrefused/i],
    hint: 'networkError',
  },
  {
    patterns: [/failed to decrypt.*dpapi/i, /app.bound.encryption/i],
    hint: 'cookieDpapi',
  },
  {
    patterns: [
      /could not copy.*cookie/i,
      /permission denied.*cookies/i,
      /cookie.*database/i,
      /failed to.*cookie/i,
    ],
    hint: 'cookieLocked',
  },
];

function getTroubleshootingHint(message: string, details?: string): TroubleshootingKey | null {
  const fullText = `${message} ${details || ''}`.toLowerCase();

  for (const { patterns, hint } of ERROR_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(fullText)) {
        return hint;
      }
    }
  }

  return null;
}

export function LogEntry({ log }: LogEntryProps) {
  const { t } = useTranslation('pages');
  const [copied, setCopied] = useState(false);

  // Get troubleshooting hint for error logs
  const troubleshootingHint = useMemo(() => {
    if (log.log_type !== 'error') return null;
    const hintKey = getTroubleshootingHint(log.message, log.details);
    if (!hintKey) return null;
    return t(`logs.troubleshooting.${hintKey}`);
  }, [log, t]);

  const logTypeConfig = {
    command: {
      icon: Terminal,
      label: t('logs.entry.command'),
      className: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      iconClassName: 'text-blue-500',
    },
    success: {
      icon: CheckCircle,
      label: t('logs.entry.success'),
      className: 'text-green-500 bg-green-500/10 border-green-500/20',
      iconClassName: 'text-green-500',
    },
    error: {
      icon: XCircle,
      label: t('logs.entry.error'),
      className: 'text-red-500 bg-red-500/10 border-red-500/20',
      iconClassName: 'text-red-500',
    },
    stderr: {
      icon: AlertTriangle,
      label: t('logs.entry.stderr'),
      className: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
      iconClassName: 'text-yellow-500',
    },
    info: {
      icon: Info,
      label: t('logs.entry.info'),
      className: 'text-gray-500 bg-gray-500/10 border-gray-500/20',
      iconClassName: 'text-gray-500',
    },
  };

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
              <span>{t('logs.entry.copied')}</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>{t('logs.entry.copy')}</span>
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
            <span className="opacity-60">{t('logs.entry.url')}:</span>{' '}
            <a
              href={isSafeUrl(log.url) ? log.url : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {log.url}
            </a>
          </p>
        )}

        {/* Troubleshooting Hint */}
        {troubleshootingHint && (
          <div className="mt-2 pt-2 border-t border-white/[0.06]">
            <p className="text-xs text-amber-500/90 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" />
              <span>
                <span className="font-medium">{t('logs.troubleshooting.tip')}:</span>{' '}
                {troubleshootingHint}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
