import { spawnSync } from 'node:child_process';
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  generateKeyPairSync,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { SDK_VERSION } from './compatibility';
import { validatePluginManifest } from './manifest';
import type {
  BuildPluginPackageInput,
  BuildPluginPackageResult,
  GeneratePluginKeyPairResult,
  PackagedPluginBuildInfo,
  PackagedPluginChecksums,
  PackagedPluginSignature,
  PackPluginPackageInput,
  PackPluginPackageResult,
  PluginManifest,
  PluginSignaturePayload,
  VerifyPluginPackageResult,
} from './types';

const PACKAGE_FORMAT = 'ywp' as const;
const PACKAGE_FORMAT_VERSION = 1 as const;
const PACKAGED_ENTRYPOINT = 'dist/plugin.cjs';
const SIGNATURE_VERSION = 1 as const;
const SIGNATURE_ALGORITHM = 'ed25519' as const;
const CHECKSUMS_PATH = 'checksums.json' as const;

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
};

type StoredZipEntry = ZipEntry & {
  crc32: number;
};

type SigningKeyRecord = GeneratePluginKeyPairResult;

function getBunExecutable(): string {
  const execPath = process.execPath;
  if (!execPath) {
    throw new Error('youwee-sdk build/pack commands require Bun runtime.');
  }
  return execPath;
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeArchivePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function collectFiles(rootDir: string, relativeDir: string): string[] {
  const absoluteDir = join(rootDir, relativeDir);
  if (!existsSync(absoluteDir) || !statSync(absoluteDir).isDirectory()) {
    return [];
  }

  const files: string[] = [];
  const stack = [absoluteDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        files.push(normalizeArchivePath(relative(rootDir, absolutePath)));
      }
    }
  }

  files.sort();
  return files;
}

function collectReadmeFiles(rootDir: string, manifest: PluginManifest): string[] {
  const candidate = manifest.readme?.trim() || 'README.md';
  const basePath = resolve(rootDir, candidate);
  const collected = new Set<string>();

  const addIfFile = (absolutePath: string) => {
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      return;
    }
    const relativePath = normalizeArchivePath(relative(rootDir, absolutePath));
    if (!relativePath.startsWith('..')) {
      collected.add(relativePath);
    }
  };

  addIfFile(basePath);

  const directory = dirname(basePath);
  const baseName = basePath.split(/[\\/]/).pop() || 'README.md';
  const extensionIndex = baseName.lastIndexOf('.');
  const stem = extensionIndex >= 0 ? baseName.slice(0, extensionIndex) : baseName;
  const extension = extensionIndex >= 0 ? baseName.slice(extensionIndex) : '';

  if (existsSync(directory) && statSync(directory).isDirectory()) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const fileName = entry.name;
      if (!fileName.startsWith(`${stem}.`) || !fileName.endsWith(extension)) continue;
      addIfFile(join(directory, fileName));
    }
  }

  return [...collected].sort();
}

function loadSourceManifest(rootDir: string): { path: string; manifest: PluginManifest } {
  const manifestPath = join(rootDir, 'plugin.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`plugin.json not found in ${rootDir}`);
  }

  const manifest = readJsonFile<PluginManifest>(manifestPath);
  const validation = validatePluginManifest(manifest);
  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  return {
    path: manifestPath,
    manifest,
  };
}

