// 接线测试：在 node 里模拟 DSH 浏览器环境执行 client.js，验证
//   apply 注册了哪个 tab、拉数据的调用长什么样、分组渲染与折叠是否工作。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const PKG = '@mrzhaobh/dsh-plugin-sources';

const react = { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() };
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: Symbol.for('react.fragment') };
const modules = { react, 'react/jsx-runtime': jsxRuntime };
const fakeRequire = (specifier) => {
  const found = modules[specifier];
  if (found === undefined) throw new Error(`unexpected require("${specifier}")`);
  return found;
};

const map = new Map();
// 每份 client.js 实例共用同一个 localStorage，模拟真实页面
const localStorage = {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  setItem: (key, value) => map.set(key, String(value)),
};

/** 加载一份全新的 client.js 实例（独立模块级 store）。 */
function boot() {
  let loaded;
  // eslint-disable-next-line no-new-func
  new Function('window', 'require', source)(
    { localStorage, __ModuleLoader__: { load: (definition) => { loaded = definition; } } },
    fakeRequire,
  );
  return loaded;
}

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** 把函数组件展开成宿主元素树，这样才能检查真正渲染出的 onClick / 文案。 */
function expand(node) {
  if (node === null || node === undefined) return node;
  if (typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(expand);
  const { type, props } = node;
  if (typeof type === 'function') return expand(type(props));
  return { type, props: { ...props, children: expand(props?.children) } };
}
const collect = (node, predicate, out = []) => {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) { for (const child of node) collect(child, predicate, out); return out; }
  if (typeof node === 'object') {
    if (predicate(node)) out.push(node);
    collect(node.props?.children, predicate, out);
  }
  return out;
};
const textOf = (node, out = []) => {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { for (const child of node) textOf(child, out); return out; }
  if (typeof node === 'object') textOf(node.props?.children, out);
  return out;
};

// --- mock ctx ------------------------------------------------------------
const dicts = {};

function makeCtx(state) {
  const stats = { registrations: [], accessGates: [], subscribed: [], listCalls: 0 };
  const ctx = {
    effect: (thunk) => {
      thunk();
      return () => {};
    },
    locale: {
      register: (namespace, dict) => {
        dicts[namespace] = dict;
        return () => {};
      },
      bind: (namespace) => (key) => dicts[namespace]?.zh?.[key] ?? key,
    },
    remoteAccess: {
      whenAccess: (name, generator) => {
        stats.accessGates.push(name);
        const iterator = generator();
        let step = iterator.next();
        while (step.done !== true) step = iterator.next();
      },
    },
    remote: {
      $on: (name) => {
        stats.subscribed.push(name);
        return () => {};
      },
      pluginManager: {
        listBundles: async () => {
          stats.listCalls += 1;
          return state.result;
        },
      },
    },
    slots: {
      inject: (name, callback) => {
        callback();
        return () => {};
      },
      register: (declaration, component) => {
        stats.registrations.push({ declaration, component });
        return () => {};
      },
    },
  };
  return { ctx, stats };
}

const BUNDLES = [
  { name: 'dsh-balance', version: '0.2.9', source: 'dsh-balance@0.2.9', enabled: true },
  { name: 'dsh-baton-host', version: '0.6.13', source: 'dsh-baton-host@0.6.13', enabled: true },
  {
    name: '@v3887023/dsh-deepseek-balance',
    version: '0.1.1',
    source: 'github:v3887023/dsh-plugins#2fc628c7&path:/packages/dsh-deepseek-balance',
    enabled: true,
  },
  {
    name: '@v3887023/dsh-noir-skin',
    version: '1.0.1',
    source: 'github:v3887023/dsh-plugins#5e413ccd&path:/packages/dsh-noir-skin',
    enabled: true,
  },
  { name: '@mrzhaobh/dsh-session-stars', version: '1.0.0', source: 'link:J:/x', enabled: true },
  { name: '@deepseek-ai/dsh-base', version: '0.2.2-rc.5', availability: 'installation', enabled: true },
];

// --- 正常路径 ------------------------------------------------------------
const loaded = boot();
check('module id equals the package name', loaded?.id, PKG);
const api = loaded.factory(fakeRequire);
check('apply exported', typeof api.apply, 'function');
check('declares the services it needs', api.inject, [
  'slots',
  'locale',
  'remote',
  'remote.pluginManager',
  'remoteAccess',
]);

