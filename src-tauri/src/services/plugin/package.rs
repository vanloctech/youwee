use std::collections::VecDeque;
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use uuid::Uuid;
use zip::ZipArchive;

use crate::types::{
    PackagedPluginBuildInfo, PackagedPluginChecksums, PackagedPluginSignature, PluginManifest,
    PluginPackageSource, PluginPackageSourceKind, PluginSignaturePayload,
};

use super::{manifest::load_manifest_from_file, InstallPluginPackageInput};

#[derive(Debug, Clone)]
pub(super) struct PreparedPackage {
    pub(super) manifest: PluginManifest,
    pub(super) package_root: PathBuf,
    pub(super) source: PluginPackageSource,
    pub(super) warnings: Vec<String>,
    pub(super) package_format: Option<String>,
    pub(super) package_format_version: Option<u32>,
    pub(super) builder_sdk_version: Option<String>,
    pub(super) package_checksum: Option<String>,
    pub(super) signature_status: Option<String>,
    pub(super) signer_key_id: Option<String>,
    pub(super) signer_fingerprint: Option<String>,
    pub(super) signature_algorithm: Option<String>,
    pub(super) signed_at: Option<String>,
}

fn compute_sha256_bytes(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};

    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn derive_signer_fingerprint(public_key: &[u8]) -> String {
    compute_sha256_bytes(public_key)
}

fn derive_signer_key_id(public_key: &[u8]) -> String {
    format!("ed25519:sha256:{}", derive_signer_fingerprint(public_key))
}

pub(super) fn compute_dir_checksum(root: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let mut queue = VecDeque::from([root.to_path_buf()]);
    let mut files = Vec::new();
    while let Some(path) = queue.pop_front() {
        for entry in std::fs::read_dir(&path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                queue.push_back(entry_path);
            } else if entry_path.is_file() {
                files.push(entry_path);
            }
        }
    }
    files.sort();

    let mut hasher = Sha256::new();
    for file in files {
        let relative = file
            .strip_prefix(root)
            .unwrap_or(&file)
            .to_string_lossy()
            .to_string();
        hasher.update(relative.as_bytes());
        let mut bytes = Vec::new();
        std::fs::File::open(&file)
            .map_err(|e| format!("Failed to open {}: {}", file.display(), e))?
            .read_to_end(&mut bytes)
            .map_err(|e| format!("Failed to read {}: {}", file.display(), e))?;
        hasher.update(&bytes);
    }

    Ok(hex::encode(hasher.finalize()))
}

fn extract_zip_to_temp(bytes: &[u8], label: &str) -> Result<PathBuf, String> {
    let temp_root =
        std::env::temp_dir().join(format!("youwee-plugin-{}-{}", label, Uuid::new_v4()));
    std::fs::create_dir_all(&temp_root).map_err(|e| {
        format!(
            "Failed to create temporary plugin extraction directory {}: {}",
            temp_root.display(),
            e
        )
    })?;

    let cursor = Cursor::new(bytes.to_vec());
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("Failed to open plugin zip archive: {}", e))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|e| format!("Failed to read zip entry {}: {}", index, e))?;
        let Some(safe_name) = file.enclosed_name().map(|path| path.to_path_buf()) else {
            continue;
        };
        let outpath = temp_root.join(safe_name);
        if file.name().ends_with('/') {
            std::fs::create_dir_all(&outpath).map_err(|e| {
                format!(
                    "Failed to create extracted directory {}: {}",
                    outpath.display(),
                    e
                )
            })?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    format!(
                        "Failed to create extracted directory {}: {}",
                        parent.display(),
                        e
                    )
                })?;
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| {
                format!(
                    "Failed to create extracted file {}: {}",
                    outpath.display(),
                    e
                )
            })?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| {
                format!(
                    "Failed to extract zip entry to {}: {}",
                    outpath.display(),
                    e
                )
            })?;
        }
    }

    Ok(temp_root)
}

fn validate_ywp_extension(path: &Path) -> Result<(), String> {
    let is_ywp = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("ywp"))
        .unwrap_or(false);

    if is_ywp {
        Ok(())
    } else {
        Err(format!(
            "Plugin package must use the .ywp extension: {}",
            path.display()
        ))
    }
}

