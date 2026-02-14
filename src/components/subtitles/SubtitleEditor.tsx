import { AlertTriangle, Columns2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';
import type { SubtitleEntry } from '@/lib/subtitle-parser';
import { formatTimeDisplay, parseTimeDisplay } from '@/lib/subtitle-parser';
import { DEFAULT_SUBTITLE_QC_THRESHOLDS, evaluateSubtitleQc } from '@/lib/subtitle-qc';
import { cn } from '@/lib/utils';

const ROW_HEIGHT = 36; // px per row
const OVERSCAN = 10; // extra rows rendered above/below viewport

const ISSUE_CODE: Record<string, string> = {
  cps: 'CPS',
  wpm: 'WPM',
  cpl: 'CPL',
  duration_short: 'D<',
  duration_long: 'D>',
  overlap: 'OVR',
  gap_short: 'GAP',
};

export function SubtitleEditor() {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [editingCell, setEditingCell] = useState<{
    id: string;
    field: 'startTime' | 'endTime' | 'text';
  } | null>(null);
  const lastSelectedId = useRef<string | null>(null);

  // Virtualization calculations
  const totalHeight = subtitle.entries.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    subtitle.entries.length,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN,
  );
  const visibleEntries = useMemo(
    () => subtitle.entries.slice(startIdx, endIdx),
    [subtitle.entries, startIdx, endIdx],
  );
  const offsetY = startIdx * ROW_HEIGHT;
  const hasTranslationSource = Boolean(subtitle.translationSourceMap);

  const qcSummary = useMemo(() => {
    const issueCounts: Record<string, number> = {};
    const results = new Map<string, ReturnType<typeof evaluateSubtitleQc>>();

    for (let i = 0; i < subtitle.entries.length; i++) {
      const entry = subtitle.entries[i];
      const next = i < subtitle.entries.length - 1 ? subtitle.entries[i + 1] : null;
      const result = evaluateSubtitleQc(entry, next, DEFAULT_SUBTITLE_QC_THRESHOLDS);
      results.set(entry.id, result);

      for (const issue of result.issues) {
        issueCounts[issue] = (issueCounts[issue] || 0) + 1;
      }
    }

    const issueEntries = Array.from(results.values()).filter((it) => it.issues.length > 0).length;
    return {
      results,
      issueCounts,
      issueEntries,
    };
  }, [subtitle.entries]);

  // Update container height on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Click handler for row selection
  const handleRowClick = useCallback(
    (entry: SubtitleEntry, e: React.MouseEvent) => {
      if (e.shiftKey && lastSelectedId.current) {
        subtitle.selectRange(lastSelectedId.current, entry.id);
      } else if (e.metaKey || e.ctrlKey) {
        subtitle.selectEntry(entry.id, true);
      } else {
        subtitle.selectEntry(entry.id);
      }
      lastSelectedId.current = entry.id;
    },
    [subtitle],
  );

  // Double-click to edit
  const handleCellDoubleClick = useCallback(
    (id: string, field: 'startTime' | 'endTime' | 'text') => {
      setEditingCell({ id, field });
    },
    [],
  );

  // Save edited cell
  const handleCellSave = useCallback(
    (id: string, field: 'startTime' | 'endTime' | 'text', value: string) => {
      if (field === 'text') {
        subtitle.updateEntry(id, { text: value });
      } else {
        const ms = parseTimeDisplay(value);
        subtitle.updateEntry(id, { [field]: ms });
      }
      setEditingCell(null);
    },
    [subtitle],
  );

  const handleCellCancel = useCallback(() => {
    setEditingCell(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't intercept when editing input/textarea
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const isMod = e.metaKey || e.ctrlKey;

      // Ctrl+Z — undo
      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        subtitle.undo();
        return;
      }

      // Ctrl+Shift+Z — redo
      if (isMod && e.shiftKey && e.key === 'z') {
        e.preventDefault();
        subtitle.redo();
        return;
      }

      // Ctrl+A — select all
      if (isMod && e.key === 'a') {
        e.preventDefault();
        subtitle.selectAll();
        return;
      }

      // Delete/Backspace — delete selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const ids = Array.from(subtitle.selectedIds);
        if (ids.length > 0) {
          e.preventDefault();
          subtitle.deleteEntries(ids);
        }
        return;
      }

      // Arrow Up/Down — navigate entries
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const currentIdx = subtitle.entries.findIndex((en) => en.id === subtitle.activeEntryId);
        let newIdx = currentIdx;
        if (e.key === 'ArrowDown') {
          newIdx = Math.min(subtitle.entries.length - 1, currentIdx + 1);
        } else {
          newIdx = Math.max(0, currentIdx - 1);
        }
        if (newIdx >= 0 && newIdx < subtitle.entries.length) {
          subtitle.selectEntry(subtitle.entries[newIdx].id);
          // Scroll into view
          const rowTop = newIdx * ROW_HEIGHT;
          const container = containerRef.current;
          if (container) {
            if (rowTop < container.scrollTop) {
              container.scrollTop = rowTop;
            } else if (rowTop + ROW_HEIGHT > container.scrollTop + containerHeight) {
              container.scrollTop = rowTop + ROW_HEIGHT - containerHeight;
            }
          }
        }
        return;
      }

      // Enter — start editing active entry text
      if (e.key === 'Enter' && subtitle.activeEntryId) {
        e.preventDefault();
        setEditingCell({ id: subtitle.activeEntryId, field: 'text' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [subtitle, containerHeight]);

  const issueLabel = useCallback(
    (issue: string) => {
      const key = `qc.issues.${issue}`;
      const translated = t(key);
      return translated === key ? issue : translated;
    },
    [t],
  );

  if (subtitle.entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-sm">{t('editor.noEntries')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50 bg-muted/20 text-[11px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">{t('qc.title')}</span>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              qcSummary.issueEntries > 0
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            )}
          >
            {qcSummary.issueEntries > 0
              ? t('qc.issueEntries', { count: qcSummary.issueEntries })
              : t('qc.passed')}
          </span>
          <span className="text-muted-foreground/80">
            {t('qc.thresholds', {
              cps: DEFAULT_SUBTITLE_QC_THRESHOLDS.maxCps,
              wpm: DEFAULT_SUBTITLE_QC_THRESHOLDS.maxWpm,
              cpl: DEFAULT_SUBTITLE_QC_THRESHOLDS.maxCpl,
            })}
          </span>
        </div>
        {hasTranslationSource && (
          <button
            type="button"
            onClick={() => subtitle.setTranslatorMode(!subtitle.isTranslatorMode)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] transition-colors',
              subtitle.isTranslatorMode
                ? 'border-primary/50 bg-primary/10 text-primary'
                : 'border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent',
            )}
          >
            <Columns2 className="w-3 h-3" />
            {t('translator.mode')}
          </button>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center px-2 py-1.5 border-b border-border/50 bg-muted/30 text-xs font-medium text-muted-foreground flex-shrink-0 select-none">
        <div className="w-[50px] px-2 text-center">{t('editor.index')}</div>
        <div className="w-[110px] px-2">{t('editor.startTime')}</div>
        <div className="w-[110px] px-2">{t('editor.endTime')}</div>
        <div className="w-[60px] px-2 text-center">{t('editor.duration')}</div>
        {subtitle.isTranslatorMode ? (
          <>
            <div className="flex-1 px-2 min-w-[220px]">{t('translator.sourceText')}</div>
            <div className="flex-1 px-2 min-w-[220px]">{t('translator.targetText')}</div>
          </>
        ) : (
          <div className="flex-1 px-2">{t('editor.text')}</div>
        )}
        <div className="w-[45px] px-1 text-center">{t('editor.cps')}</div>
        <div className="w-[45px] px-1 text-center">{t('qc.wpm')}</div>
        <div className="w-[45px] px-1 text-center">{t('qc.cpl')}</div>
        <div className="w-[70px] px-1 text-center">{t('qc.issuesLabel')}</div>
      </div>

      {/* Virtualized List */}
      <div ref={containerRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              top: offsetY,
              left: 0,
              right: 0,
            }}
          >
            {visibleEntries.map((entry) => {
              const isSelected = subtitle.selectedIds.has(entry.id);
              const isActive = subtitle.activeEntryId === entry.id;
              const durationMs = entry.endTime - entry.startTime;
              const qc = qcSummary.results.get(entry.id);
              const cps = qc?.metrics.cps ?? 0;
              const wpm = qc?.metrics.wpm ?? 0;
              const cpl = qc?.metrics.maxLineChars ?? 0;
              const issueCodes = (qc?.issues || []).map((issue) => ISSUE_CODE[issue] || issue);
              const hasIssues = issueCodes.length > 0;

              // Highlight entries at current video time
              const isAtCurrentTime =
                subtitle.videoCurrentTime >= entry.startTime &&
                subtitle.videoCurrentTime <= entry.endTime;

              return (
                // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard navigation handled at window level
                // biome-ignore lint/a11y/noStaticElementInteractions: virtualized list row
                <div
                  key={entry.id}
                  style={{ height: ROW_HEIGHT }}
                  className={cn(
                    'flex items-center px-2 border-b border-border/20 cursor-pointer',
                    'transition-colors duration-75',
                    isActive && 'bg-primary/10 border-l-2 border-l-primary',
                    isSelected && !isActive && 'bg-accent/50',
                    !isSelected && !isActive && 'hover:bg-accent/30',
                    isAtCurrentTime && !isActive && 'bg-amber-500/10',
                    hasIssues && !isSelected && !isActive && 'bg-amber-500/[0.06]',
                  )}
                  onClick={(e) => handleRowClick(entry, e)}
                  onDoubleClick={() => handleCellDoubleClick(entry.id, 'text')}
                >
                  {/* Index */}
                  <div className="w-[50px] px-2 text-center text-xs text-muted-foreground tabular-nums">
                    {entry.index}
                  </div>

                  {/* Start Time */}
                  <div className="w-[110px] px-2">
                    {editingCell?.id === entry.id && editingCell.field === 'startTime' ? (
                      <TimeInput
                        value={formatTimeDisplay(entry.startTime)}
                        onSave={(v) => handleCellSave(entry.id, 'startTime', v)}
                        onCancel={handleCellCancel}
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-xs tabular-nums cursor-text hover:text-primary bg-transparent border-none p-0 text-left"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleCellDoubleClick(entry.id, 'startTime');
                        }}
                      >
                        {formatTimeDisplay(entry.startTime)}
                      </button>
                    )}
                  </div>

                  {/* End Time */}
                  <div className="w-[110px] px-2">
                    {editingCell?.id === entry.id && editingCell.field === 'endTime' ? (
                      <TimeInput
                        value={formatTimeDisplay(entry.endTime)}
                        onSave={(v) => handleCellSave(entry.id, 'endTime', v)}
                        onCancel={handleCellCancel}
                      />
                    ) : (
                      <button
                        type="button"
                        className="text-xs tabular-nums cursor-text hover:text-primary bg-transparent border-none p-0 text-left"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleCellDoubleClick(entry.id, 'endTime');
                        }}
                      >
                        {formatTimeDisplay(entry.endTime)}
                      </button>
                    )}
                  </div>

                  {/* Duration */}
                  <div className="w-[60px] px-2 text-center text-xs text-muted-foreground tabular-nums">
                    {(durationMs / 1000).toFixed(1)}s
                  </div>

                  {/* Text columns */}
                  {subtitle.isTranslatorMode ? (
                    <>
                      <div className="flex-1 px-2 min-w-[220px]">
                        <span className="text-xs truncate block text-muted-foreground">
                          {subtitle.translationSourceMap?.[entry.id]?.replace(/\n/g, ' ↵ ') || '—'}
                        </span>
                      </div>
                      <div className="flex-1 px-2 min-w-[220px]">
                        {editingCell?.id === entry.id && editingCell.field === 'text' ? (
                          <TextInput
                            value={entry.text}
                            onSave={(v) => handleCellSave(entry.id, 'text', v)}
                            onCancel={handleCellCancel}
                          />
                        ) : (
                          <span className="text-xs truncate block font-medium">
                            {entry.text.replace(/\n/g, ' ↵ ')}
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 px-2 min-w-0">
                      {editingCell?.id === entry.id && editingCell.field === 'text' ? (
                        <TextInput
                          value={entry.text}
                          onSave={(v) => handleCellSave(entry.id, 'text', v)}
                          onCancel={handleCellCancel}
                        />
                      ) : (
                        <span className="text-xs truncate block">
                          {entry.text.replace(/\n/g, ' ↵ ')}
                        </span>
                      )}
                    </div>
                  )}

                  {/* CPS */}
                  <div
                    className={cn(
                      'w-[45px] px-1 text-center text-xs tabular-nums',
                      cps > DEFAULT_SUBTITLE_QC_THRESHOLDS.maxCps
                        ? 'text-red-500'
                        : cps > DEFAULT_SUBTITLE_QC_THRESHOLDS.maxCps - 2
                          ? 'text-amber-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {cps}
                  </div>

                  {/* WPM */}
                  <div
                    className={cn(
                      'w-[45px] px-1 text-center text-xs tabular-nums',
                      wpm > DEFAULT_SUBTITLE_QC_THRESHOLDS.maxWpm
                        ? 'text-red-500'
                        : wpm > DEFAULT_SUBTITLE_QC_THRESHOLDS.maxWpm - 20
                          ? 'text-amber-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {wpm}
                  </div>

                  {/* CPL */}
                  <div
                    className={cn(
                      'w-[45px] px-1 text-center text-xs tabular-nums',
                      cpl > DEFAULT_SUBTITLE_QC_THRESHOLDS.maxCpl
                        ? 'text-red-500'
                        : cpl > DEFAULT_SUBTITLE_QC_THRESHOLDS.maxCpl - 2
                          ? 'text-amber-500'
                          : 'text-muted-foreground',
                    )}
                  >
                    {cpl}
                  </div>

                  {/* Issues */}
                  <div className="w-[70px] px-1 text-center text-[10px]">
                    {hasIssues ? (
                      <span
                        title={qc?.issues.map(issueLabel).join(', ')}
                        className="inline-flex items-center justify-center gap-1 text-red-500 dark:text-red-400 font-medium"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        {issueCodes.slice(0, 2).join('/')}
                      </span>
                    ) : (
                      <span className="text-emerald-600/80 dark:text-emerald-400/80">OK</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {Object.keys(qcSummary.issueCounts).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-2 py-1.5 border-t border-border/50 bg-muted/20 text-[10px]">
          {Object.entries(qcSummary.issueCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([issue, count]) => (
              <span
                key={issue}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400"
              >
                <span className="font-semibold">{ISSUE_CODE[issue] || issue}</span>
                <span>×{count}</span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// ---- Inline Edit Components ----

function TimeInput({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(value);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSave(val);
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={() => onSave(val)}
      className="w-full text-xs bg-background border border-primary rounded px-1 py-0.5 tabular-nums outline-none"
    />
  );
}

function TextInput({
  value,
  onSave,
  onCancel,
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(value.replace(/\n/g, '\\N'));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Convert \N back to newlines
          onSave(val.replace(/\\N/g, '\n'));
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
      onBlur={() => onSave(val.replace(/\\N/g, '\n'))}
      className="w-full text-xs bg-background border border-primary rounded px-1 py-0.5 outline-none"
    />
  );
}
