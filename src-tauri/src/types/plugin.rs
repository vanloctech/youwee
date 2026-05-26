use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum PluginRuntimeLanguage {
    Javascript,
    Python,
}

impl PluginRuntimeLanguage {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Javascript => "javascript",
            Self::Python => "python",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum PluginProvider {
    Deno,
    Python,
}

impl PluginProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Deno => "deno",
            Self::Python => "python",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginPermissionRequest {
    #[serde(default)]
    pub network: bool,
    #[serde(default)]
    pub fs: Vec<PluginFilesystemPermission>,
    #[serde(default)]
    pub tools: Vec<PluginToolPermission>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PluginFilesystemPermission {
    #[serde(rename = "fs.plugin.read")]
    PluginRead,
    #[serde(rename = "fs.plugin.write")]
    PluginWrite,
    #[serde(rename = "fs.payload-file.read")]
    PayloadFileRead,
    #[serde(rename = "fs.payload-directory.read")]
    PayloadDirectoryRead,
    #[serde(rename = "fs.payload-directory.write")]
    PayloadDirectoryWrite,
    #[serde(rename = "fs.temp.read")]
    TempRead,
    #[serde(rename = "fs.temp.write")]
    TempWrite,
    #[serde(rename = "fs.user-selected.read")]
    UserSelectedRead,
    #[serde(rename = "fs.user-selected.write")]
    UserSelectedWrite,
}

impl PluginFilesystemPermission {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::PluginRead => "fs.plugin.read",
            Self::PluginWrite => "fs.plugin.write",
            Self::PayloadFileRead => "fs.payload-file.read",
            Self::PayloadDirectoryRead => "fs.payload-directory.read",
            Self::PayloadDirectoryWrite => "fs.payload-directory.write",
            Self::TempRead => "fs.temp.read",
            Self::TempWrite => "fs.temp.write",
            Self::UserSelectedRead => "fs.user-selected.read",
            Self::UserSelectedWrite => "fs.user-selected.write",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginPermissionApproval {
    #[serde(default)]
    pub network: bool,
    #[serde(default)]
    pub fs: Vec<PluginFilesystemPermission>,
    #[serde(default)]
    pub tools: Vec<PluginToolPermission>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum PluginToolPermission {
    #[serde(rename = "tool.ffmpeg.run")]
    FfmpegRun,
    #[serde(rename = "tool.ytdlp.run")]
    YtdlpRun,
}

impl PluginToolPermission {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::FfmpegRun => "tool.ffmpeg.run",
            Self::YtdlpRun => "tool.ytdlp.run",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PluginConfigFieldInputType {
    Text,
    Textarea,
    Password,
    Number,
    Boolean,
    File,
    Directory,
    Select,
    MultiSelect,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginConfigFieldOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginConfigField {
    pub key: String,
    pub input_type: PluginConfigFieldInputType,
    pub label: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub default_value: Option<Value>,
    #[serde(default)]
    pub sensitive: bool,
    #[serde(default)]
    pub options: Vec<PluginConfigFieldOption>,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    #[serde(default)]
    pub step: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginRuntimeSpec {
    pub language: PluginRuntimeLanguage,
    pub supported_providers: Vec<PluginProvider>,
    #[serde(default)]
    pub preferred_provider: Option<PluginProvider>,
    pub entrypoint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginCompatibilitySpec {
    #[serde(default)]
    pub app_version: Option<String>,
    #[serde(default)]
    pub sdk_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginI18nSpec {
    #[serde(default)]
    pub default_locale: Option<String>,
    #[serde(default)]
    pub supported_locales: Vec<String>,
    #[serde(default)]
    pub directory: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    #[serde(rename = "id", alias = "pluginId")]
    pub plugin_id: String,
    pub slug: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub repository: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    pub runtime: PluginRuntimeSpec,
    #[serde(default)]
    pub compatibility: Option<PluginCompatibilitySpec>,
    #[serde(default = "default_triggers")]
    pub triggers: Vec<String>,
    #[serde(default)]
    pub permissions: PluginPermissionRequest,
    #[serde(default)]
    pub config_fields: Vec<PluginConfigField>,
    #[serde(default = "default_timeout_sec")]
    pub timeout_sec: u64,
    #[serde(default)]
    pub readme: Option<String>,
    #[serde(default)]
    pub checksum: Option<String>,
    #[serde(default)]
    pub published_at: Option<String>,
    #[serde(default)]
    pub i18n: Option<PluginI18nSpec>,
}

fn default_triggers() -> Vec<String> {
    vec!["download.completed".to_string()]
}

const fn default_timeout_sec() -> u64 {
    60
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PluginPackageSourceKind {
    Workspace,
    PackageYwp,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPackageSource {
    pub kind: PluginPackageSourceKind,
    pub value: String,
    #[serde(default)]
    pub checksum: Option<String>,
    #[serde(default)]
    pub package_format: Option<String>,
    #[serde(default)]
    pub package_format_version: Option<u32>,
    #[serde(default)]
    pub builder_sdk_version: Option<String>,
    #[serde(default)]
    pub signature_status: Option<String>,
    #[serde(default)]
    pub signer_key_id: Option<String>,
    #[serde(default)]
    pub signer_fingerprint: Option<String>,
    #[serde(default)]
    pub signature_algorithm: Option<String>,
    #[serde(default)]
    pub signed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInstallation {
    pub plugin_id: String,
    pub enabled: bool,
    pub trusted: bool,
    pub approved_permissions: PluginPermissionApproval,
    #[serde(default)]
    pub selected_provider: Option<PluginProvider>,
    #[serde(default)]
    pub timeout_sec_override: Option<u64>,
    pub installed_path: String,
    pub source: PluginPackageSource,
    #[serde(default)]
    pub last_resolved_provider: Option<PluginProvider>,
    #[serde(default)]
    pub last_resolved_source: Option<String>,
    #[serde(default)]
    pub last_execution_status: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
    #[serde(default)]
    pub config_values: BTreeMap<String, Value>,
    #[serde(default)]
    pub config_value_status: BTreeMap<String, bool>,
    #[serde(default)]
    pub signature_status: Option<String>,
    #[serde(default)]
    pub signer_key_id: Option<String>,
    #[serde(default)]
    pub signer_fingerprint: Option<String>,
    #[serde(default)]
    pub signature_algorithm: Option<String>,
    #[serde(default)]
    pub signed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSummary {
    pub manifest: PluginManifest,
    pub installation: PluginInstallation,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub readme_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPackageInspection {
    pub manifest: PluginManifest,
    pub source: PluginPackageSource,
    #[serde(default)]
    pub warnings: Vec<String>,
    #[serde(default)]
    pub readme_content: Option<String>,
    #[serde(default)]
    pub package_format: Option<String>,
    #[serde(default)]
    pub package_format_version: Option<u32>,
    #[serde(default)]
    pub builder_sdk_version: Option<String>,
    #[serde(default)]
    pub package_checksum: Option<String>,
    #[serde(default)]
    pub signature_status: Option<String>,
    #[serde(default)]
    pub signer_key_id: Option<String>,
    #[serde(default)]
    pub signer_fingerprint: Option<String>,
    #[serde(default)]
    pub signature_algorithm: Option<String>,
    #[serde(default)]
    pub signed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginWorkspaceSummary {
    pub plugin_id: String,
    pub slug: String,
    pub name: String,
    pub path: String,
    pub manifest_path: String,
    pub package_json_path: String,
    pub readme_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedPluginBuilderInfo {
    pub tool: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedPluginBundleInfo {
    pub entrypoint: String,
    pub bundled: bool,
    pub includes_dependencies: bool,
    pub module_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedPluginBuildInfo {
    pub package_format: String,
    pub package_format_version: u32,
    pub packaged_at: String,
    pub builder: PackagedPluginBuilderInfo,
    pub bundle: PackagedPluginBundleInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedPluginChecksums {
    pub algorithm: String,
    #[serde(default)]
    pub files: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginSignaturePayload {
    pub checksums_path: String,
    pub checksums_sha256: String,
    pub plugin_id: String,
    pub plugin_version: String,
    pub package_format: String,
    pub package_format_version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackagedPluginSignature {
    pub version: u32,
    pub algorithm: String,
    pub key_id: String,
    pub fingerprint: String,
    pub public_key: String,
    pub signed_at: String,
    pub payload: PluginSignaturePayload,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeProviderStatus {
    pub provider: PluginProvider,
    pub available: bool,
    #[serde(default)]
    pub resolved_path: Option<String>,
    #[serde(default)]
    pub resolved_source: Option<String>,
    #[serde(default)]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginExecutionResult {
    pub plugin_id: String,
    pub success: bool,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub artifacts: Option<Value>,
    #[serde(default)]
    pub metadata: Option<Value>,
    #[serde(default)]
    pub mutations: Option<PluginChainMutation>,
    #[serde(default)]
    pub stdout: Option<String>,
    #[serde(default)]
    pub stderr: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PluginWorkflowFailurePolicy {
    Continue,
    StopChain,
}

impl Default for PluginWorkflowFailurePolicy {
    fn default() -> Self {
        Self::Continue
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginWorkflowStepConfig {
    pub plugin_id: String,
    #[serde(default)]
    pub failure_policy: PluginWorkflowFailurePolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginWorkflowStepSnapshot {
    pub plugin_id: String,
    pub plugin_name: String,
    pub plugin_version: String,
    #[serde(default)]
    pub selected_provider: Option<PluginProvider>,
    #[serde(default)]
    pub timeout_sec_override: Option<u64>,
    #[serde(default)]
    pub approved_permissions: PluginPermissionApproval,
    #[serde(default)]
    pub failure_policy: PluginWorkflowFailurePolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginTriggerWorkflow {
    pub trigger: String,
    #[serde(default)]
    pub steps: Vec<PluginWorkflowStepConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PluginWorkflowRunStatus {
    Queued,
    Running,
    Completed,
    PartialFailed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginChainMutation {
    #[serde(default)]
    pub active_filepath: Option<String>,
    #[serde(default)]
    pub active_filename: Option<String>,
    #[serde(default)]
    pub extra_files: Vec<String>,
    #[serde(default)]
    pub metadata_patch: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginChainState {
    pub job_id: String,
    pub source: Option<String>,
    pub download_kind: String,
    pub url: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub thumbnail: Option<String>,
    #[serde(default)]
    pub history_id: Option<String>,
    #[serde(default)]
    pub time_range: Option<String>,
    pub active_filepath: String,
    pub active_filename: String,
    pub directory: String,
    #[serde(default)]
    pub filesize: Option<u64>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub quality: Option<String>,
    #[serde(default)]
    pub extra_files: Vec<String>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginWorkflowRun {
    pub run_id: String,
    pub trigger: String,
    pub status: PluginWorkflowRunStatus,
    pub initial_payload: PostDownloadPluginPayload,
    pub current_chain_state: PluginChainState,
    #[serde(default)]
    pub steps: Vec<PluginWorkflowStepSnapshot>,
    #[serde(default)]
    pub current_step_index: Option<usize>,
    #[serde(default)]
    pub failed_step_plugin_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginExecutionStatusEvent {
    pub plugin_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_name: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_source: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_resource: Option<String>,
    #[serde(default)]
    pub media_title: Option<String>,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub media_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginExecutionStatusPayload {
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default)]
    pub plugin_name: Option<String>,
    #[serde(default)]
    pub provider: Option<String>,
    #[serde(default)]
    pub resolved_provider: Option<String>,
    #[serde(default)]
    pub resolved_source: Option<String>,
    #[serde(default)]
    pub runtime: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginExecutionOutputEvent {
    pub plugin_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugin_name: Option<String>,
    #[serde(rename = "stream")]
    pub stream: String,
    pub chunk: String,
    #[serde(default)]
    pub media_title: Option<String>,
    #[serde(default)]
    pub filename: Option<String>,
    #[serde(default)]
    pub media_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostDownloadPluginPayload {
    pub job_id: String,
    pub source: Option<String>,
    pub trigger: String,
    pub filepath: String,
    pub filename: String,
    pub directory: String,
    pub filesize: Option<u64>,
    pub format: Option<String>,
    pub quality: Option<String>,
    pub url: String,
    pub title: Option<String>,
    pub thumbnail: Option<String>,
    pub history_id: Option<String>,
    pub time_range: Option<String>,
    pub download_kind: String,
    #[serde(default)]
    pub workflow_run_id: Option<String>,
    #[serde(default)]
    pub workflow_step_index: Option<usize>,
    #[serde(default)]
    pub workflow_step_plugin_id: Option<String>,
    #[serde(default)]
    pub chain_state: Option<PluginChainState>,
}
