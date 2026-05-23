import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAIBridge } from './ai';
import {
  assertCompatibleAppVersion,
  checkAppVersionCompatibility,
  SDK_VERSION,
} from './compatibility';
import type {
  CommandResult,
  CompatibilityCheckResult,
  PluginChainMutation,
  PluginChainState,
  PluginConfigBridge,
  PluginConfigFieldValue,
  PluginContext,
  PluginDefinition,
  PluginFileSystemBridge,
  PluginHttpBridge,
  PluginHttpRequestOptions,
  PluginHttpResponse,
  PluginI18nBridge,
  PluginLogger,
  PluginPayload,
  PluginResult,
  ToolRunner,
  YouweeBridge,
} from './types';

function writeStderr(level: string, message: string, metadata?: unknown): void {
  const suffix = metadata ? ` ${JSON.stringify(metadata)}` : '';
  process.stderr.write(`[${level}] ${message}${suffix}\n`);
}

export function createLogger(): PluginLogger {
  return {
    debug(message, metadata) {
      writeStderr('debug', message, metadata);
    },
    info(message, metadata) {
      writeStderr('info', message, metadata);
    },
    warn(message, metadata) {
      writeStderr('warn', message, metadata);
    },
    error(message, metadata) {
      writeStderr('error', message, metadata);
    },
  };
}

function parseNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveAvailableTool(pathEnvName: string): Pick<ToolRunner, 'available' | 'path'> {
  const path = process.env[pathEnvName] || null;
  return {
    available: Boolean(path),
    path,
  };
}

function createCommandRunner(toolName: string, pathEnvName: string): ToolRunner {
  const tool = resolveAvailableTool(pathEnvName);

  return {
    ...tool,
    async run(args = [], options = {}) {
      if (!tool.path) {
        throw new Error(`${toolName} is not available in this Youwee runtime.`);
      }

      return await spawnCommand(tool.path, args, options);
    },
  };
}

export function spawnCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on('data', (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code, signal) => {
      resolve({
        code: typeof code === 'number' ? code : null,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
      });
    });
  });
}

function createFileSystemBridge(): PluginFileSystemBridge {
  return {
    async exists(path) {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    },
    async readText(path) {
      return await readFile(path, 'utf8');
    },
    async writeText(path, content) {
      await writeFile(path, content, 'utf8');
    },
    async ensureDir(path) {
      await mkdir(path, { recursive: true });
    },
    async tempDir(prefix = 'youwee-plugin-') {
      return await mkdtemp(join(tmpdir(), prefix));
    },
  };
}

function createHttpBridge(): PluginHttpBridge {
  return {
    async request(url, options = {}) {
      return await requestText(url, options);
    },
    async get(url, headers) {
      return await requestText(url, {
        method: 'GET',
        headers,
      });
    },
    async getJson(url, headers) {
      return await requestJson(url, {
        method: 'GET',
        headers,
      });
    },
    async postJson(url, body, headers) {
      return await requestJson(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(headers || {}),
        },
        body: JSON.stringify(body),
      });
    },
  };
}

function createSdkBridge(currentAppVersion: string | null): {
  version: string;
  checkAppVersion(range: string): CompatibilityCheckResult;
  assertAppVersion(range: string): void;
} {
  return {
    version: SDK_VERSION,
    checkAppVersion(range) {
      return checkAppVersionCompatibility(currentAppVersion, range);
    },
    assertAppVersion(range) {
      assertCompatibleAppVersion(currentAppVersion, range);
    },
  };
}

async function requestText(
  url: string,
  options: PluginHttpRequestOptions = {},
): Promise<PluginHttpResponse<string>> {
  const response = await fetchWithTimeout(url, options);
  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: normalizeHeaders(response.headers),
    body,
  };
}

async function requestJson<T>(
  url: string,
  options: PluginHttpRequestOptions = {},
): Promise<PluginHttpResponse<T>> {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let body: T;

  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(`HTTP response from ${url} was not valid JSON.`);
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: normalizeHeaders(response.headers),
    body,
  };
}

