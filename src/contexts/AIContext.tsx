import { invoke } from '@tauri-apps/api/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { localizeUnknownError } from '@/lib/backend-error';
import { buildCookieProxyInvokeOptions, loadNetworkSettings } from '@/lib/network-config';
import type {
  AIConfig,
  AIProvider as AIProviderType,
  LanguageOption,
  ModelOption,
} from '@/lib/types';

function extractErrorMessage(error: unknown): string {
  return localizeUnknownError(error);
}

// Task status for background summary generation
export interface SummaryTask {
  historyId: string;
  status: 'fetching' | 'generating' | 'completed' | 'error';
  summary?: string;
  error?: string;
}

// Queue item info for saving to history
export interface QueueItemInfo {
  url: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  source?: string;
}

interface AIContextValue {
  config: AIConfig;
  isLoading: boolean;
  isTesting: boolean;
  isGenerating: boolean;
  testResult: { success: boolean; message: string } | null;
  models: ModelOption[];
  languages: LanguageOption[];

  // Background tasks
  summaryTasks: Map<string, SummaryTask>;

  // Actions
  updateConfig: (updates: Partial<AIConfig>) => Promise<void>;
  testConnection: () => Promise<void>;
  generateSummary: (transcript: string, historyId?: string) => Promise<string>;
  fetchTranscript: (url: string) => Promise<string>;
  loadModels: (provider: AIProviderType) => void;

  // Background task actions
  startSummaryTask: (historyId: string, url: string) => void;
  startQueueSummaryTask: (taskId: string, itemInfo: QueueItemInfo) => void;
  getSummaryTask: (historyId: string) => SummaryTask | undefined;
  clearSummaryTask: (historyId: string) => void;
}

const defaultConfig: AIConfig = {
  enabled: false,
  provider: 'gemini',
  api_key: undefined,
  model: 'gemini-3.5-flash',
  ollama_url: 'http://localhost:11434',
  lmstudio_url: 'http://localhost:1234',
  proxy_url: 'https://api.openai.com',
  summary_style: 'concise',
  summary_language: 'auto',
  timeout_seconds: 120,
  transcript_languages: ['en'],
  whisper_enabled: false,
  whisper_api_key: undefined,
  whisper_endpoint_url: undefined,
  whisper_model: undefined,
};

const AIContext = createContext<AIContextValue | undefined>(undefined);

