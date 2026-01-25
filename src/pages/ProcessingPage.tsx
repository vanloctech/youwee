import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile } from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { cn } from '@/lib/utils';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Upload,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Scissors,
  Music,
  Maximize,
  RotateCcw,
  Image,
  Film,
  Zap,
  FileDown,
  Trash2,
  Send,
  Wand2,
  X,
  Clock,
  Check,
  AlertCircle,
  Loader2,
  Settings2,
  History,
  FolderOpen,
  Copy,
  Bookmark,
  BookmarkPlus,
  Maximize2,
  Minimize2,
  Lightbulb,
} from 'lucide-react';
import type {
  VideoMetadata,
  ProcessingProgress,
  FFmpegCommandResult,
  ProcessingJob,
  ProcessingPreset,
  QuickAction,
  ChatMessage,
} from '@/lib/types';

// Prompt suggestions for chat
const promptSuggestions = [
  { id: 'cut', label: 'Cut', prompt: 'Cut video from [start_time] to [end_time]' },
  { id: 'extract_audio', label: 'Extract Audio', prompt: 'Extract audio as [mp3/m4a/wav]' },
  { id: 'resize', label: 'Resize', prompt: 'Resize to [720p/1080p/480p]' },
  { id: 'convert', label: 'Convert', prompt: 'Convert to [mp4/webm/mkv/mov]' },
  { id: 'compress', label: 'Compress', prompt: 'Compress video to reduce file size' },
  { id: 'speed', label: 'Speed', prompt: 'Change speed to [0.5x/1.5x/2x]' },
  { id: 'gif', label: 'GIF', prompt: 'Create GIF from [start_time] to [end_time]' },
  { id: 'rotate', label: 'Rotate', prompt: 'Rotate video [90/180/270] degrees' },
  { id: 'thumbnail', label: 'Thumbnail', prompt: 'Extract thumbnail at [time]' },
  { id: 'remove_audio', label: 'Mute', prompt: 'Remove audio from video' },
];

interface TimelineSelection {
  start: number;
  end: number;
}

