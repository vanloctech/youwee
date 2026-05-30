use std::collections::BTreeMap;
use std::path::Path;

use serde_json::Value;
use tauri::AppHandle;

use crate::types::{
    PluginChainMutation, PluginChainState, PluginExecutionResult, PluginSummary,
    PluginTriggerWorkflow, PluginWorkflowDefinition, PluginWorkflowEdge,
    PluginWorkflowFailurePolicy, PluginWorkflowNode, PluginWorkflowNodePosition,
    PluginWorkflowRunStatus, PluginWorkflowStepConfig, PluginWorkflowStepSnapshot,
    PostDownloadPluginPayload,
};

use super::registry::{read_registry, PluginRegistry, PluginTriggerWorkflowRegistry};

fn workflow_registry_for_trigger<'a>(
    registry: &'a PluginRegistry,
    trigger: &str,
) -> Option<&'a PluginTriggerWorkflowRegistry> {
    registry.trigger_workflows.get(trigger)
}

pub(super) fn get_trigger_workflow_internal(
    app: &AppHandle,
    trigger: &str,
) -> Result<PluginTriggerWorkflow, String> {
    let registry = read_registry(app)?;
    Ok(PluginTriggerWorkflow {
        trigger: trigger.to_string(),
        steps: workflow_steps_for_trigger(&registry, trigger),
    })
}

pub(super) fn workflow_definitions_from_registry(
    registry: &PluginRegistry,
) -> Vec<PluginWorkflowDefinition> {
    if !registry.workflows.is_empty() {
        return registry.workflows.clone();
    }

    registry
        .trigger_workflows
        .iter()
        .filter(|(_, workflow)| !workflow.steps.is_empty())
        .map(|(trigger, workflow)| legacy_workflow_definition(trigger, &workflow.steps))
        .collect()
}

pub(super) fn workflow_steps_for_trigger(
    registry: &PluginRegistry,
    trigger: &str,
) -> Vec<PluginWorkflowStepConfig> {
    let workflows = workflow_definitions_from_registry(registry);
    if workflows.is_empty() {
        return workflow_registry_for_trigger(registry, trigger)
            .map(|workflow| workflow.steps.clone())
            .unwrap_or_default();
    }

    workflows
        .iter()
        .filter(|workflow| workflow.enabled)
        .flat_map(|workflow| workflow_steps_from_definition(workflow, trigger))
        .collect()
}

pub(super) fn trigger_workflow_registries_from_definitions(
    workflows: &[PluginWorkflowDefinition],
) -> BTreeMap<String, PluginTriggerWorkflowRegistry> {
    let mut registries = BTreeMap::new();
    for trigger in [
        "download.queued",
        "download.beforeStart",
        "download.completed",
        "download.failed",
    ] {
        let steps = workflows
            .iter()
            .filter(|workflow| workflow.enabled)
            .flat_map(|workflow| workflow_steps_from_definition(workflow, trigger))
            .collect::<Vec<_>>();
        registries.insert(trigger.to_string(), PluginTriggerWorkflowRegistry { steps });
    }
    registries
}

pub(super) fn legacy_workflow_definition(
    trigger: &str,
    steps: &[PluginWorkflowStepConfig],
) -> PluginWorkflowDefinition {
    let workflow_id = format!("workflow-{}", trigger.replace('.', "-"));
    let trigger_node_id = format!("{}-trigger", workflow_id);
    let mut nodes = vec![PluginWorkflowNode::Trigger {
        id: trigger_node_id.clone(),
        trigger: trigger.to_string(),
        position: PluginWorkflowNodePosition { x: 0.0, y: 120.0 },
    }];
    let mut edges = Vec::new();
    let mut previous_node_id = trigger_node_id;

    for (index, step) in steps.iter().enumerate() {
        let node_id = format!("{}-plugin-{}", workflow_id, index + 1);
        nodes.push(PluginWorkflowNode::Plugin {
            id: node_id.clone(),
            plugin_id: step.plugin_id.clone(),
            failure_policy: step.failure_policy.clone(),
            position: PluginWorkflowNodePosition {
                x: 340.0 + index as f64 * 340.0,
                y: 90.0,
            },
        });
        edges.push(PluginWorkflowEdge {
            id: format!("{}-edge-{}", workflow_id, index + 1),
            source: previous_node_id,
            target: node_id.clone(),
        });
        previous_node_id = node_id;
    }

    PluginWorkflowDefinition {
        id: workflow_id,
        name: trigger.to_string(),
        enabled: true,
        nodes,
        edges,
    }
}

