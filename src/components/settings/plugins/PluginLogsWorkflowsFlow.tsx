import {
  Background,
  BackgroundVariant,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  type NodeTypes,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Plus, Power, Trash2, Workflow } from 'lucide-react';
import { type DragEvent, memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginLogsDialog } from '@/components/settings/PluginLogsDialog';
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
import type {
  PluginSummary,
  PluginTrigger,
  PluginWorkflowDefinition,
  PluginWorkflowFailurePolicy,
  PluginWorkflowNode,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { SettingsCard } from '../SettingsSection';
import {
  renderPluginManifestIcon,
  WORKFLOW_TRIGGER_TONES,
  WORKFLOW_TRIGGERS,
  type WorkflowTrigger,
} from './post-download-plugins-shared';
import type { PostDownloadPluginsCardController } from './usePostDownloadPluginsCard';

type PluginLogsWorkflowsFlowProps = Pick<
  PostDownloadPluginsCardController,
  | 'clearLogsConfirmOpen'
  | 'closeLogsDialog'
  | 'handleClearPluginLogs'
  | 'handleConfirmClearPluginLogs'
  | 'handleLoadMorePluginLogs'
  | 'loadPluginLogs'
  | 'logsClearing'
  | 'logsLoading'
  | 'logsLoadingMore'
  | 'logsOpen'
  | 'persistWorkflowDefinitions'
  | 'pluginLogs'
  | 'pluginLogsError'
  | 'pluginLogsHasMore'
  | 'pluginLogsTotal'
  | 'plugins'
  | 'selectedPlugin'
  | 'selectedPluginId'
  | 'setClearLogsConfirmOpen'
  | 'workflowDefinitions'
>;

type WorkflowTriggerNodeData = {
  label: string;
  trigger: PluginTrigger;
};

type WorkflowPluginNodeData = {
  failureContinueLabel: string;
  failureLabel: string;
  failureStopLabel: string;
  noDescriptionLabel: string;
  onFailurePolicyChange: (nodeId: string, failurePolicy: PluginWorkflowFailurePolicy) => void;
  plugin: PluginSummary | null;
  policy: PluginWorkflowFailurePolicy;
};

type TriggerNode = Node<WorkflowTriggerNodeData, 'workflowTrigger'>;
type PluginNode = Node<WorkflowPluginNodeData, 'workflowPlugin'>;
type CanvasNode = TriggerNode | PluginNode;

const BLOCK_MIME = 'application/youwee-workflow-block';

const nodeTypes = {
  workflowTrigger: WorkflowTriggerNodeView,
  workflowPlugin: WorkflowPluginNodeView,
} satisfies NodeTypes;

function WorkflowTriggerNodeView({ data }: NodeProps<TriggerNode>) {
  const tone = WORKFLOW_TRIGGER_TONES[data.trigger as WorkflowTrigger];
  return (
    <div className="min-w-[230px] rounded-md border bg-background p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
            tone.titleBadgeClassName,
          )}
        >
          <Play className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{data.label}</p>
          <p className="text-xs text-muted-foreground">{data.trigger}</p>
        </div>
      </div>
      <Handle
        className="!h-3 !w-3 !border-2 !border-background"
        type="source"
        position={Position.Right}
      />
    </div>
  );
}

