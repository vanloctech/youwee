import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { TFunction } from 'i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { localizeUnknownError } from '@/lib/backend-error';
import type { PluginPackageInspection, PluginSummary } from '@/lib/types';
import {
  hasUnapprovedRequestedPermissions,
  type InstallPluginSourceInput,
  summarizeCompatibility,
} from './post-download-plugins-shared';

export function usePluginImportFlow(
  t: TFunction<'settings'>,
  setError: Dispatch<SetStateAction<string | null>>,
  loadPlugins: () => Promise<void>,
  promptPluginPermissionEnable: (plugin: PluginSummary) => void,
) {
  const [inspecting, setInspecting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [importDisclaimerOpen, setImportDisclaimerOpen] = useState(false);
  const [inspection, setInspection] = useState<PluginPackageInspection | null>(null);
  const [installSource, setInstallSource] = useState<InstallPluginSourceInput | null>(null);
  const [installAcknowledged, setInstallAcknowledged] = useState(false);

  const inspectSource = useCallback(
    async (source: InstallPluginSourceInput, command: string, key: string) => {
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
    },
    [setError],
  );

  const handleImportPackage = useCallback(() => {
    setImportDisclaimerOpen(true);
  }, []);

  const handleConfirmImportPackage = useCallback(async () => {
    setImportDisclaimerOpen(false);
    const selected = await open({
      directory: false,
      multiple: false,
      title: t('download.pluginImportPlugin'),
      filters: [{ name: 'youwee Plugin File', extensions: ['ywp'] }],
    });
    if (typeof selected !== 'string') return;
    await inspectSource({ kind: 'package-ywp', value: selected }, 'inspect_plugin_package', 'path');
  }, [inspectSource, t]);

  const handleInstallInspection = useCallback(async () => {
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
  }, [inspection, installSource, loadPlugins, promptPluginPermissionEnable, setError]);

  const dismissInspection = useCallback(() => {
    setInspection(null);
    setInstallSource(null);
    setInstallAcknowledged(false);
  }, []);

  const inspectionCompatibilityEntries = useMemo(
    () => (inspection ? summarizeCompatibility(inspection.manifest.compatibility, t) : []),
    [inspection, t],
  );

  const inspectionSigned = inspection?.signatureStatus === 'signed';

  return {
    dismissInspection,
    handleConfirmImportPackage,
    handleImportPackage,
    handleInstallInspection,
    importDisclaimerOpen,
    inspectSource,
    inspecting,
    inspection,
    inspectionCompatibilityEntries,
    inspectionSigned,
    installAcknowledged,
    installSource,
    installing,
    setImportDisclaimerOpen,
    setInstallAcknowledged,
  };
}
