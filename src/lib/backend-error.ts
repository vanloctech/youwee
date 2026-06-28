import i18n from '@/i18n';

export const BACKEND_ERROR_PREFIX = '__YOUWEE_ERR__';

export interface BackendErrorPayload {
  code: string;
  message: string;
  params?: Record<string, string | number | boolean>;
  source?: string;
  retryable?: boolean;
}

const RETRYABLE_CODES = new Set([
  'NETWORK_TIMEOUT',
  'NETWORK_REQUEST_FAILED',
  'YT_RATE_LIMITED',
  'PROCESS_START_FAILED',
  'PROCESS_EXECUTION_FAILED',
  'PROCESS_EXIT_NON_ZERO',
]);

const NON_RETRYABLE_CODES = new Set([
  'YT_PRIVATE_VIDEO',
  'YT_VIDEO_UNAVAILABLE',
  'YT_SKIPPED_LIVE',
  'YT_SKIPPED_FILTER',
  'YT_UPCOMING_LIVE',
  'YT_AGE_RESTRICTED',
  'YT_MEMBERS_ONLY',
  'YT_SIGNIN_REQUIRED',
  'YT_GEO_RESTRICTED',
  'DOWNLOAD_CANCELLED',
  'VALIDATION_INVALID_URL',
  'VALIDATION_INVALID_INPUT',
  'ARIA2_NOT_FOUND',
  'GALLERYDL_NOT_FOUND',
]);

function asMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string') return maybeMessage;
  }
  try {
    return String(error);
  } catch {
    return '';
  }
}

export function inferBackendErrorCode(message: string): string {
  const m = message.toLowerCase();
  if (!m) return 'BACKEND_UNKNOWN';
  if (m.includes('invalid url')) return 'VALIDATION_INVALID_URL';
  if (m.includes('invalid ')) return 'VALIDATION_INVALID_INPUT';
  if (m.includes('download cancelled') || m.includes('canceled') || m.includes('cancelled')) {
    return 'DOWNLOAD_CANCELLED';
  }
  if (m.includes('could not copy') && m.includes('cookie') && m.includes('database')) {
    return 'YT_COOKIE_DB_LOCKED';
  }
  if (m.includes('fresh cookies')) return 'YT_FRESH_COOKIES_REQUIRED';
  if (m.includes('429') || m.includes('too many requests') || m.includes('rate limited')) {
    return 'YT_RATE_LIMITED';
  }
  if (m.includes('private video')) return 'YT_PRIVATE_VIDEO';
  if (m.includes('age-restricted') || m.includes('confirm your age')) return 'YT_AGE_RESTRICTED';
  if (m.includes('members-only') || m.includes('member-only') || m.includes('join this channel')) {
    return 'YT_MEMBERS_ONLY';
  }
  if (m.includes('sign in') || m.includes('login required')) return 'YT_SIGNIN_REQUIRED';
  if (
    m.includes('not available in your country') ||
    (m.includes('geo') && m.includes('restricted'))
  ) {
    return 'YT_GEO_RESTRICTED';
  }
  if (m.includes('video unavailable')) return 'YT_VIDEO_UNAVAILABLE';
  if (
    m.includes('this live event will begin') ||
    m.includes('premieres in') ||
    m.includes('premiere will begin') ||
    m.includes('live event has not started')
  ) {
    return 'YT_UPCOMING_LIVE';
  }
  if (m.includes('skipped live video')) return 'YT_SKIPPED_LIVE';
  if (m.includes('does not pass filter') || m.includes('skipped by filter')) {
    return 'YT_SKIPPED_FILTER';
  }
  if (m.includes('no subtitles')) return 'YT_NO_SUBTITLES';
  if (m.includes('no transcript available')) return 'TRANSCRIPT_NOT_AVAILABLE';
  if (m.includes('system yt-dlp not found')) return 'YTDLP_SYSTEM_NOT_FOUND';
  if (m.includes('app-managed yt-dlp not found')) return 'YTDLP_APP_NOT_FOUND';
  if (m.includes('system yt-dlp is managed externally')) return 'YTDLP_SYSTEM_MANAGED';
  if (m.includes('yt-dlp not found')) return 'YTDLP_NOT_FOUND';
  if (m.includes('gallery-dl not found') || m.includes('system gallery-dl not found')) {
    return 'GALLERYDL_NOT_FOUND';
  }
  if (
    m.includes('aria2c not found') ||
    ((m.includes('aria2c') || m.includes('aria2')) &&
      (m.includes('no such file') || m.includes('not recognized') || m.includes('not found')))
  ) {
    return 'ARIA2_NOT_FOUND';
  }
  if (m.includes('system ffmpeg is managed externally')) return 'FFMPEG_SYSTEM_MANAGED';
  if (m.includes('ffmpeg not found') || m.includes('ffprobe not found')) return 'FFMPEG_NOT_FOUND';
  if (m.includes('timed out') || m.includes('timeout')) return 'NETWORK_TIMEOUT';
  if (
    m.includes('network') ||
    m.includes('connection') ||
    m.includes('unable to download') ||
    m.includes('request error')
  ) {
    return 'NETWORK_REQUEST_FAILED';
  }
  if (m.includes('failed to start')) return 'PROCESS_START_FAILED';
  if (m.includes('process error') || m.includes('failed to run')) return 'PROCESS_EXECUTION_FAILED';
  if (m.includes('exit code') || m.includes('download failed')) return 'PROCESS_EXIT_NON_ZERO';
  if (m.includes('failed to parse') || m.includes('parse error')) return 'PARSE_FAILED';
  if (
    m.includes('failed to read') ||
    m.includes('failed to write') ||
    m.includes('failed to open') ||
    m.includes('permission denied')
  ) {
    return 'IO_OPERATION_FAILED';
  }
  if (m.includes('query failed') || m.includes('database')) return 'DB_OPERATION_FAILED';
  if (m.includes('api key not configured')) return 'AI_NO_API_KEY';
  if (m.includes('ai api error')) return 'AI_API_ERROR';
  if (m.includes('openai api key not configured for whisper')) return 'WHISPER_NO_API_KEY';
  if (m.includes('unsupported audio format')) return 'WHISPER_UNSUPPORTED_FORMAT';
  if (m.includes('whisper api error')) return 'WHISPER_API_ERROR';
  return 'BACKEND_UNKNOWN';
}