const healthy = makeCtx({ result: { ok: true, value: { entries: BUNDLES, total: BUNDLES.length, nextOffset: null } } });
api.apply(healthy.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));

check('registers exactly one tab', healthy.stats.registrations.length, 1);
const tab = healthy.stats.registrations[0];
check('registers into plugins.tab', tab.declaration.name, 'plugins.tab');
check('tab id', tab.declaration.id, 'plugin-sources');
check('tab locale namespace', tab.declaration.locale, 'plugin-sources');
check('tab label resolves through the dictionary', tab.declaration.label(), '按来源');
check('gates on the listBundles permission', healthy.stats.accessGates, ['pluginManager/listBundles']);
check('subscribes to plugin-manager/changed', healthy.stats.subscribed, ['plugin-manager/changed']);
check('reads the bundle list once on activate', healthy.stats.listCalls, 1);

const t = (key) => dicts['plugin-sources']?.zh?.[key] ?? key;
const opened = [];
const props = { t, openPackage: (name) => opened.push(name) };
const tree = expand(tab.component(props));

const allText = textOf(tree);
check('renders every installed plugin name', BUNDLES.every((b) => allText.includes(b.name)), true);
check('renders the built-in group title', allText.includes('安装自带'), true);
check('renders the registry group title', allText.includes('npm registry'), true);
check('renders the local group title', allText.includes('本地目录'), true);
check('renders repo groups by owner/repo', allText.includes('v3887023/dsh-plugins'), true);
check('renders the group counts', allText.includes('2') && allText.includes('1'), true);

const headers = collect(tree, (node) => node.type === 'button' && node.props?.['aria-expanded'] !== undefined);
// 四组：github:v3887023/dsh-plugins(2) / registry(2) / built-in(1) / local(1)
check('one header per group', headers.length, 4);
check('all groups start expanded', headers.map((h) => h.props['aria-expanded']), [true, true, true, true]);

const rows = collect(tree, (node) => node.type === 'div' && node.props?.role === 'button');
check('one row per bundle', rows.length, BUNDLES.length);

rows[0].props.onClick();
check('clicking a row opens that package', opened.length, 1);

// 空态
const emptyLoaded = boot();
const emptyApi = emptyLoaded.factory(fakeRequire);
const empty = makeCtx({ result: { ok: true, value: { entries: [] } } });
emptyApi.apply(empty.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));
const emptyText = textOf(expand(empty.stats.registrations[0].component(props)));
check('empty list shows the empty state', emptyText.includes('没有已安装的插件'), true);

// 失败态
const failLoaded = boot();
const failApi = failLoaded.factory(fakeRequire);
const failing = makeCtx({ result: { ok: false, error: { message: 'boom' } } });
failApi.apply(failing.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));
const failText = textOf(expand(failing.stats.registrations[0].component(props)).props?.children ?? []);
check('failure is shown instead of throwing', failText.join(' ').includes('boom'), true);

// --- 折叠 --------------------------------------------------------------
localStorage.setItem('dsh.pluginSources.collapsed.v1', '{"keys":[]}');
const foldLoaded = boot();
const foldApi = foldLoaded.factory(fakeRequire);
const fold = makeCtx({ result: { ok: true, value: { entries: BUNDLES } } });
foldApi.apply(fold.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));
const foldTab = fold.stats.registrations[0];

const foldTree = expand(foldTab.component(props));
const foldHeaders = collect(foldTree, (node) => node.type === 'button' && node.props?.['aria-expanded'] !== undefined);
check('all four groups render expanded', foldHeaders.length, 4);

// 折第三个组（顺序按数量降序：github(2) / registry(2) / built-in(1) / local(1)）
const target = foldHeaders[3];
const targetLabel = textOf(target).join(' ');
target.props.onClick();

const afterCollapse = expand(foldTab.component(props));
const afterText = textOf(afterCollapse);
check(`collapsing "${targetLabel}" hides its rows`, afterText.length < textOf(foldTree).length, true);
check(
  'collapsed state is persisted',
  JSON.parse(localStorage.getItem('dsh.pluginSources.collapsed.v1')).keys.length,
  1,
);

const restoredHeader = collect(
  afterCollapse,
  (node) => node.type === 'button' && node.props?.['aria-expanded'] === false,
)[0];
restoredHeader.props.onClick();
check(
  'expanding restores the rows',
  textOf(expand(foldTab.component(props))).length,
  textOf(foldTree).length,
);

if (failures.length > 0) {
  console.error(`plugin sources wiring: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('plugin sources wiring: all checks passed');