function WorkflowPluginNodeView({ data, id }: NodeProps<PluginNode>) {
  const plugin = data.plugin;
  return (
    <div className="w-[300px] rounded-md border bg-card p-4 shadow-sm">
      <Handle
        className="!h-3 !w-3 !border-2 !border-background"
        type="target"
        position={Position.Left}
      />
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            {renderPluginManifestIcon(plugin?.manifest.icon, 'h-5 w-5')}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{plugin?.manifest.name ?? id}</p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {plugin?.manifest.description || data.noDescriptionLabel}
            </p>
          </div>
          {plugin && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              v{plugin.manifest.version}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-medium">{data.failureLabel}</p>
          <Select
            value={data.policy}
            onValueChange={(value) =>
              data.onFailurePolicyChange(id, value as PluginWorkflowFailurePolicy)
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="continue" className="text-xs">
                {data.failureContinueLabel}
              </SelectItem>
              <SelectItem value="stop-chain" className="text-xs">
                {data.failureStopLabel}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Handle
        className="!h-3 !w-3 !border-2 !border-background"
        type="source"
        position={Position.Right}
      />
    </div>
  );
}

function createWorkflowDefinition(name: string, trigger: PluginTrigger): PluginWorkflowDefinition {
  const id = `workflow-${Date.now()}`;
  return {
    id,
    name,
    enabled: true,
    nodes: [
      {
        kind: 'trigger',
        id: `${id}-trigger`,
        trigger,
        position: { x: 60, y: 160 },
      },
    ],
    edges: [],
  };
}

function toCanvasNodes(
  workflow: PluginWorkflowDefinition,
  plugins: PluginSummary[],
  labels: {
    failure: string;
    failureContinue: string;
    failureStop: string;
    noDescription: string;
    triggerLabels: Record<PluginTrigger, string>;
  },
  onFailurePolicyChange: (nodeId: string, failurePolicy: PluginWorkflowFailurePolicy) => void,
): CanvasNode[] {
  return workflow.nodes.map((workflowNode) => {
    if (workflowNode.kind === 'trigger') {
      return {
        id: workflowNode.id,
        type: 'workflowTrigger',
        position: workflowNode.position,
        data: {
          label: labels.triggerLabels[workflowNode.trigger],
          trigger: workflowNode.trigger,
        },
      };
    }

    return {
      id: workflowNode.id,
      type: 'workflowPlugin',
      position: workflowNode.position,
      data: {
        failureContinueLabel: labels.failureContinue,
        failureLabel: labels.failure,
        failureStopLabel: labels.failureStop,
        noDescriptionLabel: labels.noDescription,
        onFailurePolicyChange,
        plugin: plugins.find((plugin) => plugin.manifest.id === workflowNode.pluginId) ?? null,
        policy: workflowNode.failurePolicy,
      },
    };
  });
}

function toCanvasEdges(workflow: PluginWorkflowDefinition): Edge[] {
  return workflow.edges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed },
    className: 'stroke-primary/70',
  }));
}

function WorkflowCanvas({
  activeWorkflow,
  labels,
  onUpdateWorkflow,
  plugins,
}: {
  activeWorkflow: PluginWorkflowDefinition;
  labels: {
    failure: string;
    failureContinue: string;
    failureStop: string;
    noDescription: string;
    triggerLabels: Record<PluginTrigger, string>;
  };
  onUpdateWorkflow: (workflow: PluginWorkflowDefinition) => void;
  plugins: PluginSummary[];
}) {
  const { screenToFlowPosition } = useReactFlow();

  const updateNodePosition = useCallback(
    (nodeIdValue: string, position: { x: number; y: number }) => {
      onUpdateWorkflow({
        ...activeWorkflow,
        nodes: activeWorkflow.nodes.map((node) =>
          node.id === nodeIdValue ? { ...node, position } : node,
        ),
      });
    },
    [activeWorkflow, onUpdateWorkflow],
  );

  const updateFailurePolicy = useCallback(
    (nodeIdValue: string, failurePolicy: PluginWorkflowFailurePolicy) => {
      onUpdateWorkflow({
        ...activeWorkflow,
        nodes: activeWorkflow.nodes.map((node) =>
          node.kind === 'plugin' && node.id === nodeIdValue ? { ...node, failurePolicy } : node,
        ),
      });
    },
    [activeWorkflow, onUpdateWorkflow],
  );

  const nodes = useMemo(
    () => toCanvasNodes(activeWorkflow, plugins, labels, updateFailurePolicy),
    [activeWorkflow, labels, plugins, updateFailurePolicy],
  );
  const edges = useMemo(() => toCanvasEdges(activeWorkflow), [activeWorkflow]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || connection.source === connection.target) {
        return;
      }
      const targetNode = activeWorkflow.nodes.find((node) => node.id === connection.target);
      if (!targetNode || targetNode.kind === 'trigger') return;
      if (activeWorkflow.edges.some((edge) => edge.source === connection.source)) return;
      if (activeWorkflow.edges.some((edge) => edge.target === connection.target)) return;

      onUpdateWorkflow({
        ...activeWorkflow,
        edges: [
          ...activeWorkflow.edges,
          {
            id: `edge-${connection.source}-${connection.target}`,
            source: connection.source,
            target: connection.target,
          },
        ],
      });
    },
    [activeWorkflow, onUpdateWorkflow],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData(BLOCK_MIME);
      if (!raw) return;

      const block = JSON.parse(raw) as
        | { type: 'trigger'; trigger: PluginTrigger }
        | { type: 'plugin'; pluginId: string };
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const nextNode: PluginWorkflowNode =
        block.type === 'trigger'
          ? {
              kind: 'trigger',
              id: `trigger-${block.trigger}-${Date.now()}`,
              trigger: block.trigger,
              position,
            }
          : {
              kind: 'plugin',
              id: `plugin-${block.pluginId}-${Date.now()}`,
              pluginId: block.pluginId,
              failurePolicy: 'continue',
              position,
            };

      onUpdateWorkflow({
        ...activeWorkflow,
        nodes: [...activeWorkflow.nodes, nextNode],
      });
    },
    [activeWorkflow, onUpdateWorkflow, screenToFlowPosition],
  );

  const handleDeleteNodes = useCallback(
    (deletedNodes: Node[]) => {
      const deletedIds = new Set(deletedNodes.map((node) => node.id));
      onUpdateWorkflow({
        ...activeWorkflow,
        nodes: activeWorkflow.nodes.filter((node) => !deletedIds.has(node.id)),
        edges: activeWorkflow.edges.filter(
          (edge) => !deletedIds.has(edge.source) && !deletedIds.has(edge.target),
        ),
      });
    },
    [activeWorkflow, onUpdateWorkflow],
  );

  const handleDeleteEdges = useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((edge) => edge.id));
      onUpdateWorkflow({
        ...activeWorkflow,
        edges: activeWorkflow.edges.filter((edge) => !deletedIds.has(edge.id)),
      });
    },
    [activeWorkflow, onUpdateWorkflow],
  );

  return (
    <div
      role="application"
      className="h-[560px] overflow-hidden rounded-md border bg-background"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={handleDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onConnect={handleConnect}
        onNodeDragStop={(_, node) => updateNodePosition(node.id, node.position)}
        onNodesDelete={handleDeleteNodes}
        onEdgesDelete={handleDeleteEdges}
        fitView
        fitViewOptions={{ maxZoom: 1, minZoom: 0.45, padding: 0.2 }}
        minZoom={0.25}
        maxZoom={1.35}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-45" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          className="!bg-background/90"
          maskColor="hsl(var(--muted) / 0.55)"
        />
      </ReactFlow>
    </div>
  );
}