fn workflow_steps_from_definition(
    workflow: &PluginWorkflowDefinition,
    trigger: &str,
) -> Vec<PluginWorkflowStepConfig> {
    let trigger_node_ids = workflow
        .nodes
        .iter()
        .filter_map(|node| match node {
            PluginWorkflowNode::Trigger {
                id,
                trigger: node_trigger,
                ..
            } if node_trigger == trigger => Some(id.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();

    trigger_node_ids
        .iter()
        .flat_map(|node_id| linear_plugin_steps_from_node(workflow, node_id))
        .collect()
}

fn linear_plugin_steps_from_node(
    workflow: &PluginWorkflowDefinition,
    start_node_id: &str,
) -> Vec<PluginWorkflowStepConfig> {
    let mut steps = Vec::new();
    let mut current_node_id = start_node_id.to_string();
    let mut visited = vec![current_node_id.clone()];

    loop {
        let Some(edge) = workflow
            .edges
            .iter()
            .filter(|edge| edge.source == current_node_id)
            .min_by(|left, right| left.id.cmp(&right.id))
        else {
            break;
        };

        if visited.iter().any(|node_id| node_id == &edge.target) {
            break;
        }
        visited.push(edge.target.clone());

        let Some(target_node) = workflow.nodes.iter().find(|node| match node {
            PluginWorkflowNode::Trigger { id, .. } | PluginWorkflowNode::Plugin { id, .. } => {
                id == &edge.target
            }
        }) else {
            break;
        };

        if let PluginWorkflowNode::Plugin {
            plugin_id,
            failure_policy,
            ..
        } = target_node
        {
            steps.push(PluginWorkflowStepConfig {
                plugin_id: plugin_id.clone(),
                failure_policy: failure_policy.clone(),
            });
        }

        current_node_id = edge.target.clone();
    }

    steps
}

fn snapshot_step_from_plugin(
    plugin: &PluginSummary,
    step: &PluginWorkflowStepConfig,
) -> PluginWorkflowStepSnapshot {
    PluginWorkflowStepSnapshot {
        plugin_id: plugin.manifest.plugin_id.clone(),
        plugin_name: plugin.manifest.name.clone(),
        plugin_version: plugin.manifest.version.clone(),
        selected_provider: plugin.installation.selected_provider.clone(),
        timeout_sec_override: plugin.installation.timeout_sec_override,
        approved_permissions: plugin.installation.approved_permissions.clone(),
        failure_policy: step.failure_policy.clone(),
    }
}

pub(super) fn resolve_workflow_step_snapshots(
    plugins_by_id: &BTreeMap<String, PluginSummary>,
    workflow: &PluginTriggerWorkflow,
) -> Vec<PluginWorkflowStepSnapshot> {
    workflow
        .steps
        .iter()
        .filter_map(|step| {
            plugins_by_id
                .get(&step.plugin_id)
                .filter(|plugin| plugin.installation.enabled)
                .map(|plugin| snapshot_step_from_plugin(plugin, step))
        })
        .collect()
}

pub(super) fn build_legacy_workflow_snapshots(
    plugins_by_id: &BTreeMap<String, PluginSummary>,
    registry: &PluginRegistry,
    trigger: &str,
    plugin_ids: &[String],
) -> Vec<PluginWorkflowStepSnapshot> {
    let workflow = workflow_registry_for_trigger(registry, trigger);

    plugin_ids
        .iter()
        .filter_map(|plugin_id| {
            let plugin = plugins_by_id.get(plugin_id)?;
            let step = workflow
                .and_then(|workflow| {
                    workflow
                        .steps
                        .iter()
                        .find(|step| step.plugin_id == *plugin_id)
                })
                .cloned()
                .unwrap_or(PluginWorkflowStepConfig {
                    plugin_id: plugin_id.clone(),
                    failure_policy: PluginWorkflowFailurePolicy::Continue,
                });
            Some(snapshot_step_from_plugin(plugin, &step))
        })
        .collect()
}

pub(super) fn build_chain_state(payload: &PostDownloadPluginPayload) -> PluginChainState {
    PluginChainState {
        job_id: payload.job_id.clone(),
        source: payload.source.clone(),
        download_kind: payload.download_kind.clone(),
        url: payload.url.clone(),
        title: payload.title.clone(),
        thumbnail: payload.thumbnail.clone(),
        history_id: payload.history_id.clone(),
        time_range: payload.time_range.clone(),
        active_filepath: payload.filepath.clone(),
        active_filename: payload.filename.clone(),
        directory: payload.directory.clone(),
        filesize: payload.filesize,
        format: payload.format.clone(),
        quality: payload.quality.clone(),
        extra_files: Vec::new(),
        metadata: None,
    }
}

pub(super) fn payload_from_chain_state(
    payload: &PostDownloadPluginPayload,
    workflow_run_id: &str,
    step_index: usize,
    step_plugin_id: &str,
    chain_state: &PluginChainState,
) -> PostDownloadPluginPayload {
    PostDownloadPluginPayload {
        job_id: payload.job_id.clone(),
        source: payload.source.clone(),
        trigger: payload.trigger.clone(),
        filepath: chain_state.active_filepath.clone(),
        filename: chain_state.active_filename.clone(),
        directory: chain_state.directory.clone(),
        filesize: chain_state.filesize,
        format: chain_state.format.clone(),
        quality: chain_state.quality.clone(),
        url: chain_state.url.clone(),
        title: chain_state.title.clone(),
        thumbnail: chain_state.thumbnail.clone(),
        history_id: chain_state.history_id.clone(),
        time_range: chain_state.time_range.clone(),
        download_kind: chain_state.download_kind.clone(),
        workflow_run_id: Some(workflow_run_id.to_string()),
        workflow_step_index: Some(step_index),
        workflow_step_plugin_id: Some(step_plugin_id.to_string()),
        chain_state: Some(chain_state.clone()),
    }
}

pub(super) fn merge_chain_mutation(
    chain_state: &mut PluginChainState,
    mutation: &PluginChainMutation,
) {
    if let Some(active_filepath) = mutation.active_filepath.as_ref() {
        chain_state.active_filepath = active_filepath.clone();
        let path = Path::new(active_filepath);
        if let Some(filename) = path.file_name().and_then(|name| name.to_str()) {
            chain_state.active_filename = filename.to_string();
        }
        if let Some(directory) = path.parent() {
            chain_state.directory = directory.to_string_lossy().to_string();
        }
    }
    if let Some(active_filename) = mutation.active_filename.as_ref() {
        chain_state.active_filename = active_filename.clone();
    }
    if !mutation.extra_files.is_empty() {
        for file in &mutation.extra_files {
            if !chain_state
                .extra_files
                .iter()
                .any(|existing| existing == file)
            {
                chain_state.extra_files.push(file.clone());
            }
        }
    }
    if let Some(metadata_patch) = mutation.metadata_patch.as_ref() {
        match chain_state.metadata.as_mut() {
            Some(Value::Object(current)) => {
                if let Value::Object(patch) = metadata_patch {
                    for (key, value) in patch {
                        current.insert(key.clone(), value.clone());
                    }
                } else {
                    chain_state.metadata = Some(metadata_patch.clone());
                }
            }
            _ => {
                chain_state.metadata = Some(metadata_patch.clone());
            }
        }
    }
}

pub(super) fn workflow_result_status(
    results: &[PluginExecutionResult],
    stopped_early: bool,
) -> PluginWorkflowRunStatus {
    if results.is_empty() {
        return PluginWorkflowRunStatus::Completed;
    }
    let success_count = results.iter().filter(|result| result.success).count();
    if success_count == results.len() {
        PluginWorkflowRunStatus::Completed
    } else if success_count == 0 || stopped_early {
        PluginWorkflowRunStatus::Failed
    } else {
        PluginWorkflowRunStatus::PartialFailed
    }
}
