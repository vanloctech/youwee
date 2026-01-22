import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { AIConfig, AIProvider, ModelOption, LanguageOption } from '@/lib/types';

// Task status for background summary generation
export interface SummaryTask {
  historyId: string;
  status: 'fetching' | 'generating' | 'completed' | 'error';
  summary?: string;
  error?: string;
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
  loadModels: (provider: AIProvider) => void;
  
  // Background task actions
  startSummaryTask: (historyId: string, url: string) => void;
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
  summary_style: 'short',
  summary_language: 'auto',
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

  // Load config on mount
  useEffect(() => {
    loadConfig();
    loadLanguages();
  }, []);

  // Load models when provider changes
  useEffect(() => {
    loadModels(config.provider);
  }, [config.provider]);

  const loadConfig = async () => {
    try {
      const savedConfig = await invoke<AIConfig>('get_ai_config');
      setConfig(savedConfig);
    } catch (error) {
      console.error('Failed to load AI config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadModels = useCallback(async (provider: AIProvider) => {
    try {
      const modelList = await invoke<ModelOption[]>('get_ai_models', { provider });
      setModels(modelList);
    } catch (error) {
      console.error('Failed to load models:', error);
      setModels([]);
    }
  }, []);

  const loadLanguages = async () => {
    try {
      const langList = await invoke<LanguageOption[]>('get_summary_languages');
      setLanguages(langList);
    } catch (error) {
      console.error('Failed to load languages:', error);
    }
  };

  const updateConfig = useCallback(async (updates: Partial<AIConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    setTestResult(null);
    
    try {
      await invoke('save_ai_config', { config: newConfig });
    } catch (error) {
      console.error('Failed to save AI config:', error);
    }
  }, [config]);

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

  const generateSummary = useCallback(async (transcript: string, historyId?: string): Promise<string> => {
    setIsGenerating(true);
    
    try {
      const summary = await invoke<string>('generate_video_summary', {
        transcript,
        historyId: historyId || null,
      });
      return summary;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const fetchTranscript = useCallback(async (url: string): Promise<string> => {
    return await invoke<string>('get_video_transcript', { url });
  }, []);

  // Background task management
  const updateTask = useCallback((historyId: string, update: Partial<SummaryTask>) => {
    setSummaryTasks(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(historyId);
      if (existing) {
        newMap.set(historyId, { ...existing, ...update });
      }
      return newMap;
    });
  }, []);

  const startSummaryTask = useCallback((historyId: string, url: string) => {
    // Don't start if already running
    if (activeTasksRef.current.has(historyId)) {
      return;
    }
    
    activeTasksRef.current.add(historyId);
    
    // Initialize task
    setSummaryTasks(prev => {
      const newMap = new Map(prev);
      newMap.set(historyId, { historyId, status: 'fetching' });
      return newMap;
    });
    
    // Run in background (not awaited, fire-and-forget)
    (async () => {
      try {
        // Fetch transcript
        const transcript = await invoke<string>('get_video_transcript', { url });
        
        // Update to generating status
        updateTask(historyId, { status: 'generating' });
        
        // Generate summary
        const summary = await invoke<string>('generate_video_summary', {
          transcript,
          historyId,
        });
        
        // Complete
        updateTask(historyId, { status: 'completed', summary });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        updateTask(historyId, { status: 'error', error: message });
      } finally {
        activeTasksRef.current.delete(historyId);
      }
    })();
  }, [updateTask]);

  const getSummaryTask = useCallback((historyId: string): SummaryTask | undefined => {
    return summaryTasks.get(historyId);
  }, [summaryTasks]);

  const clearSummaryTask = useCallback((historyId: string) => {
    setSummaryTasks(prev => {
      const newMap = new Map(prev);
      newMap.delete(historyId);
      return newMap;
    });
    activeTasksRef.current.delete(historyId);
  }, []);

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
