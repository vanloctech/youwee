import { AlertTriangle, Check, Wrench } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubtitle } from '@/contexts/SubtitleContext';
import {
  detectAllErrors,
  fixAllErrors,
  fixDuplicates,
  fixEmptyEntries,
  fixFormattingTags,
  fixGaps,
  fixHearingImpaired,
  fixLineBreaking,
  fixLongDuration,
  fixOverlappingTimestamps,
  fixShortDuration,
  type SubtitleError,
  type SubtitleErrorType,
} from '@/lib/subtitle-fixes';
import { cn } from '@/lib/utils';

interface FixErrorsDialogProps {
  open: boolean;
  onClose: () => void;
}

const ERROR_TYPE_LABELS: Record<SubtitleErrorType, string> = {
  empty: 'fixErrors.emptyLines',
  overlap: 'fixErrors.overlapping',
  hearing_impaired: 'fixErrors.hearingImpaired',
  long_line: 'fixErrors.lineBreaking',
  duplicate: 'fixErrors.duplicates',
  formatting_tags: 'fixErrors.formattingTags',
  short_duration: 'fixErrors.shortDuration',
  long_duration: 'fixErrors.longDuration',
  gap: 'fixErrors.gaps',
};

export function FixErrorsDialog({ open, onClose }: FixErrorsDialogProps) {
  const { t } = useTranslation('subtitles');
  const subtitle = useSubtitle();
  const [errors, setErrors] = useState<SubtitleError[]>([]);
  const [scanned, setScanned] = useState(false);
  const [fixedCount, setFixedCount] = useState(0);
  const fixOptions = useMemo(
    () => ({
      maxCharsPerLine: subtitle.qcThresholds.maxCpl,
      minDurationMs: subtitle.qcThresholds.minDurationMs,
      maxDurationMs: subtitle.qcThresholds.maxDurationMs,
      minGapMs: subtitle.qcThresholds.minGapMs,
    }),
    [subtitle.qcThresholds],
  );

  // Group errors by type
  const errorGroups = useMemo(() => {
    const groups = new Map<SubtitleErrorType, SubtitleError[]>();
    for (const error of errors) {
      const group = groups.get(error.type) || [];
      group.push(error);
      groups.set(error.type, group);
    }
    return groups;
  }, [errors]);

  const handleScan = useCallback(() => {
    const found = detectAllErrors(subtitle.entries, fixOptions);
    setErrors(found);
    setScanned(true);
    setFixedCount(0);
  }, [subtitle.entries, fixOptions]);

  const handleFixAll = useCallback(() => {
    const fixed = fixAllErrors(subtitle.entries, fixOptions);
    subtitle.replaceAllEntries(fixed, 'Fix all errors');
    // Re-scan to show remaining issues
    const remaining = detectAllErrors(fixed, fixOptions);
    setFixedCount(errors.length - remaining.length);
    setErrors(remaining);
  }, [subtitle, errors.length, fixOptions]);

  const handleFixType = useCallback(
    (type: SubtitleErrorType) => {
      let result = [...subtitle.entries];

      switch (type) {
        case 'empty':
          result = fixEmptyEntries(result);
          break;
        case 'overlap':
          result = fixOverlappingTimestamps(result);
          break;
        case 'hearing_impaired':
          result = fixHearingImpaired(result);
          break;
        case 'long_line':
          result = fixLineBreaking(result, fixOptions.maxCharsPerLine);
          break;
        case 'duplicate':
          result = fixDuplicates(result);
          break;
        case 'formatting_tags':
          result = fixFormattingTags(result);
          break;
        case 'short_duration':
          result = fixShortDuration(result, fixOptions.minDurationMs);
          break;
        case 'long_duration':
          result = fixLongDuration(result, fixOptions.maxDurationMs);
          break;
        case 'gap':
          result = fixGaps(result, fixOptions.minGapMs, fixOptions.minDurationMs);
          break;
        default:
          return;
      }

      subtitle.replaceAllEntries(result, `Fix ${type} errors`);
      // Re-scan
      const remaining = detectAllErrors(result, fixOptions);
      const typeErrors = errors.filter((e) => e.type === type).length;
      const remainingTypeErrors = remaining.filter((e) => e.type === type).length;
      setFixedCount((prev) => prev + (typeErrors - remainingTypeErrors));
      setErrors(remaining);
    },
    [subtitle, errors, fixOptions],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl border border-border/50 w-[500px] max-h-[70vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
          <Wrench className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t('fixErrors.title')}</h2>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {!scanned ? (
            <div className="text-center space-y-4 py-8">
              <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('fixErrors.title')}</p>
              <button
                type="button"
                onClick={handleScan}
                className={cn(
                  'px-6 py-2.5 rounded-xl text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                )}
              >
                {t('fixErrors.scan')}
              </button>
            </div>
          ) : errors.length === 0 ? (
            <div className="text-center space-y-3 py-8">
              <Check className="w-12 h-12 mx-auto text-green-500" />
              <p className="text-sm text-muted-foreground">{t('fixErrors.noErrors')}</p>
              {fixedCount > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  {t('fixErrors.fixed', { count: fixedCount })}
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex items-center justify-between">
                <p className="text-sm">{t('fixErrors.found', { count: errors.length })}</p>
                <button
                  type="button"
                  onClick={handleFixAll}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-xs font-medium',
                    'bg-primary text-primary-foreground',
                    'hover:bg-primary/90 transition-colors',
                  )}
                >
                  {t('fixErrors.fixAll')}
                </button>
              </div>

              {fixedCount > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  {t('fixErrors.fixed', { count: fixedCount })}
                </p>
              )}

              {/* Error groups */}
              <div className="space-y-2">
                {Array.from(errorGroups.entries()).map(([type, groupErrors]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border/50 bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-sm">
                        {t(ERROR_TYPE_LABELS[type] || type, {
                          maxChars: subtitle.qcThresholds.maxCpl,
                          minMs: subtitle.qcThresholds.minDurationMs,
                          maxMs: subtitle.qcThresholds.maxDurationMs,
                        })}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ({groupErrors.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleFixType(type)}
                      className="px-3 py-1 text-xs font-medium rounded-md hover:bg-accent transition-colors"
                    >
                      {t('fixErrors.fixSelected')}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-border/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
          >
            {t('timing.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
