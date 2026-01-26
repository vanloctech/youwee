import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link,
  Loader2,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import { useAI } from '@/contexts/AIContext';
import { useDownload } from '@/contexts/DownloadContext';
import { LANGUAGE_OPTIONS, type SummaryStyle } from '@/lib/types';
import { cn } from '@/lib/utils';

interface VideoInfo {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: number;
}

interface SummaryResult {
  summary: string;
  videoInfo: VideoInfo;
}

function isYouTubeUrl(url: string) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

export function SummaryPage() {
  const ai = useAI();
  const { cookieSettings } = useDownload();

  // URL input
  const [url, setUrl] = useState('');

  // Local settings (initialized from global settings)
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>(ai.config.summary_style);
  const [summaryLanguage, setSummaryLanguage] = useState(ai.config.summary_language);
  const [transcriptLanguages, setTranscriptLanguages] = useState<string[]>(
    ai.config.transcript_languages || ['en'],
  );

  // State
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Cancellation ref
  const isCancelledRef = useRef(false);

  const handleSummarize = useCallback(async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    if (!isYouTubeUrl(url)) {
      setError('Please enter a valid YouTube URL');
      return;
    }

    if (!ai.config.enabled) {
      setError('AI is not enabled. Please enable AI in Settings first.');
      return;
    }

    if (!ai.config.api_key) {
      setError('API key is not configured. Please add your API key in Settings.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    isCancelledRef.current = false;

    try {
      // Step 1: Fetch video info
      setLoadingStatus('Fetching video info...');
      const videoInfoResponse = await invoke<{
        info: {
          title: string;
          thumbnail?: string;
          duration?: number;
        };
      }>('get_video_info', {
        url: url.trim(),
        cookieMode: cookieSettings.mode,
        cookieBrowser: cookieSettings.browser || null,
        cookieBrowserProfile: cookieSettings.browserProfile || null,
        cookieFilePath: cookieSettings.filePath || null,
      });

      if (isCancelledRef.current) return;

      console.log('Video info response:', videoInfoResponse);
      const videoInfo = videoInfoResponse.info;
      console.log('Video info:', videoInfo);

      if (!videoInfo || !videoInfo.title) {
        throw new Error('Failed to fetch video information');
      }

      // Step 2: Fetch transcript
      setLoadingStatus('Fetching transcript...');
      const transcript = await invoke<string>('get_video_transcript', {
        url: url.trim(),
        languages: transcriptLanguages,
        cookieMode: cookieSettings.mode,
        cookieBrowser: cookieSettings.browser || null,
        cookieBrowserProfile: cookieSettings.browserProfile || null,
        cookieFilePath: cookieSettings.filePath || null,
      });

      if (isCancelledRef.current) return;

      if (!transcript || transcript.trim() === '') {
        throw new Error('No transcript available for this video');
      }

      // Step 3: Generate summary with local settings
      setLoadingStatus('Generating summary...');
      const summaryResult = await invoke<{ summary: string }>('generate_summary_with_options', {
        transcript,
        style: summaryStyle,
        language: summaryLanguage,
        title: videoInfo.title,
      });

      if (isCancelledRef.current) return;

      setResult({
        summary: summaryResult.summary,
        videoInfo: {
          url: url.trim(),
          title: videoInfo.title,
          thumbnail: videoInfo.thumbnail,
          duration: videoInfo.duration,
        },
      });
    } catch (err) {
      if (isCancelledRef.current) return;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      if (!isCancelledRef.current) {
        setIsLoading(false);
        setLoadingStatus('');
      }
    }
  }, [url, ai.config, summaryStyle, summaryLanguage, transcriptLanguages, cookieSettings]);

  const handleStop = useCallback(() => {
    isCancelledRef.current = true;
    setIsLoading(false);
    setLoadingStatus('');
    setError(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (result?.summary) {
      navigator.clipboard.writeText(result.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  const handleSaveToLibrary = useCallback(async () => {
    if (!result) return;

    const { videoInfo, summary } = result;

    // Debug log
    console.log('Saving to library:', { videoInfo, summary: summary.substring(0, 50) });

    if (!videoInfo.title) {
      setError('Cannot save: video title is missing');
      return;
    }

    try {
      await invoke('add_summary_only_history', {
        url: videoInfo.url,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail || null,
        duration: videoInfo.duration ? Math.floor(videoInfo.duration) : null,
        source: 'youtube',
        summary: summary,
      });
      setSaved(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to save to library:', message);
      setError(`Failed to save to library: ${message}`);
    }
  }, [result]);

  const handleAddLanguage = useCallback(
    (code: string) => {
      if (!transcriptLanguages.includes(code)) {
        setTranscriptLanguages([...transcriptLanguages, code]);
      }
    },
    [transcriptLanguages],
  );

  const handleRemoveLanguage = useCallback(
    (code: string) => {
      if (transcriptLanguages.length > 1) {
        setTranscriptLanguages(transcriptLanguages.filter((l) => l !== code));
      }
    },
    [transcriptLanguages],
  );

  const handleMoveLanguage = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= transcriptLanguages.length) return;

      const newLangs = [...transcriptLanguages];
      [newLangs[index], newLangs[newIndex]] = [newLangs[newIndex], newLangs[index]];
      setTranscriptLanguages(newLangs);
    },
    [transcriptLanguages],
  );

  const availableLanguages = LANGUAGE_OPTIONS.filter((l) => !transcriptLanguages.includes(l.code));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSummarize();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-base sm:text-lg font-semibold">AI Summary</h1>
        </div>
        <ThemePicker />
      </header>

      {/* Subtle divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-auto p-4 sm:p-6 space-y-4">
        {/* URL Input Row */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Paste YouTube URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              className={cn(
                'pl-10 pr-4 h-11 text-sm',
                'bg-background/50 border-border/50',
                'focus:bg-background transition-colors',
                'placeholder:text-muted-foreground/50',
              )}
            />
          </div>
          {isLoading ? (
            <button
              type="button"
              className={cn(
                'h-11 px-5 rounded-md font-medium text-sm flex items-center gap-2',
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                'transition-colors',
              )}
              onClick={handleStop}
            >
              <Square className="w-4 h-4" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                'h-11 px-5 rounded-md font-medium text-sm flex items-center gap-2',
                'btn-gradient',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              onClick={handleSummarize}
              disabled={!url.trim()}
            >
              <Sparkles className="w-4 h-4" />
              <span>Summarize</span>
            </button>
          )}
        </div>

        {/* Loading Status */}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{loadingStatus || 'Processing...'}</span>
          </div>
        )}

        {/* Settings Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              showSettings
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Options
            {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {!showSettings && (
            <span className="text-xs text-muted-foreground">
              {summaryStyle.charAt(0).toUpperCase() + summaryStyle.slice(1)} •{' '}
              {summaryLanguage === 'auto'
                ? 'Auto language'
                : LANGUAGE_OPTIONS.find((l) => l.code === summaryLanguage)?.name || summaryLanguage}
            </span>
          )}
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Summary Style */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Summary Style</span>
                <Select
                  value={summaryStyle}
                  onValueChange={(v) => setSummaryStyle(v as SummaryStyle)}
                >
                  <SelectTrigger className="h-9 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short (2-3 sentences)</SelectItem>
                    <SelectItem value="concise">Concise (key points)</SelectItem>
                    <SelectItem value="detailed">Detailed (comprehensive)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Summary Language */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Output Language</span>
                <Select value={summaryLanguage} onValueChange={setSummaryLanguage}>
                  <SelectTrigger className="h-9 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (same as video)</SelectItem>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Transcript Languages */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                Transcript Languages (priority order)
              </span>
              <div className="flex flex-wrap gap-2">
                {transcriptLanguages.map((code, index) => {
                  const lang = LANGUAGE_OPTIONS.find((l) => l.code === code);
                  return (
                    <div
                      key={code}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background border border-border/50 text-sm"
                    >
                      <span className="text-xs text-muted-foreground font-mono">{index + 1}.</span>
                      <span>{lang?.name || code}</span>
                      <div className="flex items-center gap-0.5 ml-1 border-l border-border/50 pl-1.5">
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={() => handleMoveLanguage(index, 'up')}
                            className="p-0.5 hover:text-primary rounded transition-colors"
                            title="Move up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {index < transcriptLanguages.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveLanguage(index, 'down')}
                            className="p-0.5 hover:text-primary rounded transition-colors"
                            title="Move down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {transcriptLanguages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLanguage(code)}
                            className="p-0.5 hover:text-destructive rounded transition-colors ml-0.5"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {availableLanguages.length > 0 && (
                  <Select onValueChange={handleAddLanguage}>
                    <SelectTrigger className="w-auto h-8 px-2.5 gap-1 bg-background/50 border-dashed">
                      <Plus className="w-3.5 h-3.5" />
                      <span className="text-xs">Add</span>
                    </SelectTrigger>
                    <SelectContent>
                      {availableLanguages.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                Will try each language in order until a transcript is found
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="flex-1 flex flex-col space-y-3">
            {/* Video Info */}
            <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
              {result.videoInfo.thumbnail && (
                <img
                  src={result.videoInfo.thumbnail}
                  alt=""
                  className="w-28 h-16 object-cover rounded-lg flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm line-clamp-2">{result.videoInfo.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {result.videoInfo.url}
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="flex-1 flex flex-col p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Summary</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleSaveToLibrary}
                    disabled={saved}
                  >
                    {saved ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        Save to Library
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div
                className={cn(
                  'flex-1 text-sm text-muted-foreground overflow-auto',
                  !showFullSummary && 'max-h-32',
                )}
              >
                <SimpleMarkdown content={result.summary} />
              </div>

              {result.summary.length > 500 && (
                <button
                  type="button"
                  onClick={() => setShowFullSummary(!showFullSummary)}
                  className="text-xs text-primary hover:text-primary/80 mt-2 flex items-center gap-0.5"
                >
                  {showFullSummary ? (
                    <>
                      Show less <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      Show more <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!result && !error && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">AI Video Summary</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Enter a YouTube URL to generate an AI-powered summary of the video content. No
              download required.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