function parseWireMessage(message: string): BackendErrorPayload | null {
  if (!message.startsWith(BACKEND_ERROR_PREFIX)) return null;
  const payload = message.slice(BACKEND_ERROR_PREFIX.length);
  try {
    const parsed: unknown = JSON.parse(payload);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof (parsed as Record<string, unknown>).code !== 'string' ||
      typeof (parsed as Record<string, unknown>).message !== 'string'
    ) {
      return null;
    }
    return parsed as BackendErrorPayload;
  } catch {
    return null;
  }
}

export function extractBackendError(error: unknown): BackendErrorPayload {
  const message = asMessage(error);
  const parsed = parseWireMessage(message);
  if (parsed) return parsed;
  const inferredCode = inferBackendErrorCode(message);
  return {
    code: inferredCode,
    message: message || i18n.t('common:backendErrors.BACKEND_UNKNOWN'),
    retryable: RETRYABLE_CODES.has(inferredCode),
  };
}

export function localizeBackendError(payload: BackendErrorPayload): string {
  if (payload.code === 'PROCESS_EXIT_NON_ZERO' && payload.params?.exitCode == null) {
    return payload.message;
  }

  if (
    payload.source === 'ai' &&
    ['AI_API_ERROR', 'NETWORK_REQUEST_FAILED', 'PARSE_FAILED', 'AI_NO_API_KEY'].includes(
      payload.code,
    )
  ) {
    return payload.message;
  }

  const key =
    payload.code === 'YT_SKIPPED_LIVE' && payload.params?.liveStatus === 'is_upcoming'
      ? 'common:backendErrors.YT_SKIPPED_UPCOMING_LIVE'
      : `common:backendErrors.${payload.code}`;
  const translated = i18n.t(key, payload.params ?? {});
  return translated === key ? payload.message : translated;
}

export function localizeUnknownError(error: unknown): string {
  return localizeBackendError(extractBackendError(error));
}

export function localizeProgressError(
  code?: string,
  message?: string,
  params?: Record<string, string | number | boolean>,
): string | undefined {
  if (!code && !message) return undefined;
  return localizeBackendError({
    code: code || inferBackendErrorCode(message || ''),
    message: message || i18n.t('common:backendErrors.BACKEND_UNKNOWN'),
    params,
  });
}

export function isRetryableBackendError(
  message: string,
  code?: string,
  retryable?: boolean,
): boolean {
  if (typeof retryable === 'boolean') return retryable;
  const normalizedCode = code || inferBackendErrorCode(message);
  return RETRYABLE_CODES.has(normalizedCode);
}

export function isNonRetryableBackendError(message: string, code?: string): boolean {
  const normalizedCode = code || inferBackendErrorCode(message);
  return NON_RETRYABLE_CODES.has(normalizedCode);
}
