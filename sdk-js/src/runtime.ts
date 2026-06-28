import { existsSync, readFileSync } from 'node:fs';
import { basename, extname, join, normalize } from 'node:path';
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
  PluginDirectoryEntry,
  PluginFileSystemBridge,
  PluginHttpBridge,
  PluginHttpRequestOptions,
  PluginHttpResponse,
  PluginI18nBridge,
  PluginLogger,
  PluginPayload,
  PluginResult,
  ToolRunner,
  YoutubeSearchOptions,
  YoutubeSearchResponse,
  YouweeBridge,
  YouweeYouTubeBridge,
} from './types';

const STRIP_SUBPROCESS_ENV_KEYS = new Set([
  'DYLD_FALLBACK_LIBRARY_PATH',
  'DYLD_LIBRARY_PATH',
  'LD_LIBRARY_PATH',
]);

interface BridgeResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

const DANGEROUS_OUTPUT_EXTENSIONS = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.command',
  '.desktop',
  '.dll',
  '.dylib',
  '.exe',
  '.lnk',
  '.plist',
  '.ps1',
  '.service',
  '.sh',
  '.so',
]);

const DANGEROUS_OUTPUT_FILENAMES = new Set([
  '.bash_profile',
  '.bashrc',
  '.profile',
  '.zprofile',
  '.zshenv',
  '.zshrc',
]);

const DANGEROUS_PATH_SEGMENTS = [
  '.aws',
  '.config/autostart',
  '.gnupg',
  '.local/share/applications',
  '.ssh',
  'library/application support/google/chrome',
  'library/application support/mozilla',
  'library/keychains',
  'library/launchagents',
  'library/launchdaemons',
  'microsoft/windows/start menu/programs/startup',
];

const DENIED_COMMAND_NAMES = new Set([
  'bash',
  'bun',
  'cmd',
  'cmd.exe',
  'deno',
  'fish',
  'node',
  'osascript',
  'powershell',
  'powershell.exe',
  'pwsh',
  'python',
  'python3',
  'sh',
  'zsh',
]);

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

