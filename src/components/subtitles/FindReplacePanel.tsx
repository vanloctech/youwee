import { Search, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';

interface FindReplacePanelProps {
  open: boolean;
  onClose: () => void;
}

export function FindReplacePanel({ open, onClose }: FindReplacePanelProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();

  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  // Find matches
  const matches = useMemo(() => {
    if (!findText) return [];

    return subtitle.entries.filter((entry) => {
      try {
        if (useRegex) {
          const flags = matchCase ? 'g' : 'gi';
          const regex = new RegExp(findText, flags);
          return regex.test(entry.text);
        }

        let text = entry.text;
        let search = findText;
        if (!matchCase) {
          text = text.toLowerCase();
          search = search.toLowerCase();
        }

        if (wholeWord) {
          const regex = new RegExp(
            `\\b${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            matchCase ? 'g' : 'gi',
          );
          return regex.test(entry.text);
        }

        return text.includes(search);
      } catch {
        return false;
      }
    });
  }, [findText, subtitle.entries, matchCase, wholeWord, useRegex]);

  const handleReplaceOne = useCallback(() => {
    if (matches.length === 0) return;
    const firstMatch = matches[0];

    let newText: string;
    try {
      if (useRegex) {
        const flags = matchCase ? 'g' : 'gi';
        const regex = new RegExp(findText, flags);
        // Replace only first occurrence
        let count = 0;
        newText = firstMatch.text.replace(regex, (match) => {
          count++;
          return count === 1 ? replaceText : match;
        });
      } else if (wholeWord) {
        const flags = matchCase ? '' : 'i';
        const regex = new RegExp(`\\b${findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, flags);
        newText = firstMatch.text.replace(regex, replaceText);
      } else {
        const idx = matchCase
          ? firstMatch.text.indexOf(findText)
          : firstMatch.text.toLowerCase().indexOf(findText.toLowerCase());
        if (idx < 0) return;
        newText =
          firstMatch.text.slice(0, idx) +
          replaceText +
          firstMatch.text.slice(idx + findText.length);
      }
    } catch {
      return;
    }

    subtitle.updateEntry(firstMatch.id, { text: newText });
  }, [matches, findText, replaceText, matchCase, wholeWord, useRegex, subtitle]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return;

    const updates = matches.map((entry) => {
      let newText: string;
      try {
        if (useRegex) {
          const flags = matchCase ? 'g' : 'gi';
          const regex = new RegExp(findText, flags);
          newText = entry.text.replace(regex, replaceText);
        } else if (wholeWord) {
          const flags = matchCase ? 'g' : 'gi';
          const regex = new RegExp(
            `\\b${findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            flags,
          );
          newText = entry.text.replace(regex, replaceText);
        } else {
          const flags = matchCase ? 'g' : 'gi';
          const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
          newText = entry.text.replace(regex, replaceText);
        }
      } catch {
        newText = entry.text;
      }

      return { id: entry.id, changes: { text: newText } };
    });

    subtitle.updateEntries(updates);
  }, [matches, findText, replaceText, matchCase, wholeWord, useRegex, subtitle]);

  if (!open) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-to-b from-background to-muted/20 px-3 py-2.5 flex-shrink-0">
      <div className="flex items-start gap-3">
        <div className="mt-1.5 rounded-lg bg-primary/10 p-1.5 text-primary flex-shrink-0">
          <Search className="w-3.5 h-3.5" />
        </div>

        <div className="flex-1 space-y-2">
          {/* Find row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder={t('findReplace.find')}
              className="flex-1 px-2.5 py-1.5 text-sm bg-background/80 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-xs text-muted-foreground tabular-nums min-w-[80px]">
              {findText ? t('findReplace.results', { count: matches.length }) : ''}
            </span>
          </div>

          {/* Replace row */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder={t('findReplace.replaceWith')}
              className="flex-1 px-2.5 py-1.5 text-sm bg-background/80 border border-border rounded-md outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="button"
              onClick={handleReplaceOne}
              disabled={matches.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border/70 hover:bg-accent disabled:opacity-40 transition-colors"
            >
              {t('findReplace.replaceOne')}
            </button>
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={matches.length === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-dashed border-border/70 hover:bg-accent disabled:opacity-40 transition-colors"
            >
              {t('findReplace.replaceAll')}
            </button>
          </div>

          {/* Options */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
                className="rounded"
              />
              {t('findReplace.matchCase')}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
                className="rounded"
              />
              {t('findReplace.wholeWord')}
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="rounded"
              />
              {t('findReplace.useRegex')}
            </label>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-accent transition-colors mt-1 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
