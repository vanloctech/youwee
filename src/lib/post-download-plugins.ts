import { invoke } from '@tauri-apps/api/core';
import type {
  PluginSummary,
  PluginTrigger,
  PluginTriggerWorkflow,
  PluginWorkflowDefinition,
  PluginWorkflowSnapshotMap,
  PluginWorkflowStepSnapshot,
  PostDownloadPluginPayload,
} from '@/lib/types';

const STORAGE_KEY = 'youwee-plugin-workflow-snapshots';
const LEGACY_STORAGE_KEY = 'youwee-post-download-workflow-steps';
export const DOWNLOAD_WORKFLOW_TRIGGERS: PluginTrigger[] = [
  'download.queued',
  'download.beforeStart',
  'download.completed',
  'download.failed',
];

function isWorkflowStepSnapshot(value: unknown): value is PluginWorkflowStepSnapshot {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as PluginWorkflowStepSnapshot).pluginId === 'string' &&
      typeof (value as PluginWorkflowStepSnapshot).pluginName === 'string' &&
      typeof (value as PluginWorkflowStepSnapshot).pluginVersion === 'string',
  );
}

function sanitizeSnapshotMap(value: unknown): PluginWorkflowSnapshotMap {
  if (!value || typeof value !== 'object') return {};

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([trigger]) => DOWNLOAD_WORKFLOW_TRIGGERS.includes(trigger as PluginTrigger))
    .map(([trigger, steps]) => [
      trigger,
      Array.isArray(steps) ? steps.filter(isWorkflowStepSnapshot) : [],
    ]);

  return Object.fromEntries(entries) as PluginWorkflowSnapshotMap;
}

function snapshotFromWorkflow(
  workflow: PluginTriggerWorkflow,
  plugins: PluginSummary[],
): PluginWorkflowStepSnapshot[] {
  return workflow.steps.reduce<PluginWorkflowStepSnapshot[]>((steps, step) => {
    const plugin = plugins.find((item) => item.manifest.id === step.pluginId);
    if (!plugin || !plugin.installation.enabled) {
      return steps;
    }

    steps.push({
      pluginId: plugin.manifest.id,
      pluginName: plugin.manifest.name,
      pluginVersion: plugin.manifest.version,
      selectedProvider: plugin.installation.selectedProvider,
      timeoutSecOverride: plugin.installation.timeoutSecOverride,
      approvedPermissions: plugin.installation.approvedPermissions,
      failurePolicy: step.failurePolicy,
    });
    return steps;
  }, []);
}

export function stepsFromWorkflowDefinition(
  workflow: PluginWorkflowDefinition,
  trigger: PluginTrigger,
) {
  const triggerNodeIds = workflow.nodes
    .filter((node) => node.kind === 'trigger' && node.trigger === trigger)
    .map((node) => node.id);

  return triggerNodeIds.flatMap((nodeId) => linearStepsFromNode(workflow, nodeId));
}

function linearStepsFromNode(workflow: PluginWorkflowDefinition, startNodeId: string) {
  const steps: PluginTriggerWorkflow['steps'] = [];
  const visited = new Set([startNodeId]);
  let currentNodeId = startNodeId;

  while (true) {
    const edge = workflow.edges
      .filter((candidate) => candidate.source === currentNodeId)
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (!edge || visited.has(edge.target)) break;

    visited.add(edge.target);
    const targetNode = workflow.nodes.find((node) => node.id === edge.target);
    if (!targetNode) break;
    if (targetNode.kind === 'plugin') {
      steps.push({
        pluginId: targetNode.pluginId,
        failurePolicy: targetNode.failurePolicy,
      });
    }
    currentNodeId = edge.target;
  }

  return steps;
}

export function buildWorkflowsFromDefinitions(
  definitions: PluginWorkflowDefinition[],
): PluginTriggerWorkflow[] {
  return DOWNLOAD_WORKFLOW_TRIGGERS.map((trigger) => ({
    trigger,
    steps: definitions
      .filter((workflow) => workflow.enabled)
      .flatMap((workflow) => stepsFromWorkflowDefinition(workflow, trigger)),
  }));
}

export function buildWorkflowSnapshotMap(
  plugins: PluginSummary[],
  workflows: PluginTriggerWorkflow[],
): PluginWorkflowSnapshotMap {
  return Object.fromEntries(
    workflows.map((workflow) => [workflow.trigger, snapshotFromWorkflow(workflow, plugins)]),
  ) as PluginWorkflowSnapshotMap;
}

export function loadPluginWorkflowSnapshots(): PluginWorkflowSnapshotMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return sanitizeSnapshotMap(JSON.parse(raw));
    }
  } catch (error) {
    console.error('Failed to load plugin workflow snapshots:', error);
  }

  try {
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return {};
    const parsed = JSON.parse(legacyRaw);
    if (!Array.isArray(parsed)) return {};
    return {
      'download.completed': parsed.filter(isWorkflowStepSnapshot),
    };
  } catch (error) {
    console.error('Failed to load legacy post-download workflow steps:', error);
    return {};
  }
}

export function savePluginWorkflowSnapshots(snapshots: PluginWorkflowSnapshotMap) {
  try {
    const sanitized = sanitizeSnapshotMap(snapshots);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(sanitized['download.completed'] ?? []));
  } catch (error) {
    console.error('Failed to save plugin workflow snapshots:', error);
  }
}

export async function refreshPluginWorkflowSnapshots(): Promise<PluginWorkflowSnapshotMap> {
  try {
    const [plugins, definitions] = await Promise.all([
      invoke<PluginSummary[]>('list_plugins'),
      invoke<PluginWorkflowDefinition[]>('list_plugin_workflows'),
    ]);
    const workflows = buildWorkflowsFromDefinitions(definitions);
    const snapshots = buildWorkflowSnapshotMap(plugins, workflows);
    savePluginWorkflowSnapshots(snapshots);
    return snapshots;
  } catch (error) {
    console.error('Failed to refresh plugin workflow snapshots:', error);
    return loadPluginWorkflowSnapshots();
  }
}

export function loadPostDownloadWorkflowSteps(): PluginWorkflowStepSnapshot[] {
  return loadPluginWorkflowSnapshots()['download.completed'] ?? [];
}

export function savePostDownloadWorkflowSteps(steps: PluginWorkflowStepSnapshot[]) {
  savePluginWorkflowSnapshots({
    ...loadPluginWorkflowSnapshots(),
    'download.completed': steps,
  });
}

export async function refreshPostDownloadWorkflowSteps(): Promise<PluginWorkflowStepSnapshot[]> {
  const snapshots = await refreshPluginWorkflowSnapshots();
  return snapshots['download.completed'] ?? [];
}

export async function enqueuePluginWorkflowTrigger(
  trigger: PluginTrigger,
  payload: PostDownloadPluginPayload,
  snapshots?: PluginWorkflowSnapshotMap,
) {
  const workflowSnapshots = snapshots ?? loadPluginWorkflowSnapshots();
  const workflowSteps = workflowSnapshots[trigger] ?? [];
  if (workflowSteps.length === 0) return null;

  return invoke<string | null>('enqueue_plugin_workflow_trigger', {
    trigger,
    payload,
    workflowSteps,
  });
}
