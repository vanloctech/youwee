import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SimpleMarkdown } from '@/components/ui/simple-markdown';
import { Switch } from '@/components/ui/switch';
import {
  getFilesystemPermissionLabel,
  getToolPermissionLabel,
} from './post-download-plugins-shared';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginDetailDialogsProps = Pick<
  PostDownloadPluginsCardController,
  | 'closePluginGuide'
  | 'handleConfirmUninstallPlugin'
  | 'handleEnablePluginWithPermissions'
  | 'permissionDialogPlugin'
  | 'permissionDialogState'
  | 'pluginGuideDialog'
  | 'setPermissionDialogPlugin'
  | 'setPermissionDialogState'
  | 'setUninstallTarget'
  | 'uninstallTarget'
>;

export function PluginDetailDialogs({ controller }: { controller: PluginDetailDialogsProps }) {
  const { t } = useTranslation('settings');

  return (
    <>
      <Dialog
        open={controller.pluginGuideDialog != null}
        onOpenChange={(open) => !open && controller.closePluginGuide()}
      >
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginGuideTitle')}</DialogTitle>
          </DialogHeader>

          {controller.pluginGuideDialog && (
            <div className="min-w-0 space-y-4">
              <p className="text-sm text-muted-foreground">{t('download.pluginGuideDesc')}</p>
              <div className="rounded-xl bg-muted/30 px-3 py-2 text-sm font-medium">
                {controller.pluginGuideDialog.title}
              </div>
              <div className="min-w-0 max-h-[60vh] overflow-y-auto overflow-x-hidden pe-1">
                <SimpleMarkdown
                  content={controller.pluginGuideDialog.content}
                  className="min-w-0 text-sm text-muted-foreground"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={controller.permissionDialogPlugin != null}
        onOpenChange={(open) => !open && controller.setPermissionDialogPlugin(null)}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginEnablePermissionsTitle')}</DialogTitle>
          </DialogHeader>

          {controller.permissionDialogPlugin && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('download.pluginEnablePermissionsDesc', {
                  name: controller.permissionDialogPlugin.manifest.name,
                })}
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginRequestedPermissions')}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {[
                    {
                      key: 'network' as const,
                      label: t('download.pluginPermissionNetwork'),
                      enabled: controller.permissionDialogPlugin.manifest.permissions.network,
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
                          checked={controller.permissionDialogState[permission.key]}
                          onCheckedChange={(checked) =>
                            controller.setPermissionDialogState((current) => ({
                              ...current,
                              [permission.key]: checked,
                            }))
                          }
                        />
                      </div>
                    ))}
                </div>

                {controller.permissionDialogPlugin.manifest.permissions.fs.length > 0 && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {controller.permissionDialogPlugin.manifest.permissions.fs.map((permission) => (
                      <div
                        key={permission}
                        className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                      >
                        <span className="text-sm">
                          {getFilesystemPermissionLabel(permission, t)}
                        </span>
                        <Switch
                          checked={controller.permissionDialogState.fs.includes(permission)}
                          onCheckedChange={(checked) =>
                            controller.setPermissionDialogState((current) => ({
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

                {controller.permissionDialogPlugin.manifest.permissions.tools.length > 0 && (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {controller.permissionDialogPlugin.manifest.permissions.tools.map(
                      (permission) => (
                        <div
                          key={permission}
                          className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                        >
                          <span className="text-sm">{getToolPermissionLabel(permission, t)}</span>
                          <Switch
                            checked={controller.permissionDialogState.tools.includes(permission)}
                            onCheckedChange={(checked) =>
                              controller.setPermissionDialogState((current) => ({
                                ...current,
                                tools: checked
                                  ? [...current.tools, permission].filter(
                                      (value, index, list) => list.indexOf(value) === index,
                                    )
                                  : current.tools.filter((value) => value !== permission),
                              }))
                            }
                          />
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {t('download.pluginEnablePermissionsHelp')}
              </p>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => controller.setPermissionDialogPlugin(null)}
                >
                  {t('download.pluginDismiss')}
                </Button>
                <Button onClick={controller.handleEnablePluginWithPermissions}>
                  {t('download.pluginEnableWithPermissions')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={controller.uninstallTarget != null}
        onOpenChange={(open) => !open && controller.setUninstallTarget(null)}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>
              {t(
                controller.uninstallTarget?.installation.source.kind === 'workspace'
                  ? 'download.pluginDetachWorkspace'
                  : 'download.pluginUninstall',
              )}
            </DialogTitle>
          </DialogHeader>

          {controller.uninstallTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t(
                  controller.uninstallTarget.installation.source.kind === 'workspace'
                    ? 'download.pluginDetachWorkspaceConfirm'
                    : 'download.pluginUninstallConfirm',
                  { name: controller.uninstallTarget.manifest.name },
                )}
              </p>
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                {controller.uninstallTarget.manifest.name}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => controller.setUninstallTarget(null)}>
              {t('download.pluginDismiss')}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={controller.handleConfirmUninstallPlugin}
            >
              <Trash2 className="h-4 w-4" />
              {t(
                controller.uninstallTarget?.installation.source.kind === 'workspace'
                  ? 'download.pluginDetachWorkspace'
                  : 'download.pluginUninstall',
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