function validateBuildInputs(rootDir: string, manifest: PluginManifest) {
  if (manifest.runtime.language !== 'javascript') {
    throw new Error('The .ywp packager currently supports JavaScript plugins only.');
  }

  const entrySourcePath = resolve(rootDir, manifest.runtime.entrypoint);
  if (!existsSync(entrySourcePath) || !statSync(entrySourcePath).isFile()) {
    throw new Error(`Plugin entrypoint not found: ${manifest.runtime.entrypoint}`);
  }

  const i18nDirectory = manifest.i18n?.directory || 'locales';
  if (manifest.i18n) {
    for (const locale of manifest.i18n.supportedLocales || []) {
      const localePath = resolve(rootDir, i18nDirectory, `${locale}.json`);
      if (!existsSync(localePath) || !statSync(localePath).isFile()) {
        throw new Error(
          `Missing locale file for ${locale}: ${normalizeArchivePath(relative(rootDir, localePath))}`,
        );
      }
    }

    const defaultLocale = manifest.i18n.defaultLocale;
    if (defaultLocale) {
      const defaultLocalePath = resolve(rootDir, i18nDirectory, `${defaultLocale}.json`);
      if (!existsSync(defaultLocalePath) || !statSync(defaultLocalePath).isFile()) {
        throw new Error(
          `Missing default locale file for ${defaultLocale}: ${normalizeArchivePath(relative(rootDir, defaultLocalePath))}`,
        );
      }
    }
  }
}

function buildRuntimeManifest(sourceManifest: PluginManifest): PluginManifest {
  return {
    ...sourceManifest,
    runtime: {
      ...sourceManifest.runtime,
      entrypoint: PACKAGED_ENTRYPOINT,
    },
  };
}

export function validatePackagedManifest(manifest: PluginManifest) {
  const validation = validatePluginManifest(manifest);
  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  if (manifest.runtime.language !== 'javascript') {
    throw new Error('Packaged .ywp plugins currently support JavaScript runtime only.');
  }

  if (manifest.runtime.entrypoint !== PACKAGED_ENTRYPOINT) {
    throw new Error(`Packaged manifest runtime.entrypoint must be ${PACKAGED_ENTRYPOINT}.`);
  }
}

export async function buildPluginPackage(
  input: BuildPluginPackageInput = {},
): Promise<BuildPluginPackageResult> {
  const bunExecutable = getBunExecutable();
  const rootDir = resolve(input.cwd || process.cwd());
  const { path: sourceManifestPath, manifest: sourceManifest } = loadSourceManifest(rootDir);
  validateBuildInputs(rootDir, sourceManifest);

  const sourceEntrypoint = resolve(rootDir, sourceManifest.runtime.entrypoint);
  const distDir = join(rootDir, 'dist');
  const distEntrypoint = join(distDir, 'plugin.cjs');

  rmSync(distDir, { recursive: true, force: true });
  mkdirSync(dirname(distEntrypoint), { recursive: true });

  const result = spawnSync(
    bunExecutable,
    [
      'build',
      `--outfile=${distEntrypoint}`,
      '--target=node',
      '--format=cjs',
      '--sourcemap=none',
      sourceEntrypoint,
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
    },
  );

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .join('\n')
      .trim();
    throw new Error(output || 'Build failed');
  }

  if (!existsSync(distEntrypoint) || !statSync(distEntrypoint).isFile()) {
    throw new Error(`Bundled plugin output was not written to ${distEntrypoint}`);
  }

  const copiedFiles: string[] = [];
  const i18nDirectory = sourceManifest.i18n?.directory || 'locales';
  copiedFiles.push(...collectFiles(rootDir, i18nDirectory));
  copiedFiles.push(...collectFiles(rootDir, 'assets'));
  copiedFiles.push(...collectReadmeFiles(rootDir, sourceManifest));
  for (const file of ['CHANGELOG.md']) {
    const absolute = join(rootDir, file);
    if (existsSync(absolute) && statSync(absolute).isFile()) {
      copiedFiles.push(file);
    }
  }

  const runtimeManifest = buildRuntimeManifest(sourceManifest);
  validatePackagedManifest(runtimeManifest);

  return {
    rootDir,
    sourceManifestPath,
    sourceManifest,
    runtimeManifest,
    distEntrypoint,
    copiedFiles,
  };
}

