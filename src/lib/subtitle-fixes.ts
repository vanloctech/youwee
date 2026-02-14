// ============================================
// Subtitle Auto-Fix Functions
// ============================================

import type { SubtitleEntry } from './subtitle-parser';
import { reindexEntries } from './subtitle-parser';

// ---- Error Types ----

export type SubtitleErrorType =
  | 'empty'
  | 'overlap'
  | 'hearing_impaired'
  | 'long_line'
  | 'duplicate'
  | 'formatting_tags'
  | 'short_duration'
  | 'long_duration'
  | 'gap';

export interface SubtitleError {
  type: SubtitleErrorType;
  entryId: string;
  index: number;
  description: string;
}

export interface SubtitleFixOptions {
  maxCharsPerLine?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  minGapMs?: number;
}

const DEFAULT_FIX_OPTIONS: Required<SubtitleFixOptions> = {
  maxCharsPerLine: 42,
  minDurationMs: 500,
  maxDurationMs: 10000,
  minGapMs: 80,
};

// ---- Detection Functions ----

/**
 * Find empty subtitle entries
 */
export function findEmptyEntries(entries: SubtitleEntry[]): SubtitleError[] {
  return entries
    .filter((e) => !e.text.trim())
    .map((e) => ({
      type: 'empty' as const,
      entryId: e.id,
      index: e.index,
      description: `Entry #${e.index} has empty text`,
    }));
}

/**
 * Find overlapping timestamps
 */
export function findOverlappingTimestamps(entries: SubtitleEntry[]): SubtitleError[] {
  const errors: SubtitleError[] = [];
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endTime > sorted[i + 1].startTime) {
      errors.push({
        type: 'overlap',
        entryId: sorted[i].id,
        index: sorted[i].index,
        description: `Entry #${sorted[i].index} overlaps with #${sorted[i + 1].index} by ${sorted[i].endTime - sorted[i + 1].startTime}ms`,
      });
    }
  }

  return errors;
}

/**
 * Find hearing impaired text (e.g., [Music], (applause), ♪)
 */
export function findHearingImpairedText(entries: SubtitleEntry[]): SubtitleError[] {
  const hiPatterns = [
    /^\[.*\]$/m, // [Music], [Applause]
    /^\(.*\)$/m, // (music), (laughing)
    /^♪.*♪$/m, // ♪ music ♪
    /^\[.*\]\s*$/m, // [Music]  (with trailing whitespace)
    /^- \[.*\]$/m, // - [Speaker]
  ];

  return entries
    .filter((e) => hiPatterns.some((p) => p.test(e.text.trim())))
    .map((e) => ({
      type: 'hearing_impaired' as const,
      entryId: e.id,
      index: e.index,
      description: `Entry #${e.index} contains hearing impaired text`,
    }));
}

/**
 * Find lines that are too long
 */
export function findLongLines(entries: SubtitleEntry[], maxCharsPerLine = 42): SubtitleError[] {
  return entries
    .filter((e) => e.text.split('\n').some((line) => line.length > maxCharsPerLine))
    .map((e) => ({
      type: 'long_line' as const,
      entryId: e.id,
      index: e.index,
      description: `Entry #${e.index} has lines exceeding ${maxCharsPerLine} characters`,
    }));
}

/**
 * Find duplicate entries (same text and similar timing)
 */
export function findDuplicates(entries: SubtitleEntry[]): SubtitleError[] {
  const errors: SubtitleError[] = [];
  const seen = new Map<string, SubtitleEntry>();

  for (const entry of entries) {
    const normalizedText = entry.text.trim().toLowerCase();
    const existing = seen.get(normalizedText);

    if (existing && Math.abs(existing.startTime - entry.startTime) < 500) {
      errors.push({
        type: 'duplicate',
        entryId: entry.id,
        index: entry.index,
        description: `Entry #${entry.index} is a duplicate of #${existing.index}`,
      });
    } else {
      seen.set(normalizedText, entry);
    }
  }

  return errors;
}

/**
 * Find entries with HTML/formatting tags
 */
