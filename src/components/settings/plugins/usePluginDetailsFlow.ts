import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { localizeUnknownError } from '@/lib/backend-error';
import type {
  PluginConfigField,
  PluginConfigFieldValue,
  PluginPermissionApproval,
  PluginProvider,
  PluginRuntimeLanguage,
  PluginSummary,
  PluginTriggerWorkflow,
  PluginWorkflowDefinition,
} from '@/lib/types';
import {
  buildRequestedPermissionApproval,
  currentTimeoutSec,
  getResolvedConfigFieldValue,
  hasUnapprovedRequestedPermissions,
  type PluginConfigDraftValue,
  type PluginGuideDialogState,
  stringifyConfigFieldValue,
} from './post-download-plugins-shared';

type DetailsDeps = {
  updatePluginList: (updater: (items: PluginSummary[]) => PluginSummary[]) => void;
  setWorkflows: Dispatch<SetStateAction<Record<string, PluginTriggerWorkflow>>>;
  workflowDefinitions: PluginWorkflowDefinition[];
  setWorkflowDefinitions: Dispatch<SetStateAction<PluginWorkflowDefinition[]>>;
  runtimeStatuses: Record<string, { status: string; message?: string | null }>;
  setRuntimeStatuses: Dispatch<
    SetStateAction<Record<string, { status: string; message?: string | null }>>
  >;
  setDefaultProviders: Dispatch<
    SetStateAction<Partial<Record<PluginRuntimeLanguage, PluginProvider>>>
  >;
  showPluginReminderToast: (plugin: PluginSummary) => void;
  selectedPluginId: string | null;
  closeLogsDialog: () => void;
};