export const PluginLogsWorkflowsFlow = memo(function PluginLogsWorkflowsFlow(
  props: PluginLogsWorkflowsFlowProps,
) {
  const { t } = useTranslation('settings');
  const controller = props;
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);

  const activeWorkflow =
    controller.workflowDefinitions.find((workflow) => workflow.id === activeWorkflowId) ??
    controller.workflowDefinitions[0] ??
    null;

  const updateWorkflows = useCallback(
    async (nextDefinitions: PluginWorkflowDefinition[]) => {
      await controller.persistWorkflowDefinitions(nextDefinitions);
    },
    [controller],
  );

  const updateActiveWorkflow = useCallback(
    async (workflow: PluginWorkflowDefinition) => {
      await updateWorkflows(
        controller.workflowDefinitions.map((candidate) =>
          candidate.id === workflow.id ? workflow : candidate,
        ),
      );
    },
    [controller.workflowDefinitions, updateWorkflows],
  );

  const createWorkflow = useCallback(async () => {
    const workflow = createWorkflowDefinition(
      t('download.pluginWorkflowNewName'),
      'download.completed',
    );
    await updateWorkflows([...controller.workflowDefinitions, workflow]);
    setActiveWorkflowId(workflow.id);
  }, [controller.workflowDefinitions, t, updateWorkflows]);

  const deleteActiveWorkflow = useCallback(async () => {
    if (!activeWorkflow) return;
    const nextDefinitions = controller.workflowDefinitions.filter(
      (workflow) => workflow.id !== activeWorkflow.id,
    );
    await updateWorkflows(nextDefinitions);
    setActiveWorkflowId(nextDefinitions[0]?.id ?? null);
  }, [activeWorkflow, controller.workflowDefinitions, updateWorkflows]);

  const labels = useMemo(
    () => ({
      failure: t('download.pluginWorkflowFailureTitle'),
      failureContinue: t('download.pluginWorkflowFailureContinue'),
      failureStop: t('download.pluginWorkflowFailureStopChain'),
      noDescription: t('download.pluginNoDescription'),
      triggerLabels: Object.fromEntries(
        WORKFLOW_TRIGGERS.map((trigger) => [
          trigger,
          t(`download.pluginWorkflowTrigger.${trigger}.title`),
        ]),
      ) as Record<PluginTrigger, string>,
    }),
    [t],
  );

  return (
    <>
      <SettingsCard className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
          <div className="space-y-3 xl:w-[280px]">
            <div className="space-y-2 rounded-md border border-dashed bg-background/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{t('download.pluginWorkflowBuilderTitle')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-dashed"
                  onClick={createWorkflow}
                >
                  <Plus className="h-4 w-4" />
                  {t('download.pluginWorkflowCreate')}
                </Button>
              </div>
              {controller.workflowDefinitions.length > 0 ? (
                <Select
                  value={activeWorkflow?.id ?? ''}
                  onValueChange={(value) => setActiveWorkflowId(value)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {controller.workflowDefinitions.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id} className="text-xs">
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t('download.pluginWorkflowEmptyTitle')}
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-dashed bg-background/70 p-3">
              <p className="text-xs font-semibold">{t('download.pluginWorkflowPaletteTriggers')}</p>
              <div className="grid gap-2">
                {WORKFLOW_TRIGGERS.map((trigger) => {
                  const tone = WORKFLOW_TRIGGER_TONES[trigger];
                  return (
                    <button
                      key={trigger}
                      type="button"
                      draggable
                      className={cn(
                        'cursor-grab rounded-md border border-dashed p-3 text-left text-xs active:cursor-grabbing',
                        tone.triggerButtonSelectedClassName,
                      )}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          BLOCK_MIME,
                          JSON.stringify({ type: 'trigger', trigger }),
                        );
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <p className="font-semibold">
                        {t(`download.pluginWorkflowTrigger.${trigger}.title`)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-muted-foreground">
                        {t(`download.pluginWorkflowTrigger.${trigger}.desc`)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 rounded-md border border-dashed bg-background/70 p-3">
              <p className="text-xs font-semibold">{t('download.pluginWorkflowPalettePlugins')}</p>
              <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                {controller.plugins
                  .filter((plugin) => plugin.installation.enabled)
                  .map((plugin) => (
                    <button
                      key={plugin.manifest.id}
                      type="button"
                      draggable
                      className="flex cursor-grab items-start gap-2 rounded-md border border-dashed bg-muted/30 p-3 text-left active:cursor-grabbing"
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          BLOCK_MIME,
                          JSON.stringify({ type: 'plugin', pluginId: plugin.manifest.id }),
                        );
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        {renderPluginManifestIcon(plugin.manifest.icon, 'h-4 w-4')}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{plugin.manifest.name}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {plugin.manifest.description || t('download.pluginNoDescription')}
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            {activeWorkflow ? (
              <>
                <div className="flex flex-col gap-2 rounded-md border border-dashed bg-background/70 p-3 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-medium">{t('download.pluginWorkflowName')}</p>
                    <Input
                      key={activeWorkflow.id}
                      className="h-9"
                      defaultValue={activeWorkflow.name}
                      onBlur={(event) =>
                        updateActiveWorkflow({
                          ...activeWorkflow,
                          name: event.currentTarget.value.trim() || activeWorkflow.name,
                        })
                      }
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className={cn(
                        'border-dashed',
                        activeWorkflow.enabled && 'bg-emerald-500/10 text-emerald-600',
                      )}
                      onClick={() =>
                        updateActiveWorkflow({
                          ...activeWorkflow,
                          enabled: !activeWorkflow.enabled,
                        })
                      }
                    >
                      <Power className="h-4 w-4" />
                      {activeWorkflow.enabled
                        ? t('download.pluginEnabled')
                        : t('download.pluginDisabled')}
                    </Button>
                    <Button
                      variant="outline"
                      className="border-dashed text-destructive hover:text-destructive"
                      onClick={deleteActiveWorkflow}
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('download.pluginWorkflowDelete')}
                    </Button>
                  </div>
                </div>

                <ReactFlowProvider>
                  <WorkflowCanvas
                    activeWorkflow={activeWorkflow}
                    labels={labels}
                    onUpdateWorkflow={updateActiveWorkflow}
                    plugins={controller.plugins}
                  />
                </ReactFlowProvider>
              </>
            ) : (
              <div className="flex min-h-[560px] items-center justify-center rounded-md border border-dashed bg-background/70">
                <div className="space-y-3 text-center">
                  <Workflow className="mx-auto h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-semibold">
                      {t('download.pluginWorkflowEmptyTitle')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('download.pluginWorkflowEmptyDesc')}
                    </p>
                  </div>
                  <Button variant="outline" className="border-dashed" onClick={createWorkflow}>
                    <Plus className="h-4 w-4" />
                    {t('download.pluginWorkflowCreate')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SettingsCard>

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
