import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useAI } from '@/contexts/AIContext';
import { useDownload } from '@/contexts/download-context';
import { localizeUnknownError } from '@/lib/backend-error';
import {
  createInitialSummarySessionState,
  DEFAULT_LONG_SUMMARY_WORDS,
  getBackendSummaryCancelRequestId,
  isLongSummaryTranscript,
  normalizeLongSummaryWords,
  type SummarySessionOptions,
  summarySessionReducer,
} from '@/lib/summary-session';
import { SummarySessionContext } from './summary-session-context';

interface SummaryProgressPayload {
  requestId: string;
  stage: 'summarizing-chunk' | 'combining';
  chunkIndex?: number;
  chunkCount: number;
}

export function SummarySessionProvider({ children }: { children: ReactNode }) {
  const ai = useAI();
  const { cookieSettings, getProxyUrl } = useDownload();
  const [state, dispatch] = useReducer(
    summarySessionReducer,
    createInitialSummarySessionState({
      style: ai.config.summary_style,
      language: ai.config.summary_language,
      transcriptLanguages: ai.config.transcript_languages || ['en'],
      longSummaryFormat: 'auto',
      longSummaryWords: DEFAULT_LONG_SUMMARY_WORDS,
    }),
  );
  const requestIdRef = useRef(0);
  const backendSummaryRequestIdRef = useRef<string | null>(null);
  const customizedOptionsRef = useRef(false);

  useEffect(() => {
    if (customizedOptionsRef.current || state.url || state.result || state.isLoading) {
      return;
    }

    dispatch({
      type: 'set-options',
      options: {
        style: ai.config.summary_style,
        language: ai.config.summary_language,
        transcriptLanguages: ai.config.transcript_languages || ['en'],
        longSummaryFormat: 'auto',
        longSummaryWords: DEFAULT_LONG_SUMMARY_WORDS,
      },
    });
  }, [
    ai.config.summary_style,
    ai.config.summary_language,
    ai.config.transcript_languages,
    state.url,
    state.result,
    state.isLoading,
  ]);

  const setUrl = useCallback((url: string) => {
    dispatch({ type: 'set-url', url });
  }, []);

  const updateOptions = useCallback((options: Partial<SummarySessionOptions>) => {
    customizedOptionsRef.current = true;
    dispatch({ type: 'set-options', options });
  }, []);

  const setShowSettings = useCallback((showSettings: boolean) => {
    dispatch({ type: 'set-show-settings', showSettings });
  }, []);

  const setShowFullSummary = useCallback((showFullSummary: boolean) => {
    dispatch({ type: 'set-show-full-summary', showFullSummary });
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<SummaryProgressPayload>('summary-progress', (event) => {
      const progress = event.payload;
      if (progress.requestId !== backendSummaryRequestIdRef.current) {
        return;
      }

      if (progress.stage === 'summarizing-chunk') {
        dispatch({
          type: 'set-status',
          status: 'generating',
          loadingStatus: 'summarizingChunk',
          loadingParams: {
            current: progress.chunkIndex || 0,
            total: progress.chunkCount,
          },
        });
        return;
      }

      if (progress.stage === 'combining') {
        dispatch({
          type: 'set-status',
          status: 'generating',
          loadingStatus: 'combiningSummary',
          loadingParams: {
            total: progress.chunkCount,
          },
        });
      }
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const runSummary = useCallback(
    async (inputUrl: string) => {
      const requestSequence = requestIdRef.current + 1;
      requestIdRef.current = requestSequence;
      const summaryRequestId = `summary-${Date.now()}-${requestSequence}`;
      const normalizedUrl = inputUrl.trim();
      const options = state.options;

      dispatch({ type: 'start', url: normalizedUrl, options });

      const isCurrentRequest = () => requestIdRef.current === requestSequence;
      const setStatus = (
        status: 'fetching-info' | 'fetching-transcript' | 'generating',
        loadingStatus: string,
      ) => {
        dispatch({ type: 'set-status', status, loadingStatus });
      };

      try {
        setStatus('fetching-info', 'fetchingInfo');
        const videoInfoResponse = await invoke<{
          info: {
            title: string;
            thumbnail?: string;
            duration?: number;
          };
        }>('get_video_basic_info', {
          url: normalizedUrl,
          cookieMode: cookieSettings.mode,
          cookieBrowser: cookieSettings.browser || null,
          cookieBrowserProfile: cookieSettings.browserProfile || null,
          cookieFilePath: cookieSettings.filePath || null,
          cookieSkipPatterns: cookieSettings.cookieSkipPatterns || [],
          proxyUrl: getProxyUrl() || null,
        });

        if (!isCurrentRequest()) return;

        const videoInfo = videoInfoResponse.info;
        if (!videoInfo || !videoInfo.title) {
          throw new Error('Failed to fetch video information');
        }

        setStatus('fetching-transcript', 'fetchingTranscript');
        const transcript = await invoke<string>('get_video_transcript', {
          url: normalizedUrl,
          languages: options.transcriptLanguages,
          cookieMode: cookieSettings.mode,
          cookieBrowser: cookieSettings.browser || null,
          cookieBrowserProfile: cookieSettings.browserProfile || null,
          cookieFilePath: cookieSettings.filePath || null,
          cookieSkipPatterns: cookieSettings.cookieSkipPatterns || [],
          proxyUrl: getProxyUrl() || null,
        });

        if (!isCurrentRequest()) return;

        if (!transcript || transcript.trim() === '') {
          throw new Error('No transcript available for this video');
        }

        const longSummaryWords = normalizeLongSummaryWords(options.longSummaryWords);
        setStatus(
          'generating',
          isLongSummaryTranscript(transcript, longSummaryWords)
            ? 'preparingLongSummary'
            : 'generating',
        );
        backendSummaryRequestIdRef.current = summaryRequestId;
        const summaryResult = await invoke<{ summary: string }>('generate_summary_with_options', {
          transcript,
          style: options.style,
          language: options.language,
          title: videoInfo.title,
          longSummaryFormat: options.longSummaryFormat,
          longSummaryWords,
          requestId: summaryRequestId,
        });

        if (backendSummaryRequestIdRef.current === summaryRequestId) {
          backendSummaryRequestIdRef.current = null;
        }
        if (!isCurrentRequest()) return;

        dispatch({
          type: 'complete',
          result: {
            summary: summaryResult.summary,
            videoInfo: {
              url: normalizedUrl,
              title: videoInfo.title,
              thumbnail: videoInfo.thumbnail,
              duration: videoInfo.duration,
            },
          },
        });
      } catch (error) {
        if (backendSummaryRequestIdRef.current === summaryRequestId) {
          backendSummaryRequestIdRef.current = null;
        }
        if (!isCurrentRequest()) return;
        const message = localizeUnknownError(error);
        dispatch({ type: 'fail', error: message });
      }
    },
    [cookieSettings, getProxyUrl, state.options],
  );

  const stopSummary = useCallback(() => {
    const requestId = getBackendSummaryCancelRequestId(backendSummaryRequestIdRef.current);
    backendSummaryRequestIdRef.current = null;
    requestIdRef.current += 1;
    if (requestId) {
      void invoke('cancel_summary_generation', { requestId });
    }
    dispatch({ type: 'cancel' });
  }, []);

  const setError = useCallback((error: string) => {
    dispatch({ type: 'fail', error });
  }, []);

  const markSaved = useCallback(() => {
    dispatch({ type: 'mark-saved' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'clear-error' });
  }, []);

  const value = useMemo(
    () => ({
      state,
      setUrl,
      updateOptions,
      setShowSettings,
      setShowFullSummary,
      runSummary,
      stopSummary,
      setError,
      markSaved,
      clearError,
    }),
    [
      state,
      setUrl,
      updateOptions,
      setShowSettings,
      setShowFullSummary,
      runSummary,
      stopSummary,
      setError,
      markSaved,
      clearError,
    ],
  );

  return <SummarySessionContext.Provider value={value}>{children}</SummarySessionContext.Provider>;
}
