export type PluginTrigger =
  | 'download.queued'
  | 'download.beforeStart'
  | 'download.completed'
  | 'download.failed';

export type PluginRuntimeLanguage = 'javascript' | 'python';
export type PluginProvider = 'deno' | 'python';
export type PluginManifestIconName = string;

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
}

export type JsonShapeLeaf =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'
  | 'unknown';

export interface JsonShapeArrayDescriptor {
  type: 'array';
  items?: JsonShapeDescriptor;
}

export interface JsonShapeObjectDescriptor {
  type: 'object';
  properties?: Record<string, JsonShapeDescriptor>;
  required?: string[];
}

export type JsonShapeDescriptor =
  | JsonShapeLeaf
  | JsonShapeArrayDescriptor
  | JsonShapeObjectDescriptor;

export interface PluginMeta {
  name: string;
  version: string;
  description?: string;
}

export interface BasePluginPayload {
  jobId: string;
  source?: string | null;
  trigger: string;
  filepath: string;
  filename: string;
  directory: string;
  filesize?: number | null;
  format?: string | null;
  quality?: string | null;
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  historyId?: string | null;
  timeRange?: string | null;
  downloadKind: string;
  workflowRunId?: string | null;
  workflowStepIndex?: number | null;
  workflowStepPluginId?: string | null;
  chainState?: PluginChainState | null;
}

export interface PluginChainMutation {
  activeFilepath?: string | null;
  activeFilename?: string | null;
  extraFiles?: string[];
  metadataPatch?: unknown;
}

export interface PluginChainState {
  jobId: string;
  source?: string | null;
  downloadKind: string;
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  historyId?: string | null;
  timeRange?: string | null;
  activeFilepath: string;
  activeFilename: string;
  directory: string;
  filesize?: number | null;
  format?: string | null;
  quality?: string | null;
  extraFiles: string[];
  metadata?: unknown;
}

export interface DownloadQueuedPayload extends BasePluginPayload {
  trigger: 'download.queued';
}

export interface DownloadBeforeStartPayload extends BasePluginPayload {
  trigger: 'download.beforeStart';
}

export interface DownloadCompletedPayload extends BasePluginPayload {
  trigger: 'download.completed';
}

export interface DownloadFailedPayload extends BasePluginPayload {
  trigger: 'download.failed';
}

export type PluginPayload =
  | DownloadQueuedPayload
  | DownloadBeforeStartPayload
  | DownloadCompletedPayload
  | DownloadFailedPayload
  | BasePluginPayload;

export interface TriggerPayloadMap {
  'download.queued': DownloadQueuedPayload;
  'download.beforeStart': DownloadBeforeStartPayload;
  'download.completed': DownloadCompletedPayload;
  'download.failed': DownloadFailedPayload;
}

export interface PluginResult {
  success: boolean;
  message?: string | null;
  artifacts?: unknown;
  metadata?: unknown;
  mutations?: PluginChainMutation | null;
}

