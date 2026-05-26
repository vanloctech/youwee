#!/usr/bin/env bun

import { basename, relative, resolve } from 'node:path';
import {
  buildPluginPackage,
  generatePluginKeyPair,
  packPluginPackage,
  verifyPluginPackage,
} from './packager';

function printHelp() {
  console.log(`youwee-sdk

Usage:
  bunx youwee-sdk build [plugin-root]
  bunx youwee-sdk pack [plugin-root] --private-key <path>
  bunx youwee-sdk keygen [output-path]
  bunx youwee-sdk verify <plugin-file.ywp>

Commands:
  build   Validate and bundle the plugin into dist/plugin.cjs
  pack    Build, sign, and package the plugin into release/<slug>-<version>.ywp
  keygen  Create a new ed25519 signing key file
  verify  Verify the signature and checksums of a .ywp plugin file
`);
}

function getPositionalArgs(args: string[], valueFlags: string[]) {
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (valueFlags.includes(value)) {
      index += 1;
      continue;
    }
    if (!value.startsWith('--')) {
      positionals.push(value);
    }
  }
  return positionals;
}

async function main() {
  const [, , command, ...rest] = process.argv;
  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'keygen') {
    const outputPath = rest[0]
      ? resolve(rest[0])
      : resolve(process.cwd(), 'youwee-plugin-key.json');
    const result = generatePluginKeyPair(outputPath);
    console.log(`Wrote signing key: ${outputPath}`);
    console.log(`Key ID: ${result.keyId}`);
    console.log(`Fingerprint: ${result.fingerprint}`);
    return;
  }

  if (command === 'build') {
    const pluginRoot = rest[0] ? resolve(rest[0]) : process.cwd();
    const cwd = pluginRoot;
    const result = await buildPluginPackage({ cwd });
    console.log(`Built ${result.runtimeManifest.name} -> ${relative(cwd, result.distEntrypoint)}`);
    return;
  }

  if (command === 'pack') {
    const pluginRoot = getPositionalArgs(rest, ['--private-key'])[0];
    const privateKeyFlagIndex = rest.indexOf('--private-key');
    const privateKeyPath =
      privateKeyFlagIndex >= 0 && rest[privateKeyFlagIndex + 1]
        ? resolve(rest[privateKeyFlagIndex + 1])
        : undefined;
    const cwd = pluginRoot ? resolve(pluginRoot) : process.cwd();
    const result = await packPluginPackage({ cwd, privateKeyPath });
    console.log(`Packed ${result.manifest.name} -> ${basename(result.packagePath)}`);
    console.log(`Package path: ${result.packagePath}`);
    console.log(`Checksum: ${result.packageChecksum}`);
    console.log(`Signer: ${result.signature.fingerprint}`);
    return;
  }

  if (command === 'verify') {
    const packagePath = rest[0] ? resolve(rest[0]) : null;
    if (!packagePath) {
      throw new Error('verify requires a .ywp file path');
    }
    const result = verifyPluginPackage(packagePath);
    if (!result.valid) {
      throw new Error(result.error || 'Plugin verification failed');
    }
    console.log(`Verified ${basename(packagePath)}`);
    console.log(`Plugin ID: ${result.manifest?.id}`);
    console.log(`Version: ${result.manifest?.version}`);
    console.log(`Signer: ${result.signerFingerprint}`);
    return;
  }

  printHelp();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
