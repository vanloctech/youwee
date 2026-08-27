import * as LucideIcons from 'lucide-react';
import { Check, type LucideIcon, Puzzle } from 'lucide-react';
import type {
  PluginCompatibilitySpec,
  PluginConfigField,
  PluginConfigFieldInputType,
  PluginConfigFieldValue,
  PluginFilesystemPermission,
  PluginManifestIconName,
  PluginPackageInspection,
  PluginPermissionApproval,
  PluginProvider,
  PluginRuntimeLanguage,
  PluginSummary,
  PluginToolPermission,
} from '@/lib/types';
import { cn } from '@/lib/utils';

export type InstallPluginSourceInput = {
  kind: 'package-ywp';
  value: string;
};

export type WorkflowTrigger =
  | 'download.queued'
  | 'download.beforeStart'
  | 'download.completed'
  | 'download.failed';

export type CreatePluginConfigOptionDraft = {
  clientId: string;
  value: string;
  label: string;
};

export type CreatePluginConfigFieldDraft = {
  clientId: string;
  key: string;
  label: string;
  description: string;
  placeholder: string;
  required: boolean;
  sensitive: boolean;
  inputType: PluginConfigFieldInputType;
  defaultValueText: string;
  defaultValueBoolean: boolean;
  defaultValueMulti: string[];
  options: CreatePluginConfigOptionDraft[];
  min: string;
  max: string;
  step: string;
};

export type CreatePluginFormState = {
  name: string;
  destinationRoot: string;
  icon: PluginManifestIconName | '';
  id: string;
  slug: string;
  version: string;
  description: string;
  author: string;
  homepage: string;
  repository: string;
  license: string;
  timeoutSec: string;
  supportedProviders: PluginProvider[];
  triggers: WorkflowTrigger[];
  permissionNetwork: boolean;
  permissionFilesystem: PluginFilesystemPermission[];
  permissionTools: PluginToolPermission[];
  configFields: CreatePluginConfigFieldDraft[];
};

export type PluginConfigDraftValue = string | boolean | string[];

export type CreatePluginConfigValidation = {
  fieldErrors: Record<string, string[]>;
  globalErrors: string[];
  hasErrors: boolean;
};

export type PluginGuideDialogState = {
  title: string;
  content: string;
} | null;

export const PROVIDER_LABELS: Record<PluginProvider, string> = {
  deno: 'Deno',
  python: 'Python',
};

export const LANGUAGE_LABELS: Record<PluginRuntimeLanguage, string> = {
  javascript: 'JavaScript',
  python: 'Python',
};

export const CONFIG_FIELD_INPUT_TYPES: PluginConfigFieldInputType[] = [
  'text',
  'textarea',
  'password',
  'number',
  'boolean',
  'file',
  'directory',
  'select',
  'multi-select',
];

export const FILESYSTEM_PERMISSIONS: PluginFilesystemPermission[] = [
  'fs.plugin.read',
  'fs.plugin.write',
  'fs.payload-file.read',
  'fs.payload-directory.read',
  'fs.payload-directory.write',
  'fs.temp.read',
  'fs.temp.write',
  'fs.user-selected.read',
  'fs.user-selected.write',
];

export const TOOL_PERMISSIONS: PluginToolPermission[] = ['tool.ffmpeg.run', 'tool.ytdlp.run'];

export const WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
  'download.queued',
  'download.beforeStart',
  'download.completed',
  'download.failed',
];

export const WORKFLOW_TRIGGER_TONES: Record<
  WorkflowTrigger,
  {
    cardClassName: string;
    titleBadgeClassName: string;
    titleClassName: string;
    panelClassName: string;
    emptyClassName: string;
    stepClassName: string;
    triggerButtonSelectedClassName: string;
  }
