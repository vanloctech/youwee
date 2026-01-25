import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  VideoMetadata,
  TimelineSelection,
  FFmpegCommandResult,
  ProcessingJob,
  ProcessingProgress,
  ProcessingPreset,
  ChatMessage,
  ProcessingStatus,
  ProcessingTaskType,
} from '@/lib/types';

interface ProcessingContextValue {
  // Video state
  videoPath: string | null;
  videoMetadata: VideoMetadata | null;
  isLoadingVideo: boolean;
  
  // Timeline
  currentTime: number;
  selection: TimelineSelection | null;
  
  // Processing
  status: ProcessingStatus;
  currentJob: ProcessingJob | null;
  progress: ProcessingProgress | null;
  generatedCommand: FFmpegCommandResult | null;
  
  // Chat
  messages: ChatMessage[];
  isGenerating: boolean;
  
  // History & Presets
  history: ProcessingJob[];
  presets: ProcessingPreset[];
  
  // Batch
  batchFiles: string[];
  
  // Actions
  selectVideo: () => Promise<void>;
  loadVideo: (path: string) => Promise<void>;
  setCurrentTime: (time: number) => void;
  setSelection: (selection: TimelineSelection | null) => void;
  
  // AI Actions
  sendMessage: (content: string) => Promise<void>;
  generateCommand: (taskType: ProcessingTaskType, options?: Record<string, unknown>) => Promise<void>;
  
  // Processing Actions
  executeCommand: () => Promise<void>;
  cancelProcessing: () => Promise<void>;
  clearCommand: () => void;
  
  // History Actions
  loadHistory: () => Promise<void>;
  deleteJob: (id: string) => Promise<void>;
  
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
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  
  // Timeline
  const [currentTime, setCurrentTime] = useState(0);
  const [selection, setSelection] = useState<TimelineSelection | null>(null);
  
  // Processing
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [currentJob, setCurrentJob] = useState<ProcessingJob | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [generatedCommand, setGeneratedCommand] = useState<FFmpegCommandResult | null>(null);
  
  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // History & Presets
  const [history, setHistory] = useState<ProcessingJob[]>([]);
  const [presets, setPresets] = useState<ProcessingPreset[]>([]);
  
  // Batch
  const [batchFiles, setBatchFiles] = useState<string[]>([]);
  