function buildPackageInfo(): PackagedPluginBuildInfo {
  return {
    packageFormat: PACKAGE_FORMAT,
    packageFormatVersion: PACKAGE_FORMAT_VERSION,
    packagedAt: new Date().toISOString(),
    builder: {
      tool: 'youwee-sdk',
      version: SDK_VERSION,
    },
    bundle: {
      entrypoint: PACKAGED_ENTRYPOINT,
      bundled: true,
      includesDependencies: true,
      moduleFormat: 'cjs',
    },
  };
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

function toText(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function readEntryBytes(rootDir: string, relativePath: string): Uint8Array {
  return new Uint8Array(readFileSync(join(rootDir, relativePath)));
}

function buildChecksums(entries: ZipEntry[]): PackagedPluginChecksums {
  const files: Record<string, string> = {};
  for (const entry of entries) {
    files[entry.path] = sha256(entry.bytes);
  }
  return {
    algorithm: 'sha256',
    files,
  };
}

function makeDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time: (hours << 11) | (minutes << 5) | seconds,
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = createCrc32Table();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatArrays(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function readU16(view: DataView, offset: number) {
  return view.getUint16(offset, true);
}

function readU32(view: DataView, offset: number) {
  return view.getUint32(offset, true);
}

function createStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const now = makeDosDateTime(new Date());

  for (const entry of entries) {
    const nameBytes = toBytes(normalizeArchivePath(entry.path));
    const dataBytes = entry.bytes;
    const checksum = crc32(dataBytes);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, 0);
    writeU16(localView, 8, 0);
    writeU16(localView, 10, now.time);
    writeU16(localView, 12, now.date);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, dataBytes.length);
    writeU32(localView, 22, dataBytes.length);
    writeU16(localView, 26, nameBytes.length);
    writeU16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0);
    writeU16(centralView, 10, 0);
    writeU16(centralView, 12, now.time);
    writeU16(centralView, 14, now.date);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, dataBytes.length);
    writeU32(centralView, 24, dataBytes.length);
    writeU16(centralView, 28, nameBytes.length);
    writeU16(centralView, 30, 0);
    writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0);
    writeU16(centralView, 36, 0);
    writeU32(centralView, 38, 0);
    writeU32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, dataBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirectory = concatArrays(centralParts);
  const localData = concatArrays(localParts);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeU32(endView, 0, 0x06054b50);
  writeU16(endView, 4, 0);
  writeU16(endView, 6, 0);
  writeU16(endView, 8, entries.length);
  writeU16(endView, 10, entries.length);
  writeU32(endView, 12, centralDirectory.length);
  writeU32(endView, 16, localData.length);
  writeU16(endView, 20, 0);

  return concatArrays([localData, centralDirectory, endRecord]);
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index;
    }
  }
  throw new Error('Invalid .ywp file: missing end-of-central-directory record.');
}

function readStoredZip(packageBytes: Uint8Array): StoredZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(packageBytes);
  const eocdView = new DataView(
    packageBytes.buffer,
    packageBytes.byteOffset + eocdOffset,
    packageBytes.length - eocdOffset,
  );
  const entryCount = readU16(eocdView, 10);
  const centralDirectorySize = readU32(eocdView, 12);
  const centralDirectoryOffset = readU32(eocdView, 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > packageBytes.length) {
    throw new Error('Invalid .ywp file: central directory exceeds archive bounds.');
  }

  const entries: StoredZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    const centralView = new DataView(
      packageBytes.buffer,
      packageBytes.byteOffset + offset,
      packageBytes.length - offset,
    );
    if (readU32(centralView, 0) !== 0x02014b50) {
      throw new Error('Invalid .ywp file: central directory entry is malformed.');
    }
    const compressionMethod = readU16(centralView, 10);
    if (compressionMethod !== 0) {
      throw new Error('Unsupported .ywp compression method. Only stored entries are supported.');
    }
    const crc = readU32(centralView, 16);
    const compressedSize = readU32(centralView, 20);
    const nameLength = readU16(centralView, 28);
    const extraLength = readU16(centralView, 30);
    const commentLength = readU16(centralView, 32);
    const localHeaderOffset = readU32(centralView, 42);

    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const nameBytes = packageBytes.slice(nameStart, nameEnd);
    const path = normalizeArchivePath(toText(nameBytes));

    const localView = new DataView(
      packageBytes.buffer,
      packageBytes.byteOffset + localHeaderOffset,
      packageBytes.length - localHeaderOffset,
    );
    if (readU32(localView, 0) !== 0x04034b50) {
      throw new Error(`Invalid .ywp file: local header missing for ${path}.`);
    }
    const localNameLength = readU16(localView, 26);
    const localExtraLength = readU16(localView, 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > packageBytes.length) {
      throw new Error(`Invalid .ywp file: entry ${path} exceeds archive bounds.`);
    }

    entries.push({
      path,
      bytes: packageBytes.slice(dataStart, dataEnd),
      crc32: crc,
    });

    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function getEntryMap(entries: ZipEntry[]): Map<string, ZipEntry> {
  return new Map(entries.map((entry) => [normalizeArchivePath(entry.path), entry]));
}

