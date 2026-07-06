import { invoke } from '@tauri-apps/api/core';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Link,
  Minus,
  Plus,
  Save,
  Settings2,
  Sparkles,
  Square,
  Type,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { EmptyStateIllustration } from '@/components/shared/EmptyStateIllustration';
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
import { useSummarySession } from '@/contexts/summary-session-context';
import { localizeUnknownError } from '@/lib/backend-error';
import {
  DEFAULT_SUMMARY_FONT_SIZE,
  getNextSummaryFontSize,
  getSummaryFontSizeClass,
  normalizeSummaryFontSize,
  SUMMARY_FONT_SIZE_STORAGE_KEY,
  type SummaryFontSize,
} from '@/lib/summary-font-size';
import {
  DEFAULT_LONG_SUMMARY_WORDS,
  MAX_LONG_SUMMARY_WORDS,
  MIN_LONG_SUMMARY_WORDS,
  normalizeLongSummaryWords,
} from '@/lib/summary-session';
import { LANGUAGE_OPTIONS, type LongSummaryFormat, type SummaryStyle } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SummaryPageProps {
  onNavigateToSettings?: (section?: string) => void;
  externalUrl?: string;
  externalRequestId?: number;
  onExternalRequestConsumed?: () => void;
}

function isYouTubeUrl(url: string) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

function providerRequiresApiKey(provider: string) {
  return provider !== 'ollama' && provider !== 'lmstudio';
}

function loadSummaryFontSize(): SummaryFontSize {
  if (typeof window === 'undefined') return DEFAULT_SUMMARY_FONT_SIZE;
  return normalizeSummaryFontSize(window.localStorage.getItem(SUMMARY_FONT_SIZE_STORAGE_KEY));
}