> = {
  'download.queued': {
    cardClassName:
      '!p-5 relative overflow-hidden rounded-[1.4rem] bg-background/78 backdrop-blur-2xl transition-all duration-500',
    titleBadgeClassName: 'bg-slate-500/15 text-slate-700 dark:bg-slate-400/15 dark:text-slate-200',
    titleClassName: 'text-slate-800 dark:text-slate-100',
    panelClassName: 'border-slate-500/20 bg-background/70 relative z-10',
    emptyClassName: 'border-slate-500/20 bg-background/65 relative z-10',
    stepClassName: 'border-slate-500/20 bg-background/75 relative z-10',
    triggerButtonSelectedClassName:
      'border-slate-500/40 bg-slate-500/12 text-slate-700 dark:text-slate-200',
  },
  'download.beforeStart': {
    cardClassName:
      '!p-5 relative overflow-hidden rounded-[1.4rem] bg-background/78 backdrop-blur-2xl transition-all duration-500',
    titleBadgeClassName: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    titleClassName: 'text-amber-900 dark:text-amber-100',
    panelClassName: 'border-amber-500/20 bg-background/70 relative z-10',
    emptyClassName: 'border-amber-500/20 bg-background/65 relative z-10',
    stepClassName: 'border-amber-500/20 bg-background/75 relative z-10',
    triggerButtonSelectedClassName:
      'border-amber-500/45 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  },
  'download.completed': {
    cardClassName:
      '!p-5 relative overflow-hidden rounded-[1.4rem] bg-background/78 backdrop-blur-2xl transition-all duration-500',
    titleBadgeClassName:
      'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    titleClassName: 'text-emerald-900 dark:text-emerald-100',
    panelClassName: 'border-emerald-500/20 bg-background/70 relative z-10',
    emptyClassName: 'border-emerald-500/20 bg-background/65 relative z-10',
    stepClassName: 'border-emerald-500/20 bg-background/75 relative z-10',
    triggerButtonSelectedClassName:
      'border-emerald-500/45 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
  'download.failed': {
    cardClassName:
      '!p-5 relative overflow-hidden rounded-[1.4rem] bg-background/78 backdrop-blur-2xl transition-all duration-500',
    titleBadgeClassName: 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
    titleClassName: 'text-rose-900 dark:text-rose-100',
    panelClassName: 'border-rose-500/20 bg-background/70 relative z-10',
    emptyClassName: 'border-rose-500/20 bg-background/65 relative z-10',
    stepClassName: 'border-rose-500/20 bg-background/75 relative z-10',
    triggerButtonSelectedClassName:
      'border-rose-500/45 bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
};

export const DEFAULT_CREATE_PLUGIN_FORM: CreatePluginFormState = {
  name: '',
  destinationRoot: '',
  icon: '',
  id: '',
  slug: '',
  version: '0.1.0',
  description: '',
  author: '',
  homepage: '',
  repository: '',
  license: 'MIT',
  timeoutSec: '60',
  supportedProviders: ['deno'],
  triggers: ['download.completed'],
  permissionNetwork: false,
  permissionFilesystem: [],
  permissionTools: [],
  configFields: [],
};

const LUCIDE_ICON_REGISTRY = LucideIcons as Record<string, LucideIcon | unknown>;

export function summarizeRequestedPermissions(
  plugin: PluginSummary | PluginPackageInspection,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const permissions = plugin.manifest.permissions;
  const entries: string[] = [];
  if (permissions.network) entries.push(t('download.pluginPermissionNetwork'));
  if (permissions.fs.length > 0) {
    entries.push(
      ...permissions.fs.map((permission) => getFilesystemPermissionLabel(permission, t)),
    );
  }
  if (permissions.tools.length > 0) {
    entries.push(...permissions.tools.map((permission) => getToolPermissionLabel(permission, t)));
  }
  return entries;
}

export function buildRequestedPermissionApproval(plugin: PluginSummary): PluginPermissionApproval {
  return {
    network: plugin.manifest.permissions.network,
    fs: [...plugin.manifest.permissions.fs],
    tools: [...plugin.manifest.permissions.tools],
  };
}

export function hasUnapprovedRequestedPermissions(plugin: PluginSummary) {
  const requested = buildRequestedPermissionApproval(plugin);
  return (
    (requested.network && !plugin.installation.approvedPermissions.network) ||
    requested.fs.some(
      (permission) => !plugin.installation.approvedPermissions.fs.includes(permission),
    ) ||
    requested.tools.some(
      (permission) => !plugin.installation.approvedPermissions.tools.includes(permission),
    )
  );
}

export function currentProvider(plugin: PluginSummary) {
  return (
    plugin.installation.selectedProvider ??
    plugin.manifest.runtime.preferredProvider ??
    plugin.manifest.runtime.supportedProviders[0]
  );
}

export function currentTimeoutSec(plugin: PluginSummary) {
  return plugin.installation.timeoutSecOverride ?? plugin.manifest.timeoutSec;
}

export function summarizeCompatibility(
  compatibility: PluginCompatibilitySpec | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const entries: string[] = [];
  if (compatibility?.appVersion) {
    entries.push(`${t('download.pluginCompatibilityApp')}: ${compatibility.appVersion}`);
  }
  if (compatibility?.sdkVersion) {
    entries.push(`${t('download.pluginCompatibilitySdk')}: ${compatibility.sdkVersion}`);
  }
  return entries;
}

export function formatPluginIdentifier(pluginId: string, slug: string) {
  if (pluginId.endsWith(`.${slug}`)) {
    return pluginId;
  }
  return `${pluginId} • ${slug}`;
}

export function formatChecksum(checksum: string) {
  if (checksum.length <= 20) return checksum;
  return `${checksum.slice(0, 8)}...${checksum.slice(-8)}`;
}

export function formatSignerFingerprint(fingerprint: string) {
  if (fingerprint.length <= 24) return fingerprint;
  return `${fingerprint.slice(0, 12)}...${fingerprint.slice(-12)}`;
}

export function formatSourceKind(
  kind: PluginSummary['installation']['source']['kind'] | PluginPackageInspection['source']['kind'],
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  switch (kind) {
    case 'workspace':
      return t('download.pluginSourceWorkspace');
    case 'package-ywp':
      return t('download.pluginSourcePackageYwp');
    default:
      return kind;
  }
}

export function formatPackageFormat(
  format: string | null | undefined,
  version: number | null | undefined,
) {
  if (!format) return null;
  return version ? `${format.toUpperCase()} v${version}` : format.toUpperCase();
}

export function formatSignatureStatus(
  status: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  switch (status) {
    case 'signed':
      return t('download.pluginSignatureSigned');
    case 'invalid-signature':
      return t('download.pluginSignatureInvalid');
    case 'missing-signature':
      return t('download.pluginSignatureMissing');
    case 'signer-changed':
      return t('download.pluginSignatureSignerChanged');
    default:
      return t('download.pluginSignatureUnknown');
  }
}

export function formatRuntimeStatusBadge(
  status: string | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  if (status === 'running') return t('download.pluginStatusRunning');
  if (status === 'success') return t('download.pluginStatusSuccess');
  if (status === 'error') return t('download.pluginStatusError');
  return status;
}

function toLucideIconName(value: string) {
  return value
    .trim()
    .replace(/\.svg$/i, '')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function resolvePluginManifestIcon(icon: string | null | undefined): LucideIcon | null {
  const trimmed = icon?.trim();
  if (!trimmed) return null;

  const direct = LUCIDE_ICON_REGISTRY[trimmed];
  if (typeof direct === 'function') {
    return direct as LucideIcon;
  }

  const normalized = toLucideIconName(trimmed);
  const resolved = LUCIDE_ICON_REGISTRY[normalized];
  return typeof resolved === 'function' ? (resolved as LucideIcon) : null;
}

export function renderPluginManifestIcon(
  icon: PluginManifestIconName | string | null | undefined,
  className = 'h-4 w-4',
) {
  const Icon = resolvePluginManifestIcon(icon) ?? Puzzle;
  return <Icon className={className} />;
}

type ToggleChoiceCardProps = {
  checked: boolean;
  label: string;
  description?: string;
  onToggle: () => void;
  className?: string;
};

export function ToggleChoiceCard({
  checked,
  label,
  description,
  onToggle,
  className,
}: ToggleChoiceCardProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-start transition-all',
        checked
          ? 'border-primary/35 bg-primary/[0.07] shadow-sm'
          : 'border-border/60 bg-background/70 hover:border-border hover:bg-muted/35',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border/70 bg-background text-transparent group-hover:border-primary/35',
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </span>

      <span className="min-w-0 flex-1 space-y-1">
        <span className="block break-words text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="block break-words text-xs text-muted-foreground">{description}</span>
        )}
      </span>
    </button>
  );
}

export function getFilesystemPermissionLabel(
  permission: PluginFilesystemPermission,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  switch (permission) {
    case 'fs.plugin.read':
      return t('download.pluginPermissionFsPluginRead');
    case 'fs.plugin.write':
      return t('download.pluginPermissionFsPluginWrite');
    case 'fs.payload-file.read':
      return t('download.pluginPermissionFsPayloadFileRead');
    case 'fs.payload-directory.read':
      return t('download.pluginPermissionFsPayloadDirectoryRead');
    case 'fs.payload-directory.write':
      return t('download.pluginPermissionFsPayloadDirectoryWrite');
    case 'fs.temp.read':
      return t('download.pluginPermissionFsTempRead');
    case 'fs.temp.write':
      return t('download.pluginPermissionFsTempWrite');
    case 'fs.user-selected.read':
      return t('download.pluginPermissionFsUserSelectedRead');
    case 'fs.user-selected.write':
      return t('download.pluginPermissionFsUserSelectedWrite');
  }
}

export function getToolPermissionLabel(
  permission: PluginToolPermission,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  switch (permission) {
    case 'tool.ffmpeg.run':
      return t('download.pluginPermissionToolFfmpeg');
    case 'tool.ytdlp.run':
      return t('download.pluginPermissionToolYtdlp');
  }
}

export function validateCreatePluginConfigFields(
  fields: CreatePluginConfigFieldDraft[],
  t: (key: string, opts?: Record<string, unknown>) => string,
  options?: {
    activeFieldIds?: Set<string>;
    showAll?: boolean;
  },
): CreatePluginConfigValidation {
  const fieldErrors: Record<string, string[]> = {};
  const globalErrors: string[] = [];
  const seenKeys = new Map<string, string>();
  const activeFieldIds = options?.activeFieldIds ?? new Set<string>();
  const showAll = options?.showAll ?? false;

  const addFieldError = (clientId: string, message: string) => {
    fieldErrors[clientId] = [...(fieldErrors[clientId] ?? []), message];
  };

  for (const field of fields) {
    const isActive = showAll || activeFieldIds.has(field.clientId);
    if (!isActive) {
      continue;
    }

    const trimmedKey = field.key.trim();
    const trimmedLabel = field.label.trim();

    if (!trimmedKey) {
      addFieldError(field.clientId, t('download.pluginCreateConfigErrorKeyRequired'));
    } else if (seenKeys.has(trimmedKey)) {
      addFieldError(
        field.clientId,
        t('download.pluginCreateConfigErrorDuplicateKey', { key: trimmedKey }),
      );
      addFieldError(
        seenKeys.get(trimmedKey) ?? '',
        t('download.pluginCreateConfigErrorDuplicateKey', { key: trimmedKey }),
      );
    } else {
      seenKeys.set(trimmedKey, field.clientId);
    }

    if (!trimmedLabel) {
      addFieldError(field.clientId, t('download.pluginCreateConfigErrorLabelRequired'));
    }

    const usesOptions = field.inputType === 'select' || field.inputType === 'multi-select';
    const normalizedOptions = field.options
      .map((option) => ({
        value: option.value.trim(),
        label: option.label.trim(),
      }))
      .filter((option) => option.value || option.label);

    if (usesOptions) {
      if (normalizedOptions.length === 0) {
        addFieldError(field.clientId, t('download.pluginCreateConfigErrorOptionsRequired'));
      } else {
        const seenOptionValues = new Set<string>();
        for (const option of normalizedOptions) {
          if (!option.value) {
            addFieldError(field.clientId, t('download.pluginCreateConfigErrorOptionValueRequired'));
          }
          if (!option.label) {
            addFieldError(field.clientId, t('download.pluginCreateConfigErrorOptionLabelRequired'));
          }
          if (option.value) {
            if (seenOptionValues.has(option.value)) {
              addFieldError(
                field.clientId,
                t('download.pluginCreateConfigErrorOptionDuplicate', { value: option.value }),
              );
            }
            seenOptionValues.add(option.value);
          }
        }
      }
    }

    if (field.inputType === 'number') {
      for (const [key, rawValue] of [
        ['default', field.defaultValueText],
        ['min', field.min],
        ['max', field.max],
        ['step', field.step],
      ] as const) {
        const trimmed = rawValue.trim();
        if (trimmed && !Number.isFinite(Number(trimmed))) {
          addFieldError(
            field.clientId,
            t('download.pluginCreateConfigErrorNumberInvalid', { key }),
          );
        }
      }

      const min = field.min.trim() ? Number(field.min) : null;
      const max = field.max.trim() ? Number(field.max) : null;
      if (min != null && max != null && min > max) {
        addFieldError(field.clientId, t('download.pluginCreateConfigErrorMinGreaterThanMax'));
      }
    }

    if (
      (field.inputType === 'text' ||
        field.inputType === 'textarea' ||
        field.inputType === 'password' ||
        field.inputType === 'select') &&
      field.defaultValueText.trim() &&
      usesOptions
    ) {
      const validValues = new Set(normalizedOptions.map((option) => option.value).filter(Boolean));
      if (!validValues.has(field.defaultValueText.trim())) {
        addFieldError(field.clientId, t('download.pluginCreateConfigErrorDefaultOption'));
      }
    }

    if (field.inputType === 'multi-select' && field.defaultValueMulti.length > 0) {
      const validValues = new Set(normalizedOptions.map((option) => option.value).filter(Boolean));
      for (const value of field.defaultValueMulti) {
        if (!validValues.has(value)) {
          addFieldError(
            field.clientId,
            t('download.pluginCreateConfigErrorDefaultMultiOption', { value }),
          );
        }
      }
    }
  }

  if (fields.length > 0 && Object.keys(fieldErrors).length > 0) {
    globalErrors.push(t('download.pluginCreateConfigErrorSummary'));
  }

  return {
    fieldErrors,
    globalErrors,
    hasErrors: globalErrors.length > 0 || Object.keys(fieldErrors).length > 0,
  };
}

function createDraftId() {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyConfigOptionDraft(): CreatePluginConfigOptionDraft {
  return {
    clientId: createDraftId(),
    value: '',
    label: '',
  };
}

export function createEmptyConfigFieldDraft(): CreatePluginConfigFieldDraft {
  return {
    clientId: createDraftId(),
    key: '',
    label: '',
    description: '',
    placeholder: '',
    required: false,
    sensitive: false,
    inputType: 'text',
    defaultValueText: '',
    defaultValueBoolean: false,
    defaultValueMulti: [],
    options: [createEmptyConfigOptionDraft()],
    min: '',
    max: '',
    step: '',
  };
}

export function parseConfigFieldDraft(field: CreatePluginConfigFieldDraft): PluginConfigField {
  const options = field.options
    .map((option) => ({
      value: option.value.trim(),
      label: option.label.trim() || option.value.trim(),
    }))
    .filter((option) => option.value);

  let defaultValue: PluginConfigFieldValue | undefined;
  switch (field.inputType) {
    case 'boolean':
      defaultValue = field.defaultValueBoolean;
      break;
    case 'multi-select':
      defaultValue = field.defaultValueMulti.filter(Boolean);
      break;
    case 'number': {
      const raw = field.defaultValueText.trim();
      if (raw) {
        defaultValue = Number(raw);
      }
      break;
    }
    default: {
      const raw = field.defaultValueText.trim();
      if (raw) {
        defaultValue = raw;
      }
      break;
    }
  }

  return {
    key: field.key.trim(),
    inputType: field.inputType,
    label: field.label.trim(),
    description: field.description.trim() || null,
    placeholder: field.placeholder.trim() || null,
    required: field.required,
    defaultValue: defaultValue ?? null,
    sensitive: field.sensitive,
    options,
    min: field.min.trim() ? Number(field.min) : null,
    max: field.max.trim() ? Number(field.max) : null,
    step: field.step.trim() ? Number(field.step) : null,
  };
}

export function getResolvedConfigFieldValue(
  plugin: PluginSummary,
  field: PluginConfigField,
): PluginConfigFieldValue | undefined {
  const savedValue = plugin.installation.configValues[field.key];
  if (savedValue !== undefined) {
    return savedValue as PluginConfigFieldValue;
  }
  return field.defaultValue ?? undefined;
}

export function stringifyConfigFieldValue(value: PluginConfigFieldValue | undefined) {
  if (value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export function formatConfigFieldDefaultValue(value: PluginConfigFieldValue | undefined) {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}