function requireEntry(map: Map<string, ZipEntry>, path: string): ZipEntry {
  const entry = map.get(path);
  if (!entry) {
    throw new Error(`Invalid .ywp file: missing ${path}.`);
  }
  return entry;
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function deriveFingerprint(publicKey: Uint8Array): string {
  return sha256(publicKey);
}

function deriveKeyId(publicKey: Uint8Array): string {
  return `ed25519:sha256:${deriveFingerprint(publicKey)}`;
}

function createSignaturePayload(
  manifest: PluginManifest,
  checksumsBytes: Uint8Array,
): PluginSignaturePayload {
  return {
    checksumsPath: CHECKSUMS_PATH,
    checksumsSha256: sha256(checksumsBytes),
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    packageFormat: PACKAGE_FORMAT,
    packageFormatVersion: PACKAGE_FORMAT_VERSION,
  };
}

function canonicalizeSignaturePayload(payload: PluginSignaturePayload): Uint8Array {
  return toBytes(JSON.stringify(payload));
}

function validateSigningKeyRecord(value: unknown): SigningKeyRecord {
  if (!value || typeof value !== 'object') {
    throw new Error('Signing key file must contain a JSON object.');
  }
  const key = value as Partial<SigningKeyRecord>;
  if (key.version !== SIGNATURE_VERSION) {
    throw new Error(`Unsupported signing key version: ${String(key.version)}`);
  }
  if (key.algorithm !== SIGNATURE_ALGORITHM) {
    throw new Error(`Unsupported signing key algorithm: ${String(key.algorithm)}`);
  }
  if (!key.publicKey || !key.privateKey || !key.keyId || !key.fingerprint) {
    throw new Error('Signing key file is missing required fields.');
  }
  return key as SigningKeyRecord;
}

function createPrivateKeyFromRecord(record: SigningKeyRecord) {
  return createPrivateKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: toBase64Url(fromBase64(record.publicKey)),
      d: toBase64Url(fromBase64(record.privateKey)),
    },
    format: 'jwk',
  });
}

function createPublicKeyFromBase64(publicKey: string) {
  return createPublicKey({
    key: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: toBase64Url(fromBase64(publicKey)),
    },
    format: 'jwk',
  });
}

export function generatePluginKeyPair(outputPath?: string): GeneratePluginKeyPairResult {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const privateJwk = privateKey.export({ format: 'jwk' }) as { d: string; x: string };
  const publicJwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const publicKeyBytes = fromBase64Url(publicJwk.x);
  const privateKeyBytes = fromBase64Url(privateJwk.d);

  const result: GeneratePluginKeyPairResult = {
    version: SIGNATURE_VERSION,
    algorithm: SIGNATURE_ALGORITHM,
    keyId: deriveKeyId(publicKeyBytes),
    fingerprint: deriveFingerprint(publicKeyBytes),
    publicKey: toBase64(publicKeyBytes),
    privateKey: toBase64(privateKeyBytes),
  };

  if (outputPath) {
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }

  return result;
}

