import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Eye,
  ListVideo,
  Loader2,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CookieSettings, ProxySettings } from '@/lib/types';
import { cn } from '@/lib/utils';

// Cookie settings storage key (same as in DownloadContext)
const COOKIE_STORAGE_KEY = 'youwee-cookie-settings';
const PROXY_STORAGE_KEY = 'youwee-proxy-settings';

// Load cookie settings from localStorage
function loadCookieSettings(): CookieSettings {
  try {
    const saved = localStorage.getItem(COOKIE_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load cookie settings:', e);
  }
  return { mode: 'off' };
}

// Load proxy settings from localStorage
function loadProxySettings(): ProxySettings {
  try {
    const saved = localStorage.getItem(PROXY_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load proxy settings:', e);
  }
  return { mode: 'off' };
}

// Build proxy URL string from settings
function buildProxyUrl(settings: ProxySettings): string | undefined {
  if (settings.mode === 'off' || !settings.host || !settings.port) {
    return undefined;
  }

  const protocol = settings.mode === 'socks5' ? 'socks5' : 'http';
  const auth =
    settings.username && settings.password
      ? `${encodeURIComponent(settings.username)}:${encodeURIComponent(settings.password)}@`
      : '';

  return `${protocol}://${auth}${settings.host}:${settings.port}`;
}

interface VideoInfo {
  id: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  channel: string | null;
  uploader: string | null;
  upload_date: string | null;
  view_count: number | null;
  description: string | null;
  is_playlist: boolean;
  playlist_count: number | null;
}

interface FormatOption {
  format_id: string;
  ext: string;
  resolution: string | null;
  width: number | null;
  height: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  filesize_approx: number | null;
  tbr: number | null;
  format_note: string | null;
  fps: number | null;
  quality: number | null;
}

interface VideoInfoResponse {
  info: VideoInfo;
  formats: FormatOption[];
}

interface VideoPreviewProps {
  url: string;
  onClose?: () => void;
  onFormatSelect?: (formatId: string) => void;
  className?: string;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatViewCount(count: number | null): string {
  if (!count) return '0';
  if (count >= 1_000_000_000) {
    return `${(count / 1_000_000_000).toFixed(1)}B`;
  }
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

function formatDate(dateStr: string | null): string {
  if (!dateStr || dateStr.length !== 8) return '';
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function formatFilesize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

export function VideoPreview({ url, onClose, onFormatSelect, className }: VideoPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<VideoInfoResponse | null>(null);
  const [loadingStage, setLoadingStage] = useState<'validating' | 'fetching' | 'parsing'>(
    'validating',
  );
  const [showDetails, setShowDetails] = useState(false);
  const [showFormats, setShowFormats] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchInfo = async () => {
      setLoading(true);
      setError(null);
      setLoadingStage('validating');

      const stage1Timer = window.setTimeout(() => setLoadingStage('fetching'), 400);
      const stage2Timer = window.setTimeout(() => setLoadingStage('parsing'), 1200);

      try {
        const cookieSettings = loadCookieSettings();
        const proxySettings = loadProxySettings();
        const result = await invoke<VideoInfoResponse>('get_video_info', {
          url,
          cookieMode: cookieSettings.mode,
          cookieBrowser: cookieSettings.browser || null,
          cookieBrowserProfile: cookieSettings.browserProfile || null,
          cookieFilePath: cookieSettings.filePath || null,
          proxyUrl: buildProxyUrl(proxySettings) || null,
        });
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
        window.clearTimeout(stage1Timer);
        window.clearTimeout(stage2Timer);
      }
    };

    fetchInfo();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border bg-card/50 backdrop-blur-sm p-4 sm:p-5', className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>
            {loadingStage === 'validating' && 'Validating URL...'}
            {loadingStage === 'fetching' && 'Fetching metadata...'}
            {loadingStage === 'parsing' && 'Preparing preview...'}
          </span>
        </div>

        <div className="mt-3 flex gap-3">
          <div className="h-24 w-40 animate-pulse rounded-lg bg-muted/60" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted/60" />
            <div className="h-3.5 w-3/5 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-2/5 animate-pulse rounded bg-muted/50" />
            <div className="flex gap-1.5">
              <div className="h-5 w-16 animate-pulse rounded bg-muted/50" />
              <div className="h-5 w-20 animate-pulse rounded bg-muted/50" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn('rounded-xl border bg-destructive/5 border-destructive/20 p-4', className)}
      >
        <div className="flex items-start gap-3 text-destructive">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Failed to fetch video info</p>
            <p className="text-xs mt-1 opacity-80">{error}</p>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { info, formats } = data;

  // Group formats by type
  const videoFormats = formats
    .filter((f) => f.vcodec && f.vcodec !== 'none' && f.height)
    .sort((a, b) => (b.height || 0) - (a.height || 0));

  const audioFormats = formats
    .filter((f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
    .sort((a, b) => (b.tbr || 0) - (a.tbr || 0));

  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card/50 backdrop-blur-sm', className)}>
      <div className="flex gap-3 p-3.5 sm:gap-4 sm:p-4">
        {info.thumbnail && (
          <div className="relative h-24 w-40 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
            <img
              src={info.thumbnail}
              alt={info.title}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            {info.duration && (
              <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                {formatDuration(info.duration)}
              </div>
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-medium leading-tight">{info.title}</h3>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {(info.channel || info.uploader) && (
              <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
                <User className="h-3 w-3" />
                {info.channel || info.uploader}
              </span>
            )}
            {info.view_count && (
              <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5">
                <Eye className="h-3 w-3" />
                {formatViewCount(info.view_count)} views
              </span>
            )}
            {videoFormats.length > 0 && (
              <Badge variant="secondary" className="h-5 rounded px-1.5 text-[11px]">
                Up to {videoFormats[0].height}p
              </Badge>
            )}
            {info.is_playlist && info.playlist_count && (
              <Badge
                variant="outline"
                className="h-5 rounded border-primary/20 bg-primary/10 px-1.5 text-[11px] text-primary"
              >
                <ListVideo className="mr-1 h-3 w-3" />
                {info.playlist_count} videos
              </Badge>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(videoFormats.length > 0 || audioFormats.length > 0) && (
              <button
                type="button"
                onClick={() => setShowFormats((v) => !v)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border/70 px-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                {showFormats ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span>{showFormats ? 'Hide formats' : 'Show formats'}</span>
              </button>
            )}

            {(info.upload_date || info.description) && (
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-border/70 px-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
              >
                {showDetails ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
                <span>{showDetails ? 'Less details' : 'More details'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {showDetails && (info.upload_date || info.description) && (
        <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          {info.upload_date && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded bg-muted/60 px-2 py-1">
              <Calendar className="h-3 w-3" />
              {formatDate(info.upload_date)}
            </div>
          )}
          {info.description && <p className="line-clamp-3 leading-relaxed">{info.description}</p>}
        </div>
      )}

      {showFormats && (videoFormats.length > 0 || audioFormats.length > 0) && (
        <div className="border-t bg-muted/25 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Available formats</p>
          <div className="flex flex-wrap gap-2">
            {videoFormats.slice(0, 6).map((f) => (
              <button
                type="button"
                key={f.format_id}
                onClick={() => onFormatSelect?.(f.format_id)}
                className="rounded-lg border bg-background/50 px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <span className="font-medium">{f.height}p</span>
                <span className="ml-1 text-muted-foreground">{f.ext}</span>
                {(f.filesize || f.filesize_approx) && (
                  <span className="ml-1 text-muted-foreground">
                    ({formatFilesize(f.filesize || f.filesize_approx)})
                  </span>
                )}
              </button>
            ))}
            {audioFormats.slice(0, 2).map((f) => (
              <button
                type="button"
                key={f.format_id}
                onClick={() => onFormatSelect?.(f.format_id)}
                className="rounded-lg border bg-background/50 px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <span className="font-medium">Audio</span>
                <span className="ml-1 text-muted-foreground">{f.ext}</span>
                {f.tbr && (
                  <span className="ml-1 text-muted-foreground">({Math.round(f.tbr)}kbps)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
