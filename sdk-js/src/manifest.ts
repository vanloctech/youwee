import { SDK_VERSION, satisfiesVersionRange } from './compatibility';
import type {
  ManifestValidationResult,
  PluginConfigField,
  PluginFilesystemPermission,
  PluginManifest,
  PluginPackageDefinitionInput,
  PluginProvider,
  PluginRuntimeLanguage,
} from './types';

const PROVIDERS_BY_LANGUAGE: Record<PluginRuntimeLanguage, PluginProvider[]> = {
  javascript: ['deno'],
  python: ['python'],
};

const ALLOWED_TRIGGERS = new Set([
  'download.queued',
  'download.beforeStart',
  'download.completed',
  'download.failed',
]);

const ALLOWED_CONFIG_INPUT_TYPES = new Set([
  'text',
  'textarea',
  'password',
  'number',
  'boolean',
  'file',
  'directory',
  'select',
  'multi-select',
]);

const ALLOWED_FILESYSTEM_PERMISSIONS = new Set<PluginFilesystemPermission>([
  'fs.plugin.read',
  'fs.plugin.write',
  'fs.payload-file.read',
  'fs.payload-directory.read',
  'fs.payload-directory.write',
  'fs.temp.read',
  'fs.temp.write',
  'fs.user-selected.read',
  'fs.user-selected.write',
]);

function validateConfigFieldDefaultValue(field: PluginConfigField): string | null {
  const value = field.defaultValue;
  if (value === undefined) return null;

  switch (field.inputType) {
    case 'text':
    case 'textarea':
    case 'password':
    case 'file':
    case 'directory':
    case 'select':
      return typeof value === 'string' ? null : `${field.key} defaultValue must be a string.`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : `${field.key} defaultValue must be a number.`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `${field.key} defaultValue must be a boolean.`;
    case 'multi-select':
      return Array.isArray(value) && value.every((item) => typeof item === 'string')
        ? null
        : `${field.key} defaultValue must be an array of strings.`;
    default:
      return `Unsupported inputType for ${field.key}.`;
  }
}

function validateConfigField(field: PluginConfigField, index: number): string[] {
  const errors: string[] = [];
  const label = field.key?.trim() || `configFields[${index}]`;

  if (!field.key?.trim()) {
    errors.push(`configFields[${index}].key is required.`);
  }
  if (!field.label?.trim()) {
    errors.push(`${label} label is required.`);
  }
  if (!ALLOWED_CONFIG_INPUT_TYPES.has(field.inputType)) {
    errors.push(`${label} has unsupported inputType "${field.inputType}".`);
  }

  const requiresOptions = field.inputType === 'select' || field.inputType === 'multi-select';
  if (requiresOptions) {
    if (!field.options?.length) {
      errors.push(`${label} must declare options for ${field.inputType}.`);
    }
  } else if (field.options?.length) {
    errors.push(`${label} cannot declare options for ${field.inputType}.`);
  }

  if (field.options?.length) {
    const optionValues = new Set<string>();
    for (const option of field.options) {
      if (!option.value?.trim()) {
        errors.push(`${label} has an option with an empty value.`);
      }
      if (!option.label?.trim()) {
        errors.push(`${label} has an option with an empty label.`);
      }
      if (optionValues.has(option.value)) {
        errors.push(`${label} has duplicate option value "${option.value}".`);
      }
      optionValues.add(option.value);
    }
  }

  const defaultValueError = validateConfigFieldDefaultValue(field);
  if (defaultValueError) {
    errors.push(defaultValueError);
  }

  if (
    field.inputType === 'select' &&
    typeof field.defaultValue === 'string' &&
    field.options?.length
  ) {
    if (!field.options.some((option) => option.value === field.defaultValue)) {
      errors.push(`${label} defaultValue must match one declared option.`);
    }
  }

  if (
    field.inputType === 'multi-select' &&
    Array.isArray(field.defaultValue) &&
    field.options?.length
  ) {
    const allowedValues = new Set(field.options.map((option) => option.value));
    for (const item of field.defaultValue) {
      if (!allowedValues.has(item)) {
        errors.push(`${label} defaultValue contains unsupported option "${item}".`);
      }
    }
  }

  const usesNumberBounds =
    field.min !== undefined || field.max !== undefined || field.step !== undefined;
  if (field.inputType !== 'number' && usesNumberBounds) {
    errors.push(`${label} can only use min, max, or step with number fields.`);
  }
  if (field.inputType === 'number') {
    for (const [name, value] of [
      ['min', field.min],
      ['max', field.max],
      ['step', field.step],
    ] as const) {
      if (value !== undefined && (!Number.isFinite(value) || Number.isNaN(value))) {
        errors.push(`${label} ${name} must be a finite number.`);
      }
    }
    if (typeof field.min === 'number' && typeof field.max === 'number' && field.min > field.max) {
      errors.push(`${label} min cannot be greater than max.`);
    }
  }

  return errors;
}

export function slugifyPluginName(input: string): string {
  let slug = '';
  let previousDash = false;

  for (const char of input.trim()) {
    if (/^[a-z0-9]$/i.test(char)) {
      slug += char.toLowerCase();
      previousDash = false;
      continue;
    }

    if (!previousDash) {
      slug += '-';
      previousDash = true;
    }
  }

  const normalized = slug.replace(/^-+|-+$/g, '');
  return normalized || 'plugin';
}

export function getAllowedProviders(language: PluginRuntimeLanguage): PluginProvider[] {
  return [...PROVIDERS_BY_LANGUAGE[language]];
}

