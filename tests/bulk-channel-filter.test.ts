import { describe, expect, test } from 'bun:test';
import {
  FIFTY_MINUTES_SECONDS,
  getBulkChannelScanLimit,
  isWithinBulkDurationLimit,
  MAX_BULK_CHANNEL_VIDEO_COUNT,
  normalizeBulkChannelVideoCount,
  selectBulkDurationCandidates,
} from '../src/lib/bulk-channel-filter';

describe('bulk channel duration filter', () => {
  test('is optional and uses a strict under-50-minute boundary', () => {
    expect(isWithinBulkDurationLimit(4_000, null)).toBe(true);
    expect(isWithinBulkDurationLimit(2_999, FIFTY_MINUTES_SECONDS)).toBe(true);
    expect(isWithinBulkDurationLimit(3_000, FIFTY_MINUTES_SECONDS)).toBe(false);
    expect(isWithinBulkDurationLimit(undefined, FIFTY_MINUTES_SECONDS)).toBe(false);
  });

  test('uses ten-entry scan pages by default and grows only with the requested count', () => {
    expect(getBulkChannelScanLimit(1, null)).toBe(10);
    expect(getBulkChannelScanLimit(1, FIFTY_MINUTES_SECONDS)).toBe(10);
    expect(getBulkChannelScanLimit(10, FIFTY_MINUTES_SECONDS)).toBe(10);
    expect(getBulkChannelScanLimit(20, FIFTY_MINUTES_SECONDS)).toBe(20);
    expect(getBulkChannelScanLimit(500, FIFTY_MINUTES_SECONDS)).toBe(500);
    expect(MAX_BULK_CHANNEL_VIDEO_COUNT).toBe(500);
  });

  test('caps oversized bulk requests to the supported channel scan limit', () => {
    expect(normalizeBulkChannelVideoCount(Number.NaN)).toBe(1);
    expect(normalizeBulkChannelVideoCount(0)).toBe(1);
    expect(normalizeBulkChannelVideoCount(999)).toBe(500);
  });

  test('skips long videos and keeps looking until the requested count is filled', () => {
    const videos = [
      { id: 'long-1', duration: 7_741 },
      { id: 'long-2', duration: 6_070 },
      { id: 'short-1', duration: 1_483 },
      { id: 'long-3', duration: 5_017 },
      { id: 'short-2', duration: 1_810 },
    ];

    expect(selectBulkDurationCandidates(videos, 2, FIFTY_MINUTES_SECONDS)).toEqual([
      videos[2],
      videos[4],
    ]);
  });
});
