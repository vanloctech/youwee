import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import type {
  FFmpegCommandResult,
  ProcessingJob,
  ProcessingPreset,
  ProcessingProgress,
  ProcessingTaskType,
  VideoMetadata,
} from '@/lib/types';

export interface ProcessingAttachmentInfoResult {
  path: string;
  filename: string;
  kind: 'image' | 'video' | 'subtitle' | 'other';
  width?: number;
  height?: number;
  size: number;
  format: string;
}

export function onProcessingProgress(
  handler: (event: { payload: ProcessingProgress }) => void,
): Promise<UnlistenFn> {
  return listen<ProcessingProgress>('processing-progress', handler);
}

export async function readBinaryFile(path: string): Promise<Uint8Array> {
  return readFile(path);
}

export async function pickVideoFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: 'Video',
        extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv', 'm4v', 'ts', 'mts'],
      },
    ],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function pickProcessingOutputDirectory(defaultPath?: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    defaultPath,
  });
  return typeof selected === 'string' ? selected : null;
}

export async function getVideoMetadata(path: string): Promise<VideoMetadata> {
  return invoke<VideoMetadata>('get_video_metadata', { path });
}

export async function generateVideoPreview(
  inputPath: string,
  videoCodec: string,
  containerFormat: string,
) {
  return invoke<string>('generate_video_preview', { inputPath, videoCodec, containerFormat });
}

export async function generateAudioPreview(inputPath: string) {
  return invoke<string>('generate_audio_preview', { inputPath });
}

export async function generateVideoThumbnail(inputPath: string) {
  return invoke<string>('generate_video_thumbnail', { inputPath });
}

export async function getProcessingAttachmentInfo(
  path: string,
): Promise<ProcessingAttachmentInfoResult> {
  return invoke<ProcessingAttachmentInfoResult>('get_processing_attachment_info', { path });
}

export async function generateProcessingCommand(input: {
  inputPath: string;
  userPrompt: string;
  timelineStart: number | null;
  timelineEnd: number | null;
  metadata: VideoMetadata;
  attachments: Array<{
    path: string;
    filename: string;
    kind: string;
    width: number | null;
    height: number | null;
    size: number;
    format: string;
  }> | null;
  outputDir: string | null;
}): Promise<FFmpegCommandResult> {
  return invoke<FFmpegCommandResult>('generate_processing_command', input);
}

export async function saveProcessingJob(input: {
  id: string;
  inputPath: string;
  outputPath: string;
  taskType: string;
  userPrompt: string | null;
  ffmpegCommand: string;
}): Promise<void> {
  await invoke('save_processing_job', input);
}

export async function executeFfmpegCommand(input: {
  jobId: string;
  commandArgs: string[];
  inputPath: string;
  outputPath: string;
}): Promise<void> {
  await invoke('execute_ffmpeg_command', input);
}

export async function updateProcessingJob(input: {
  id: string;
  status: string;
  progress: number;
  errorMessage: string | null;
}): Promise<void> {
  await invoke('update_processing_job', input);
}

export async function getProcessingHistory(limit = 50): Promise<ProcessingJob[]> {
  return invoke<ProcessingJob[]>('get_processing_history', { limit });
}

export async function generateQuickActionCommand(input: {
  inputPath: string | null;
  taskType: ProcessingTaskType;
  options: Record<string, unknown>;
  timelineStart: number | null;
  timelineEnd: number | null;
  metadata: VideoMetadata;
  outputDir: string | null;
}): Promise<FFmpegCommandResult> {
  return invoke<FFmpegCommandResult>('generate_quick_action_command', input);
}

export async function cancelFfmpeg(jobId: string): Promise<void> {
  await invoke('cancel_ffmpeg', { jobId });
}

export async function revealOutputInFolder(path: string): Promise<void> {
  await revealItemInDir(path);
}

export async function deleteProcessingJob(id: string): Promise<void> {
  await invoke('delete_processing_job', { id });
}

export async function clearProcessingHistory(): Promise<void> {
  await invoke('clear_processing_history');
}

export async function getProcessingPresets(): Promise<ProcessingPreset[]> {
  return invoke<ProcessingPreset[]>('get_processing_presets');
}

export async function saveProcessingPreset(input: {
  name: string;
  description?: string;
  command: string;
  taskType: string;
}): Promise<void> {
  await invoke('save_processing_preset', input);
}

export async function deleteProcessingPreset(id: string): Promise<void> {
  await invoke('delete_processing_preset', { id });
}

export async function executeFfmpegBatch(input: {
  commandArgs: string[];
  inputPath: string;
}): Promise<void> {
  await invoke('execute_ffmpeg_batch', input);
}
