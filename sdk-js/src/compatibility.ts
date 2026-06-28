import type { CompatibilityCheckResult, ParsedSemver } from './types';

export const SDK_VERSION = '2.3.0';

export function parseSemver(version: string): ParsedSemver | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareSemver(a: string, b: string): number {
  const left = parseSemver(a);
  const right = parseSemver(b);

  if (!left || !right) {
    throw new Error(`Invalid semver comparison: "${a}" vs "${b}"`);
  }

  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function satisfiesVersionRange(currentVersion: string, range: string): boolean {
  const clauses = tokenizeRange(range);
  if (clauses.length === 0) {
    throw new Error('Version range cannot be empty.');
  }

  return clauses.every((clause) => satisfiesSingleClause(currentVersion, clause));
}

export function checkAppVersionCompatibility(
  currentVersion: string | null | undefined,
  requiredRange: string,
): CompatibilityCheckResult {
  if (!currentVersion) {
    return {
      compatible: false,
      currentVersion: null,
      requiredRange,
      reason: 'Current app version is not available.',
    };
  }

  const parsed = parseSemver(currentVersion);
  if (!parsed) {
    return {
      compatible: false,
      currentVersion,
      requiredRange,
      reason: `Current app version "${currentVersion}" is not valid semver.`,
    };
  }

  try {
    const compatible = satisfiesVersionRange(currentVersion, requiredRange);
    return {
      compatible,
      currentVersion,
      requiredRange,
      ...(compatible
        ? {}
        : {
            reason: `App version ${currentVersion} does not satisfy required range ${requiredRange}.`,
          }),
    };
  } catch (error) {
    return {
      compatible: false,
      currentVersion,
      requiredRange,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function assertCompatibleAppVersion(
  currentVersion: string | null | undefined,
  requiredRange: string,
): void {
  const result = checkAppVersionCompatibility(currentVersion, requiredRange);
  if (!result.compatible) {
    throw new Error(result.reason || 'App version is not compatible.');
  }
}

function tokenizeRange(range: string): string[] {
  return range
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function satisfiesSingleClause(currentVersion: string, clause: string): boolean {
  const operators = ['>=', '<=', '>', '<', '='];
  const operator = operators.find((candidate) => clause.startsWith(candidate)) || '=';
  const version =
    operator === '=' && !clause.startsWith('=') ? clause : clause.slice(operator.length);

  if (!parseSemver(version)) {
    throw new Error(`Invalid version clause: "${clause}"`);
  }

  const comparison = compareSemver(currentVersion, version);
  switch (operator) {
    case '>=':
      return comparison >= 0;
    case '<=':
      return comparison <= 0;
    case '>':
      return comparison > 0;
    case '<':
      return comparison < 0;
    case '=':
      return comparison === 0;
    default:
      throw new Error(`Unsupported operator in clause: "${clause}"`);
  }
}
