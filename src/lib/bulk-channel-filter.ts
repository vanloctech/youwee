export const FIFTY_MINUTES_SECONDS = 50 * 60;
export const MAX_BULK_CHANNEL_VIDEO_COUNT = 500;
export const MIN_BULK_CHANNEL_SCAN_COUNT = 10;

export function normalizeBulkChannelVideoCount(videoCount: number): number {
  if (!Number.isFinite(videoCount)) return 1;
  return Math.min(MAX_BULK_CHANNEL_VIDEO_COUNT, Math.max(1, Math.floor(videoCount)));
}

export function getBulkChannelScanLimit(
  videoCount: number,
  _maxDurationSeconds: number | null,
): number {
  const normalizedCount = normalizeBulkChannelVideoCount(videoCount);
  return Math.min(
    MAX_BULK_CHANNEL_VIDEO_COUNT,
    Math.max(MIN_BULK_CHANNEL_SCAN_COUNT, normalizedCount),
  );
}

export function isWithinBulkDurationLimit(
  duration: number | undefined,
  maxDurationSeconds: number | null,
): boolean {
  if (maxDurationSeconds == null) return true;
  return typeof duration === 'number' && Number.isFinite(duration) && duration < maxDurationSeconds;
}

export function selectBulkDurationCandidates<T extends { duration?: number }>(
  videos: T[],
  count: number,
  maxDurationSeconds: number | null,
): T[] {
  return videos
    .filter((video) => isWithinBulkDurationLimit(video.duration, maxDurationSeconds))
    .slice(0, normalizeBulkChannelVideoCount(count));
}
