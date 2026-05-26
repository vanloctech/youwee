import { ClipboardPaste, FileText, Link, Link2, List, Loader2, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isValidUrl } from '@/lib/sources';
import { cn } from '@/lib/utils';

interface GalleryUrlInputProps {
  disabled?: boolean;
  onAddUrls: (text: string) => Promise<number>;
  onImportFile: () => Promise<number>;
  onImportClipboard: () => Promise<number>;
}

function countUrls(text: string): number {
  return text
    .trim()
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#') && isValidUrl(trimmed);
    }).length;
}

export function GalleryUrlInput({
  disabled,
  onAddUrls,
  onImportFile,
  onImportClipboard,
}: GalleryUrlInputProps) {
  const { t } = useTranslation('gallery');
  const [value, setValue] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const urlCount = countUrls(value);
  const hasMultipleLines = value.includes('\n');

  useEffect(() => {
    if (hasMultipleLines && !isExpanded) {
      setIsExpanded(true);
    }
  }, [hasMultipleLines, isExpanded]);

  const handleAdd = useCallback(async () => {
    setIsAdding(true);
    try {
      const count = await onAddUrls(value);
      if (count > 0) {
        setValue('');
        setIsExpanded(false);
      }
    } finally {
      setIsAdding(false);
    }
  }, [onAddUrls, value]);

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

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void handleAdd();
    } else if (event.key === 'Enter' && !isExpanded) {
      event.preventDefault();
      void handleAdd();
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValue(event.target.value);
  };

  const setMode = (expanded: boolean) => {
    setIsExpanded(expanded);
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
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragOver(false);
      }}
      onDrop={async (event) => {
        event.preventDefault();
        setIsDragOver(false);

        const text = event.dataTransfer.getData('text/plain');
        if (text) {
          setValue((prev) => (prev ? `${prev}\n${text}` : text));
          return;
        }

        const files = Array.from(event.dataTransfer.files);
        const txtFile = files.find((file) => file.name.endsWith('.txt'));
        if (txtFile) {
          const content = await txtFile.text();
          setValue((prev) => (prev ? `${prev}\n${content}` : content));
        }
      }}
      aria-label="URL drop zone"
    >
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
            <span className="hidden sm:inline">{t('urlInput.paste')}</span>
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
            <span className="hidden sm:inline">{t('urlInput.import')}</span>
          </Button>
        </div>
      </div>

      <div className="relative">
        {!isExpanded ? (
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
                  {urlCount !== 1
                    ? t('urlInput.urlCount_plural', { count: urlCount })
                    : t('urlInput.urlCount', { count: urlCount })}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={disabled || isAdding || urlCount === 0}
              className="h-11 rounded-md px-4 text-sm font-medium btn-gradient flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAdding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{t('urlInput.addToQueue')}</span>
            </button>
          </div>
        ) : (
          <div className="relative">
            <Textarea
              ref={textareaRef}
              placeholder={t('urlInput.placeholderMultiple')}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              className={cn(
                'min-h-[100px] resize-none text-sm',
                'bg-background/50 border-border/50',
                'focus:bg-background transition-colors',
                'placeholder:text-muted-foreground/50',
              )}
            />
            {urlCount > 0 && (
              <div className="absolute bottom-2 right-2">
                <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  {urlCount !== 1
                    ? t('urlInput.urlCount_plural', { count: urlCount })
                    : t('urlInput.urlCount', { count: urlCount })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {value.trim() && urlCount > 1 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-1.5">
          <div className="min-w-0 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-600 dark:text-blue-400">
              <List className="h-3 w-3" />
              {t('urlInput.detectedMultiple', { count: urlCount })}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {isExpanded && (
          <button
            type="button"
            className="h-9 px-4 rounded-md font-medium text-sm btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAdd}
            disabled={disabled || !value.trim() || isAdding}
            title={t('urlInput.addToQueue')}
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t('urlInput.addToQueue')} {urlCount > 0 ? `(${urlCount})` : ''}
          </button>
        )}
      </div>
    </section>
  );
}
