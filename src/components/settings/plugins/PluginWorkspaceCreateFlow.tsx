import { Atom, ExternalLink, FolderOpen, Info, Plus } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { PluginProvider } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  CONFIG_FIELD_INPUT_TYPES,
  type CreatePluginConfigFieldDraft,
  FILESYSTEM_PERMISSIONS,
  getFilesystemPermissionLabel,
  getToolPermissionLabel,
  LANGUAGE_LABELS,
  PROVIDER_LABELS,
  renderPluginManifestIcon,
  TOOL_PERMISSIONS,
  ToggleChoiceCard,
  WORKFLOW_TRIGGER_TONES,
  WORKFLOW_TRIGGERS,
} from './post-download-plugins-shared';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginWorkspaceActionsProps = {
  onAttachWorkspace: PostDownloadPluginsCardController['handleAttachWorkspace'];
  onOpenGuide: () => void;
};

type PluginCreateWorkspaceActionProps = {
  onOpenCreateDialog: PostDownloadPluginsCardController['openCreateDialog'];
};

type PluginWorkspaceCreateFlowProps = Pick<
  PostDownloadPluginsCardController,
  | 'addCreatePluginConfigField'
  | 'addCreatePluginConfigOption'
  | 'attachWorkspacePath'
  | 'createOpen'
  | 'creating'
  | 'createPluginCanSubmit'
  | 'createPluginConfigValidation'
  | 'createPluginForm'
  | 'createdWorkspace'
  | 'defaultProviders'
  | 'dismissCreatedWorkspace'
  | 'handleAttachWorkspace'
  | 'handleConfirmAttachWorkspace'
  | 'handleCreatePlugin'
  | 'handleOpenWorkspacePath'
  | 'handlePickWorkspaceRoot'
  | 'handleSetDefaultProvider'
  | 'providers'
  | 'removeCreatePluginConfigField'
  | 'removeCreatePluginConfigOption'
  | 'resetCreateDialog'
  | 'runtimeGuideOpen'
  | 'setAttachWorkspacePath'
  | 'setCreateOpen'
  | 'setRuntimeGuideOpen'
  | 'toggleCreatePluginFilesystemPermission'
  | 'toggleCreatePluginToolPermission'
  | 'toggleCreatePluginProvider'
  | 'toggleCreatePluginTrigger'
  | 'updateCreatePluginConfigField'
  | 'updateCreatePluginConfigOption'
  | 'updateCreatePluginForm'
>;

const PLUGINS_PAGE_URL = 'https://youwee.app/plugins';