async function fetchWithTimeout(url: string, options: PluginHttpRequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, options.timeoutMs ?? 30000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

function createYouweeBridge(logger: PluginLogger): YouweeBridge {
  const appVersion = process.env.YOUWEE_APP_VERSION || null;
  const appLocale = process.env.YOUWEE_APP_LOCALE || null;
  const appFallbackLocale = process.env.YOUWEE_APP_FALLBACK_LOCALE || null;
  const appDirection = process.env.YOUWEE_APP_DIRECTION || null;
  return {
    app: {
      version: appVersion,
      locale: appLocale,
      fallbackLocale: appFallbackLocale,
      direction: appDirection,
    },
    sdk: createSdkBridge(appVersion),
    plugin: {
      id: process.env.YOUWEE_PLUGIN_ID || null,
      slug: process.env.YOUWEE_PLUGIN_SLUG || null,
      name: process.env.YOUWEE_PLUGIN_NAME || null,
      version: process.env.YOUWEE_PLUGIN_VERSION || null,
    },
    runtime: {
      language: process.env.YOUWEE_PLUGIN_LANGUAGE || null,
      provider: process.env.YOUWEE_PLUGIN_PROVIDER || null,
      providerSource: process.env.YOUWEE_PLUGIN_PROVIDER_SOURCE || null,
      timeoutMs: parseNumber(process.env.YOUWEE_PLUGIN_TIMEOUT_MS),
    },
    tools: {
      ffmpeg: createCommandRunner('FFmpeg', 'YOUWEE_FFMPEG_PATH'),
      ytdlp: createCommandRunner('yt-dlp', 'YOUWEE_YTDLP_PATH'),
    },
    fs: createFileSystemBridge(),
    http: createHttpBridge(),
    ai: createAIBridge(logger),
  };
}

function normalizeLocaleCandidates(input: string | null | undefined): string[] {
  if (!input) return [];
  const values = [input];
  const dashIndex = input.indexOf('-');
  if (dashIndex > 0) {
    values.push(input.slice(0, dashIndex));
  }
  return values.map((value) => value.trim()).filter(Boolean);
}

function interpolateMessage(template: string, params: Record<string, unknown> | undefined): string {
  if (!params) return template;
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => {
    const value = params[key];
    return value == null ? '' : String(value);
  });
}

function loadLocaleTable(directory: string, locale: string): Record<string, string> | null {
  const path = join(process.cwd(), directory, `${locale}.json`);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  const parsed = JSON.parse(content) as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') {
      output[key] = value;
    }
  }
  return output;
}

function createI18nBridge(): PluginI18nBridge {
  const locale = process.env.YOUWEE_APP_LOCALE || 'en';
  const fallbackLocale = process.env.YOUWEE_APP_FALLBACK_LOCALE || 'en';
  const defaultLocale = process.env.YOUWEE_PLUGIN_I18N_DEFAULT_LOCALE || 'en';
  const supportedLocales = process.env.YOUWEE_PLUGIN_I18N_SUPPORTED_LOCALES?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) || [defaultLocale];
  const directory = process.env.YOUWEE_PLUGIN_I18N_DIR || 'locales';
  const cache = new Map<string, Record<string, string>>();

  const getTable = (candidate: string): Record<string, string> | null => {
    if (cache.has(candidate)) {
      return cache.get(candidate) ?? null;
    }
    const loaded = loadLocaleTable(directory, candidate);
    if (loaded) {
      cache.set(candidate, loaded);
      return loaded;
    }
    cache.set(candidate, {});
    return null;
  };

  const resolveMessage = (key: string, preferredLocale?: string): string | null => {
    const candidates = [
      ...normalizeLocaleCandidates(preferredLocale ?? locale),
      ...normalizeLocaleCandidates(fallbackLocale),
      ...normalizeLocaleCandidates(defaultLocale),
    ].filter((value, index, list) => list.indexOf(value) === index);

    for (const candidate of candidates) {
      const table = getTable(candidate);
      if (table && typeof table[key] === 'string') {
        return table[key];
      }
    }
    return null;
  };

  return {
    locale,
    fallbackLocale,
    defaultLocale,
    supportedLocales,
    t(key, params) {
      return interpolateMessage(resolveMessage(key) ?? key, params);
    },
    has(key, preferredLocale) {
      return resolveMessage(key, preferredLocale) != null;
    },
    raw(key, preferredLocale) {
      return resolveMessage(key, preferredLocale);
    },
  };
}

