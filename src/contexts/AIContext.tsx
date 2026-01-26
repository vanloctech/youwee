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
import type {
  AIConfig,
  AIProvider as AIProviderType,
  CookieSettings,
  LanguageOption,
  ModelOption,
} from '@/lib/types';

// Cookie settings storage key (same as in DownloadContext)
const COOKIE_STORAGE_KEY = 'youwee-cookie-settings';

// Load cookie settings from localStorage
function loadCookieSettings(): CookieSettings {
  try {
    const saved = localStorage.getItem(COOKIE_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load cookie settings:', e);
  }
  return { mode: 'off' };
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
  model: 'gemini-2.0-flash',
  ollama_url: 'http://localhost:11434',
  proxy_url: 'https://api.openai.com',
  summary_style: 'concise',
  summary_language: 'auto',
  timeout_seconds: 120,
  transcript_languages: ['en'],
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
      setTestResult({ success: false, message: String(error) });
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
      const cookieSettings = loadCookieSettings();
      return await invoke<string>('get_video_transcript', {
        url,
        languages,
        cookieMode: cookieSettings.mode,
        cookieBrowser: cookieSettings.browser || null,
        cookieBrowserProfile: cookieSettings.browserProfile || null,
        cookieFilePath: cookieSettings.filePath || null,
      });
    },
    [config.transcript_languages],
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

      // Get languages from current config
      const languages = config.transcript_languages || ['en'];

      // Get cookie settings
      const cookieSettings = loadCookieSettings();

      // Run in background (not awaited, fire-and-forget)
      (async () => {
        try {
          // Fetch transcript
          if (import.meta.env.DEV) {
            console.log(
              `[AI] Fetching transcript for URL: ${url}, languages: ${languages.join(', ')}`,
            );
          }
          const transcript = await invoke<string>('get_video_transcript', {
            url,
            languages,
            cookieMode: cookieSettings.mode,
            cookieBrowser: cookieSettings.browser || null,
            cookieBrowserProfile: cookieSettings.browserProfile || null,
            cookieFilePath: cookieSettings.filePath || null,
          });

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
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[AI] Task failed for historyId=${historyId}:`, message);
          updateTask(historyId, { status: 'error', error: message });
        } finally {
          activeTasksRef.current.delete(historyId);
        }
      })();
    },
    [updateTask, config.transcript_languages, config.enabled],
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

      const languages = config.transcript_languages || ['en'];

      // Get cookie settings
      const cookieSettings = loadCookieSettings();

      // Run in background
      (async () => {
        try {
          // Fetch transcript
          const transcript = await invoke<string>('get_video_transcript', {
            url: itemInfo.url,
            languages,
            cookieMode: cookieSettings.mode,
            cookieBrowser: cookieSettings.browser || null,
            cookieBrowserProfile: cookieSettings.browserProfile || null,
            cookieFilePath: cookieSettings.filePath || null,
          });

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
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[AI] Queue task failed for taskId=${taskId}:`, message);
          updateTask(taskId, { status: 'error', error: message });
        } finally {
          activeTasksRef.current.delete(taskId);
        }
      })();
    },
    [updateTask, config.transcript_languages, config.enabled],
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