export const PluginWorkspaceActions = memo(function PluginWorkspaceActions({
  onAttachWorkspace,
  onOpenGuide,
}: PluginWorkspaceActionsProps) {
  const { t } = useTranslation('settings');

  return (
    <>
      <Button variant="outline" size="sm" className="border-dashed" asChild>
        <a href={PLUGINS_PAGE_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" />
          Docs
        </a>
      </Button>
      <Button variant="outline" size="sm" className="border-dashed" onClick={onOpenGuide}>
        <Info className="h-4 w-4" />
        {t('download.pluginOverviewGuideButton')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="border-dashed"
        onClick={() => onAttachWorkspace()}
      >
        <Atom className="h-4 w-4" />
        {t('download.pluginAttachWorkspace')}
      </Button>
    </>
  );
});

export const PluginCreateWorkspaceAction = memo(function PluginCreateWorkspaceAction({
  onOpenCreateDialog,
}: PluginCreateWorkspaceActionProps) {
  const { t } = useTranslation('settings');

  return (
    <Button size="sm" onClick={onOpenCreateDialog}>
      <Plus className="h-4 w-4" />
      {t('download.pluginCreateWorkspace')}
    </Button>
  );
});

export const PluginWorkspaceCreateFlow = memo(function PluginWorkspaceCreateFlow(
  props: PluginWorkspaceCreateFlowProps,
) {
  const { t } = useTranslation('settings');
  const controller = props;

  return (
    <>
      {controller.createdWorkspace && (
        <div className="rounded-xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold">{t('download.pluginWorkspaceCreatedTitle')}</p>
              <p className="text-xs text-muted-foreground">
                {t('download.pluginWorkspaceCreatedDesc', {
                  name: controller.createdWorkspace.name,
                })}
              </p>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <p className="break-all">
                  {t('download.pluginWorkspacePathLabel')}: {controller.createdWorkspace.path}
                </p>
                <p className="break-all">
                  {t('download.pluginManifestPathLabel')}:{' '}
                  {controller.createdWorkspace.manifestPath}
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
                onClick={() =>
                  controller.createdWorkspace &&
                  controller.handleOpenWorkspacePath(controller.createdWorkspace.path)
                }
              >
                <FolderOpen className="h-4 w-4" />
                {t('download.pluginWorkspaceOpen')}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  controller.createdWorkspace &&
                  controller.handleAttachWorkspace(controller.createdWorkspace.path)
                }
              >
                <Atom className="h-4 w-4" />
                {t('download.pluginAttachWorkspace')}
              </Button>
              <Button variant="outline" onClick={controller.dismissCreatedWorkspace}>
                {t('download.pluginDismiss')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={controller.createOpen}
        onOpenChange={(open) => {
          if (open) {
            controller.setCreateOpen(true);
            return;
          }
          controller.resetCreateDialog();
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
                    value={controller.createPluginForm.name}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('name', event.target.value)
                    }
                    placeholder={t('download.pluginNamePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginWorkspacePathLabel')}</p>
                  <div className="flex gap-2">
                    <Input
                      value={controller.createPluginForm.destinationRoot}
                      onChange={(event) =>
                        controller.updateCreatePluginForm('destinationRoot', event.target.value)
                      }
                      placeholder={t('download.pluginCreateLocationPlaceholder')}
                    />
                    <Button
                      variant="outline"
                      type="button"
                      onClick={controller.handlePickWorkspaceRoot}
                    >
                      {t('download.pluginCreateBrowse')}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginCreateIdLabel')}</p>
                  <Input
                    value={controller.createPluginForm.id}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('id', event.target.value)
                    }
                    placeholder={t('download.pluginCreateIdPlaceholder')}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginCreateSlugLabel')}</p>
                  <Input
                    value={controller.createPluginForm.slug}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('slug', event.target.value)
                    }
                    placeholder={t('download.pluginSlugPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginVersionLabel')}</p>
                  <Input
                    value={controller.createPluginForm.version}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('version', event.target.value)
                    }
                    placeholder="0.1.0"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginLicenseLabel')}</p>
                  <Input
                    value={controller.createPluginForm.license}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('license', event.target.value)
                    }
                    placeholder="MIT"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginCreateIconLabel')}</p>
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
                    {renderPluginManifestIcon(controller.createPluginForm.icon || null, 'h-5 w-5')}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      value={controller.createPluginForm.icon}
                      onChange={(event) =>
                        controller.updateCreatePluginForm('icon', event.target.value)
                      }
                      placeholder={t('download.pluginCreateIconPlaceholder')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('download.pluginCreateIconHelp')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t('download.pluginDescriptionLabel')}</p>
                <Textarea
                  value={controller.createPluginForm.description}
                  onChange={(event) =>
                    controller.updateCreatePluginForm('description', event.target.value)
                  }
                  placeholder={t('download.pluginCreateDescriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginAuthorLabel')}</p>
                  <Input
                    value={controller.createPluginForm.author}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('author', event.target.value)
                    }
                    placeholder={t('download.pluginCreateAuthorPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginTimeoutLabel')}</p>
                  <Input
                    type="number"
                    min={1}
                    value={controller.createPluginForm.timeoutSec}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('timeoutSec', event.target.value)
                    }
                    placeholder="60"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginHomepageLabel')}</p>
                  <Input
                    value={controller.createPluginForm.homepage}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('homepage', event.target.value)
                    }
                    placeholder="https://example.com"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('download.pluginRepositoryLabel')}</p>
                  <Input
                    value={controller.createPluginForm.repository}
                    onChange={(event) =>
                      controller.updateCreatePluginForm('repository', event.target.value)
                    }
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
                    const selected =
                      controller.createPluginForm.supportedProviders.includes(provider);
                    return (
                      <button
                        key={provider}
                        type="button"
                        onClick={() => controller.toggleCreatePluginProvider(provider)}
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
                    const selected = controller.createPluginForm.triggers.includes(trigger);
                    const tone = WORKFLOW_TRIGGER_TONES[trigger];
                    return (
                      <button
                        key={trigger}
                        type="button"
                        onClick={() => controller.toggleCreatePluginTrigger(trigger)}
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
                  checked={controller.createPluginForm.permissionNetwork}
                  onCheckedChange={(checked) =>
                    controller.updateCreatePluginForm('permissionNetwork', checked)
                  }
                />
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">{t('download.pluginPermissionFilesystem')}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {FILESYSTEM_PERMISSIONS.map((permission) => {
                    const selected =
                      controller.createPluginForm.permissionFilesystem.includes(permission);
                    return (
                      <button
                        key={permission}
                        type="button"
                        onClick={() =>
                          controller.toggleCreatePluginFilesystemPermission(permission)
                        }
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

              <div className="space-y-3">
                <p className="text-sm font-medium">{t('download.pluginPermissionTools')}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {TOOL_PERMISSIONS.map((permission) => {
                    const selected =
                      controller.createPluginForm.permissionTools.includes(permission);
                    return (
                      <button
                        key={permission}
                        type="button"
                        onClick={() => controller.toggleCreatePluginToolPermission(permission)}
                        className={cn(
                          'flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                          selected
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-border/60 bg-background/70 text-muted-foreground hover:bg-muted/60',
                        )}
                      >
                        <span>{getToolPermissionLabel(permission, t)}</span>
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
            </div>

            <PluginWorkspaceConfigFields controller={controller} />

            <p className="text-xs text-muted-foreground">{t('download.pluginCreateHelp')}</p>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={controller.resetCreateDialog}
                disabled={controller.creating}
              >
                {t('download.pluginDismiss')}
              </Button>
              <Button
                onClick={controller.handleCreatePlugin}
                disabled={!controller.createPluginCanSubmit}
              >
                <Plus className="h-4 w-4" />
                {controller.creating
                  ? t('download.pluginCreating')
                  : t('download.pluginCreateWorkspace')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={controller.attachWorkspacePath != null}
        onOpenChange={(open) => {
          if (!open) {
            controller.setAttachWorkspacePath(null);
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
            {controller.attachWorkspacePath && (
              <div className="break-all rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
                {controller.attachWorkspacePath}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => controller.setAttachWorkspacePath(null)}>
              {t('download.pluginDismiss')}
            </Button>
            <Button onClick={controller.handleConfirmAttachWorkspace}>
              <Atom className="h-4 w-4" />
              {t('download.pluginAttachWorkspace')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={controller.runtimeGuideOpen} onOpenChange={controller.setRuntimeGuideOpen}>
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
              {[
                ['download.pluginWorkspaceStep1Title', 'download.pluginWorkspaceStep1Desc'],
                ['download.pluginWorkspaceStep2Title', 'download.pluginWorkspaceStep2Desc'],
                ['download.pluginWorkspaceStep3Title', 'download.pluginWorkspaceStep3Desc'],
              ].map(([titleKey, descKey]) => (
                <div
                  key={titleKey}
                  className="rounded-lg border border-border/60 bg-background/70 p-3"
                >
                  <p className="text-xs font-medium">{t(titleKey)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t(descKey)}</p>
                </div>
              ))}
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
              {(['javascript', 'python'] as const).map((language) => {
                const allowedProviders = controller.providers.filter((provider) =>
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
                        value={
                          controller.defaultProviders[language] ?? allowedProviders[0].provider
                        }
                        onValueChange={(value) =>
                          controller.handleSetDefaultProvider(language, value as PluginProvider)
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
              {controller.providers.map((provider) => (
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
    </>
  );
});

type PluginWorkspaceConfigFieldsProps = Pick<
  PostDownloadPluginsCardController,
  | 'addCreatePluginConfigField'
  | 'addCreatePluginConfigOption'
  | 'createPluginConfigValidation'
  | 'createPluginForm'
  | 'removeCreatePluginConfigField'
  | 'removeCreatePluginConfigOption'
  | 'updateCreatePluginConfigField'
  | 'updateCreatePluginConfigOption'
>;

function PluginWorkspaceConfigFields({
  controller,
}: {
  controller: PluginWorkspaceConfigFieldsProps;
}) {
  const { t } = useTranslation('settings');

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t('download.pluginCreateConfigFieldsTitle')}</p>
          <p className="text-xs text-muted-foreground">
            {t('download.pluginCreateConfigFieldsHelp')}
          </p>
        </div>
        <Button variant="outline" type="button" onClick={controller.addCreatePluginConfigField}>
          <Plus className="h-4 w-4" />
          {t('download.pluginCreateConfigAddField')}
        </Button>
      </div>

      {controller.createPluginConfigValidation.globalErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {controller.createPluginConfigValidation.globalErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      {controller.createPluginForm.configFields.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          {t('download.pluginCreateConfigEmpty')}
        </div>
      ) : (
        <div className="space-y-4">
          {controller.createPluginForm.configFields.map((field, fieldIndex) => {
            const usesOptions = field.inputType === 'select' || field.inputType === 'multi-select';
            const usesNumberBounds = field.inputType === 'number';
            const fieldValidationErrors =
              controller.createPluginConfigValidation.fieldErrors[field.clientId] ?? [];

            return (
              <div
                key={field.clientId}
                className={cn(
                  'space-y-4 rounded-xl border bg-background/70 p-4',
                  fieldValidationErrors.length > 0 ? 'border-destructive/40' : 'border-border/60',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {t('download.pluginCreateConfigFieldTitle', { index: fieldIndex + 1 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {field.key.trim() || t('download.pluginCreateConfigFieldUntitled')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => controller.removeCreatePluginConfigField(fieldIndex)}
                  >
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
                        controller.updateCreatePluginConfigField(
                          fieldIndex,
                          'key',
                          event.target.value,
                        )
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
                        controller.updateCreatePluginConfigField(
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
                        controller.updateCreatePluginConfigField(
                          fieldIndex,
                          'inputType',
                          value as CreatePluginConfigFieldDraft['inputType'],
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
                        controller.updateCreatePluginConfigField(
                          fieldIndex,
                          'placeholder',
                          event.target.value,
                        )
                      }
                      placeholder={t('download.pluginCreateConfigFieldPlaceholderPlaceholder')}
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
                      controller.updateCreatePluginConfigField(
                        fieldIndex,
                        'description',
                        event.target.value,
                      )
                    }
                    rows={3}
                    placeholder={t('download.pluginCreateConfigFieldDescriptionPlaceholder')}
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
                        controller.updateCreatePluginConfigField(fieldIndex, 'required', checked)
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
                        controller.updateCreatePluginConfigField(fieldIndex, 'sensitive', checked)
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
                          controller.updateCreatePluginConfigField(
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
                                  controller.updateCreatePluginConfigField(
                                    fieldIndex,
                                    'defaultValueMulti',
                                    next,
                                  );
                                }}
                              />
                            );
                          })}
                      </div>
                    </div>
                  ) : (
                    <Input
                      type={field.inputType === 'number' ? 'number' : 'text'}
                      value={field.defaultValueText}
                      onChange={(event) =>
                        controller.updateCreatePluginConfigField(
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
                    {(['min', 'max', 'step'] as const).map((key) => (
                      <div key={key} className="space-y-2">
                        <p className="text-sm font-medium">
                          {t(
                            `download.pluginCreateConfigField${
                              key.charAt(0).toUpperCase() + key.slice(1)
                            }Label`,
                          )}
                        </p>
                        <Input
                          type="number"
                          value={field[key]}
                          onChange={(event) =>
                            controller.updateCreatePluginConfigField(
                              fieldIndex,
                              key,
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    ))}
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
                        onClick={() => controller.addCreatePluginConfigOption(fieldIndex)}
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
                              controller.updateCreatePluginConfigOption(
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
                              controller.updateCreatePluginConfigOption(
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
                              controller.removeCreatePluginConfigOption(fieldIndex, optionIndex)
                            }
                          >
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
  );
}
