import { Scissors, SplitSquareHorizontal, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { generateEntryId, type SubtitleEntry } from '@/lib/subtitle-parser';
import { cn } from '@/lib/utils';

interface SplitMergeDialogProps {
  open: boolean;
  onClose: () => void;
}

function splitByNaturalBreak(text: string): [string, string] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lineBreaks = [...trimmed.matchAll(/\n+/g)];
  if (lineBreaks.length > 0) {
    const middle = Math.floor(trimmed.length / 2);
    const nearest = lineBreaks.reduce((best, match) => {
      const index = match.index ?? 0;
      return Math.abs(index - middle) < Math.abs(best - middle) ? index : best;
    }, lineBreaks[0].index ?? 0);
    const first = trimmed.slice(0, nearest).trim();
    const second = trimmed.slice(nearest).replace(/^\n+/, '').trim();
    if (first && second) return [first, second];
  }

  const punctuationMatches = [...trimmed.matchAll(/[,.!?;:]\s+/g)];
  if (punctuationMatches.length > 0) {
    const middle = Math.floor(trimmed.length / 2);
    const nearest = punctuationMatches.reduce(
      (best, match) => {
        const index = (match.index ?? 0) + match[0].length;
        return Math.abs(index - middle) < Math.abs(best - middle) ? index : best;
      },
      (punctuationMatches[0].index ?? 0) + punctuationMatches[0][0].length,
    );
    const first = trimmed.slice(0, nearest).trim();
    const second = trimmed.slice(nearest).trim();
    if (first && second) return [first, second];
  }

  const spaces = [...trimmed.matchAll(/\s+/g)];
  if (spaces.length === 0) return null;
  const middle = Math.floor(trimmed.length / 2);
  const nearest = spaces.reduce((best, match) => {
    const index = match.index ?? 0;
    return Math.abs(index - middle) < Math.abs(best - middle) ? index : best;
  }, spaces[0].index ?? 0);
  const first = trimmed.slice(0, nearest).trim();
  const second = trimmed.slice(nearest).trim();
  if (!first || !second) return null;
  return [first, second];
}

function splitTextByMaxChars(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  if (normalized.length <= maxChars) return [normalized];

  const words = normalized.split(' ');
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxChars) {
      current = `${current} ${word}`;
      continue;
    }
    chunks.push(current);
    current = word;
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitEntry(entry: SubtitleEntry, parts: string[], minSegmentMs = 300): SubtitleEntry[] {
  if (parts.length <= 1) return [entry];
  const totalDuration = Math.max(entry.endTime - entry.startTime, parts.length * minSegmentMs);
  const totalChars = parts.reduce((sum, part) => sum + Math.max(1, part.length), 0);
  let cursor = entry.startTime;

  return parts.map((part, idx) => {
    const isLast = idx === parts.length - 1;
    const ratio = Math.max(1, part.length) / totalChars;
    const rawDuration = Math.max(minSegmentMs, Math.round(totalDuration * ratio));
    const endTime = isLast
      ? entry.endTime
      : Math.min(entry.endTime - minSegmentMs, cursor + rawDuration);
    const segment: SubtitleEntry = {
      id: idx === 0 ? entry.id : generateEntryId(),
      index: entry.index + idx,
      startTime: cursor,
      endTime: Math.max(cursor + minSegmentMs, endTime),
      text: part.trim(),
    };
    cursor = segment.endTime;
    return segment;
  });
}

