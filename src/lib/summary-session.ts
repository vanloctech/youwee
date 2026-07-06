import type { LongSummaryFormat, SummaryStyle } from '@/lib/types';

export const DEFAULT_LONG_SUMMARY_WORDS = 8000;
export const MIN_LONG_SUMMARY_WORDS = 200;
export const MAX_LONG_SUMMARY_WORDS = 50_000;
export const LONG_SUMMARY_WORD_TO_CHAR_RATIO = 4;
export const LONG_SUMMARY_TRANSCRIPT_THRESHOLD_CHARS =
  DEFAULT_LONG_SUMMARY_WORDS * LONG_SUMMARY_WORD_TO_CHAR_RATIO;

export type SummarySessionStatus =
  | 'idle'
  | 'fetching-info'
  | 'fetching-transcript'
  | 'generating'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface SummarySessionVideoInfo {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: number;
}

export interface SummarySessionResult {
  summary: string;
  videoInfo: SummarySessionVideoInfo;
}

export interface SummarySessionOptions {
  style: SummaryStyle;
  language: string;
  transcriptLanguages: string[];
  longSummaryFormat: LongSummaryFormat;
  longSummaryWords: number;
}

export interface SummarySessionState {
  url: string;
  options: SummarySessionOptions;
  status: SummarySessionStatus;
  isLoading: boolean;
  loadingStatus: string;
  loadingParams: Record<string, string | number>;
  error: string | null;
  result: SummarySessionResult | null;
  saved: boolean;
  showFullSummary: boolean;
  showSettings: boolean;
}

export type SummarySessionAction =
  | { type: 'set-url'; url: string }
  | { type: 'set-options'; options: Partial<SummarySessionOptions> }
  | { type: 'set-show-settings'; showSettings: boolean }
  | { type: 'set-show-full-summary'; showFullSummary: boolean }
  | { type: 'start'; url: string; options: SummarySessionOptions }
  | {
      type: 'set-status';
      status: Extract<SummarySessionStatus, 'fetching-info' | 'fetching-transcript' | 'generating'>;
      loadingStatus: string;
      loadingParams?: Record<string, string | number>;
    }
  | { type: 'complete'; result: SummarySessionResult }
  | { type: 'fail'; error: string }
  | { type: 'cancel' }
  | { type: 'mark-saved' }
  | { type: 'clear-error' };

export function createInitialSummarySessionState(
  options: SummarySessionOptions,
): SummarySessionState {
  return {
    url: '',
    options,
    status: 'idle',
    isLoading: false,
    loadingStatus: '',
    loadingParams: {},
    error: null,
    result: null,
    saved: false,
    showFullSummary: true,
    showSettings: false,
  };
}

export function getBackendSummaryCancelRequestId(requestId: string | null): string | null {
  const normalized = requestId?.trim();
  return normalized ? normalized : null;
}

export function normalizeLongSummaryWords(value: unknown): number {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_LONG_SUMMARY_WORDS;
  }
  return Math.min(
    MAX_LONG_SUMMARY_WORDS,
    Math.max(MIN_LONG_SUMMARY_WORDS, Math.round(numericValue)),
  );
}

export function longSummaryWordsToChars(words: unknown): number {
  return normalizeLongSummaryWords(words) * LONG_SUMMARY_WORD_TO_CHAR_RATIO;
}

export function isLongSummaryTranscript(
  transcript: string,
  longSummaryWords = DEFAULT_LONG_SUMMARY_WORDS,
): boolean {
  return Array.from(transcript).length > longSummaryWordsToChars(longSummaryWords);
}

export function summarySessionReducer(
  state: SummarySessionState,
  action: SummarySessionAction,
): SummarySessionState {
  switch (action.type) {
    case 'set-url':
      return { ...state, url: action.url };
    case 'set-options':
      return { ...state, options: { ...state.options, ...action.options } };
    case 'set-show-settings':
      return { ...state, showSettings: action.showSettings };
    case 'set-show-full-summary':
      return { ...state, showFullSummary: action.showFullSummary };
    case 'start':
      return {
        ...state,
        url: action.url,
        options: action.options,
        status: 'fetching-info',
        isLoading: true,
        loadingStatus: '',
        loadingParams: {},
        error: null,
        result: null,
        saved: false,
        showFullSummary: true,
      };
    case 'set-status':
      return {
        ...state,
        status: action.status,
        isLoading: true,
        loadingStatus: action.loadingStatus,
        loadingParams: action.loadingParams || {},
      };
    case 'complete':
      return {
        ...state,
        status: 'completed',
        isLoading: false,
        loadingStatus: '',
        loadingParams: {},
        error: null,
        result: action.result,
      };
    case 'fail':
      return {
        ...state,
        status: 'error',
        isLoading: false,
        loadingStatus: '',
        loadingParams: {},
        error: action.error,
      };
    case 'cancel':
      return {
        ...state,
        status: 'cancelled',
        isLoading: false,
        loadingStatus: '',
        loadingParams: {},
        error: null,
      };
    case 'mark-saved':
      return { ...state, saved: true };
    case 'clear-error':
      return { ...state, error: null };
    default:
      return state;
  }
}