export function usePluginDetailsFlow(
  t: TFunction<'settings'>,
  setError: Dispatch<SetStateAction<string | null>>,
  deps: DetailsDeps,
) {
  const toast = useToast();
  const {
    closeLogsDialog,
    runtimeStatuses,
    selectedPluginId,
    setDefaultProviders,
    setWorkflowDefinitions,
    setRuntimeStatuses,
    setWorkflows,
    showPluginReminderToast,
    updatePluginList,
    workflowDefinitions,
  } = deps;
  const [expandedPluginId, setExpandedPluginId] = useState<string | null>(null);
  const [pluginGuideDialog, setPluginGuideDialog] = useState<PluginGuideDialogState>(null);
  const [permissionDialogPlugin, setPermissionDialogPlugin] = useState<PluginSummary | null>(null);
  const [permissionDialogState, setPermissionDialogState] = useState<PluginPermissionApproval>({
    network: false,
    fs: [],
    tools: [],
  });
  const [configDrafts, setConfigDrafts] = useState<Record<string, PluginConfigDraftValue>>({});
  const [timeoutDrafts, setTimeoutDrafts] = useState<Record<string, string>>({});
  const [uninstallTarget, setUninstallTarget] = useState<PluginSummary | null>(null);

  const isPluginAssignedToAnyWorkflow = useCallback(
    (pluginId: string) =>
      workflowDefinitions.some((workflow) =>
        workflow.nodes.some((node) => node.kind === 'plugin' && node.pluginId === pluginId),
      ),
    [workflowDefinitions],
  );

  const promptPluginPermissionEnable = useCallback((plugin: PluginSummary) => {
    const requested = buildRequestedPermissionApproval(plugin);
    setPermissionDialogPlugin(plugin);
    setPermissionDialogState({
      network: requested.network ? plugin.installation.approvedPermissions.network : false,
      fs: requested.fs.filter((permission) =>
        plugin.installation.approvedPermissions.fs.includes(permission),
      ),
      tools: requested.tools.filter((permission) =>
        plugin.installation.approvedPermissions.tools.includes(permission),
      ),
    });
  }, []);

  const handleTogglePlugin = useCallback(
    async (plugin: PluginSummary, enabled: boolean) => {
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
    },
    [
      isPluginAssignedToAnyWorkflow,
      promptPluginPermissionEnable,
      setError,
      showPluginReminderToast,
      t,
      updatePluginList,
    ],
  );

  const handleEnablePluginWithPermissions = useCallback(async () => {
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
  }, [
    isPluginAssignedToAnyWorkflow,
    permissionDialogPlugin,
    permissionDialogState,
    setError,
    showPluginReminderToast,
    t,
    updatePluginList,
  ]);

  const handleApprovePermissions = useCallback(
    async (plugin: PluginSummary, permissions: PluginPermissionApproval) => {
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
    },
    [setError, t, updatePluginList],
  );

  const handleOpenPluginDirectory = useCallback(
    async (pluginId: string) => {
      try {
        await invoke('open_plugin_directory', { pluginId });
      } catch (err) {
        console.error('Failed to open plugin directory:', err);
        setError(t('download.pluginOpenDirError'));
      }
    },
    [setError, t],
  );

  const handleRefreshPlugin = useCallback(
    async (pluginId: string) => {
      try {
        const refreshed = await invoke<PluginSummary>('get_plugin_details', { pluginId });
        updatePluginList((items) =>
          items.map((item) => (item.manifest.id === pluginId ? refreshed : item)),
        );
        setRuntimeStatuses((current) => ({
          ...current,
          [pluginId]: {
            status:
              refreshed.installation.lastExecutionStatus ?? current[pluginId]?.status ?? 'idle',
            message: refreshed.installation.lastError ?? current[pluginId]?.message ?? null,
          },
        }));
      } catch (err) {
        console.error('Failed to refresh plugin details:', err);
        setError(localizeUnknownError(err));
      }
    },
    [setError, setRuntimeStatuses, updatePluginList],
  );

  const handleSetPluginProvider = useCallback(
    async (plugin: PluginSummary, provider: PluginProvider) => {
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
    },
    [setError, t, updatePluginList],
  );

  const setConfigDraftValue = useCallback(
    (pluginId: string, key: string, value: PluginConfigDraftValue) => {
      setConfigDrafts((current) => ({
        ...current,
        [`${pluginId}:${key}`]: value,
      }));
    },
    [],
  );

  const getConfigDraftValue = useCallback(
    (plugin: PluginSummary, field: PluginConfigField): PluginConfigDraftValue => {
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
    },
    [configDrafts],
  );

  const setTimeoutDraftValue = useCallback((pluginId: string, value: string) => {
    setTimeoutDrafts((current) => ({
      ...current,
      [pluginId]: value,
    }));
  }, []);

  const getTimeoutDraftValue = useCallback(
    (plugin: PluginSummary) =>
      timeoutDrafts[plugin.manifest.id] ?? String(currentTimeoutSec(plugin)),
    [timeoutDrafts],
  );

  const handlePickPluginConfigPath = useCallback(
    async (plugin: PluginSummary, field: PluginConfigField, directory: boolean) => {
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
    },
    [setConfigDraftValue, setError],
  );

  const handleSavePluginConfig = useCallback(
    async (plugin: PluginSummary, field: PluginConfigField) => {
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
        toast.success({
          title: plugin.manifest.name,
          message: t('download.pluginConfigSaveSuccess'),
          durationMs: 3000,
        });
      } catch (err) {
        console.error('Failed to update plugin config values:', err);
        setError(t('download.pluginConfigSaveError'));
      }
    },
    [getConfigDraftValue, setConfigDraftValue, setError, t, toast, updatePluginList],
  );

  const handleClearPluginConfig = useCallback(
    async (plugin: PluginSummary, field: PluginConfigField) => {
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
    },
    [setConfigDraftValue, setError, t, updatePluginList],
  );

  const handleSavePluginTimeout = useCallback(
    async (plugin: PluginSummary) => {
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
    },
    [getTimeoutDraftValue, setError, setTimeoutDraftValue, t, updatePluginList],
  );

  const handleResetPluginTimeout = useCallback(
    async (plugin: PluginSummary) => {
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
    },
    [setError, setTimeoutDraftValue, t, updatePluginList],
  );

  const handleSetDefaultProvider = useCallback(
    async (language: PluginRuntimeLanguage, provider: PluginProvider) => {
      try {
        await invoke('set_default_provider_for_language', { language, provider });
        setDefaultProviders((current) => ({ ...current, [language]: provider }));
      } catch (err) {
        console.error('Failed to set default provider:', err);
        setError(t('download.pluginProviderDefaultError'));
      }
    },
    [setDefaultProviders, setError, t],
  );

  const handleUninstallPlugin = useCallback((plugin: PluginSummary) => {
    setUninstallTarget(plugin);
  }, []);

  const handleConfirmUninstallPlugin = useCallback(async () => {
    if (!uninstallTarget) return;

    try {
      await invoke('uninstall_plugin', { pluginId: uninstallTarget.manifest.id });
      updatePluginList((current) =>
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
      setWorkflowDefinitions((current) =>
        current.map((workflow) => {
          const nodes = workflow.nodes.filter(
            (node) => node.kind !== 'plugin' || node.pluginId !== uninstallTarget.manifest.id,
          );
          const nodeIds = new Set(nodes.map((node) => node.id));
          return {
            ...workflow,
            nodes,
            edges: workflow.edges.filter(
              (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
            ),
          };
        }),
      );
      if (selectedPluginId === uninstallTarget.manifest.id) {
        closeLogsDialog();
      }
      setUninstallTarget(null);
    } catch (err) {
      console.error('Failed to uninstall plugin:', err);
      setError(t('download.pluginUninstallError'));
    }
  }, [
    closeLogsDialog,
    selectedPluginId,
    setError,
    setRuntimeStatuses,
    setWorkflowDefinitions,
    setWorkflows,
    t,
    uninstallTarget,
    updatePluginList,
  ]);

  const openPluginGuide = useCallback((title: string, content: string) => {
    setPluginGuideDialog({ title, content });
  }, []);

  const closePluginGuide = useCallback(() => {
    setPluginGuideDialog(null);
  }, []);

  return {
    closePluginGuide,
    configDrafts,
    expandedPluginId,
    getConfigDraftValue,
    getTimeoutDraftValue,
    handleApprovePermissions,
    handleClearPluginConfig,
    handleConfirmUninstallPlugin,
    handleEnablePluginWithPermissions,
    handleOpenPluginDirectory,
    handlePickPluginConfigPath,
    handleRefreshPlugin,
    handleResetPluginTimeout,
    handleSavePluginConfig,
    handleSavePluginTimeout,
    handleSetDefaultProvider,
    handleSetPluginProvider,
    handleTogglePlugin,
    handleUninstallPlugin,
    openPluginGuide,
    permissionDialogPlugin,
    permissionDialogState,
    pluginGuideDialog,
    promptPluginPermissionEnable,
    runtimeStatuses,
    setConfigDraftValue,
    setExpandedPluginId,
    setPermissionDialogPlugin,
    setPermissionDialogState,
    setPluginGuideDialog,
    setTimeoutDraftValue,
    setUninstallTarget,
    uninstallTarget,
  };
}
