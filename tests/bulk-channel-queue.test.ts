import { afterEach, describe, expect, test } from 'bun:test';
import {
  loadPersistedBulkChannelState,
  pruneBulkBatchHistory,
  reconcileBulkJobsWithCreatorQueue,
} from '../src/contexts/channels/useChannelsController';

const originalLocalStorage = globalThis.localStorage;

function installStorage(values: Record<string, string>) {
  const storage = new Map(Object.entries(values));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe('bulk channel batch queue restore', () => {
  test('promotes the next queued batch when the previous batch finished before shutdown', () => {
    installStorage({
      'youwee-bulk-channel-state': JSON.stringify({
        running: true,
        jobs: [{ url: 'https://youtube.com/@finished', status: 'completed' }],
        currentIndex: 1,
        phase: 'prepare',
        error: null,
        options: {
          urls: ['https://youtube.com/@finished'],
          outputPath: 'D:/first',
          videoCount: 1,
          scanOrder: 'latest',
          youtubeContentType: 'videos',
          quality: 'best',
          format: 'mp4',
          videoCodec: 'auto',
          preferredFps: 'original',
          creatorSettings: {
            mode: 'none',
            rightFolder: '',
            outputFolder: '',
            splitBy: 'count',
            partSeconds: 60,
            partCount: 3,
            encoder: 'libx264',
            deleteInputAfterSuccess: true,
          },
        },
        autoRetryPerformed: false,
        queuedBatches: [
          {
            id: 'next',
            createdAt: 1,
            jobs: [{ url: 'https://youtube.com/@next', status: 'pending' }],
            options: {
              urls: ['https://youtube.com/@next'],
              outputPath: 'D:/second',
              videoCount: 1,
              scanOrder: 'popular',
              youtubeContentType: 'videos',
              quality: 'best',
              format: 'mp4',
              videoCodec: 'auto',
              preferredFps: 'original',
              creatorSettings: {
                mode: 'parts',
                rightFolder: '',
                outputFolder: '',
                splitBy: 'count',
                partSeconds: 60,
                partCount: 3,
                encoder: 'h264_nvenc',
                deleteInputAfterSuccess: false,
              },
            },
          },
        ],
      }),
    });

    const restored = loadPersistedBulkChannelState();

    expect(restored.phase).toBe('paused');
    expect(restored.jobs[0]?.url).toBe('https://youtube.com/@next');
    expect(restored.options?.outputPath).toBe('D:/second');
    expect(restored.options?.creatorSettings.deleteInputAfterSuccess).toBe(true);
    expect(restored.queuedBatches).toHaveLength(0);
    expect(restored.history).toHaveLength(1);
    expect(restored.history[0]?.jobs[0]?.status).toBe('completed');
  });

  test('keeps completed batch history when there is no active queue', () => {
    installStorage({
      'youwee-bulk-channel-state': JSON.stringify({
        phase: 'idle',
        history: [
          {
            id: 'history-1',
            createdAt: 1,
            finishedAt: Date.now(),
            jobs: [{ url: 'https://youtube.com/@done', status: 'completed' }],
            options: { outputPath: 'D:/archive' },
          },
        ],
      }),
    });

    const restored = loadPersistedBulkChannelState();

    expect(restored.history).toHaveLength(1);
    expect(restored.history[0]?.options.outputPath).toBe('D:/archive');
  });

  test('keeps only bulk batch history completed within the last 24 hours', () => {
    const now = 2 * 24 * 60 * 60 * 1_000;
    const recent = {
      id: 'recent',
      createdAt: now - 1_000,
      finishedAt: now - 1_000,
      jobs: [],
      options: {} as never,
    };
    const expired = {
      ...recent,
      id: 'expired',
      finishedAt: now - 24 * 60 * 60 * 1_000 - 1,
    };

    expect(pruneBulkBatchHistory([expired, recent], now)).toEqual([recent]);
  });

  test('distinguishes downloaded, editing, completed, and edit failures', () => {
    const baseJob = {
      url: 'https://youtube.com/@channel',
      status: 'downloaded' as const,
      videoIds: ['one'],
    };
    const creatorJob = {
      id: 'creator-1',
      inputPath: 'D:/video.mp4',
      settings: {} as never,
      status: 'pending' as const,
      channelUrl: baseJob.url,
      videoId: 'one',
      inputExists: true,
      outputPaths: [],
      outputExists: false,
    };

    expect(reconcileBulkJobsWithCreatorQueue([baseJob], [creatorJob])[0]?.status).toBe(
      'downloaded',
    );
    expect(
      reconcileBulkJobsWithCreatorQueue([baseJob], [{ ...creatorJob, status: 'running' }])[0]
        ?.status,
    ).toBe('editing');
    expect(
      reconcileBulkJobsWithCreatorQueue([baseJob], [{ ...creatorJob, status: 'completed' }])[0]
        ?.status,
    ).toBe('completed');
    const failed = reconcileBulkJobsWithCreatorQueue(
      [baseJob],
      [{ ...creatorJob, status: 'failed', errorMessage: 'NVENC failed' }],
    )[0];
    expect(failed?.status).toBe('edit_failed');
    expect(failed?.error).toBe('NVENC failed');
  });
});