export function findFormattingTags(entries: SubtitleEntry[]): SubtitleError[] {
  const tagPattern = /<\/?[a-z][^>]*>/i;

  return entries
    .filter((e) => tagPattern.test(e.text))
    .map((e) => ({
      type: 'formatting_tags' as const,
      entryId: e.id,
      index: e.index,
      description: `Entry #${e.index} contains formatting tags`,
    }));
}

/**
 * Find entries with very short duration
 */
export function findShortDuration(entries: SubtitleEntry[], minDurationMs = 500): SubtitleError[] {
  return entries
    .filter((e) => e.endTime - e.startTime < minDurationMs)
    .map((e) => ({
      type: 'short_duration' as const,
      entryId: e.id,
      index: e.index,
      description: `Entry #${e.index} duration is only ${e.endTime - e.startTime}ms (min: ${minDurationMs}ms)`,
    }));
}

/**
 * Find entries with very long duration
 */
export function findLongDuration(entries: SubtitleEntry[], maxDurationMs = 10000): SubtitleError[] {
  return entries
    .filter((e) => e.endTime - e.startTime > maxDurationMs)
    .map((e) => ({
      type: 'long_duration' as const,
      entryId: e.id,
      index: e.index,
      description: `Entry #${e.index} duration is ${e.endTime - e.startTime}ms (max: ${maxDurationMs}ms)`,
    }));
}

/**
 * Find entries where gap to next subtitle is too short
 */
export function findShortGaps(entries: SubtitleEntry[], minGapMs = 80): SubtitleError[] {
  const errors: SubtitleError[] = [];
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].startTime - sorted[i].endTime;
    if (gap >= 0 && gap < minGapMs) {
      errors.push({
        type: 'gap',
        entryId: sorted[i].id,
        index: sorted[i].index,
        description: `Entry #${sorted[i].index} has short gap (${gap}ms) to #${sorted[i + 1].index}`,
      });
    }
  }

  return errors;
}

// ---- Fix Functions ----

/**
 * Remove empty entries
 */
export function fixEmptyEntries(entries: SubtitleEntry[]): SubtitleEntry[] {
  return reindexEntries(entries.filter((e) => e.text.trim()));
}

/**
 * Fix overlapping timestamps by adjusting end times
 */
export function fixOverlappingTimestamps(entries: SubtitleEntry[]): SubtitleEntry[] {
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].endTime > sorted[i + 1].startTime) {
      // Set end time to start time of next entry minus a small gap
      sorted[i] = {
        ...sorted[i],
        endTime: sorted[i + 1].startTime - 1,
      };
    }
  }

  return reindexEntries(sorted);
}

/**
 * Remove hearing impaired text entries
 */
export function fixHearingImpaired(entries: SubtitleEntry[]): SubtitleEntry[] {
  const hiPatterns = [/^\[.*\]$/m, /^\(.*\)$/m, /^♪.*♪$/m, /^\[.*\]\s*$/m, /^- \[.*\]$/m];

  // First try to remove HI text while keeping other text
  const cleaned = entries.map((e) => {
    let text = e.text;
    // Remove inline HI markers
    text = text.replace(/\[.*?\]/g, '').trim();
    text = text.replace(/\(.*?\)/g, '').trim();
    return { ...e, text };
  });

  // Remove entries that are now empty or only HI
  return reindexEntries(
    cleaned.filter((e) => {
      const trimmed = e.text.trim();
      if (!trimmed) return false;
      return !hiPatterns.some((p) => p.test(trimmed));
    }),
  );
}

/**
 * Fix line breaking: split long lines at word boundaries
 */
export function fixLineBreaking(entries: SubtitleEntry[], maxCharsPerLine = 42): SubtitleEntry[] {
  return entries.map((entry) => {
    const lines = entry.text.split('\n');
    const newLines: string[] = [];

    for (const line of lines) {
      if (line.length <= maxCharsPerLine) {
        newLines.push(line);
        continue;
      }

      // Split at word boundary near the middle
      const words = line.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length > maxCharsPerLine && currentLine) {
          newLines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) newLines.push(currentLine);
    }

    return { ...entry, text: newLines.join('\n') };
  });
}

