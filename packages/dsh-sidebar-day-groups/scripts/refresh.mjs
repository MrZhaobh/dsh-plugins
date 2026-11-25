// Rebuild workspace/client.js from the DSH installation actually installed on this
// machine, then re-apply patch/workspace-fork.patch.
//
// This package replaces @deepseek-ai/dsh-client-ui-workspace through its own bundle
// layer (cordis.patch.yml). After a DSH upgrade the upstream bundle changes, so run
// this script: it re-extracts the installed bundle, replays the fork patch, checks
// syntax, and runs the logic tests. If the patch no longer applies it says so and
// keeps the new upstream copy — port the change by hand, then `make-patch`.
//
// usage: node scripts/refresh.mjs [--asar <path to app.asar>] [--check]
//   --asar   installation archive (default: D:\DeepSeek Harness\resources\app.asar)
//   --check  compare this fork with a fresh re-apply, write nothing
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ws = join(root, 'vendor', 'ui-workspace');
const PKG = 'dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const asarPath = flag('asar', 'D:\\DeepSeek Harness\\resources\\app.asar');
const checkOnly = args.includes('--check');

if (!existsSync(asarPath)) {
  console.error(`app.asar not found: ${asarPath}\npass --asar <path>`);
  process.exit(2);
}

// --- minimal ASAR reader: header JSON, then concatenated file bodies ---------
const fd = openSync(asarPath, 'r');
const readAt = (position, length) => {
  const buffer = Buffer.alloc(length);
  readSync(fd, buffer, 0, length, position);
  return buffer;
};
const headerJsonLength = readAt(12, 4).readUInt32LE(0);
const baseOffset = 8 + readAt(4, 4).readUInt32LE(0);
const header = JSON.parse(readAt(16, headerJsonLength).toString('utf8'));

const entryOf = (path) => {
  let node = header;
  for (const part of path.split('/')) {
    node = node?.files?.[part];
    if (node === undefined) return undefined;
  }
  return node;
};
const readPacked = (path) => {
  const entry = entryOf(path);
  if (entry === undefined || entry.files !== undefined) throw new Error(`asar entry missing: ${path}`);
  if (entry.unpacked === true) return readFileSync(`${asarPath}.unpacked/${path}`);
  return readAt(baseOffset + Number(entry.offset), entry.size);
};
const listDir = (path) => {
  const entry = entryOf(path);
  return entry?.files === undefined ? [] : Object.keys(entry.files);
};

// --- extract the installed upstream package -------------------------------
const upstreamDir = join(root, 'upstream');
// Extract and patch in the system temp directory: a failed replay then never
// leaves half-patched files inside the package, and `git apply` never touches
// the repository working tree (where a stale index can silently skip the patch).
const work = join(tmpdir(), 'dsh-sidebar-day-groups-refresh');
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'lib'), { recursive: true });

const clientBytes = readPacked(`${PKG}/lib/client.js`);
writeFileSync(join(work, 'lib', 'client.js'), clientBytes);

if (!checkOnly) {
  mkdirSync(upstreamDir, { recursive: true });
  writeFileSync(join(upstreamDir, 'client.orig.js'), clientBytes);
  writeFileSync(join(ws, 'index.js'), readPacked(`${PKG}/lib/index.js`));
  mkdirSync(join(ws, 'locale'), { recursive: true });
  for (const file of listDir(`${PKG}/locale`)) writeFileSync(join(ws, 'locale', file), readPacked(`${PKG}/locale/${file}`));

  // The manifest stays ours (paths + metadata differ), but its dsh.client.inject
  // list must track upstream: compare and warn instead of silently overwriting it.
  const upstreamManifest = JSON.parse(readPacked(`${PKG}/package.json`).toString('utf8'));
  const ours = JSON.parse(readFileSync(join(ws, 'package.json'), 'utf8'));
  const before = JSON.stringify(upstreamManifest.dsh?.client?.inject ?? []);
  const now = JSON.stringify(ours.dsh?.client?.inject ?? []);
  if (before !== now) {
    console.warn('vendor/ui-workspace/package.json dsh.client.inject differs from the installed upstream package:');
    console.warn(`  upstream: ${before}`);
    console.warn(`  ours:     ${now}`);
    console.warn('  update vendor/ui-workspace/package.json by hand, then rerun.');
  }
}

// --- apply the fork patch --------------------------------------------------
try {
  execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '-p1', '--whitespace=nowarn', join(root, 'patch', 'workspace-fork.patch')], {
    cwd: work,
    stdio: 'inherit',
  });
} catch {
  console.error(`\npatch did not apply to the installed bundle (${PKG}/lib/client.js).`);
  console.error('Upstream changed: port patch/workspace-fork.patch by hand against upstream/client.orig.js.');
  process.exit(3);
}

// git may write added lines with CRLF on this host; the shipped bundle uses LF.
const patched = readFileSync(join(work, 'lib', 'client.js'), 'utf8').replace(/\r\n/g, '\n');

if (checkOnly) {
  const current = readFileSync(join(ws, 'client.js'), 'utf8');
  rmSync(work, { recursive: true, force: true });
  console.log(patched === current ? 'fork matches a fresh re-apply' : 'fork differs from a fresh re-apply');
  process.exit(patched === current ? 0 : 1);
}

writeFileSync(join(ws, 'client.js'), patched);
execFileSync(process.execPath, ['--check', join(ws, 'client.js')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'scripts', 'test-day-groups.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'scripts', 'test-stars.mjs')], { stdio: 'inherit' });
rmSync(work, { recursive: true, force: true });
console.log('fork refreshed from', asarPath);