function SummaryLoadingState({ loadingText }: { loadingText: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
      <EmptyStateIllustration className="mb-5" icon={Sparkles} isActive />
      <div className="w-full max-w-sm rounded-xl border border-primary/15 bg-primary/5 p-3 text-left shadow-sm">
        <div className="flex items-center gap-2 text-xs font-medium text-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          {loadingText}
        </div>
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
              <span
                className={cn(
                  'h-2 rounded-full bg-[linear-gradient(90deg,hsl(var(--muted)),hsl(var(--primary)/0.28),hsl(var(--muted)))] bg-[length:200%_100%] animate-shimmer',
                  index === 0 && 'w-11/12',
                  index === 1 && 'w-8/12',
                  index === 2 && 'w-10/12',
                )}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SummaryPage({
  onNavigateToSettings,
  externalUrl,
  externalRequestId,
  onExternalRequestConsumed,
}: SummaryPageProps) {
  const { t } = useTranslation('pages');
  const ai = useAI();
  const {
    state,
    setUrl,
    updateOptions,
    setShowSettings,
    setShowFullSummary,
    runSummary: runSummarySession,
    stopSummary,
    setError: setSessionError,
    markSaved,
  } = useSummarySession();
  const requiresApiKey = providerRequiresApiKey(ai.config.provider);
  const missingSummaryConfig = !ai.config.enabled || (requiresApiKey && !ai.config.api_key);
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState<SummaryFontSize>(loadSummaryFontSize);
  const lastExternalRequestIdRef = useRef<number | null>(null);
  const {
    url,
    options,
    isLoading,
    loadingStatus,
    loadingParams,
    error,
    result,
    saved,
    showFullSummary,
    showSettings,
  } = state;
  const summaryStyle = options.style;
  const summaryLanguage = options.language;
  const longSummaryFormat = options.longSummaryFormat;
  const longSummaryWords = options.longSummaryWords;
  const transcriptLanguages = options.transcriptLanguages;
  const summaryLanguageLabel =
    summaryLanguage === 'auto'
      ? t('summary.autoLanguage')
      : LANGUAGE_OPTIONS.find((l) => l.code === summaryLanguage)?.name || summaryLanguage;
  const longSummaryFormatLabel =
    longSummaryFormat === 'auto' ? null : t(`summary.longVideoFormatOptions.${longSummaryFormat}`);
  const longSummaryWordsLabel =
    longSummaryWords === DEFAULT_LONG_SUMMARY_WORDS
      ? null
      : t('summary.longVideoWordsSummary', { count: longSummaryWords });

  const getLoadingText = useCallback(
    (status: string) => {
      if (!status) return '';
      return t(`summary.loading.${status}`, loadingParams);
    },
    [loadingParams, t],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(SUMMARY_FONT_SIZE_STORAGE_KEY, fontSize);
    } catch (error) {
      console.error('Failed to save summary font size:', error);
    }
  }, [fontSize]);

  const setNextFontSize = useCallback((direction: -1 | 1) => {
    setFontSize((current) => getNextSummaryFontSize(current, direction));
  }, []);

  const runSummary = useCallback(
    async (inputUrl: string) => {
      const normalizedUrl = inputUrl.trim();

      if (!normalizedUrl) {
        setSessionError(t('summary.errors.enterUrl'));
        return;
      }

      if (!isYouTubeUrl(normalizedUrl)) {
        setSessionError(t('summary.errors.invalidUrl'));
        return;
      }

      if (!ai.config.enabled) {
        setSessionError(t('summary.errors.aiNotEnabled'));
        return;
      }

      if (requiresApiKey && !ai.config.api_key) {
        setSessionError(t('summary.errors.noApiKey'));
        return;
      }

      await runSummarySession(normalizedUrl);
    },
    [ai.config, requiresApiKey, runSummarySession, setSessionError, t],
  );

  const handleSummarize = useCallback(() => {
    void runSummary(url);
  }, [runSummary, url]);

  useEffect(() => {
    if (!externalUrl || !externalRequestId) return;
    if (lastExternalRequestIdRef.current === externalRequestId) return;

    lastExternalRequestIdRef.current = externalRequestId;
    setUrl(externalUrl);
    onExternalRequestConsumed?.();
    void runSummary(externalUrl);
  }, [externalRequestId, externalUrl, onExternalRequestConsumed, runSummary, setUrl]);

  const handleStop = useCallback(() => {
    stopSummary();
  }, [stopSummary]);

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
      setSessionError(t('summary.errors.noTitle'));
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
      markSaved();
    } catch (err) {
      const message = localizeUnknownError(err);
      console.error('Failed to save to library:', message);
      setSessionError(t('summary.errors.saveToLibrary', { message }));
    }
  }, [markSaved, result, setSessionError, t]);

  const handleAddLanguage = useCallback(
    (code: string) => {
      if (!transcriptLanguages.includes(code)) {
        updateOptions({
          transcriptLanguages: [...transcriptLanguages, code],
        });
      }
    },
    [transcriptLanguages, updateOptions],
  );

  const handleRemoveLanguage = useCallback(
    (code: string) => {
      if (transcriptLanguages.length > 1) {
        updateOptions({
          transcriptLanguages: transcriptLanguages.filter((l) => l !== code),
        });
      }
    },
    [transcriptLanguages, updateOptions],
  );

  const handleMoveLanguage = useCallback(
    (index: number, direction: 'up' | 'down') => {
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= transcriptLanguages.length) return;

      const newLangs = [...transcriptLanguages];
      [newLangs[index], newLangs[newIndex]] = [newLangs[newIndex], newLangs[index]];
      updateOptions({ transcriptLanguages: newLangs });
    },
    [transcriptLanguages, updateOptions],
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
        <h1 className="text-base sm:text-lg font-semibold">{t('summary.title')}</h1>
        <div className="flex items-center gap-2">
          {onNavigateToSettings && (
            <button
              type="button"
              onClick={() => onNavigateToSettings('ai')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                'transition-all duration-200',
              )}
              title={t('summary.configureAI')}
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('summary.aiSettings')}</span>
            </button>
          )}
          <ThemePicker />
        </div>
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
              placeholder={t('summary.placeholder')}
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
              <span>{t('summary.stop')}</span>
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
              <span>{t('summary.summarize')}</span>
            </button>
          )}
        </div>

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
            {t('summary.options')}
            {showSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {!showSettings && (
            <span className="text-xs text-muted-foreground">
              {summaryStyle.charAt(0).toUpperCase() + summaryStyle.slice(1)} •{' '}
              {summaryLanguageLabel}
              {longSummaryFormatLabel ? ` • ${longSummaryFormatLabel}` : ''}
              {longSummaryWordsLabel ? ` • ${longSummaryWordsLabel}` : ''}
            </span>
          )}
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Summary Style */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('summary.summaryStyle')}
                </span>
                <Select
                  value={summaryStyle}
                  onValueChange={(v) => updateOptions({ style: v as SummaryStyle })}
                >
                  <SelectTrigger className="h-9 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">{t('summary.short')}</SelectItem>
                    <SelectItem value="concise">{t('summary.concise')}</SelectItem>
                    <SelectItem value="detailed">{t('summary.detailed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Summary Language */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('summary.outputLanguage')}
                </span>
                <Select
                  value={summaryLanguage}
                  onValueChange={(language) => updateOptions({ language })}
                >
                  <SelectTrigger className="h-9 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{t('summary.autoSameAsVideo')}</SelectItem>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Long Video */}
              <div className="space-y-1.5 lg:col-span-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,10rem)]">
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('summary.longVideoFormat')}
                    </span>
                    <Select
                      value={longSummaryFormat}
                      onValueChange={(value) =>
                        updateOptions({ longSummaryFormat: value as LongSummaryFormat })
                      }
                    >
                      <SelectTrigger className="h-9 bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          {t('summary.longVideoFormatOptions.auto')}
                        </SelectItem>
                        <SelectItem value="final">
                          {t('summary.longVideoFormatOptions.final')}
                        </SelectItem>
                        <SelectItem value="parts">
                          {t('summary.longVideoFormatOptions.parts')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t('summary.longVideoWords')}
                    </span>
                    <Input
                      type="number"
                      min={MIN_LONG_SUMMARY_WORDS}
                      max={MAX_LONG_SUMMARY_WORDS}
                      step={500}
                      value={longSummaryWords}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (Number.isFinite(value)) {
                          updateOptions({ longSummaryWords: value });
                        }
                      }}
                      onBlur={() =>
                        updateOptions({
                          longSummaryWords: normalizeLongSummaryWords(longSummaryWords),
                        })
                      }
                      className="h-9 bg-background/50"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  {t('summary.longVideoWordsHint')}
                </p>
              </div>
            </div>

            {/* Transcript Languages */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('summary.transcriptLanguages')}
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
                            title={t('summary.moveUp')}
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {index < transcriptLanguages.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handleMoveLanguage(index, 'down')}
                            className="p-0.5 hover:text-primary rounded transition-colors"
                            title={t('summary.moveDown')}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {transcriptLanguages.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLanguage(code)}
                            className="p-0.5 hover:text-destructive rounded transition-colors ml-0.5"
                            title={t('summary.remove')}
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
                      <span className="text-xs">{t('summary.add')}</span>
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
                {t('summary.willTryEachLanguage')}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="flex-1 flex items-center justify-between gap-3">
              <p className="text-sm">{error}</p>
              {missingSummaryConfig && onNavigateToSettings && (
                <button
                  type="button"
                  onClick={() => onNavigateToSettings('ai')}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'transition-colors',
                  )}
                >
                  {t('summary.goToSettings')}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
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
                  referrerPolicy="no-referrer"
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
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">{t('summary.summary')}</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <div className="flex items-center gap-1 rounded-lg bg-background/50 p-1">
                    <button
                      type="button"
                      onClick={() => setNextFontSize(-1)}
                      disabled={fontSize === 'small'}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                      title={t('library.item.decreaseFontSize')}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFontSize(DEFAULT_SUMMARY_FONT_SIZE)}
                      className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      title={t('library.item.resetFontSize')}
                    >
                      <Type className="h-3.5 w-3.5" />
                      {t('library.item.fontSize')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNextFontSize(1)}
                      disabled={fontSize === 'large'}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                      title={t('library.item.increaseFontSize')}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-500" />
                        {t('summary.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        {t('summary.copy')}
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
                        {t('summary.saved')}
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        {t('summary.saveToLibrary')}
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div
                className={cn(
                  'flex-1 overflow-auto text-muted-foreground',
                  getSummaryFontSizeClass(fontSize),
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
                      {t('summary.showLess')} <ChevronUp className="w-3 h-3" />
                    </>
                  ) : (
                    <>
                      {t('summary.showMore')} <ChevronDown className="w-3 h-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <SummaryLoadingState
            loadingText={getLoadingText(loadingStatus) || t('summary.processing')}
          />
        )}

        {/* Empty State */}
        {!result && !error && !isLoading && (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <EmptyStateIllustration className="mb-5" icon={Sparkles} />
            <h3 className="text-lg font-medium mb-2">{t('summary.emptyTitle')}</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {t('summary.emptyDescription')}
            </p>

            {/* AI not configured banner */}
            {missingSummaryConfig && onNavigateToSettings && (
              <div className="mt-6 max-w-sm w-full">
                <div className={cn('relative overflow-hidden rounded-xl p-4', 'bg-primary/5')}>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      {!ai.config.enabled
                        ? t('summary.aiNotEnabledTitle')
                        : t('summary.apiKeyMissingTitle')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {!ai.config.enabled
                        ? t('summary.aiNotEnabledHint')
                        : t('summary.apiKeyMissingHint')}
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigateToSettings('ai')}
                      className={cn(
                        'mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                        'bg-primary/10 text-primary',
                        'hover:bg-primary/20 transition-colors',
                      )}
                    >
                      {t('summary.enableAI')}
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
