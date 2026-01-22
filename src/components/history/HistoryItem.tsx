import { useState, useCallback } from 'react';
import { useHistory } from '@/contexts/HistoryContext';
import { useAI } from '@/contexts/AIContext';
import { cn } from '@/lib/utils';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import type { HistoryEntry } from '@/lib/types';
import { 
  FolderOpen, 
  Download, 
  Trash2, 
  AlertCircle,
  Clock,
  HardDrive,
  FileVideo,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface HistoryItemProps {
  entry: HistoryEntry;
}

// Format file size
function formatSize(bytes?: number): string {
  if (!bytes) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Get source config
function getSourceConfig(source?: string): { icon: string; label: string; color: string } {
  switch (source?.toLowerCase()) {
    case 'youtube': 
      return { icon: 'fa-youtube-play', label: 'YouTube', color: 'text-red-500 bg-red-500/10' };
    case 'tiktok': 
      return { icon: 'fa-music', label: 'TikTok', color: 'text-pink-500 bg-pink-500/10' };
    case 'facebook': 
      return { icon: 'fa-facebook', label: 'Facebook', color: 'text-blue-600 bg-blue-600/10' };
    case 'instagram': 
      return { icon: 'fa-instagram', label: 'Instagram', color: 'text-pink-600 bg-pink-600/10' };
    case 'twitter': 
      return { icon: 'fa-twitter', label: 'Twitter', color: 'text-sky-500 bg-sky-500/10' };
    default: 
      return { icon: 'fa-globe', label: 'Other', color: 'text-gray-500 bg-gray-500/10' };
  }
}

export function HistoryItem({ entry }: HistoryItemProps) {
  const { openFileLocation, deleteEntry, redownload } = useHistory();
  const ai = useAI();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRedownloading, setIsRedownloading] = useState(false);
  const [redownloadError, setRedownloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [localSummary, setLocalSummary] = useState<string | undefined>(entry.summary);
  const [showFullSummary, setShowFullSummary] = useState(false);

  const sourceConfig = getSourceConfig(entry.source);

  const handleOpenFolder = useCallback(async () => {
    try {
      await openFileLocation(entry.filepath);
    } catch (error) {
      console.error('Failed to open folder:', error);
    }
  }, [openFileLocation, entry.filepath]);

  const handleDelete = useCallback(async () => {
    if (!confirm(`Remove "${entry.title}" from history?`)) return;
    setIsDeleting(true);
    try {
      await deleteEntry(entry.id);
    } catch (error) {
      console.error('Failed to delete:', error);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteEntry, entry.id, entry.title]);

  const handleRedownload = useCallback(async () => {
    setIsRedownloading(true);
    setRedownloadError(null);
    try {
      await redownload(entry);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to redownload';
      setRedownloadError(message);
    } finally {
      setIsRedownloading(false);
    }
  }, [redownload, entry]);

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(entry.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [entry.url]);

  const handleGenerateSummary = useCallback(async () => {
    if (!ai.config.enabled) return;
    
    setIsGeneratingSummary(true);
    setSummaryError(null);
    
    try {
      // Fetch transcript first
      const transcript = await ai.fetchTranscript(entry.url);
      // Generate summary
      const summary = await ai.generateSummary(transcript, entry.id);
      setLocalSummary(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSummaryError(message);
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [ai, entry.url, entry.id]);

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all duration-200',
        'bg-card/50 hover:bg-card/80',
        'border-white/[0.08] dark:border-white/[0.05]',
        !entry.file_exists && 'opacity-70'
      )}
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="relative flex-shrink-0 w-32 h-20 sm:w-40 sm:h-24 rounded-lg overflow-hidden bg-muted">
          {entry.thumbnail ? (
            <img
              src={entry.thumbnail}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
              <FileVideo className="w-10 h-10 text-muted-foreground/30" />
            </div>
          )}
          
          {/* Source badge */}
          <div className={cn(
            'absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium',
            sourceConfig.color
          )}>
            <i className={`fa ${sourceConfig.icon} text-[9px]`} />
            <span className="hidden sm:inline">{sourceConfig.label}</span>
          </div>

          {/* File missing indicator */}
          {!entry.file_exists && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-6 h-6 text-yellow-500 mx-auto mb-1" />
                <span className="text-[10px] text-yellow-500 font-medium">File Missing</span>
              </div>
            </div>
          )}

          {/* Quality badge */}
          {entry.quality && (
            <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white font-medium">
              {entry.quality}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-between">
          {/* Title */}
          <div>
            <h3 className="font-medium text-sm line-clamp-2 leading-snug mb-1.5" title={entry.title}>
              {entry.title}
            </h3>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {entry.format && (
                <span className="uppercase font-medium px-1.5 py-0.5 rounded bg-muted">
                  {entry.format}
                </span>
              )}
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                {formatSize(entry.filesize)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatRelativeTime(entry.downloaded_at)}
              </span>
            </div>

            {/* AI Summary */}
            {ai.config.enabled && (
              <div className="mt-2">
                {localSummary ? (
                  <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className={cn(
                          "text-xs text-muted-foreground",
                          !showFullSummary && "line-clamp-3"
                        )}>
                          <SimpleMarkdown content={localSummary} />
                        </div>
                        {localSummary.length > 200 && (
                          <button
                            onClick={() => setShowFullSummary(!showFullSummary)}
                            className="text-xs text-purple-500 hover:text-purple-400 mt-1 flex items-center gap-0.5"
                          >
                            {showFullSummary ? (
                              <>Show less <ChevronUp className="w-3 h-3" /></>
                            ) : (
                              <>Show more <ChevronDown className="w-3 h-3" /></>
                            )}
                          </button>
                        )}
                      </div>
                      <button
                        onClick={handleGenerateSummary}
                        disabled={isGeneratingSummary}
                        className="p-1 rounded text-muted-foreground hover:text-purple-500 transition-colors"
                        title="Regenerate summary"
                      >
                        {isGeneratingSummary ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary}
                    className={cn(
                      "flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-400 transition-colors",
                      isGeneratingSummary && "opacity-50"
                    )}
                  >
                    {isGeneratingSummary ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating summary...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        Generate AI summary
                      </>
                    )}
                  </button>
                )}
                {summaryError && (
                  <p className="text-xs text-destructive mt-1">{summaryError}</p>
                )}
              </div>
            )}
          </div>

          {/* Error message */}
          {redownloadError && (
            <p className="text-xs text-destructive mt-2">{redownloadError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {entry.file_exists ? (
              <button
                onClick={handleOpenFolder}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                  'bg-primary/10 hover:bg-primary/20 text-primary transition-colors'
                )}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Open Folder
              </button>
            ) : (
              <button
                onClick={handleRedownload}
                disabled={isRedownloading}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                  'bg-primary/10 hover:bg-primary/20 text-primary transition-colors',
                  isRedownloading && 'opacity-50'
                )}
              >
                {isRedownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                Re-download
              </button>
            )}

            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
              )}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open URL
            </a>

            <button
              onClick={handleCopyUrl}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors'
              )}
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
            </button>
            
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium',
                'bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors',
                isDeleting && 'opacity-50'
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
