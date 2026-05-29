import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { stat, writeTextFile } from '@tauri-apps/plugin-fs';
import {
  Check,
  DatabaseZap,
  Download,
  Link2,
  List,
  Search,
  Square,
  TableProperties,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useDataExport } from '@/contexts/DataExportContext';
import { useHistory } from '@/contexts/HistoryContext';
import type { ExportFormat, ExportSource } from '@/lib/types';
import { cn } from '@/lib/utils';
import { DataFieldSelector } from './DataFieldSelector';
import {
  buildExportContent,
  buildExportRecords,
  DEFAULT_FIELDS,
  detectSourceFromText,
  EXPORT_FORMATS,
  type FieldId,
  rowValue,
  sourceLabelKey,
} from './dataExportUtils';

const SOURCE_OPTIONS: { value: ExportSource; icon: ReactNode; labelKey: string }[] = [
  {
    value: 'auto',
    icon: <TableProperties className="w-4 h-4" />,
    labelKey: 'data.sources.auto',
  },
  {
    value: 'youtube_playlist',
    icon: <List className="w-4 h-4" />,
    labelKey: 'data.sources.youtubePlaylist',
  },
  {
    value: 'youtube_channel',
    icon: <DatabaseZap className="w-4 h-4" />,
    labelKey: 'data.sources.youtubeChannel',
  },
  {
    value: 'url_list',
    icon: <Link2 className="w-4 h-4" />,
    labelKey: 'data.sources.urlList',
  },
];

