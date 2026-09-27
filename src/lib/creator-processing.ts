import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { CreatorProcessingSettings } from '@/lib/types';

export type { CreatorProcessingSettings } from '@/lib/types';

const STORAGE_KEY = 'youwee-creator-processing';
export interface CreatorQueueItem {
  id: string;
  inputPath: string;
  title?: string;
  settings: CreatorProcessingSettings;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  channelUrl?: string;
  videoId?: string;
}

export const DEFAULT_CREATOR_PROCESSING_SETTINGS: CreatorProcessingSettings = {
  mode: 'none',
  rightFolder: '',
  outputFolder: '',
  splitBy: 'duration',
  partSeconds: 60,
  partCount: 3,
  encoder: 'libx264',
  deleteInputAfterSuccess: true,
};

export function loadCreatorProcessingSettings(): CreatorProcessingSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_CREATOR_PROCESSING_SETTINGS;
    const saved = JSON.parse(stored) as Partial<CreatorProcessingSettings>;
    return {
      ...DEFAULT_CREATOR_PROCESSING_SETTINGS,
      ...saved,
      deleteInputAfterSuccess: saved.deleteInputAfterSuccess !== false,
    };
  } catch {
    return DEFAULT_CREATOR_PROCESSING_SETTINGS;
  }
}

export function saveCreatorProcessingSettings(settings: CreatorProcessingSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function withCreatorOutputFolder(
  settings: CreatorProcessingSettings,
  channelOutputFolder: string,
): CreatorProcessingSettings {
  return { ...settings, outputFolder: `${channelOutputFolder}/Edited` };
}

export async function pickCreatorFolder(defaultPath?: string): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false, defaultPath });
  return typeof selected === 'string' ? selected : null;
}

export async function processCreatorVideo(
  inputPath: string,
  title: string | undefined,
  settings = loadCreatorProcessingSettings(),
): Promise<string[]> {
  if (settings.mode === 'none') return [];
  const result = await invoke<{ outputPaths: string[] }>('process_creator_video', {
    inputPath,
    options: {
      mode: settings.mode,
      rightFolder: settings.rightFolder || null,
      outputFolder: settings.outputFolder,
      splitBy: settings.splitBy,
      partSeconds: settings.partSeconds,
      partCount: settings.partCount,
      title: title || null,
      encoder: settings.encoder,
      rightPath: null,
      deleteInputAfterSuccess: settings.deleteInputAfterSuccess,
    },
  });
  return result.outputPaths;
}

let drainingQueue = false;
let creatorQueueStopRequested = false;

export async function listCreatorJobs(): Promise<CreatorQueueItem[]> {
  return invoke<CreatorQueueItem[]>('list_creator_jobs');
}

export async function retryCreatorJob(id: string): Promise<void> {
  await invoke('set_creator_job_status', { id, status: 'pending', errorMessage: null });
  void resumeCreatorProcessingQueue();
}

export async function retryCreatorJobs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) {
    await invoke('set_creator_job_status', { id, status: 'pending', errorMessage: null });
  }
  void resumeCreatorProcessingQueue();
}

export async function deleteCreatorJobs(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  return invoke<number>('delete_creator_jobs', { ids });
}

export async function retryAllCreatorJobs(): Promise<number> {
  const count = await invoke<number>('retry_failed_creator_jobs');
  if (count > 0) void resumeCreatorProcessingQueue();
  return count;
}

export async function stopCreatorProcessingQueue(): Promise<number> {
  creatorQueueStopRequested = true;
  return invoke<number>('stop_creator_processing_queue');
}

export async function pauseCreatorProcessingQueue(): Promise<number> {
  creatorQueueStopRequested = true;
  return invoke<number>('pause_creator_processing_queue');
}

export async function resumeCreatorProcessingQueue(): Promise<void> {
  if (drainingQueue) return;
  creatorQueueStopRequested = false;
  await invoke('start_creator_processing_queue');
  drainingQueue = true;
  try {
    // A prior running job is restarted after an app crash. Finished parts are skipped by Rust.
    while (!creatorQueueStopRequested) {
      const item = await invoke<CreatorQueueItem | null>('next_creator_job');
      if (!item) break;
      await invoke('set_creator_job_status', {
        id: item.id,
        status: 'running',
        errorMessage: null,
      });
      try {
        const outputPaths = await processCreatorVideo(item.inputPath, item.title, item.settings);
        if (item.channelUrl && item.videoId && outputPaths.length > 0) {
          await invoke('complete_channel_creator_processing', {
            channelUrl: item.channelUrl,
            videoId: item.videoId,
            outputPaths,
          });
        }
        await invoke('set_creator_job_status', {
          id: item.id,
          status: 'completed',
          errorMessage: null,
        });
      } catch (error) {
        console.error('Creator processing failed:', error);
        if (!creatorQueueStopRequested && !String(error).toLowerCase().includes('cancel')) {
          await invoke('set_creator_job_status', {
            id: item.id,
            status: 'failed',
            errorMessage: String(error),
          });
        }
      }
    }
  } finally {
    drainingQueue = false;
  }
}

export async function enqueueCreatorVideo(
  inputPath: string,
  title: string | undefined,
  settings = loadCreatorProcessingSettings(),
  origin?: { channelUrl: string; videoId: string },
): Promise<void> {
  if (settings.mode === 'none' || !settings.outputFolder) return;
  await invoke('enqueue_creator_job', {
    inputPath,
    title: title || null,
    settings: {
      mode: settings.mode,
      rightFolder: settings.rightFolder || null,
      outputFolder: settings.outputFolder,
      splitBy: settings.splitBy,
      partSeconds: settings.partSeconds,
      partCount: settings.partCount,
      title: title || null,
      encoder: settings.encoder,
      rightPath: null,
      deleteInputAfterSuccess: settings.deleteInputAfterSuccess,
    },
    channelUrl: origin?.channelUrl ?? null,
    videoId: origin?.videoId ?? null,
  });
  void resumeCreatorProcessingQueue();
}
