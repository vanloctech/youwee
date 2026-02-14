import { invoke } from '@tauri-apps/api/core';
import { Languages, Loader2, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { LANGUAGE_OPTIONS } from '@/lib/types';
import { cn } from '@/lib/utils';

interface TranslateDialogProps {
  open: boolean;
  onClose: () => void;
}

const MAX_CHARS_PER_TRANSLATE_REQUEST = 10_000;
const MAX_ENTRIES_PER_TRANSLATE_REQUEST = 80;
const MAX_TRANSLATE_RETRIES = 3;
const TRANSLATE_REQUEST_SPACING_MS = 1500;
const TRANSLATE_CANCELLED_ERROR = '__TRANSLATE_CANCELLED__';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryTranslate(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return (
    message.includes('429') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('temporarily unavailable') ||
    message.includes('server busy')
  );
}

function extractJsonArray(raw: string): string[] | null {
  const trimmed = raw.trim();

  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const content = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const tryParse = (input: string): string[] | null => {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
        return parsed;
      }
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { translations?: unknown }).translations) &&
        (parsed as { translations: unknown[] }).translations.every(
          (item) => typeof item === 'string',
        )
      ) {
        return (parsed as { translations: string[] }).translations;
      }
    } catch {
      // Ignore parse error and fallback to substring parse.
    }
    return null;
  };

  const direct = tryParse(content);
  if (direct) return direct;

  const firstBracket = content.indexOf('[');
  const lastBracket = content.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    return tryParse(content.slice(firstBracket, lastBracket + 1));
  }

  return null;
}

function buildTaggedSubtitleInput(texts: string[]) {
  return texts.map((text, index) => `<SEG_${index + 1}>\n${text}\n</SEG_${index + 1}>`).join('\n');
}

function extractTaggedArray(raw: string, expectedCount: number): string[] | null {
  const output: string[] = [];

  for (let i = 1; i <= expectedCount; i++) {
    const pattern = new RegExp(`<SEG_${i}>\\s*([\\s\\S]*?)\\s*<\\/SEG_${i}>`, 'i');
    const match = raw.match(pattern);
    if (!match) {
      return null;
    }
    output.push(match[1].replace(/^\n+|\n+$/g, ''));
  }

  return output;
}

function extractSeparatorArray(raw: string): string[] | null {
  if (!raw.includes('---SEPARATOR---')) return null;
  const parts = raw
    .split('---SEPARATOR---')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : null;
}

function extractTranslations(raw: string, expectedCount: number): string[] | null {
  const tagged = extractTaggedArray(raw, expectedCount);
  if (tagged && tagged.length === expectedCount) return tagged;

  const json = extractJsonArray(raw);
  if (json && json.length === expectedCount) return json;

  const separator = extractSeparatorArray(raw);
  if (separator && separator.length === expectedCount) return separator;

  return null;
}