function parsePluginConfig(): Record<string, PluginConfigFieldValue> {
  const raw = process.env.YOUWEE_PLUGIN_CONFIG_JSON;
  if (!raw?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const output: Record<string, PluginConfigFieldValue> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        output[key] = value;
        continue;
      }
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        output[key] = value;
      }
    }
    return output;
  } catch {
    return {};
  }
}

function createConfigBridge(): PluginConfigBridge {
  const values = parsePluginConfig();
  return {
    get<T extends PluginConfigFieldValue = PluginConfigFieldValue>(key: string) {
      return values[key] as T | undefined;
    },
    require<T extends PluginConfigFieldValue = PluginConfigFieldValue>(key: string) {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing required plugin config value: ${key}`);
      }
      return value as T;
    },
    has(key) {
      return values[key] !== undefined;
    },
    all() {
      return { ...values };
    },
  };
}

export function createContext(payload: PluginPayload): PluginContext {
  const logger = createLogger();
  const config = createConfigBridge();
  const chain: PluginChainState = payload.chainState ?? {
    jobId: payload.jobId,
    source: payload.source ?? null,
    downloadKind: payload.downloadKind,
    url: payload.url,
    title: payload.title ?? null,
    thumbnail: payload.thumbnail ?? null,
    historyId: payload.historyId ?? null,
    timeRange: payload.timeRange ?? null,
    activeFilepath: payload.filepath,
    activeFilename: payload.filename,
    directory: payload.directory,
    filesize: payload.filesize ?? null,
    format: payload.format ?? null,
    quality: payload.quality ?? null,
    extraFiles: [],
    metadata: null,
  };

  return {
    payload,
    trigger: payload.trigger,
    download: {
      jobId: payload.jobId,
      kind: payload.downloadKind,
      source: payload.source ?? null,
      historyId: payload.historyId ?? null,
      timeRange: payload.timeRange ?? null,
    },
    file: {
      path: payload.filepath,
      name: payload.filename,
      directory: payload.directory,
      size: payload.filesize ?? null,
      format: payload.format ?? null,
      quality: payload.quality ?? null,
    },
    media: {
      url: payload.url,
      title: payload.title ?? null,
      thumbnail: payload.thumbnail ?? null,
    },
    chain,
    config,
    env: {
      get(name) {
        return process.env[name];
      },
      require(name) {
        const value = process.env[name];
        if (!value) {
          throw new Error(`Missing required environment variable: ${name}`);
        }
        return value;
      },
      has(name) {
        return Boolean(process.env[name]);
      },
    },
    log: logger,
    i18n: createI18nBridge(),
    youwee: createYouweeBridge(logger),
    ok(
      message,
      metadata = null,
      artifacts = null,
      mutations: PluginChainMutation | null = null,
    ): PluginResult {
      return {
        success: true,
        message,
        metadata,
        artifacts,
        mutations,
      };
    },
    fail(
      message,
      metadata = null,
      artifacts = null,
      mutations: PluginChainMutation | null = null,
    ): PluginResult {
      return {
        success: false,
        message,
        metadata,
        artifacts,
        mutations,
      };
    },
  };
}

async function readInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function normalizePluginModule(
  pluginModule: PluginDefinition | { default?: PluginDefinition },
): PluginDefinition {
  return pluginModule && 'default' in pluginModule && pluginModule.default
    ? pluginModule.default
    : (pluginModule as PluginDefinition);
}

function validatePlugin(plugin: PluginDefinition): void {
  if (!plugin || typeof plugin !== 'object') {
    throw new Error('Plugin module must export an object from definePlugin(...)');
  }

  if (!plugin.hooks || typeof plugin.hooks !== 'object') {
    throw new Error('Plugin module is missing hooks.');
  }
}

export async function runPluginModule(
  pluginModule: PluginDefinition | { default?: PluginDefinition },
): Promise<void> {
  const plugin = normalizePluginModule(pluginModule);
  validatePlugin(plugin);

  const input = await readInput();
  const payload = JSON.parse(input) as PluginPayload;
  const hook = plugin.hooks?.[payload.trigger];

  if (typeof hook !== 'function') {
    throw new Error(`No hook registered for trigger: ${payload.trigger}`);
  }

  const ctx = createContext(payload);
  const result = await hook(ctx);
  process.stdout.write(
    `${JSON.stringify(result ?? ctx.ok('Plugin completed without explicit result.'))}\n`,
  );
}

export { writeStderr };
