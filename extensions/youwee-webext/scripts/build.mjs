import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '..', '..');
const srcDir = path.join(extensionRoot, 'src');
const distDir = path.join(extensionRoot, 'dist');

async function buildTarget(target, appVersion) {
  const outDir = path.join(distDir, target);
  const manifestPath = path.join(extensionRoot, `manifest.${target}.json`);

  await mkdir(outDir, { recursive: true });
  await cp(srcDir, outDir, { recursive: true });

  const manifestContent = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestContent);
  manifest.version = appVersion;
  await writeFile(
    path.join(outDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
}

async function run() {
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const appVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await buildTarget('chromium', appVersion);
  await buildTarget('firefox', appVersion);

  console.log('Built extension packages:');
  console.log(`- ${path.join(distDir, 'chromium')}`);
  console.log(`- ${path.join(distDir, 'firefox')}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
