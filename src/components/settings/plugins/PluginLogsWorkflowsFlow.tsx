import { ChevronDown, MoveDown, MoveUp, Plus, Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginLogsDialog } from '@/components/settings/PluginLogsDialog';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PluginWorkflowFailurePolicy } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SettingsCard } from '../SettingsSection';
import { WORKFLOW_TRIGGER_TONES, WORKFLOW_TRIGGERS } from './post-download-plugins-shared';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginLogsWorkflowsFlowProps = Pick<
  PostDownloadPluginsCardController,
  | 'availableWorkflowPluginsByTrigger'
  | 'clearLogsConfirmOpen'
  | 'closeLogsDialog'
  | 'handleAddWorkflowPlugin'
  | 'handleClearPluginLogs'
  | 'handleConfirmClearPluginLogs'
  | 'handleLoadMorePluginLogs'
  | 'handleMoveWorkflowStep'
  | 'handleRemoveWorkflowStep'
  | 'handleWorkflowFailurePolicy'
  | 'loadPluginLogs'
  | 'logsClearing'
  | 'logsLoading'
  | 'logsLoadingMore'
  | 'logsOpen'
  | 'pluginLogs'
  | 'pluginLogsError'
  | 'pluginLogsHasMore'
  | 'pluginLogsTotal'
  | 'selectedPlugin'
  | 'selectedPluginId'
  | 'setClearLogsConfirmOpen'
  | 'setWorkflowCandidates'
  | 'workflowCandidates'
  | 'workflowPluginsByTrigger'
>;

export const PluginLogsWorkflowsFlow = memo(function PluginLogsWorkflowsFlow(
  props: PluginLogsWorkflowsFlowProps,
) {
  const { t } = useTranslation('settings');
  const controller = props;

  return (
    <>
      <div className="space-y-4">
        {WORKFLOW_TRIGGERS.map((trigger) => {
          const workflowPlugins = controller.workflowPluginsByTrigger[trigger] ?? [];
          const availableWorkflowPlugins =
            controller.availableWorkflowPluginsByTrigger[trigger] ?? [];
          const candidateValue = controller.workflowCandidates[trigger] ?? '';
          const tone = WORKFLOW_TRIGGER_TONES[trigger];

          return (
            <Collapsible key={trigger}>
              <SettingsCard className={cn('space-y-0', tone.cardClassName)}>
                {trigger === 'download.queued' && (
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(148,163,184,0.10),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(148,163,184,0.05),_transparent_34%)]" />
                )}
                {trigger === 'download.beforeStart' && (
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.06),_transparent_34%)]" />
                )}
                {trigger === 'download.completed' && (
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.06),_transparent_34%)]" />
                )}
                {trigger === 'download.failed' && (
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(244,63,94,0.12),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(244,63,94,0.06),_transparent_34%)]" />
                )}

                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="relative z-10 flex w-full items-center justify-between gap-3 text-start"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                            tone.titleBadgeClassName,
                          )}
                        >
                          {t(`download.pluginWorkflowTrigger.${trigger}.title`)}
                        </span>
                        {workflowPlugins.length > 0 && (
                          <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {workflowPlugins.length}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(`download.pluginWorkflowTrigger.${trigger}.desc`)}
                      </p>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="relative z-10 space-y-4 pt-4">
                    <div className={cn('rounded-xl border border-dashed p-4', tone.panelClassName)}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-xs font-medium">
                            {t('download.pluginWorkflowAddLabel')}
                          </p>
                          <Select
                            value={candidateValue}
                            onValueChange={(value) =>
                              controller.setWorkflowCandidates((current) => ({
                                ...current,
                                [trigger]: value,
                              }))
                            }
                          >
                            <SelectTrigger className="h-9 text-xs">
                              <SelectValue
                                placeholder={t('download.pluginWorkflowAddPlaceholder')}
                              />
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
                          onClick={() => controller.handleAddWorkflowPlugin(trigger)}
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
                        <p className="text-sm font-medium">
                          {t('download.pluginWorkflowEmptyTitle')}
                        </p>
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
                                    {plugin.manifest.description ||
                                      t('download.pluginNoDescription')}
                                  </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      controller.handleMoveWorkflowStep(
                                        trigger,
                                        plugin.manifest.id,
                                        -1,
                                      )
                                    }
                                    disabled={index === 0}
                                  >
                                    <MoveUp className="h-4 w-4" />
                                    {t('download.pluginWorkflowMoveUp')}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      controller.handleMoveWorkflowStep(
                                        trigger,
                                        plugin.manifest.id,
                                        1,
                                      )
                                    }
                                    disabled={index === workflowPlugins.length - 1}
                                  >
                                    <MoveDown className="h-4 w-4" />
                                    {t('download.pluginWorkflowMoveDown')}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      controller.handleRemoveWorkflowStep(
                                        trigger,
                                        plugin.manifest.id,
                                      )
                                    }
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
                                      controller.handleWorkflowFailurePolicy(
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
                  </div>
                </CollapsibleContent>
              </SettingsCard>
            </Collapsible>
          );
        })}
      </div>

      <PluginLogsDialog
        open={controller.logsOpen}
        onOpenChange={(open) => {
          if (!open) {
            controller.closeLogsDialog();
          }
        }}
        plugin={controller.selectedPlugin}
        logs={controller.pluginLogs}
        total={controller.pluginLogsTotal}
        loading={controller.logsLoading}
        loadingMore={controller.logsLoadingMore}
        clearing={controller.logsClearing}
        hasMore={controller.pluginLogsHasMore}
        error={controller.pluginLogsError}
        onRefresh={() =>
          controller.selectedPluginId
            ? controller.loadPluginLogs(controller.selectedPluginId, 'replace')
            : undefined
        }
        onLoadMore={controller.handleLoadMorePluginLogs}
        onClear={controller.handleClearPluginLogs}
      />

      <Dialog
        open={controller.clearLogsConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            controller.setClearLogsConfirmOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{t('download.pluginLogsClear')}</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">{t('download.pluginLogsClearConfirm')}</p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => controller.setClearLogsConfirmOpen(false)}>
              {t('download.pluginDismiss')}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={controller.handleConfirmClearPluginLogs}
              disabled={controller.logsClearing}
            >
              <Trash2 className="h-4 w-4" />
              {t('download.pluginLogsClear')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});
