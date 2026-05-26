import type {
  AIBridge,
  AIConfigSnapshot,
  AIExtractJsonOptions,
  AISummarizeOptions,
  AITextOptions,
} from './types';

interface InternalAIConfig extends AIConfigSnapshot {
  apiKey: string | null;
  proxyUrl: string | null;
  ollamaUrl: string | null;
  lmstudioUrl: string | null;
  whisperApiKey: string | null;
  whisperEndpointUrl: string | null;
  whisperModel: string | null;
}

interface LoggerLike {
  info?(message: string, metadata?: unknown): void;
}

function parseBool(value: string | undefined): boolean {
  return value === 'true';
}

function trimTrailingSlash(value: string | null): string | null {
  return value ? value.replace(/\/+$/, '') : value;
}

export function readAIConfigFromEnv(): InternalAIConfig {
  const env = process.env;

  return {
    enabled: parseBool(env.YOUWEE_AI_ENABLED),
    provider: env.YOUWEE_AI_PROVIDER || null,
    model: env.YOUWEE_AI_MODEL || null,
    apiKey: env.YOUWEE_AI_API_KEY || null,
    proxyUrl: trimTrailingSlash(env.YOUWEE_AI_PROXY_URL || null),
    ollamaUrl: trimTrailingSlash(env.YOUWEE_AI_OLLAMA_URL || null),
    lmstudioUrl: trimTrailingSlash(env.YOUWEE_AI_LMSTUDIO_URL || null),
    timeoutSeconds: Number(env.YOUWEE_AI_TIMEOUT_SECONDS || '120'),
    summaryStyle: env.YOUWEE_AI_SUMMARY_STYLE || 'concise',
    summaryLanguage: env.YOUWEE_AI_SUMMARY_LANGUAGE || 'auto',
    whisperEnabled: parseBool(env.YOUWEE_AI_WHISPER_ENABLED),
    whisperApiKey: env.YOUWEE_AI_WHISPER_API_KEY || null,
    whisperEndpointUrl: trimTrailingSlash(env.YOUWEE_AI_WHISPER_ENDPOINT_URL || null),
    whisperModel: env.YOUWEE_AI_WHISPER_MODEL || null,
    hasApiKey: Boolean(env.YOUWEE_AI_API_KEY),
    hasWhisperApiKey: Boolean(env.YOUWEE_AI_WHISPER_API_KEY),
  };
}

export function createAIBridge(logger?: LoggerLike): AIBridge {
  const config = readAIConfigFromEnv();

  return {
    available() {
      return Boolean(config.enabled && config.provider && config.model);
    },

    getConfig() {
      return {
        enabled: config.enabled,
        provider: config.provider,
        model: config.model,
        timeoutSeconds: config.timeoutSeconds,
        summaryStyle: config.summaryStyle,
        summaryLanguage: config.summaryLanguage,
        whisperEnabled: config.whisperEnabled,
        hasApiKey: config.hasApiKey,
        hasWhisperApiKey: config.hasWhisperApiKey,
      };
    },

    async generateText(options) {
      if (!this.available()) {
        throw new Error('Youwee AI is not enabled for plugins.');
      }

      const prompt = typeof options === 'string' ? options : options?.prompt;
      if (!prompt || !String(prompt).trim()) {
        throw new Error('AI prompt is required.');
      }

      if (typeof fetch !== 'function') {
        throw new Error('Global fetch is not available in this runtime.');
      }

      const systemPrompt =
        typeof options === 'object' && options.systemPrompt ? String(options.systemPrompt) : null;
      const temperature =
        typeof options === 'object' && typeof options.temperature === 'number'
          ? options.temperature
          : undefined;

      logger?.info?.('Calling Youwee AI helper', {
        provider: config.provider,
        model: config.model,
      });

      switch (config.provider) {
        case 'gemini':
          return await callGemini(config, prompt, systemPrompt);
        case 'openai':
          return await callOpenAICompatible(
            'https://api.openai.com/v1/chat/completions',
            config,
            prompt,
            systemPrompt,
            temperature,
          );
        case 'deepseek':
          return await callOpenAICompatible(
            'https://api.deepseek.com/chat/completions',
            config,
            prompt,
            systemPrompt,
            temperature,
          );
        case 'qwen':
          return await callOpenAICompatible(
            'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
            config,
            prompt,
            systemPrompt,
            temperature,
          );
        case 'proxy':
          return await callOpenAICompatible(
            `${config.proxyUrl || 'https://api.openai.com'}/v1/chat/completions`,
            config,
            prompt,
            systemPrompt,
            temperature,
          );
        case 'ollama':
          return await callOllama(config, prompt, systemPrompt);
        case 'lmstudio':
          return await callOpenAICompatible(
            `${config.lmstudioUrl || 'http://localhost:1234'}/v1/chat/completions`,
            config,
            prompt,
            systemPrompt,
            temperature,
            false,
          );
        default:
          throw new Error(`Unsupported Youwee AI provider: ${String(config.provider)}`);
      }
    },

    async summarize(options) {
      const normalized = normalizeSummarizeOptions(options);
      const prompt = buildSummaryPrompt(normalized);

      return await this.generateText({
        prompt,
        systemPrompt:
          'You are a concise technical summarizer. Return plain text only, with no markdown fence.',
        temperature: 0.2,
      });
    },

    async extractJson<T = unknown>(options: string | AIExtractJsonOptions) {
      const normalized = normalizeExtractJsonOptions(options);
      const prompt = buildExtractJsonPrompt(normalized);
      const raw = await this.generateText({
        prompt,
        systemPrompt:
          normalized.systemPrompt ||
          'Return valid JSON only. Do not include markdown fences, commentary, or prose.',
        temperature: normalized.temperature ?? 0,
      });

      const parsed = parseJsonFromModelOutput<T>(raw);
      if (normalized.validate && !normalized.validate(parsed)) {
        throw new Error('AI response JSON did not pass validation.');
      }
      return parsed;
    },
  };
}

