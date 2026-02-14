import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileDown,
  FileVideo,
  FolderOpen,
  History,
  MessageSquare,
  Search,
  SlidersHorizontal,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ProcessingJob } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface HistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: ProcessingJob[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

type StatusFilter = 'all' | 'completed' | 'failed' | 'cancelled';

export function HistoryDialog({
  open,
  onOpenChange,
  history,
  onDelete,
  onClearAll,
}: HistoryDialogProps) {
  const { t, i18n } = useTranslation('pages');
  const [selectedJob, setSelectedJob] = useState<ProcessingJob | null>(null);
  const [copied, setCopied] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeDateField, setActiveDateField] = useState<'from' | 'to'>('from');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('processing.historyDialog.filterAll') },
    { value: 'completed', label: t('processing.historyDialog.status.completed') },
    { value: 'failed', label: t('processing.historyDialog.status.failed') },
    { value: 'cancelled', label: t('processing.historyDialog.status.cancelled') },
  ];

  // Filtered history
  const filteredHistory = useMemo(() => {
    let result = history;

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((job) => job.status === statusFilter);
    }

    // Text search: match filename or user prompt
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((job) => {
        const filename = job.input_path.split('/').pop()?.toLowerCase() ?? '';
        const prompt = job.user_prompt?.toLowerCase() ?? '';
        return filename.includes(q) || prompt.includes(q);
      });
    }

    // Date range filter
    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      result = result.filter((job) => new Date(job.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((job) => new Date(job.created_at) <= to);
    }

    return result;
  }, [history, searchQuery, statusFilter, dateFrom, dateTo]);

  const hasDateFilter = dateFrom !== '' || dateTo !== '';
  const isDateRangeInvalid =
    dateFrom !== '' && dateTo !== '' && new Date(dateFrom) > new Date(dateTo);
  const hasActiveFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || hasDateFilter;

  const formatDateKey = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const formatDateInput = useCallback(
    (value: string) => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
      return date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    },
    [i18n.language],
  );

  const dateRangeLabel = useMemo(() => {
    if (!hasDateFilter) return t('processing.historyDialog.dateRange');
    const from = dateFrom ? formatDateInput(dateFrom) : '...';
    const to = dateTo ? formatDateInput(dateTo) : '...';
    return `${from} - ${to}`;
  }, [hasDateFilter, dateFrom, dateTo, formatDateInput, t]);

  const calendarTitle = useMemo(() => {
    const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
    return calendarMonth.toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    });
  }, [calendarMonth, i18n.language]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const offset = (firstOfMonth.getDay() + 6) % 7; // Monday-first
    const gridStart = new Date(year, month, 1 - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + i);
      return date;
    });
  }, [calendarMonth]);

  const onSelectCalendarDate = useCallback(
    (date: Date) => {
      const value = formatDateKey(date);
      if (activeDateField === 'from') {
        setDateFrom(value);
      } else {
        setDateTo(value);
      }
    },
    [activeDateField, formatDateKey],
  );

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  }, []);

  // Auto-select first item when dialog opens
  useEffect(() => {
    if (open && filteredHistory.length > 0 && !selectedJob) {
      setSelectedJob(filteredHistory[0]);
    }
    if (!open) {
      setSelectedJob(null);
      clearFilters();
    }
  }, [open, filteredHistory, selectedJob, clearFilters]);

  // When filters change, ensure selectedJob is still in the filtered list
  useEffect(() => {
    if (selectedJob && !filteredHistory.find((j) => j.id === selectedJob.id)) {
      setSelectedJob(filteredHistory[0] ?? null);
    }
  }, [filteredHistory, selectedJob]);

  const copyCommand = useCallback(async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const locale = i18n.language === 'vi' ? 'vi-VN' : 'en-US';
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
            {t('processing.historyDialog.status.completed')}
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
            {t('processing.historyDialog.status.failed')}
          </Badge>
        );
      case 'cancelled':
        return (
          <Badge
            variant="outline"
            className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
          >
            {t('processing.historyDialog.status.cancelled')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  /** Small colored dot for job status in the list */
  const getStatusDot = (status: string) => {
    const color =
      status === 'completed'
        ? 'bg-green-500'
        : status === 'failed'
          ? 'bg-red-500'
          : status === 'cancelled'
            ? 'bg-yellow-500'
            : 'bg-muted-foreground';
    return <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', color)} />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              {t('processing.historyDialog.title')}
            </DialogTitle>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 focus-visible:ring-destructive gap-1.5"
                onClick={() => {
                  onClearAll();
                  setSelectedJob(null);
                }}
              >
                <Trash2 className="w-4 h-4" />
                {t('processing.historyDialog.clearAll')}
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Job List */}
          <div className="w-80 border-r flex flex-col min-h-0 overflow-hidden">
            {/* Filters */}
            <div className="p-3 space-y-2.5 border-b flex-shrink-0">
              {/* Search + Date range */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder={t('processing.historyDialog.searchPlaceholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={cn(
                      'h-8 pl-8 text-xs',
                      'bg-background/50 border-border/50',
                      'focus:bg-background transition-colors',
                      'placeholder:text-muted-foreground/50',
                      searchQuery ? 'pr-7' : 'pr-3',
                    )}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Date range popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        'h-8 px-2.5 gap-1.5 text-[11px] font-medium justify-start min-w-0 max-w-[175px]',
                        'border-border/60 bg-background/70 backdrop-blur-sm',
                        'hover:bg-muted/60 transition-colors',
                        hasDateFilter
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'text-muted-foreground',
                        isDateRangeInvalid &&
                          'border-destructive/50 bg-destructive/10 text-destructive',
                      )}
                      title={t('processing.historyDialog.dateRange')}
                    >
                      <Calendar className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{dateRangeLabel}</span>
                      <ChevronDown className="w-3 h-3 ml-auto shrink-0 opacity-70" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 p-0 overflow-hidden border-border/60 shadow-xl"
                    align="end"
                    sideOffset={8}
                  >
                    <div className="px-4 py-3 border-b bg-gradient-to-r from-muted/70 via-muted/40 to-background">
                      <p className="text-xs font-semibold text-foreground">
                        {t('processing.historyDialog.dateRange')}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{dateRangeLabel}</p>
                    </div>

                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveDateField('from')}
                          className={cn(
                            'text-left rounded-md border px-2.5 py-2 transition-colors',
                            activeDateField === 'from'
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-border/60 bg-background/70 hover:bg-muted/40',
                          )}
                        >
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            {t('processing.historyDialog.dateFrom')}
                          </p>
                          <p className="text-xs mt-0.5 font-medium">
                            {dateFrom ? formatDateInput(dateFrom) : '...'}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveDateField('to')}
                          className={cn(
                            'text-left rounded-md border px-2.5 py-2 transition-colors',
                            activeDateField === 'to'
                              ? 'border-primary/40 bg-primary/10'
                              : 'border-border/60 bg-background/70 hover:bg-muted/40',
                          )}
                        >
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                            {t('processing.historyDialog.dateTo')}
                          </p>
                          <p className="text-xs mt-0.5 font-medium">
                            {dateTo ? formatDateInput(dateTo) : '...'}
                          </p>
                        </button>
                      </div>

                      <div className="rounded-lg border border-border/60 bg-background/80 p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              setCalendarMonth(
                                (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                              )
                            }
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                          <span className="text-xs font-medium capitalize">{calendarTitle}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              setCalendarMonth(
                                (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                              )
                            }
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
                            <div
                              key={day}
                              className="h-6 flex items-center justify-center text-[10px] text-muted-foreground font-medium"
                            >
                              {day}
                            </div>
                          ))}

                          {calendarCells.map((date) => {
                            const key = formatDateKey(date);
                            const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                            const isFrom = dateFrom === key;
                            const isTo = dateTo === key;
                            const isInRange =
                              dateFrom &&
                              dateTo &&
                              !isDateRangeInvalid &&
                              key >= dateFrom &&
                              key <= dateTo;

                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => onSelectCalendarDate(date)}
                                className={cn(
                                  'h-8 rounded-md text-xs transition-colors',
                                  isCurrentMonth
                                    ? 'text-foreground hover:bg-muted'
                                    : 'text-muted-foreground/45 hover:bg-muted/50',
                                  isInRange && 'bg-primary/10 text-primary',
                                  (isFrom || isTo) &&
                                    'bg-primary text-primary-foreground hover:bg-primary/90',
                                )}
                              >
                                {date.getDate()}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {isDateRangeInvalid && (
                        <div className="flex items-center gap-1.5 text-[11px] text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-2.5 py-2">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {t('processing.historyDialog.dateFrom')} &gt;{' '}
                            {t('processing.historyDialog.dateTo')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-3 border-t bg-muted/30 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {hasDateFilter ? dateRangeLabel : t('processing.historyDialog.dateRange')}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDateFrom('');
                          setDateTo('');
                        }}
                        className="h-7 px-2 text-[11px]"
                        disabled={!hasDateFilter}
                      >
                        <X className="w-3 h-3 mr-1" />
                        {t('processing.historyDialog.clearDates')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Status filter tabs */}
              <div className="flex items-center gap-1">
                <div className="inline-flex items-center rounded-lg bg-muted/50 p-0.5 flex-1">
                  {statusOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setStatusFilter(option.value)}
                      className={cn(
                        'flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-all text-center',
                        statusFilter === option.value
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active filter indicator */}
              {hasActiveFilters && (
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    {t('processing.historyDialog.filterCount', {
                      count: filteredHistory.length,
                      total: history.length,
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                    {t('processing.historyDialog.clearFilters')}
                  </button>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {filteredHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                      {hasActiveFilters ? (
                        <SlidersHorizontal className="w-6 h-6 text-muted-foreground/50" />
                      ) : (
                        <History className="w-6 h-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {hasActiveFilters
                        ? t('processing.historyDialog.noResults')
                        : t('processing.historyDialog.noHistory')}
                    </p>
                  </div>
                ) : (
                  filteredHistory.map((job) => (
                    <button
                      type="button"
                      key={job.id}
                      onClick={() => setSelectedJob(job)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg transition-colors',
                        'hover:bg-muted/50',
                        selectedJob?.id === job.id && 'bg-muted',
                      )}
                    >
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-start gap-2">
                          <span className="mt-1.5 flex-shrink-0">{getStatusDot(job.status)}</span>
                          <p className="text-sm font-medium break-all">
                            {job.input_path.split('/').pop()}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 ml-3.5">
                          {formatDate(job.created_at)}
                        </p>
                        {job.user_prompt && (
                          <p className="text-xs text-muted-foreground/70 mt-1 ml-3.5 break-all line-clamp-2">
                            "{job.user_prompt}"
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Job Details */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
            {selectedJob ? (
              <ScrollArea className="flex-1">
                <div className="p-6 space-y-6">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg break-words">
                        {selectedJob.input_path.split('/').pop()}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {getStatusBadge(selectedJob.status)}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(selectedJob.created_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {selectedJob.status === 'completed' && selectedJob.output_path && (
                        <Button
                          size="sm"
                          onClick={() =>
                            selectedJob.output_path && revealItemInDir(selectedJob.output_path)
                          }
                          className="gap-1.5"
                        >
                          <FolderOpen className="w-4 h-4" />
                          {t('processing.historyDialog.openFolder')}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => {
                          onDelete(selectedJob.id);
                          setSelectedJob(null);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* User Prompt */}
                  {selectedJob.user_prompt && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        {t('processing.historyDialog.prompt')}
                      </div>
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-sm break-words whitespace-pre-wrap">
                          {selectedJob.user_prompt}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Input/Output Files */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileVideo className="w-4 h-4 text-blue-500" />
                        {t('processing.historyDialog.input')}
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 border overflow-hidden">
                        <p className="text-xs text-muted-foreground break-all">
                          {selectedJob.input_path}
                        </p>
                      </div>
                    </div>
                    {selectedJob.output_path && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileDown className="w-4 h-4 text-green-500" />
                          {t('processing.historyDialog.output')}
                        </div>
                        <div className="p-3 rounded-lg bg-muted/50 border overflow-hidden">
                          <p className="text-xs text-muted-foreground break-all">
                            {selectedJob.output_path}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* FFmpeg Command */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Terminal className="w-4 h-4 text-orange-500" />
                        {t('processing.historyDialog.ffmpegCommand')}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => copyCommand(selectedJob.ffmpeg_command)}
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-green-500" />
                            {t('processing.historyDialog.copied')}
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            {t('processing.historyDialog.copy')}
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 overflow-x-auto">
                      <code className="text-xs text-zinc-300 break-all whitespace-pre-wrap font-mono block">
                        {selectedJob.ffmpeg_command}
                      </code>
                    </div>
                  </div>

                  {/* Error Message */}
                  {selectedJob.error_message && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                        <AlertCircle className="w-4 h-4" />
                        {t('processing.historyDialog.error')}
                      </div>
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-500 break-words whitespace-pre-wrap">
                          {selectedJob.error_message}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {t('processing.historyDialog.created')}: {formatDate(selectedJob.created_at)}
                    </div>
                    {selectedJob.completed_at && (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        {t('processing.historyDialog.completed')}:{' '}
                        {formatDate(selectedJob.completed_at)}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                  <FileVideo className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground">{t('processing.historyDialog.selectJob')}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
