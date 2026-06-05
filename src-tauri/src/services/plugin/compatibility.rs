use std::cmp::Ordering;

use crate::types::PluginManifest;

use super::sdk_bundle::current_sdk_version;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct SimpleSemver {
    major: u64,
    minor: u64,
    patch: u64,
}

fn parse_simple_semver(version: &str) -> Option<SimpleSemver> {
    let trimmed = version.trim().trim_start_matches('v');
    let mut parts = trimmed.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next()?.parse().ok()?;
    if parts.next().is_some() {
        return None;
    }
    Some(SimpleSemver {
        major,
        minor,
        patch,
    })
}

fn compare_simple_semver(a: &str, b: &str) -> Result<Ordering, String> {
    let left = parse_simple_semver(a).ok_or_else(|| format!("Invalid semver: {}", a))?;
    let right = parse_simple_semver(b).ok_or_else(|| format!("Invalid semver: {}", b))?;
    Ok(left.cmp(&right))
}

pub(super) fn satisfies_version_range(version: &str, range: &str) -> Result<bool, String> {
    let clauses = range
        .split(|ch: char| ch.is_whitespace() || ch == ',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if clauses.is_empty() {
        return Err("Version range cannot be empty".to_string());
    }

    for clause in clauses {
        let (operator, raw_version) = if let Some(rest) = clause.strip_prefix(">=") {
            (">=", rest)
        } else if let Some(rest) = clause.strip_prefix("<=") {
            ("<=", rest)
        } else if let Some(rest) = clause.strip_prefix('>') {
            (">", rest)
        } else if let Some(rest) = clause.strip_prefix('<') {
            ("<", rest)
        } else if let Some(rest) = clause.strip_prefix('=') {
            ("=", rest)
        } else {
            ("=", clause)
        };

        let ordering = compare_simple_semver(version, raw_version)?;
        let satisfied = match operator {
            ">=" => ordering != Ordering::Less,
            "<=" => ordering != Ordering::Greater,
            ">" => ordering == Ordering::Greater,
            "<" => ordering == Ordering::Less,
            "=" => ordering == Ordering::Equal,
            _ => {
                return Err(format!(
                    "Unsupported version operator in clause: {}",
                    clause
                ))
            }
        };

        if !satisfied {
            return Ok(false);
        }
    }

    Ok(true)
}

pub(super) fn build_scaffold_compatibility_range(version: &str) -> String {
    if let Some(parsed) = parse_simple_semver(version) {
        format!(
            ">={}.{}.{} <{}.{}.0",
            parsed.major,
            parsed.minor,
            parsed.patch,
            parsed.major,
            parsed.minor + 1
        )
    } else {
        format!("={}", version)
    }
}

pub(super) fn collect_compatibility_issues(
    manifest: &PluginManifest,
) -> Result<Vec<String>, String> {
    let Some(compatibility) = manifest.compatibility.as_ref() else {
        return Ok(Vec::new());
    };

    let mut issues = Vec::new();

    if let Some(range) = compatibility.app_version.as_ref() {
        if !satisfies_version_range(env!("CARGO_PKG_VERSION"), range)? {
            issues.push(format!(
                "Requires Youwee app version {} but current app version is {}",
                range,
                env!("CARGO_PKG_VERSION")
            ));
        }
    }

    if let Some(range) = compatibility.sdk_version.as_ref() {
        let sdk_version = current_sdk_version();
        if !satisfies_version_range(&sdk_version, range)? {
            issues.push(format!(
                "Requires youwee-sdk version {} but bundled SDK version is {}",
                range, sdk_version
            ));
        }
    }

    Ok(issues)
}

pub(super) fn validate_install_compatibility(manifest: &PluginManifest) -> Result<(), String> {
    let issues = collect_compatibility_issues(manifest)?;
    if issues.is_empty() {
        return Ok(());
    }

    Err(format!(
        "Plugin is not compatible with this Youwee build:\n- {}",
        issues.join("\n- ")
    ))
}

pub(super) fn validate_execution_compatibility(manifest: &PluginManifest) -> Result<(), String> {
    validate_install_compatibility(manifest)
}
