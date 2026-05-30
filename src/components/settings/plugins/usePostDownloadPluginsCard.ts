import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePluginCatalogState } from './usePluginCatalogState';
import { usePluginDetailsFlow } from './usePluginDetailsFlow';
import { usePluginImportFlow } from './usePluginImportFlow';
import { usePluginReminderState } from './usePluginReminderState';
import { usePluginWorkflowLogsFlow } from './usePluginWorkflowLogsFlow';
import { usePluginWorkspaceFlow } from './usePluginWorkspaceFlow';

export function usePostDownloadPluginsCard() {
  const { t } = useTranslation('settings');
  const [error, setError] = useState<string | null>(null);

  const catalog = usePluginCatalogState(t, setError);
  const reminder = usePluginReminderState();
  const workflowLogs = usePluginWorkflowLogsFlow(t, setError, {
    plugins: catalog.plugins,
    workflowDefinitions: catalog.workflowDefinitions,
    setWorkflowDefinitions: catalog.setWorkflowDefinitions,
    setWorkflows: catalog.setWorkflows,
  });
  const details = usePluginDetailsFlow(t, setError, {
    updatePluginList: catalog.updatePluginList,
    setWorkflows: catalog.setWorkflows,
    workflowDefinitions: catalog.workflowDefinitions,
    setWorkflowDefinitions: catalog.setWorkflowDefinitions,
    runtimeStatuses: catalog.runtimeStatuses,
    setRuntimeStatuses: catalog.setRuntimeStatuses,
    setDefaultProviders: catalog.setDefaultProviders,
    showPluginReminderToast: reminder.showPluginReminderToast,
    selectedPluginId: workflowLogs.selectedPluginId,
    closeLogsDialog: workflowLogs.closeLogsDialog,
  });
  const importFlow = usePluginImportFlow(
    t,
    setError,
    catalog.loadPlugins,
    details.promptPluginPermissionEnable,
  );
  const workspace = usePluginWorkspaceFlow(t, setError, catalog.loadPlugins);

  return useMemo(
    () => ({
      ...catalog,
      ...details,
      ...importFlow,
      ...reminder,
      ...workflowLogs,
      ...workspace,
      error,
    }),
    [catalog, details, error, importFlow, reminder, workflowLogs, workspace],
  );
}

export type PostDownloadPluginsCardController = ReturnType<typeof usePostDownloadPluginsCard>;