function createPackageSignature(
  manifest: PluginManifest,
  checksumsBytes: Uint8Array,
  privateKeyPath: string,
): PackagedPluginSignature {
  const record = validateSigningKeyRecord(readJsonFile<SigningKeyRecord>(privateKeyPath));
  const publicKeyBytes = fromBase64(record.publicKey);
  const expectedKeyId = deriveKeyId(publicKeyBytes);
  const expectedFingerprint = deriveFingerprint(publicKeyBytes);
  if (record.keyId !== expectedKeyId || record.fingerprint !== expectedFingerprint) {
    throw new Error('Signing key file is inconsistent with the embedded public key.');
  }

  const payload = createSignaturePayload(manifest, checksumsBytes);
  const privateKey = createPrivateKeyFromRecord(record);
  const signatureBytes = cryptoSign(null, canonicalizeSignaturePayload(payload), privateKey);

  return {
    version: SIGNATURE_VERSION,
    algorithm: SIGNATURE_ALGORITHM,
    keyId: record.keyId,
    fingerprint: record.fingerprint,
    publicKey: record.publicKey,
    signedAt: new Date().toISOString(),
    payload,
    signature: signatureBytes.toString('base64'),
  };
}

function validateSignaturePayload(
  signature: PackagedPluginSignature,
  manifest: PluginManifest,
  buildInfo: PackagedPluginBuildInfo,
  checksumsBytes: Uint8Array,
) {
  if (signature.version !== SIGNATURE_VERSION) {
    throw new Error(`Unsupported plugin signature version: ${String(signature.version)}`);
  }
  if (signature.algorithm !== SIGNATURE_ALGORITHM) {
    throw new Error(`Unsupported plugin signature algorithm: ${String(signature.algorithm)}`);
  }

  const publicKeyBytes = fromBase64(signature.publicKey);
  const expectedKeyId = deriveKeyId(publicKeyBytes);
  const expectedFingerprint = deriveFingerprint(publicKeyBytes);
  if (signature.keyId !== expectedKeyId) {
    throw new Error('Plugin signature keyId does not match the embedded public key.');
  }
  if (signature.fingerprint !== expectedFingerprint) {
    throw new Error('Plugin signature fingerprint does not match the embedded public key.');
  }

  const payload = signature.payload;
  if (payload.checksumsPath !== CHECKSUMS_PATH) {
    throw new Error('Plugin signature payload points to an unsupported checksum file.');
  }
  if (payload.checksumsSha256 !== sha256(checksumsBytes)) {
    throw new Error('Plugin signature payload does not match checksums.json.');
  }
  if (payload.pluginId !== manifest.id) {
    throw new Error('Plugin signature payload does not match manifest id.');
  }
  if (payload.pluginVersion !== manifest.version) {
    throw new Error('Plugin signature payload does not match manifest version.');
  }
  if (payload.packageFormat !== buildInfo.packageFormat) {
    throw new Error('Plugin signature payload does not match package format.');
  }
  if (payload.packageFormatVersion !== buildInfo.packageFormatVersion) {
    throw new Error('Plugin signature payload does not match package format version.');
  }

  const signatureBytes = fromBase64(signature.signature);
  const publicKey = createPublicKeyFromBase64(signature.publicKey);
  const valid = cryptoVerify(
    null,
    canonicalizeSignaturePayload(payload),
    publicKey,
    signatureBytes,
  );
  if (!valid) {
    throw new Error('Plugin signature verification failed.');
  }
}

function validateChecksums(entries: ZipEntry[], checksums: PackagedPluginChecksums) {
  if (checksums.algorithm.toLowerCase() !== 'sha256') {
    throw new Error(`Unsupported checksums algorithm in .ywp file: ${checksums.algorithm}`);
  }

  const actualFiles = entries
    .map((entry) => normalizeArchivePath(entry.path))
    .filter((path) => path !== CHECKSUMS_PATH && path !== 'signature.json')
    .sort();
  const expectedFiles = Object.keys(checksums.files).sort();
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((path, index) => path !== expectedFiles[index])
  ) {
    throw new Error('The .ywp file contents do not match checksums.json.');
  }

  for (const path of expectedFiles) {
    const entry = entries.find((item) => normalizeArchivePath(item.path) === path);
    if (!entry) {
      throw new Error(`Missing package entry listed in checksums.json: ${path}`);
    }
    const actual = sha256(entry.bytes);
    if (actual !== checksums.files[path]) {
      throw new Error(`Checksum mismatch in .ywp file for ${path}`);
    }
  }
}

