export type RetryableBulkChannelJob = {
  status: string;
  error?: string;
  retryCount?: number;
};

export function prepareFailedBulkChannelRetry<T extends RetryableBulkChannelJob>(
  jobs: T[],
): {
  jobs: T[];
  retryStartIndex: number;
  failedCount: number;
} {
  const failed = jobs.filter((job) => job.status === 'failed');
  const settled = jobs.filter((job) => job.status !== 'failed');
  return {
    jobs: [
      ...settled,
      ...failed.map((job) => ({
        ...job,
        status: 'pending',
        error: undefined,
        retryCount: (job.retryCount ?? 0) + 1,
      })),
    ],
    retryStartIndex: settled.length,
    failedCount: failed.length,
  };
}
