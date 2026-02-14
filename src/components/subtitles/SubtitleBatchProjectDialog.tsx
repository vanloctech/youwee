import { basename, dirname, join } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { FolderOpen, ListPlus, Loader2, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';
import {
  detectFormatFromFilename,
  generateEntryId,
  parseSubtitles,
  reindexEntries,
  type SubtitleEntry,
  serializeSubtitles,
  sortEntries,
} from '@/lib/subtitle-parser';
import type { SubtitleFormat } from '@/lib/types';
import { cn } from '@/lib/utils';

interface SubtitleBatchProjectDialogProps {
  open: boolean;
  onClose: () => void;
}

const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'];

function swapExtension(filename: string, ext: SubtitleFormat): string {
  return filename.replace(/\.[^.]+$/, `.${ext}`);
}

export function SubtitleBatchProjectDialog({ open, onClose }: SubtitleBatchProjectDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();

  const [files, setFiles] = useState<string[]>([]);
  const [targetFormat, setTargetFormat] = useState<SubtitleFormat>('srt');
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [appendGapMs, setAppendGapMs] = useState('500');
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filesLabel = useMemo(() => {
    if (files.length === 0) return t('batchProject.noFiles');
    if (files.length === 1) return files[0];
    return t('batchProject.filesSelected', { count: files.length });
  }, [files, t]);

  const pickFiles = async () => {
    const selected = await openDialog({
      multiple: true,
      filters: [
        {
          name: 'Subtitle Files',
          extensions: SUBTITLE_EXTENSIONS,
        },
      ],
    });
    if (!selected) return;
    const normalized = Array.isArray(selected) ? selected : [selected];
    setFiles(normalized);
    setError(null);
    setStatus(null);
  };

  const pickOutputDir = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected) return;
    setOutputDir(String(selected));
  };

  const runBatchConvert = async () => {
    if (files.length === 0) {
      setError(t('batchProject.pickFilesFirst'));
      return;
    }

    setIsRunning(true);
    setError(null);
    setStatus(null);
    try {
      let successCount = 0;
      for (const filePath of files) {
        const content = await readTextFile(filePath);
        const sourceFormat = detectFormatFromFilename(filePath);
        const parsed = parseSubtitles(content, sourceFormat);
        const serialized = serializeSubtitles(parsed.entries, targetFormat, parsed.assHeader);
        const base = await basename(filePath);
        const outputName = swapExtension(base, targetFormat);
        const outDir = outputDir || (await dirname(filePath));
        const outputPath = await join(outDir, outputName);
        await writeTextFile(outputPath, serialized);
        successCount += 1;
      }
      setStatus(t('batchProject.convertDone', { count: successCount }));
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRunning(false);
    }
  };

  const runAppendFiles = async () => {
    if (files.length === 0) {
      setError(t('batchProject.pickFilesFirst'));
      return;
    }
    const gap = Number(appendGapMs);
    if (!Number.isFinite(gap) || gap < 0) {
      setError(t('batchProject.invalidGap'));
      return;
    }

    setIsRunning(true);
    setError(null);
    setStatus(null);
    try {
      let timeline = [...subtitle.entries];
      let nextStart =
        timeline.length > 0 ? Math.max(...timeline.map((entry) => entry.endTime)) + gap : 0;

      for (const filePath of files) {
        const content = await readTextFile(filePath);
        const sourceFormat = detectFormatFromFilename(filePath);
        const parsed = parseSubtitles(content, sourceFormat);
        const sorted = sortEntries(parsed.entries);
        if (sorted.length === 0) continue;
        const firstStart = sorted[0].startTime;

        const shifted: SubtitleEntry[] = sorted.map((entry) => {
          const offset = entry.startTime - firstStart;
          const duration = Math.max(1, entry.endTime - entry.startTime);
          const start = Math.max(0, Math.round(nextStart + offset));
          return {
            id: generateEntryId(),
            index: entry.index,
            startTime: start,
            endTime: start + duration,
            text: entry.text,
          };
        });

        timeline = [...timeline, ...shifted];
        const lastEnd = shifted[shifted.length - 1].endTime;
        nextStart = lastEnd + gap;
      }

      const normalized = reindexEntries(sortEntries(timeline));
      subtitle.replaceAllEntries(normalized, 'Append subtitle files');
      setStatus(
        t('batchProject.appendDone', {
          count: files.length,
          total: normalized.length,
        }),
      );
    } catch (err) {
      setError(String(err));
    } finally {
      setIsRunning(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[660px] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('batchProject.title')}</h2>
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
          <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-background/70">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t('batchProject.sourceFiles')}</p>
              <button
                type="button"
                onClick={pickFiles}
                className="h-8 px-2.5 text-xs rounded-md border border-dashed border-border/70 hover:bg-accent transition-colors inline-flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                {t('batchProject.pickFiles')}
              </button>
            </div>
            <p className="text-xs text-muted-foreground truncate" title={filesLabel}>
              {filesLabel}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-background/70">
              <p className="text-sm font-medium">{t('batchProject.batchConvert')}</p>
              <div className="flex items-center gap-2">
                <select
                  value={targetFormat}
                  onChange={(e) => setTargetFormat(e.target.value as SubtitleFormat)}
                  className="h-9 px-2 rounded-md text-xs bg-background border border-border/70 outline-none"
                >
                  <option value="srt">SRT</option>
                  <option value="vtt">VTT</option>
                  <option value="ass">ASS</option>
                </select>
                <button
                  type="button"
                  onClick={pickOutputDir}
                  className="h-9 px-2 rounded-md text-xs border border-dashed border-border/70 hover:bg-accent transition-colors"
                >
                  {outputDir ? t('batchProject.changeFolder') : t('batchProject.pickFolder')}
                </button>
              </div>
              {outputDir && (
                <p className="text-[11px] text-muted-foreground truncate" title={outputDir}>
                  {outputDir}
                </p>
              )}
              <button
                type="button"
                onClick={runBatchConvert}
                disabled={isRunning}
                className={cn(
                  'h-9 px-3 rounded-md text-sm border border-dashed border-border/70 transition-colors',
                  'hover:bg-accent disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                {t('batchProject.runConvert')}
              </button>
            </div>

            <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-background/70">
              <p className="text-sm font-medium">{t('batchProject.appendToProject')}</p>
              <div className="flex items-center gap-2">
                <label htmlFor="append-gap" className="text-xs text-muted-foreground">
                  {t('batchProject.gapMs')}
                </label>
                <input
                  id="append-gap"
                  type="number"
                  min={0}
                  value={appendGapMs}
                  onChange={(e) => setAppendGapMs(e.target.value)}
                  className="h-9 w-24 px-2 rounded-md text-xs bg-background border border-border/70 outline-none"
                />
              </div>
              <button
                type="button"
                onClick={runAppendFiles}
                disabled={isRunning}
                className={cn(
                  'h-9 px-3 rounded-md text-sm border border-dashed border-border/70 transition-colors inline-flex items-center gap-1.5',
                  'hover:bg-accent disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                <ListPlus className="w-3.5 h-3.5" />
                {t('batchProject.runAppend')}
              </button>
            </div>
          </div>

          {isRunning && (
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t('batchProject.running')}
            </div>
          )}

          {status && (
            <div className="text-xs px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              {status}
            </div>
          )}
          {error && (
            <div className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
