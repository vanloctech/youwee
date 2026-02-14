import { invoke } from '@tauri-apps/api/core';
import { Loader2, Sparkles, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { cn } from '@/lib/utils';

interface GrammarFixDialogProps {
  open: boolean;
  onClose: () => void;
}

type StyleOption = 'original' | 'formal' | 'casual';
const GRAMMAR_CANCELLED_ERROR = '__GRAMMAR_CANCELLED__';

export function GrammarFixDialog({ open, onClose }: GrammarFixDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const activeRunIdRef = useRef(0);

  const [style, setStyle] = useState<StyleOption>('original');
  const [isFixing, setIsFixing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const cancelFix = useCallback(() => {
    activeRunIdRef.current += 1;
    setIsFixing(false);
    setProgress({ current: 0, total: 0 });
  }, []);

  const handleClose = useCallback(() => {
    cancelFix();
    onClose();
  }, [cancelFix, onClose]);

  const handleFix = useCallback(async () => {
    const entriesToFix =
      subtitle.selectedIds.size > 0
        ? subtitle.entries.filter((e) => subtitle.selectedIds.has(e.id))
        : subtitle.entries;

    if (entriesToFix.length === 0) return;

    setIsFixing(true);
    setError(null);
    setProgress({ current: 0, total: entriesToFix.length });
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const isCancelled = () => activeRunIdRef.current !== runId;

    try {
      const BATCH_SIZE = 20;
      const updates: Array<{ id: string; changes: { text: string } }> = [];

      const styleInstruction =
        style === 'formal'
          ? 'Use formal language.'
          : style === 'casual'
            ? 'Use casual, conversational language.'
            : 'Maintain the original style.';

      for (let i = 0; i < entriesToFix.length; i += BATCH_SIZE) {
        if (isCancelled()) {
          throw new Error(GRAMMAR_CANCELLED_ERROR);
        }
        const batch = entriesToFix.slice(i, i + BATCH_SIZE);
        const textsToFix = batch.map((e) => e.text).join('\n---SEPARATOR---\n');

        const prompt = `Fix the grammar, punctuation, and spelling in the following subtitle texts. ${styleInstruction} Each subtitle is separated by "---SEPARATOR---". Return ONLY the corrected texts, separated by "---SEPARATOR---". Keep the same number of texts. Preserve line breaks within each subtitle. Do NOT add explanations.\n\n${textsToFix}`;

        const response = await invoke<string>('generate_ai_response', {
          prompt,
        });
        if (isCancelled()) {
          throw new Error(GRAMMAR_CANCELLED_ERROR);
        }

        const fixedTexts = response.split('---SEPARATOR---').map((s) => s.trim());

        for (let j = 0; j < batch.length; j++) {
          const fixedText = fixedTexts[j] || batch[j].text;
          updates.push({
            id: batch[j].id,
            changes: { text: fixedText },
          });
        }

        setProgress({
          current: Math.min(i + BATCH_SIZE, entriesToFix.length),
          total: entriesToFix.length,
        });
      }

      if (isCancelled()) {
        throw new Error(GRAMMAR_CANCELLED_ERROR);
      }
      subtitle.updateEntries(updates);
      handleClose();
    } catch (err) {
      if (String(err).includes(GRAMMAR_CANCELLED_ERROR)) {
        return;
      }
      setError(String(err));
    } finally {
      if (activeRunIdRef.current === runId) {
        setIsFixing(false);
      }
    }
  }, [subtitle, style, handleClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[440px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold">{t('grammar.title')}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted-foreground">{t('grammar.description')}</p>

          {/* Style */}
          <div className="space-y-2">
            <span className="text-sm font-medium">{t('grammar.style')}</span>
            <div className="flex gap-2">
              {(['original', 'formal', 'casual'] as StyleOption[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setStyle(opt)}
                  className={cn(
                    'flex-1 px-3 py-2 text-sm rounded-lg border transition-colors',
                    style === opt
                      ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  {t(`grammar.${opt}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div className="text-sm text-muted-foreground">
            {subtitle.selectedIds.size > 0 ? t('grammar.fixSelected') : t('grammar.fixAll')}
            {' — '}
            {subtitle.selectedIds.size > 0
              ? t('editor.selected', { count: subtitle.selectedIds.size })
              : t('editor.total', { count: subtitle.entries.length })}
          </div>

          {/* Progress */}
          {isFixing && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                {t('grammar.progress', progress)}
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-purple-500 h-1.5 rounded-full transition-all"
                  style={{
                    width:
                      progress.total > 0 ? `${(progress.current / progress.total) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/50">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
          >
            {t('timing.cancel')}
          </button>
          <button
            type="button"
            onClick={handleFix}
            disabled={isFixing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-purple-600 text-white',
              'hover:bg-purple-700 transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            {isFixing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('grammar.fixing')}
              </>
            ) : subtitle.selectedIds.size > 0 ? (
              t('grammar.fixSelected')
            ) : (
              t('grammar.fixAll')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