export function verifyPluginPackage(packagePath: string): VerifyPluginPackageResult {
  try {
    const archiveBytes = new Uint8Array(readFileSync(packagePath));
    const entries = readStoredZip(archiveBytes);
    const entryMap = getEntryMap(entries);

    const manifest = JSON.parse(
      toText(requireEntry(entryMap, 'manifest.json').bytes),
    ) as PluginManifest;
    const buildInfo = JSON.parse(
      toText(requireEntry(entryMap, 'build.json').bytes),
    ) as PackagedPluginBuildInfo;
    const checksumsEntry = requireEntry(entryMap, CHECKSUMS_PATH);
    const checksums = JSON.parse(toText(checksumsEntry.bytes)) as PackagedPluginChecksums;
    const signature = JSON.parse(
      toText(requireEntry(entryMap, 'signature.json').bytes),
    ) as PackagedPluginSignature;

    validatePackagedManifest(manifest);
    validateChecksums(entries, checksums);
    validateSignaturePayload(signature, manifest, buildInfo, checksumsEntry.bytes);

    return {
      valid: true,
      packagePath: resolve(packagePath),
      manifest,
      buildInfo,
      checksums,
      signature,
      signerKeyId: signature.keyId,
      signerFingerprint: signature.fingerprint,
    };
  } catch (error) {
    return {
      valid: false,
      packagePath: resolve(packagePath),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function packPluginPackage(
  input: PackPluginPackageInput = {},
): Promise<PackPluginPackageResult> {
  const privateKeyPath = input.privateKeyPath?.trim();
  if (!privateKeyPath) {
    throw new Error('Signing is required. Pass --private-key <path> to pack a .ywp plugin.');
  }

  const buildResult = await buildPluginPackage({ cwd: input.cwd });
  const packageInfo = buildPackageInfo();

  const entries: ZipEntry[] = [
    {
      path: 'manifest.json',
      bytes: toBytes(`${JSON.stringify(buildResult.runtimeManifest, null, 2)}\n`),
    },
    {
      path: 'build.json',
      bytes: toBytes(`${JSON.stringify(packageInfo, null, 2)}\n`),
    },
    {
      path: PACKAGED_ENTRYPOINT,
      bytes: new Uint8Array(readFileSync(buildResult.distEntrypoint)),
    },
  ];

  for (const file of buildResult.copiedFiles) {
    entries.push({
      path: normalizeArchivePath(file),
      bytes: readEntryBytes(buildResult.rootDir, file),
    });
  }

  const checksums = buildChecksums(entries);
  const checksumsBytes = toBytes(`${JSON.stringify(checksums, null, 2)}\n`);
  entries.push({
    path: CHECKSUMS_PATH,
    bytes: checksumsBytes,
  });

  const signature = createPackageSignature(
    buildResult.runtimeManifest,
    checksumsBytes,
    resolve(privateKeyPath),
  );
  entries.push({
    path: 'signature.json',
    bytes: toBytes(`${JSON.stringify(signature, null, 2)}\n`),
  });

  const packageBytes = createStoredZip(entries);
  const outDir = resolve(input.outDir || join(buildResult.rootDir, 'release'));
  mkdirSync(outDir, { recursive: true });
  const packagePath = join(
    outDir,
    `${buildResult.runtimeManifest.slug}-${buildResult.runtimeManifest.version}.${PACKAGE_FORMAT}`,
  );
  writeFileSync(packagePath, packageBytes);

  return {
    packagePath,
    packageChecksum: sha256(packageBytes),
    manifest: buildResult.runtimeManifest,
    buildInfo: packageInfo,
    signature,
  };
}

export function readPackagedBuildInfo(path: string): PackagedPluginBuildInfo {
  return readJsonFile<PackagedPluginBuildInfo>(path);
}
