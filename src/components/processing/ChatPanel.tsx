import { open } from '@tauri-apps/plugin-dialog';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  Check,
  FolderOpen,
  ImagePlus,
  Lightbulb,
  Loader2,
  Paperclip,
  Send,
  Square,
  Wand2,
  X,
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatAttachment, ChatMessage, ProcessingProgress } from '@/lib/types';
import { cn } from '@/lib/utils';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'tiff', 'tif'];

export interface ChatPanelProps {
  messages: ChatMessage[];
  isGenerating: boolean;
  isProcessing: boolean;
  progress: ProcessingProgress | null;
  hasVideo: boolean;
  attachedImages: ChatAttachment[];
  onSendMessage: (message: string) => Promise<void>;
  onCancelProcessing: () => void;
  onAttachImages: (paths: string[]) => Promise<void>;
  onRemoveAttachment: (id: string) => void;
  onClearAttachments: () => void;
}

export function ChatPanel({
  messages,
  isGenerating,
  isProcessing,
  progress,
  hasVideo,
  attachedImages,
  onSendMessage,
  onCancelProcessing,
  onAttachImages,
  onRemoveAttachment,
}: ChatPanelProps) {
  const { t } = useTranslation('pages');
  const [inputMessage, setInputMessage] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  // Prompt suggestions for chat
  const promptSuggestions = [
    {
      id: 'cut',
      label: t('processing.chat.prompts.cut'),
      prompt: t('processing.chat.prompts.cutPrompt'),
    },
    {
      id: 'extract_audio',
      label: t('processing.chat.prompts.extractAudio'),
      prompt: t('processing.chat.prompts.extractAudioPrompt'),
    },
    {
      id: 'resize',
      label: t('processing.chat.prompts.resize'),
      prompt: t('processing.chat.prompts.resizePrompt'),
    },
    {
      id: 'convert',
      label: t('processing.chat.prompts.convert'),
      prompt: t('processing.chat.prompts.convertPrompt'),
    },
    {
      id: 'compress',
      label: t('processing.chat.prompts.compress'),
      prompt: t('processing.chat.prompts.compressPrompt'),
    },
    {
      id: 'speed',
      label: t('processing.chat.prompts.speed'),
      prompt: t('processing.chat.prompts.speedPrompt'),
    },
    {
      id: 'gif',
      label: t('processing.chat.prompts.gif'),
      prompt: t('processing.chat.prompts.gifPrompt'),
    },
    {
      id: 'rotate',
      label: t('processing.chat.prompts.rotate'),
      prompt: t('processing.chat.prompts.rotatePrompt'),
    },
    {
      id: 'thumbnail',
      label: t('processing.chat.prompts.thumbnail'),
      prompt: t('processing.chat.prompts.thumbnailPrompt'),
    },
    {
      id: 'remove_audio',
      label: t('processing.chat.prompts.mute'),
      prompt: t('processing.chat.prompts.mutePrompt'),
    },
    {
      id: 'overlay',
      label: t('processing.chat.prompts.overlay'),
      prompt: t('processing.chat.prompts.overlayPrompt'),
    },
    {
      id: 'watermark',
      label: t('processing.chat.prompts.watermark'),
      prompt: t('processing.chat.prompts.watermarkPrompt'),
    },
    {
      id: 'intro',
      label: t('processing.chat.prompts.intro'),
      prompt: t('processing.chat.prompts.introPrompt'),
    },
  ];

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSelectSuggestion = (prompt: string) => {
    setInputMessage(prompt);
    setShowSuggestions(false);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !hasVideo) return;

    const message = inputMessage.trim();
    setInputMessage('');
    await onSendMessage(message);
  };

  // File picker for images
  const handleAttachImages = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [
          {
            name: 'Image',
            extensions: IMAGE_EXTENSIONS,
          },
        ],
      });

      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        const validPaths = paths.filter((p): p is string => typeof p === 'string');
        if (validPaths.length > 0) {
          await onAttachImages(validPaths);
        }
      }
    } catch (error) {
      console.error('Failed to select images:', error);
    }
  };

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        return IMAGE_EXTENSIONS.includes(ext);
      });

      if (imageFiles.length > 0) {
        // For Tauri, we need absolute paths. dataTransfer.files gives us File objects
        // but in Tauri webview, dropped files have a path property
        const paths = imageFiles
          .map((f) => (f as File & { path?: string }).path)
          .filter((p): p is string => !!p);

        if (paths.length > 0) {
          await onAttachImages(paths);
        }
      }
    },
    [onAttachImages],
  );

  return (
    // biome-ignore lint/a11y/useSemanticElements: drag-drop container needs event handlers
    <div
      role="region"
      className="w-[30%] border-l border-border flex flex-col bg-gradient-to-b from-muted/30 to-background overflow-hidden relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-lg m-2">
          <div className="flex flex-col items-center gap-2 text-primary">
            <ImagePlus className="w-8 h-8" />
            <span className="text-sm font-medium">{t('processing.chat.dropImages')}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{t('processing.chat.title')}</h3>
              <p className="text-xs text-muted-foreground">{t('processing.chat.subtitle')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-3">
                <Wand2 className="w-6 h-6 text-primary/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {t('processing.chat.emptyTitle')}
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-[180px]">
                {t('processing.chat.emptyHint')}
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  msg.role === 'user' && 'justify-end',
                  msg.role === 'assistant' && 'justify-start',
                  msg.role === 'system' && 'justify-center',
                  msg.role === 'complete' && 'justify-start',
                )}
              >
                {msg.role === 'complete' ? (
                  // Complete message with Open Folder button
                  <div className="flex flex-col gap-2 p-3 rounded-xl rounded-bl-sm bg-green-500/10 border border-green-500/20 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-[85%]">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-green-500" />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t('processing.chat.complete')}
                      </span>
                    </div>
                    <p className="text-sm text-foreground [overflow-wrap:anywhere]">
                      {msg.content}
                    </p>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 hover:underline w-fit"
                      onClick={() => msg.outputPath && revealItemInDir(msg.outputPath)}
                    >
                      <FolderOpen className="w-3 h-3" />
                      {t('processing.chat.openInFolder')}
                    </button>
                  </div>
                ) : (
                  <div
                    className={cn(
                      'rounded-xl text-sm animate-in fade-in slide-in-from-bottom-2 duration-200',
                      'max-w-[85%]',
                      msg.role === 'user' && 'p-3 bg-primary text-primary-foreground rounded-br-sm',
                      msg.role === 'assistant' &&
                        'p-3 bg-muted/80 border border-border/50 rounded-bl-sm',
                      msg.role === 'system' &&
                        'text-xs text-muted-foreground py-1 px-3 bg-muted/30 rounded-full',
                    )}
                  >
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
                        <Wand2 className="w-3 h-3" />
                        <span>{t('processing.chat.title')}</span>
                      </div>
                    )}
                    {/* Attachment thumbnails */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="relative group/att rounded-lg overflow-hidden bg-black/20"
                          >
                            <img
                              src={att.previewUrl}
                              alt={att.name}
                              className="h-16 w-auto max-w-[100px] object-cover rounded-lg"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                              <span className="text-[10px] text-white/80 truncate block">
                                {att.name}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <p
                      className={cn(
                        'whitespace-pre-wrap [overflow-wrap:anywhere]',
                        msg.role === 'system' && 'italic',
                      )}
                    >
                      {msg.content}
                    </p>
                  </div>
                )}
              </div>
            ))
          )}
          {isGenerating && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 text-muted-foreground text-sm p-3 bg-muted/80 border border-border/50 rounded-xl rounded-bl-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>{t('processing.chat.generating')}</span>
              </div>
            </div>
          )}
          {isProcessing && progress && (
            <div className="flex justify-start">
              <div className="flex flex-col gap-3 p-3 bg-muted/80 border border-border/50 rounded-xl rounded-bl-sm animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-[200px] max-w-[85%]">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">{t('processing.chat.processing')}</span>
                  </div>
                  <span className="text-sm font-semibold text-primary">
                    {progress.percent.toFixed(0)}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.min(progress.percent, 100)}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-white/20 to-transparent rounded-full animate-pulse"
                    style={{ width: `${Math.min(progress.percent, 100)}%` }}
                  />
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {progress.speed && (
                    <span className="flex items-center gap-1">
                      <span className="text-foreground font-medium">{progress.speed}</span>
                    </span>
                  )}
                  {progress.time && (
                    <span className="flex items-center gap-1">
                      <span className="text-foreground font-medium">{progress.time}</span>
                    </span>
                  )}
                  {progress.size && (
                    <span className="flex items-center gap-1">
                      <span className="text-foreground font-medium">{progress.size}</span>
                    </span>
                  )}
                </div>

                {/* Cancel Button */}
                <button
                  type="button"
                  onClick={onCancelProcessing}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive hover:text-destructive-foreground hover:bg-destructive/90 bg-destructive/10 border border-destructive/20 rounded-lg transition-colors w-fit"
                >
                  <Square className="w-3 h-3" />
                  {t('processing.chat.cancel')}
                </button>
              </div>
            </div>
          )}
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Floating Input - Modern glass style */}
      <div className="flex-shrink-0 p-3 pt-0">
        <div
          className={cn(
            'relative flex flex-col p-2 rounded-2xl',
            'bg-background/60 backdrop-blur-md',
            'transition-all duration-300 ease-out',
            // Default state
            !isInputFocused && [
              'ring-1 ring-white/10 dark:ring-white/5',
              'shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]',
              'hover:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.4)]',
            ],
            // Focused state - takes priority
            isInputFocused && [
              'ring-2 ring-primary/30',
              'shadow-[0_0_0_4px_hsl(var(--primary)/0.1),0_8px_32px_-4px_rgba(0,0,0,0.15)]',
            ],
          )}
        >
          {/* Subtle gradient overlay */}
          <div
            className={cn(
              'absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300',
              isInputFocused
                ? 'bg-gradient-to-b from-primary/5 to-transparent opacity-100'
                : 'bg-gradient-to-b from-white/5 to-transparent opacity-100',
            )}
          />

          {/* Textarea */}
          <div className="relative min-w-0">
            <textarea
              placeholder={t('processing.chat.inputPlaceholder')}
              value={inputMessage}
              onChange={(e) => {
                setInputMessage(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={!hasVideo || isProcessing || isGenerating}
              rows={1}
              className={cn(
                'w-full resize-none bg-transparent border-0 outline-none',
                'text-sm leading-relaxed py-2 px-3',
                'placeholder:text-muted-foreground/40',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'max-h-[120px]',
              )}
              style={{ height: 'auto', minHeight: '40px' }}
            />
          </div>

          {/* Attached images preview strip */}
          {attachedImages.length > 0 && (
            <div className="relative flex gap-1.5 px-2 py-1.5 overflow-x-auto">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group/preview flex-shrink-0 rounded-lg overflow-hidden bg-muted/50 border border-border/30"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    className="h-12 w-auto max-w-[80px] object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(img.id)}
                    className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity shadow-sm"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1 py-0.5">
                    <span className="text-[9px] text-white/80 truncate block max-w-[70px]">
                      {img.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom row: Prompt Templates + Attach (left) + Send (right) */}
          <div className="relative flex items-center justify-between mt-1 px-1">
            <div className="flex items-center gap-0.5">
              {/* Prompt Templates Button */}
              <div className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowSuggestions(!showSuggestions)}
                      disabled={!hasVideo || isProcessing || isGenerating}
                      className={cn(
                        'h-8 w-8 rounded-lg flex items-center justify-center',
                        'transition-all duration-200',
                        'hover:bg-muted text-muted-foreground hover:text-foreground',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        showSuggestions && 'bg-muted text-foreground',
                      )}
                    >
                      <Lightbulb className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{t('processing.chat.promptTemplates')}</TooltipContent>
                </Tooltip>

                {/* Suggestions Dropdown */}
                {showSuggestions && (
                  <div
                    className={cn(
                      'absolute bottom-full left-0 mb-2 w-64',
                      'bg-background/95 backdrop-blur-xl',
                      'border border-border/50 rounded-xl shadow-xl',
                      'p-2 z-50',
                    )}
                  >
                    <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                      {t('processing.chat.promptTemplates')}
                    </div>
                    <div className="space-y-0.5 max-h-64 overflow-y-auto">
                      {promptSuggestions.map((suggestion) => (
                        <button
                          type="button"
                          key={suggestion.id}
                          onClick={() => handleSelectSuggestion(suggestion.prompt)}
                          className={cn(
                            'w-full text-left px-3 py-2 rounded-lg',
                            'text-sm transition-colors',
                            'hover:bg-muted/70 text-foreground',
                          )}
                        >
                          <div className="font-medium">{suggestion.label}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {suggestion.prompt}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Attach Image Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleAttachImages}
                    disabled={!hasVideo || isProcessing || isGenerating}
                    className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center',
                      'transition-all duration-200',
                      'hover:bg-muted text-muted-foreground hover:text-foreground',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      attachedImages.length > 0 && 'text-primary',
                    )}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('processing.chat.attachImage')}</TooltipContent>
              </Tooltip>

              {/* Attachment count badge */}
              {attachedImages.length > 0 && (
                <span className="text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                  {attachedImages.length}
                </span>
              )}
            </div>

            {/* Send Button */}
            <button
              type="button"
              className={cn(
                'relative flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center',
                'transition-all duration-300 ease-out',
                inputMessage.trim() && hasVideo && !isProcessing && !isGenerating
                  ? 'btn-gradient shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-105'
                  : 'bg-muted/50 text-muted-foreground/30 hover:bg-muted/70 hover:text-muted-foreground/50',
              )}
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || !hasVideo || isProcessing || isGenerating}
            >
              <Send
                className={cn(
                  'w-4 h-4 transition-transform duration-300',
                  inputMessage.trim() && '-rotate-45',
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
