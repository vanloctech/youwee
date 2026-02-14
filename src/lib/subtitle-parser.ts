// ============================================
// Subtitle Parser & Serializer
// Supports: SRT, VTT (WebVTT), ASS (Advanced SubStation Alpha)
// ============================================

import type { SubtitleFormat } from './types';

// ---- Types ----

export interface SubtitleEntry {
  id: string; // unique UUID
  index: number; // display index (1-based)
  startTime: number; // milliseconds
  endTime: number; // milliseconds
  text: string; // subtitle text (may contain formatting tags)
}

export interface SubtitleFile {
  format: SubtitleFormat;
  entries: SubtitleEntry[];
  /** Raw header for ASS files (Style section etc.) — preserved for round-trip */
  assHeader?: string;
}

// ---- Helpers ----

let _idCounter = 0;
export function generateEntryId(): string {
  _idCounter += 1;
  return `sub_${Date.now()}_${_idCounter}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Reset counter (useful for tests) */
export function resetIdCounter(): void {
  _idCounter = 0;
}

// ---- Time Utilities ----

/**
 * Parse SRT timestamp "HH:MM:SS,mmm" → milliseconds
 * Also accepts VTT format "HH:MM:SS.mmm" or "MM:SS.mmm"
 */
export function parseTimestamp(ts: string): number {
  const cleaned = ts.trim().replace(',', '.');

  // Handle MM:SS.mmm (no hours)
  const shortMatch = cleaned.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
  if (shortMatch) {
    const [, m, s, ms] = shortMatch;
    const msNorm = ms.padEnd(3, '0');
    return Number(m) * 60_000 + Number(s) * 1000 + Number(msNorm);
  }

  // Handle HH:MM:SS.mmm
  const fullMatch = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/);
  if (fullMatch) {
    const [, h, m, s, ms] = fullMatch;
    const msNorm = ms.padEnd(3, '0');
    return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(msNorm);
  }

  // Handle HH:MM:SS (no ms)
  const noMsMatch = cleaned.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (noMsMatch) {
    const [, h, m, s] = noMsMatch;
    return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000;
  }

  return 0;
}

/** Format milliseconds → "HH:MM:SS,mmm" (SRT format) */
export function formatTimestampSRT(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/** Format milliseconds → "HH:MM:SS.mmm" (VTT format) */
export function formatTimestampVTT(ms: number): string {
  return formatTimestampSRT(ms).replace(',', '.');
}

/** Format milliseconds → "H:MM:SS.cc" (ASS format, centiseconds) */
export function formatTimestampASS(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const centis = Math.floor((totalMs % 1000) / 10);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/** Parse ASS timestamp "H:MM:SS.cc" → milliseconds */
export function parseTimestampASS(ts: string): number {
  const match = ts.trim().match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
  if (!match) return 0;
  const [, h, m, s, cs] = match;
  return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(cs) * 10;
}

/** Format ms to display string "HH:MM:SS.mmm" (for UI display) */
export function formatTimeDisplay(ms: number): string {
  return formatTimestampVTT(ms);
}

/** Parse display string "HH:MM:SS.mmm" or "HH:MM:SS,mmm" back to ms */
export function parseTimeDisplay(str: string): number {
  return parseTimestamp(str);
}

// ---- SRT Parser ----

export function parseSRT(content: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  // Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Split into blocks by double newlines
  const blocks = normalized.split(/\n\n+/).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // First line: index number (may be absent in some SRT files)
    // Second line (or first if no index): timestamps
    let timestampLine = '';
    let textStartIdx = 0;

    // Find the timestamp line (contains " --> ")
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(' --> ')) {
        timestampLine = lines[i];
        textStartIdx = i + 1;
        break;
      }
    }

    if (!timestampLine) continue;

    const [startStr, endStr] = timestampLine.split(' --> ').map((s) => s.trim());
    const startTime = parseTimestamp(startStr);
    const endTime = parseTimestamp(endStr);

    const text = lines.slice(textStartIdx).join('\n').trim();

    if (text) {
      entries.push({
        id: generateEntryId(),
        index: entries.length + 1,
        startTime,
        endTime,
        text,
      });
    }
  }

  return entries;
}

// ---- VTT Parser ----

export function parseVTT(content: string): SubtitleEntry[] {
  const entries: SubtitleEntry[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Remove WEBVTT header and any header metadata
  const headerEnd = normalized.indexOf('\n\n');
  if (headerEnd === -1) return entries;
  const body = normalized.slice(headerEnd + 2);

  const blocks = body.split(/\n\n+/).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find timestamp line
    let timestampLine = '';
    let textStartIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(' --> ')) {
        timestampLine = lines[i];
        textStartIdx = i + 1;
        break;
      }
    }

    if (!timestampLine) continue;

    // VTT timestamps may have position/alignment info after the end time
    const arrowIdx = timestampLine.indexOf(' --> ');
    const startStr = timestampLine.slice(0, arrowIdx).trim();
    const afterArrow = timestampLine.slice(arrowIdx + 5).trim();
    // End time ends at first space (rest is cue settings)
    const endParts = afterArrow.split(/\s+/);
    const endStr = endParts[0];

    const startTime = parseTimestamp(startStr);
    const endTime = parseTimestamp(endStr);

    const text = lines.slice(textStartIdx).join('\n').trim();

    if (text) {
      entries.push({
        id: generateEntryId(),
        index: entries.length + 1,
        startTime,
        endTime,
        text,
      });
    }
  }

  return entries;
}

// ---- ASS Parser ----

export function parseASS(content: string): { entries: SubtitleEntry[]; header: string } {
  const entries: SubtitleEntry[] = [];
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  // Find [Events] section
  let eventsStart = -1;
  let formatLine = '';

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().toLowerCase() === '[events]') {
      eventsStart = i;
    }
    if (eventsStart >= 0 && lines[i].trim().toLowerCase().startsWith('format:')) {
      formatLine = lines[i];
      break;
    }
  }

  // Everything before [Events] is the header
  const headerEndIdx = eventsStart >= 0 ? eventsStart : lines.length;
  const header = lines.slice(0, headerEndIdx).join('\n');

  if (!formatLine || eventsStart < 0) {
    return { entries, header };
  }

  // Parse format columns
  const formatCols = formatLine
    .slice(formatLine.indexOf(':') + 1)
    .split(',')
    .map((c) => c.trim().toLowerCase());

  const startIdx = formatCols.indexOf('start');
  const endIdx = formatCols.indexOf('end');
  const textIdx = formatCols.indexOf('text');

  if (startIdx < 0 || endIdx < 0 || textIdx < 0) {
    return { entries, header };
  }

  // Parse Dialogue lines
  for (let i = eventsStart + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.toLowerCase().startsWith('dialogue:')) continue;

    const afterDialogue = line.slice(line.indexOf(':') + 1).trim();
    // Split by comma, but text field can contain commas — split only up to textIdx
    const parts: string[] = [];
    let remaining = afterDialogue;

    for (let j = 0; j < formatCols.length - 1; j++) {
      const commaIdx = remaining.indexOf(',');
      if (commaIdx < 0) break;
      parts.push(remaining.slice(0, commaIdx).trim());
      remaining = remaining.slice(commaIdx + 1);
    }
    // Last field (text) gets the rest
    parts.push(remaining.trim());

    if (parts.length <= textIdx) continue;

    const startTime = parseTimestampASS(parts[startIdx]);
    const endTime = parseTimestampASS(parts[endIdx]);
    // ASS uses \N for line breaks
    const text = parts[textIdx].replace(/\\N/g, '\n').replace(/\\n/g, '\n');

    entries.push({
      id: generateEntryId(),
      index: entries.length + 1,
      startTime,
      endTime,
      text,
    });
  }

  return { entries, header };
}

// ---- Serializers ----

export function serializeSRT(entries: SubtitleEntry[]): string {
  return entries
    .map((entry, i) => {
      const idx = i + 1;
      const start = formatTimestampSRT(entry.startTime);
      const end = formatTimestampSRT(entry.endTime);
      return `${idx}\n${start} --> ${end}\n${entry.text}`;
    })
    .join('\n\n');
}

export function serializeVTT(entries: SubtitleEntry[]): string {
  const header = 'WEBVTT\n\n';
  const body = entries
    .map((entry, i) => {
      const idx = i + 1;
      const start = formatTimestampVTT(entry.startTime);
      const end = formatTimestampVTT(entry.endTime);
      return `${idx}\n${start} --> ${end}\n${entry.text}`;
    })
    .join('\n\n');
  return header + body;
}

export function serializeASS(entries: SubtitleEntry[], assHeader?: string): string {
  const header =
    assHeader ||
    `[Script Info]
Title: Subtitle File
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1`;

  const events = `\n\n[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

  const dialogues = entries
    .map((entry) => {
      const start = formatTimestampASS(entry.startTime);
      const end = formatTimestampASS(entry.endTime);
      // Convert line breaks back to ASS format
      const text = entry.text.replace(/\n/g, '\\N');
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join('\n');

  return `${header}${events}\n${dialogues}\n`;
}

// ---- Universal Parse / Serialize ----

/**
 * Detect format from content (heuristic)
 */
export function detectFormat(content: string): SubtitleFormat {
  const trimmed = content.trim();
  if (trimmed.startsWith('WEBVTT')) return 'vtt';
  if (trimmed.includes('[Script Info]') || trimmed.includes('[V4+ Styles]')) return 'ass';
  // Default to SRT
  return 'srt';
}

/**
 * Detect format from file extension
 */
export function detectFormatFromFilename(filename: string): SubtitleFormat {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'vtt') return 'vtt';
  if (ext === 'ass' || ext === 'ssa') return 'ass';
  return 'srt';
}

/**
 * Parse subtitle content of any supported format
 */
export function parseSubtitles(content: string, format?: SubtitleFormat): SubtitleFile {
  const detectedFormat = format || detectFormat(content);

  switch (detectedFormat) {
    case 'vtt': {
      const entries = parseVTT(content);
      return { format: 'vtt', entries };
    }
    case 'ass': {
      const { entries, header } = parseASS(content);
      return { format: 'ass', entries, assHeader: header };
    }
    default: {
      const entries = parseSRT(content);
      return { format: 'srt', entries };
    }
  }
}

/**
 * Serialize entries to the specified format
 */
export function serializeSubtitles(
  entries: SubtitleEntry[],
  format: SubtitleFormat,
  assHeader?: string,
): string {
  switch (format) {
    case 'vtt':
      return serializeVTT(entries);
    case 'ass':
      return serializeASS(entries, assHeader);
    default:
      return serializeSRT(entries);
  }
}

/**
 * Re-index entries (update index field to be sequential)
 */
export function reindexEntries(entries: SubtitleEntry[]): SubtitleEntry[] {
  return entries.map((entry, i) => ({
    ...entry,
    index: i + 1,
  }));
}

/**
 * Sort entries by start time
 */
export function sortEntries(entries: SubtitleEntry[]): SubtitleEntry[] {
  const sorted = [...entries].sort((a, b) => a.startTime - b.startTime);
  return reindexEntries(sorted);
}

/**
 * Create a new empty subtitle entry
 */
export function createEmptyEntry(
  startTime: number,
  endTime?: number,
  index?: number,
): SubtitleEntry {
  return {
    id: generateEntryId(),
    index: index ?? 1,
    startTime,
    endTime: endTime ?? startTime + 2000, // Default 2s duration
    text: '',
  };
}
