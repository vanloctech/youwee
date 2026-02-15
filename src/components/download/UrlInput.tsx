import {
  CircleHelp,
  ClipboardPaste,
  FileText,
  Link,
  Link2,
  List,
  Loader2,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { VideoPreview } from './VideoPreview';

interface UrlInputProps {
  disabled?: boolean;
  isExpandingPlaylist?: boolean;
  onAddUrls: (text: string) => Promise<number>;
  onImportFile: () => Promise<number>;
  onImportClipboard: () => Promise<number>;
  onGoToSettings?: () => void;
}

function extractFirstUrl(text: string): string | null {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
        return trimmed;
      }
    }
  }
  return null;
}

function isPlaylistOnlyUrl(url: string): boolean {
  if (url.includes('/playlist?list=')) {
    return true;
  }
  return false;
}

function countUrls(text: string): number {
  return text
    .trim()
    .split('\n')
    .filter((l) => {
      const trimmed = l.trim();
      return (
        trimmed &&
        !trimmed.startsWith('#') &&
        (trimmed.includes('youtube.com') || trimmed.includes('youtu.be'))
      );
    }).length;
}

export function UrlInput({
  disabled,
  isExpandingPlaylist,
  onAddUrls,
  onImportFile,
  onImportClipboard,
  onGoToSettings,
}: UrlInputProps) {
  const { t } = useTranslation('download');
  const [value, setValue] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showGuideDialog, setShowGuideDialog] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const urlCount = countUrls(value);
  const hasMultipleLines = value.includes('\n');

  // Auto-expand when multiple lines detected
  useEffect(() => {
    if (hasMultipleLines && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasMultipleLines, isExpanded]);

  // Auto-show preview when single URL is entered
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const lines = value
      .trim()
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'));

    if (lines.length === 1) {
      const url = extractFirstUrl(value);
      if (url && url !== previewUrl && !isPlaylistOnlyUrl(url)) {
        debounceRef.current = window.setTimeout(() => {
          setPreviewUrl(url);
          setShowPreview(true);
        }, 500);
      } else if (url && isPlaylistOnlyUrl(url)) {
        setShowPreview(false);
        setPreviewUrl(null);
      }
    } else {
      setShowPreview(false);
      setPreviewUrl(null);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, previewUrl]);

  const handleAdd = useCallback(async () => {
    setIsAdding(true);
    try {
      const count = await onAddUrls(value);
      if (count > 0) {
        setValue('');
        setShowPreview(false);
        setPreviewUrl(null);
        setIsExpanded(false);
      }
    } finally {
      setIsAdding(false);
    }
  }, [value, onAddUrls]);

  const handleImportFile = async () => {
    setIsImporting(true);
    try {
      await onImportFile();
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportClipboard = async () => {
    setIsImporting(true);
    try {
      const count = await onImportClipboard();
      if (count === 0) {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            setValue((prev) => (prev ? `${prev}\n${text}` : text));
          }
        } catch {
          // Clipboard access denied
        }
      }
    } finally {
      setIsImporting(false);
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // Handle text/URL drops
    const text = e.dataTransfer.getData('text/plain');
    if (text) {
      setValue((prev) => (prev ? `${prev}\n${text}` : text));
      return;
    }

    // Handle file drops
    const files = Array.from(e.dataTransfer.files);
    const txtFile = files.find((f) => f.name.endsWith('.txt'));
    if (txtFile) {
      const content = await txtFile.text();
      setValue((prev) => (prev ? `${prev}\n${content}` : content));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
  };

  const setMode = (expanded: boolean) => {
    setIsExpanded(expanded);
    // Focus appropriate input after toggle
    setTimeout(() => {
      if (expanded) {
        textareaRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 50);
  };

  return (
    <section
      className={cn(
        'space-y-3 transition-all duration-200',
        isDragOver && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label="URL drop zone"
    >
      {/* Mode Toggle - Segmented Control */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-lg bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => setMode(false)}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              !isExpanded
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={t('urlInput.singleHint')}
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>{t('urlInput.single')}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode(true)}
            disabled={disabled}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              isExpanded
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title={t('urlInput.multipleHint')}
          >
            <List className="w-3.5 h-3.5" />
            <span>{t('urlInput.multiple')}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGuideDialog(true)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-dashed border-border/70 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
            title={t('urlInput.guide')}
          >
            <CircleHelp className="w-3.5 h-3.5" />
            <span>{t('urlInput.guide')}</span>
          </button>
        </div>
      </div>

      {/* Main Input Area */}
      <div className="relative">
        {!isExpanded ? (
          // Compact single-line input
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1">
              <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                placeholder={t('urlInput.placeholder')}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={disabled}
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
              disabled={disabled || !value.trim() || isAdding || isExpandingPlaylist}
              title={t('urlInput.add')}
            >
              {isAdding || isExpandingPlaylist ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {isExpandingPlaylist ? t('urlInput.loading') : t('urlInput.add')}
              </span>
            </button>
          </div>
        ) : (
          // Expanded textarea
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder={t('urlInput.placeholderMultiple')}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
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
        )}
      </div>

      {/* Video Preview */}
      {showPreview && previewUrl && (
        <VideoPreview
          url={previewUrl}
          onClose={() => {
            setShowPreview(false);
            setPreviewUrl(null);
          }}
        />
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {isExpanded && (
          <button
            type="button"
            className="h-9 px-4 rounded-md font-medium text-sm btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAdd}
            disabled={disabled || !value.trim() || isAdding || isExpandingPlaylist}
            title={t('urlInput.addToQueue')}
          >
            {isAdding || isExpandingPlaylist ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            {isExpandingPlaylist
              ? t('urlInput.loadingPlaylist')
              : `${t('urlInput.addToQueue')} ${urlCount > 0 ? `(${urlCount})` : ''}`}
          </button>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleImportClipboard}
            disabled={disabled || isImporting}
            className="h-8 gap-1.5 text-xs"
            title={t('urlInput.paste')}
          >
            {isImporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ClipboardPaste className="w-3.5 h-3.5" />
            )}
            <span className="hidden xs:inline">{t('urlInput.paste')}</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleImportFile}
            disabled={disabled || isImporting}
            className="h-8 gap-1.5 text-xs"
            title={t('urlInput.import')}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{t('urlInput.import')}</span>
          </Button>
        </div>

        <div className="hidden sm:flex items-center gap-1 ml-auto text-xs text-muted-foreground">
          <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">⌘</kbd>
          <span>+</span>
          <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]">↵</kbd>
          <span className="ml-1">{t('urlInput.toAdd')}</span>
        </div>
      </div>

      <Dialog open={showGuideDialog} onOpenChange={setShowGuideDialog}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('urlInput.guideTitle')}</DialogTitle>
            <DialogDescription>{t('urlInput.guideDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2.5">
              <p className="text-sm font-medium">{t('urlInput.guideHighResTitle')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('urlInput.guideHighResText')}</p>
            </div>
            <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2.5">
              <p className="text-sm font-medium">{t('urlInput.guideFfmpegTitle')}</p>
              <p className="text-sm text-muted-foreground mt-1">{t('urlInput.guideFfmpegText')}</p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowGuideDialog(false)}>
              {t('urlInput.guideGotIt')}
            </Button>
            <Button
              onClick={() => {
                setShowGuideDialog(false);
                onGoToSettings?.();
              }}
            >
              {t('urlInput.guideOpenSettings')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drag Drop Hint */}
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm rounded-xl flex items-center justify-center z-10">
          <div className="text-center">
            <List className="w-8 h-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium">{t('urlInput.dropHint')}</p>
          </div>
        </div>
      )}
    </section>
  );
}
