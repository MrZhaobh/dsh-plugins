// 从当前安装的 DSH 里抽取 ui-workspace 的原始 bundle，重跑「按天分组」移植并测试。
//
// DSH 升级之后跑这个。它做四件事：
//   1. 把安装包里的上游 bundle / node 半边 / locale 抽到 upstream/ 和 vendor/
//   2. 比对上游版本与 vendor/ui-workspace/package.json 记的基准版本，不一致就明确提示
//   3. 跑 scripts/port-day-groups.mjs 重新打那 8 处定点移植
//   4. 跑 test/day-groups.test.mjs 验证
//
// 移植脚本是「全有或全无」：任何一处锚点找不到就整体退出、不写文件，
// 所以升级后最坏的结果是「停在旧版本继续能用」，而不是产出一个坏包。
//
// usage:
//   node scripts/refresh.mjs                 抽取 + 重新移植 + 测试
//   node scripts/refresh.mjs --check         只检查是否需要重跑，不动任何文件
//   node scripts/refresh.mjs --asar <path>   指定 app.asar（默认自动探测）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const ws = join(root, 'vendor', 'ui-workspace');
const upstreamDir = join(root, 'upstream');
const PKG = 'dsh/node_modules/@deepseek-ai/dsh-client-ui-workspace';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};
const checkOnly = args.includes('--check');

// 自动探测 app.asar：环境变量 → 常见安装位置
const asarCandidates = [
  flag('asar', undefined),
  process.env.DSH_INSTALL_DIR === undefined
    ? undefined
    : resolve(process.env.DSH_INSTALL_DIR, '../../../app.asar'),
  'D:\\DeepSeek Harness\\resources\\app.asar',
].filter((value) => value !== undefined && value !== '');
const asarPath = asarCandidates.find((candidate) => existsSync(candidate));
if (asarPath === undefined) {
  console.error('app.asar not found. pass --asar <path>');
  process.exit(2);
}

// --- 最小 ASAR 读取：先 header JSON，再读拼接的文件体 ----------------------
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

// --- 版本比对：升级后最先要知道的事 ----------------------------------------
const upstreamManifest = JSON.parse(readPacked(`${PKG}/package.json`).toString('utf8'));
const oursPath = join(ws, 'package.json');
const ours = existsSync(oursPath) ? JSON.parse(readFileSync(oursPath, 'utf8')) : { version: '(missing)' };
const versionMatches = upstreamManifest.version === ours.version;

console.log(`asar            : ${asarPath}`);
console.log(`上游 ui-workspace: ${upstreamManifest.version}`);
console.log(`我们的基准       : ${ours.version}`);
if (!versionMatches) {
  console.log('\n⚠ 上游版本和我们的基准不一致 —— 需要重新移植（下面会自动跑）。');
  console.log('  移植成功后记得把 vendor/ui-workspace/package.json 的 version 改成上游版本。');
}

if (checkOnly) {
  const portCheck = execFileSync(process.execPath, [join(here, 'port-day-groups.mjs'), '--check'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(portCheck);
  const stale = !versionMatches || !portCheck.includes('已是最新');
  console.log(stale ? '\n结论：需要重跑 node scripts/refresh.mjs' : '\n结论：已经对齐，无需重跑');
  process.exit(stale ? 1 : 0);
}

// --- 抽取上游 --------------------------------------------------------------
const clientBytes = readPacked(`${PKG}/lib/client.js`);
mkdirSync(upstreamDir, { recursive: true });
writeFileSync(join(upstreamDir, 'client.orig.js'), clientBytes);
writeFileSync(join(ws, 'index.js'), readPacked(`${PKG}/lib/index.js`));
mkdirSync(join(ws, 'locale'), { recursive: true });
for (const file of listDir(`${PKG}/locale`)) {
  writeFileSync(join(ws, 'locale', file), readPacked(`${PKG}/locale/${file}`));
}
console.log(`\n已抽取上游 bundle（${clientBytes.length} 字节）到 upstream/client.orig.js`);

// 浏览器模块依赖必须与上游一致，否则模块图会拒绝挂载
const upstreamInject = JSON.stringify(upstreamManifest.dsh?.client?.inject ?? []);
const ourInject = JSON.stringify(ours.dsh?.client?.inject ?? []);
if (upstreamInject !== ourInject) {
  console.log('\n⚠ dsh.client.inject 与上游不一致：');
  console.log(`  上游: ${upstreamInject}`);
  console.log(`  我们: ${ourInject}`);
  console.log('  请手工同步 vendor/ui-workspace/package.json 后重跑。');
}

// --- 重新移植 + 测试 -------------------------------------------------------
execFileSync(process.execPath, [join(here, 'port-day-groups.mjs')], { stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'test', 'day-groups.test.mjs')], { stdio: 'inherit' });

if (!versionMatches) {
  console.log('\n下一步：把 vendor/ui-workspace/package.json 的 version 改成', upstreamManifest.version);
  console.log('        然后在 DSH 里重新安装这个 bundle，让它重新组合。');
}
console.log('\n完成。');
