import type { SummaryStyle } from '@/lib/types';

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
}

export interface SummarySessionState {
  url: string;
  options: SummarySessionOptions;
  status: SummarySessionStatus;
  isLoading: boolean;
  loadingStatus: string;
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
    error: null,
    result: null,
    saved: false,
    showFullSummary: true,
    showSettings: false,
  };
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
      };
    case 'complete':
      return {
        ...state,
        status: 'completed',
        isLoading: false,
        loadingStatus: '',
        error: null,
        result: action.result,
      };
    case 'fail':
      return {
        ...state,
        status: 'error',
        isLoading: false,
        loadingStatus: '',
        error: action.error,
      };
    case 'cancel':
      return {
        ...state,
        status: 'cancelled',
        isLoading: false,
        loadingStatus: '',
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
