import { isNonRetryableBackendError, isRetryableBackendError } from '@/lib/backend-error';

const RETRYABLE_PATTERNS = [
  /timed?\s*out/i,
  /timeout/i,
  /connection (?:reset|aborted|closed|refused)/i,
  /network(?:\s+is)?\s+unreachable/i,
  /temporar(?:ily|y)\s+unavailable/i,
  /try again/i,
  /too many requests/i,
  /\b429\b/i,
  /\b5\d{2}\b/i,
  /http error 5\d{2}/i,
  /live (?:stream )?(?:ended|interrupted|is offline)/i,
  /fragment.*(?:failed|error)/i,
  /unable to download video data/i,
  /remote end closed connection/i,
  /\b\d+ bytes read,\s*\d+ more expected\b/i,
  /incomplete\s*read/i,
  /tls|ssl/i,
];

const NON_RETRYABLE_PATTERNS = [
  /private video/i,
  /video unavailable/i,
  /this video is not available/i,
  /copyright/i,
  /geo(?:-|\s)?restricted/i,
  /not available in your country/i,
  /sign in/i,
  /login required/i,
  /unsupported url/i,
  /unsupported site/i,
  /drm/i,
  /permission denied/i,
  /no such file or directory/i,
  /invalid url/i,
];

export const AUTO_RETRY_LIMITS = {
  maxAttempts: { min: 1, max: 10, default: 3 },
  delaySeconds: { min: 1, max: 60, default: 5 },
} as const;

export function clampAutoRetryMaxAttempts(value: number): number {
  const { min, max } = AUTO_RETRY_LIMITS.maxAttempts;
  return Math.max(min, Math.min(max, value || AUTO_RETRY_LIMITS.maxAttempts.default));
}

export function clampAutoRetryDelaySeconds(value: number): number {
  const { min, max } = AUTO_RETRY_LIMITS.delaySeconds;
  return Math.max(min, Math.min(max, value || AUTO_RETRY_LIMITS.delaySeconds.default));
}

export function normalizeErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }
  try {
    const raw = String(error);
    return raw || 'Unknown error';
  } catch {
    return 'Unknown error';
  }
}

export function isNonRetryableError(message: string, code?: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (isNonRetryableBackendError(text, code)) return true;
  return NON_RETRYABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isRetryableError(message: string, code?: string, retryable?: boolean): boolean {
  const text = message.trim();
  if (!text || isNonRetryableError(text, code)) return false;
  if (isRetryableBackendError(text, code, retryable)) return true;
  return RETRYABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export async function waitWithCancellation(
  ms: number,
  isCancelled: () => boolean,
  onTick?: (remainingSeconds: number) => void,
): Promise<boolean> {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));

  for (let remaining = totalSeconds; remaining > 0; remaining--) {
    if (isCancelled()) return false;
    onTick?.(remaining);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return !isCancelled();
}
