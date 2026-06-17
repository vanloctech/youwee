import { ChevronDown, FolderOpen, Info, RefreshCw, TerminalSquare, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PluginSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { PluginConfigCard } from './PluginConfigCard';
import { PluginPackageInfoCard } from './PluginPackageInfoCard';
import { PluginPermissionsConfigCard } from './PluginPermissionsConfigCard';
import { PluginRuntimeCompatibilityCard } from './PluginRuntimeCompatibilityCard';
import { formatRuntimeStatusBadge, renderPluginManifestIcon } from './post-download-plugins-shared';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginInstalledCardControllerProps = Pick<
  PostDownloadPluginsCardController,
  | 'expandedPluginId'
  | 'getConfigDraftValue'
  | 'getTimeoutDraftValue'
  | 'handleApprovePermissions'
  | 'handleClearPluginConfig'
  | 'handleOpenPluginDirectory'
  | 'handleOpenPluginLogs'
  | 'handlePickPluginConfigPath'
  | 'handleRefreshPlugin'
  | 'handleResetPluginTimeout'
  | 'handleSavePluginConfig'
  | 'handleSavePluginTimeout'
  | 'handleSetPluginProvider'
  | 'handleTogglePlugin'
  | 'handleUninstallPlugin'
  | 'openPluginGuide'
  | 'runtimeStatuses'
  | 'setConfigDraftValue'
  | 'setExpandedPluginId'
  | 'setTimeoutDraftValue'
>;

export function PluginInstalledCard({
  controller,
  plugin,
}: {
  controller: PluginInstalledCardControllerProps;
  plugin: PluginSummary;
}) {
  const { t } = useTranslation('settings');
  const runtimeStatus = controller.runtimeStatuses[plugin.manifest.id];
  const isExpanded = controller.expandedPluginId === plugin.manifest.id;
  const isWorkspacePlugin = plugin.installation.source.kind === 'workspace';

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={(open) => controller.setExpandedPluginId(open ? plugin.manifest.id : null)}
    >
      <div className="rounded-xl border border-border/60 bg-background/60">
        <div className="flex items-center gap-3 px-4 py-3">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <div className="rounded-xl bg-purple-500/10 p-2 text-purple-500">
                {renderPluginManifestIcon(plugin.manifest.icon)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold">{plugin.manifest.name}</p>
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
                      {t('download.pluginWarningCount', { count: plugin.warnings.length })}
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
              onCheckedChange={(enabled) => controller.handleTogglePlugin(plugin, enabled)}
            />
          </div>
        </div>

        <CollapsibleContent className="border-t border-border/60 px-4 py-4">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {isWorkspacePlugin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => controller.handleRefreshPlugin(plugin.manifest.id)}
                  aria-label={t('download.pluginRefreshInfo')}
                  title={t('download.pluginRefreshInfo')}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {plugin.readmeContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    controller.openPluginGuide(plugin.manifest.name, plugin.readmeContent ?? '')
                  }
                >
                  <Info className="h-4 w-4" />
                  {t('download.pluginGuideButton')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => controller.handleOpenPluginLogs(plugin.manifest.id)}
              >
                <TerminalSquare className="h-4 w-4" />
                {t('download.pluginViewLogs')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => controller.handleOpenPluginDirectory(plugin.manifest.id)}
              >
                <FolderOpen className="h-4 w-4" />
                {t('download.pluginOpenFolder')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-dashed text-destructive hover:text-destructive"
                onClick={() => controller.handleUninstallPlugin(plugin)}
              >
                <Trash2 className="h-4 w-4" />
                {t(
                  isWorkspacePlugin ? 'download.pluginDetachWorkspace' : 'download.pluginUninstall',
                )}
              </Button>
            </div>

            <Tabs defaultValue="information" className="space-y-3">
              <TabsList className="grid h-auto w-full grid-cols-3 rounded-lg bg-muted/40 p-1">
                <TabsTrigger
                  value="information"
                  className="min-h-9 whitespace-normal px-2 py-1.5 text-[11px] leading-tight"
                >
                  {t('download.pluginPackageTitle')}
                </TabsTrigger>
                <TabsTrigger
                  value="permissions"
                  className="min-h-9 whitespace-normal px-2 py-1.5 text-[11px] leading-tight"
                >
                  {t('download.pluginPermissionsTitle')}
                </TabsTrigger>
                <TabsTrigger
                  value="compatibility"
                  className="min-h-9 whitespace-normal px-2 py-1.5 text-[11px] leading-tight"
                >
                  {t('download.pluginCompatibilityTitle')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="information" className="mt-0">
                <PluginPackageInfoCard controller={controller} plugin={plugin} />
              </TabsContent>
              <TabsContent value="permissions" className="mt-0">
                <PluginPermissionsConfigCard controller={controller} plugin={plugin} />
              </TabsContent>
              <TabsContent value="compatibility" className="mt-0">
                <PluginRuntimeCompatibilityCard controller={controller} plugin={plugin} />
              </TabsContent>
            </Tabs>

            {plugin.manifest.configFields.length > 0 && (
              <PluginConfigCard controller={controller} plugin={plugin} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