export function AIProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AIConfig>(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);

  // Background summary tasks - persists across page navigations
  const [summaryTasks, setSummaryTasks] = useState<Map<string, SummaryTask>>(new Map());
  const activeTasksRef = useRef<Set<string>>(new Set());

  const loadConfig = useCallback(async () => {
    try {
      const savedConfig = await invoke<AIConfig>('get_ai_config');
      setConfig(savedConfig);
    } catch (error) {
      console.error('Failed to load AI config:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadModels = useCallback(async (provider: AIProviderType) => {
    try {
      const modelList = await invoke<ModelOption[]>('get_ai_models', { provider });
      setModels(modelList);
    } catch (error) {
      console.error('Failed to load models:', error);
      setModels([]);
    }
  }, []);

  const loadLanguages = useCallback(async () => {
    try {
      const langList = await invoke<LanguageOption[]>('get_summary_languages');
      setLanguages(langList);
    } catch (error) {
      console.error('Failed to load languages:', error);
    }
  }, []);

  // Load config on mount
  useEffect(() => {
    loadConfig();
    loadLanguages();
  }, [loadConfig, loadLanguages]);

  // Load models when provider changes
  useEffect(() => {
    loadModels(config.provider);
  }, [config.provider, loadModels]);

  const updateConfig = useCallback(
    async (updates: Partial<AIConfig>) => {
      const newConfig = { ...config, ...updates };
      setConfig(newConfig);
      setTestResult(null);

      try {
        await invoke('save_ai_config', { config: newConfig });
      } catch (error) {
        console.error('Failed to save AI config:', error);
      }
    },
    [config],
  );

  const testConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const message = await invoke<string>('test_ai_connection', { config });
      setTestResult({ success: true, message });
    } catch (error) {
      setTestResult({ success: false, message: extractErrorMessage(error) });
    } finally {
      setIsTesting(false);
    }
  }, [config]);

  const generateSummary = useCallback(
    async (transcript: string, historyId?: string, title?: string): Promise<string> => {
      setIsGenerating(true);

      try {
        const summary = await invoke<string>('generate_video_summary', {
          transcript,
          historyId: historyId || null,
          title: title || null,
        });
        return summary;
      } finally {
        setIsGenerating(false);
      }
    },
    [],
  );

  const fetchTranscript = useCallback(
    async (url: string): Promise<string> => {
      const languages = config.transcript_languages || ['en'];
      const { cookieSettings, proxySettings } = loadNetworkSettings();
      const networkOptions = buildCookieProxyInvokeOptions(cookieSettings, proxySettings);
      let transcriptError: string | null = null;

      // Try YouTube captions first
      try {
        const transcript = await invoke<string>('get_video_transcript', {
          url,
          languages,
          ...networkOptions,
        });

        const normalizedTranscript = transcript?.trim();

        if (normalizedTranscript) {
          return normalizedTranscript;
        }

        transcriptError = 'Transcript is empty.';
      } catch (error) {
        transcriptError = extractErrorMessage(error);

        if (import.meta.env.DEV) {
          console.log('[AI] Transcript fetch failed, trying Whisper fallback:', transcriptError);
        }
      }

      // Fallback to Whisper if enabled
      if (config.whisper_enabled) {
        // Determine which API key to use for Whisper
        const whisperKey = config.provider === 'openai' ? config.api_key : config.whisper_api_key;

        if (whisperKey) {
          if (import.meta.env.DEV) {
            console.log('[AI] Using Whisper transcription for:', url);
          }

          try {
            const whisperTranscript = await invoke<string>('transcribe_url_with_whisper', {
              url,
              responseFormat: 'text',
              openaiApiKey: whisperKey,
              language: languages[0] || null, // Use first preferred language as hint
              ...networkOptions,
              whisperEndpointUrl: config.whisper_endpoint_url || null,
              whisperModel: config.whisper_model || null,
            });

            const normalizedWhisperTranscript = whisperTranscript?.trim();
            if (normalizedWhisperTranscript) {
              return normalizedWhisperTranscript;
            }

            throw new Error('Whisper transcription is empty.');
          } catch (error) {
            const whisperError = extractErrorMessage(error);
            const details = transcriptError
              ? `Transcript fetch failed: ${transcriptError} | Whisper failed: ${whisperError}`
              : `Whisper failed: ${whisperError}`;
            throw new Error(details);
          }
        } else {
          throw new Error(
            'Whisper is enabled but no API key configured. ' +
              (config.provider === 'openai'
                ? 'Please add your OpenAI API key.'
                : 'Please add a Whisper API key in Settings.'),
          );
        }
      }

      if (transcriptError) {
        throw new Error(transcriptError);
      }

      throw new Error(
        'No transcript available. Enable Whisper in Settings to transcribe videos without captions.',
      );
    },
    [
      config.transcript_languages,
      config.whisper_enabled,
      config.provider,
      config.api_key,
      config.whisper_api_key,
      config.whisper_endpoint_url,
      config.whisper_model,
    ],
  );

  // Background task management
  const updateTask = useCallback((historyId: string, update: Partial<SummaryTask>) => {
    setSummaryTasks((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(historyId);
      if (existing) {
        newMap.set(historyId, { ...existing, ...update });
      }
      return newMap;
    });
  }, []);

  const startSummaryTask = useCallback(
    (historyId: string, url: string) => {
      // Check if AI is enabled
      if (!config.enabled) {
        setSummaryTasks((prev) => {
          const newMap = new Map(prev);
          newMap.set(historyId, {
            historyId,
            status: 'error',
            error: 'AI Features is disabled. Go to Settings → AI Features to enable.',
          });
          return newMap;
        });
        return;
      }

      // Don't start if already running
      if (activeTasksRef.current.has(historyId)) {
        console.log(`[AI] Task already running for historyId=${historyId}`);
        return;
      }

      activeTasksRef.current.add(historyId);

      // Log task start (for debugging)
      if (import.meta.env.DEV) {
        console.log(`[AI] Starting summary task:`, { historyId, url });
      }

      // Initialize task
      setSummaryTasks((prev) => {
        const newMap = new Map(prev);
        newMap.set(historyId, { historyId, status: 'fetching' });
        return newMap;
      });

      // Run in background (not awaited, fire-and-forget)
      (async () => {
        try {
          // Fetch transcript
          if (import.meta.env.DEV) {
            console.log(`[AI] Fetching transcript for URL with fallback chain: ${url}`);
          }
          const transcript = await fetchTranscript(url);

          if (import.meta.env.DEV) {
            console.log(
              `[AI] Got transcript (${transcript.length} chars), first 200:`,
              transcript.slice(0, 200),
            );
          }

          // Update to generating status
          updateTask(historyId, { status: 'generating' });

          // Generate summary
          const summary = await invoke<string>('generate_video_summary', {
            transcript,
            historyId,
            title: null, // History items don't have title readily available
          });

          if (import.meta.env.DEV) {
            console.log(
              `[AI] Generated summary for historyId=${historyId}:`,
              summary.slice(0, 100),
            );
          }

          // Complete
          updateTask(historyId, { status: 'completed', summary });
        } catch (error) {
          const message = extractErrorMessage(error);
          console.error(`[AI] Task failed for historyId=${historyId}:`, message);
          updateTask(historyId, { status: 'error', error: message });
        } finally {
          activeTasksRef.current.delete(historyId);
        }
      })();
    },
    [updateTask, config.enabled, fetchTranscript],
  );

  const getSummaryTask = useCallback(
    (historyId: string): SummaryTask | undefined => {
      return summaryTasks.get(historyId);
    },
    [summaryTasks],
  );

  const clearSummaryTask = useCallback((historyId: string) => {
    setSummaryTasks((prev) => {
      const newMap = new Map(prev);
      newMap.delete(historyId);
      return newMap;
    });
    activeTasksRef.current.delete(historyId);
  }, []);

  // Start summary task for queue items (saves to history when done)
  const startQueueSummaryTask = useCallback(
    (taskId: string, itemInfo: QueueItemInfo) => {
      // Check if AI is enabled
      if (!config.enabled) {
        setSummaryTasks((prev) => {
          const newMap = new Map(prev);
          newMap.set(taskId, {
            historyId: taskId,
            status: 'error',
            error: 'AI Features is disabled. Go to Settings → AI Features to enable.',
          });
          return newMap;
        });
        return;
      }

      // Don't start if already running
      if (activeTasksRef.current.has(taskId)) {
        console.log(`[AI] Task already running for taskId=${taskId}`);
        return;
      }

      activeTasksRef.current.add(taskId);

      if (import.meta.env.DEV) {
        console.log(`[AI] Starting queue summary task:`, { taskId, itemInfo });
      }

      // Initialize task
      setSummaryTasks((prev) => {
        const newMap = new Map(prev);
        newMap.set(taskId, { historyId: taskId, status: 'fetching' });
        return newMap;
      });

      // Run in background
      (async () => {
        try {
          // Fetch transcript
          const transcript = await fetchTranscript(itemInfo.url);

          // Update to generating status
          updateTask(taskId, { status: 'generating' });

          // Generate summary (without historyId - we'll save manually)
          const summary = await invoke<string>('generate_video_summary', {
            transcript,
            historyId: null,
            title: itemInfo.title,
          });

          // Save to history with summary
          await invoke<string>('add_summary_only_history', {
            url: itemInfo.url,
            title: itemInfo.title,
            thumbnail: itemInfo.thumbnail || null,
            duration: itemInfo.duration ? Math.floor(itemInfo.duration) : null,
            source: itemInfo.source || 'youtube',
            summary,
          });

          if (import.meta.env.DEV) {
            console.log(`[AI] Queue summary completed and saved to history:`, taskId);
          }

          // Complete
          updateTask(taskId, { status: 'completed', summary });
        } catch (error) {
          const message = extractErrorMessage(error);
          console.error(`[AI] Queue task failed for taskId=${taskId}:`, message);
          updateTask(taskId, { status: 'error', error: message });
        } finally {
          activeTasksRef.current.delete(taskId);
        }
      })();
    },
    [updateTask, config.enabled, fetchTranscript],
  );

  return (
    <AIContext.Provider
      value={{
        config,
        isLoading,
        isTesting,
        isGenerating,
        testResult,
        models,
        languages,
        summaryTasks,
        updateConfig,
        testConnection,
        generateSummary,
        fetchTranscript,
        loadModels,
        startSummaryTask,
        startQueueSummaryTask,
        getSummaryTask,
        clearSummaryTask,
      }}
    >
      {children}
    </AIContext.Provider>
  );
}

export function useAI() {
  const context = useContext(AIContext);
  if (!context) {
    throw new Error('useAI must be used within AIProvider');
  }
  return context;
}
