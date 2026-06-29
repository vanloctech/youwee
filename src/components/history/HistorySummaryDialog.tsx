import { Check, Copy, ExternalLink, Loader2, Minus, Plus, RefreshCw, Type } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import type { HistoryEntry } from '@/lib/types';
import { cn, isSafeUrl } from '@/lib/utils';
import {
  DEFAULT_SUMMARY_FONT_SIZE,
  getNextSummaryFontSize,
  normalizeSummaryFontSize,
  SUMMARY_FONT_SIZE_CLASS,
  SUMMARY_FONT_SIZE_STORAGE_KEY,
  type SummaryFontSize,
} from './summaryDialogFontSize';

interface HistorySummaryDialogProps {
  entry: HistoryEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: string;
  copied: boolean;
  isGenerating: boolean;
  onCopy: () => void;
  onRegenerate: () => void;
}

function loadSummaryFontSize(): SummaryFontSize {
  if (typeof window === 'undefined') return DEFAULT_SUMMARY_FONT_SIZE;
  return normalizeSummaryFontSize(window.localStorage.getItem(SUMMARY_FONT_SIZE_STORAGE_KEY));
}

export function HistorySummaryDialog({
  entry,
  open,
  onOpenChange,
  summary,
  copied,
  isGenerating,
  onCopy,
  onRegenerate,
}: HistorySummaryDialogProps) {
  const { t } = useTranslation('pages');
  const [fontSize, setFontSize] = useState<SummaryFontSize>(loadSummaryFontSize);

  useEffect(() => {
    try {
      window.localStorage.setItem(SUMMARY_FONT_SIZE_STORAGE_KEY, fontSize);
    } catch (error) {
      console.error('Failed to save summary font size:', error);
    }
  }, [fontSize]);

  const setNextFontSize = (direction: -1 | 1) => {
    setFontSize((current) => getNextSummaryFontSize(current, direction));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-3xl gap-0 overflow-hidden border-white/[0.08] bg-background/95 p-0 backdrop-blur-xl dark:border-white/[0.05]">
        <DialogHeader className="border-b border-border/50 p-4 pr-12 sm:p-5 sm:pr-12">
          <div className="flex items-start gap-3">
            {entry.thumbnail && (
              <img
                src={entry.thumbnail.replace(/^http:\/\//, 'https://')}
                alt=""
                className="hidden h-14 w-24 rounded-lg object-cover sm:block"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="min-w-0 flex-1">
              <DialogTitle className="line-clamp-2 text-base leading-snug">
                {entry.title}
              </DialogTitle>
              <DialogDescription className="mt-1 truncate text-xs">{entry.url}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2 sm:px-5">
          <div className="flex items-center gap-1 rounded-lg bg-muted/40 p-1">
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? t('library.item.copied') : t('library.item.copySummary')}
            </button>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t('library.item.regenerateSummary')}
            </button>
            <a
              href={isSafeUrl(entry.url) ? entry.url : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('library.item.openUrl')}
            </a>
          </div>
        </div>

        <div className="max-h-[58vh] overflow-auto overscroll-contain px-4 py-4 sm:px-5">
          <div
            className={cn(
              'summary-dialog-content leading-7 text-muted-foreground',
              SUMMARY_FONT_SIZE_CLASS[fontSize],
            )}
          >
            <SimpleMarkdown content={summary} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
