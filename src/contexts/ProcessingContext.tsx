import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  ChatAttachment,
  ChatMessage,
  FFmpegCommandResult,
  ProcessingJob,
  ProcessingPreset,
  ProcessingProgress,
  ProcessingStatus,
  ProcessingTaskType,
  TimelineSelection,
  VideoMetadata,
} from '@/lib/types';

const PREVIEW_THRESHOLD_KEY = 'youwee-preview-size-threshold';
const DEFAULT_PREVIEW_THRESHOLD_MB = 300;

export interface PreviewConfirmInfo {
  filename: string;
  fileSizeMB: number;
  codec: string;
}

interface ProcessingContextValue {
  // Video state
  videoPath: string | null;
  videoSrc: string | null;
  audioSrc: string | null;
  thumbnailSrc: string | null;
  videoMetadata: VideoMetadata | null;
  isLoadingVideo: boolean;
  isGeneratingPreview: boolean;
  isUsingPreview: boolean;
  videoError: string | null;
  duration: number;

  // Preview confirm dialog
  pendingPreviewConfirm: PreviewConfirmInfo | null;
  confirmPreview: (createPreview: boolean) => void;

  // Settings
  previewSizeThreshold: number;
  setPreviewSizeThreshold: (mb: number) => void;

  // Timeline
  currentTime: number;
  selection: TimelineSelection | null;

  // Processing
  status: ProcessingStatus;
  isProcessing: boolean;
  currentJob: ProcessingJob | null;
  currentJobId: string | null;
  progress: ProcessingProgress | null;
  generatedCommand: FFmpegCommandResult | null;
  completedOutputPath: string | null;

  // Chat
  messages: ChatMessage[];
  isGenerating: boolean;
  outputDirectory: string;

  // Image attachments
  attachedImages: ChatAttachment[];

  // History & Presets
  history: ProcessingJob[];
  presets: ProcessingPreset[];

  // Batch
  batchFiles: string[];

  // Actions
  selectVideo: () => Promise<void>;
  loadVideo: (path: string) => Promise<void>;
  setVideoError: (error: string | null) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setSelection: (selection: TimelineSelection | null) => void;
  addMessage: (
    role: 'user' | 'assistant' | 'system' | 'complete',
    content: string,
    options?: { command?: FFmpegCommandResult; outputPath?: string },
  ) => void;

  // AI Actions
  sendMessage: (content: string) => Promise<void>;
  selectOutputDirectory: () => Promise<void>;
  generateCommand: (
    taskType: ProcessingTaskType,
    options?: Record<string, unknown>,
  ) => Promise<void>;