function cleanSingleTranslationResponse(raw: string): string {
  let text = raw.trim();

  const fenceMatch = text.match(/^```(?:[\w-]+)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

function chunkEntries<T extends { text: string }>(entries: T[]) {
  const chunks: T[][] = [];
  let currentChunk: T[] = [];
  let currentChars = 0;

  for (const entry of entries) {
    const entryChars = entry.text.length + 12;
    const willExceedChars = currentChars + entryChars > MAX_CHARS_PER_TRANSLATE_REQUEST;
    const willExceedItems = currentChunk.length >= MAX_ENTRIES_PER_TRANSLATE_REQUEST;

    if (currentChunk.length > 0 && (willExceedChars || willExceedItems)) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }

    currentChunk.push(entry);
    currentChars += entryChars;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export function TranslateDialog({ open, onClose }: TranslateDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const activeRunIdRef = useRef(0);

  const [targetLang, setTargetLang] = useState('vi');
  const [isTranslating, setIsTranslating] = useState(false);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const cancelTranslate = useCallback(() => {
    activeRunIdRef.current += 1;
    setIsTranslating(false);
    setProgress({ current: 0, total: 0 });
  }, []);

  const handleClose = useCallback(() => {
    cancelTranslate();
    onClose();
  }, [cancelTranslate, onClose]);

  const handleTranslate = useCallback(async () => {
    const entriesToTranslate =
      subtitle.selectedIds.size > 0
        ? subtitle.entries.filter((e) => subtitle.selectedIds.has(e.id))
        : subtitle.entries;

    if (entriesToTranslate.length === 0) return;

    setIsTranslating(true);
    setError(null);
    setProgress({ current: 0, total: entriesToTranslate.length });
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const isCancelled = () => activeRunIdRef.current !== runId;

    try {
      const updates: Array<{ id: string; changes: { text: string } }> = [];
      const chunks = chunkEntries(entriesToTranslate);
      const targetLangName =
        LANGUAGE_OPTIONS.find((l) => l.code === targetLang)?.name || targetLang;
      let lastRequestAt = 0;
      let translatedCount = 0;

      const pushChunkUpdates = (chunk: typeof entriesToTranslate, translatedTexts: string[]) => {
        for (let i = 0; i < chunk.length; i++) {
          updates.push({
            id: chunk[i].id,
            changes: { text: translatedTexts[i]?.trim() || chunk[i].text },
          });
        }

        translatedCount += chunk.length;
        setProgress({
          current: translatedCount,
          total: entriesToTranslate.length,
        });
      };

      const invokeTranslateWithRetry = async (prompt: string): Promise<string> => {
        if (isCancelled()) {
          throw new Error(TRANSLATE_CANCELLED_ERROR);
        }
        let response = '';
        let attempt = 0;
        while (attempt <= MAX_TRANSLATE_RETRIES) {
          try {
            const now = Date.now();
            const waitMs = TRANSLATE_REQUEST_SPACING_MS - (now - lastRequestAt);
            if (waitMs > 0) {
              await sleep(waitMs);
            }
            if (isCancelled()) {
              throw new Error(TRANSLATE_CANCELLED_ERROR);
            }
            lastRequestAt = Date.now();

            response = await invoke<string>('generate_ai_response', { prompt });
            if (isCancelled()) {
              throw new Error(TRANSLATE_CANCELLED_ERROR);
            }
            return response;
          } catch (err) {
            if (!shouldRetryTranslate(err) || attempt === MAX_TRANSLATE_RETRIES) {
              throw err;
            }
            const backoffMs = 800 * 2 ** attempt + Math.floor(Math.random() * 300);
            await sleep(backoffMs);
            attempt += 1;
          }
        }
        return response;
      };

      const processChunkWithFallback = async (chunk: typeof entriesToTranslate): Promise<void> => {
        if (isCancelled()) {
          throw new Error(TRANSLATE_CANCELLED_ERROR);
        }
        const inputTexts = chunk.map((e) => e.text);
        const taggedInput = buildTaggedSubtitleInput(inputTexts);
        const prompt = [
          `Translate the following subtitle texts to ${targetLangName}.`,
          'Return ONLY translated output with EXACTLY the same SEG tags.',
          'Rules:',
          '- Keep the same number of items and the same order.',
          '- Do not merge, split, or drop items.',
          '- Keep SEG tags unchanged.',
          '- Preserve line breaks naturally inside each subtitle.',
          '- Do not add explanations or markdown.',
          `Input:\n${taggedInput}`,
        ].join('\n');

        const response = await invokeTranslateWithRetry(prompt);
        const translatedTexts = extractTranslations(response, chunk.length);
        if (translatedTexts) {
          if (isCancelled()) {
            throw new Error(TRANSLATE_CANCELLED_ERROR);
          }
          pushChunkUpdates(chunk, translatedTexts);
          return;
        }

        // If model output format is invalid, split into smaller chunks recursively.
        if (chunk.length > 1) {
          const mid = Math.floor(chunk.length / 2);
          await processChunkWithFallback(chunk.slice(0, mid));
          await processChunkWithFallback(chunk.slice(mid));
          return;
        }

        // Last-resort path for a single subtitle line.
        const singlePrompt = [
          `Translate this subtitle text to ${targetLangName}.`,
          'Return ONLY the translated text. No markdown. No explanations.',
          `Text:\n${chunk[0].text}`,
        ].join('\n');
        const singleResponse = await invokeTranslateWithRetry(singlePrompt);
        const singleFromStructured = extractTranslations(singleResponse, 1)?.[0];
        const singleText = (
          singleFromStructured ?? cleanSingleTranslationResponse(singleResponse)
        ).trim();

        if (!singleText) {
          throw new Error('Invalid translation response format for a subtitle line');
        }

        if (isCancelled()) {
          throw new Error(TRANSLATE_CANCELLED_ERROR);
        }
        pushChunkUpdates(chunk, [singleText]);
      };

      for (const chunk of chunks) {
        await processChunkWithFallback(chunk);
      }

      if (isCancelled()) {
        throw new Error(TRANSLATE_CANCELLED_ERROR);
      }
      if (keepOriginal) {
        subtitle.captureTranslationSource(entriesToTranslate.map((entry) => entry.id));
      }
      subtitle.updateEntries(updates);
      handleClose();
    } catch (err) {
      if (String(err).includes(TRANSLATE_CANCELLED_ERROR)) {
        return;
      }
      setError(String(err));
    } finally {
      if (activeRunIdRef.current === runId) {
        setIsTranslating(false);
      }
    }
  }, [subtitle, targetLang, handleClose, keepOriginal]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[440px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Languages className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-semibold">{t('translate.title')}</h2>
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
          <p className="text-sm text-muted-foreground">{t('translate.description')}</p>

          {/* Target Language */}
          <div className="space-y-2">
            <label htmlFor="translate-target" className="text-sm font-medium">
              {t('translate.targetLang')}
            </label>
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger
                id="translate-target"
                className="h-10 rounded-lg border-border/60 bg-background/80 shadow-none focus:ring-2 focus:ring-primary/30"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border/60">
                {LANGUAGE_OPTIONS.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scope */}
          <div className="text-sm text-muted-foreground">
            {subtitle.selectedIds.size > 0
              ? t('translate.translateSelected')
              : t('translate.translateAll')}
            {' — '}
            {subtitle.selectedIds.size > 0
              ? t('editor.selected', { count: subtitle.selectedIds.size })
              : t('editor.total', { count: subtitle.entries.length })}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 bg-background/70">
            <div>
              <p className="text-sm font-medium">{t('translate.keepOriginal')}</p>
              <p className="text-xs text-muted-foreground">{t('translator.modeHint')}</p>
            </div>
            <Switch checked={keepOriginal} onCheckedChange={setKeepOriginal} />
          </div>

          {/* Progress */}
          {isTranslating && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                {t('translate.progress', progress)}
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
            onClick={handleTranslate}
            disabled={isTranslating}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
              'bg-purple-600 text-white',
              'hover:bg-purple-700 transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            {isTranslating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('translate.translating')}
              </>
            ) : subtitle.selectedIds.size > 0 ? (
              t('translate.translateSelected')
            ) : (
              t('translate.translateAll')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
