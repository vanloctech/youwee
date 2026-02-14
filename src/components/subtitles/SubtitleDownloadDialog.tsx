import { invoke } from '@tauri-apps/api/core';
import { Globe, Loader2, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDownload } from '@/contexts/DownloadContext';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { cn } from '@/lib/utils';

interface SubtitleDownloadInfo {
  lang: string;
  name: string;
  is_auto: boolean;
}

interface SubtitleDownloadDialogProps {
  open: boolean;
  onClose: () => void;
}

export function SubtitleDownloadDialog({ open, onClose }: SubtitleDownloadDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const { cookieSettings, getProxyUrl } = useDownload();
  const [url, setUrl] = useState('');
  const [subtitles, setSubtitles] = useState<SubtitleDownloadInfo[]>([]);
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [selectedIsAuto, setSelectedIsAuto] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = useCallback(async () => {
    if (!url.trim()) return;
    setIsFetching(true);
    setError(null);
    setSubtitles([]);
    setSelectedLang(null);

    try {
      const proxyUrl = getProxyUrl?.();
      const result = await invoke<SubtitleDownloadInfo[]>('get_available_subtitles', {
        url: url.trim(),
        cookieMode: cookieSettings?.mode || 'off',
        cookieBrowser: cookieSettings?.browser,
        cookieBrowserProfile: cookieSettings?.browserProfile,
        cookieFilePath: cookieSettings?.filePath,
        proxyUrl: proxyUrl || undefined,
      });
      setSubtitles(result);
      if (result.length === 0) {
        setError(t('download.noSubtitles'));
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsFetching(false);
    }
  }, [url, cookieSettings, getProxyUrl, t]);

  const handleDownload = useCallback(async () => {
    if (!selectedLang || !url.trim()) return;
    setIsDownloading(true);
    setError(null);

    try {
      // Use yt-dlp to download the subtitle file content
      const proxyUrl = getProxyUrl?.();
      const content = await invoke<string>('download_subtitle_content', {
        url: url.trim(),
        lang: selectedLang,
        isAuto: selectedIsAuto,
        format: 'srt',
        cookieMode: cookieSettings?.mode || 'off',
        cookieBrowser: cookieSettings?.browser,
        cookieBrowserProfile: cookieSettings?.browserProfile,
        cookieFilePath: cookieSettings?.filePath,
        proxyUrl: proxyUrl || undefined,
      });

      // Load into editor
      const fileName = `${selectedLang}${selectedIsAuto ? '.auto' : ''}.srt`;
      subtitle.loadFromContent(content, fileName, 'srt');
      onClose();
    } catch (err) {
      // If download_subtitle_content doesn't exist yet, show error
      setError(String(err));
    } finally {
      setIsDownloading(false);
    }
  }, [selectedLang, selectedIsAuto, url, cookieSettings, getProxyUrl, subtitle, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[520px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('download.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* URL Input */}
          <div className="space-y-2">
            <label htmlFor="sub-url" className="text-sm font-medium">
              {t('download.url')}
            </label>
            <div className="flex gap-2">
              <input
                id="sub-url"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleFetch();
                }}
                placeholder={t('download.urlPlaceholder')}
                className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={handleFetch}
                disabled={!url.trim() || isFetching}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : t('download.fetch')}
              </button>
            </div>
          </div>

          {/* Loading */}
          {isFetching && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('download.fetching')}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 rounded-lg">
              {error}
            </div>
          )}

          {/* Subtitle list */}
          {subtitles.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">{t('download.available')}</h3>
              <div className="space-y-1 max-h-[300px] overflow-auto">
                {subtitles.map((sub) => {
                  const isSelected = selectedLang === sub.lang && selectedIsAuto === sub.is_auto;
                  return (
                    <button
                      key={`${sub.lang}-${sub.is_auto}`}
                      type="button"
                      onClick={() => {
                        setSelectedLang(sub.lang);
                        setSelectedIsAuto(sub.is_auto);
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm',
                        'transition-colors',
                        isSelected
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-accent/50 border border-transparent',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{sub.name}</span>
                        <span className="text-xs text-muted-foreground">({sub.lang})</span>
                      </div>
                      {sub.is_auto && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {t('download.autoGenerated')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {subtitles.length > 0 && (
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
            >
              {t('timing.cancel')}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!selectedLang || isDownloading}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90 transition-colors',
                'disabled:opacity-50 disabled:pointer-events-none',
              )}
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t('download.loadInEditor')
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
