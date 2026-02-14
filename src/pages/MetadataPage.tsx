import {
  AlertCircle,
  Check,
  CheckCircle2,
  ClipboardPaste,
  FileJson,
  FileText,
  FolderOpen,
  Image,
  Link,
  Link2,
  List,
  Loader2,
  MessageSquare,
  Play,
  Plus,
  Square,
  Subtitles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useMetadata } from '@/contexts/MetadataContext';
import { cn } from '@/lib/utils';

export function MetadataPage() {
  const { t } = useTranslation('metadata');
  const { t: tDownload } = useTranslation('download');
  const [inputText, setInputText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    items,
    isFetching,
    settings,
    addUrls,
    removeItem,
    clearAll,
    clearCompleted,
    startFetch,
    stopFetch,
    selectOutputFolder,
    updateSettings,
  } = useMetadata();

  // Count URLs in input
  const urlCount = inputText
    .trim()
    .split('\n')
    .filter((l) => {
      const trimmed = l.trim();
      return trimmed && !trimmed.startsWith('#') && trimmed.includes('http');
    }).length;

  // Auto-expand when multiple lines detected
  const hasMultipleLines = inputText.includes('\n');
  useEffect(() => {
    if (hasMultipleLines && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasMultipleLines, isExpanded]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText((prev) => (prev ? `${prev}\n${text}` : text));
    } catch (e) {
      console.error('Failed to paste:', e);
    }
  };

  const handleAdd = () => {
    if (inputText.trim()) {
      addUrls(inputText);
      setInputText('');
      setIsExpanded(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Enter' && !isExpanded) {
      e.preventDefault();
      handleAdd();
    }
  };

  const setMode = (expanded: boolean) => {
    setIsExpanded(expanded);
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const completedCount = items.filter((i) => i.status === 'completed').length;
  const hasItems = items.length > 0;
  const outputFolderName = settings.outputPath
    ? settings.outputPath.split('/').pop() || settings.outputPath
    : t('selectFolder');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
        <h1 className="text-base sm:text-lg font-semibold">{t('title')}</h1>
        <ThemePicker />
      </header>

      {/* Subtle divider */}
      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Section: URL Input + Settings */}
        <div className="flex-shrink-0 p-4 sm:p-6 space-y-3">
          {/* Mode Toggle - Segmented Control */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setMode(false)}
                disabled={isFetching}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  !isExpanded
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{t('single')}</span>
              </button>
              <button
                type="button"
                onClick={() => setMode(true)}
                disabled={isFetching}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                  isExpanded
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <List className="w-3.5 h-3.5" />
                <span>{t('multiple')}</span>
              </button>
            </div>

            <span className="text-xs text-muted-foreground hidden sm:inline">
              {isExpanded ? t('multipleHint') : t('singleHint')}
            </span>
          </div>

          {/* URL Input */}
          {!isExpanded ? (
            // Compact single-line input
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t('inputPlaceholder')}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isFetching}
                  className={cn(
                    'pl-10 pr-20 h-11 text-sm',
                    'bg-background/50 border-border/50',
                    'focus:bg-background transition-colors',
                    'placeholder:text-muted-foreground/50',
                  )}
                />
                {urlCount > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {urlCount} URL{urlCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="h-11 px-4 rounded-md font-medium text-sm btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleAdd}
                disabled={!inputText.trim() || isFetching}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">{t('addToQueue')}</span>
              </button>
            </div>
          ) : (
            // Expanded textarea
            <div className="space-y-2">
              <div className="relative">
                <Textarea
                  placeholder={t('inputPlaceholderMultiple')}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isFetching}
                  className={cn(
                    'min-h-[100px] resize-none font-mono text-sm',
                    'bg-background/50 border-border/50',
                    'focus:bg-background transition-colors',
                    'placeholder:text-muted-foreground/50',
                  )}
                />
                {urlCount > 0 && (
                  <div className="absolute bottom-2 right-2">
                    <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                      {urlCount} URL{urlCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Action buttons for textarea mode */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 px-4 rounded-md font-medium text-sm btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleAdd}
                  disabled={!inputText.trim() || isFetching}
                >
                  <Plus className="w-4 h-4" />
                  {t('addToQueue')} {urlCount > 0 && `(${urlCount})`}
                </button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePaste}
                  disabled={isFetching}
                  className="h-8 gap-1.5 text-xs"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">{t('paste')}</span>
                </Button>

                <div className="hidden sm:flex items-center gap-1 ml-auto text-xs text-muted-foreground">
                  <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">⌘</kbd>
                  <span>+</span>
                  <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">↵</kbd>
                  <span className="ml-1">{t('toAdd')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Settings Bar - Always visible */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3 rounded-xl bg-muted/30 border border-border/50">
            {/* What to download label */}
            <span className="text-xs font-medium text-muted-foreground">
              {t('whatToDownload')}:
            </span>

            {/* Option toggles - compact inline */}
            <button
              type="button"
              onClick={() => updateSettings({ writeInfoJson: !settings.writeInfoJson })}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                settings.writeInfoJson
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                  : 'bg-background/50 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50',
              )}
            >
              <FileJson className="w-3.5 h-3.5" />
              {t('infoJson')}
            </button>

            <button
              type="button"
              onClick={() => updateSettings({ writeDescription: !settings.writeDescription })}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                settings.writeDescription
                  ? 'bg-green-500/15 text-green-600 dark:text-green-400 border border-green-500/30'
                  : 'bg-background/50 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50',
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              {t('description')}
            </button>

            <button
              type="button"
              onClick={() => updateSettings({ writeComments: !settings.writeComments })}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                settings.writeComments
                  ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30'
                  : 'bg-background/50 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50',
              )}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {t('comments')}
            </button>

            <button
              type="button"
              onClick={() => updateSettings({ writeThumbnail: !settings.writeThumbnail })}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                settings.writeThumbnail
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                  : 'bg-background/50 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50',
              )}
            >
              <Image className="w-3.5 h-3.5" />
              {t('thumbnail')}
            </button>

            {/* Subtitle toggle with popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                    settings.writeSubtitles
                      ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                      : 'bg-background/50 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50',
                  )}
                >
                  <Subtitles className="w-3.5 h-3.5" />
                  {t('subtitles')}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start" side="bottom" sideOffset={8}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Subtitles className="w-4 h-4 text-teal-500" />
                    <h4 className="text-sm font-medium">{t('subtitles')}</h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateSettings({ writeSubtitles: !settings.writeSubtitles })}
                    className={cn(
                      'h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors',
                      settings.writeSubtitles
                        ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
                        : 'bg-muted/50 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {settings.writeSubtitles ? t('subtitleEnabled') : t('subtitleDisabled')}
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  {/* Language Selection */}
                  <div className="space-y-2">
                    <span className="text-[11px] text-muted-foreground">
                      {t('subtitleLanguages')}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'en',
                        'vi',
                        'ja',
                        'ko',
                        'zh-Hans',
                        'zh-Hant',
                        'es',
                        'fr',
                        'de',
                        'pt',
                        'ru',
                      ].map((code) => {
                        const isSelected = settings.subtitleLangs.includes(code);
                        return (
                          <button
                            type="button"
                            key={code}
                            onClick={() => {
                              const newLangs = isSelected
                                ? settings.subtitleLangs.filter((l) => l !== code)
                                : [...settings.subtitleLangs, code];
                              updateSettings({ subtitleLangs: newLangs });
                            }}
                            className={cn(
                              'h-7 px-2 rounded text-[11px] font-medium transition-colors flex items-center gap-1',
                              isSelected
                                ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent',
                            )}
                            title={tDownload(`languages.${code}`)}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                            {code.toUpperCase()}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {settings.subtitleLangs.length === 0
                        ? t('subtitleSelectLang')
                        : t('subtitleSelectedLangs', {
                            langs: settings.subtitleLangs.join(', ').toUpperCase(),
                          })}
                    </p>
                  </div>

                  {/* Format Selection */}
                  <div className="space-y-2">
                    <span className="text-[11px] text-muted-foreground">{t('subtitleFormat')}</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['srt', 'vtt', 'ass'] as const).map((fmt) => (
                        <button
                          type="button"
                          key={fmt}
                          onClick={() => updateSettings({ subtitleFormat: fmt })}
                          className={cn(
                            'h-8 px-2 rounded-md text-xs font-medium transition-colors',
                            settings.subtitleFormat === fmt
                              ? 'bg-teal-500 text-white'
                              : 'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {fmt.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Info text */}
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {t('subtitleHint')}
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex-1" />

            {/* Output folder */}
            <button
              type="button"
              onClick={selectOutputFolder}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border border-transparent hover:border-border/50"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="truncate max-w-[120px]">{outputFolderName}</span>
            </button>
          </div>
        </div>

        {/* Subtle divider */}
        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        {/* Queue Section */}
        <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <FileJson className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-medium mb-2">{t('emptyQueue')}</h3>
              <p className="text-sm text-muted-foreground max-w-md">{t('emptyQueueHint')}</p>
            </div>
          ) : (
            <>
              {/* Queue header */}
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-muted-foreground">
                  {t('stats', {
                    total: items.length,
                    completed: completedCount,
                    pending: pendingCount,
                  })}
                </span>
                <div className="flex items-center gap-1">
                  {completedCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={clearCompleted}
                    >
                      {t('clearCompleted')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Queue list */}
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-4 pb-4">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl border bg-card/50 transition-colors',
                        item.status === 'completed' && 'border-green-500/30 bg-green-500/5',
                        item.status === 'error' && 'border-red-500/30 bg-red-500/5',
                        item.status === 'fetching' && 'border-primary/30 bg-primary/5',
                      )}
                    >
                      {/* Status icon */}
                      <div className="flex-shrink-0">
                        {item.status === 'pending' && (
                          <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />
                        )}
                        {item.status === 'fetching' && (
                          <Loader2 className="w-5 h-5 text-primary animate-spin" />
                        )}
                        {item.status === 'completed' && (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        )}
                        {item.status === 'error' && (
                          <AlertCircle className="w-5 h-5 text-red-500" />
                        )}
                      </div>

                      {/* Title */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.error && (
                          <p className="text-xs text-red-500 truncate">{item.error}</p>
                        )}
                      </div>

                      {/* Remove button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => removeItem(item.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </div>

      {/* Floating Action Bar */}
      {hasItems && (
        <footer className="flex-shrink-0">
          {/* Subtle top divider */}
          <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

          <div className="px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center gap-3">
              {!isFetching ? (
                <button
                  type="button"
                  className={cn(
                    'flex-1 h-11 px-6 rounded-xl font-medium text-sm sm:text-base',
                    'btn-gradient flex items-center justify-center gap-2',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'shadow-lg shadow-primary/20',
                    pendingCount > 0 && 'animate-pulse-subtle',
                  )}
                  onClick={startFetch}
                  disabled={pendingCount === 0}
                >
                  <Play className="w-5 h-5" />
                  <span>{t('fetchMetadata')}</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 px-2 py-0.5 rounded-full bg-white/20 text-xs">
                      {pendingCount}
                    </span>
                  )}
                </button>
              ) : (
                <Button
                  className="flex-1 h-11 text-sm sm:text-base rounded-xl"
                  variant="destructive"
                  onClick={stopFetch}
                >
                  <Square className="w-5 h-5 mr-2" />
                  {t('stop')}
                </Button>
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={clearAll}
                disabled={isFetching || items.length === 0}
                className="h-11 w-11 rounded-xl flex-shrink-0 bg-transparent border-border/50 hover:bg-white/10"
                title={t('clearAll')}
              >
                <Trash2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
