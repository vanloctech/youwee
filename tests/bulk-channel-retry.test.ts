import { describe, expect, test } from 'bun:test';
import { prepareFailedBulkChannelRetry } from '@/lib/bulk-channel-retry';

describe('bulk channel retry', () => {
  test('moves only failed channels to the retry tail', () => {
    const result = prepareFailedBulkChannelRetry([
      { url: 'completed', status: 'completed' },
      { url: 'failed-a', status: 'failed', error: 'timeout' },
      { url: 'skipped', status: 'skipped' },
      { url: 'failed-b', status: 'failed', error: 'network', retryCount: 1 },
    ]);

    expect(result.retryStartIndex).toBe(2);
    expect(result.failedCount).toBe(2);
    expect(result.jobs.map((job) => job.url)).toEqual([
      'completed',
      'skipped',
      'failed-a',
      'failed-b',
    ]);
    expect(result.jobs.slice(0, 2).map((job) => job.status)).toEqual(['completed', 'skipped']);
    expect(result.jobs.slice(2).map((job) => job.status)).toEqual(['pending', 'pending']);
    expect(result.jobs.slice(2).map((job) => job.retryCount)).toEqual([1, 2]);
    expect(result.jobs.slice(2).map((job) => job.error)).toEqual([undefined, undefined]);
  });

  test('keeps settled jobs unchanged when nothing failed', () => {
    const jobs = [
      { url: 'completed', status: 'completed' },
      { url: 'skipped', status: 'skipped' },
    ];
    const result = prepareFailedBulkChannelRetry(jobs);
    expect(result.failedCount).toBe(0);
    expect(result.retryStartIndex).toBe(2);
    expect(result.jobs).toEqual(jobs);
  });
});