export function ProcessingPage() {
  // Video state
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<number | null>(null);

  // Timeline selection
  const [selection, setSelection] = useState<TimelineSelection | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [currentCommand, setCurrentCommand] = useState<FFmpegCommandResult | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [completedOutputPath, setCompletedOutputPath] = useState<string | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating, isProcessing]);

  // History
  const [history, setHistory] = useState<ProcessingJob[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (!videoRef.current || !videoSrc) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleSeek([currentTime - (e.shiftKey ? 1 : 5)]);
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleSeek([currentTime + (e.shiftKey ? 1 : 5)]);
          break;
        case 'KeyI':
        case 'BracketLeft':
          e.preventDefault();
          handleSetSelection('start');
          break;
        case 'KeyO':
        case 'BracketRight':
          e.preventDefault();
          handleSetSelection('end');
          break;
        case 'KeyM':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange([Math.min(1, volume + 0.1)]);
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange([Math.max(0, volume - 0.1)]);
          break;
        case 'Escape':
          if (selection) {
            e.preventDefault();
            setSelection(null);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoSrc, currentTime, volume, selection, isPlaying]);

  // Listen for processing progress
  useEffect(() => {
    const unlisten = listen<ProcessingProgress>('processing-progress', (event) => {
      setProgress(event.payload);
      if (event.payload.percent >= 100) {
        setIsProcessing(false);
        setProgress(null);
        addMessage('system', 'Processing completed!');
        loadHistory();
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const jobs = await invoke<ProcessingJob[]>('get_processing_history', { limit: 20 });
      setHistory(jobs);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  };

  const addMessage = (role: 'user' | 'assistant' | 'system' | 'complete', content: string, options?: { command?: FFmpegCommandResult; outputPath?: string }) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role,
      content,
      command: options?.command,
      outputPath: options?.outputPath,
      timestamp: new Date().toISOString(),
    }]);
  };

  const loadVideoAsBlob = async (filePath: string): Promise<string> => {
    try {
      const fileData = await readFile(filePath);
      const blob = new Blob([fileData], { type: 'video/mp4' });
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error('Failed to load video as blob:', err);
      return convertFileSrc(filePath);
    }
  };

  const handleSelectVideo = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', 'm4v'] }],
      });

      if (selected && typeof selected === 'string') {
        setIsLoadingVideo(true);
        setVideoPath(selected);
        setVideoError(null);
        setVideoSrc(null);
        setSelection(null);
        setMessages([]);

        const meta = await invoke<VideoMetadata>('get_video_metadata', { path: selected });
        setMetadata(meta);

        const problematicCodecs = ['vp9', 'vp8', 'av1', 'hevc', 'h265', 'theora'];
        const hasProblematicCodec = problematicCodecs.some(c => meta.video_codec.toLowerCase().includes(c));

        if (hasProblematicCodec) {
          addMessage('system', `${meta.filename} - Generating preview...`);
          const existingPreview = await invoke<string | null>('check_preview_exists', { inputPath: selected });

          if (existingPreview) {
            const previewSrc = await loadVideoAsBlob(existingPreview);
            setVideoSrc(previewSrc);
            addMessage('system', 'Ready');
          } else {
            setIsGeneratingPreview(true);
            try {
              const previewPath = await invoke<string>('generate_video_preview', {
                inputPath: selected,
                videoCodec: meta.video_codec,
              });
              const previewSrc = await loadVideoAsBlob(previewPath);
              setVideoSrc(previewSrc);
              addMessage('system', 'Ready');
            } catch (previewErr) {
              const originalSrc = await loadVideoAsBlob(selected);
              setVideoSrc(originalSrc);
              addMessage('system', `Preview failed: ${previewErr}`);
            } finally {
              setIsGeneratingPreview(false);
            }
          }
        } else {
          const videoSrcUrl = await loadVideoAsBlob(selected);
          setVideoSrc(videoSrcUrl);
          addMessage('system', `${meta.filename} loaded`);
        }
      }
    } catch (err) {
      console.error('Failed to load video:', err);
      addMessage('system', `Error: ${err}`);
    } finally {
      setIsLoadingVideo(false);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const handleVolumeChange = (value: number[]) => {
    if (videoRef.current) {
      videoRef.current.volume = value[0];
      setVolume(value[0]);
      setIsMuted(value[0] === 0);
    }
  };

  const handleToggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleSetSelection = (type: 'start' | 'end') => {
    if (type === 'start') {
      setSelection(prev => ({ start: currentTime, end: prev?.end ?? duration }));
    } else {
      setSelection(prev => ({ start: prev?.start ?? 0, end: currentTime }));
    }
  };

  const handleSelectSuggestion = (prompt: string) => {
    setInputMessage(prompt);
    setShowSuggestions(false);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !metadata || !videoPath) return;

    const message = inputMessage.trim();
    setInputMessage('');
    addMessage('user', message);

    try {
      setIsGenerating(true);
      setCompletedOutputPath(null);
      const result = await invoke<FFmpegCommandResult>('generate_processing_command', {
        inputPath: videoPath,
        userPrompt: message,
        timelineStart: selection?.start ?? null,
        timelineEnd: selection?.end ?? null,
        metadata,
      });

      addMessage('assistant', result.explanation);
      setIsGenerating(false);
      
      // Auto execute
      await handleExecuteCommand(result);
    } catch (err) {
      addMessage('system', `Error: ${err}`);
      setIsGenerating(false);
    }
  };

  const handleExecuteCommand = async (command: FFmpegCommandResult) => {
    if (!command || !videoPath) return;

    try {
      setIsProcessing(true);
      setCompletedOutputPath(null);
      const jobId = crypto.randomUUID();
      setCurrentJobId(jobId);

      await invoke('save_processing_job', {
        id: jobId,
        inputPath: videoPath,
        outputPath: command.output_path,
        taskType: 'custom',
        userPrompt: messages.find(m => m.role === 'user')?.content ?? null,
        ffmpegCommand: command.command,
      });

      addMessage('system', 'Processing...');

      await invoke('execute_ffmpeg_command', {
        jobId,
        command: command.command,
        inputPath: videoPath,
        outputPath: command.output_path,
      });

      await invoke('update_processing_job', {
        id: jobId,
        status: 'completed',
        progress: 100,
        errorMessage: null,
      });

      setCompletedOutputPath(command.output_path);
      setCurrentCommand(null);
      // Add complete message with output path for "Open Folder" button
      addMessage('complete', command.output_path.split('/').pop() || 'Output ready', { outputPath: command.output_path });
    } catch (err) {
      addMessage('system', `Failed: ${err}`);
      if (currentJobId) {
        await invoke('update_processing_job', {
          id: currentJobId,
          status: 'failed',
          progress: 0,
          errorMessage: String(err),
        });
      }
    } finally {
      setIsProcessing(false);
      setProgress(null);
      setCurrentJobId(null);
      loadHistory();
    }
  };

  const handleOpenOutputFolder = async () => {
    if (completedOutputPath) {
      try {
        await revealItemInDir(completedOutputPath);
      } catch (err) {
        console.error('Failed to open folder:', err);
      }
    }
  };

  const handleCancelProcessing = async () => {
    if (currentJobId) {
      try {
        await invoke('cancel_ffmpeg', { jobId: currentJobId });
        await invoke('update_processing_job', {
          id: currentJobId,
          status: 'cancelled',
          progress: 0,
          errorMessage: 'Cancelled',
        });
        addMessage('system', 'Cancelled');
      } catch (err) {
        console.error('Failed to cancel:', err);
      }
      setIsProcessing(false);
      setProgress(null);
      setCurrentJobId(null);
      loadHistory();
    }
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const playheadPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Calculate dynamic aspect ratio from video metadata
  const videoAspectRatio = metadata ? metadata.width / metadata.height : 16 / 9;

  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between h-12 sm:h-14 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-primary" />
            <h1 className="text-base sm:text-lg font-semibold">Processing</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="gap-1"
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
              {history.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {history.length}
                </Badge>
              )}
            </Button>
            <ThemePicker />
          </div>
        </header>

        <div className="mx-4 sm:mx-6 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Video + Controls */}
          <div className="w-[70%] flex flex-col p-4 sm:p-6 gap-4 overflow-hidden">
            {/* Video Player Container - YouTube style */}
            <div
              className={cn(
                "relative rounded-xl overflow-hidden w-full",
                "bg-black",
                !videoSrc && "aspect-video flex items-center justify-center border border-white/10"
              )}
              style={videoSrc ? { 
                aspectRatio: videoAspectRatio,
                maxHeight: '70vh'
              } : undefined}
              onMouseEnter={() => setShowControls(true)}
              onMouseLeave={() => !isPlaying && setShowControls(true)}
            >
              {isLoadingVideo || isGeneratingPreview ? (
                <div className="flex flex-col items-center gap-3 text-white/70">
                  <Loader2 className="w-10 h-10 animate-spin" />
                  <p className="text-sm">{isGeneratingPreview ? 'Generating preview...' : 'Loading...'}</p>
                </div>
              ) : videoSrc ? (
                <>
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    className="absolute inset-0 w-full h-full object-contain"
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onClick={handlePlayPause}
                  />

                  {/* Top bar with video title */}
                  <div
                    className={cn(
                      "absolute inset-x-0 top-0 p-3 pb-8",
                      "bg-gradient-to-b from-black/70 to-transparent",
                      "transition-opacity duration-300 flex items-start justify-between",
                      showControls ? "opacity-100" : "opacity-0"
                    )}
                  >
                    {videoPath && (
                      <>
                        <div className="flex-1 min-w-0 mr-3">
                          <p className="text-sm font-medium text-white truncate">
                            {videoPath.split('/').pop()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-white/70 hover:text-white hover:bg-white/20 flex-shrink-0"
                          onClick={handleSelectVideo}
                        >
                          <Upload className="w-3 h-3 mr-1" />
                          Change
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Video Controls Overlay */}
                  <div
                    className={cn(
                      "absolute inset-x-0 bottom-0 p-3 pt-12",
                      "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
                      "transition-opacity duration-300",
                      showControls ? "opacity-100" : "opacity-0"
                    )}
                  >
                    {/* Timeline */}
                    <div className="relative mb-3">
                      {/* Selection range */}
                      {selection && duration > 0 && (
                        <div
                          className="absolute h-1 bg-primary/50 rounded top-1/2 -translate-y-1/2 pointer-events-none z-10"
                          style={{
                            left: `${(selection.start / duration) * 100}%`,
                            width: `${((selection.end - selection.start) / duration) * 100}%`,
                          }}
                        />
                      )}
                      <Slider
                        value={[currentTime]}
                        min={0}
                        max={duration || 100}
                        step={0.1}
                        onValueChange={handleSeek}
                        className="cursor-pointer"
                      />
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center gap-2">
                      {/* Play/Pause */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white hover:bg-white/20"
                        onClick={handlePlayPause}
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>

                      {/* Skip */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
                        onClick={() => handleSeek([currentTime - 10])}
                      >
                        <SkipBack className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
                        onClick={() => handleSeek([currentTime + 10])}
                      >
                        <SkipForward className="w-4 h-4" />
                      </Button>

                      {/* Time */}
                      <span className="text-xs text-white/70 font-mono min-w-[80px]">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>

                      <div className="flex-1" />

                      {/* Volume */}
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white/70 hover:bg-white/20 hover:text-white"
                          onClick={handleToggleMute}
                        >
                          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </Button>
                        <Slider
                          value={[isMuted ? 0 : volume]}
                          min={0}
                          max={1}
                          step={0.1}
                          onValueChange={handleVolumeChange}
                          className="w-20"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Processing Overlay */}
                  {isProcessing && progress && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                      <Loader2 className="w-10 h-10 animate-spin text-primary" />
                      <div className="text-center text-white">
                        <p className="font-medium">{progress.percent.toFixed(0)}%</p>
                        <p className="text-xs text-white/60">{progress.speed}</p>
                      </div>
                      <Progress value={progress.percent} className="w-48" />
                      <Button variant="destructive" size="sm" onClick={handleCancelProcessing}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-4 text-muted-foreground p-8">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                    <Film className="w-8 h-8 opacity-50" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">No video loaded</p>
                    <p className="text-sm text-muted-foreground/70 mt-1">Select a video to start editing</p>
                  </div>
                  <Button onClick={handleSelectVideo} className="mt-2">
                    <Upload className="w-4 h-4 mr-2" />
                    Select Video
                  </Button>
                </div>
              )}
            </div>

            {/* Metadata Bar */}
            {metadata && (
              <div className="flex items-center gap-4 px-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <Maximize2 className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">{metadata.width}×{metadata.height}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <Film className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">{metadata.video_codec}</span>
                  </div>
                  {metadata.audio_codec && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                        <Music className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">{metadata.audio_codec}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">{formatTime(metadata.duration)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                      <FileDown className="w-3 h-3 text-muted-foreground" />
                    </div>
                    <span className="text-muted-foreground">{(metadata.file_size / 1_000_000).toFixed(1)} MB</span>
                  </div>
                  {metadata.frame_rate && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <div className="w-5 h-5 rounded bg-muted/50 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-muted-foreground" />
                      </div>
                      <span className="text-muted-foreground">{metadata.frame_rate.toFixed(0)} fps</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Chat Panel */}
          <div className="w-[30%] border-l border-border flex flex-col bg-gradient-to-b from-muted/30 to-background overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 p-4 border-b border-border/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Wand2 className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">AI Assistant</h3>
                    <p className="text-xs text-muted-foreground">Describe your edit</p>
                  </div>
                </div>
                
                {/* Suggestions Button */}
                <div className="relative">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setShowSuggestions(!showSuggestions)}
                        disabled={!metadata || isProcessing || isGenerating}
                        className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center",
                          "transition-all duration-200",
                          "hover:bg-muted text-muted-foreground hover:text-foreground",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                          showSuggestions && "bg-muted text-foreground"
                        )}
                      >
                        <Lightbulb className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Prompt Templates</TooltipContent>
                  </Tooltip>
                  
                  {/* Suggestions Dropdown */}
                  {showSuggestions && (
                    <div className={cn(
                      "absolute top-full right-0 mt-2 w-64",
                      "bg-background/95 backdrop-blur-xl",
                      "border border-border/50 rounded-xl shadow-xl",
                      "p-2 z-50"
                    )}>
                      <div className="text-xs text-muted-foreground px-2 py-1 mb-1">
                        Prompt Templates
                      </div>
                      <div className="space-y-0.5 max-h-64 overflow-y-auto">
                        {promptSuggestions.map((suggestion) => (
                          <button
                            key={suggestion.id}
                            onClick={() => handleSelectSuggestion(suggestion.prompt)}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-lg",
                              "text-sm transition-colors",
                              "hover:bg-muted/70 text-foreground"
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
                    <p className="text-sm font-medium text-muted-foreground">What would you like to do?</p>
                    <p className="text-xs text-muted-foreground/60 mt-1 max-w-[180px]">
                      Try "Cut from 1:00 to 2:00" or "Convert to 720p"
                    </p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.role === 'user' && "justify-end",
                        msg.role === 'assistant' && "justify-start",
                        msg.role === 'system' && "justify-center",
                        msg.role === 'complete' && "justify-center"
                      )}
                    >
                      {msg.role === 'complete' ? (
                        // Complete message with Open Folder button
                        <div className="inline-flex items-center gap-2 p-2 px-3 rounded-xl bg-green-500/10 border border-green-500/20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                          <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-green-500" />
                          </div>
                          <span className="text-xs text-muted-foreground max-w-[120px] truncate">{msg.content}</span>
                          <button
                            className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400 hover:underline flex-shrink-0"
                            onClick={() => msg.outputPath && revealItemInDir(msg.outputPath)}
                          >
                            <FolderOpen className="w-3 h-3" />
                            Open
                          </button>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "rounded-xl text-sm animate-in fade-in slide-in-from-bottom-2 duration-200",
                            "max-w-[85%]",
                            msg.role === 'user' && "p-3 bg-primary text-primary-foreground rounded-br-sm",
                            msg.role === 'assistant' && "p-3 bg-muted/80 border border-border/50 rounded-bl-sm",
                            msg.role === 'system' && "text-xs text-muted-foreground py-1 px-3 bg-muted/30 rounded-full"
                          )}
                        >
                          {msg.role === 'assistant' && (
                            <div className="flex items-center gap-1.5 mb-1.5 text-xs text-muted-foreground">
                              <Wand2 className="w-3 h-3" />
                              <span>AI</span>
                            </div>
                          )}
                          <p className={cn(
                            "whitespace-pre-wrap [overflow-wrap:anywhere]",
                            msg.role === 'system' && "italic"
                          )}>{msg.content}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
                {(isGenerating || isProcessing) && (
                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 text-muted-foreground text-sm py-2 px-4 bg-muted/50 rounded-full">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span>{isProcessing ? 'Processing...' : 'Generating...'}</span>
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
                  "relative flex items-end gap-2 p-2 rounded-2xl",
                  "bg-background/60 backdrop-blur-md",
                  "transition-all duration-300 ease-out",
                  // Default state
                  !isInputFocused && [
                    "ring-1 ring-white/10 dark:ring-white/5",
                    "shadow-[0_4px_24px_-4px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.3)]",
                    "hover:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.12)] dark:hover:shadow-[0_8px_32px_-4px_rgba(0,0,0,0.4)]"
                  ],
                  // Focused state - takes priority
                  isInputFocused && [
                    "ring-2 ring-primary/30",
                    "shadow-[0_0_0_4px_hsl(var(--primary)/0.1),0_8px_32px_-4px_rgba(0,0,0,0.15)]"
                  ]
                )}
              >
                {/* Subtle gradient overlay */}
                <div className={cn(
                  "absolute inset-0 rounded-2xl pointer-events-none transition-opacity duration-300",
                  isInputFocused 
                    ? "bg-gradient-to-b from-primary/5 to-transparent opacity-100" 
                    : "bg-gradient-to-b from-white/5 to-transparent opacity-100"
                )} />
                
                <div className="relative flex-1 min-w-0">
                  <textarea
                    placeholder="Describe your edit..."
                    value={inputMessage}
                    onChange={(e) => {
                      setInputMessage(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                    }}
                    onFocus={() => setIsInputFocused(true)}
                    onBlur={() => setIsInputFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={!metadata || isProcessing || isGenerating}
                    rows={1}
                    className={cn(
                      "w-full resize-none bg-transparent border-0 outline-none",
                      "text-sm leading-relaxed py-2 px-3",
                      "placeholder:text-muted-foreground/40",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "max-h-[120px]"
                    )}
                    style={{ height: 'auto', minHeight: '40px' }}
                  />
                </div>
                
                <button
                  className={cn(
                    "relative flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center",
                    "transition-all duration-300 ease-out",
                    inputMessage.trim() && metadata && !isProcessing && !isGenerating
                      ? "btn-gradient shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:scale-105"
                      : "bg-muted/50 text-muted-foreground/30 hover:bg-muted/70 hover:text-muted-foreground/50"
                  )}
                  onClick={handleSendMessage}
                  disabled={!inputMessage.trim() || !metadata || isProcessing || isGenerating}
                >
                  <Send className={cn(
                    "w-4 h-4 transition-transform duration-300",
                    inputMessage.trim() && "-rotate-45"
                  )} />
                </button>
              </div>
            </div>
          </div>

          {/* History Panel */}
          {showHistory && (
            <div className="w-72 border-l border-border flex flex-col bg-muted/10">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <h3 className="font-medium text-sm">History</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowHistory(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {history.length === 0 ? (
                    <p className="text-center text-muted-foreground/60 text-sm py-8">
                      No history yet
                    </p>
                  ) : (
                    history.map((job) => (
                      <div
                        key={job.id}
                        className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {job.status === 'completed' ? (
                            <Check className="w-3 h-3 text-green-500" />
                          ) : job.status === 'failed' ? (
                            <AlertCircle className="w-3 h-3 text-red-500" />
                          ) : (
                            <Clock className="w-3 h-3 text-muted-foreground" />
                          )}
                          <span className="text-xs truncate flex-1">
                            {job.input_path.split('/').pop()}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {job.task_type}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