function normalizePolicyPath(path: string): string {
  return normalize(path).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function isUrlLike(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function isDangerousPath(path: string): boolean {
  const normalized = normalizePolicyPath(path);
  return DANGEROUS_PATH_SEGMENTS.some((segment) => {
    return (
      normalized === segment ||
      normalized.startsWith(`${segment}/`) ||
      normalized.endsWith(`/${segment}`) ||
      normalized.includes(`/${segment}/`)
    );
  });
}

function policyBasename(path: string): string {
  return basename(path.replace(/\\/g, '/')).toLowerCase();
}

function isDangerousOutputFilename(path: string): boolean {
  const name = policyBasename(path);
  if (DANGEROUS_OUTPUT_FILENAMES.has(name)) {
    return true;
  }
  return DANGEROUS_OUTPUT_EXTENSIONS.has(extname(name));
}

function assertSafePluginWritePath(path: string): void {
  if (!path || !path.trim()) {
    throw new Error('Plugin write path is empty.');
  }
  if (isUrlLike(path)) {
    throw new Error(`Plugin write path must be a local file path: ${path}`);
  }
  if (isDangerousPath(path) || isDangerousOutputFilename(path)) {
    throw new Error(`Blocked unsafe plugin output path: ${path}`);
  }
}

function assertSafeCommandPath(command: string): void {
  const commandName = policyBasename(command);
  if (DENIED_COMMAND_NAMES.has(commandName)) {
    throw new Error(`Blocked unsafe command for plugin runtime: ${commandName}`);
  }
}

function assertSafeToolArgs(toolName: string, args: string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = String(args[index] ?? '').trim();
    if (!arg || isUrlLike(arg)) {
      continue;
    }
    const normalizedArg = arg.replace(/^file:/i, '');
    const commandName = policyBasename(normalizedArg);
    if (DENIED_COMMAND_NAMES.has(commandName)) {
      throw new Error(`Blocked unsafe ${toolName} argument: ${arg}`);
    }
    if (isDangerousOutputFilename(normalizedArg) || isDangerousPath(normalizedArg)) {
      throw new Error(`Blocked unsafe ${toolName} output argument: ${arg}`);
    }
  }
}

function getBridgeUrl(): string {
  const value = process.env.YOUWEE_PLUGIN_BRIDGE_URL;
  if (!value) {
    throw new Error('Youwee plugin bridge is not available in this runtime.');
  }
  return value.replace(/\/+$/, '');
}

function getBridgeToken(): string {
  const value = process.env.YOUWEE_PLUGIN_BRIDGE_TOKEN;
  if (!value) {
    throw new Error('Youwee plugin bridge token is missing.');
  }
  return value;
}

async function bridgeRequest<T>(operation: string, payload: unknown): Promise<T> {
  const response = await fetch(`${getBridgeUrl()}${operation}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getBridgeToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload ?? {}),
  });
  const body = (await response.json()) as BridgeResponse<T>;
  if (!response.ok || !body.ok) {
    throw new Error(body.error || `Youwee plugin bridge request failed: ${operation}`);
  }
  return body.result as T;
}

function getAvailableBridgeTools(): Set<string> {
  return new Set(
    (process.env.YOUWEE_PLUGIN_BRIDGE_TOOLS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function createCommandRunner(toolName: string, toolKey: string): ToolRunner {
  const available = getAvailableBridgeTools().has(toolKey);

  return {
    available,
    path: null,
    async run(args = [], options = {}) {
      if (!available) {
        throw new Error(`${toolName} is not available in this Youwee runtime.`);
      }

      assertSafeToolArgs(toolName, args);
      return await bridgeRequest<CommandResult>('/tool/run', {
        tool: toolKey,
        args,
        cwd: options.cwd,
        env: createProcessEnv(options.env || {}),
      });
    },
  };
}

function createProcessEnv(overrides: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(overrides)) {
    if (!STRIP_SUBPROCESS_ENV_KEYS.has(key)) {
      env[key] = value;
    }
  }

  return env;
}

export function spawnCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<CommandResult> {
  assertSafeCommandPath(command);
  assertSafeToolArgs('command', args);
  void options;
  return Promise.reject(
    new Error('Direct command execution is not available. Use ctx.youwee.tools instead.'),
  );
}

function createFileSystemBridge(): PluginFileSystemBridge {
  return {
    async exists(path) {
      return await bridgeRequest<boolean>('/fs/exists', { path });
    },
    async readDir(path) {
      return await bridgeRequest<PluginDirectoryEntry[]>('/fs/readDir', { path });
    },
    async readText(path) {
      return await bridgeRequest<string>('/fs/readText', { path });
    },
    async readBase64(path) {
      return await bridgeRequest<string>('/fs/readBase64', { path });
    },
    async readBytes(path) {
      return decodeBase64ToBytes(await bridgeRequest<string>('/fs/readBase64', { path }));
    },
    async writeText(path, content) {
      assertSafePluginWritePath(path);
      await bridgeRequest<null>('/fs/writeText', { path, content });
    },
    async writeBase64(path, content) {
      assertSafePluginWritePath(path);
      await bridgeRequest<null>('/fs/writeBase64', { path, content });
    },
    async writeBytes(path, content) {
      assertSafePluginWritePath(path);
      await bridgeRequest<null>('/fs/writeBase64', {
        path,
        content: encodeBytesToBase64(content),
      });
    },
    async removeFile(path) {
      assertSafePluginWritePath(path);
      await bridgeRequest<null>('/fs/removeFile', { path });
    },
    async ensureDir(path) {
      if (isDangerousPath(path)) {
        throw new Error(`Blocked unsafe plugin directory path: ${path}`);
      }
      await bridgeRequest<null>('/fs/ensureDir', { path });
    },
    async tempDir(prefix = 'youwee-plugin-') {
      return await bridgeRequest<string>('/fs/tempDir', { prefix });
    },
  };
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBytesToBase64(value: Uint8Array | ArrayBuffer | number[]): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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

function createYouTubeBridge(): YouweeYouTubeBridge {
  return {
    async searchVideos(options: YoutubeSearchOptions) {
      if (!options || typeof options !== 'object') {
        throw new Error('ctx.youwee.youtube.searchVideos(...) expects an options object.');
      }
      const query = String(options.query ?? '').trim();
      if (!query && !options.continuation) {
        throw new Error('ctx.youwee.youtube.searchVideos(...) requires a query.');
      }

      return await bridgeRequest<YoutubeSearchResponse>('/youtube/searchVideos', {
        query,
        limit: options.limit,
        continuation: options.continuation ?? null,
        filters: options.filters,
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
      ffmpeg: createCommandRunner('FFmpeg', 'ffmpeg'),
      ytdlp: createCommandRunner('yt-dlp', 'ytdlp'),
    },
    fs: createFileSystemBridge(),
    http: createHttpBridge(),
    youtube: createYouTubeBridge(),
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
  const chain: PluginChainState = payload.chainState
    ? { ...payload.chainState, recovered: payload.chainState.recovered ?? false }
    : {
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
        recovered: false,
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
