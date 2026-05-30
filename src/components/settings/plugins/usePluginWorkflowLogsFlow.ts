import { invoke } from '@tauri-apps/api/core';
import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { localizeUnknownError } from '@/lib/backend-error';
import { buildWorkflowsFromDefinitions } from '@/lib/post-download-plugins';
import type {
  LogEntry,
  PluginLogsPage,
  PluginSummary,
  PluginTriggerWorkflow,
  PluginWorkflowDefinition,
} from '@/lib/types';

type WorkflowState = {
  plugins: PluginSummary[];
  setWorkflowDefinitions: Dispatch<SetStateAction<PluginWorkflowDefinition[]>>;
  setWorkflows: Dispatch<SetStateAction<Record<string, PluginTriggerWorkflow>>>;
  workflowDefinitions: PluginWorkflowDefinition[];
};

export function usePluginWorkflowLogsFlow(
  t: TFunction<'settings'>,
  setError: Dispatch<SetStateAction<string | null>>,
  state: WorkflowState,
) {
  const { plugins, setWorkflowDefinitions, setWorkflows, workflowDefinitions } = state;
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

  const syncWorkflowState = useCallback(
    (definitions: PluginWorkflowDefinition[]) => {
      setWorkflowDefinitions(definitions);
      setWorkflows(
        Object.fromEntries(
          buildWorkflowsFromDefinitions(definitions).map((workflow) => [
            workflow.trigger,
            workflow,
          ]),
        ),
      );
    },
    [setWorkflowDefinitions, setWorkflows],
  );

  const persistWorkflowDefinitions = useCallback(
    async (nextDefinitions: PluginWorkflowDefinition[]) => {
      try {
        const saved = await invoke<PluginWorkflowDefinition[]>('update_plugin_workflows', {
          workflows: nextDefinitions,
        });
        syncWorkflowState(saved);
      } catch (err) {
        console.error('Failed to update plugin workflows:', err);
        setError(localizeUnknownError(err));
      }
    },
    [setError, syncWorkflowState],
  );

  const selectedPlugin =
    selectedPluginId != null
      ? (plugins.find((plugin) => plugin.manifest.id === selectedPluginId) ?? null)
      : null;

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

  const handleOpenPluginLogs = useCallback(
    async (pluginId: string) => {
      setSelectedPluginId(pluginId);
      setLogsOpen(true);
      await loadPluginLogs(pluginId, 'replace');
    },
    [loadPluginLogs],
  );

  const handleLoadMorePluginLogs = useCallback(async () => {
    if (!selectedPluginId || logsLoadingMore || !pluginLogsHasMore) return;
    await loadPluginLogs(selectedPluginId, 'append');
  }, [loadPluginLogs, logsLoadingMore, pluginLogsHasMore, selectedPluginId]);

  const handleClearPluginLogs = useCallback(async () => {
    if (!selectedPluginId) return;
    setClearLogsConfirmOpen(true);
  }, [selectedPluginId]);

  const handleConfirmClearPluginLogs = useCallback(async () => {
    if (!selectedPluginId) return;
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
  }, [selectedPluginId, t]);

  const closeLogsDialog = useCallback(() => {
    setLogsOpen(false);
    setSelectedPluginId(null);
    setPluginLogs([]);
    setPluginLogsTotal(0);
    setPluginLogsHasMore(false);
    setPluginLogsOffset(0);
    setPluginLogsError(null);
  }, []);

  return useMemo(
    () => ({
      clearLogsConfirmOpen,
      closeLogsDialog,
      handleClearPluginLogs,
      handleConfirmClearPluginLogs,
      handleLoadMorePluginLogs,
      handleOpenPluginLogs,
      loadPluginLogs,
      logsClearing,
      logsLoading,
      logsLoadingMore,
      logsOpen,
      persistWorkflowDefinitions,
      pluginLogs,
      pluginLogsError,
      pluginLogsHasMore,
      pluginLogsOffset,
      pluginLogsTotal,
      selectedPlugin,
      selectedPluginId,
      setClearLogsConfirmOpen,
      setSelectedPluginId,
      workflowDefinitions,
    }),
    [
      clearLogsConfirmOpen,
      closeLogsDialog,
      handleClearPluginLogs,
      handleConfirmClearPluginLogs,
      handleLoadMorePluginLogs,
      handleOpenPluginLogs,
      loadPluginLogs,
      logsClearing,
      logsLoading,
      logsLoadingMore,
      logsOpen,
      persistWorkflowDefinitions,
      pluginLogs,
      pluginLogsError,
      pluginLogsHasMore,
      pluginLogsOffset,
      pluginLogsTotal,
      selectedPlugin,
      selectedPluginId,
      workflowDefinitions,
    ],
  );
}