export interface CommandResult {
  code: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

export interface ToolRunner {
  available: boolean;
  path: string | null;
  run(
    args?: string[],
    options?: { cwd?: string; env?: Record<string, string> },
  ): Promise<CommandResult>;
}

export interface AIConfigSnapshot {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  timeoutSeconds: number;
  summaryStyle: string;
  summaryLanguage: string;
  whisperEnabled: boolean;
  hasApiKey: boolean;
  hasWhisperApiKey: boolean;
}

export interface AITextOptions {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
}

export interface AISummarizeOptions {
  text: string;
  instructions?: string;
  title?: string;
  maxSentences?: number;
}

export interface AIExtractJsonOptions {
  prompt: string;
  schemaDescription?: string;
  systemPrompt?: string;
  temperature?: number;
  validate?: (value: unknown) => boolean;
}

export interface AIBridge {
  available(): boolean;
  getConfig(): AIConfigSnapshot;
  generateText(options: string | AITextOptions): Promise<string>;
  summarize(options: string | AISummarizeOptions): Promise<string>;
  extractJson<T = unknown>(options: string | AIExtractJsonOptions): Promise<T>;
}

export interface PluginFileSystemBridge {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  tempDir(prefix?: string): Promise<string>;
}

export interface PluginHttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface PluginHttpResponse<TBody = string> {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: TBody;
}

export interface PluginHttpBridge {
  request(url: string, options?: PluginHttpRequestOptions): Promise<PluginHttpResponse<string>>;
  get(url: string, headers?: Record<string, string>): Promise<PluginHttpResponse<string>>;
  getJson<T = unknown>(
    url: string,
    headers?: Record<string, string>,
  ): Promise<PluginHttpResponse<T>>;
  postJson<T = unknown>(
    url: string,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<PluginHttpResponse<T>>;
}

export interface CompatibilityCheckResult {
  compatible: boolean;
  currentVersion: string | null;
  requiredRange: string;
  reason?: string;
}

export interface PluginSdkBridge {
  version: string;
  checkAppVersion(range: string): CompatibilityCheckResult;
  assertAppVersion(range: string): void;
}

export interface PluginI18nManifestSpec {
  defaultLocale?: string;
  supportedLocales?: string[];
  directory?: string;
}

export interface PluginI18nBridge {
  locale: string;
  fallbackLocale: string;
  defaultLocale: string;
  supportedLocales: string[];
  t(key: string, params?: Record<string, unknown>): string;
  has(key: string, locale?: string): boolean;
  raw(key: string, locale?: string): string | null;
}

export type PluginConfigFieldInputType =
  | 'text'
  | 'textarea'
  | 'password'
  | 'number'
  | 'boolean'
  | 'file'
  | 'directory'
  | 'select'
  | 'multi-select';

export type PluginFilesystemPermission =
  | 'fs.plugin.read'
  | 'fs.plugin.write'
  | 'fs.payload-file.read'
  | 'fs.payload-directory.read'
  | 'fs.payload-directory.write'
  | 'fs.temp.read'
  | 'fs.temp.write'
  | 'fs.user-selected.read'
  | 'fs.user-selected.write';

export interface PluginConfigFieldOption {
  value: string;
  label: string;
}

export type PluginConfigFieldValue = string | number | boolean | string[];

export interface PluginConfigField {
  key: string;
  inputType: PluginConfigFieldInputType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: PluginConfigFieldValue;
  sensitive?: boolean;
  options?: PluginConfigFieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface PluginConfigBridge {
  get<T extends PluginConfigFieldValue = PluginConfigFieldValue>(key: string): T | undefined;
  require<T extends PluginConfigFieldValue = PluginConfigFieldValue>(key: string): T;
  has(key: string): boolean;
  all(): Record<string, PluginConfigFieldValue>;
}

export interface YouweeBridge {
  app: {
    version: string | null;
    locale: string | null;
    fallbackLocale: string | null;
    direction: string | null;
  };
  sdk: PluginSdkBridge;
  plugin: {
    id: string | null;
    slug: string | null;
    name: string | null;
    version: string | null;
  };
  runtime: {
    language: string | null;
    provider: string | null;
    providerSource: string | null;
    timeoutMs: number | null;
  };
  tools: {
    ffmpeg: ToolRunner;
    ytdlp: ToolRunner;
  };
  fs: PluginFileSystemBridge;
  http: PluginHttpBridge;
  ai: AIBridge;
}

export interface PluginLogger {
  debug(message: string, metadata?: unknown): void;
  info(message: string, metadata?: unknown): void;
  warn(message: string, metadata?: unknown): void;
  error(message: string, metadata?: unknown): void;
}

export interface PluginContext<TPayload extends PluginPayload = PluginPayload> {
  payload: TPayload;
  trigger: TPayload['trigger'];
  download: {
    jobId: string;
    kind: string;
    source: string | null;
    historyId: string | null;
    timeRange: string | null;
  };
  file: {
    path: string;
    name: string;
    directory: string;
    size: number | null;
    format: string | null;
    quality: string | null;
  };
  media: {
    url: string;
    title: string | null;
    thumbnail: string | null;
  };
  chain: PluginChainState;
  config: PluginConfigBridge;
  env: {
    get(name: string): string | undefined;
    require(name: string): string;
    has(name: string): boolean;
  };
  log: PluginLogger;
  i18n: PluginI18nBridge;
  youwee: YouweeBridge;
  ok(
    message: string,
    metadata?: unknown,
    artifacts?: unknown,
    mutations?: PluginChainMutation | null,
  ): PluginResult;
  fail(
    message: string,
    metadata?: unknown,
    artifacts?: unknown,
    mutations?: PluginChainMutation | null,
  ): PluginResult;
}

export type DownloadQueuedContext = PluginContext<DownloadQueuedPayload>;
export type DownloadBeforeStartContext = PluginContext<DownloadBeforeStartPayload>;
export type DownloadCompletedContext = PluginContext<DownloadCompletedPayload>;
export type DownloadFailedContext = PluginContext<DownloadFailedPayload>;

export type PluginHookHandler<
  TPayload extends PluginPayload = PluginPayload,
  TResult extends PluginResult | undefined = PluginResult | undefined,
> = (ctx: PluginContext<TPayload>) => Promise<TResult> | TResult;

export type KnownPluginHooks = {
  [K in keyof TriggerPayloadMap]?: PluginHookHandler<TriggerPayloadMap[K]>;
};

export type PluginHooks = KnownPluginHooks &
  Partial<Record<string, PluginHookHandler<PluginPayload>>>;

export interface PluginDefinition<THooks extends PluginHooks = PluginHooks> {
  meta: PluginMeta;
  hooks: THooks;
}

export interface PluginPermissionRequest {
  network?: boolean;
  fs?: PluginFilesystemPermission[];
}

export interface PluginRuntimeSpec {
  language: PluginRuntimeLanguage;
  supportedProviders: PluginProvider[];
  preferredProvider?: PluginProvider;
  entrypoint: string;
}

export interface PluginManifest {
  id: string;
  slug: string;
  name: string;
  version: string;
  icon?: PluginManifestIconName;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  runtime: PluginRuntimeSpec;
  triggers?: string[];
  permissions?: PluginPermissionRequest;
  configFields?: PluginConfigField[];
  timeoutSec?: number;
  readme?: string;
  checksum?: string;
  publishedAt?: string;
  i18n?: PluginI18nManifestSpec;
  compatibility?: {
    appVersion?: string;
    sdkVersion?: string;
  };
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PluginPackageDefinitionInput {
  name: string;
  version: string;
  description?: string;
  main?: string;
  sdkVersion?: string;
}

export interface BuildPluginPackageInput {
  cwd?: string;
}

export interface BuildPluginPackageResult {
  rootDir: string;
  sourceManifestPath: string;
  sourceManifest: PluginManifest;
  runtimeManifest: PluginManifest;
  distEntrypoint: string;
  copiedFiles: string[];
}

export interface PackagedPluginBuilderInfo {
  tool: string;
  version: string;
}

export interface PackagedPluginBundleInfo {
  entrypoint: string;
  bundled: boolean;
  includesDependencies: boolean;
  moduleFormat: string;
}

export interface PackagedPluginBuildInfo {
  packageFormat: 'ywp';
  packageFormatVersion: 1;
  packagedAt: string;
  builder: PackagedPluginBuilderInfo;
  bundle: PackagedPluginBundleInfo;
}

export interface PackagedPluginChecksums {
  algorithm: 'sha256';
  files: Record<string, string>;
}

export interface PluginSignaturePayload {
  checksumsPath: 'checksums.json';
  checksumsSha256: string;
  pluginId: string;
  pluginVersion: string;
  packageFormat: 'ywp';
  packageFormatVersion: 1;
}

export interface PackagedPluginSignature {
  version: 1;
  algorithm: 'ed25519';
  keyId: string;
  fingerprint: string;
  publicKey: string;
  signedAt: string;
  payload: PluginSignaturePayload;
  signature: string;
}

export interface GeneratePluginKeyPairResult {
  version: 1;
  algorithm: 'ed25519';
  keyId: string;
  fingerprint: string;
  publicKey: string;
  privateKey: string;
}

export interface VerifyPluginPackageResult {
  valid: boolean;
  packagePath: string;
  manifest?: PluginManifest;
  buildInfo?: PackagedPluginBuildInfo;
  checksums?: PackagedPluginChecksums;
  signature?: PackagedPluginSignature;
  signerKeyId?: string;
  signerFingerprint?: string;
  error?: string;
}

export interface PackPluginPackageInput {
  cwd?: string;
  outDir?: string;
  privateKeyPath?: string;
}

export interface PackPluginPackageResult {
  packagePath: string;
  packageChecksum: string;
  manifest: PluginManifest;
  buildInfo: PackagedPluginBuildInfo;
  signature: PackagedPluginSignature;
}