export function SplitMergeDialog({ open, onClose }: SplitMergeDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const [maxChars, setMaxChars] = useState('42');
  const [mergeSeparator, setMergeSeparator] = useState<'newline' | 'space'>('newline');
  const [error, setError] = useState<string | null>(null);

  const selectedEntries = useMemo(
    () => subtitle.entries.filter((entry) => subtitle.selectedIds.has(entry.id)),
    [subtitle.entries, subtitle.selectedIds],
  );

  const runSmartSplitActive = () => {
    if (!subtitle.activeEntryId) return;
    const target = subtitle.entries.find((entry) => entry.id === subtitle.activeEntryId);
    if (!target) return;

    const parts = splitByNaturalBreak(target.text);
    if (!parts) {
      setError(t('splitMerge.cannotSplit'));
      return;
    }

    const nextEntries: SubtitleEntry[] = [];
    for (const entry of subtitle.entries) {
      if (entry.id === target.id) {
        nextEntries.push(...splitEntry(entry, parts));
      } else {
        nextEntries.push(entry);
      }
    }
    subtitle.replaceAllEntries(nextEntries, 'Smart split active');
    setError(null);
  };

  const runSplitLong = () => {
    const max = Number(maxChars);
    if (!Number.isFinite(max) || max < 10) {
      setError(t('splitMerge.invalidMaxChars'));
      return;
    }

    const targetIds =
      subtitle.selectedIds.size > 0
        ? new Set(Array.from(subtitle.selectedIds))
        : new Set(subtitle.entries.map((entry) => entry.id));

    const nextEntries: SubtitleEntry[] = [];
    let changed = false;

    for (const entry of subtitle.entries) {
      if (!targetIds.has(entry.id)) {
        nextEntries.push(entry);
        continue;
      }

      const parts = splitTextByMaxChars(entry.text, max);
      if (parts.length <= 1) {
        nextEntries.push(entry);
        continue;
      }

      nextEntries.push(...splitEntry(entry, parts));
      changed = true;
    }

    if (!changed) {
      setError(t('splitMerge.noLongLines'));
      return;
    }

    subtitle.replaceAllEntries(nextEntries, 'Split long entries');
    setError(null);
  };

  const runSmartMerge = () => {
    if (selectedEntries.length < 2) {
      setError(t('splitMerge.needMultipleSelection'));
      return;
    }

    const ordered = [...selectedEntries].sort((a, b) => a.startTime - b.startTime);
    const firstId = ordered[0].id;
    const selectedSet = new Set(ordered.map((entry) => entry.id));
    const separator = mergeSeparator === 'newline' ? '\n' : ' ';

    const merged: SubtitleEntry = {
      id: firstId,
      index: ordered[0].index,
      startTime: ordered[0].startTime,
      endTime: ordered[ordered.length - 1].endTime,
      text: ordered
        .map((entry) => entry.text.trim())
        .filter(Boolean)
        .join(separator),
    };

    const nextEntries: SubtitleEntry[] = [];
    for (const entry of subtitle.entries) {
      if (entry.id === firstId) {
        nextEntries.push(merged);
        continue;
      }
      if (!selectedSet.has(entry.id)) {
        nextEntries.push(entry);
      }
    }

    subtitle.replaceAllEntries(nextEntries, 'Smart merge selection');
    subtitle.selectEntry(firstId);
    setError(null);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[560px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <SplitSquareHorizontal className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('splitMerge.title')}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">{t('splitMerge.description')}</p>

          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={runSmartSplitActive}
              className="h-10 inline-flex items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 text-sm font-medium hover:bg-accent transition-colors"
            >
              <Scissors className="w-4 h-4" />
              {t('splitMerge.smartSplitActive')}
            </button>

            <div className="rounded-lg border border-border/60 p-3 space-y-2 bg-background/70">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{t('splitMerge.splitLong')}</span>
                <Input
                  type="number"
                  min={10}
                  max={100}
                  value={maxChars}
                  onChange={(e) => setMaxChars(e.target.value)}
                  className="w-24 h-8 text-xs"
                />
              </div>
              <button
                type="button"
                onClick={runSplitLong}
                className="h-9 px-3 rounded-md text-sm border border-dashed border-border/70 hover:bg-accent transition-colors"
              >
                {t('splitMerge.applySplitLong')}
              </button>
            </div>

            <div className="rounded-lg border border-border/60 p-3 space-y-2 bg-background/70">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{t('splitMerge.mergeSelected')}</span>
                <button
                  type="button"
                  onClick={() => setMergeSeparator('newline')}
                  className={cn(
                    'px-2 py-1 rounded text-xs border transition-colors',
                    mergeSeparator === 'newline'
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border/70 text-muted-foreground',
                  )}
                >
                  {t('splitMerge.separatorNewline')}
                </button>
                <button
                  type="button"
                  onClick={() => setMergeSeparator('space')}
                  className={cn(
                    'px-2 py-1 rounded text-xs border transition-colors',
                    mergeSeparator === 'space'
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border/70 text-muted-foreground',
                  )}
                >
                  {t('splitMerge.separatorSpace')}
                </button>
              </div>
              <button
                type="button"
                onClick={runSmartMerge}
                className="h-9 px-3 rounded-md text-sm border border-dashed border-border/70 hover:bg-accent transition-colors"
              >
                {t('splitMerge.applyMerge')}
              </button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {subtitle.selectedIds.size > 0
              ? t('splitMerge.scopeSelected', { count: subtitle.selectedIds.size })
              : t('splitMerge.scopeAll', { count: subtitle.entries.length })}
          </div>

          {error && (
            <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 rounded-lg">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
