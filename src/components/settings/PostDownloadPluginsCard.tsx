import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Atom,
  Blocks,
  Bot,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  Globe,
  Info,
  MoveDown,
  MoveUp,
  PackageOpen,
  Plug,
  Plus,
  Puzzle,
  RefreshCw,
  Shield,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginLogsDialog } from '@/components/settings/PluginLogsDialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { localizeUnknownError } from '@/lib/backend-error';
import { buildWorkflowSnapshotMap, savePluginWorkflowSnapshots } from '@/lib/post-download-plugins';
import type {
  LogEntry,
  PluginCompatibilitySpec,
  PluginConfigField,
  PluginConfigFieldInputType,
  PluginConfigFieldValue,
  PluginExecutionStatusEvent,
  PluginFilesystemPermission,
  PluginLogsPage,
  PluginManifestIconName,
  PluginPackageInspection,
  PluginPermissionApproval,
  PluginProvider,
  PluginRuntimeLanguage,
  PluginSummary,
  PluginTriggerWorkflow,
  PluginWorkflowFailurePolicy,
  PluginWorkspaceSummary,
  RuntimeProviderStatus,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { SettingsCard } from './SettingsSection';

type InstallPluginSourceInput = {
  kind: 'package-ywp';
  value: string;
};

type CreatePluginFormState = {
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
  configFields: CreatePluginConfigFieldDraft[];
};

type PluginConfigDraftValue = string | boolean | string[];

type CreatePluginConfigOptionDraft = {
  clientId: string;
  value: string;
  label: string;
};

type CreatePluginConfigFieldDraft = {
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

type CreatePluginConfigValidation = {
  fieldErrors: Record<string, string[]>;
  globalErrors: string[];
  hasErrors: boolean;
};

type PluginGuideDialogState = {
  title: string;
  content: string;
} | null;

type PluginReminderToastState = {
  pluginId: string;
  pluginName: string;
  pluginIcon?: PluginManifestIconName | null;
} | null;

const PROVIDER_LABELS: Record<PluginProvider, string> = {
  deno: 'Deno',
  python: 'Python',
};

const LANGUAGE_LABELS: Record<PluginRuntimeLanguage, string> = {
  javascript: 'JavaScript',
  python: 'Python',
};

const CONFIG_FIELD_INPUT_TYPES: PluginConfigFieldInputType[] = [
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

const FILESYSTEM_PERMISSIONS: PluginFilesystemPermission[] = [
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

const PLUGIN_ICON_OPTIONS: PluginManifestIconName[] = [
  'puzzle',
  'atom',
  'plug',
  'blocks',
  'package-open',
  'bot',
  'shield',
  'wrench',
  'globe',
  'folder-open',
  'terminal-square',
  'info',
];

function summarizeRequestedPermissions(
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
  return entries;
}

function buildRequestedPermissionApproval(plugin: PluginSummary): PluginPermissionApproval {
  return {
    network: plugin.manifest.permissions.network,
    fs: [...plugin.manifest.permissions.fs],
  };
}

function hasUnapprovedRequestedPermissions(plugin: PluginSummary) {
  const requested = buildRequestedPermissionApproval(plugin);
  return (
    (requested.network && !plugin.installation.approvedPermissions.network) ||
    requested.fs.some(
      (permission) => !plugin.installation.approvedPermissions.fs.includes(permission),
    )
  );
}

function currentProvider(plugin: PluginSummary) {
  return (
    plugin.installation.selectedProvider ??
    plugin.manifest.runtime.preferredProvider ??
    plugin.manifest.runtime.supportedProviders[0]
  );
}

function currentTimeoutSec(plugin: PluginSummary) {
  return plugin.installation.timeoutSecOverride ?? plugin.manifest.timeoutSec;
}

function summarizeCompatibility(
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

function formatPluginIdentifier(pluginId: string, slug: string) {
  if (pluginId.endsWith(`.${slug}`)) {
    return pluginId;
  }
  return `${pluginId} • ${slug}`;
}

function formatChecksum(checksum: string) {
  if (checksum.length <= 20) return checksum;
  return `${checksum.slice(0, 8)}...${checksum.slice(-8)}`;
}

function formatSignerFingerprint(fingerprint: string) {
  if (fingerprint.length <= 24) return fingerprint;
  return `${fingerprint.slice(0, 12)}...${fingerprint.slice(-12)}`;
}

function formatSourceKind(
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

function formatPackageFormat(
  format: string | null | undefined,
  version: number | null | undefined,
) {
  if (!format) return null;
  return version ? `${format.toUpperCase()} v${version}` : format.toUpperCase();
}

function formatSignatureStatus(
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

function formatRuntimeStatusBadge(
  status: string | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  if (status === 'running') return t('download.pluginStatusRunning');
  if (status === 'success') return t('download.pluginStatusSuccess');
  if (status === 'error') return t('download.pluginStatusError');
  return status;
}

const WORKFLOW_TRIGGERS = [
  'download.queued',
  'download.beforeStart',
  'download.completed',
  'download.failed',
] as const;
type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

const WORKFLOW_TRIGGER_TONES: Record<
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
    cardClassName: 'bg-gradient-to-br from-slate-500/[0.10] via-background to-background',
    titleBadgeClassName: 'bg-slate-500/15 text-slate-700 dark:bg-slate-400/15 dark:text-slate-200',
    titleClassName: 'text-slate-800 dark:text-slate-100',
    panelClassName: 'border-slate-500/20 bg-background/70',
    emptyClassName: 'border-slate-500/20 bg-background/65',
    stepClassName: 'border-slate-500/20 bg-background/75',
    triggerButtonSelectedClassName:
      'border-slate-500/40 bg-slate-500/12 text-slate-700 dark:text-slate-200',
  },
  'download.beforeStart': {
    cardClassName: 'bg-gradient-to-br from-amber-500/[0.12] via-background to-background',
    titleBadgeClassName: 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
    titleClassName: 'text-amber-900 dark:text-amber-100',
    panelClassName: 'border-amber-500/20 bg-background/70',
    emptyClassName: 'border-amber-500/20 bg-background/65',
    stepClassName: 'border-amber-500/20 bg-background/75',
    triggerButtonSelectedClassName:
      'border-amber-500/45 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  },
  'download.completed': {
    cardClassName: 'bg-gradient-to-br from-emerald-500/[0.12] via-background to-background',
    titleBadgeClassName:
      'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
    titleClassName: 'text-emerald-900 dark:text-emerald-100',
    panelClassName: 'border-emerald-500/20 bg-background/70',
    emptyClassName: 'border-emerald-500/20 bg-background/65',
    stepClassName: 'border-emerald-500/20 bg-background/75',
    triggerButtonSelectedClassName:
      'border-emerald-500/45 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
  'download.failed': {
    cardClassName: 'bg-gradient-to-br from-rose-500/[0.12] via-background to-background',
    titleBadgeClassName: 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
    titleClassName: 'text-rose-900 dark:text-rose-100',
    panelClassName: 'border-rose-500/20 bg-background/70',
    emptyClassName: 'border-rose-500/20 bg-background/65',
    stepClassName: 'border-rose-500/20 bg-background/75',
    triggerButtonSelectedClassName:
      'border-rose-500/45 bg-rose-500/12 text-rose-700 dark:text-rose-300',
  },
};

const DEFAULT_CREATE_PLUGIN_FORM: CreatePluginFormState = {
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
  configFields: [],
};

function getPluginIconLabel(
  icon: PluginManifestIconName,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  switch (icon) {
    case 'puzzle':
      return t('download.pluginIconPuzzle');
    case 'atom':
      return t('download.pluginIconAtom');
    case 'plug':
      return t('download.pluginIconPlug');
    case 'blocks':
      return t('download.pluginIconBlocks');
    case 'package-open':
      return t('download.pluginIconPackageOpen');
    case 'bot':
      return t('download.pluginIconBot');
    case 'shield':
      return t('download.pluginIconShield');
    case 'wrench':
      return t('download.pluginIconWrench');
    case 'globe':
      return t('download.pluginIconGlobe');
    case 'folder-open':
      return t('download.pluginIconFolderOpen');
    case 'terminal-square':
      return t('download.pluginIconTerminalSquare');
    case 'info':
      return t('download.pluginIconInfo');
  }
}

function renderPluginManifestIcon(
  icon: PluginManifestIconName | string | null | undefined,
  className = 'h-4 w-4',
) {
  switch (icon) {
    case 'atom':
      return <Atom className={className} />;
    case 'plug':
      return <Plug className={className} />;
    case 'blocks':
      return <Blocks className={className} />;
    case 'package-open':
      return <PackageOpen className={className} />;
    case 'bot':
      return <Bot className={className} />;
    case 'shield':
      return <Shield className={className} />;
    case 'wrench':
      return <Wrench className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'folder-open':
      return <FolderOpen className={className} />;
    case 'terminal-square':
      return <TerminalSquare className={className} />;
    case 'info':
      return <Info className={className} />;
    default:
      return <Puzzle className={className} />;
  }
}

type ToggleChoiceCardProps = {
  checked: boolean;
  label: string;
  description?: string;
  onToggle: () => void;
  className?: string;
};

function ToggleChoiceCard({
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
        'group flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all',
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

function getFilesystemPermissionLabel(
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

function validateCreatePluginConfigFields(
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

function createEmptyConfigFieldDraft(): CreatePluginConfigFieldDraft {
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

function parseConfigFieldDraft(field: CreatePluginConfigFieldDraft): PluginConfigField {
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

function getResolvedConfigFieldValue(
  plugin: PluginSummary,
  field: PluginConfigField,
): PluginConfigFieldValue | undefined {
  const savedValue = plugin.installation.configValues[field.key];
  if (savedValue !== undefined) {
    return savedValue as PluginConfigFieldValue;
  }
  return field.defaultValue ?? undefined;
}

function stringifyConfigFieldValue(value: PluginConfigFieldValue | undefined) {
  if (value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function formatConfigFieldDefaultValue(value: PluginConfigFieldValue | undefined) {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

export function PostDownloadPluginsCard() {
  const { t } = useTranslation('settings');
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [providers, setProviders] = useState<RuntimeProviderStatus[]>([]);
  const [workflows, setWorkflows] = useState<Record<string, PluginTriggerWorkflow>>({});
  const [workflowCandidates, setWorkflowCandidates] = useState<Record<string, string>>({});
  const [defaultProviders, setDefaultProviders] = useState<
    Partial<Record<PluginRuntimeLanguage, PluginProvider>>
  >({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [runtimeGuideOpen, setRuntimeGuideOpen] = useState(false);
  const [pluginGuideDialog, setPluginGuideDialog] = useState<PluginGuideDialogState>(null);
  const [importDisclaimerOpen, setImportDisclaimerOpen] = useState(false);
  const [pluginReminderToast, setPluginReminderToast] = useState<PluginReminderToastState>(null);
  const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null);
  const [createPluginForm, setCreatePluginForm] = useState<CreatePluginFormState>(
    DEFAULT_CREATE_PLUGIN_FORM,
  );
  const [inspection, setInspection] = useState<PluginPackageInspection | null>(null);
  const [installSource, setInstallSource] = useState<InstallPluginSourceInput | null>(null);
  const [installAcknowledged, setInstallAcknowledged] = useState(false);
  const [configDrafts, setConfigDrafts] = useState<Record<string, PluginConfigDraftValue>>({});
  const [timeoutDrafts, setTimeoutDrafts] = useState<Record<string, string>>({});
  const [runtimeStatuses, setRuntimeStatuses] = useState<
    Record<string, { status: string; message?: string | null }>
  >({});
  const [logsOpen, setLogsOpen] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoadingMore, setLogsLoadingMore] = useState(false);
  const [logsClearing, setLogsClearing] = useState(false);
  const [pluginLogs, setPluginLogs] = useState<LogEntry[]>([]);
  const [pluginLogsTotal, setPluginLogsTotal] = useState(0);
  const [pluginLogsHasMore, setPluginLogsHasMore] = useState(false);
  const [pluginLogsOffset, setPluginLogsOffset] = useState(0);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [pluginLogsError, setPluginLogsError] = useState<string | null>(null);
  const [clearLogsConfirmOpen, setClearLogsConfirmOpen] = useState(false);
  const [permissionDialogPlugin, setPermissionDialogPlugin] = useState<PluginSummary | null>(null);
  const [permissionDialogState, setPermissionDialogState] = useState<PluginPermissionApproval>({
    network: false,
    fs: [],
  });
  const [createdWorkspace, setCreatedWorkspace] = useState<PluginWorkspaceSummary | null>(null);
  const [createPluginConfigTouched, setCreatePluginConfigTouched] = useState<
    Record<string, boolean>
  >({});
  const [createPluginSubmitAttempted, setCreatePluginSubmitAttempted] = useState(false);
  const [attachWorkspacePath, setAttachWorkspacePath] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<PluginSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pluginReminderToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createPluginConfigValidation = useMemo(
    () =>
      validateCreatePluginConfigFields(createPluginForm.configFields, t, {
        activeFieldIds: new Set(
          Object.entries(createPluginConfigTouched)
            .filter(([, touched]) => touched)
            .map(([clientId]) => clientId),
        ),
        showAll: createPluginSubmitAttempted,
      }),
    [createPluginConfigTouched, createPluginForm.configFields, createPluginSubmitAttempted, t],
  );
  const createPluginCanSubmit =
    !creating &&
    createPluginForm.name.trim().length > 0 &&
    createPluginForm.destinationRoot.trim().length > 0 &&
    !createPluginConfigValidation.hasErrors;

  const clearPluginReminderToast = useCallback(() => {
    setPluginReminderToast(null);
    if (pluginReminderToastTimeoutRef.current) {
      clearTimeout(pluginReminderToastTimeoutRef.current);
      pluginReminderToastTimeoutRef.current = null;
    }
  }, []);

  const showPluginReminderToast = useCallback(
    (plugin: PluginSummary) => {
      clearPluginReminderToast();
      setPluginReminderToast({
        pluginId: plugin.manifest.id,
        pluginName: plugin.manifest.name,
        pluginIcon: plugin.manifest.icon,
      });
      pluginReminderToastTimeoutRef.current = setTimeout(() => {
        setPluginReminderToast(null);
        pluginReminderToastTimeoutRef.current = null;
      }, 5000);
    },
    [clearPluginReminderToast],
  );

  const isPluginAssignedToAnyWorkflow = useCallback(
    (pluginId: string) =>
      Object.values(workflows).some((workflow) =>
        workflow.steps.some((step) => step.pluginId === pluginId),
      ),
    [workflows],
  );

  useEffect(
    () => () => {
      if (pluginReminderToastTimeoutRef.current) {
        clearTimeout(pluginReminderToastTimeoutRef.current);
      }
    },
    [],
  );

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pluginResult, providerResult, workflowResults] = await Promise.all([
        invoke<PluginSummary[]>('list_plugins'),
        invoke<RuntimeProviderStatus[]>('list_runtime_providers'),
        Promise.all(
          WORKFLOW_TRIGGERS.map((trigger) =>
            invoke<PluginTriggerWorkflow>('get_plugin_trigger_workflow', { trigger }),
          ),
        ),
      ]);
      setPlugins(pluginResult);
      setProviders(providerResult);
      setWorkflows(
        Object.fromEntries(workflowResults.map((workflow) => [workflow.trigger, workflow])),
      );

      const defaults: Partial<Record<PluginRuntimeLanguage, PluginProvider>> = {};
      const statuses: Record<string, { status: string; message?: string | null }> = {};
      for (const plugin of pluginResult) {
        const language = plugin.manifest.runtime.language;
        if (!defaults[language]) {
          defaults[language] = currentProvider(plugin);
        }
        if (plugin.installation.lastExecutionStatus || plugin.installation.lastError) {
          statuses[plugin.manifest.id] = {
            status: plugin.installation.lastExecutionStatus ?? 'idle',
            message: plugin.installation.lastError,
          };
        }
      }
      setDefaultProviders(defaults);
      setRuntimeStatuses(statuses);
      savePluginWorkflowSnapshots(buildWorkflowSnapshotMap(pluginResult, workflowResults));
    } catch (err) {
      console.error('Failed to load plugins:', err);
      setError(t('download.pluginLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    savePluginWorkflowSnapshots(
      buildWorkflowSnapshotMap(
        plugins,
        WORKFLOW_TRIGGERS.map((trigger) => workflows[trigger] ?? { trigger, steps: [] }),
      ),
    );
  }, [workflows, plugins]);

  useEffect(() => {
    let isMounted = true;

    const setup = async () => {
      const unlisten = await listen<PluginExecutionStatusEvent>(
        'plugin-execution-status',
        (event) => {
          if (!isMounted) return;
          setRuntimeStatuses((current) => ({
            ...current,
            [event.payload.pluginId]: {
              status: event.payload.status,
              message: event.payload.message,
            },
          }));
        },
      );

      if (!isMounted) {
        unlisten();
      }

      return unlisten;
    };

    let cleanup: (() => void) | undefined;
    setup().then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      isMounted = false;
      cleanup?.();
    };
  }, []);

  const updatePluginList = (updater: (items: PluginSummary[]) => PluginSummary[]) => {
    setPlugins((current) => {
      const next = updater(current);
      savePluginWorkflowSnapshots(
        buildWorkflowSnapshotMap(
          next,
          WORKFLOW_TRIGGERS.map((trigger) => workflows[trigger] ?? { trigger, steps: [] }),
        ),
      );
      return next;
    });
  };

  const inspectSource = async (source: InstallPluginSourceInput, command: string, key: string) => {
    setInspecting(true);
    setError(null);
    try {
      const result = await invoke<PluginPackageInspection>(command, { [key]: source.value });
      setInspection(result);
      setInstallSource(source);
      setInstallAcknowledged(false);
    } catch (err) {
      console.error('Failed to inspect plugin package:', err);
      setError(localizeUnknownError(err));
      setInspection(null);
      setInstallSource(null);
    } finally {
      setInspecting(false);
    }
  };

  const handleImportPackage = async () => {
    setImportDisclaimerOpen(true);
  };

  const handleConfirmImportPackage = async () => {
    setImportDisclaimerOpen(false);
    const selected = await open({
      directory: false,
      multiple: false,
      title: t('download.pluginImportPlugin'),
      filters: [{ name: 'Youwee Plugin File', extensions: ['ywp'] }],
    });
    if (typeof selected !== 'string') return;
    await inspectSource({ kind: 'package-ywp', value: selected }, 'inspect_plugin_package', 'path');
  };

  const handlePickWorkspaceRoot = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: t('download.pluginCreatePickLocation'),
    });
    if (typeof selected !== 'string') return;
    updateCreatePluginForm('destinationRoot', selected);
  };

  const handleAttachWorkspace = async (workspacePath?: string) => {
    const selected =
      workspacePath ??
      (await open({
        directory: true,
        multiple: false,
        title: t('download.pluginAttachWorkspace'),
      }));

    if (typeof selected !== 'string' || !selected) return;
    setAttachWorkspacePath(selected);
  };

  const handleConfirmAttachWorkspace = async () => {
    if (!attachWorkspacePath) return;
    setError(null);
    try {
      await invoke<PluginSummary>('attach_plugin_workspace', {
        input: { value: attachWorkspacePath },
      });
      setAttachWorkspacePath(null);
      await loadPlugins();
    } catch (err) {
      console.error('Failed to attach plugin workspace:', err);
      setError(localizeUnknownError(err));
    }
  };

  const promptPluginPermissionEnable = (plugin: PluginSummary) => {
    const requested = buildRequestedPermissionApproval(plugin);
    setPermissionDialogPlugin(plugin);
    setPermissionDialogState({
      network: requested.network ? plugin.installation.approvedPermissions.network : false,
      fs: requested.fs.filter((permission) =>
        plugin.installation.approvedPermissions.fs.includes(permission),
      ),
    });
  };

  const handleInstallInspection = async () => {
    if (!inspection || !installSource) return;
    setInstalling(true);
    setError(null);
    try {
      const installedPlugin = await invoke<PluginSummary>('install_plugin_package', {
        path: installSource.value,
        trusted: true,
      });
      setInspection(null);
      setInstallSource(null);
      setInstallAcknowledged(false);
      await loadPlugins();
      if (hasUnapprovedRequestedPermissions(installedPlugin)) {
        promptPluginPermissionEnable(installedPlugin);
      }
    } catch (err) {
      console.error('Failed to install plugin:', err);
      setError(localizeUnknownError(err));
    } finally {
      setInstalling(false);
    }
  };

  const handleTogglePlugin = async (plugin: PluginSummary, enabled: boolean) => {
    if (enabled && hasUnapprovedRequestedPermissions(plugin)) {
      promptPluginPermissionEnable(plugin);
      return;
    }

    try {
      await invoke('update_plugin_state', { pluginId: plugin.manifest.id, enabled });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === plugin.manifest.id
            ? {
                ...item,
                installation: { ...item.installation, enabled },
              }
            : item,
        ),
      );
      if (enabled && !isPluginAssignedToAnyWorkflow(plugin.manifest.id)) {
        showPluginReminderToast(plugin);
      }
    } catch (err) {
      console.error('Failed to update plugin state:', err);
      setError(t('download.pluginStateError'));
    }
  };

  const handleEnablePluginWithPermissions = async () => {
    if (!permissionDialogPlugin) return;

    try {
      await invoke('approve_plugin_permissions', {
        pluginId: permissionDialogPlugin.manifest.id,
        permissions: permissionDialogState,
      });
      await invoke('update_plugin_state', {
        pluginId: permissionDialogPlugin.manifest.id,
        enabled: true,
      });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === permissionDialogPlugin.manifest.id
            ? {
                ...item,
                installation: {
                  ...item.installation,
                  enabled: true,
                  approvedPermissions: permissionDialogState,
                },
              }
            : item,
        ),
      );
      if (!isPluginAssignedToAnyWorkflow(permissionDialogPlugin.manifest.id)) {
        showPluginReminderToast(permissionDialogPlugin);
      }
      setPermissionDialogPlugin(null);
    } catch (err) {
      console.error('Failed to enable plugin with permissions:', err);
      setError(t('download.pluginPermissionEnableError'));
    }
  };

  const handleApprovePermissions = async (
    plugin: PluginSummary,
    permissions: PluginPermissionApproval,
  ) => {
    try {
      await invoke('approve_plugin_permissions', {
        pluginId: plugin.manifest.id,
        permissions,
      });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === plugin.manifest.id
            ? {
                ...item,
                installation: { ...item.installation, approvedPermissions: permissions },
              }
            : item,
        ),
      );
    } catch (err) {
      console.error('Failed to approve plugin permissions:', err);
      setError(t('download.pluginPermissionError'));
    }
  };

  const handleCreatePlugin = async () => {
    setCreatePluginSubmitAttempted(true);
    const trimmedName = createPluginForm.name.trim();
    const trimmedDestinationRoot = createPluginForm.destinationRoot.trim();
    const submitValidation = validateCreatePluginConfigFields(createPluginForm.configFields, t, {
      showAll: true,
    });
    if (!trimmedName || !trimmedDestinationRoot || submitValidation.hasErrors) return;

    const supportedProviders =
      createPluginForm.supportedProviders.length > 0
        ? createPluginForm.supportedProviders
        : DEFAULT_CREATE_PLUGIN_FORM.supportedProviders;
    const preferredProvider = supportedProviders[0];

    setCreating(true);
    setError(null);
    try {
      const result = await invoke<PluginWorkspaceSummary>('create_plugin_workspace', {
        input: {
          name: trimmedName,
          destinationRoot: trimmedDestinationRoot,
          icon: createPluginForm.icon || null,
          id: createPluginForm.id.trim() || null,
          slug: createPluginForm.slug.trim() || null,
          version: createPluginForm.version.trim() || null,
          description: createPluginForm.description.trim() || null,
          author: createPluginForm.author.trim() || null,
          homepage: createPluginForm.homepage.trim() || null,
          repository: createPluginForm.repository.trim() || null,
          license: createPluginForm.license.trim() || null,
          timeoutSec: Number.parseInt(createPluginForm.timeoutSec, 10) || 60,
          triggers:
            createPluginForm.triggers.length > 0
              ? createPluginForm.triggers
              : DEFAULT_CREATE_PLUGIN_FORM.triggers,
          supportedProviders,
          preferredProvider,
          configFields: createPluginForm.configFields.map(parseConfigFieldDraft),
          permissions: {
            network: createPluginForm.permissionNetwork,
            fs: createPluginForm.permissionFilesystem,
          },
        },
      });
      setCreatedWorkspace(result);
      setCreatePluginForm(DEFAULT_CREATE_PLUGIN_FORM);
      setCreatePluginConfigTouched({});
      setCreatePluginSubmitAttempted(false);
      setCreateOpen(false);
    } catch (err) {
      console.error('Failed to create plugin:', err);
      setError(localizeUnknownError(err));
    } finally {
      setCreating(false);
    }
  };

  const updateCreatePluginForm = <K extends keyof CreatePluginFormState>(
    key: K,
    value: CreatePluginFormState[K],
  ) => {
    setCreatePluginForm((current) => ({ ...current, [key]: value }));
  };

  const toggleCreatePluginProvider = (provider: PluginProvider) => {
    setCreatePluginForm((current) => {
      const exists = current.supportedProviders.includes(provider);
      const supportedProviders = exists
        ? current.supportedProviders.filter((item) => item !== provider)
        : [...current.supportedProviders, provider];

      if (supportedProviders.length === 0) {
        return {
          ...current,
          supportedProviders,
        };
      }

      return {
        ...current,
        supportedProviders,
      };
    });
  };

  const toggleCreatePluginTrigger = (trigger: WorkflowTrigger) => {
    setCreatePluginForm((current) => ({
      ...current,
      triggers: current.triggers.includes(trigger)
        ? current.triggers.filter((item) => item !== trigger)
        : [...current.triggers, trigger],
    }));
  };

  const toggleCreatePluginFilesystemPermission = (permission: PluginFilesystemPermission) => {
    setCreatePluginForm((current) => ({
      ...current,
      permissionFilesystem: current.permissionFilesystem.includes(permission)
        ? current.permissionFilesystem.filter((item) => item !== permission)
        : [...current.permissionFilesystem, permission],
    }));
  };

  const markCreatePluginConfigFieldTouched = (clientId: string) => {
    setCreatePluginConfigTouched((current) => ({ ...current, [clientId]: true }));
  };

  const addCreatePluginConfigField = () => {
    setCreatePluginForm((current) => ({
      ...current,
      configFields: [...current.configFields, createEmptyConfigFieldDraft()],
    }));
  };

  const removeCreatePluginConfigField = (index: number) => {
    const clientId = createPluginForm.configFields[index]?.clientId;
    setCreatePluginForm((current) => ({
      ...current,
      configFields: current.configFields.filter((_, fieldIndex) => fieldIndex !== index),
    }));
    if (clientId) {
      setCreatePluginConfigTouched((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
    }
  };

  const updateCreatePluginConfigField = <K extends keyof CreatePluginConfigFieldDraft>(
    index: number,
    key: K,
    value: CreatePluginConfigFieldDraft[K],
  ) => {
    const clientId = createPluginForm.configFields[index]?.clientId;
    if (clientId) {
      markCreatePluginConfigFieldTouched(clientId);
    }
    setCreatePluginForm((current) => ({
      ...current,
      configFields: current.configFields.map((field, fieldIndex) => {
        if (fieldIndex !== index) return field;

        const nextField = { ...field, [key]: value };
        if (key === 'inputType') {
          const nextInputType = value as PluginConfigFieldInputType;
          if (nextInputType === 'select' || nextInputType === 'multi-select') {
            if (nextField.options.length === 0) {
              nextField.options = [createEmptyConfigOptionDraft()];
            }
          } else {
            nextField.defaultValueMulti = [];
          }
        }
        return nextField;
      }),
    }));
  };

  const addCreatePluginConfigOption = (fieldIndex: number) => {
    const clientId = createPluginForm.configFields[fieldIndex]?.clientId;
    if (clientId) {
      markCreatePluginConfigFieldTouched(clientId);
    }
    setCreatePluginForm((current) => ({
      ...current,
      configFields: current.configFields.map((field, index) =>
        index === fieldIndex
          ? { ...field, options: [...field.options, createEmptyConfigOptionDraft()] }
          : field,
      ),
    }));
  };

  const removeCreatePluginConfigOption = (fieldIndex: number, optionIndex: number) => {
    const clientId = createPluginForm.configFields[fieldIndex]?.clientId;
    if (clientId) {
      markCreatePluginConfigFieldTouched(clientId);
    }
    setCreatePluginForm((current) => ({
      ...current,
      configFields: current.configFields.map((field, index) => {
        if (index !== fieldIndex) return field;
        const nextOptions = field.options.filter(
          (_, currentOptionIndex) => currentOptionIndex !== optionIndex,
        );
        const validValues = new Set(
          nextOptions.map((option) => option.value.trim()).filter(Boolean),
        );
        return {
          ...field,
          options: nextOptions.length > 0 ? nextOptions : [createEmptyConfigOptionDraft()],
          defaultValueMulti: field.defaultValueMulti.filter((value) => validValues.has(value)),
          defaultValueText:
            field.inputType === 'select' && validValues.has(field.defaultValueText)
              ? field.defaultValueText
              : field.inputType === 'select'
                ? ''
                : field.defaultValueText,
        };
      }),
    }));
  };

  const updateCreatePluginConfigOption = <K extends keyof CreatePluginConfigOptionDraft>(
    fieldIndex: number,
    optionIndex: number,
    key: K,
    value: CreatePluginConfigOptionDraft[K],
  ) => {
    const clientId = createPluginForm.configFields[fieldIndex]?.clientId;
    if (clientId) {
      markCreatePluginConfigFieldTouched(clientId);
    }
    setCreatePluginForm((current) => ({
      ...current,
      configFields: current.configFields.map((field, index) =>
        index === fieldIndex
          ? {
              ...field,
              options: field.options.map((option, currentOptionIndex) =>
                currentOptionIndex === optionIndex ? { ...option, [key]: value } : option,
              ),
            }
          : field,
      ),
    }));
  };

  const handleOpenPluginDirectory = async (pluginId: string) => {
    try {
      await invoke('open_plugin_directory', { pluginId });
    } catch (err) {
      console.error('Failed to open plugin directory:', err);
      setError(t('download.pluginOpenDirError'));
    }
  };

  const handleOpenWorkspacePath = async (path: string) => {
    try {
      await invoke('open_file_location', { filepath: path });
    } catch (err) {
      console.error('Failed to open workspace path:', err);
      setError(t('download.pluginWorkspaceOpenError'));
    }
  };

  const handleRefreshPlugin = async (pluginId: string) => {
    try {
      const refreshed = await invoke<PluginSummary>('get_plugin_details', { pluginId });
      updatePluginList((items) =>
        items.map((item) => (item.manifest.id === pluginId ? refreshed : item)),
      );
      setRuntimeStatuses((current) => ({
        ...current,
        [pluginId]: {
          status: refreshed.installation.lastExecutionStatus ?? current[pluginId]?.status ?? 'idle',
          message: refreshed.installation.lastError ?? current[pluginId]?.message ?? null,
        },
      }));
    } catch (err) {
      console.error('Failed to refresh plugin details:', err);
      setError(localizeUnknownError(err));
    }
  };

  const handleSetPluginProvider = async (plugin: PluginSummary, provider: PluginProvider) => {
    try {
      await invoke('set_plugin_provider', { pluginId: plugin.manifest.id, provider });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === plugin.manifest.id
            ? {
                ...item,
                installation: { ...item.installation, selectedProvider: provider },
              }
            : item,
        ),
      );
    } catch (err) {
      console.error('Failed to set plugin provider:', err);
      setError(t('download.pluginProviderError'));
    }
  };

  const setConfigDraftValue = (pluginId: string, key: string, value: PluginConfigDraftValue) => {
    setConfigDrafts((current) => ({
      ...current,
      [`${pluginId}:${key}`]: value,
    }));
  };

  const getConfigDraftValue = (
    plugin: PluginSummary,
    field: PluginConfigField,
  ): PluginConfigDraftValue => {
    const draft = configDrafts[`${plugin.manifest.id}:${field.key}`];
    if (draft !== undefined) {
      return draft;
    }

    if (field.sensitive) {
      if (field.inputType === 'boolean') {
        return Boolean(getResolvedConfigFieldValue(plugin, field));
      }
      if (field.inputType === 'multi-select') {
        const resolved = getResolvedConfigFieldValue(plugin, field);
        return Array.isArray(resolved) ? resolved : [];
      }
      return '';
    }

    const resolved = getResolvedConfigFieldValue(plugin, field);
    if (field.inputType === 'boolean') {
      return typeof resolved === 'boolean' ? resolved : false;
    }
    if (field.inputType === 'multi-select') {
      return Array.isArray(resolved) ? resolved : [];
    }
    return stringifyConfigFieldValue(resolved);
  };

  const setTimeoutDraftValue = (pluginId: string, value: string) => {
    setTimeoutDrafts((current) => ({
      ...current,
      [pluginId]: value,
    }));
  };

  const getTimeoutDraftValue = (plugin: PluginSummary) =>
    timeoutDrafts[plugin.manifest.id] ?? String(currentTimeoutSec(plugin));

  const handlePickPluginConfigPath = async (
    plugin: PluginSummary,
    field: PluginConfigField,
    directory: boolean,
  ) => {
    try {
      const selected = await open({
        directory,
        multiple: false,
      });
      if (typeof selected === 'string' && selected.trim()) {
        setConfigDraftValue(plugin.manifest.id, field.key, selected);
      }
    } catch (err) {
      console.error('Failed to pick plugin config path:', err);
      setError(localizeUnknownError(err));
    }
  };

  const handleSavePluginConfig = async (plugin: PluginSummary, field: PluginConfigField) => {
    const draftValue = getConfigDraftValue(plugin, field);
    let value: PluginConfigFieldValue | null;

    switch (field.inputType) {
      case 'boolean':
        value = Boolean(draftValue);
        break;
      case 'multi-select':
        value = Array.isArray(draftValue) ? draftValue : [];
        break;
      case 'number': {
        const raw = String(draftValue).trim();
        if (!raw) {
          value = null;
          break;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          setError(t('download.pluginConfigInvalidNumber'));
          return;
        }
        value = parsed;
        break;
      }
      default: {
        const raw = String(draftValue).trim();
        value = raw ? raw : null;
        break;
      }
    }

    try {
      await invoke('update_plugin_config_values', {
        pluginId: plugin.manifest.id,
        input: {
          values: {
            [field.key]: value,
          },
        },
      });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === plugin.manifest.id
            ? {
                ...item,
                installation: {
                  ...item.installation,
                  configValues: field.sensitive
                    ? item.installation.configValues
                    : {
                        ...item.installation.configValues,
                        ...(value === null ? {} : { [field.key]: value }),
                      },
                  configValueStatus: {
                    ...item.installation.configValueStatus,
                    [field.key]: value !== null || field.defaultValue !== undefined,
                  },
                },
              }
            : item,
        ),
      );
      setConfigDraftValue(
        plugin.manifest.id,
        field.key,
        field.inputType === 'boolean'
          ? Boolean(value)
          : field.inputType === 'multi-select'
            ? Array.isArray(value)
              ? value
              : []
            : field.sensitive
              ? ''
              : stringifyConfigFieldValue(value ?? field.defaultValue ?? undefined),
      );
    } catch (err) {
      console.error('Failed to update plugin config values:', err);
      setError(t('download.pluginConfigSaveError'));
    }
  };

  const handleClearPluginConfig = async (plugin: PluginSummary, field: PluginConfigField) => {
    try {
      await invoke('update_plugin_config_values', {
        pluginId: plugin.manifest.id,
        input: {
          values: {
            [field.key]: null,
          },
        },
      });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === plugin.manifest.id
            ? {
                ...item,
                installation: {
                  ...item.installation,
                  configValues: Object.fromEntries(
                    Object.entries(item.installation.configValues).filter(
                      ([entryKey]) => entryKey !== field.key,
                    ),
                  ),
                  configValueStatus: {
                    ...item.installation.configValueStatus,
                    [field.key]: field.defaultValue !== undefined,
                  },
                },
              }
            : item,
        ),
      );
      setConfigDraftValue(
        plugin.manifest.id,
        field.key,
        field.inputType === 'boolean'
          ? Boolean(field.defaultValue)
          : field.inputType === 'multi-select'
            ? Array.isArray(field.defaultValue)
              ? field.defaultValue
              : []
            : field.sensitive
              ? ''
              : stringifyConfigFieldValue(field.defaultValue ?? undefined),
      );
    } catch (err) {
      console.error('Failed to clear plugin config value:', err);
      setError(t('download.pluginConfigSaveError'));
    }
  };

  const handleSavePluginTimeout = async (plugin: PluginSummary) => {
    const rawValue = getTimeoutDraftValue(plugin).trim();
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('download.pluginTimeoutError'));
      return;
    }

    try {
      await invoke('set_plugin_timeout', {
        pluginId: plugin.manifest.id,
        timeoutSec: parsed,
      });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === plugin.manifest.id
            ? {
                ...item,
                installation: { ...item.installation, timeoutSecOverride: parsed },
              }
            : item,
        ),
      );
      setTimeoutDraftValue(plugin.manifest.id, String(parsed));
    } catch (err) {
      console.error('Failed to update plugin timeout:', err);
      setError(t('download.pluginTimeoutSaveError'));
    }
  };

  const handleResetPluginTimeout = async (plugin: PluginSummary) => {
    try {
      await invoke('set_plugin_timeout', {
        pluginId: plugin.manifest.id,
        timeoutSec: null,
      });
      updatePluginList((items) =>
        items.map((item) =>
          item.manifest.id === plugin.manifest.id
            ? {
                ...item,
                installation: { ...item.installation, timeoutSecOverride: null },
              }
            : item,
        ),
      );
      setTimeoutDraftValue(plugin.manifest.id, String(plugin.manifest.timeoutSec));
    } catch (err) {
      console.error('Failed to reset plugin timeout:', err);
      setError(t('download.pluginTimeoutSaveError'));
    }
  };

  const handleSetDefaultProvider = async (
    language: PluginRuntimeLanguage,
    provider: PluginProvider,
  ) => {
    try {
      await invoke('set_default_provider_for_language', { language, provider });
      setDefaultProviders((current) => ({ ...current, [language]: provider }));
    } catch (err) {
      console.error('Failed to set default provider:', err);
      setError(t('download.pluginProviderDefaultError'));
    }
  };

  const persistWorkflow = async (nextWorkflow: PluginTriggerWorkflow) => {
    try {
      const saved = await invoke<PluginTriggerWorkflow>('update_plugin_trigger_workflow', {
        workflow: nextWorkflow,
      });
      setWorkflows((current) => ({
        ...current,
        [saved.trigger]: saved,
      }));
    } catch (err) {
      console.error('Failed to update plugin workflow:', err);
      setError(localizeUnknownError(err));
    }
  };

  const handleAddWorkflowPlugin = async (trigger: WorkflowTrigger) => {
    const workflow = workflows[trigger] ?? { trigger, steps: [] };
    const pluginId = workflowCandidates[trigger] ?? '';
    if (!pluginId) return;
    await persistWorkflow({
      trigger,
      steps: [
        ...workflow.steps,
        {
          pluginId,
          failurePolicy: 'continue',
        },
      ],
    });
    setWorkflowCandidates((current) => ({ ...current, [trigger]: '' }));
  };

  const handleRemoveWorkflowStep = async (trigger: WorkflowTrigger, pluginId: string) => {
    const workflow = workflows[trigger] ?? { trigger, steps: [] };
    await persistWorkflow({
      trigger: workflow.trigger,
      steps: workflow.steps.filter((step) => step.pluginId !== pluginId),
    });
  };

  const handleMoveWorkflowStep = async (
    trigger: WorkflowTrigger,
    pluginId: string,
    direction: -1 | 1,
  ) => {
    const workflow = workflows[trigger] ?? { trigger, steps: [] };
    const index = workflow.steps.findIndex((step) => step.pluginId === pluginId);
    if (index < 0) return;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= workflow.steps.length) return;
    const steps = [...workflow.steps];
    const [current] = steps.splice(index, 1);
    steps.splice(nextIndex, 0, current);
    await persistWorkflow({
      trigger: workflow.trigger,
      steps,
    });
  };

  const handleWorkflowFailurePolicy = async (
    trigger: WorkflowTrigger,
    pluginId: string,
    failurePolicy: PluginWorkflowFailurePolicy,
  ) => {
    const workflow = workflows[trigger] ?? { trigger, steps: [] };
    await persistWorkflow({
      trigger: workflow.trigger,
      steps: workflow.steps.map((step) =>
        step.pluginId === pluginId ? { ...step, failurePolicy } : step,
      ),
    });
  };

  const workflowPluginsByTrigger = useMemo(
    () =>
      Object.fromEntries(
        WORKFLOW_TRIGGERS.map((trigger) => {
          const workflow = workflows[trigger] ?? { trigger, steps: [] };
          return [
            trigger,
            workflow.steps
              .map((step) => ({
                step,
                plugin: plugins.find((plugin) => plugin.manifest.id === step.pluginId) ?? null,
              }))
              .filter((entry) => entry.plugin != null),
          ];
        }),
      ) as Record<
        WorkflowTrigger,
        Array<{ step: PluginTriggerWorkflow['steps'][number]; plugin: PluginSummary | null }>
      >,
    [workflows, plugins],
  );

  const availableWorkflowPluginsByTrigger = useMemo(
    () =>
      Object.fromEntries(
        WORKFLOW_TRIGGERS.map((trigger) => {
          const workflow = workflows[trigger] ?? { trigger, steps: [] };
          return [
            trigger,
            plugins.filter(
              (plugin) =>
                plugin.installation.enabled &&
                plugin.manifest.triggers.includes(trigger) &&
                !workflow.steps.some((step) => step.pluginId === plugin.manifest.id),
            ),
          ];
        }),
      ) as Record<WorkflowTrigger, PluginSummary[]>,
    [workflows, plugins],
  );

  const selectedPlugin =
    selectedPluginId != null
      ? (plugins.find((plugin) => plugin.manifest.id === selectedPluginId) ?? null)
      : null;

  const inspectionCompatibilityEntries = useMemo(
    () => (inspection ? summarizeCompatibility(inspection.manifest.compatibility, t) : []),
    [inspection, t],
  );
  const inspectionSigned = inspection?.signatureStatus === 'signed';

  const loadPluginLogs = useCallback(
    async (pluginId: string, mode: 'replace' | 'append' = 'replace') => {
      const limit = 60;
      const offset = mode === 'append' ? pluginLogsOffset : 0;

      if (mode === 'append') {
        setLogsLoadingMore(true);
      } else {
        setLogsLoading(true);
        setPluginLogs([]);
        setPluginLogsTotal(0);
        setPluginLogsHasMore(false);
        setPluginLogsOffset(0);
      }

      setPluginLogsError(null);
      try {
        const result = await invoke<PluginLogsPage>('get_plugin_logs', {
          pluginId,
          limit,
          offset,
        });
        setPluginLogs((current) =>
          mode === 'append' ? [...current, ...result.items] : result.items,
        );
        setPluginLogsTotal(result.total);
        setPluginLogsHasMore(result.has_more);
        setPluginLogsOffset(offset + result.items.length);
      } catch (err) {
        console.error('Failed to load plugin logs:', err);
        setPluginLogsError(t('download.pluginLogsLoadError'));
      } finally {
        if (mode === 'append') {
          setLogsLoadingMore(false);
        } else {
          setLogsLoading(false);
        }
      }
    },
    [pluginLogsOffset, t],
  );

  const handleOpenPluginLogs = async (pluginId: string) => {
    setSelectedPluginId(pluginId);
    setLogsOpen(true);
    await loadPluginLogs(pluginId, 'replace');
  };

  const handleLoadMorePluginLogs = async () => {
    if (!selectedPluginId || logsLoadingMore || !pluginLogsHasMore) {
      return;
    }

    await loadPluginLogs(selectedPluginId, 'append');
  };

  const handleClearPluginLogs = async () => {
    if (!selectedPluginId) {
      return;
    }
    setClearLogsConfirmOpen(true);
  };

  const handleConfirmClearPluginLogs = async () => {
    if (!selectedPluginId) {
      return;
    }
    setLogsClearing(true);
    setPluginLogsError(null);
    try {
      await invoke('clear_plugin_logs', {
        pluginId: selectedPluginId,
      });
      setPluginLogs([]);
      setPluginLogsTotal(0);
      setPluginLogsHasMore(false);
      setPluginLogsOffset(0);
      setClearLogsConfirmOpen(false);
    } catch (err) {
      console.error('Failed to clear plugin logs:', err);
      setPluginLogsError(t('download.pluginLogsClearError'));
    } finally {
      setLogsClearing(false);
    }
  };

  const handleUninstallPlugin = async (plugin: PluginSummary) => {
    setUninstallTarget(plugin);
  };

  const handleConfirmUninstallPlugin = async () => {
    if (!uninstallTarget) {
      return;
    }
    try {
      await invoke('uninstall_plugin', { pluginId: uninstallTarget.manifest.id });
      setPlugins((current) =>
        current.filter((item) => item.manifest.id !== uninstallTarget.manifest.id),
      );
      setRuntimeStatuses((current) => {
        const next = { ...current };
        delete next[uninstallTarget.manifest.id];
        return next;
      });
      setWorkflows((current) =>
        Object.fromEntries(
          Object.entries(current).map(([trigger, workflow]) => [
            trigger,
            {
              ...workflow,
              steps: workflow.steps.filter((step) => step.pluginId !== uninstallTarget.manifest.id),
            },
          ]),
        ),
      );
      if (selectedPluginId === uninstallTarget.manifest.id) {
        setLogsOpen(false);
        setSelectedPluginId(null);
      }
      setUninstallTarget(null);
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
      setError(t('download.pluginUninstallError'));
    }
  };

  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => setRuntimeGuideOpen(true)}
        >
          <Info className="h-4 w-4" />
          {t('download.pluginOverviewGuideButton')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={() => handleAttachWorkspace()}
        >
          <Atom className="h-4 w-4" />
          {t('download.pluginAttachWorkspace')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="border-dashed"
          onClick={handleImportPackage}
          disabled={inspecting}
        >
          <PackageOpen className="h-4 w-4" />
          {t('download.pluginImportPlugin')}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            setCreatePluginConfigTouched({});
            setCreatePluginSubmitAttempted(false);
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          {t('download.pluginCreateWorkspace')}
        </Button>
      </div>

      {createdWorkspace && (
        <div className="rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t('download.pluginWorkspaceCreatedTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('download.pluginWorkspaceCreatedDesc', { name: createdWorkspace.name })}
              </p>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <p className="break-all">
                  {t('download.pluginWorkspacePathLabel')}: {createdWorkspace.path}
                </p>
                <p className="break-all">
                  {t('download.pluginManifestPathLabel')}: {createdWorkspace.manifestPath}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3 text-[11px] text-muted-foreground">
                <p>{t('download.pluginWorkspaceNextStep1')}</p>
                <p>{t('download.pluginWorkspaceNextStep2')}</p>
                <p>{t('download.pluginWorkspaceNextStep3')}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => handleOpenWorkspacePath(createdWorkspace.path)}
              >
                <FolderOpen className="h-4 w-4" />
                {t('download.pluginWorkspaceOpen')}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAttachWorkspace(createdWorkspace.path)}
              >
                <Atom className="h-4 w-4" />
                {t('download.pluginAttachWorkspace')}
              </Button>
              <Button variant="outline" onClick={() => setCreatedWorkspace(null)}>
                {t('download.pluginDismiss')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <SettingsCard className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{t('download.pluginsTitle')}</p>
          <Button variant="outline" size="sm" onClick={loadPlugins} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            {t('download.pluginReload')}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {inspection && installSource && (
          <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-xl bg-purple-500/10 p-2 text-purple-500">
                    {renderPluginManifestIcon(inspection.manifest.icon)}
                  </div>
                  <p className="text-sm font-semibold">{inspection.manifest.name}</p>
                  <span className="rounded bg-muted px-2 py-0.5 text-[10px] tracking-wide text-muted-foreground">
                    v{inspection.manifest.version}
                  </span>
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-blue-600 dark:text-blue-400">
                    {LANGUAGE_LABELS[inspection.manifest.runtime.language]}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {inspection.manifest.description || t('download.pluginNoDescription')}
                </p>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>{inspection.manifest.id}</span>
                  <span>•</span>
                  <span>{formatSourceKind(inspection.source.kind, t)}</span>
                </div>
                <div className="space-y-1 text-[11px] text-muted-foreground">
                  <p className="font-medium text-foreground/80">
                    {t('download.pluginCompatibilityTitle')}
                  </p>
                  <p>
                    {t('download.pluginSignatureTitle')}:{' '}
                    {formatSignatureStatus(inspection.signatureStatus, t)}
                  </p>
                  {inspection.signerFingerprint && (
                    <p>
                      {t('download.pluginSignerFingerprintLabel')}:{' '}
                      {formatSignerFingerprint(inspection.signerFingerprint)}
                    </p>
                  )}
                  {inspection.signedAt && (
                    <p>
                      {t('download.pluginSignedAtLabel')}: {inspection.signedAt}
                    </p>
                  )}
                  {inspection.packageFormat && (
                    <p>
                      {t('download.pluginPackageFormatLabel')}:{' '}
                      {formatPackageFormat(
                        inspection.packageFormat,
                        inspection.packageFormatVersion,
                      )}
                    </p>
                  )}
                  {inspection.builderSdkVersion && (
                    <p>
                      {t('download.pluginBuilderSdkVersionLabel')}: v{inspection.builderSdkVersion}
                    </p>
                  )}
                  {inspection.packageChecksum && (
                    <p className="break-all">
                      {t('download.pluginPackageChecksumLabel')}: {inspection.packageChecksum}
                    </p>
                  )}
                  {inspectionCompatibilityEntries.length > 0 ? (
                    inspectionCompatibilityEntries.map((entry) => <p key={entry}>{entry}</p>)
                  ) : (
                    <p>{t('download.pluginCompatibilityNone')}</p>
                  )}
                </div>
                {inspection.warnings.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {inspection.warnings.map((warning) => (
                      <span
                        key={warning}
                        className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400"
                      >
                        {warning}
                      </span>
                    ))}
                  </div>
                )}
                <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-3">
                  <ToggleChoiceCard
                    checked={installAcknowledged}
                    onToggle={() => setInstallAcknowledged((current) => !current)}
                    label={t('download.pluginInstallConfirmLabel')}
                    description={t('download.pluginInstallConfirmHelp')}
                    className="border-border/50 bg-background/80"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                {inspection.readmeContent && (
                  <Button
                    variant="outline"
                    onClick={() =>
                      setPluginGuideDialog({
                        title: inspection.manifest.name,
                        content: inspection.readmeContent ?? '',
                      })
                    }
                    disabled={installing}
                  >
                    <Info className="h-4 w-4" />
                    {t('download.pluginGuideButton')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setInspection(null);
                    setInstallAcknowledged(false);
                  }}
                  disabled={installing}
                >
                  {t('download.pluginDismiss')}
                </Button>
                <Button
                  onClick={handleInstallInspection}
                  disabled={installing || !installAcknowledged || !inspectionSigned}
                >
                  <Download className="h-4 w-4" />
                  {installing ? t('download.pluginInstalling') : t('download.pluginInstall')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('download.pluginLoading')}</p>
        ) : plugins.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-background/40 px-4 py-6 text-center">
            <p className="text-sm font-medium">{t('download.pluginEmptyTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('download.pluginEmptyDesc')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plugins.map((plugin) => {
              const requestedPermissions = summarizeRequestedPermissions(plugin, t);
              const compatibilityEntries = summarizeCompatibility(plugin.manifest.compatibility, t);
              const selectedProvider = currentProvider(plugin);
              const supportedProviders = plugin.manifest.runtime.supportedProviders;
              const runtimeStatus = runtimeStatuses[plugin.manifest.id];
              const isExpanded = expandedPluginId === plugin.manifest.id;
              return (
                <Collapsible
                  key={plugin.manifest.id}
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedPluginId(open ? plugin.manifest.id : null)}
                >
                  <div className="rounded-xl border border-border/60 bg-background/60">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className="rounded-xl bg-purple-500/10 p-2 text-purple-500">
                            {renderPluginManifestIcon(plugin.manifest.icon)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">
                                {plugin.manifest.name}
                              </p>
                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] tracking-wide text-muted-foreground">
                                v{plugin.manifest.version}
                              </span>
                              {runtimeStatus?.status && (
                                <span
                                  className={cn(
                                    'rounded px-2 py-0.5 text-[10px] uppercase tracking-wide',
                                    runtimeStatus.status === 'running' &&
                                      'bg-sky-500/10 text-sky-600 dark:text-sky-400',
                                    runtimeStatus.status === 'success' &&
                                      'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                    runtimeStatus.status === 'error' &&
                                      'bg-red-500/10 text-red-600 dark:text-red-400',
                                  )}
                                >
                                  {formatRuntimeStatusBadge(runtimeStatus.status, t)}
                                </span>
                              )}
                              {plugin.warnings.length > 0 && (
                                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                  {t('download.pluginWarningCount', {
                                    count: plugin.warnings.length,
                                  })}
                                </span>
                              )}
                            </div>

                            <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                              {plugin.manifest.description || t('download.pluginNoDescription')}
                            </p>
                          </div>

                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                              isExpanded && 'rotate-180',
                            )}
                          />
                        </button>
                      </CollapsibleTrigger>

                      <div className="flex items-center gap-3">
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {plugin.installation.enabled
                            ? t('download.pluginEnabled')
                            : t('download.pluginDisabled')}
                        </span>
                        <Switch
                          checked={plugin.installation.enabled}
                          onCheckedChange={(enabled) => handleTogglePlugin(plugin, enabled)}
                        />
                      </div>
                    </div>

                    <CollapsibleContent className="border-t border-border/60 px-4 py-4">
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRefreshPlugin(plugin.manifest.id)}
                            aria-label={t('download.pluginRefreshInfo')}
                            title={t('download.pluginRefreshInfo')}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          {plugin.readmeContent && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setPluginGuideDialog({
                                  title: plugin.manifest.name,
                                  content: plugin.readmeContent ?? '',
                                })
                              }
                            >
                              <Info className="h-4 w-4" />
                              {t('download.pluginGuideButton')}
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPluginLogs(plugin.manifest.id)}
                          >
                            <TerminalSquare className="h-4 w-4" />
                            {t('download.pluginViewLogs')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenPluginDirectory(plugin.manifest.id)}
                          >
                            <FolderOpen className="h-4 w-4" />
                            {t('download.pluginOpenFolder')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-dashed text-destructive hover:text-destructive"
                            onClick={() => handleUninstallPlugin(plugin)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t(
                              plugin.installation.source.kind === 'workspace'
                                ? 'download.pluginDetachWorkspace'
                                : 'download.pluginUninstall',
                            )}
                          </Button>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-xl bg-muted/30 p-3">
                            <div className="flex items-center gap-2 text-xs font-medium">
                              <Info className="h-4 w-4 text-purple-500" />
                              <span>{t('download.pluginPackageTitle')}</span>
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {t('download.pluginPackageDesc')}
                            </p>
                            <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                              <div>
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginIdentifierLabel')}
                                </p>
                                <p>
                                  {formatPluginIdentifier(plugin.manifest.id, plugin.manifest.slug)}
                                </p>
                              </div>
                              <div>
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginVersionLabel')}
                                </p>
                                <p>v{plugin.manifest.version}</p>
                              </div>
                              {plugin.manifest.author && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginAuthorLabel')}
                                  </p>
                                  <p>{plugin.manifest.author}</p>
                                </div>
                              )}
                              {plugin.manifest.license && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginLicenseLabel')}
                                  </p>
                                  <p>{plugin.manifest.license}</p>
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginSourceLabel')}
                                </p>
                                <p>{formatSourceKind(plugin.installation.source.kind, t)}</p>
                              </div>
                              {plugin.installation.source.packageFormat && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginPackageFormatLabel')}
                                  </p>
                                  <p>
                                    {formatPackageFormat(
                                      plugin.installation.source.packageFormat,
                                      plugin.installation.source.packageFormatVersion,
                                    )}
                                  </p>
                                </div>
                              )}
                              {plugin.installation.source.builderSdkVersion && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginBuilderSdkVersionLabel')}
                                  </p>
                                  <p>v{plugin.installation.source.builderSdkVersion}</p>
                                </div>
                              )}
                              {plugin.installation.signatureStatus && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginSignatureTitle')}
                                  </p>
                                  <p>
                                    {formatSignatureStatus(plugin.installation.signatureStatus, t)}
                                  </p>
                                </div>
                              )}
                              {plugin.installation.signerFingerprint && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginSignerFingerprintLabel')}
                                  </p>
                                  <p>
                                    {formatSignerFingerprint(plugin.installation.signerFingerprint)}
                                  </p>
                                </div>
                              )}
                              {plugin.installation.signatureAlgorithm && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginSignatureAlgorithmLabel')}
                                  </p>
                                  <p>{plugin.installation.signatureAlgorithm}</p>
                                </div>
                              )}
                              {plugin.installation.signedAt && (
                                <div>
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginSignedAtLabel')}
                                  </p>
                                  <p>{plugin.installation.signedAt}</p>
                                </div>
                              )}
                              <div>
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginLanguageLabel')}
                                </p>
                                <p>{LANGUAGE_LABELS[plugin.manifest.runtime.language]}</p>
                              </div>
                              <div>
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginTimeoutLabel')}
                                </p>
                                <div className="mt-1 space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Input
                                      type="number"
                                      min={1}
                                      value={getTimeoutDraftValue(plugin)}
                                      onChange={(event) =>
                                        setTimeoutDraftValue(plugin.manifest.id, event.target.value)
                                      }
                                      className="h-8 text-xs"
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleSavePluginTimeout(plugin)}
                                    >
                                      {t('download.pluginTimeoutSave')}
                                    </Button>
                                  </div>
                                  <p>
                                    {plugin.installation.timeoutSecOverride
                                      ? t('download.pluginTimeoutOverrideHelp', {
                                          seconds: plugin.manifest.timeoutSec,
                                        })
                                      : t('download.pluginTimeoutDefaultHelp')}
                                  </p>
                                  {plugin.installation.timeoutSecOverride && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleResetPluginTimeout(plugin)}
                                    >
                                      {t('download.pluginTimeoutUseDefault')}
                                    </Button>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginSupportedProvidersLabel')}
                                </p>
                                <p>
                                  {plugin.manifest.runtime.supportedProviders
                                    .map((provider) => PROVIDER_LABELS[provider])
                                    .join(', ')}
                                </p>
                              </div>
                              <div className="sm:col-span-2">
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginTriggersLabel')}
                                </p>
                                <p>{plugin.manifest.triggers.join(', ')}</p>
                              </div>
                              {plugin.manifest.homepage && (
                                <div className="sm:col-span-2">
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginHomepageLabel')}
                                  </p>
                                  <a
                                    href={plugin.manifest.homepage}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="break-all text-primary hover:underline"
                                  >
                                    {plugin.manifest.homepage}
                                  </a>
                                </div>
                              )}
                              {plugin.manifest.repository && (
                                <div className="sm:col-span-2">
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginRepositoryLabel')}
                                  </p>
                                  <a
                                    href={plugin.manifest.repository}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="break-all text-primary hover:underline"
                                  >
                                    {plugin.manifest.repository}
                                  </a>
                                </div>
                              )}
                              {plugin.manifest.publishedAt && (
                                <div className="sm:col-span-2">
                                  <p className="font-medium text-foreground/80">
                                    {t('download.pluginPublishedAtLabel')}
                                  </p>
                                  <p>{plugin.manifest.publishedAt}</p>
                                </div>
                              )}
                              <div className="sm:col-span-2">
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginLocationLabel')}
                                </p>
                                <p className="break-all">{plugin.installation.source.value}</p>
                              </div>
                              {plugin.installation.source.checksum && (
                                <div className="sm:col-span-2">
                                  <p className="font-medium text-foreground/80">
                                    {plugin.installation.source.packageFormat
                                      ? t('download.pluginPackageChecksumLabel')
                                      : t('download.pluginChecksumLabel')}
                                  </p>
                                  <p className="break-all">
                                    {plugin.installation.source.packageFormat
                                      ? plugin.installation.source.checksum
                                      : formatChecksum(plugin.installation.source.checksum)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="rounded-xl bg-muted/30 p-3">
                            <div className="flex items-center gap-2 text-xs font-medium">
                              <PackageOpen className="h-4 w-4 text-blue-500" />
                              <span>{t('download.pluginCompatibilityTitle')}</span>
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {t('download.pluginCompatibilityDesc')}
                            </p>
                            <div className="mt-3 space-y-3 text-[11px] text-muted-foreground">
                              <div>
                                <p className="font-medium text-foreground/80">
                                  {t('download.pluginProviderTitle')}
                                </p>
                                <p className="mt-1">{t('download.pluginProviderDesc')}</p>
                                <div className="mt-2">
                                  <Select
                                    value={selectedProvider}
                                    onValueChange={(value) =>
                                      handleSetPluginProvider(plugin, value as PluginProvider)
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {supportedProviders.map((provider) => (
                                        <SelectItem
                                          key={provider}
                                          value={provider}
                                          className="text-xs"
                                        >
                                          {PROVIDER_LABELS[provider]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              <div className="space-y-1">
                                {compatibilityEntries.length > 0 ? (
                                  compatibilityEntries.map((entry) => <p key={entry}>{entry}</p>)
                                ) : (
                                  <p>{t('download.pluginCompatibilityNone')}</p>
                                )}
                              </div>

                              {plugin.installation.lastResolvedProvider && (
                                <p>
                                  {t('download.pluginLastResolvedProvider')}:{' '}
                                  {PROVIDER_LABELS[plugin.installation.lastResolvedProvider]}
                                </p>
                              )}
                              {plugin.installation.lastResolvedSource && (
                                <p>
                                  {t('download.pluginLastResolvedSource')}:{' '}
                                  {plugin.installation.lastResolvedSource}
                                </p>
                              )}
                              {plugin.installation.lastExecutionStatus && (
                                <p>
                                  {t('download.pluginLastExecutionStatus')}:{' '}
                                  {plugin.installation.lastExecutionStatus}
                                </p>
                              )}
                              {(runtimeStatus?.status === 'error' ||
                                plugin.installation.lastError) && (
                                <p className="text-destructive">
                                  {t('download.pluginLastError')}:{' '}
                                  {runtimeStatus?.status === 'error'
                                    ? runtimeStatus.message
                                    : plugin.installation.lastError}
                                </p>
                              )}
                              {runtimeStatus?.status === 'running' && (
                                <p className="text-sky-600 dark:text-sky-400">
                                  {t('download.pluginRunningNow')}
                                </p>
                              )}
                              {plugin.warnings.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {plugin.warnings.map((warning) => (
                                    <span
                                      key={`${plugin.manifest.id}-${warning}`}
                                      className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400"
                                    >
                                      {warning}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl bg-muted/30 p-3">
                          <div className="flex items-center gap-2 text-xs font-medium">
                            <ShieldCheck className="h-4 w-4 text-amber-500" />
                            <span>{t('download.pluginPermissionsTitle')}</span>
                          </div>

                          {requestedPermissions.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t('download.pluginNoExtraPermissions')}
                            </p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs text-muted-foreground">
                                {t('download.pluginRequestedPermissions')}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {requestedPermissions.map((permission) => (
                                  <span
                                    key={permission}
                                    className="rounded bg-amber-500/10 px-2 py-1 text-[11px] text-amber-600 dark:text-amber-400"
                                  >
                                    {permission}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {[
                              {
                                key: 'network' as const,
                                label: t('download.pluginPermissionNetwork'),
                                enabled: plugin.manifest.permissions.network,
                                approved: plugin.installation.approvedPermissions.network,
                              },
                            ].map((permission) => (
                              <div
                                key={permission.key}
                                className={cn(
                                  'flex items-center justify-between rounded-lg border border-border/60 px-3 py-2',
                                  !permission.enabled && 'opacity-50',
                                )}
                              >
                                <span className="text-xs">{permission.label}</span>
                                <Switch
                                  checked={permission.enabled && permission.approved}
                                  disabled={!permission.enabled}
                                  onCheckedChange={(checked) =>
                                    handleApprovePermissions(plugin, {
                                      ...plugin.installation.approvedPermissions,
                                      [permission.key]: checked,
                                    })
                                  }
                                />
                              </div>
                            ))}
                          </div>

                          {plugin.manifest.permissions.fs.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-medium">
                                {t('download.pluginPermissionFilesystem')}
                              </p>
                              <div className="grid gap-2 md:grid-cols-2">
                                {plugin.manifest.permissions.fs.map((permission) => {
                                  const approved =
                                    plugin.installation.approvedPermissions.fs.includes(permission);
                                  return (
                                    <div
                                      key={permission}
                                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                                    >
                                      <span className="text-xs">
                                        {getFilesystemPermissionLabel(permission, t)}
                                      </span>
                                      <Switch
                                        checked={approved}
                                        onCheckedChange={(checked) =>
                                          handleApprovePermissions(plugin, {
                                            ...plugin.installation.approvedPermissions,
                                            fs: checked
                                              ? [
                                                  ...plugin.installation.approvedPermissions.fs,
                                                  permission,
                                                ].filter(
                                                  (value, index, list) =>
                                                    list.indexOf(value) === index,
                                                )
                                              : plugin.installation.approvedPermissions.fs.filter(
                                                  (value) => value !== permission,
                                                ),
                                          })
                                        }
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="mt-4 space-y-3 border-t border-border/50 pt-3">
                            <div className="space-y-1">
                              <p className="text-xs font-medium">
                                {t('download.pluginConfigTitle')}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t('download.pluginConfigDesc')}
                              </p>
                            </div>

                            {plugin.manifest.configFields.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">
                                {t('download.pluginConfigEmpty')}
                              </p>
                            ) : (
                              plugin.manifest.configFields.map((field) => {
                                const isSet =
                                  plugin.installation.configValueStatus[field.key] ??
                                  field.defaultValue !== undefined;
                                const draftValue = getConfigDraftValue(plugin, field);
                                const defaultValueText = formatConfigFieldDefaultValue(
                                  field.defaultValue ?? undefined,
                                );
                                const textLikeValue =
                                  typeof draftValue === 'string' ? draftValue : '';
                                const numberInputValue =
                                  typeof draftValue === 'string' ? draftValue : '';
                                const selectedValues = Array.isArray(draftValue) ? draftValue : [];
                                const booleanValue = Boolean(draftValue);
                                const hasDraftContent = (() => {
                                  if (field.inputType === 'boolean') return true;
                                  if (field.inputType === 'multi-select')
                                    return selectedValues.length > 0;
                                  return textLikeValue.trim().length > 0;
                                })();

                                return (
                                  <div
                                    key={`${plugin.manifest.id}-${field.key}`}
                                    className="rounded-lg border border-border/60 px-3 py-3"
                                  >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-xs font-medium">{field.label}</p>
                                          {field.required && (
                                            <span className="rounded bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-600 dark:text-rose-400">
                                              {t('download.pluginConfigRequired')}
                                            </span>
                                          )}
                                          {field.sensitive && (
                                            <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-600 dark:text-sky-400">
                                              {t('download.pluginConfigSensitive')}
                                            </span>
                                          )}
                                        </div>
                                        {field.description && (
                                          <p className="text-[11px] text-muted-foreground">
                                            {field.description}
                                          </p>
                                        )}
                                        {defaultValueText && (
                                          <p className="text-[11px] text-muted-foreground">
                                            {t('download.pluginConfigDefaultLabel')}:{' '}
                                            {defaultValueText}
                                          </p>
                                        )}
                                      </div>
                                      <span
                                        className={cn(
                                          'rounded px-2 py-0.5 text-[10px]',
                                          isSet
                                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                        )}
                                      >
                                        {isSet
                                          ? t('download.pluginConfigValueSet')
                                          : t('download.pluginConfigValueMissing')}
                                      </span>
                                    </div>

                                    <div className="mt-3 space-y-3">
                                      {field.inputType === 'text' && (
                                        <Input
                                          value={textLikeValue}
                                          onChange={(event) =>
                                            setConfigDraftValue(
                                              plugin.manifest.id,
                                              field.key,
                                              event.target.value,
                                            )
                                          }
                                          placeholder={
                                            field.sensitive
                                              ? isSet
                                                ? t('download.pluginConfigReplacePlaceholder')
                                                : field.placeholder ||
                                                  t('download.pluginConfigValuePlaceholder')
                                              : field.placeholder ||
                                                t('download.pluginConfigValuePlaceholder')
                                          }
                                        />
                                      )}

                                      {field.inputType === 'password' && (
                                        <Input
                                          type="password"
                                          value={textLikeValue}
                                          onChange={(event) =>
                                            setConfigDraftValue(
                                              plugin.manifest.id,
                                              field.key,
                                              event.target.value,
                                            )
                                          }
                                          placeholder={
                                            isSet
                                              ? t('download.pluginConfigReplacePlaceholder')
                                              : field.placeholder ||
                                                t('download.pluginConfigValuePlaceholder')
                                          }
                                        />
                                      )}

                                      {field.inputType === 'textarea' && (
                                        <Textarea
                                          value={textLikeValue}
                                          onChange={(event) =>
                                            setConfigDraftValue(
                                              plugin.manifest.id,
                                              field.key,
                                              event.target.value,
                                            )
                                          }
                                          placeholder={
                                            field.placeholder ||
                                            t('download.pluginConfigValuePlaceholder')
                                          }
                                          rows={4}
                                        />
                                      )}

                                      {field.inputType === 'number' && (
                                        <Input
                                          type="number"
                                          value={numberInputValue}
                                          min={field.min ?? undefined}
                                          max={field.max ?? undefined}
                                          step={field.step ?? undefined}
                                          onChange={(event) =>
                                            setConfigDraftValue(
                                              plugin.manifest.id,
                                              field.key,
                                              event.target.value,
                                            )
                                          }
                                          placeholder={
                                            field.placeholder ||
                                            t('download.pluginConfigValuePlaceholder')
                                          }
                                        />
                                      )}

                                      {(field.inputType === 'file' ||
                                        field.inputType === 'directory') && (
                                        <div className="flex gap-2">
                                          <Input
                                            value={textLikeValue}
                                            onChange={(event) =>
                                              setConfigDraftValue(
                                                plugin.manifest.id,
                                                field.key,
                                                event.target.value,
                                              )
                                            }
                                            placeholder={
                                              field.placeholder ||
                                              t('download.pluginConfigValuePlaceholder')
                                            }
                                          />
                                          <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() =>
                                              handlePickPluginConfigPath(
                                                plugin,
                                                field,
                                                field.inputType === 'directory',
                                              )
                                            }
                                          >
                                            <FolderOpen className="h-4 w-4" />
                                            {field.inputType === 'directory'
                                              ? t('download.pluginConfigBrowseDirectory')
                                              : t('download.pluginConfigBrowseFile')}
                                          </Button>
                                        </div>
                                      )}

                                      {field.inputType === 'boolean' && (
                                        <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                                          <span className="text-xs text-muted-foreground">
                                            {t('download.pluginConfigBooleanLabel')}
                                          </span>
                                          <Switch
                                            checked={booleanValue}
                                            onCheckedChange={(checked) =>
                                              setConfigDraftValue(
                                                plugin.manifest.id,
                                                field.key,
                                                checked,
                                              )
                                            }
                                          />
                                        </div>
                                      )}

                                      {field.inputType === 'select' && (
                                        <Select
                                          value={textLikeValue}
                                          onValueChange={(value) =>
                                            setConfigDraftValue(
                                              plugin.manifest.id,
                                              field.key,
                                              value,
                                            )
                                          }
                                        >
                                          <SelectTrigger>
                                            <SelectValue
                                              placeholder={
                                                field.placeholder ||
                                                t('download.pluginConfigSelectPlaceholder')
                                              }
                                            />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {field.options.map((option) => (
                                              <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      )}

                                      {field.inputType === 'multi-select' && (
                                        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                            <span className="rounded bg-background/80 px-2 py-1">
                                              {selectedValues.length}/{field.options.length}
                                            </span>
                                          </div>
                                          <div className="grid gap-2 sm:grid-cols-2">
                                            {field.options.map((option) => {
                                              const checked = selectedValues.includes(option.value);
                                              return (
                                                <ToggleChoiceCard
                                                  key={option.value}
                                                  checked={checked}
                                                  label={option.label}
                                                  onToggle={() => {
                                                    const next = checked
                                                      ? selectedValues.filter(
                                                          (value) => value !== option.value,
                                                        )
                                                      : [...selectedValues, option.value];
                                                    setConfigDraftValue(
                                                      plugin.manifest.id,
                                                      field.key,
                                                      next,
                                                    );
                                                  }}
                                                />
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}

                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={() => handleSavePluginConfig(plugin, field)}
                                          disabled={
                                            field.inputType === 'boolean'
                                              ? false
                                              : field.required
                                                ? !hasDraftContent
                                                : false
                                          }
                                        >
                                          {t('download.pluginConfigSave')}
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleClearPluginConfig(plugin, field)}
                                          disabled={!isSet && field.defaultValue === undefined}
                                        >
                                          {t('download.pluginConfigClear')}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        )}
      </SettingsCard>

      <div className="space-y-4">
        {WORKFLOW_TRIGGERS.map((trigger) => {
          const workflowPlugins = workflowPluginsByTrigger[trigger] ?? [];
          const availableWorkflowPlugins = availableWorkflowPluginsByTrigger[trigger] ?? [];
          const candidateValue = workflowCandidates[trigger] ?? '';
          const tone = WORKFLOW_TRIGGER_TONES[trigger];

          return (
            <SettingsCard key={trigger} className={cn('space-y-4', tone.cardClassName)}>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                      tone.titleBadgeClassName,
                    )}
                  >
                    {t(`download.pluginWorkflowTrigger.${trigger}.title`)}
                  </span>
                </div>
                <p className={cn('text-sm font-medium', tone.titleClassName)}>
                  {t(`download.pluginWorkflowTrigger.${trigger}.title`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`download.pluginWorkflowTrigger.${trigger}.desc`)}
                </p>
              </div>

              <div className={cn('rounded-xl border border-dashed p-4', tone.panelClassName)}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-xs font-medium">{t('download.pluginWorkflowAddLabel')}</p>
                    <Select
                      value={candidateValue}
                      onValueChange={(value) =>
                        setWorkflowCandidates((current) => ({ ...current, [trigger]: value }))
                      }
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t('download.pluginWorkflowAddPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableWorkflowPlugins.map((plugin) => (
                          <SelectItem
                            key={`${trigger}-${plugin.manifest.id}`}
                            value={plugin.manifest.id}
                            className="text-xs"
                          >
                            {plugin.manifest.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant="outline"
                    className="border-dashed"
                    onClick={() => handleAddWorkflowPlugin(trigger)}
                    disabled={!candidateValue}
                  >
                    <Plus className="h-4 w-4" />
                    {t('download.pluginWorkflowAddButton')}
                  </Button>
                </div>
              </div>

              {workflowPlugins.length === 0 ? (
                <div
                  className={cn(
                    'rounded-xl border border-dashed px-4 py-6 text-center',
                    tone.emptyClassName,
                  )}
                >
                  <p className="text-sm font-medium">{t('download.pluginWorkflowEmptyTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('download.pluginWorkflowEmptyDesc')}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workflowPlugins.map(({ step, plugin }, index) => {
                    if (!plugin) return null;
                    return (
                      <div
                        key={`${trigger}-${plugin.manifest.id}`}
                        className={cn('rounded-xl border p-4', tone.stepClassName)}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'rounded px-2 py-0.5 text-[10px] uppercase tracking-wide',
                                  tone.titleBadgeClassName,
                                )}
                              >
                                {t('download.pluginWorkflowStepNumber', { index: index + 1 })}
                              </span>
                              <p className="truncate text-sm font-semibold">
                                {plugin.manifest.name}
                              </p>
                              <span className="rounded bg-muted px-2 py-0.5 text-[10px] tracking-wide text-muted-foreground">
                                v{plugin.manifest.version}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {plugin.manifest.description || t('download.pluginNoDescription')}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleMoveWorkflowStep(trigger, plugin.manifest.id, -1)
                              }
                              disabled={index === 0}
                            >
                              <MoveUp className="h-4 w-4" />
                              {t('download.pluginWorkflowMoveUp')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleMoveWorkflowStep(trigger, plugin.manifest.id, 1)}
                              disabled={index === workflowPlugins.length - 1}
                            >
                              <MoveDown className="h-4 w-4" />
                              {t('download.pluginWorkflowMoveDown')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRemoveWorkflowStep(trigger, plugin.manifest.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              {t('download.pluginWorkflowRemove')}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-xs font-medium">
                              {t('download.pluginWorkflowStepOrder')}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t('download.pluginWorkflowStepOrderHelp')}
                            </p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-xs font-medium">
                              {t('download.pluginWorkflowFailureTitle')}
                            </p>
                            <Select
                              value={step.failurePolicy}
                              onValueChange={(value) =>
                                handleWorkflowFailurePolicy(
                                  trigger,
                                  plugin.manifest.id,
                                  value as PluginWorkflowFailurePolicy,
                                )
                              }
                            >
                              <SelectTrigger className="h-9 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="continue" className="text-xs">
                                  {t('download.pluginWorkflowFailureContinue')}
                                </SelectItem>
                                <SelectItem value="stop-chain" className="text-xs">
                                  {t('download.pluginWorkflowFailureStopChain')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SettingsCard>
          );
        })}
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreatePluginForm(DEFAULT_CREATE_PLUGIN_FORM);
            setCreatePluginConfigTouched({});
            setCreatePluginSubmitAttempted(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[760px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginCreateDialogTitle')}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">{t('download.pluginCreateDialogDesc')}</p>

            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <p className="text-sm font-medium">{t('download.pluginCreateDetailsTitle')}</p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginCreateNameLabel')}</p>
                  <Input
                    value={createPluginForm.name}
                    onChange={(event) => updateCreatePluginForm('name', event.target.value)}
                    placeholder={t('download.pluginNamePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginWorkspacePathLabel')}</p>
                  <div className="flex gap-2">
                    <Input
                      value={createPluginForm.destinationRoot}
                      onChange={(event) =>
                        updateCreatePluginForm('destinationRoot', event.target.value)
                      }
                      placeholder={t('download.pluginCreateLocationPlaceholder')}
                    />
                    <Button variant="outline" type="button" onClick={handlePickWorkspaceRoot}>
                      {t('download.pluginCreateBrowse')}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginCreateIdLabel')}</p>
                  <Input
                    value={createPluginForm.id}
                    onChange={(event) => updateCreatePluginForm('id', event.target.value)}
                    placeholder={t('download.pluginCreateIdPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginCreateSlugLabel')}</p>
                  <Input
                    value={createPluginForm.slug}
                    onChange={(event) => updateCreatePluginForm('slug', event.target.value)}
                    placeholder={t('download.pluginSlugPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginVersionLabel')}</p>
                  <Input
                    value={createPluginForm.version}
                    onChange={(event) => updateCreatePluginForm('version', event.target.value)}
                    placeholder="0.1.0"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginLicenseLabel')}</p>
                  <Input
                    value={createPluginForm.license}
                    onChange={(event) => updateCreatePluginForm('license', event.target.value)}
                    placeholder="MIT"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginCreateIconLabel')}</p>
                <Select
                  value={createPluginForm.icon || '__default__'}
                  onValueChange={(value) =>
                    updateCreatePluginForm(
                      'icon',
                      value === '__default__' ? '' : (value as PluginManifestIconName),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('download.pluginCreateIconPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">{t('download.pluginIconDefault')}</SelectItem>
                    {PLUGIN_ICON_OPTIONS.map((icon) => (
                      <SelectItem key={icon} value={icon}>
                        {getPluginIconLabel(icon, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('download.pluginCreateIconHelp')}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginDescriptionLabel')}</p>
                <Textarea
                  value={createPluginForm.description}
                  onChange={(event) => updateCreatePluginForm('description', event.target.value)}
                  placeholder={t('download.pluginCreateDescriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginAuthorLabel')}</p>
                  <Input
                    value={createPluginForm.author}
                    onChange={(event) => updateCreatePluginForm('author', event.target.value)}
                    placeholder={t('download.pluginCreateAuthorPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginTimeoutLabel')}</p>
                  <Input
                    type="number"
                    min={1}
                    value={createPluginForm.timeoutSec}
                    onChange={(event) => updateCreatePluginForm('timeoutSec', event.target.value)}
                    placeholder="60"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginHomepageLabel')}</p>
                  <Input
                    value={createPluginForm.homepage}
                    onChange={(event) => updateCreatePluginForm('homepage', event.target.value)}
                    placeholder="https://example.com"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginRepositoryLabel')}</p>
                  <Input
                    value={createPluginForm.repository}
                    onChange={(event) => updateCreatePluginForm('repository', event.target.value)}
                    placeholder="https://github.com/example/plugin"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('download.pluginCreateRuntimeTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('download.pluginCreateRuntimeHelp')}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginSupportedProvidersLabel')}</p>
                <div className="flex flex-wrap gap-2">
                  {(['deno'] as PluginProvider[]).map((provider) => {
                    const selected = createPluginForm.supportedProviders.includes(provider);
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => toggleCreatePluginProvider(provider)}
                        className={cn(
                          'rounded-md border border-dashed px-3 py-1.5 text-xs transition-colors',
                          selected
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/60',
                        )}
                      >
                        {PROVIDER_LABELS[provider]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginTriggersLabel')}</p>
                <div className="flex flex-wrap gap-2">
                  {WORKFLOW_TRIGGERS.map((trigger) => {
                    const selected = createPluginForm.triggers.includes(trigger);
                    const tone = WORKFLOW_TRIGGER_TONES[trigger];
                    return (
                      <button
                        key={trigger}
                        type="button"
                        onClick={() => toggleCreatePluginTrigger(trigger)}
                        className={cn(
                          'rounded-md border border-dashed px-3 py-1.5 text-xs transition-colors',
                          selected
                            ? tone.triggerButtonSelectedClassName
                            : 'border-border text-muted-foreground hover:bg-muted/60',
                        )}
                      >
                        {t(`download.pluginWorkflowTrigger.${trigger}.title`)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('download.pluginPermissionsTitle')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('download.pluginCreatePermissionsHelp')}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                <span className="text-sm">{t('download.pluginPermissionNetwork')}</span>
                <Switch
                  checked={createPluginForm.permissionNetwork}
                  onCheckedChange={(checked) =>
                    updateCreatePluginForm('permissionNetwork', checked)
                  }
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">{t('download.pluginPermissionFilesystem')}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {FILESYSTEM_PERMISSIONS.map((permission) => {
                    const selected = createPluginForm.permissionFilesystem.includes(permission);
                    return (
                      <button
                        key={permission}
                        type="button"
                        onClick={() => toggleCreatePluginFilesystemPermission(permission)}
                        className={cn(
                          'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          selected
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-border/60 bg-background/70 text-muted-foreground hover:bg-muted/60',
                        )}
                      >
                        <span>{getFilesystemPermissionLabel(permission, t)}</span>
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px]',
                            selected
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {selected
                            ? t('download.pluginPermissionSelected')
                            : t('download.pluginPermissionNotSelected')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('download.pluginPermissionFilesystemHelp')}
              </p>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t('download.pluginCreateConfigFieldsTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('download.pluginCreateConfigFieldsHelp')}
                  </p>
                </div>
                <Button variant="outline" type="button" onClick={addCreatePluginConfigField}>
                  <Plus className="h-4 w-4" />
                  {t('download.pluginCreateConfigAddField')}
                </Button>
              </div>

              {createPluginConfigValidation.globalErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {createPluginConfigValidation.globalErrors.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              )}

              {createPluginForm.configFields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
                  {t('download.pluginCreateConfigEmpty')}
                </div>
              ) : (
                <div className="space-y-4">
                  {createPluginForm.configFields.map((field, fieldIndex) => {
                    const usesOptions =
                      field.inputType === 'select' || field.inputType === 'multi-select';
                    const usesNumberBounds = field.inputType === 'number';
                    const fieldValidationErrors =
                      createPluginConfigValidation.fieldErrors[field.clientId] ?? [];

                    return (
                      <div
                        key={field.clientId}
                        className={cn(
                          'space-y-4 rounded-xl border bg-background/70 p-4',
                          fieldValidationErrors.length > 0
                            ? 'border-destructive/40'
                            : 'border-border/60',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {t('download.pluginCreateConfigFieldTitle', {
                                index: fieldIndex + 1,
                              })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {field.key.trim() || t('download.pluginCreateConfigFieldUntitled')}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => removeCreatePluginConfigField(fieldIndex)}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('download.pluginCreateConfigRemoveField')}
                          </Button>
                        </div>

                        {fieldValidationErrors.length > 0 && (
                          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                            {fieldValidationErrors.map((message) => (
                              <p key={message}>{message}</p>
                            ))}
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              {t('download.pluginCreateConfigFieldKeyLabel')}
                            </p>
                            <Input
                              value={field.key}
                              onChange={(event) =>
                                updateCreatePluginConfigField(fieldIndex, 'key', event.target.value)
                              }
                              placeholder="driveFolderId"
                            />
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              {t('download.pluginCreateConfigFieldLabelLabel')}
                            </p>
                            <Input
                              value={field.label}
                              onChange={(event) =>
                                updateCreatePluginConfigField(
                                  fieldIndex,
                                  'label',
                                  event.target.value,
                                )
                              }
                              placeholder={t('download.pluginCreateConfigFieldLabelPlaceholder')}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              {t('download.pluginCreateConfigFieldTypeLabel')}
                            </p>
                            <Select
                              value={field.inputType}
                              onValueChange={(value) =>
                                updateCreatePluginConfigField(
                                  fieldIndex,
                                  'inputType',
                                  value as PluginConfigFieldInputType,
                                )
                              }
                            >
                              <SelectTrigger className="h-10 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONFIG_FIELD_INPUT_TYPES.map((inputType) => (
                                  <SelectItem key={inputType} value={inputType}>
                                    {t(`download.pluginConfigInputType.${inputType}`)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium">
                              {t('download.pluginCreateConfigFieldPlaceholderLabel')}
                            </p>
                            <Input
                              value={field.placeholder}
                              onChange={(event) =>
                                updateCreatePluginConfigField(
                                  fieldIndex,
                                  'placeholder',
                                  event.target.value,
                                )
                              }
                              placeholder={t(
                                'download.pluginCreateConfigFieldPlaceholderPlaceholder',
                              )}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">
                            {t('download.pluginCreateConfigFieldDescriptionLabel')}
                          </p>
                          <Textarea
                            value={field.description}
                            onChange={(event) =>
                              updateCreatePluginConfigField(
                                fieldIndex,
                                'description',
                                event.target.value,
                              )
                            }
                            rows={3}
                            placeholder={t(
                              'download.pluginCreateConfigFieldDescriptionPlaceholder',
                            )}
                          />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                            <span className="text-sm">
                              {t('download.pluginCreateConfigFieldRequiredLabel')}
                            </span>
                            <Switch
                              checked={field.required}
                              onCheckedChange={(checked) =>
                                updateCreatePluginConfigField(fieldIndex, 'required', checked)
                              }
                            />
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                            <span className="text-sm">
                              {t('download.pluginCreateConfigFieldSensitiveLabel')}
                            </span>
                            <Switch
                              checked={field.sensitive}
                              onCheckedChange={(checked) =>
                                updateCreatePluginConfigField(fieldIndex, 'sensitive', checked)
                              }
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-sm font-medium">
                            {t('download.pluginCreateConfigFieldDefaultLabel')}
                          </p>

                          {field.inputType === 'boolean' ? (
                            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                              <span className="text-sm text-muted-foreground">
                                {t('download.pluginConfigBooleanLabel')}
                              </span>
                              <Switch
                                checked={field.defaultValueBoolean}
                                onCheckedChange={(checked) =>
                                  updateCreatePluginConfigField(
                                    fieldIndex,
                                    'defaultValueBoolean',
                                    checked,
                                  )
                                }
                              />
                            </div>
                          ) : field.inputType === 'multi-select' ? (
                            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span className="rounded bg-background/80 px-2 py-1">
                                  {field.defaultValueMulti.length}/
                                  {field.options.filter((option) => option.value.trim()).length}
                                </span>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {field.options
                                  .filter((option) => option.value.trim())
                                  .map((option) => {
                                    const checked = field.defaultValueMulti.includes(option.value);
                                    return (
                                      <ToggleChoiceCard
                                        key={`${fieldIndex}-default-${option.value}`}
                                        checked={checked}
                                        label={option.label || option.value}
                                        onToggle={() => {
                                          const next = checked
                                            ? field.defaultValueMulti.filter(
                                                (value) => value !== option.value,
                                              )
                                            : [...field.defaultValueMulti, option.value];
                                          updateCreatePluginConfigField(
                                            fieldIndex,
                                            'defaultValueMulti',
                                            next,
                                          );
                                        }}
                                      />
                                    );
                                  })}
                              </div>
                              {field.options.filter((option) => option.value.trim()).length ===
                                0 && (
                                <p className="text-xs text-muted-foreground">
                                  {t('download.pluginCreateConfigFieldDefaultOptionsHint')}
                                </p>
                              )}
                            </div>
                          ) : (
                            <Input
                              type={field.inputType === 'number' ? 'number' : 'text'}
                              value={field.defaultValueText}
                              onChange={(event) =>
                                updateCreatePluginConfigField(
                                  fieldIndex,
                                  'defaultValueText',
                                  event.target.value,
                                )
                              }
                              placeholder={t('download.pluginCreateConfigFieldDefaultPlaceholder')}
                            />
                          )}
                        </div>

                        {usesNumberBounds && (
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">
                                {t('download.pluginCreateConfigFieldMinLabel')}
                              </p>
                              <Input
                                type="number"
                                value={field.min}
                                onChange={(event) =>
                                  updateCreatePluginConfigField(
                                    fieldIndex,
                                    'min',
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-medium">
                                {t('download.pluginCreateConfigFieldMaxLabel')}
                              </p>
                              <Input
                                type="number"
                                value={field.max}
                                onChange={(event) =>
                                  updateCreatePluginConfigField(
                                    fieldIndex,
                                    'max',
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-medium">
                                {t('download.pluginCreateConfigFieldStepLabel')}
                              </p>
                              <Input
                                type="number"
                                value={field.step}
                                onChange={(event) =>
                                  updateCreatePluginConfigField(
                                    fieldIndex,
                                    'step',
                                    event.target.value,
                                  )
                                }
                              />
                            </div>
                          </div>
                        )}

                        {usesOptions && (
                          <div className="space-y-3 rounded-lg border border-border/60 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium">
                                {t('download.pluginCreateConfigFieldOptionsLabel')}
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                type="button"
                                onClick={() => addCreatePluginConfigOption(fieldIndex)}
                              >
                                <Plus className="h-4 w-4" />
                                {t('download.pluginCreateConfigAddOption')}
                              </Button>
                            </div>

                            <div className="space-y-3">
                              {field.options.map((option, optionIndex) => (
                                <div
                                  key={option.clientId}
                                  className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"
                                >
                                  <Input
                                    value={option.value}
                                    onChange={(event) =>
                                      updateCreatePluginConfigOption(
                                        fieldIndex,
                                        optionIndex,
                                        'value',
                                        event.target.value,
                                      )
                                    }
                                    placeholder={t(
                                      'download.pluginCreateConfigFieldOptionValuePlaceholder',
                                    )}
                                  />
                                  <Input
                                    value={option.label}
                                    onChange={(event) =>
                                      updateCreatePluginConfigOption(
                                        fieldIndex,
                                        optionIndex,
                                        'label',
                                        event.target.value,
                                      )
                                    }
                                    placeholder={t(
                                      'download.pluginCreateConfigFieldOptionLabelPlaceholder',
                                    )}
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    type="button"
                                    onClick={() =>
                                      removeCreatePluginConfigOption(fieldIndex, optionIndex)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {t('download.pluginCreateConfigRemoveOption')}
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">{t('download.pluginCreateHelp')}</p>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setCreatePluginForm(DEFAULT_CREATE_PLUGIN_FORM);
                }}
                disabled={creating}
              >
                {t('download.pluginDismiss')}
              </Button>
              <Button onClick={handleCreatePlugin} disabled={!createPluginCanSubmit}>
                <Plus className="h-4 w-4" />
                {creating ? t('download.pluginCreating') : t('download.pluginCreateWorkspace')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={attachWorkspacePath != null}
        onOpenChange={(open) => {
          if (!open) {
            setAttachWorkspacePath(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginAttachWorkspace')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('download.pluginAttachWorkspaceConfirm')}
            </p>
            {attachWorkspacePath && (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground break-all">
                {attachWorkspacePath}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAttachWorkspacePath(null)}>
              {t('download.pluginDismiss')}
            </Button>
            <Button onClick={handleConfirmAttachWorkspace}>
              <Atom className="h-4 w-4" />
              {t('download.pluginAttachWorkspace')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={uninstallTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            setUninstallTarget(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {t(
                uninstallTarget?.installation.source.kind === 'workspace'
                  ? 'download.pluginDetachWorkspace'
                  : 'download.pluginUninstall',
              )}
            </DialogTitle>
          </DialogHeader>

          {uninstallTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(
                  uninstallTarget.installation.source.kind === 'workspace'
                    ? 'download.pluginDetachWorkspaceConfirm'
                    : 'download.pluginUninstallConfirm',
                  { name: uninstallTarget.manifest.name },
                )}
              </p>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                {uninstallTarget.manifest.name}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUninstallTarget(null)}>
              {t('download.pluginDismiss')}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmUninstallPlugin}
            >
              <Trash2 className="h-4 w-4" />
              {t(
                uninstallTarget?.installation.source.kind === 'workspace'
                  ? 'download.pluginDetachWorkspace'
                  : 'download.pluginUninstall',
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={runtimeGuideOpen} onOpenChange={setRuntimeGuideOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginOverviewGuideTitle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t('download.pluginOverviewGuideDesc')}</p>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('download.pluginWorkspaceFlowTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('download.pluginWorkspaceFlowDesc')}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs font-medium">{t('download.pluginWorkspaceStep1Title')}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('download.pluginWorkspaceStep1Desc')}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs font-medium">{t('download.pluginWorkspaceStep2Title')}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('download.pluginWorkspaceStep2Desc')}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/70 p-3">
                <p className="text-xs font-medium">{t('download.pluginWorkspaceStep3Title')}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('download.pluginWorkspaceStep3Desc')}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <p>{t('download.pluginOverviewGuideNotePrimary')}</p>
              <p className="mt-1">{t('download.pluginOverviewGuideNoteSecondary')}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{t('download.pluginRuntimeGuideTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('download.pluginRuntimeGuideDesc')}
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {(['javascript', 'python'] as PluginRuntimeLanguage[]).map((language) => {
                const allowedProviders = providers.filter((provider) =>
                  language === 'javascript'
                    ? provider.provider === 'deno'
                    : provider.provider === 'python',
                );
                if (allowedProviders.length === 0) return null;

                return (
                  <div key={language} className="rounded-xl border border-border/60 p-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{LANGUAGE_LABELS[language]}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('download.pluginRuntimeDefault')}
                      </p>
                    </div>

                    <div className="mt-3">
                      <Select
                        value={defaultProviders[language] ?? allowedProviders[0].provider}
                        onValueChange={(value) =>
                          handleSetDefaultProvider(language, value as PluginProvider)
                        }
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allowedProviders.map((provider) => (
                            <SelectItem
                              key={`${language}-${provider.provider}`}
                              value={provider.provider}
                              className="text-xs"
                            >
                              {PROVIDER_LABELS[provider.provider]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {providers.map((provider) => (
                <span
                  key={provider.provider}
                  className={cn(
                    'rounded px-2 py-1 text-[11px]',
                    provider.available
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                  )}
                >
                  {PROVIDER_LABELS[provider.provider]}:{' '}
                  {provider.available
                    ? t('download.pluginRuntimeAvailable')
                    : t('download.pluginRuntimeMissing')}
                  {provider.resolvedSource ? ` (${provider.resolvedSource})` : ''}
                </span>
              ))}
            </div>

            <div className="rounded-xl bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <p>{t('download.pluginRuntimeGuideNotePrimary')}</p>
              <p className="mt-1">{t('download.pluginRuntimeGuideNoteSecondary')}</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pluginGuideDialog != null}
        onOpenChange={(open) => {
          if (!open) {
            setPluginGuideDialog(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginGuideTitle')}</DialogTitle>
          </DialogHeader>

          {pluginGuideDialog && (
            <div className="min-w-0 space-y-4">
              <p className="text-sm text-muted-foreground">{t('download.pluginGuideDesc')}</p>
              <div className="rounded-xl bg-muted/30 px-3 py-2 text-sm font-medium">
                {pluginGuideDialog.title}
              </div>
              <div className="min-w-0 max-h-[60vh] overflow-y-auto overflow-x-hidden pr-1">
                <SimpleMarkdown
                  content={pluginGuideDialog.content}
                  className="min-w-0 text-sm text-muted-foreground"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={importDisclaimerOpen} onOpenChange={setImportDisclaimerOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginImportDisclaimerTitle')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('download.pluginImportDisclaimerIntro')}
            </p>

            <div className="rounded-xl bg-amber-500/5 p-4 text-sm text-muted-foreground">
              <p>{t('download.pluginImportDisclaimerBody')}</p>
            </div>

            <div className="rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>{t('download.pluginImportDisclaimerSignature')}</p>
            </div>

            <div className="rounded-xl bg-muted/30 p-4 text-sm text-muted-foreground">
              <p>{t('download.pluginImportDisclaimerRecommendation')}</p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setImportDisclaimerOpen(false)}>
                {t('download.pluginDismiss')}
              </Button>
              <Button onClick={handleConfirmImportPackage}>
                <Download className="h-4 w-4" />
                {t('download.pluginImportPlugin')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={permissionDialogPlugin != null}
        onOpenChange={(open) => {
          if (!open) {
            setPermissionDialogPlugin(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginEnablePermissionsTitle')}</DialogTitle>
          </DialogHeader>

          {permissionDialogPlugin && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('download.pluginEnablePermissionsDesc', {
                  name: permissionDialogPlugin.manifest.name,
                })}
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginRequestedPermissions')}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    {
                      key: 'network' as const,
                      label: t('download.pluginPermissionNetwork'),
                      enabled: permissionDialogPlugin.manifest.permissions.network,
                    },
                  ]
                    .filter((permission) => permission.enabled)
                    .map((permission) => (
                      <div
                        key={permission.key}
                        className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                      >
                        <span className="text-sm">{permission.label}</span>
                        <Switch
                          checked={permissionDialogState[permission.key]}
                          onCheckedChange={(checked) =>
                            setPermissionDialogState((current) => ({
                              ...current,
                              [permission.key]: checked,
                            }))
                          }
                        />
                      </div>
                    ))}
                </div>

                {permissionDialogPlugin.manifest.permissions.fs.length > 0 && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {permissionDialogPlugin.manifest.permissions.fs.map((permission) => (
                      <div
                        key={permission}
                        className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                      >
                        <span className="text-sm">
                          {getFilesystemPermissionLabel(permission, t)}
                        </span>
                        <Switch
                          checked={permissionDialogState.fs.includes(permission)}
                          onCheckedChange={(checked) =>
                            setPermissionDialogState((current) => ({
                              ...current,
                              fs: checked
                                ? [...current.fs, permission].filter(
                                    (value, index, list) => list.indexOf(value) === index,
                                  )
                                : current.fs.filter((value) => value !== permission),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {t('download.pluginEnablePermissionsHelp')}
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPermissionDialogPlugin(null)}>
                  {t('download.pluginDismiss')}
                </Button>
                <Button onClick={handleEnablePluginWithPermissions}>
                  {t('download.pluginEnableWithPermissions')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PluginLogsDialog
        open={logsOpen}
        onOpenChange={(open) => {
          setLogsOpen(open);
          if (!open) {
            setSelectedPluginId(null);
            setPluginLogs([]);
            setPluginLogsTotal(0);
            setPluginLogsHasMore(false);
            setPluginLogsOffset(0);
            setPluginLogsError(null);
          }
        }}
        plugin={selectedPlugin}
        logs={pluginLogs}
        total={pluginLogsTotal}
        loading={logsLoading}
        loadingMore={logsLoadingMore}
        clearing={logsClearing}
        hasMore={pluginLogsHasMore}
        error={pluginLogsError}
        onRefresh={() =>
          selectedPluginId ? loadPluginLogs(selectedPluginId, 'replace') : undefined
        }
        onLoadMore={handleLoadMorePluginLogs}
        onClear={handleClearPluginLogs}
      />

      <Dialog
        open={clearLogsConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setClearLogsConfirmOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginLogsClear')}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">{t('download.pluginLogsClearConfirm')}</p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClearLogsConfirmOpen(false)}>
              {t('download.pluginDismiss')}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmClearPluginLogs}
              disabled={logsClearing}
            >
              <Trash2 className="h-4 w-4" />
              {t('download.pluginLogsClear')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {pluginReminderToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-border/70 bg-background/95 p-4 shadow-xl backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              {renderPluginManifestIcon(pluginReminderToast.pluginIcon)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">{pluginReminderToast.pluginName}</p>
              <p className="text-xs text-muted-foreground">
                {t('download.pluginWorkflowReminderToast')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={clearPluginReminderToast}
            >
              {t('download.pluginDismiss')}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
