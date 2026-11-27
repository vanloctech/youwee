import { describe, expect, test } from 'bun:test';
import { notifyCreatorQueueChanged, watchCreatorQueue } from '@/lib/creator-queue-events';

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe('creator queue refresh', () => {
  test('reads once on mount, stays idle, and observes a fast completed job', async () => {
    let status = 'idle';
    const observed: string[] = [];
    const stop = watchCreatorQueue(async () => {
      observed.push(status);
    });
    try {
      await flush();
      expect(observed).toEqual(['idle']);
      status = 'pending';
      notifyCreatorQueueChanged();
      status = 'completed';
      notifyCreatorQueueChanged();
      await flush();
      expect(observed.at(-1)).toBe('completed');
      const reads = observed.length;
      await flush();
      expect(observed.length).toBe(reads);
    } finally {
      stop();
    }
  });

  test('coalesces changes during an outstanding read without losing the final state', async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    let concurrent = 0;
    let peak = 0;
    const stop = watchCreatorQueue(async () => {
      reads++;
      peak = Math.max(peak, ++concurrent);
      if (reads === 1) await pending;
      concurrent--;
    });
    try {
      for (let i = 0; i < 50; i++) notifyCreatorQueueChanged();
      expect(reads).toBe(1);
      release();
      await flush();
      expect(reads).toBe(2);
      expect(peak).toBe(1);
    } finally {
      release();
      stop();
    }
  });

  test('unmount cancels a queued refresh and unregisters the listener', async () => {
    let release = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const stop = watchCreatorQueue(async () => {
      reads++;
      await pending;
    });
    notifyCreatorQueueChanged();
    stop();
    release();
    await flush();
    notifyCreatorQueueChanged();
    await flush();
    expect(reads).toBe(1);
  });
});
