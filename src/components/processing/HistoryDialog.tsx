import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  AlertCircle,
  Calendar,
  Check,
  Copy,
  FileDown,
  FileVideo,
  FolderOpen,
  History,
  MessageSquare,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export function HistoryDialog({
  open,
  onOpenChange,
  history,
  onDelete,
  onClearAll,
}: HistoryDialogProps) {
  const [selectedJob, setSelectedJob] = useState<ProcessingJob | null>(null);
  const [copied, setCopied] = useState(false);

  // Auto-select first item when dialog opens
  useEffect(() => {
    if (open && history.length > 0 && !selectedJob) {
      setSelectedJob(history[0]);
    }
    if (!open) {
      setSelectedJob(null);
    }
  }, [open, history, selectedJob]);

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
    return date.toLocaleDateString('vi-VN', {
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
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Completed</Badge>
        );
      case 'failed':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Failed</Badge>;
      case 'cancelled':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Cancelled</Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Processing History
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
                Clear All
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Job List */}
          <div className="w-80 border-r flex flex-col min-h-0 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                      <History className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground">No processing history</p>
                  </div>
                ) : (
                  history.map((job) => (
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
                        <p className="text-sm font-medium break-all">
                          {job.input_path.split('/').pop()}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDate(job.created_at)}
                        </p>
                        {job.user_prompt && (
                          <p className="text-xs text-muted-foreground/70 mt-1 break-all line-clamp-3">
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
                          Open Folder
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
                        Prompt
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
                        Input
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
                          Output
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
                        FFmpeg Command
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
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy
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
                        Error
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
                      Created: {formatDate(selectedJob.created_at)}
                    </div>
                    {selectedJob.completed_at && (
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        Completed: {formatDate(selectedJob.completed_at)}
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
                <p className="text-muted-foreground">Select a job to view details</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