fn resolve_packaged_root(extracted_root: &Path) -> Result<PathBuf, String> {
    let has_layout = |root: &Path| {
        root.join("manifest.json").is_file()
            && root.join("build.json").is_file()
            && root.join("checksums.json").is_file()
    };

    if has_layout(extracted_root) {
        return Ok(extracted_root.to_path_buf());
    }

    let entries = std::fs::read_dir(extracted_root)
        .map_err(|e| {
            format!(
                "Failed to read extracted package root {}: {}",
                extracted_root.display(),
                e
            )
        })?
        .filter_map(|entry| entry.ok())
        .collect::<Vec<_>>();

    if entries.len() == 1 {
        let nested = entries[0].path();
        if nested.is_dir() && has_layout(&nested) {
            return Ok(nested);
        }
    }

    Err("Invalid .ywp package layout. Expected manifest.json, build.json, and checksums.json at the package root.".to_string())
}

pub(super) fn load_packaged_build_info(root: &Path) -> Result<PackagedPluginBuildInfo, String> {
    let path = root.join("build.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn load_packaged_checksums(root: &Path) -> Result<PackagedPluginChecksums, String> {
    let path = root.join("checksums.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn load_packaged_signature(root: &Path) -> Result<PackagedPluginSignature, String> {
    let path = root.join("signature.json");
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn validate_packaged_checksums(
    root: &Path,
    checksums: &PackagedPluginChecksums,
) -> Result<(), String> {
    if checksums.algorithm.to_lowercase() != "sha256" {
        return Err(format!(
            "Unsupported checksums algorithm in .ywp package: {}",
            checksums.algorithm
        ));
    }

    let mut actual_files = Vec::new();
    let mut queue = VecDeque::from([root.to_path_buf()]);
    while let Some(path) = queue.pop_front() {
        for entry in std::fs::read_dir(&path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let entry_path = entry.path();
            if entry_path.is_dir() {
                queue.push_back(entry_path);
            } else if entry_path.is_file() {
                let relative = normalize_path_for_checksum(root, &entry_path);
                if relative != "checksums.json" && relative != "signature.json" {
                    actual_files.push(relative);
                }
            }
        }
    }
    actual_files.sort();

    let mut expected_files = checksums.files.keys().cloned().collect::<Vec<_>>();
    expected_files.sort();

    if actual_files != expected_files {
        return Err("The .ywp package contents do not match checksums.json.".to_string());
    }

    for relative in expected_files {
        let path = root.join(&relative);
        let bytes = std::fs::read(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        let actual = compute_sha256_bytes(&bytes);
        let expected = checksums
            .files
            .get(&relative)
            .ok_or_else(|| format!("Missing checksum entry for {}", relative))?;
        if &actual != expected {
            return Err(format!(
                "Checksum mismatch in .ywp package for {}",
                relative
            ));
        }
    }

    Ok(())
}

fn validate_packaged_signature_payload(
    payload: &PluginSignaturePayload,
    manifest: &PluginManifest,
    build_info: &PackagedPluginBuildInfo,
    checksums_bytes: &[u8],
) -> Result<(), String> {
    if payload.checksums_path != "checksums.json" {
        return Err("Plugin signature payload must point to checksums.json.".to_string());
    }
    if payload.checksums_sha256 != compute_sha256_bytes(checksums_bytes) {
        return Err("Plugin signature payload does not match checksums.json.".to_string());
    }
    if payload.plugin_id != manifest.plugin_id {
        return Err("Plugin signature payload does not match manifest id.".to_string());
    }
    if payload.plugin_version != manifest.version {
        return Err("Plugin signature payload does not match manifest version.".to_string());
    }
    if payload.package_format != build_info.package_format {
        return Err("Plugin signature payload does not match package format.".to_string());
    }
    if payload.package_format_version != build_info.package_format_version {
        return Err("Plugin signature payload does not match package format version.".to_string());
    }
    Ok(())
}

fn validate_packaged_signature(
    root: &Path,
    manifest: &PluginManifest,
    build_info: &PackagedPluginBuildInfo,
    signature: &PackagedPluginSignature,
) -> Result<(), String> {
    if signature.version != 1 {
        return Err(format!(
            "Unsupported plugin signature version: {}",
            signature.version
        ));
    }
    if !signature.algorithm.eq_ignore_ascii_case("ed25519") {
        return Err(format!(
            "Unsupported plugin signature algorithm: {}",
            signature.algorithm
        ));
    }

    let checksums_path = root.join("checksums.json");
    let checksums_bytes = std::fs::read(&checksums_path)
        .map_err(|e| format!("Failed to read {}: {}", checksums_path.display(), e))?;
    validate_packaged_signature_payload(
        &signature.payload,
        manifest,
        build_info,
        &checksums_bytes,
    )?;

    let public_key_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature.public_key.trim())
        .map_err(|e| format!("Invalid plugin signature public key: {}", e))?;
    let verifying_key_bytes: [u8; 32] = public_key_bytes
        .as_slice()
        .try_into()
        .map_err(|_| "Invalid plugin signature public key length.".to_string())?;
    let verifying_key = VerifyingKey::from_bytes(&verifying_key_bytes)
        .map_err(|e| format!("Invalid plugin signature public key: {}", e))?;

    let expected_key_id = derive_signer_key_id(&public_key_bytes);
    if signature.key_id != expected_key_id {
        return Err("Plugin signature key id does not match the embedded public key.".to_string());
    }
    let expected_fingerprint = derive_signer_fingerprint(&public_key_bytes);
    if signature.fingerprint != expected_fingerprint {
        return Err(
            "Plugin signature fingerprint does not match the embedded public key.".to_string(),
        );
    }

    let payload_bytes = serde_json::to_vec(&signature.payload)
        .map_err(|e| format!("Failed to serialize plugin signature payload: {}", e))?;
    let signature_bytes = base64::engine::general_purpose::STANDARD
        .decode(signature.signature.trim())
        .map_err(|e| format!("Invalid plugin signature bytes: {}", e))?;
    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| "Invalid plugin signature length.".to_string())?;
    let ed25519_signature = Signature::from_bytes(&signature_bytes);
    verifying_key
        .verify(&payload_bytes, &ed25519_signature)
        .map_err(|_| "Plugin signature verification failed.".to_string())
}

fn normalize_path_for_checksum(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn validate_packaged_manifest_layout(
    root: &Path,
    manifest: &PluginManifest,
    build_info: &PackagedPluginBuildInfo,
) -> Result<(), String> {
    if build_info.package_format != "ywp" {
        return Err(format!(
            "Unsupported plugin package format: {}",
            build_info.package_format
        ));
    }
    if build_info.package_format_version != 1 {
        return Err(format!(
            "Unsupported plugin package format version: {}",
            build_info.package_format_version
        ));
    }
    if build_info.builder.tool != "youwee-sdk" {
        return Err(format!(
            "Unsupported plugin package builder: {}",
            build_info.builder.tool
        ));
    }
    if manifest.runtime.entrypoint != build_info.bundle.entrypoint {
        return Err(
            "Packaged manifest entrypoint does not match build.json bundle entrypoint.".to_string(),
        );
    }
    let entrypoint = root.join(&manifest.runtime.entrypoint);
    if !entrypoint.is_file() {
        return Err(format!(
            "Packaged plugin entrypoint is missing: {}",
            manifest.runtime.entrypoint
        ));
    }

    if let Some(i18n) = manifest.i18n.as_ref() {
        let directory = i18n
            .directory
            .clone()
            .unwrap_or_else(|| "locales".to_string());
        for locale in &i18n.supported_locales {
            let locale_path = root.join(&directory).join(format!("{}.json", locale));
            if !locale_path.is_file() {
                return Err(format!(
                    "Packaged plugin locale file is missing: {}",
                    normalize_path_for_checksum(root, &locale_path)
                ));
            }
        }
        if let Some(default_locale) = i18n.default_locale.as_ref() {
            let default_locale_path = root
                .join(&directory)
                .join(format!("{}.json", default_locale));
            if !default_locale_path.is_file() {
                return Err(format!(
                    "Packaged plugin default locale file is missing: {}",
                    normalize_path_for_checksum(root, &default_locale_path)
                ));
            }
        }
    }

    Ok(())
}

fn prepared_from_ywp_file(path: &Path) -> Result<PreparedPackage, String> {
    validate_ywp_extension(path)?;
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read plugin package {}: {}", path.display(), e))?;
    prepared_from_ywp_bytes(
        &bytes,
        PluginPackageSourceKind::PackageYwp,
        path.to_string_lossy().to_string(),
    )
}

pub(super) fn inspect_ywp_file(path: &Path) -> Result<PreparedPackage, String> {
    validate_ywp_extension(path)?;
    let bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read plugin package {}: {}", path.display(), e))?;
    inspect_ywp_bytes(
        &bytes,
        PluginPackageSourceKind::PackageYwp,
        path.to_string_lossy().to_string(),
    )
}

fn inspect_ywp_bytes(
    bytes: &[u8],
    kind: PluginPackageSourceKind,
    value: String,
) -> Result<PreparedPackage, String> {
    let temp_root = extract_zip_to_temp(bytes, "inspect")?;
    let package_root = resolve_packaged_root(&temp_root)?;
    let manifest = load_manifest_from_file(&package_root.join("manifest.json"))?;
    let build_info = load_packaged_build_info(&package_root)?;
    let checksums = load_packaged_checksums(&package_root)?;
    validate_packaged_manifest_layout(&package_root, &manifest, &build_info)?;
    validate_packaged_checksums(&package_root, &checksums)?;
    let package_checksum = compute_sha256_bytes(bytes);

    let mut warnings = Vec::new();
    let signature_path = package_root.join("signature.json");
    let (signature_status, signer_key_id, signer_fingerprint, signature_algorithm, signed_at) =
        match load_packaged_signature(&package_root) {
            Ok(signature) => {
                match validate_packaged_signature(&package_root, &manifest, &build_info, &signature)
                {
                    Ok(()) => (
                        Some("signed".to_string()),
                        Some(signature.key_id),
                        Some(signature.fingerprint),
                        Some(signature.algorithm),
                        Some(signature.signed_at),
                    ),
                    Err(error) => {
                        warnings.push(error);
                        (
                            Some("invalid-signature".to_string()),
                            Some(signature.key_id),
                            Some(signature.fingerprint),
                            Some(signature.algorithm),
                            Some(signature.signed_at),
                        )
                    }
                }
            }
            Err(error) => {
                warnings.push(error);
                (
                    Some(
                        if signature_path.is_file() {
                            "invalid-signature"
                        } else {
                            "missing-signature"
                        }
                        .to_string(),
                    ),
                    None,
                    None,
                    None,
                    None,
                )
            }
        };

    Ok(PreparedPackage {
        manifest,
        package_root,
        source: PluginPackageSource {
            kind,
            value,
            checksum: Some(package_checksum.clone()),
            package_format: Some(build_info.package_format.clone()),
            package_format_version: Some(build_info.package_format_version),
            builder_sdk_version: Some(build_info.builder.version.clone()),
            signature_status: signature_status.clone(),
            signer_key_id: signer_key_id.clone(),
            signer_fingerprint: signer_fingerprint.clone(),
            signature_algorithm: signature_algorithm.clone(),
            signed_at: signed_at.clone(),
        },
        warnings,
        package_format: Some(build_info.package_format),
        package_format_version: Some(build_info.package_format_version),
        builder_sdk_version: Some(build_info.builder.version),
        package_checksum: Some(package_checksum),
        signature_status,
        signer_key_id,
        signer_fingerprint,
        signature_algorithm,
        signed_at,
    })
}

fn prepared_from_ywp_bytes(
    bytes: &[u8],
    kind: PluginPackageSourceKind,
    value: String,
) -> Result<PreparedPackage, String> {
    let temp_root = extract_zip_to_temp(bytes, "import")?;
    let package_root = resolve_packaged_root(&temp_root)?;
    let manifest = load_manifest_from_file(&package_root.join("manifest.json"))?;
    let build_info = load_packaged_build_info(&package_root)?;
    let checksums = load_packaged_checksums(&package_root)?;
    let signature = load_packaged_signature(&package_root)?;
    validate_packaged_manifest_layout(&package_root, &manifest, &build_info)?;
    validate_packaged_checksums(&package_root, &checksums)?;
    validate_packaged_signature(&package_root, &manifest, &build_info, &signature)?;
    let package_checksum = compute_sha256_bytes(bytes);

    Ok(PreparedPackage {
        manifest,
        package_root,
        source: PluginPackageSource {
            kind,
            value,
            checksum: Some(package_checksum.clone()),
            package_format: Some(build_info.package_format.clone()),
            package_format_version: Some(build_info.package_format_version),
            builder_sdk_version: Some(build_info.builder.version.clone()),
            signature_status: Some("signed".to_string()),
            signer_key_id: Some(signature.key_id.clone()),
            signer_fingerprint: Some(signature.fingerprint.clone()),
            signature_algorithm: Some(signature.algorithm.clone()),
            signed_at: Some(signature.signed_at.clone()),
        },
        warnings: Vec::new(),
        package_format: Some(build_info.package_format),
        package_format_version: Some(build_info.package_format_version),
        builder_sdk_version: Some(build_info.builder.version),
        package_checksum: Some(package_checksum),
        signature_status: Some("signed".to_string()),
        signer_key_id: Some(signature.key_id),
        signer_fingerprint: Some(signature.fingerprint),
        signature_algorithm: Some(signature.algorithm),
        signed_at: Some(signature.signed_at),
    })
}

pub(super) async fn prepare_plugin_package(
    source: &InstallPluginPackageInput,
) -> Result<PreparedPackage, String> {
    prepared_from_ywp_file(Path::new(&source.value))
}