  // Image Actions
  attachImages: (paths: string[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  // Processing Actions
  executeCommand: (command?: FFmpegCommandResult) => Promise<void>;
  cancelProcessing: () => Promise<void>;
  clearCommand: () => void;
  openOutputFolder: () => Promise<void>;

  // History Actions
  loadHistory: () => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;

  // Preset Actions
  loadPresets: () => Promise<void>;
  savePreset: (name: string, description?: string) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
  applyPreset: (preset: ProcessingPreset) => Promise<void>;

  // Batch Actions
  addBatchFile: (path: string) => void;
  removeBatchFile: (path: string) => void;
  clearBatch: () => void;
  processBatch: () => Promise<void>;

  // Utils
  reset: () => void;
}

const ProcessingContext = createContext<ProcessingContextValue | null>(null);

export function ProcessingProvider({ children }: { children: ReactNode }) {
  // Video state
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isUsingPreview, setIsUsingPreview] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  // Timeline
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<TimelineSelection | null>(null);

  // Processing
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJob, setCurrentJob] = useState<ProcessingJob | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [generatedCommand, setGeneratedCommand] = useState<FFmpegCommandResult | null>(null);
  const [completedOutputPath, setCompletedOutputPath] = useState<string | null>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputDirectory, setOutputDirectory] = useState('');

  // Image attachments
  const [attachedImages, setAttachedImages] = useState<ChatAttachment[]>([]);

  // History & Presets
  const [history, setHistory] = useState<ProcessingJob[]>([]);
  const [presets, setPresets] = useState<ProcessingPreset[]>([]);

  // Batch
  const [batchFiles, setBatchFiles] = useState<string[]>([]);

  // Preview confirm dialog
  const [pendingPreviewConfirm, setPendingPreviewConfirm] = useState<PreviewConfirmInfo | null>(
    null,
  );
  const previewConfirmResolverRef = useRef<((createPreview: boolean) => void) | null>(null);

  // Settings
  const [previewSizeThreshold, setPreviewSizeThresholdState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PREVIEW_THRESHOLD_KEY);
      if (saved) return Number(saved);
    } catch (_e) {
      // ignore
    }
    return DEFAULT_PREVIEW_THRESHOLD_MB;
  });

  const setPreviewSizeThreshold = useCallback((mb: number) => {
    setPreviewSizeThresholdState(mb);
    localStorage.setItem(PREVIEW_THRESHOLD_KEY, String(mb));
  }, []);

  // Confirm preview dialog: called by dialog buttons to resolve the pending promise
  const confirmPreview = useCallback((createPreview: boolean) => {
    previewConfirmResolverRef.current?.(createPreview);
    previewConfirmResolverRef.current = null;
    setPendingPreviewConfirm(null);
  }, []);

  // Helper: ask user whether to create preview for large files
  const requestPreviewConfirm = useCallback((info: PreviewConfirmInfo): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      previewConfirmResolverRef.current = resolve;
      setPendingPreviewConfirm(info);
    });
  }, []);

  // Refs
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Listen for processing progress events
  useEffect(() => {
    const setupListener = async () => {
      unlistenRef.current = await listen<ProcessingProgress>('processing-progress', (event) => {
        setProgress(event.payload);
        if (event.payload.percent >= 100) {
          setStatus('completed');
          setIsProcessing(false);
        }
      });
    };

    setupListener();

    return () => {
      unlistenRef.current?.();
    };
  }, []);

  // Helper: load video source URL
  // Uses convertFileSrc (streaming via asset protocol) for standard codecs
  const loadVideoSrc = useCallback((filePath: string): string => {
    return convertFileSrc(filePath);
  }, []);

  const getDirectoryFromPath = useCallback((filePath: string): string => {
    const normalized = filePath.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash <= 0) return '';
    return normalized.slice(0, lastSlash);
  }, []);

  // Helper: revoke previous blob URL to prevent memory leak
  const revokePreviousVideoSrc = useCallback((src: string | null) => {
    if (src?.startsWith('blob:')) {
      URL.revokeObjectURL(src);
    }
  }, []);

  // Add message to chat
  const addMessage = useCallback(
    (
      role: 'user' | 'assistant' | 'system' | 'complete',
      content: string,
      options?: { command?: FFmpegCommandResult; outputPath?: string },
    ) => {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role,
          content,
          command: options?.command,
          outputPath: options?.outputPath,
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    [],
  );

  // Load processing history - defined early so other functions can use it
  const loadHistory = useCallback(async () => {
    try {
      const jobs = await invoke<ProcessingJob[]>('get_processing_history', { limit: 50 });
      setHistory(jobs);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, []);

  // Load video and get metadata
  const loadVideo = useCallback(
    async (path: string) => {
      setIsLoadingVideo(true);
      setVideoPath(path);
      setOutputDirectory(getDirectoryFromPath(path));
      // Revoke previous blob URL before clearing
      revokePreviousVideoSrc(videoSrc);
      revokePreviousVideoSrc(thumbnailSrc);
      setVideoSrc(null);
      setAudioSrc(null);
      setThumbnailSrc(null);
      setVideoError(null);
      setSelection(null);
      setCurrentTime(0);
      setGeneratedCommand(null);
      setMessages([]);
      setCompletedOutputPath(null);
      setIsUsingPreview(false);

      try {
        const metadata = await invoke<VideoMetadata>('get_video_metadata', { path });
        setVideoMetadata(metadata);

        // Determine if the video needs preview transcoding.
        // WebKit (macOS WKWebView, Linux WebKitGTK) only supports MP4/MOV/M4V
        // containers and a limited set of codecs natively.
        const codec = metadata.video_codec.toLowerCase();
        const format = metadata.format.toLowerCase();

        // Check container: ffprobe returns e.g. "mov,mp4,m4a,3gp,3g2,mj2" for MP4
        const supportedContainers = ['mp4', 'mov', 'm4v', 'm4a', '3gp'];
        const hasUnsupportedContainer = !supportedContainers.some((c) => format.includes(c));

        // Check codec: HEVC works natively on macOS (AVFoundation) but NOT on Linux (WebKitGTK)
        const isMacOS = /Mac/.test(navigator.platform);
        const problematicCodecs = isMacOS
          ? ['vp9', 'vp8', 'av1', 'theora']
          : ['vp9', 'vp8', 'av1', 'hevc', 'h265', 'theora'];
        const hasProblematicCodec = problematicCodecs.some((c) => codec.includes(c));

        const needsPreview = hasUnsupportedContainer || hasProblematicCodec;

        const diagInfo = `codec=${metadata.video_codec}, container=${metadata.format}, needsPreview=${needsPreview}, platform=${isMacOS ? 'macOS' : 'other'}`;
        console.warn(`[PROCESSING] ${diagInfo}`);
        addMessage('system', `[DEV] ${diagInfo}`);

        if (needsPreview) {
          // Video cannot play natively in the webview — generate H.264 preview.
          // Strategy: generate H.264 preview WITHOUT audio (-an) + separate WAV audio
          // + thumbnail as fallback. Video and audio are played via separate elements
          // and synced with JavaScript. If <video> still crashes, VideoPlayer
          // auto-falls back to the static thumbnail.

          // For large files, ask user whether to generate preview (costly in time/space)
          const fileSizeMB = metadata.file_size / 1_000_000;
          let shouldGeneratePreview = true;

          if (previewSizeThreshold > 0 && fileSizeMB > previewSizeThreshold) {
            // Stop showing loading spinner while waiting for user input
            setIsLoadingVideo(false);
            shouldGeneratePreview = await requestPreviewConfirm({
              filename: metadata.filename,
              fileSizeMB,
              codec: metadata.video_codec,
            });
            setIsLoadingVideo(true);
          }

          if (shouldGeneratePreview) {
            addMessage('system', `${metadata.filename} - Generating preview...`);
            setIsGeneratingPreview(true);
            try {
              // Generate video preview (H.264 no audio), audio preview (WAV),
              // and thumbnail (JPEG) in parallel
              const [previewPath, audioPath, thumbPath] = await Promise.all([
                invoke<string>('generate_video_preview', {
                  inputPath: path,
                  videoCodec: metadata.video_codec,
                  containerFormat: metadata.format,
                }),
                metadata.has_audio
                  ? invoke<string>('generate_audio_preview', { inputPath: path })
                  : Promise.resolve(null),
                invoke<string>('generate_video_thumbnail', {
                  inputPath: path,
                }),
              ]);

              // Load thumbnail as blob URL (fallback for when <video> fails)
              const fileData = await readFile(thumbPath);
              const blob = new Blob([fileData], { type: 'image/jpeg' });
              const thumbUrl = URL.createObjectURL(blob);
              setThumbnailSrc(thumbUrl);

              // Load audio preview via asset protocol (streaming, no RAM copy)
              if (audioPath) {
                const audioSrcUrl = loadVideoSrc(audioPath);
                setAudioSrc(audioSrcUrl);
              }

              // Load H.264 no-audio preview via asset protocol
              const previewSrcUrl = loadVideoSrc(previewPath);
              setVideoSrc(previewSrcUrl);
              setIsUsingPreview(true);
              console.warn(
                `[PROCESSING] Preview loaded: video=${previewSrcUrl}, audio=${audioPath ? 'yes' : 'no'}`,
              );
              addMessage(
                'system',
                `${metadata.filename} loaded (preview mode — output will use original quality)`,
              );
            } catch (previewErr) {
              // All generation failed — show error but allow FFmpeg usage
              console.error('[PROCESSING] Preview generation failed:', previewErr);
              setVideoError(
                `Cannot preview this video (${metadata.video_codec} codec). ` +
                  'Please make sure FFmpeg is installed. ' +
                  'You can still process the file with FFmpeg commands below.',
              );
              addMessage(
                'system',
                `Preview generation failed: ${previewErr}. You can still apply FFmpeg commands to this file.`,
              );
            } finally {
              setIsGeneratingPreview(false);
            }
          } else {
            // User chose thumbnail-only mode for large file
            addMessage('system', `${metadata.filename} - Generating thumbnail...`);
            setIsGeneratingPreview(true);
            try {
              const thumbPath = await invoke<string>('generate_video_thumbnail', {
                inputPath: path,
              });
              const fileData = await readFile(thumbPath);
              const blob = new Blob([fileData], { type: 'image/jpeg' });
              const thumbUrl = URL.createObjectURL(blob);
              setThumbnailSrc(thumbUrl);
              setIsUsingPreview(true);
              addMessage(
                'system',
                `${metadata.filename} loaded (thumbnail only — output will use original quality)`,
              );
            } catch (thumbErr) {
              setVideoError(
                `Cannot preview this video (${metadata.video_codec} codec). ` +
                  'Please make sure FFmpeg is installed. ' +
                  'You can still process the file with FFmpeg commands below.',
              );
              addMessage(
                'system',
                `Thumbnail generation failed: ${thumbErr}. You can still apply FFmpeg commands to this file.`,
              );
            } finally {
              setIsGeneratingPreview(false);
            }
          }
        } else {
          // Standard codec in supported container: stream directly via asset protocol
          const videoSrcUrl = loadVideoSrc(path);
          setVideoSrc(videoSrcUrl);
          console.warn(`[PROCESSING] Direct streaming: ${videoSrcUrl}`);
          addMessage('system', `${metadata.filename} loaded`);
        }
      } catch (error) {
        console.error('Failed to load video metadata:', error);
        setVideoMetadata(null);
        setVideoError(String(error));
        addMessage('system', `Error: ${error}`);
      } finally {
        setIsLoadingVideo(false);
      }
    },
    [
      addMessage,
      getDirectoryFromPath,
      loadVideoSrc,
      revokePreviousVideoSrc,
      videoSrc,
      thumbnailSrc,
      previewSizeThreshold,
      requestPreviewConfirm,
    ],
  );

  // Select video file
  const selectVideo = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Video',
            extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts', 'mts'],
          },
        ],
      });

      if (selected && typeof selected === 'string') {
        await loadVideo(selected);
      }
    } catch (error) {
      console.error('Failed to select video:', error);
    }
  }, [loadVideo]);

  // Select output directory for processed files
  const selectOutputDirectory = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: outputDirectory || (videoPath ? getDirectoryFromPath(videoPath) : undefined),
      });

      if (selected && typeof selected === 'string') {
        setOutputDirectory(selected);
      }
    } catch (error) {
      console.error('Failed to select output directory:', error);
    }
  }, [outputDirectory, videoPath, getDirectoryFromPath]);

  // Media attachment interface from Rust
  interface AttachmentInfoResult {
    path: string;
    filename: string;
    kind: 'image' | 'video' | 'subtitle' | 'other';
    width?: number;
    height?: number;
    size: number;
    format: string;
  }

  // Attach files (image/video/subtitle) by file paths
  const attachImages = useCallback(async (paths: string[]) => {
    const newAttachments: ChatAttachment[] = [];

    for (const path of paths) {
      try {
        const info = await invoke<AttachmentInfoResult>('get_processing_attachment_info', { path });
        let previewUrl: string | undefined;

        if (info.kind === 'image') {
          // Read image as blob for preview
          const fileData = await readFile(path);
          const blob = new Blob([fileData]);
          previewUrl = URL.createObjectURL(blob);
        }

        newAttachments.push({
          id: crypto.randomUUID(),
          path: info.path,
          kind: info.kind,
          name: info.filename,
          width: info.width,
          height: info.height,
          size: info.size,
          format: info.format,
          previewUrl,
        });
      } catch (error) {
        console.error(`Failed to attach file ${path}:`, error);
      }
    }

    if (newAttachments.length > 0) {
      setAttachedImages((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  // Remove a single attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachedImages((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // Clear all attachments
  const clearAttachments = useCallback(() => {
    setAttachedImages((prev) => {
      for (const a of prev) {
        if (a.previewUrl) {
          URL.revokeObjectURL(a.previewUrl);
        }
      }
      return [];
    });
  }, []);

  // Send chat message and auto-execute
  const sendMessage = useCallback(
    async (content: string) => {
      if (!videoMetadata || isGenerating || !videoPath) return;

      // Capture current attachments before clearing
      const currentAttachments = [...attachedImages];

      // Add user message with attachments
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsGenerating(true);
      setStatus('generating');

      // Clear attachments after capturing
      if (currentAttachments.length > 0) {
        setAttachedImages([]);
      }

      try {
        // Build attachment info for backend
        const attachmentInfos =
          currentAttachments.length > 0
            ? currentAttachments.map((a) => ({
                path: a.path,
                filename: a.name,
                kind: a.kind,
                width: a.width ?? null,
                height: a.height ?? null,
                size: a.size,
                format: a.format,
              }))
            : null;

        const result = await invoke<FFmpegCommandResult>('generate_processing_command', {
          inputPath: videoPath,
          userPrompt: content,
          timelineStart: selection?.start ?? null,
          timelineEnd: selection?.end ?? null,
          metadata: videoMetadata,
          attachments: attachmentInfos,
          outputDir: outputDirectory || null,
        });

        // Add assistant message with explanation
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            result.explanation +
            (result.warnings.length > 0 ? `\n\n${result.warnings.join('\n')}` : ''),
          timestamp: new Date().toISOString(),
          command: result,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsGenerating(false);

        // Auto-execute the command
        setStatus('processing');
        setIsProcessing(true);
        setProgress(null);
        setCompletedOutputPath(null);

        const jobId = crypto.randomUUID();
        setCurrentJobId(jobId);

        // Save job to history
        await invoke('save_processing_job', {
          id: jobId,
          inputPath: videoPath,
          outputPath: result.output_path,
          taskType: 'custom',
          userPrompt: content,
          ffmpegCommand: result.command,
        });

        await invoke('execute_ffmpeg_command', {
          jobId,
          commandArgs: result.command_args,
          inputPath: videoPath,
          outputPath: result.output_path,
        });

        // Update job status
        await invoke('update_processing_job', {
          id: jobId,
          status: 'completed',
          progress: 100,
          errorMessage: null,
        });

        setStatus('completed');
        setCompletedOutputPath(result.output_path);

        // Add complete message with output path
        const filename = result.output_path.split('/').pop() || 'Output ready';
        addMessage('complete', filename, { outputPath: result.output_path });

        await loadHistory();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setStatus('error');
        addMessage('system', `Failed: ${errorMessage}`);
      } finally {
        setIsGenerating(false);
        setIsProcessing(false);
        setProgress(null);
        setCurrentJobId(null);
      }
    },
    [
      videoPath,
      videoMetadata,
      selection,
      isGenerating,
      attachedImages,
      addMessage,
      loadHistory,
      outputDirectory,
    ],
  );

  // Generate command from quick action
  const generateCommand = useCallback(
    async (taskType: ProcessingTaskType, options?: Record<string, unknown>) => {
      if (!videoMetadata) return;

      setIsGenerating(true);
      setStatus('generating');

      try {
        const result = await invoke<FFmpegCommandResult>('generate_quick_action_command', {
          inputPath: videoPath,
          taskType,
          options: options ?? {},
          timelineStart: selection?.start ?? null,
          timelineEnd: selection?.end ?? null,
          metadata: videoMetadata,
          outputDir: outputDirectory || null,
        });

        setGeneratedCommand(result);
        setStatus('ready');

        // Add to chat
        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `**${taskType.replace('_', ' ').toUpperCase()}**\n\n${result.explanation}`,
          timestamp: new Date().toISOString(),
          command: result,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setStatus('error');
        console.error('Failed to generate command:', errorMessage);
      } finally {
        setIsGenerating(false);
      }
    },
    [videoPath, videoMetadata, selection, outputDirectory],
  );

  // Execute FFmpeg command
  const executeCommand = useCallback(
    async (command?: FFmpegCommandResult) => {
      const cmdToExecute = command ?? generatedCommand;
      if (!cmdToExecute || !videoPath) return;

      setStatus('processing');
      setIsProcessing(true);
      setProgress(null);
      setCompletedOutputPath(null);

      const jobId = crypto.randomUUID();
      setCurrentJobId(jobId);

      try {
        // Save job to history
        await invoke('save_processing_job', {
          id: jobId,
          inputPath: videoPath,
          outputPath: cmdToExecute.output_path,
          taskType: 'custom',
          userPrompt: messages.find((m) => m.role === 'user')?.content ?? null,
          ffmpegCommand: cmdToExecute.command,
        });

        await invoke('execute_ffmpeg_command', {
          jobId,
          commandArgs: cmdToExecute.command_args,
          inputPath: videoPath,
          outputPath: cmdToExecute.output_path,
        });

        // Update job status
        await invoke('update_processing_job', {
          id: jobId,
          status: 'completed',
          progress: 100,
          errorMessage: null,
        });

        setStatus('completed');
        setCompletedOutputPath(cmdToExecute.output_path);
        setGeneratedCommand(null);

        // Add complete message with output path
        const filename = cmdToExecute.output_path.split('/').pop() || 'Output ready';
        addMessage('complete', filename, { outputPath: cmdToExecute.output_path });

        await loadHistory();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setStatus('error');
        addMessage('system', `Failed: ${errorMessage}`);

        // Update job with error
        await invoke('update_processing_job', {
          id: jobId,
          status: 'failed',
          progress: 0,
          errorMessage: errorMessage,
        });

        console.error('FFmpeg execution failed:', errorMessage);
      } finally {
        setIsProcessing(false);
        setProgress(null);
        setCurrentJobId(null);
        await loadHistory();
      }
    },
    [generatedCommand, videoPath, messages, addMessage, loadHistory],
  );

  // Cancel processing
  const cancelProcessing = useCallback(async () => {
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
      } catch (error) {
        console.error('Failed to cancel:', error);
      }
    }
    setStatus('idle');
    setIsProcessing(false);
    setProgress(null);
    setCurrentJobId(null);
    await loadHistory();
  }, [currentJobId, addMessage, loadHistory]);

  // Clear generated command
  const clearCommand = useCallback(() => {
    setGeneratedCommand(null);
    setStatus('idle');
  }, []);

  // Open output folder in file manager
  const openOutputFolder = useCallback(async () => {
    if (completedOutputPath) {
      try {
        await revealItemInDir(completedOutputPath);
      } catch (error) {
        console.error('Failed to open folder:', error);
      }
    }
  }, [completedOutputPath]);

  // Delete job from history
  const deleteJob = useCallback(async (id: string) => {
    try {
      await invoke('delete_processing_job', { id });
      setHistory((prev) => prev.filter((job) => job.id !== id));
    } catch (error) {
      console.error('Failed to delete job:', error);
    }
  }, []);

  // Clear all history
  const clearHistory = useCallback(async () => {
    try {
      await invoke('clear_processing_history');
      setHistory([]);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }, []);

  // Load presets
  const loadPresets = useCallback(async () => {
    try {
      const savedPresets = await invoke<ProcessingPreset[]>('get_processing_presets');
      setPresets(savedPresets);
    } catch (error) {
      console.error('Failed to load presets:', error);
    }
  }, []);

  // Save preset
  const savePreset = useCallback(
    async (name: string, description?: string) => {
      if (!generatedCommand) return;

      try {
        await invoke('save_processing_preset', {
          name,
          description,
          command: generatedCommand.command,
          taskType: 'custom',
        });
        await loadPresets();
      } catch (error) {
        console.error('Failed to save preset:', error);
      }
    },
    [generatedCommand, loadPresets],
  );

  // Delete preset
  const deletePreset = useCallback(async (id: string) => {
    try {
      await invoke('delete_processing_preset', { id });
      setPresets((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Failed to delete preset:', error);
    }
  }, []);

  // Apply preset
  const applyPreset = useCallback(
    async (preset: ProcessingPreset) => {
      await sendMessage(preset.prompt_template);
    },
    [sendMessage],
  );

  // Batch operations
  const addBatchFile = useCallback((path: string) => {
    setBatchFiles((prev) => [...prev, path]);
  }, []);

  const removeBatchFile = useCallback((path: string) => {
    setBatchFiles((prev) => prev.filter((p) => p !== path));
  }, []);

  const clearBatch = useCallback(() => {
    setBatchFiles([]);
  }, []);

  const processBatch = useCallback(async () => {
    if (!generatedCommand || batchFiles.length === 0) return;

    // Process each file with the same command template
    for (const file of batchFiles) {
      try {
        await invoke('execute_ffmpeg_batch', {
          commandArgs: generatedCommand.command_args,
          inputPath: file,
        });
      } catch (error) {
        console.error(`Batch processing failed for ${file}:`, error);
      }
    }

    await loadHistory();
  }, [generatedCommand, batchFiles, loadHistory]);

  // Reset all state
  const reset = useCallback(() => {
    setVideoPath(null);
    setVideoSrc(null);
    setAudioSrc(null);
    setThumbnailSrc(null);
    setVideoMetadata(null);
    setVideoError(null);
    setDuration(0);
    setCurrentTime(0);
    setSelection(null);
    setStatus('idle');
    setIsProcessing(false);
    setCurrentJob(null);
    setCurrentJobId(null);
    setProgress(null);
    setGeneratedCommand(null);
    setCompletedOutputPath(null);
    setMessages([]);
    setOutputDirectory('');
    setBatchFiles([]);
  }, []);

  return (
    <ProcessingContext.Provider
      value={{
        videoPath,
        videoSrc,
        audioSrc,
        thumbnailSrc,
        videoMetadata,
        isLoadingVideo,
        isGeneratingPreview,
        isUsingPreview,
        videoError,
        duration,
        pendingPreviewConfirm,
        confirmPreview,
        previewSizeThreshold,
        setPreviewSizeThreshold,
        currentTime,
        selection,
        status,
        isProcessing,
        currentJob,
        currentJobId,
        progress,
        generatedCommand,
        completedOutputPath,
        messages,
        isGenerating,
        outputDirectory,
        attachedImages,
        history,
        presets,
        batchFiles,
        selectVideo,
        loadVideo,
        setVideoError,
        setCurrentTime,
        setDuration,
        setSelection,
        addMessage,
        sendMessage,
        selectOutputDirectory,
        generateCommand,
        attachImages,
        removeAttachment,
        clearAttachments,
        executeCommand,
        cancelProcessing,
        clearCommand,
        openOutputFolder,
        loadHistory,
        deleteJob,
        clearHistory,
        loadPresets,
        savePreset,
        deletePreset,
        applyPreset,
        addBatchFile,
        removeBatchFile,
        clearBatch,
        processBatch,
        reset,
      }}
    >
      {children}
    </ProcessingContext.Provider>
  );
}

export function useProcessing() {
  const context = useContext(ProcessingContext);
  if (!context) {
    throw new Error('useProcessing must be used within ProcessingProvider');
  }
  return context;
}