/**
 * Remove duplicate entries
 */
export function fixDuplicates(entries: SubtitleEntry[]): SubtitleEntry[] {
  const seen = new Map<string, SubtitleEntry>();
  const result: SubtitleEntry[] = [];

  for (const entry of entries) {
    const normalizedText = entry.text.trim().toLowerCase();
    const existing = seen.get(normalizedText);

    if (!existing || Math.abs(existing.startTime - entry.startTime) >= 500) {
      result.push(entry);
      seen.set(normalizedText, entry);
    }
  }

  return reindexEntries(result);
}

/**
 * Remove formatting tags (HTML, SSA)
 */
export function fixFormattingTags(entries: SubtitleEntry[]): SubtitleEntry[] {
  return entries.map((entry) => ({
    ...entry,
    text: entry.text
      .replace(/<\/?[a-z][^>]*>/gi, '') // HTML tags
      .replace(/\{\\[^}]*\}/g, '') // ASS/SSA override tags
      .trim(),
  }));
}

/**
 * Fix short duration entries by extending them
 */
export function fixShortDuration(entries: SubtitleEntry[], minDurationMs = 500): SubtitleEntry[] {
  return entries.map((entry) => {
    const duration = entry.endTime - entry.startTime;
    if (duration < minDurationMs) {
      return { ...entry, endTime: entry.startTime + minDurationMs };
    }
    return entry;
  });
}

/**
 * Fix long duration entries by shortening end time
 */
export function fixLongDuration(entries: SubtitleEntry[], maxDurationMs = 10000): SubtitleEntry[] {
  return entries.map((entry) => {
    const duration = entry.endTime - entry.startTime;
    if (duration > maxDurationMs) {
      return { ...entry, endTime: entry.startTime + maxDurationMs };
    }
    return entry;
  });
}

/**
 * Fix short gaps by preserving the next subtitle start and pulling previous end earlier.
 */
export function fixGaps(
  entries: SubtitleEntry[],
  minGapMs = 80,
  minDurationMs = 300,
): SubtitleEntry[] {
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    const gap = next.startTime - current.endTime;
    if (gap >= 0 && gap < minGapMs) {
      const desiredEnd = next.startTime - minGapMs;
      const minEnd = current.startTime + minDurationMs;
      sorted[i] = {
        ...current,
        endTime: Math.max(minEnd, desiredEnd),
      };
    }
  }

  return reindexEntries(sorted);
}

/**
 * Run all detections and return combined errors
 */
export function detectAllErrors(
  entries: SubtitleEntry[],
  options: SubtitleFixOptions = {},
): SubtitleError[] {
  const cfg = { ...DEFAULT_FIX_OPTIONS, ...options };
  return [
    ...findEmptyEntries(entries),
    ...findOverlappingTimestamps(entries),
    ...findHearingImpairedText(entries),
    ...findLongLines(entries, cfg.maxCharsPerLine),
    ...findDuplicates(entries),
    ...findFormattingTags(entries),
    ...findShortDuration(entries, cfg.minDurationMs),
    ...findLongDuration(entries, cfg.maxDurationMs),
    ...findShortGaps(entries, cfg.minGapMs),
  ];
}

/**
 * Apply all fixes
 */
export function fixAllErrors(
  entries: SubtitleEntry[],
  options: SubtitleFixOptions = {},
): SubtitleEntry[] {
  const cfg = { ...DEFAULT_FIX_OPTIONS, ...options };
  let result = [...entries];
  result = fixEmptyEntries(result);
  result = fixDuplicates(result);
  result = fixFormattingTags(result);
  result = fixHearingImpaired(result);
  result = fixOverlappingTimestamps(result);
  result = fixShortDuration(result, cfg.minDurationMs);
  result = fixLongDuration(result, cfg.maxDurationMs);
  result = fixGaps(result, cfg.minGapMs, cfg.minDurationMs);
  result = fixLineBreaking(result, cfg.maxCharsPerLine);
  return result;
}
