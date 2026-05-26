import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAIBridge, parseJsonFromModelOutput } from '../sdk-js/src/ai';
import {
  assertCompatibleAppVersion,
  buildPluginPackage,
  checkAppVersionCompatibility,
  compareSemver,
  createJsonShapeValidator,
  createPluginPackageJson,
  defineHooks,
  definePlugin,
  generatePluginKeyPair,
  getManifestValidationErrors,
  packPluginPackage,
  SDK_VERSION,
  satisfiesVersionRange,
  slugifyPluginName,
  validatePluginManifest,
  verifyPluginPackage,
} from '../sdk-js/src/index';
import { createContext } from '../sdk-js/src/runtime';
import type { DownloadCompletedPayload, PluginManifest } from '../sdk-js/src/types';

const originalEnv = { ...process.env };

function replaceStoredZipEntryBytes(
  archiveBytes: Buffer,
  entryName: string,
  replacer: (bytes: Buffer) => Buffer,
): Buffer {
  const nameBytes = Buffer.from(entryName);
  let searchOffset = 0;

  while (searchOffset < archiveBytes.length) {
    const localHeaderOffset = archiveBytes.indexOf(
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      searchOffset,
    );
    if (localHeaderOffset < 0) {
      break;
    }

    const nameLength = archiveBytes.readUInt16LE(localHeaderOffset + 26);
    const extraLength = archiveBytes.readUInt16LE(localHeaderOffset + 28);
    const currentNameStart = localHeaderOffset + 30;
    const currentNameEnd = currentNameStart + nameLength;
    const currentName = archiveBytes.subarray(currentNameStart, currentNameEnd);
    const dataStart = currentNameEnd + extraLength;
    const compressedSize = archiveBytes.readUInt32LE(localHeaderOffset + 18);
    const dataEnd = dataStart + compressedSize;

    if (currentName.equals(nameBytes)) {
      const replacement = replacer(Buffer.from(archiveBytes.subarray(dataStart, dataEnd)));
      if (replacement.length !== compressedSize) {
        throw new Error(`Replacement for ${entryName} must preserve size inside stored ZIP.`);
      }

      const nextBytes = Buffer.from(archiveBytes);
      replacement.copy(nextBytes, dataStart);
      return nextBytes;
    }

    searchOffset = dataEnd;
  }

  throw new Error(`Entry not found in archive: ${entryName}`);
}

const samplePayload: DownloadCompletedPayload = {
  jobId: 'job-1',
  source: 'youtube',
  trigger: 'download.completed',
  filepath: '/tmp/video.mp4',
  filename: 'video.mp4',
  directory: '/tmp',
  filesize: 1234,
  format: 'mp4',
  quality: '1080p',
  url: 'https://example.com/video',
  title: 'Example video',
  thumbnail: 'https://example.com/thumb.jpg',
  historyId: 'history-1',
  timeRange: null,
  downloadKind: 'download',
};

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('youwee-sdk definePlugin', () => {
  test('accepts a valid plugin definition', () => {
    const hooks = defineHooks({
      'download.completed': (ctx) => ctx.ok('done'),
    });

    const plugin = definePlugin({
      meta: {
        name: 'Example',
        version: '0.1.0',
      },
      hooks,
    });

    expect(plugin.meta.name).toBe('Example');
    expect(typeof plugin.hooks['download.completed']).toBe('function');
  });

  test('rejects invalid plugin definitions', () => {
    expect(() => definePlugin(null as never)).toThrow('expects a plugin config object');
    expect(() =>
      definePlugin({
        meta: { name: '', version: '0.1.0' },
        hooks: {},
      }),
    ).toThrow('meta.name is required');
  });
});

