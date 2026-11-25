// 切换器的接线与行为测试。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const PKG = '@mrzhaobh/dsh-sidebar-switch';
const TARGET = '@mrzhaobh/dsh-sidebar-day';

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

let hookCursor = 0;
let hookStore = [];
const react = {
  useState: (init) => {
    const slot = hookCursor++;
    if (!(slot in hookStore)) hookStore[slot] = typeof init === 'function' ? init() : init;
    return [hookStore[slot], (value) => { hookStore[slot] = value; }];
  },
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: Symbol.for('react.fragment') };
const modules = { react, 'react/jsx-runtime': jsxRuntime };
const fakeRequire = (specifier) => {
  const found = modules[specifier];
  if (found === undefined) throw new Error(`unexpected require("${specifier}")`);
  return found;
};

let loaded;
// eslint-disable-next-line no-new-func
new Function('window', 'require', source)(
  { localStorage: { getItem: () => null, setItem: () => {} }, __ModuleLoader__: { load: (d) => { loaded = d; } } },
  fakeRequire,
);

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

// --- mock ctx ---------------------------------------------------------------
const dictionaries = [];
const registrations = [];
const calls = { setPluginEnabled: [], listBundles: 0, subscribed: [], access: [] };
let bundleEntry = { name: TARGET, enabled: true, rows: [{ rowId: 'sidebar-day', entryId: 'include:sidebar-day' }] };

const ctx = {
  effect: (thunk) => {
    thunk();
    return () => {};
  },
  locale: {
    register: (namespace, dict) => {
      dictionaries.push({ namespace, dict });
      return () => {};
    },
    bind: (namespace) => (key) => dictionaries.find((d) => d.namespace === namespace)?.dict.zh?.[key] ?? key,
  },
  remoteAccess: {
    whenAccess: (name, generator) => {
      calls.access.push(name);
      const iterator = generator();
      let step = iterator.next();
      while (step.done !== true) step = iterator.next();
    },
  },
  remote: {
    $on: (name) => {
      calls.subscribed.push(name);
      return () => {};
    },
    pluginManager: {
      listBundles: async () => {
        calls.listBundles += 1;
        return { ok: true, value: { entries: bundleEntry === undefined ? [] : [bundleEntry] } };
      },
      setPluginEnabled: async (entryId, enabled) => {
        calls.setPluginEnabled.push({ entryId, enabled });
        bundleEntry = { ...bundleEntry, enabled };
        return { ok: true, value: { application: 'applied' } };
      },
    },
  },
  slots: {
    inject: (name, callback) => { callback(); return () => {}; },
    register: (declaration, component) => {
      registrations.push({ declaration, component });
      return () => {};
    },
  },
};

api.apply(ctx);
await new Promise((resolve) => setTimeout(resolve, 20));

check('ships both languages', Object.keys(dictionaries[0]?.dict ?? {}).sort(), ['en', 'zh']);
check('gates on the listBundles permission', calls.access, ['pluginManager/listBundles']);
check('subscribes to plugin-manager/changed', calls.subscribed, ['plugin-manager/changed']);
check('reads the bundle list on activate', calls.listBundles, 1);
check('registers exactly one slot entry', registrations.length, 1);
check('mounted in the sidebar footer', registrations[0].declaration.name, 'sidebar.footer.action');
check('entry id', registrations[0].declaration.id, 'sidebar-switch');

// --- 渲染与点击 -------------------------------------------------------------
const render = () => {
  hookCursor = 0;
  hookStore = [];
  return registrations[0].component({});
};
const textOf = (node, out = []) => {
  if (node === null || node === undefined) return out;
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { for (const child of node) textOf(child, out); return out; }
  if (typeof node === 'object') textOf(node.props?.children, out);
  return out;
};

let tree = render();
check('button reflects the day mode', tree.props['data-sidebar-switch'], 'day');
check('button shows the current mode', textOf(tree).includes('按天分组'), true);
check('hint tells you what clicking does', tree.props.title, '切回官方会话列表');

// 点击 → 禁用目标行
tree.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 20));
check('clicking disables the row behind the scenes', calls.setPluginEnabled, [{ entryId: 'include:sidebar-day', enabled: false }]);

tree = render();
check('button flips to the official mode', tree.props['data-sidebar-switch'], 'official');
check('button shows the official label', textOf(tree).includes('官方列表'), true);

// 再点 → 启用目标行
tree.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 20));
check('clicking again re-enables it', calls.setPluginEnabled[1], { entryId: 'include:sidebar-day', enabled: true });

// 目标包不存在时不崩，按钮降级
registrations.length = 0;
bundleEntry = undefined;
const bareApi = loaded.factory(fakeRequire);
bareApi.apply({ ...ctx, slots: { inject: (n, cb) => { cb(); return () => {}; }, register: (d, c) => { registrations.push({ declaration: d, component: c }); return () => {}; } } });
await new Promise((resolve) => setTimeout(resolve, 20));
hookCursor = 0; hookStore = [];
const bareTree = registrations[0].component({});
check('missing target degrades instead of throwing', bareTree.props['data-sidebar-switch'], 'official');
check('missing target still renders a label', textOf(bareTree).length > 0, true);

if (failures.length > 0) {
  console.error(`sidebar-switch: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('sidebar-switch: all checks passed');