function normalizeSummarizeOptions(options: string | AISummarizeOptions): AISummarizeOptions {
  if (typeof options === 'string') {
    return {
      text: options,
    };
  }
  return options;
}

function normalizeExtractJsonOptions(options: string | AIExtractJsonOptions): AIExtractJsonOptions {
  if (typeof options === 'string') {
    return {
      prompt: options,
    };
  }
  return options;
}

function buildSummaryPrompt(options: AISummarizeOptions): string {
  const sentenceCount = options.maxSentences || 3;
  const titleLine = options.title ? `Title: ${options.title}\n` : '';
  const extraInstruction = options.instructions
    ? `Additional instructions: ${options.instructions}\n`
    : '';

  return [
    'Summarize the following content.',
    `Target length: at most ${sentenceCount} sentences.`,
    titleLine.trim(),
    extraInstruction.trim(),
    'Content:',
    options.text,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildExtractJsonPrompt(options: AIExtractJsonOptions): string {
  const schemaLine = options.schemaDescription
    ? `Expected JSON shape:\n${options.schemaDescription}\n`
    : '';

  return [
    'Convert the following input into valid JSON.',
    schemaLine.trim(),
    'Input:',
    options.prompt,
  ]
    .filter(Boolean)
    .join('\n');
}

function parseJsonFromModelOutput<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const firstBracket = candidate.indexOf('[');
    const lastBracket = candidate.lastIndexOf(']');

    const objectSlice =
      firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : null;
    const arraySlice =
      firstBracket >= 0 && lastBracket > firstBracket
        ? candidate.slice(firstBracket, lastBracket + 1)
        : null;

    for (const slice of [objectSlice, arraySlice]) {
      if (!slice) continue;
      try {
        return JSON.parse(slice) as T;
      } catch {}
    }

    throw new Error('AI response did not contain valid JSON.');
  }
}

async function withTimeout(
  url: string,
  init: RequestInit,
  timeoutSeconds: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutSeconds) * 1000);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  config: InternalAIConfig,
  prompt: string,
  systemPrompt: string | null,
): Promise<string> {
  if (!config.apiKey) {
    throw new Error('Gemini API key is not available.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model || '',
  )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const parts: Array<{ text: string }> = [];
  if (systemPrompt) {
    parts.push({ text: systemPrompt });
  }
  parts.push({ text: prompt });

  const response = await withTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
      }),
    },
    config.timeoutSeconds,
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${text}`);
  }

  const data = JSON.parse(text) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  const content =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!content.trim()) {
    throw new Error('Gemini response did not contain text.');
  }
  return content;
}

async function callOpenAICompatible(
  url: string,
  config: InternalAIConfig,
  prompt: string,
  systemPrompt: string | null,
  temperature?: number,
  requireApiKey = true,
): Promise<string> {
  if (requireApiKey && !config.apiKey) {
    throw new Error('AI API key is not available.');
  }

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  const response = await withTimeout(
    url,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        ...(typeof temperature === 'number' ? { temperature } : {}),
      }),
    },
    config.timeoutSeconds,
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`AI API error: ${response.status} ${text}`);
  }

  const data = JSON.parse(text) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('AI response did not contain text.');
  }
  return content;
}

async function callOllama(
  config: InternalAIConfig,
  prompt: string,
  systemPrompt: string | null,
): Promise<string> {
  const url = `${config.ollamaUrl || 'http://localhost:11434'}/api/generate`;
  const combinedPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const response = await withTimeout(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        prompt: combinedPrompt,
        stream: false,
      }),
    },
    config.timeoutSeconds,
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${text}`);
  }

  const data = JSON.parse(text) as { response?: string };
  const content = data.response;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Ollama response did not contain text.');
  }
  return content;
}

export { parseJsonFromModelOutput };

export type { AIConfigSnapshot, AITextOptions, AISummarizeOptions, AIExtractJsonOptions, AIBridge };
