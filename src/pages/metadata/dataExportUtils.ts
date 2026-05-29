import type { ExportFormat, ExportRow, ExportSource } from '@/lib/types';

export type FieldId =
  | 'title'
  | 'videoUrl'
  | 'tags'
  | 'descriptionTags'
  | 'descriptionEmails'
  | 'descriptionLinks'
  | 'description'
  | 'thumbnail'
  | 'channelName'
  | 'viewCount'
  | 'likeCount'
  | 'commentCount'
  | 'duration'
  | 'durationSeconds'
  | 'durationMinutes'
  | 'durationTimestamp'
  | 'uploadedTime';

export const FIELD_IDS: FieldId[] = [
  'title',
  'videoUrl',
  'tags',
  'descriptionTags',
  'descriptionEmails',
  'descriptionLinks',
  'description',
  'thumbnail',
  'channelName',
  'viewCount',
  'likeCount',
  'commentCount',
  'duration',
  'durationSeconds',
  'durationMinutes',
  'durationTimestamp',
  'uploadedTime',
];

export const DEFAULT_FIELDS: FieldId[] = [
  'title',
  'videoUrl',
  'channelName',
  'durationSeconds',
  'uploadedTime',
  'viewCount',
];

export const EXPORT_FORMATS: { value: ExportFormat; labelKey: string }[] = [
  { value: 'csv', labelKey: 'data.exportFormats.csv' },
  { value: 'excel', labelKey: 'data.exportFormats.excel' },
  { value: 'text', labelKey: 'data.exportFormats.text' },
  { value: 'bookmark_html', labelKey: 'data.exportFormats.bookmarkHtml' },
  { value: 'json', labelKey: 'data.exportFormats.json' },
  { value: 'markdown', labelKey: 'data.exportFormats.markdown' },
  { value: 'xml', labelKey: 'data.exportFormats.xml' },
  { value: 'html', labelKey: 'data.exportFormats.html' },
  { value: 'yaml', labelKey: 'data.exportFormats.yaml' },
  { value: 'sqlite', labelKey: 'data.exportFormats.sqlite' },
  { value: 'word', labelKey: 'data.exportFormats.word' },
];

