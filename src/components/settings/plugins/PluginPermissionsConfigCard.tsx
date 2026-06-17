import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import type { PluginSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  getFilesystemPermissionLabel,
  getToolPermissionLabel,
  summarizeRequestedPermissions,
} from './post-download-plugins-shared';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginPermissionsConfigCardControllerProps = Pick<
  PostDownloadPluginsCardController,
  'handleApprovePermissions'
>;

export function PluginPermissionsConfigCard({
  controller,
  plugin,
}: {
  controller: PluginPermissionsConfigCardControllerProps;
  plugin: PluginSummary;
}) {
  const { t } = useTranslation('settings');
  const requestedPermissions = summarizeRequestedPermissions(plugin, t);

  return (
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
                controller.handleApprovePermissions(plugin, {
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
          <p className="text-xs font-medium">{t('download.pluginPermissionFilesystem')}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {plugin.manifest.permissions.fs.map((permission) => {
              const approved = plugin.installation.approvedPermissions.fs.includes(permission);
              return (
                <div
                  key={permission}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <span className="text-xs">{getFilesystemPermissionLabel(permission, t)}</span>
                  <Switch
                    checked={approved}
                    onCheckedChange={(checked) =>
                      controller.handleApprovePermissions(plugin, {
                        ...plugin.installation.approvedPermissions,
                        fs: checked
                          ? [...plugin.installation.approvedPermissions.fs, permission].filter(
                              (value, index, list) => list.indexOf(value) === index,
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

      {plugin.manifest.permissions.tools.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium">{t('download.pluginPermissionTools')}</p>
          <div className="grid gap-2 md:grid-cols-2">
            {plugin.manifest.permissions.tools.map((permission) => {
              const approved = plugin.installation.approvedPermissions.tools.includes(permission);
              return (
                <div
                  key={permission}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <span className="text-xs">{getToolPermissionLabel(permission, t)}</span>
                  <Switch
                    checked={approved}
                    onCheckedChange={(checked) =>
                      controller.handleApprovePermissions(plugin, {
                        ...plugin.installation.approvedPermissions,
                        tools: checked
                          ? [...plugin.installation.approvedPermissions.tools, permission].filter(
                              (value, index, list) => list.indexOf(value) === index,
                            )
                          : plugin.installation.approvedPermissions.tools.filter(
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
    </div>
  );
}