export function DataExportTab() {
  const { t } = useTranslation('metadata');
  const toast = useToast();
  const { refreshHistory } = useHistory();
  const {
    source,
    inputText,
    limit,
    detailMode,
    rows,
    title,
    warnings,
    isExtracting,
    error,
    setSource,
    setInputText,
    setLimit,
    setDetailMode,
    extractRows,
    cancelExtract,
    clearRows,
  } = useDataExport();
  const [search, setSearch] = useState('');
  const [selectedFields, setSelectedFields] = useState<FieldId[]>(DEFAULT_FIELDS);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.title, row.url, row.platform, row.uploader, row.description, row.tags?.join(' ')]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [rows, search]);

  const selectedRows = useMemo(() => {
    if (selectedIds.size === 0) return rows;
    return filteredRows.filter((row) => selectedIds.has(row.id));
  }, [filteredRows, rows, selectedIds]);

  const inputCount = inputText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')).length;
  const detectedSource = detectSourceFromText(inputText);
  const effectiveSource = source === 'auto' ? detectedSource : source;

  const getFieldLabel = (field: FieldId) => t(`data.columnsMap.${field}`);

  const toggleRow = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setSelectedIds((current) => {
      const allSelected =
        filteredRows.length > 0 && filteredRows.every((row) => current.has(row.id));
      if (allSelected) return new Set();
      return new Set(filteredRows.map((row) => row.id));
    });
  };

  const enableDetailMode = () => {
    if (!detailMode) {
      toast.warning({
        id: 'data-export-detail-mode-warning',
        title: t('data.detailMode'),
        message: t('data.detailHint'),
        durationMs: 4500,
      });
    }
    setDetailMode(true);
  };

  const handleExport = async (format: ExportFormat) => {
    if (selectedRows.length === 0 || selectedFields.length === 0) return;
    setExporting(true);
    try {
      const extByFormat: Record<ExportFormat, string> = {
        csv: 'csv',
        excel: 'xlsx',
        text: 'txt',
        bookmark_html: 'html',
        json: 'json',
        markdown: 'md',
        xml: 'xml',
        html: 'html',
        yaml: 'yaml',
        sqlite: 'sqlite',
        word: 'docx',
      };
      const ext = extByFormat[format];
      const filePath = await save({
        defaultPath: `youwee-data-export-${new Date().toISOString().slice(0, 10)}.${ext}`,
        filters: [{ name: t(`data.exportFormats.${format}`), extensions: [ext] }],
        title: t('data.export'),
      });
      if (!filePath) return;

      if (format === 'sqlite') {
        const records = buildExportRecords(selectedRows, selectedFields, getFieldLabel);
        await invoke('export_data_rows_sqlite', {
          filePath,
          columns: selectedFields.map(getFieldLabel),
          rows: records,
        });
      } else {
        await writeTextFile(
          filePath,
          buildExportContent(selectedRows, selectedFields, format, getFieldLabel),
        );
      }

      try {
        const fileInfo = await stat(filePath);
        await invoke<string>('add_history', {
          url: selectedRows.find((row) => row.url)?.url || 'youwee://data-export',
          title: t('data.exportHistoryTitle', {
            count: selectedRows.length,
            format: t(`data.exportFormats.${format}`),
          }),
          thumbnail: selectedRows.find((row) => row.thumbnail)?.thumbnail ?? null,
          filepath: filePath,
          filesize: fileInfo.size,
          duration: null,
          quality: null,
          format: ext,
          source: 'data_export',
        });
        await refreshHistory();
        toast.success({ title: t('data.exportSuccess'), message: t('data.exportSavedToLibrary') });
      } catch (libraryError) {
        console.error('Failed to save export to library:', libraryError);
        toast.warning({
          title: t('data.exportSuccess'),
          message: t('data.exportLibrarySaveFailed'),
        });
      }
    } catch (error) {
      toast.error({ title: t('data.exportFailed'), message: String(error) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
            <TableProperties className="w-3.5 h-3.5 text-primary" />
            <span>{t('data.detectedSource')}</span>
            <span className="font-medium text-foreground">
              {source === 'auto' ? t(sourceLabelKey(effectiveSource)) : t(sourceLabelKey(source))}
            </span>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 bg-transparent text-xs">
                {t('data.sourceOverride')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              {SOURCE_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setSource(option.value)}
                  disabled={isExtracting}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60',
                    source === option.value && 'bg-primary/10 text-primary',
                  )}
                >
                  {option.icon}
                  {t(option.labelKey)}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <div className="relative">
          <Textarea
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            disabled={isExtracting}
            placeholder={t('data.placeholder')}
            className="min-h-[92px] resize-none bg-background/50 border-border/50 font-mono text-sm"
          />
          {inputCount > 0 && (
            <span className="absolute bottom-2 right-2 rounded bg-background/85 px-2 py-1 text-xs text-muted-foreground">
              {t('data.inputCount', { count: inputCount })}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/30 border border-border/50 p-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('data.limit')}</span>
            <Input
              type="number"
              min={1}
              max={5000}
              value={limit}
              disabled={isExtracting}
              onChange={(event) => setLimit(Math.max(1, Number(event.target.value) || 1))}
              className="h-8 w-24 bg-background/60"
            />
          </div>

          <div className="inline-flex items-center rounded-lg bg-background/50 p-0.5">
            <button
              type="button"
              onClick={() => setDetailMode(false)}
              disabled={isExtracting}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                !detailMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
              )}
            >
              {t('data.fastMode')}
            </button>
            <button
              type="button"
              onClick={enableDetailMode}
              disabled={isExtracting}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                detailMode ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
              )}
            >
              {t('data.detailMode')}
            </button>
          </div>

          <div className="flex-1" />

          <DataFieldSelector
            selectedFields={selectedFields}
            setSelectedFields={setSelectedFields}
          />

          {!isExtracting ? (
            <button
              type="button"
              className="h-9 px-4 rounded-md font-medium text-sm btn-gradient flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={extractRows}
              disabled={!inputText.trim()}
            >
              <TableProperties className="w-4 h-4" />
              {t('data.extract')}
            </button>
          ) : (
            <Button variant="destructive" size="sm" onClick={cancelExtract} className="h-9">
              <Square className="w-4 h-4 mr-2" />
              {t('stop')}
            </Button>
          )}

          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              clearRows();
              setSelectedIds(new Set());
            }}
            disabled={isExtracting || rows.length === 0}
            className="h-9 w-9 bg-transparent"
            title={t('clearAll')}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
            {warnings.slice(0, 3).map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}
      </div>

      <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

      <div className="flex-1 flex flex-col overflow-hidden px-4 sm:px-6 pt-3">
        {rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              {isExtracting && (
                <>
                  <span className="absolute inset-0 rounded-full border border-primary/25 animate-ping" />
                  <span className="absolute -inset-2 rounded-full border border-primary/10" />
                </>
              )}
              <DatabaseZap className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">{t('data.emptyTitle')}</h3>
            {isExtracting ? (
              <div className="mt-1 w-full max-w-sm rounded-xl border border-primary/15 bg-primary/5 p-3 text-left shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-primary">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    {t('data.loadingTitle')}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                      <span
                        className={cn(
                          'h-2 rounded-full bg-[linear-gradient(90deg,hsl(var(--muted)),hsl(var(--primary)/0.28),hsl(var(--muted)))] bg-[length:200%_100%] animate-shimmer',
                          index === 0 && 'w-11/12',
                          index === 1 && 'w-8/12',
                          index === 2 && 'w-10/12',
                        )}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{t('data.loadingHint')}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground max-w-md">{t('data.emptyDescription')}</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium truncate">{title || t('data.results')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('data.resultStats', {
                    shown: filteredRows.length,
                    total: rows.length,
                    selected: selectedIds.size,
                  })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={t('data.search')}
                    className="h-9 w-48 pl-8 bg-background/50"
                  />
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 bg-transparent"
                      disabled={
                        selectedRows.length === 0 || selectedFields.length === 0 || exporting
                      }
                    >
                      <Download className="w-4 h-4" />
                      {t('data.export')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-48 p-2">
                    {EXPORT_FORMATS.map((format) => (
                      <button
                        key={format.value}
                        type="button"
                        onClick={() => handleExport(format.value)}
                        className="flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                      >
                        {t(format.labelKey)}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-xl border border-border/50 bg-background/30">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                  <tr>
                    <th className="w-10 border-b border-border/60 px-3 py-2">
                      <button
                        type="button"
                        onClick={toggleAllFiltered}
                        className="flex h-4 w-4 items-center justify-center rounded border border-border"
                      >
                        {filteredRows.length > 0 &&
                          filteredRows.every((row) => selectedIds.has(row.id)) && (
                            <Check className="w-3 h-3" />
                          )}
                      </button>
                    </th>
                    {selectedFields.map((field) => (
                      <th
                        key={field}
                        className="whitespace-nowrap border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground"
                      >
                        {t(`data.columnsMap.${field}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/30">
                      <td className="border-b border-border/30 px-3 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => toggleRow(row.id)}
                          className="flex h-4 w-4 items-center justify-center rounded border border-border"
                        >
                          {selectedIds.has(row.id) && <Check className="w-3 h-3" />}
                        </button>
                      </td>
                      {selectedFields.map((field) => (
                        <td
                          key={field}
                          className={cn(
                            'border-b border-border/30 px-3 py-2 align-top text-xs',
                            field === 'title' && 'min-w-[260px] max-w-[360px]',
                            field === 'videoUrl' && 'min-w-[260px] max-w-[420px]',
                            !['title', 'videoUrl', 'description'].includes(field) &&
                              'whitespace-nowrap',
                          )}
                        >
                          <span className="line-clamp-2 break-words">{rowValue(row, field)}</span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
