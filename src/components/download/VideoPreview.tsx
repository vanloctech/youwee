import { invoke } from '@tauri-apps/api/core';
import { AlertCircle, Calendar, Eye, ListVideo, Loader2, User, X } from 'lucide-react';
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

  useEffect(() => {
    let cancelled = false;

    const fetchInfo = async () => {
      setLoading(true);
      setError(null);

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
      }
    };

    fetchInfo();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className={cn('rounded-xl border bg-card/50 backdrop-blur-sm p-6', className)}>
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Fetching video info...</span>
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
    <div className={cn('rounded-xl border bg-card/50 backdrop-blur-sm overflow-hidden', className)}>
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        {info.thumbnail && (
          <div className="relative flex-shrink-0 w-40 h-24 rounded-lg overflow-hidden bg-muted">
            <img
              src={info.thumbnail}
              alt={info.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            {info.duration && (
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-white text-xs font-medium">
                {formatDuration(info.duration)}
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium leading-tight line-clamp-2">{info.title}</h3>
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {(info.channel || info.uploader) && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {info.channel || info.uploader}
              </span>
            )}
            {info.view_count && (
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {formatViewCount(info.view_count)} views
              </span>
            )}
            {info.upload_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(info.upload_date)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {info.is_playlist && info.playlist_count && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                <ListVideo className="w-3 h-3 mr-1" />
                {info.playlist_count} videos
              </Badge>
            )}
            {videoFormats.length > 0 && (
              <Badge variant="secondary">Up to {videoFormats[0].height}p</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Formats (collapsible later if needed) */}
      {(videoFormats.length > 0 || audioFormats.length > 0) && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground">Available Formats</p>

          {/* Top video formats */}
          <div className="flex flex-wrap gap-2">
            {videoFormats.slice(0, 6).map((f) => (
              <button
                type="button"
                key={f.format_id}
                onClick={() => onFormatSelect?.(f.format_id)}
                className="px-2.5 py-1.5 rounded-lg border bg-background/50 hover:bg-accent text-xs transition-colors"
              >
                <span className="font-medium">{f.height}p</span>
                <span className="text-muted-foreground ml-1">{f.ext}</span>
                {(f.filesize || f.filesize_approx) && (
                  <span className="text-muted-foreground ml-1">
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
                className="px-2.5 py-1.5 rounded-lg border bg-background/50 hover:bg-accent text-xs transition-colors"
              >
                <span className="font-medium">Audio</span>
                <span className="text-muted-foreground ml-1">{f.ext}</span>
                {f.tbr && (
                  <span className="text-muted-foreground ml-1">({Math.round(f.tbr)}kbps)</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
