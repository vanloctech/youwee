import type { PluginDefinition, PluginHooks } from './types';

export {
  assertCompatibleAppVersion,
  checkAppVersionCompatibility,
  compareSemver,
  parseSemver,
  SDK_VERSION,
  satisfiesVersionRange,
} from './compatibility';
export { createJsonShapeValidator, matchesJsonShape } from './schema';

export const TRIGGERS = Object.freeze({
  downloadQueued: 'download.queued',
  downloadBeforeStart: 'download.beforeStart',
  downloadCompleted: 'download.completed',
  downloadFailed: 'download.failed',
});

export const triggers = TRIGGERS;

export function definePlugin(config: PluginDefinition): PluginDefinition {
  if (!config || typeof config !== 'object') {
    throw new Error('definePlugin(...) expects a plugin config object.');
  }

  if (!config.meta || typeof config.meta !== 'object') {
    throw new Error('Plugin config is missing meta.');
  }

  if (!config.meta.name || !String(config.meta.name).trim()) {
    throw new Error('Plugin meta.name is required.');
  }

  if (!config.meta.version || !String(config.meta.version).trim()) {
    throw new Error('Plugin meta.version is required.');
  }

  if (!config.hooks || typeof config.hooks !== 'object') {
    throw new Error('Plugin config is missing hooks.');
  }

  return config;
}

export function defineHooks<T extends PluginHooks>(hooks: T): T {
  if (!hooks || typeof hooks !== 'object') {
    throw new Error('defineHooks(...) expects a hook map.');
  }
  return hooks;
}

export {
  createPluginPackageDefinition,
  createPluginPackageJson,
  getAllowedProviders,
  getManifestValidationErrors,
  slugifyPluginName,
  validatePluginManifest,
} from './manifest';
export {
  buildPluginPackage,
  generatePluginKeyPair,
  packPluginPackage,
  readPackagedBuildInfo,
  validatePackagedManifest,
  verifyPluginPackage,
} from './packager';

export type {
  AIBridge,
  AIConfigSnapshot,
  AIExtractJsonOptions,
  AISummarizeOptions,
  AITextOptions,
  BuildPluginPackageInput,
  BuildPluginPackageResult,
  CommandResult,
  CompatibilityCheckResult,
  DownloadBeforeStartContext,
  DownloadBeforeStartPayload,
  DownloadCompletedContext,
  DownloadCompletedPayload,
  DownloadFailedContext,
  DownloadFailedPayload,
  DownloadQueuedContext,
  DownloadQueuedPayload,
  GeneratePluginKeyPairResult,
  JsonShapeArrayDescriptor,
  JsonShapeDescriptor,
  JsonShapeObjectDescriptor,
  ManifestValidationResult,
  PackagedPluginBuildInfo,
  PackagedPluginChecksums,
  PackagedPluginSignature,
  PackPluginPackageInput,
  PackPluginPackageResult,
  ParsedSemver,
  PluginChainMutation,
  PluginChainState,
  PluginConfigBridge,
  PluginConfigField,
  PluginConfigFieldInputType,
  PluginConfigFieldOption,
  PluginConfigFieldValue,
  PluginContext,
  PluginDefinition,
  PluginFileSystemBridge,
  PluginFilesystemPermission,
  PluginHookHandler,
  PluginHooks,
  PluginHttpBridge,
  PluginHttpRequestOptions,
  PluginHttpResponse,
  PluginI18nBridge,
  PluginI18nManifestSpec,
  PluginLogger,
  PluginManifest,
  PluginMeta,
  PluginPackageDefinitionInput,
  PluginPayload,
  PluginPermissionRequest,
  PluginProvider,
  PluginResult,
  PluginRuntimeLanguage,
  PluginRuntimeSpec,
  PluginSignaturePayload,
  PluginTrigger,
  ToolRunner,
  TriggerPayloadMap,
  VerifyPluginPackageResult,
  YouweeBridge,
} from './types';
