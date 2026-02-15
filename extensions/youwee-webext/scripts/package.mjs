import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');
const distDir = path.join(extensionRoot, 'dist');
const packagesDir = path.join(distDir, 'packages');

async function zipDirectory(sourceDir, outputFile) {
  if (process.platform === 'win32') {
    const psScript = [
      "$ErrorActionPreference = 'Stop'",
      `$src = '${sourceDir.replace(/'/g, "''")}'`,
      `$out = '${outputFile.replace(/'/g, "''")}'`,
      'if (Test-Path $out) { Remove-Item -Force $out }',
      'Compress-Archive -Path (Join-Path $src "*") -DestinationPath $out -Force',
    ].join('; ');

    await execFileAsync('powershell', ['-NoProfile', '-Command', psScript]);
    return;
  }

  await execFileAsync('zip', ['-rq', outputFile, '.'], { cwd: sourceDir });
}

async function run() {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

  const chromiumDir = path.join(distDir, 'chromium');
  const firefoxDir = path.join(distDir, 'firefox');

  await rm(packagesDir, { recursive: true, force: true });
  await mkdir(packagesDir, { recursive: true });

  const chromiumZip = path.join(packagesDir, `Youwee-Extension-Chromium-v${appVersion}.zip`);
  const firefoxUnsignedZip = path.join(
    packagesDir,
    `Youwee-Extension-Firefox-unsigned-v${appVersion}.zip`,
  );

  await zipDirectory(chromiumDir, chromiumZip);
  await zipDirectory(firefoxDir, firefoxUnsignedZip);

  console.log('Packaged extension archives:');
  console.log(`- ${chromiumZip}`);
  console.log(`- ${firefoxUnsignedZip}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