  // Refs
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Listen for processing progress events
  useEffect(() => {
    const setupListener = async () => {
      unlistenRef.current = await listen<ProcessingProgress>('processing-progress', (event) => {
        setProgress(event.payload);
        if (event.payload.percent >= 100) {
          setStatus('completed');
        }
      });
    };
    
    setupListener();
    
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  // Select video file
  const selectVideo = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Video',
          extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts', 'mts']
        }]
      });
      
      if (selected && typeof selected === 'string') {
        await loadVideo(selected);
      }
    } catch (error) {
      console.error('Failed to select video:', error);
    }
  }, []);

  // Load video and get metadata
  const loadVideo = useCallback(async (path: string) => {
    setIsLoadingVideo(true);
    setVideoPath(path);
    setSelection(null);
    setCurrentTime(0);
    setGeneratedCommand(null);
    setMessages([]);
    
    try {
      const metadata = await invoke<VideoMetadata>('get_video_metadata', { path });
      setVideoMetadata(metadata);
      
      // Add welcome message
      setMessages([{
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Video loaded: **${metadata.filename}**\n\n` +
          `- Duration: ${formatDuration(metadata.duration)}\n` +
          `- Resolution: ${metadata.width}x${metadata.height}\n` +
          `- Format: ${metadata.format.toUpperCase()}\n` +
          `- Size: ${formatFileSize(metadata.file_size)}\n\n` +
          `What would you like to do with this video?`,
        timestamp: new Date().toISOString(),
      }]);
    } catch (error) {
      console.error('Failed to load video metadata:', error);
      setVideoMetadata(null);
    } finally {
      setIsLoadingVideo(false);
    }
  }, []);

  // Send chat message
  const sendMessage = useCallback(async (content: string) => {
    if (!videoMetadata || isGenerating) return;
    
    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setStatus('generating');
    
    try {
      const result = await invoke<FFmpegCommandResult>('generate_processing_command', {
        inputPath: videoPath,
        userPrompt: content,
        timelineStart: selection?.start ?? null,
        timelineEnd: selection?.end ?? null,
        metadata: videoMetadata,
      });
      
      setGeneratedCommand(result);
      setStatus('ready');
      
      // Add assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.explanation + 
          (result.warnings.length > 0 ? `\n\n⚠️ ${result.warnings.join('\n')}` : ''),
        timestamp: new Date().toISOString(),
        command: result,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus('error');
      
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Sorry, I couldn't generate a command: ${errorMessage}`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    } finally {
      setIsGenerating(false);
    }
  }, [videoPath, videoMetadata, selection, isGenerating]);

  // Generate command from quick action
  const generateCommand = useCallback(async (
    taskType: ProcessingTaskType,
    options?: Record<string, unknown>
  ) => {
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
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus('error');
      console.error('Failed to generate command:', errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [videoPath, videoMetadata, selection]);

  // Execute FFmpeg command
  const executeCommand = useCallback(async () => {
    if (!generatedCommand) return;
    
    setStatus('processing');
    setProgress(null);
    
    const jobId = crypto.randomUUID();
    
    try {
      await invoke('execute_ffmpeg_command', {
        jobId,
        command: generatedCommand.command,
        inputPath: videoPath,
        outputPath: generatedCommand.output_path,
      });
      
      setStatus('completed');
      await loadHistory();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setStatus('error');
      console.error('FFmpeg execution failed:', errorMessage);
    }
  }, [generatedCommand, videoPath]);

  // Cancel processing
  const cancelProcessing = useCallback(async () => {
    if (currentJob) {
      try {
        await invoke('cancel_ffmpeg', { jobId: currentJob.id });
      } catch (error) {
        console.error('Failed to cancel:', error);
      }
    }
    setStatus('idle');
    setProgress(null);
  }, [currentJob]);

  // Clear generated command
  const clearCommand = useCallback(() => {
    setGeneratedCommand(null);
    setStatus('idle');
  }, []);

  // Load processing history
  const loadHistory = useCallback(async () => {
    try {
      const jobs = await invoke<ProcessingJob[]>('get_processing_history', { limit: 50 });
      setHistory(jobs);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, []);

  // Delete job from history
  const deleteJob = useCallback(async (id: string) => {
    try {
      await invoke('delete_processing_job', { id });
      setHistory(prev => prev.filter(job => job.id !== id));
    } catch (error) {
      console.error('Failed to delete job:', error);
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
  const savePreset = useCallback(async (name: string, description?: string) => {
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
  }, [generatedCommand, loadPresets]);

  // Delete preset
  const deletePreset = useCallback(async (id: string) => {
    try {
      await invoke('delete_processing_preset', { id });
      setPresets(prev => prev.filter(p => p.id !== id));
    } catch (error) {
      console.error('Failed to delete preset:', error);
    }
  }, []);

  // Apply preset
  const applyPreset = useCallback(async (preset: ProcessingPreset) => {
    await sendMessage(preset.prompt_template);
  }, [sendMessage]);

  // Batch operations
  const addBatchFile = useCallback((path: string) => {
    setBatchFiles(prev => [...prev, path]);
  }, []);

  const removeBatchFile = useCallback((path: string) => {
    setBatchFiles(prev => prev.filter(p => p !== path));
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
          command: generatedCommand.command,
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
    setVideoMetadata(null);
    setCurrentTime(0);
    setSelection(null);
    setStatus('idle');
    setCurrentJob(null);
    setProgress(null);
    setGeneratedCommand(null);
    setMessages([]);
    setBatchFiles([]);
  }, []);

  return (
    <ProcessingContext.Provider
      value={{
        videoPath,
        videoMetadata,
        isLoadingVideo,
        currentTime,
        selection,
        status,
        currentJob,
        progress,
        generatedCommand,
        messages,
        isGenerating,
        history,
        presets,
        batchFiles,
        selectVideo,
        loadVideo,
        setCurrentTime,
        setSelection,
        sendMessage,
        generateCommand,
        executeCommand,
        cancelProcessing,
        clearCommand,
        loadHistory,
        deleteJob,
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

// Utility functions
function formatDuration(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${bytes} B`;
}