export function getManifestValidationErrors(manifest: PluginManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id?.trim()) {
    errors.push('id is required.');
  }

  if (!manifest.slug?.trim()) {
    errors.push('slug is required.');
  }

  if (!manifest.name?.trim()) {
    errors.push('name is required.');
  }

  if (!manifest.version?.trim()) {
    errors.push('version is required.');
  }

  if (typeof manifest.icon === 'string' && manifest.icon.trim() === '') {
    errors.push('icon cannot be empty when provided.');
  }

  if (!manifest.runtime) {
    errors.push('runtime is required.');
    return errors;
  }

  if (!manifest.runtime.entrypoint?.trim()) {
    errors.push('runtime.entrypoint is required.');
  }

  if (!manifest.runtime.supportedProviders?.length) {
    errors.push('runtime.supportedProviders must contain at least one provider.');
  } else {
    const allowedProviders = new Set(getAllowedProviders(manifest.runtime.language));
    for (const provider of manifest.runtime.supportedProviders) {
      if (!allowedProviders.has(provider)) {
        errors.push(
          `runtime.supportedProviders contains unsupported provider "${provider}" for language "${manifest.runtime.language}".`,
        );
      }
    }
  }

  if (
    manifest.runtime.preferredProvider &&
    !manifest.runtime.supportedProviders?.includes(manifest.runtime.preferredProvider)
  ) {
    errors.push('runtime.preferredProvider must be included in runtime.supportedProviders.');
  }

  if (typeof manifest.timeoutSec === 'number' && manifest.timeoutSec <= 0) {
    errors.push('timeoutSec must be greater than 0.');
  }

  if (manifest.permissions && 'env' in (manifest.permissions as Record<string, unknown>)) {
    errors.push(
      'permissions.env is obsolete. Define plugin configuration fields with configFields instead.',
    );
  }

  if (manifest.permissions?.fs?.length) {
    const seenFs = new Set<string>();
    for (const permission of manifest.permissions.fs) {
      if (!ALLOWED_FILESYSTEM_PERMISSIONS.has(permission)) {
        errors.push(`permissions.fs contains unsupported capability "${permission}".`);
      } else if (seenFs.has(permission)) {
        errors.push(`permissions.fs contains duplicate capability "${permission}".`);
      } else {
        seenFs.add(permission);
      }
    }

    const needsUserSelected =
      manifest.permissions.fs.includes('fs.user-selected.read') ||
      manifest.permissions.fs.includes('fs.user-selected.write');
    if (
      needsUserSelected &&
      !manifest.configFields?.some(
        (field) => field.inputType === 'file' || field.inputType === 'directory',
      )
    ) {
      errors.push(
        'permissions.fs uses fs.user-selected.* but configFields does not declare any file or directory inputs.',
      );
    }
  }

  if (!manifest.triggers?.length) {
    errors.push('triggers must contain at least one runtime trigger string.');
  } else {
    for (const trigger of manifest.triggers) {
      if (!ALLOWED_TRIGGERS.has(trigger)) {
        if (trigger.startsWith('triggers.')) {
          errors.push(
            `triggers contains "${trigger}", but plugin.json must use raw runtime names like "download.completed", not SDK identifiers like "triggers.downloadCompleted".`,
          );
        } else {
          errors.push(`triggers contains unsupported runtime trigger "${trigger}".`);
        }
      }
    }
  }

  if (manifest.i18n?.defaultLocale) {
    if (
      manifest.i18n.supportedLocales?.length &&
      !manifest.i18n.supportedLocales.includes(manifest.i18n.defaultLocale)
    ) {
      errors.push('i18n.defaultLocale must be included in i18n.supportedLocales.');
    }
  }

  if (manifest.i18n?.directory) {
    const directory = manifest.i18n.directory.trim();
    if (!directory) {
      errors.push('i18n.directory cannot be empty.');
    } else if (directory.startsWith('/') || directory.split(/[\\/]/).includes('..')) {
      errors.push('i18n.directory must stay inside the plugin package.');
    }
  }

  if (manifest.compatibility?.appVersion) {
    try {
      satisfiesVersionRange('0.0.0', manifest.compatibility.appVersion);
    } catch (error) {
      errors.push(
        `compatibility.appVersion is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (manifest.compatibility?.sdkVersion) {
    try {
      satisfiesVersionRange('0.0.0', manifest.compatibility.sdkVersion);
    } catch (error) {
      errors.push(
        `compatibility.sdkVersion is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (manifest.configFields?.length) {
    const seenKeys = new Set<string>();
    for (const [index, field] of manifest.configFields.entries()) {
      if (field.key?.trim()) {
        if (seenKeys.has(field.key)) {
          errors.push(`configFields contains duplicate key "${field.key}".`);
        }
        seenKeys.add(field.key);
      }
      errors.push(...validateConfigField(field, index));
    }
  }

  return errors;
}

export function validatePluginManifest(manifest: PluginManifest): ManifestValidationResult {
  const errors = getManifestValidationErrors(manifest);
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function createPluginPackageDefinition(
  input: PluginPackageDefinitionInput,
): Record<string, unknown> {
  const main = input.main || 'src/plugin.js';
  const sdkVersion = input.sdkVersion || `^${SDK_VERSION}`;

  return {
    name: input.name,
    version: input.version,
    private: true,
    description: input.description || 'Youwee plugin package',
    type: 'commonjs',
    main,
    scripts: {
      build: 'bunx youwee-sdk build',
      pack: 'bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json',
      keygen: 'bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json',
      'test:deno':
        'deno run --quiet --unstable-detect-cjs --allow-env --allow-read=. --allow-write=. --allow-run node_modules/youwee-sdk/dist/runtime-cli.js src/plugin.js',
    },
    dependencies: {
      'youwee-sdk': sdkVersion,
    },
  };
}

export function createPluginPackageJson(input: PluginPackageDefinitionInput): string {
  return `${JSON.stringify(createPluginPackageDefinition(input), null, 2)}\n`;
}
