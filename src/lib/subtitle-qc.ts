import type { SubtitleEntry } from '@/lib/subtitle-parser';

export interface SubtitleQcThresholds {
  maxCps: number;
  maxWpm: number;
  maxCpl: number;
  minDurationMs: number;
  maxDurationMs: number;
  minGapMs: number;
}

export interface SubtitleEntryMetrics {
  charCount: number;
  wordCount: number;
  maxLineChars: number;
  durationMs: number;
  cps: number;
  wpm: number;
}

export interface SubtitleQcResult {
  metrics: SubtitleEntryMetrics;
  issues: string[];
  gapToNextMs: number | null;
}

export const DEFAULT_SUBTITLE_QC_THRESHOLDS: SubtitleQcThresholds = {
  maxCps: 21,
  maxWpm: 190,
  maxCpl: 42,
  minDurationMs: 700,
  maxDurationMs: 7000,
  minGapMs: 80,
};

function stripSubtitleTags(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]+\}/g, '')
    .replace(/\[[^\]]+\]/g, '');
}

function safeRound(num: number): number {
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : 0;
}

export function getSubtitleMetrics(entry: SubtitleEntry): SubtitleEntryMetrics {
  const cleanText = stripSubtitleTags(entry.text);
  const lines = cleanText.split('\n');
  const flatText = lines.join(' ');
  const compactText = flatText.replace(/\s+/g, ' ').trim();
  const charCount = compactText.replace(/\s/g, '').length;
  const words = compactText ? compactText.split(/\s+/) : [];
  const wordCount = words.length;
  const durationMs = Math.max(1, entry.endTime - entry.startTime);
  const durationSec = durationMs / 1000;
  const durationMin = durationSec / 60;
  const maxLineChars = lines.reduce((max, line) => {
    const count = line.trim().replace(/\s/g, '').length;
    return Math.max(max, count);
  }, 0);

  return {
    charCount,
    wordCount,
    maxLineChars,
    durationMs,
    cps: safeRound(charCount / durationSec),
    wpm: safeRound(wordCount / durationMin),
  };
}

export function evaluateSubtitleQc(
  entry: SubtitleEntry,
  nextEntry: SubtitleEntry | null,
  thresholds: SubtitleQcThresholds = DEFAULT_SUBTITLE_QC_THRESHOLDS,
): SubtitleQcResult {
  const metrics = getSubtitleMetrics(entry);
  const issues: string[] = [];

  if (metrics.cps > thresholds.maxCps) {
    issues.push('cps');
  }
  if (metrics.wpm > thresholds.maxWpm) {
    issues.push('wpm');
  }
  if (metrics.maxLineChars > thresholds.maxCpl) {
    issues.push('cpl');
  }
  if (metrics.durationMs < thresholds.minDurationMs) {
    issues.push('duration_short');
  }
  if (metrics.durationMs > thresholds.maxDurationMs) {
    issues.push('duration_long');
  }

  const gapToNextMs = nextEntry ? nextEntry.startTime - entry.endTime : null;
  if (gapToNextMs !== null) {
    if (gapToNextMs < 0) {
      issues.push('overlap');
    } else if (gapToNextMs < thresholds.minGapMs) {
      issues.push('gap_short');
    }
  }

  return {
    metrics,
    issues,
    gapToNextMs,
  };
}
