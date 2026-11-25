// 纯逻辑测试：直接 eval 产物里 group-core 区域的源码，产物漂移就失败。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '..', 'client.js'), 'utf8');

const start = bundle.indexOf('//#region group-core');
const end = bundle.indexOf('//#endregion', start);
if (start === -1 || end === -1) throw new Error('group-core region not found in client.js');
const region = bundle.slice(bundle.indexOf('\n', start) + 1, end);

const COLLAPSED_KEY = 'dsh.pluginSources.collapsed.v1';
const factory = new Function(
  'COLLAPSED_KEY',
  `${region}\nreturn { FIXED_GROUPS, groupKeyOf, groupTitleOf, groupEntries, readCollapsed, writeCollapsed };`,
);
const api = factory(COLLAPSED_KEY);

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    raw: map,
  };
}

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// --- groupKeyOf：真实的 pnpm spec 形态 ---
check(
  'github spec with commit and path folds into owner/repo',
  api.groupKeyOf({ source: 'github:v3887023/dsh-plugins#2fc628c7&path:/packages/dsh-deepseek-balance' }),
  'github:v3887023/dsh-plugins',
);
check(
  'bare github spec',
  api.groupKeyOf({ source: 'github:qingmomo233/dsh-thinking-language' }),
  'github:qingmomo233/dsh-thinking-language',
);
check('registry spec', api.groupKeyOf({ source: 'dsh-balance@0.2.9' }), 'registry');
check('registry range spec', api.groupKeyOf({ source: 'dsh-free-search@^0.9.57' }), 'registry');
check('own-repo link spec is tagged local', api.groupKeyOf({ source: 'link:J:/myProject/dsh-plugins/packages/dsh-session-stars' }), 'local:MrZhaobh/dsh-plugins');
check('other link spec stays plain local', api.groupKeyOf({ source: 'link:D:/other/thing' }), 'local');
check('own-repo link title marks itself local', api.groupTitleOf('local:MrZhaobh/dsh-plugins'), 'MrZhaobh/dsh-plugins（本地）');
check('file spec', api.groupKeyOf({ source: 'file:../x' }), 'local');
check('raw git url', api.groupKeyOf({ source: 'git+https://github.com/a/b.git#abc' }), 'git');
check('gitlab spec', api.groupKeyOf({ source: 'gitlab:a/b#c' }), 'gitlab:a/b');
check(
  'installation-provided bundle without source',
  api.groupKeyOf({ name: '@deepseek-ai/dsh-base', availability: 'installation' }),
  'built-in',
);
check('official without availability', api.groupKeyOf({ name: 'x', official: true }), 'built-in');
check('profile bundle without source falls to unknown', api.groupKeyOf({ name: 'x', availability: 'profile' }), 'unknown');
check('null entry does not throw', api.groupKeyOf(null), 'unknown');
check('empty source string', api.groupKeyOf({ source: '' }), 'unknown');

// --- groupTitleOf ---
check('fixed group keeps its id for the dictionary', api.groupTitleOf('registry'), 'registry');
check('repo group drops its prefix', api.groupTitleOf('github:v3887023/dsh-plugins'), 'v3887023/dsh-plugins');

// --- groupEntries：分组、组内名称序、组间数量降序 ---
const entries = [
  { name: 'b', source: 'github:o/r#1' },
  { name: 'a', source: 'github:o/r#1' },
  { name: 'z', source: 'dsh-balance@1.0.0' },
  { name: 'c', source: 'github:o/r#1' },
  { name: 'y', source: 'dsh-baton-host@0.6.13' },
  { name: 'base', availability: 'installation' },
];
const groups = api.groupEntries(entries);
check('group order is by count desc', groups.map((g) => g.key), ['github:o/r', 'registry', 'built-in']);
check('group counts', groups.map((g) => g.count), [3, 2, 1]);
check('entries inside a group are sorted by name', groups[0].entries.map((e) => e.name), ['a', 'b', 'c']);
check('empty input', api.groupEntries([]), []);
check('non-array input', api.groupEntries(null), []);

// --- 折叠状态 ---
const storage = fakeStorage();
check('fresh storage has nothing collapsed', api.readCollapsed(storage), []);
api.writeCollapsed(storage, ['registry', 'github:o/r']);
check('write uses the documented key', [...storage.raw.keys()], [COLLAPSED_KEY]);
check('round trip', api.readCollapsed(storage), ['registry', 'github:o/r']);
storage.setItem(COLLAPSED_KEY, 'garbage');
check('malformed json reads as empty', api.readCollapsed(storage), []);
storage.setItem(COLLAPSED_KEY, '{"keys":"nope"}');
check('non-array keys reads as empty', api.readCollapsed(storage), []);
check('null storage reads as empty', api.readCollapsed(null), []);

const broken = {
  getItem: () => {
    throw new Error('disabled');
  },
  setItem: () => {
    throw new Error('disabled');
  },
};
check('read survives a throwing storage', api.readCollapsed(broken), []);
let threw = false;
try {
  api.writeCollapsed(broken, ['x']);
} catch {
  threw = true;
}
check('write swallows a throwing storage', threw, false);

if (failures.length > 0) {
  console.error(`plugin sources groups: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('plugin sources groups: all checks passed');