function normalizeCell(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function markdownEscape(value: string): string {
  return value.replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function htmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDurationTimestamp(seconds?: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
    .toString()
    .padStart(2, '0')}`;
}

function formatCount(value?: number | null): string {
  if (value == null) return '';
  return new Intl.NumberFormat().format(value);
}

function formatUploadTime(row: ExportRow): string {
  if (row.timestamp) {
    return new Date(row.timestamp * 1000).toISOString();
  }
  const value = row.uploadDate;
  if (!value) return '';
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}

function extractDescriptionTags(description?: string | null): string[] {
  if (!description) return [];
  return [...description.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1] || match[0]);
}

function extractEmails(description?: string | null): string[] {
  if (!description) return [];
  return description.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
}

function extractLinks(description?: string | null): string[] {
  if (!description) return [];
  return description.match(/https?:\/\/[^\s<>"')]+/gi) || [];
}

export function detectSourceFromText(text: string): ExportSource {
  const firstInput = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#'));

  if (!firstInput) return 'auto';

  const lower = firstInput.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
    if (lower.includes('list=') || lower.includes('/playlist')) return 'youtube_playlist';
    if (
      lower.includes('/@') ||
      lower.includes('/channel/') ||
      lower.includes('/c/') ||
      lower.includes('/user/')
    ) {
      return 'youtube_channel';
    }
  }

  return 'url_list';
}

export function sourceLabelKey(source: ExportSource): string {
  const keys: Record<ExportSource, string> = {
    auto: 'data.sources.auto',
    youtube_playlist: 'data.sources.youtubePlaylist',
    youtube_channel: 'data.sources.youtubeChannel',
    url_list: 'data.sources.urlList',
  };
  return keys[source];
}

export function rowValue(row: ExportRow, field: FieldId): string {
  if (field === 'title') return normalizeCell(row.title);
  if (field === 'videoUrl') return normalizeCell(row.url);
  if (field === 'tags') return normalizeCell(row.tags);
  if (field === 'descriptionTags') return normalizeCell(extractDescriptionTags(row.description));
  if (field === 'descriptionEmails') return normalizeCell(extractEmails(row.description));
  if (field === 'descriptionLinks') return normalizeCell(extractLinks(row.description));
  if (field === 'description') return normalizeCell(row.description);
  if (field === 'thumbnail') return normalizeCell(row.thumbnail);
  if (field === 'channelName') return normalizeCell(row.uploader);
  if (field === 'viewCount') return formatCount(row.viewCount);
  if (field === 'likeCount') return formatCount(row.likeCount);
  if (field === 'commentCount') return formatCount(row.commentCount);
  if (field === 'duration') return formatDuration(row.durationSeconds);
  if (field === 'durationSeconds')
    return row.durationSeconds == null ? '' : String(row.durationSeconds);
  if (field === 'durationMinutes') {
    return row.durationSeconds == null ? '' : (row.durationSeconds / 60).toFixed(2);
  }
  if (field === 'durationTimestamp') return formatDurationTimestamp(row.durationSeconds);
  if (field === 'uploadedTime') return formatUploadTime(row);
  return '';
}

export function buildExportRecords(
  rows: ExportRow[],
  fields: FieldId[],
  getFieldLabel: (field: FieldId) => string,
): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    for (const field of fields) {
      record[getFieldLabel(field)] = rowValue(row, field);
    }
    return record;
  });
}

function buildHtmlTable(records: Record<string, string>[], title: string): string {
  const headers = Object.keys(records[0] || {});
  const head = headers.map((header) => `<th>${htmlEscape(header)}</th>`).join('');
  const body = records
    .map((record) => {
      const cells = headers
        .map((header) => `<td>${htmlEscape(record[header] || '')}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${htmlEscape(title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #d0d7de;padding:6px 8px;vertical-align:top}
th{background:#f6f8fa;text-align:left}
</style>
</head>
<body>
<h1>${htmlEscape(title)}</h1>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>`;
}

function buildYaml(records: Record<string, string>[]): string {
  return records
    .map((record) => {
      const lines = Object.entries(record).map(([key, value]) => {
        const escaped = value
          .replaceAll('\\', '\\\\')
          .replaceAll('"', '\\"')
          .replace(/\r?\n/g, '\\n');
        return `  ${key}: "${escaped}"`;
      });
      return `-\n${lines.join('\n')}`;
    })
    .join('\n');
}

function buildXml(records: Record<string, string>[]): string {
  const rows = records
    .map((record) => {
      const cells = Object.entries(record)
        .map(([key, value]) => `<field name="${htmlEscape(key)}">${htmlEscape(value)}</field>`)
        .join('');
      return `<row>${cells}</row>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<youweeExport>\n${rows}\n</youweeExport>`;
}

export function buildExportContent(
  rows: ExportRow[],
  fields: FieldId[],
  format: ExportFormat,
  getFieldLabel: (field: FieldId) => string,
): string {
  const records = buildExportRecords(rows, fields, getFieldLabel);

  if (format === 'json') return JSON.stringify(records, null, 2);
  if (format === 'text') {
    return records.map((record) => Object.values(record).join('\t')).join('\n');
  }
  if (format === 'bookmark_html') {
    const links = rows
      .map((row) => {
        const url = htmlEscape(row.url || '');
        const title = htmlEscape(row.title || row.url || 'Untitled');
        return url ? `<DT><A HREF="${url}">${title}</A>` : '';
      })
      .filter(Boolean)
      .join('\n');
    return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Youwee Export</TITLE>
<H1>Youwee Export</H1>
<DL><p>
${links}
</DL><p>`;
  }
  if (format === 'html' || format === 'excel' || format === 'word') {
    return buildHtmlTable(records, 'Youwee Export');
  }
  if (format === 'xml') return buildXml(records);
  if (format === 'yaml') return buildYaml(records);

  if (format === 'markdown') {
    const headers = fields.map(getFieldLabel);
    const header = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const lines = records.map(
      (record) =>
        `| ${Object.values(record)
          .map((value) => markdownEscape(value))
          .join(' | ')} |`,
    );
    return [header, separator, ...lines].join('\n');
  }

  const headers = fields.map(getFieldLabel);
  const header = headers.map(csvEscape).join(',');
  const lines = records.map((record) => Object.values(record).map(csvEscape).join(','));
  return [header, ...lines].join('\n');
}
