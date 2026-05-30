import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  buildWorkflowSnapshotMap,
  buildWorkflowsFromDefinitions,
  savePluginWorkflowSnapshots,
} from '@/lib/post-download-plugins';
import type {
  PluginExecutionStatusEvent,
  PluginProvider,
  PluginRuntimeLanguage,
  PluginSummary,
  PluginTriggerWorkflow,
  PluginWorkflowDefinition,
  RuntimeProviderStatus,
} from '@/lib/types';
import { currentProvider } from './post-download-plugins-shared';

export function usePluginCatalogState(
  t: TFunction<'settings'>,
  setError: Dispatch<SetStateAction<string | null>>,
) {
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [providers, setProviders] = useState<RuntimeProviderStatus[]>([]);
  const [workflows, setWorkflows] = useState<Record<string, PluginTriggerWorkflow>>({});
  const [workflowDefinitions, setWorkflowDefinitions] = useState<PluginWorkflowDefinition[]>([]);
  const [workflowCandidates, setWorkflowCandidates] = useState<Record<string, string>>({});
  const [defaultProviders, setDefaultProviders] = useState<
    Partial<Record<PluginRuntimeLanguage, PluginProvider>>
  >({});
  const [loading, setLoading] = useState(true);
  const [runtimeStatuses, setRuntimeStatuses] = useState<
    Record<string, { status: string; message?: string | null }>
  >({});

  const loadPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pluginResult, providerResult, workflowDefinitionResults] = await Promise.all([
        invoke<PluginSummary[]>('list_plugins'),
        invoke<RuntimeProviderStatus[]>('list_runtime_providers'),
        invoke<PluginWorkflowDefinition[]>('list_plugin_workflows'),
      ]);
      const workflowResults = buildWorkflowsFromDefinitions(workflowDefinitionResults);
      setPlugins(pluginResult);
      setProviders(providerResult);
      setWorkflowDefinitions(workflowDefinitionResults);
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
  }, [setError, t]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  useEffect(() => {
    savePluginWorkflowSnapshots(
      buildWorkflowSnapshotMap(plugins, buildWorkflowsFromDefinitions(workflowDefinitions)),
    );
  }, [plugins, workflowDefinitions]);

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

  const updatePluginList = useCallback(
    (updater: (items: PluginSummary[]) => PluginSummary[]) => {
      setPlugins((current) => {
        const next = updater(current);
        savePluginWorkflowSnapshots(
          buildWorkflowSnapshotMap(next, buildWorkflowsFromDefinitions(workflowDefinitions)),
        );
        return next;
      });
    },
    [workflowDefinitions],
  );

  return {
    defaultProviders,
    loading,
    loadPlugins,
    plugins,
    providers,
    runtimeStatuses,
    setDefaultProviders,
    setPlugins,
    setRuntimeStatuses,
    setWorkflowDefinitions,
    setWorkflowCandidates,
    setWorkflows,
    updatePluginList,
    workflowCandidates,
    workflowDefinitions,
    workflows,
  };
}