describe('youwee-sdk createContext', () => {
  test('maps payload fields and runtime bridge values', () => {
    process.env.YOUWEE_APP_VERSION = '0.13.3';
    process.env.YOUWEE_PLUGIN_ID = 'plugin-1';
    process.env.YOUWEE_PLUGIN_PROVIDER = 'deno';
    process.env.YOUWEE_PLUGIN_PROVIDER_SOURCE = 'system';
    process.env.YOUWEE_PLUGIN_TIMEOUT_MS = '60000';
    process.env.YOUWEE_FFMPEG_PATH = '/usr/local/bin/ffmpeg';
    process.env.MY_SECRET = 'secret-value';
    process.env.YOUWEE_PLUGIN_CONFIG_JSON = JSON.stringify({
      apiToken: 'token-123',
      maxRetries: 3,
      enabled: true,
      labels: ['a', 'b'],
    });

    const ctx = createContext(samplePayload);

    expect(ctx.trigger).toBe('download.completed');
    expect(ctx.download.jobId).toBe('job-1');
    expect(ctx.file.path).toBe('/tmp/video.mp4');
    expect(ctx.media.url).toBe('https://example.com/video');
    expect(ctx.env.require('MY_SECRET')).toBe('secret-value');
    expect(ctx.config.require('apiToken')).toBe('token-123');
    expect(ctx.config.get('maxRetries')).toBe(3);
    expect(ctx.config.get('enabled')).toBe(true);
    expect(ctx.config.get('labels')).toEqual(['a', 'b']);
    expect(ctx.youwee.app.version).toBe('0.13.3');
    expect(ctx.youwee.sdk.version).toBe(SDK_VERSION);
    expect(ctx.youwee.plugin.id).toBe('plugin-1');
    expect(ctx.youwee.runtime.provider).toBe('deno');
    expect(ctx.youwee.tools.ffmpeg.available).toBe(true);
    expect(ctx.youwee.tools.ffmpeg.path).toBe('/usr/local/bin/ffmpeg');
    expect(ctx.youwee.sdk.checkAppVersion('>=0.13.0 <0.14.0').compatible).toBe(true);
  });

  test('exposes filesystem helpers', async () => {
    const ctx = createContext(samplePayload);
    const tempDir = await ctx.youwee.fs.tempDir('youwee-sdk-fs-');
    const textFile = join(tempDir, 'note.txt');

    await ctx.youwee.fs.ensureDir(tempDir);
    await ctx.youwee.fs.writeText(textFile, 'hello');

    expect(await ctx.youwee.fs.exists(textFile)).toBe(true);
    expect(await ctx.youwee.fs.readText(textFile)).toBe('hello');

    rmSync(tempDir, { recursive: true, force: true });
  });

  test('loads plugin locale files and falls back correctly', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-i18n-'));
    const localesDir = join(tempDir, 'locales');
    const originalCwd = process.cwd();

    try {
      mkdirSync(localesDir, { recursive: true });
      writeFileSync(
        join(localesDir, 'en.json'),
        JSON.stringify({
          'upload.started': 'Started {{filename}}',
          'upload.done': 'Done',
        }),
      );
      writeFileSync(
        join(localesDir, 'vi.json'),
        JSON.stringify({
          'upload.started': 'Bat dau {{filename}}',
        }),
      );

      process.chdir(tempDir);
      process.env.YOUWEE_APP_LOCALE = 'vi';
      process.env.YOUWEE_APP_FALLBACK_LOCALE = 'en';
      process.env.YOUWEE_PLUGIN_I18N_DIR = 'locales';
      process.env.YOUWEE_PLUGIN_I18N_DEFAULT_LOCALE = 'en';
      process.env.YOUWEE_PLUGIN_I18N_SUPPORTED_LOCALES = 'en,vi';

      const ctx = createContext(samplePayload);
      expect(ctx.i18n.locale).toBe('vi');
      expect(ctx.i18n.t('upload.started', { filename: 'video.mp4' })).toBe('Bat dau video.mp4');
      expect(ctx.i18n.t('upload.done')).toBe('Done');
      expect(ctx.i18n.has('upload.started')).toBe(true);
      expect(ctx.i18n.raw('upload.done')).toBe('Done');
    } finally {
      process.chdir(originalCwd);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('exposes http helpers', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlText = String(url);
      if (urlText.endsWith('/json')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-Test': '1' },
        });
      }

      return new Response(init?.body ? String(init.body) : 'pong', {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'text/plain' },
      });
    }) as typeof fetch;

    try {
      const ctx = createContext(samplePayload);
      const textResponse = await ctx.youwee.http.request('https://example.com/ping', {
        method: 'POST',
        body: 'payload',
      });
      const jsonResponse = await ctx.youwee.http.getJson<{ ok: boolean }>(
        'https://example.com/json',
      );

      expect(textResponse.ok).toBe(true);
      expect(textResponse.status).toBe(201);
      expect(textResponse.body).toBe('payload');
      expect(jsonResponse.body).toEqual({ ok: true });
      expect(jsonResponse.headers['x-test']).toBe('1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('youwee-sdk manifest helpers', () => {
  test('validates plugin manifests', () => {
    const validManifest: PluginManifest = {
      id: 'local.plugin-1',
      slug: 'example-plugin',
      name: 'Example plugin',
      version: '0.1.0',
      runtime: {
        language: 'javascript',
        supportedProviders: ['deno'],
        preferredProvider: 'deno',
        entrypoint: 'src/plugin.js',
      },
      triggers: ['download.completed'],
      compatibility: {
        appVersion: '>=0.13.0 <0.14.0',
        sdkVersion: '>=1.0.0 <2.0.0',
      },
      timeoutSec: 60,
    };

    const validResult = validatePluginManifest(validManifest);
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toEqual([]);

    const invalidErrors = getManifestValidationErrors({
      ...validManifest,
      id: '',
      runtime: {
        ...validManifest.runtime,
        supportedProviders: ['python'],
      },
    });

    expect(invalidErrors.length).toBeGreaterThan(0);
    expect(invalidErrors.join('\n')).toContain('id is required');
    expect(invalidErrors.join('\n')).toContain('unsupported provider "python"');
  });

  test('creates a package json template and slugs names', () => {
    const packageJson = createPluginPackageJson({
      name: 'gg-drive',
      version: '0.1.0',
      description: 'Google Drive uploader',
    });

    expect(slugifyPluginName('GG Drive Upload')).toBe('gg-drive-upload');
    expect(packageJson).toContain(`"youwee-sdk": "^${SDK_VERSION}"`);
    expect(packageJson).toContain(`"build": "bunx youwee-sdk build"`);
    expect(packageJson).toContain(
      `"pack": "bunx youwee-sdk pack --private-key ./plugin.youwee-plugin-key.json"`,
    );
    expect(packageJson).toContain(
      `"keygen": "bunx youwee-sdk keygen ./plugin.youwee-plugin-key.json"`,
    );
    expect(packageJson).toContain('node_modules/youwee-sdk/dist/runtime-cli.js src/plugin.js');
    expect(packageJson).toContain('deno run');
    expect(packageJson).toContain('--allow-run');
  });

  test('rejects invalid compatibility syntax in manifests', () => {
    const errors = getManifestValidationErrors({
      id: 'local.plugin-1',
      slug: 'example-plugin',
      name: 'Example plugin',
      version: '0.1.0',
      runtime: {
        language: 'javascript',
        supportedProviders: ['deno'],
        entrypoint: 'src/plugin.js',
      },
      compatibility: {
        appVersion: '>=',
      },
    });

    expect(errors.join('\n')).toContain('compatibility.appVersion is invalid');
  });

  test('rejects SDK trigger identifiers inside plugin.json triggers', () => {
    const errors = getManifestValidationErrors({
      id: 'local.plugin-1',
      slug: 'example-plugin',
      name: 'Example plugin',
      version: '0.1.0',
      runtime: {
        language: 'javascript',
        supportedProviders: ['deno'],
        entrypoint: 'src/plugin.js',
      },
      triggers: ['triggers.downloadQueued'],
    });

    expect(errors.join('\n')).toContain('plugin.json must use raw runtime names');
  });

  test('validates structured config fields and rejects obsolete permissions.env', () => {
    const errors = getManifestValidationErrors({
      id: 'local.plugin-1',
      slug: 'example-plugin',
      name: 'Example plugin',
      version: '0.1.0',
      runtime: {
        language: 'javascript',
        supportedProviders: ['deno'],
        entrypoint: 'src/plugin.js',
      },
      triggers: ['download.completed'],
      permissions: {
        network: true,
        env: ['OLD_SECRET'],
      } as never,
      configFields: [
        {
          key: 'uploadMode',
          inputType: 'select',
          label: 'Upload mode',
          defaultValue: 'copy',
          options: [
            { value: 'copy', label: 'Copy' },
            { value: 'move', label: 'Move' },
          ],
        },
        {
          key: 'tags',
          inputType: 'multi-select',
          label: 'Tags',
          defaultValue: ['bad'],
          options: [{ value: 'good', label: 'Good' }],
        },
        {
          key: 'exportDir',
          inputType: 'directory',
          label: 'Export directory',
        },
      ],
    });

    expect(errors.join('\n')).toContain('permissions.env is obsolete');
    expect(errors.join('\n')).toContain('defaultValue contains unsupported option "bad"');
  });

  test('requires file or directory config fields for fs.user-selected capabilities', () => {
    const errors = getManifestValidationErrors({
      id: 'local.plugin-1',
      slug: 'example-plugin',
      name: 'Example plugin',
      version: '0.1.0',
      runtime: {
        language: 'javascript',
        supportedProviders: ['deno'],
        entrypoint: 'src/plugin.js',
      },
      triggers: ['download.completed'],
      permissions: {
        fs: ['fs.user-selected.write'],
      },
      configFields: [
        {
          key: 'folderName',
          inputType: 'text',
          label: 'Folder name',
        },
      ],
    });

    expect(errors.join('\n')).toContain('fs.user-selected.*');
  });

  test('builds dist output and packs a .ywp runtime package', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-pack-'));
    const sourceDir = join(tempDir, 'src');
    const localesDir = join(tempDir, 'locales');
    const keyPath = join(tempDir, 'plugin-key.json');
    const sdkEntry = resolve(process.cwd(), 'sdk-js/dist/index.js');

    try {
      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(localesDir, { recursive: true });
      const generatedKey = generatePluginKeyPair(keyPath);

      const manifest = {
        id: 'local.gg-drive',
        slug: 'gg-drive',
        name: 'GG Drive',
        version: '0.1.0',
        runtime: {
          language: 'javascript',
          supportedProviders: ['deno'],
          preferredProvider: 'deno',
          entrypoint: 'src/plugin.js',
        },
        compatibility: {
          appVersion: '>=0.13.0 <0.14.0',
          sdkVersion: `>=${SDK_VERSION} <1.0.0`,
        },
        triggers: ['download.completed'],
        timeoutSec: 60,
        i18n: {
          defaultLocale: 'en',
          supportedLocales: ['en'],
          directory: 'locales',
        },
      };

      writeFileSync(join(tempDir, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(
        join(sourceDir, 'plugin.js'),
        `
const { definePlugin, triggers } = require(${JSON.stringify(sdkEntry)});

module.exports = definePlugin({
  meta: { name: 'GG Drive', version: '0.1.0' },
  hooks: {
    [triggers.downloadCompleted]: async (ctx) => ctx.ok(ctx.i18n.t('done')),
  },
});
`.trim(),
      );
      writeFileSync(join(localesDir, 'en.json'), `${JSON.stringify({ done: 'Done' }, null, 2)}\n`);
      writeFileSync(join(tempDir, 'README.md'), '# English Guide\n');
      writeFileSync(join(tempDir, 'README.vi.md'), '# Huong dan tieng Viet\n');

      const buildResult = await buildPluginPackage({ cwd: tempDir });
      const packResult = await packPluginPackage({ cwd: tempDir, privateKeyPath: keyPath });
      const archiveBytes = readFileSync(packResult.packagePath);
      const verifyResult = verifyPluginPackage(packResult.packagePath);

      expect(existsSync(buildResult.distEntrypoint)).toBe(true);
      expect(packResult.packagePath.endsWith('.ywp')).toBe(true);
      expect(packResult.packageChecksum).toHaveLength(64);
      expect(packResult.signature.fingerprint).toBe(generatedKey.fingerprint);
      expect(archiveBytes.includes(Buffer.from('manifest.json'))).toBe(true);
      expect(archiveBytes.includes(Buffer.from('build.json'))).toBe(true);
      expect(archiveBytes.includes(Buffer.from('checksums.json'))).toBe(true);
      expect(archiveBytes.includes(Buffer.from('signature.json'))).toBe(true);
      expect(archiveBytes.includes(Buffer.from('dist/plugin.cjs'))).toBe(true);
      expect(buildResult.copiedFiles).toContain('README.md');
      expect(buildResult.copiedFiles).toContain('README.vi.md');
      expect(archiveBytes.includes(Buffer.from('README.vi.md'))).toBe(true);
      expect(verifyResult.valid).toBe(true);
      expect(verifyResult.signerFingerprint).toBe(generatedKey.fingerprint);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects packages when checksums.json is changed after signing', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-tamper-'));
    const sourceDir = join(tempDir, 'src');
    const localesDir = join(tempDir, 'locales');
    const keyPath = join(tempDir, 'plugin-key.json');
    const sdkEntry = resolve(process.cwd(), 'sdk-js/dist/index.js');

    try {
      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(localesDir, { recursive: true });
      generatePluginKeyPair(keyPath);

      writeFileSync(
        join(tempDir, 'plugin.json'),
        `${JSON.stringify(
          {
            id: 'local.example',
            slug: 'example',
            name: 'Example',
            version: '0.1.0',
            runtime: {
              language: 'javascript',
              supportedProviders: ['deno'],
              preferredProvider: 'deno',
              entrypoint: 'src/plugin.js',
            },
            triggers: ['download.completed'],
            timeoutSec: 60,
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(sourceDir, 'plugin.js'),
        `
const { definePlugin, triggers } = require(${JSON.stringify(sdkEntry)});
module.exports = definePlugin({
  meta: { name: 'Example', version: '0.1.0' },
  hooks: { [triggers.downloadCompleted]: async (ctx) => ctx.ok('ok') },
});
`.trim(),
      );
      writeFileSync(join(localesDir, 'en.json'), `${JSON.stringify({ done: 'Done' }, null, 2)}\n`);

      const packResult = await packPluginPackage({ cwd: tempDir, privateKeyPath: keyPath });
      const modifiedBytes = replaceStoredZipEntryBytes(
        Buffer.from(readFileSync(packResult.packagePath)),
        'checksums.json',
        (bytes) => {
          const nextBytes = Buffer.from(bytes);
          const checksumMarker = Buffer.from('"dist/plugin.cjs": "');
          const checksumIndex = nextBytes.indexOf(checksumMarker);
          expect(checksumIndex).toBeGreaterThan(-1);
          const hexIndex = checksumIndex + checksumMarker.length;
          nextBytes[hexIndex] = nextBytes[hexIndex] === 0x61 ? 0x62 : 0x61;
          return nextBytes;
        },
      );
      writeFileSync(packResult.packagePath, modifiedBytes);

      const verifyResult = verifyPluginPackage(packResult.packagePath);
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toMatch(/checksums\.json|Checksum mismatch/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects packages when dist/plugin.cjs is changed after signing', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-tamper-dist-'));
    const sourceDir = join(tempDir, 'src');
    const localesDir = join(tempDir, 'locales');
    const keyPath = join(tempDir, 'plugin-key.json');
    const sdkEntry = resolve(process.cwd(), 'sdk-js/dist/index.js');

    try {
      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(localesDir, { recursive: true });
      generatePluginKeyPair(keyPath);

      writeFileSync(
        join(tempDir, 'plugin.json'),
        `${JSON.stringify(
          {
            id: 'local.example',
            slug: 'example',
            name: 'Example',
            version: '0.1.0',
            runtime: {
              language: 'javascript',
              supportedProviders: ['deno'],
              preferredProvider: 'deno',
              entrypoint: 'src/plugin.js',
            },
            triggers: ['download.completed'],
            timeoutSec: 60,
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(sourceDir, 'plugin.js'),
        `
const { definePlugin, triggers } = require(${JSON.stringify(sdkEntry)});
module.exports = definePlugin({
  meta: { name: 'Example', version: '0.1.0' },
  hooks: { [triggers.downloadCompleted]: async (ctx) => ctx.ok('ok') },
});
`.trim(),
      );
      writeFileSync(join(localesDir, 'en.json'), `${JSON.stringify({ done: 'Done' }, null, 2)}\n`);

      const packResult = await packPluginPackage({ cwd: tempDir, privateKeyPath: keyPath });
      const modifiedBytes = replaceStoredZipEntryBytes(
        Buffer.from(readFileSync(packResult.packagePath)),
        'dist/plugin.cjs',
        (bytes) => {
          const nextBytes = Buffer.from(bytes);
          expect(nextBytes.length).toBeGreaterThan(0);
          nextBytes[0] = nextBytes[0] ^ 0x01;
          return nextBytes;
        },
      );
      writeFileSync(packResult.packagePath, modifiedBytes);

      const verifyResult = verifyPluginPackage(packResult.packagePath);
      expect(verifyResult.valid).toBe(false);
      expect(verifyResult.error).toContain('Checksum mismatch');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('youwee-sdk package metadata', () => {
  test('exports productized subpaths and release docs', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'sdk-js/package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
      files: string[];
    };

    expect(pkg.exports['./compatibility']).toBeDefined();
    expect(pkg.exports['./manifest']).toBeDefined();
    expect(pkg.exports['./schema']).toBeDefined();
    expect(pkg.files).toContain('CHANGELOG.md');
    expect(pkg.files).toContain('RELEASING.md');
  });
});

describe('youwee-sdk compatibility helpers', () => {
  test('parses and compares semver values', () => {
    expect(compareSemver('0.13.3', '0.13.2')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(satisfiesVersionRange('0.13.3', '>=0.13.0 <0.14.0')).toBe(true);
    expect(satisfiesVersionRange('0.14.0', '>=0.13.0 <0.14.0')).toBe(false);
  });

  test('checks and asserts compatibility ranges', () => {
    const ok = checkAppVersionCompatibility('0.13.3', '>=0.13.0 <0.14.0');
    const bad = checkAppVersionCompatibility('0.15.0', '>=0.13.0 <0.14.0');

    expect(ok.compatible).toBe(true);
    expect(bad.compatible).toBe(false);
    expect(() => assertCompatibleAppVersion('0.15.0', '>=0.13.0 <0.14.0')).toThrow(
      'does not satisfy required range',
    );
  });
});

describe('youwee-sdk runtime-cli', () => {
  test('loads a plugin module and writes the final JSON result through Deno', async () => {
    if (spawnSync('deno', ['--version'], { stdio: 'ignore' }).status !== 0) {
      return;
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-test-'));
    const resolvedTempDir = realpathSync(tempDir);
    const pluginFile = join(tempDir, 'plugin.cjs');
    const sdkEntry = resolve(process.cwd(), 'sdk-js/dist/index.js');
    const runtimeCli = resolve(process.cwd(), 'sdk-js/dist/runtime-cli.js');
    const runtimeDistDir = realpathSync(resolve(process.cwd(), 'sdk-js', 'dist'));

    writeFileSync(
      pluginFile,
      `
        const { definePlugin } = require(${JSON.stringify(sdkEntry)});
        module.exports = definePlugin({
          meta: { name: "Runtime CLI", version: "0.1.0" },
          hooks: {
            "download.completed": async (ctx) => ctx.ok("runtime ok", { filename: ctx.file.name }),
          },
        });
      `,
    );

    const { exitCode, stdout, stderr } = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolvePromise, reject) => {
      const proc = spawn(
        'deno',
        [
          'run',
          '--quiet',
          '--unstable-detect-cjs',
          '--allow-env',
          `--allow-read=${tempDir},${resolvedTempDir},${runtimeDistDir}`,
          runtimeCli,
          pluginFile,
        ],
        {
          env: {
            ...process.env,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', reject);
      proc.on('close', (code) => {
        resolvePromise({ exitCode: code, stdout, stderr });
      });

      proc.stdin.write(JSON.stringify(samplePayload));
      proc.stdin.end();
    });

    rmSync(tempDir, { recursive: true, force: true });

    expect(exitCode).toBe(0);
    expect(stderr.trim()).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      success: true,
      message: 'runtime ok',
      metadata: { filename: 'video.mp4' },
      artifacts: null,
      mutations: null,
    });
  });

  test('uses Deno.Command for tool runners inside the Deno runtime', async () => {
    if (spawnSync('deno', ['--version'], { stdio: 'ignore' }).status !== 0) {
      return;
    }

    const denoExecPath = spawnSync('deno', ['eval', 'console.log(Deno.execPath())'], {
      encoding: 'utf8',
    });

    if (denoExecPath.status !== 0) {
      throw new Error(denoExecPath.stderr || 'Failed to resolve Deno exec path');
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-tool-runner-'));
    const resolvedTempDir = realpathSync(tempDir);
    const pluginFile = join(tempDir, 'plugin.cjs');
    const sdkEntry = resolve(process.cwd(), 'sdk-js/dist/index.js');
    const runtimeCli = resolve(process.cwd(), 'sdk-js/dist/runtime-cli.js');
    const runtimeDistDir = realpathSync(resolve(process.cwd(), 'sdk-js', 'dist'));
    const denoPath = denoExecPath.stdout.trim();

    writeFileSync(
      pluginFile,
      `
        const { definePlugin } = require(${JSON.stringify(sdkEntry)});
        module.exports = definePlugin({
          meta: { name: "Tool Runner", version: "0.1.0" },
          hooks: {
            "download.completed": async (ctx) => {
              const result = await ctx.youwee.tools.ffmpeg.run([
                "eval",
                "console.log('ffmpeg tool ok')",
              ]);
              return ctx.ok("tool ok", {
                stdout: result.stdout.trim(),
                stderr: result.stderr.trim(),
                exitCode: result.code,
              });
            },
          },
        });
      `,
    );

    const { exitCode, stdout, stderr } = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolvePromise, reject) => {
      const proc = spawn(
        'deno',
        [
          'run',
          '--quiet',
          '--unstable-detect-cjs',
          '--allow-env',
          `--allow-read=${tempDir},${resolvedTempDir},${runtimeDistDir}`,
          `--allow-run=${denoPath}`,
          runtimeCli,
          pluginFile,
        ],
        {
          env: {
            ...process.env,
            YOUWEE_FFMPEG_PATH: denoPath,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', reject);
      proc.on('close', (code) => {
        resolvePromise({ exitCode: code, stdout, stderr });
      });

      proc.stdin.write(JSON.stringify(samplePayload));
      proc.stdin.end();
    });

    rmSync(tempDir, { recursive: true, force: true });

    expect(exitCode).toBe(0);
    expect(stderr.trim()).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      success: true,
      message: 'tool ok',
      metadata: {
        stdout: 'ffmpeg tool ok',
        stderr: '',
        exitCode: 0,
      },
      artifacts: null,
      mutations: null,
    });
  });

  test('strips linker environment variables before loading the plugin module', async () => {
    if (spawnSync('deno', ['--version'], { stdio: 'ignore' }).status !== 0) {
      return;
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-env-sanitize-'));
    const resolvedTempDir = realpathSync(tempDir);
    const pluginFile = join(tempDir, 'plugin.cjs');
    const sdkEntry = resolve(process.cwd(), 'sdk-js/dist/index.js');
    const runtimeCli = resolve(process.cwd(), 'sdk-js/dist/runtime-cli.js');
    const runtimeDistDir = realpathSync(resolve(process.cwd(), 'sdk-js', 'dist'));

    writeFileSync(
      pluginFile,
      `
        const { definePlugin } = require(${JSON.stringify(sdkEntry)});
        module.exports = definePlugin({
          meta: { name: "Runtime Env", version: "0.1.0" },
          hooks: {
            "download.completed": async (ctx) => ctx.ok("sanitized", {
              dyldFallback: process.env.DYLD_FALLBACK_LIBRARY_PATH ?? null,
              dyldLibrary: process.env.DYLD_LIBRARY_PATH ?? null,
              ldLibrary: process.env.LD_LIBRARY_PATH ?? null,
            }),
          },
        });
      `,
    );

    const { exitCode, stdout, stderr } = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
    }>((resolvePromise, reject) => {
      const proc = spawn(
        'deno',
        [
          'run',
          '--quiet',
          '--unstable-detect-cjs',
          '--allow-env',
          `--allow-read=${tempDir},${resolvedTempDir},${runtimeDistDir}`,
          runtimeCli,
          pluginFile,
        ],
        {
          env: {
            ...process.env,
            DYLD_FALLBACK_LIBRARY_PATH: '/tmp/fallback',
            DYLD_LIBRARY_PATH: '/tmp/dyld',
            LD_LIBRARY_PATH: '/tmp/ld',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      proc.on('error', reject);
      proc.on('close', (code) => {
        resolvePromise({ exitCode: code, stdout, stderr });
      });

      proc.stdin.write(JSON.stringify(samplePayload));
      proc.stdin.end();
    });

    rmSync(tempDir, { recursive: true, force: true });

    expect(exitCode).toBe(0);
    expect(stderr.trim()).toBe('');
    expect(JSON.parse(stdout)).toEqual({
      success: true,
      message: 'sanitized',
      metadata: {
        dyldFallback: null,
        dyldLibrary: null,
        ldLibrary: null,
      },
      artifacts: null,
      mutations: null,
    });
  });
});

describe('youwee-sdk cli', () => {
  test('packs a plugin when --private-key is passed without an explicit plugin-root', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'youwee-sdk-cli-pack-'));
    const sourceDir = join(tempDir, 'src');
    const keyPath = join(tempDir, 'plugin-key.json');
    const sdkEntry = resolve(process.cwd(), 'sdk-js/dist/index.js');
    const cliEntry = resolve(process.cwd(), 'sdk-js/src/cli.ts');

    try {
      mkdirSync(sourceDir, { recursive: true });
      generatePluginKeyPair(keyPath);

      writeFileSync(
        join(tempDir, 'plugin.json'),
        `${JSON.stringify(
          {
            id: 'local.cli-pack',
            slug: 'cli-pack',
            name: 'CLI Pack',
            version: '0.1.0',
            runtime: {
              language: 'javascript',
              supportedProviders: ['deno'],
              preferredProvider: 'deno',
              entrypoint: 'src/plugin.js',
            },
            triggers: ['download.completed'],
            timeoutSec: 60,
          },
          null,
          2,
        )}\n`,
      );
      writeFileSync(
        join(sourceDir, 'plugin.js'),
        `
const { definePlugin, triggers } = require(${JSON.stringify(sdkEntry)});
module.exports = definePlugin({
  meta: { name: 'CLI Pack', version: '0.1.0' },
  hooks: { [triggers.downloadCompleted]: async (ctx) => ctx.ok('ok') },
});
`.trim(),
      );

      const { exitCode, stdout, stderr } = await new Promise<{
        exitCode: number | null;
        stdout: string;
        stderr: string;
      }>((resolvePromise, reject) => {
        const proc = spawn('bun', [cliEntry, 'pack', '--private-key', keyPath], {
          cwd: tempDir,
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });

        proc.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });

        proc.on('error', reject);
        proc.on('close', (code) => {
          resolvePromise({ exitCode: code, stdout, stderr });
        });
      });

      expect(exitCode).toBe(0);
      expect(stderr.trim()).toBe('');
      expect(stdout).toContain('cli-pack-0.1.0.ywp');
      expect(existsSync(join(tempDir, 'release', 'cli-pack-0.1.0.ywp'))).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('youwee-sdk ai helpers', () => {
  test('parses json from fenced or noisy model output', () => {
    expect(parseJsonFromModelOutput('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseJsonFromModelOutput('Result:\n{"count":2}\nDone.')).toEqual({ count: 2 });
    expect(parseJsonFromModelOutput('[1,2,3]')).toEqual([1, 2, 3]);
  });

  test('exposes summarize and extractJson helpers', async () => {
    process.env.YOUWEE_AI_ENABLED = 'true';
    process.env.YOUWEE_AI_PROVIDER = 'openai';
    process.env.YOUWEE_AI_MODEL = 'gpt-test';
    process.env.YOUWEE_AI_API_KEY = 'secret';

    const calls: Array<{ url: string; body: unknown }> = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), body });

      const promptText = JSON.stringify(body);
      const content = promptText.includes('valid JSON only')
        ? '```json\n{"tag":"ok"}\n```'
        : 'Short summary';

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as typeof fetch;

    try {
      const ai = createAIBridge();
      const summary = await ai.summarize({
        text: 'Long body of text',
        title: 'Demo',
        maxSentences: 2,
      });
      const extracted = await ai.extractJson<{ tag: string }>({
        prompt: 'Return { "tag": "ok" }',
        schemaDescription: '{ "tag": "string" }',
        validate(value) {
          return Boolean(value && typeof value === 'object' && 'tag' in value);
        },
      });

      expect(summary).toBe('Short summary');
      expect(extracted).toEqual({ tag: 'ok' });
      expect(calls.length).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('supports reusable JSON shape validators', () => {
    const validator = createJsonShapeValidator({
      type: 'object',
      required: ['title', 'score'],
      properties: {
        title: 'string',
        score: 'number',
        tags: {
          type: 'array',
          items: 'string',
        },
      },
    });

    expect(
      validator({
        title: 'Demo',
        score: 10,
        tags: ['a', 'b'],
      }),
    ).toBe(true);
    expect(
      validator({
        title: 'Demo',
        score: 'bad',
      }),
    ).toBe(false);
  });
});
