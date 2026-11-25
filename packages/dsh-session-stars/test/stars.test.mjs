// 纯逻辑测试：直接 eval 产物里 stars-core 区域的源码，所以产物一旦漂移测试就失败。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '..', 'client.js'), 'utf8');

const start = bundle.indexOf('//#region stars-core');
const end = bundle.indexOf('//#endregion', start);
if (start === -1 || end === -1) throw new Error('stars-core region not found in client.js');
const region = bundle.slice(bundle.indexOf('\n', start) + 1, end);

const STORAGE_KEY = 'dsh.workspace.starred.v1';
const factory = new Function(
  'STORAGE_KEY',
  `${region}\nreturn { normalizeIds, toggleIn, readIds, writeIds };`,
);
const api = factory(STORAGE_KEY);

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    raw: map,
  };
}

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// --- normalizeIds：任何脏数据都必须退化成空数组，绝不能抛 ---
check('null reads as empty', api.normalizeIds(null), []);
check('array reads as empty', api.normalizeIds([]), []);
check('string reads as empty', api.normalizeIds('x'), []);
check('payload without ids', api.normalizeIds({ someOther: true }), []);
check('ids not an array', api.normalizeIds({ ids: 'not-an-array' }), []);
check('drops non-string and empty ids', api.normalizeIds({ ids: ['a', 3, '', null, 'b'] }), ['a', 'b']);
check('dedupes while keeping first order', api.normalizeIds({ ids: ['b', 'a', 'b'] }), ['b', 'a']);

// --- toggleIn：新加在最前，再点只移除自己 ---
check('adds to the front', api.toggleIn(['a'], 'b'), ['b', 'a']);
check('removes only the toggled id', api.toggleIn(['b', 'a'], 'a'), ['b']);
check('toggling from empty', api.toggleIn([], 'z'), ['z']);
check('does not mutate the input', (() => {
  const before = ['a'];
  api.toggleIn(before, 'b');
  return before;
})(), ['a']);

// --- readIds / writeIds：沿用 fork 时代的 storage key 与格式 ---
const storage = fakeStorage();
check('fresh storage has no stars', api.readIds(storage), []);

api.writeIds(storage, ['s2', 's1']);
check('write uses the documented key', [...storage.raw.keys()], [STORAGE_KEY]);
check('write payload keeps the ids shape', JSON.parse(storage.raw.get(STORAGE_KEY)), { ids: ['s2', 's1'] });
check('round trip', api.readIds(storage), ['s2', 's1']);

storage.setItem(STORAGE_KEY, '{"ids":["old"]}');
check('reads the legacy payload', api.readIds(storage), ['old']);

storage.setItem(STORAGE_KEY, 'not json at all');
check('malformed json reads as empty', api.readIds(storage), []);

// --- 存储不可用时不能把插件带崩 ---
const broken = {
  getItem: () => {
    throw new Error('storage disabled');
  },
  setItem: () => {
    throw new Error('storage disabled');
  },
};
check('read survives a throwing storage', api.readIds(broken), []);
let writeThrew = false;
try {
  api.writeIds(broken, ['x']);
} catch {
  writeThrew = true;
}
check('write swallows a throwing storage', writeThrew, false);

if (failures.length > 0) {
  console.error(`session stars logic: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('session stars logic: all checks passed');
