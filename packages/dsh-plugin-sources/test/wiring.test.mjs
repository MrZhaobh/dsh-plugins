// 接线测试：在 node 里模拟 DSH 浏览器环境执行 client.js，验证
//   apply 注册了哪个 tab、只列已安装插件、卡片内容、启停与卸载、折叠、空态与失败态。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const PKG = '@mrzhaobh/dsh-plugin-sources';

const react = {
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useState: (initial) => [initial, () => {}],
};
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
const hasClass = (node, name) => {
  const className = node?.props?.className;
  return typeof className === 'string' && className.split(/\s+/u).includes(name);
};

// --- mock ctx ------------------------------------------------------------
const dicts = {};

/** 与真实 locale.bind 一致的取词：字符串模板 + {name} 插值。 */
function translate(namespace, key, params) {
  const template = dicts[namespace]?.zh?.[key] ?? key;
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/gu, (all, name) => (params[name] === undefined ? all : String(params[name])));
}

function makeCtx(bundles, overrides = {}) {
  const stats = { registrations: [], accessGates: [], subscribed: [], listCalls: 0, calls: [] };
  const state = { bundles: bundles.map((bundle) => ({ ...bundle })) };
  const answer = overrides.answer;
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
      bind: (namespace) => (key, params) => translate(namespace, key, params),
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
          return { ok: true, value: state.bundles };
        },
        setBundleEnabled: async (name, enabled) => {
          stats.calls.push(['setBundleEnabled', name, enabled]);
          state.bundles = state.bundles.map((bundle) => (bundle.name === name ? { ...bundle, enabled } : bundle));
          return { ok: true, value: answer ?? { changed: true, application: 'applied', stage: 'enable', target: name } };
        },
        removeBundle: async (name) => {
          stats.calls.push(['removeBundle', name]);
          state.bundles = state.bundles.filter((bundle) => bundle.name !== name);
          return { ok: true, value: answer ?? { changed: true, application: 'applied', stage: 'remove', target: name } };
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
  return { ctx, stats, state };
}

// 已安装的 5 个（registry 2 / github 2 / 本地 1）+ 2 个未安装的内置 bundle。
const BUNDLES = [
  {
    name: 'dsh-balance',
    version: '0.2.9',
    source: 'dsh-balance@0.2.9',
    enabled: true,
    installed: true,
    removable: true,
    meta: { title: 'DeepSeek 余额', description: { zh: '在输入框下方显示余额', en: 'Shows the balance' } },
  },
  {
    name: 'dsh-baton-host',
    version: '0.6.13',
    source: 'dsh-baton-host@0.6.13',
    enabled: false,
    installed: true,
    removable: true,
    description: 'Hand coding tasks to DSH',
  },
  {
    name: '@v3887023/dsh-desktop-notify',
    version: '3.0.1',
    source: 'github:v3887023/dsh-plugins#897b04&path:/packages/dsh-desktop-notify',
    enabled: true,
    installed: true,
    removable: true,
    meta: { title: '桌面通知', description: { zh: '会话完成时弹卡片' } },
  },
  {
    name: '@v3887023/dsh-litellm-usage',
    version: '1.0.1',
    source: 'github:v3887023/dsh-plugins#6f7683d&path:/packages/dsh-litellm-usage',
    enabled: true,
    installed: true,
    removable: true,
  },
  {
    name: '@mrzhaobh/dsh-session-stars',
    version: '1.1.0',
    source: 'link:J:/myProject/dsh-plugins/packages/dsh-session-stars',
    enabled: true,
    installed: true,
    removable: true,
  },
  { name: '@deepseek-ai/dsh-base', version: '0.2.2-rc.5', availability: 'installation', enabled: true, installed: false, removable: false },
  {
    name: '@deepseek-ai/dsh-experimental-voice-input-bundle',
    version: '0.2.2-rc.5',
    availability: 'installation',
    official: true,
    enabled: false,
    installed: false,
    removable: false,
  },
];

const props = (namespace = 'plugin-sources') => ({
  t: (key, params) => translate(namespace, key, params),
  openPackage: (name) => opened.push(name),
});
const opened = [];

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

const healthy = makeCtx(BUNDLES);
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

const pageProps = props();
const render = () => expand(tab.component(pageProps));
const tree = render();
const allText = textOf(tree).join(' ');

// 只列已安装：两个未安装的内置 bundle 不出现
check('lists every installed plugin', BUNDLES.filter((b) => b.installed).every((b) => allText.includes(b.name)), true);
check('leaves out bundles that are not installed', allText.includes('dsh-base'), false);
check('leaves out an unselected shipped bundle', allText.includes('voice-input'), false);
check('renders one card per installed plugin', collect(tree, (node) => hasClass(node, 'dsh-plugin-sources-card')).length, 5);

// 卡片内容：标题、简介、版本、来源
check('renders the localized title', allText.includes('DeepSeek 余额'), true);
check('renders the localized description', allText.includes('在输入框下方显示余额'), true);
check('renders the raw description fallback', allText.includes('Hand coding tasks to DSH'), true);
check('renders the version and source line', allText.includes('v0.2.9 · dsh-balance · dsh-balance@0.2.9'), true);
check('compacts hosted sources', allText.includes('github:v3887023/dsh-plugins'), true);
check('shows the running state', allText.includes('运行中'), true);
check('shows the disabled state', allText.includes('已停用'), true);
check('shows the removable badge', allText.includes('可卸载'), true);

// 分组标题与数量
check('renders the registry group title', allText.includes('npm registry'), true);
check('renders repo groups by owner/repo', allText.includes('v3887023/dsh-plugins'), true);
check('renders the own-repo local group', allText.includes('MrZhaobh/dsh-plugins（本地）'), true);

const headers = collect(tree, (node) => node.type === 'button' && node.props?.['aria-expanded'] !== undefined);
check('one header per group', headers.length, 3);
check('all groups start expanded', headers.map((h) => h.props['aria-expanded']), [true, true, true]);

// 点标题打开详情
const titles = collect(tree, (node) => hasClass(node, 'dsh-plugin-sources-title') && node.type === 'button');
titles[0].props.onClick();
check('clicking a title opens that package', opened.length, 1);

// 开关：state 里 enabled 的走 disable，反之 enable
const cardOf = (root, name) => collect(root, (node) => node.props?.['data-plugin-sources-package'] === name)[0];
const switchOf = (root, name) => collect(cardOf(root, name), (node) => node.props?.role === 'switch')[0];
const uninstallOf = (root, name) => collect(cardOf(root, name), (node) => hasClass(node, 'dsh-plugin-sources-uninstall'))[0];
const switches = collect(tree, (node) => node.props?.role === 'switch');
check('one switch per card', switches.length, 5);
const balanceSwitch = switchOf(tree, 'dsh-balance');
check('switch reflects the bundle state', balanceSwitch.props['aria-checked'], true);
balanceSwitch.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 20));
check('turning a switch off calls setBundleEnabled', healthy.stats.calls[0], ['setBundleEnabled', 'dsh-balance', false]);
check('the card follows the Host answer', textOf(cardOf(render(), 'dsh-balance')).join(' ').includes('已停用'), true);
check('a disabled bundle can be switched on again', switchOf(render(), 'dsh-baton-host').props['aria-checked'], false);

// 卸载：先确认，再调 removeBundle
const before = healthy.stats.calls.length;
const uninstall = uninstallOf(render(), 'dsh-balance');
check('every removable card offers uninstall', uninstall !== undefined, true);
uninstall.props.onClick();
const dialog = collect(render(), (node) => node.props?.role === 'dialog')[0];
check('uninstall asks for confirmation first', dialog !== undefined, true);
check('confirmation names the plugin', textOf(dialog).join(' ').includes('DeepSeek 余额'), true);
check('no removal before confirmation', healthy.stats.calls.length, before);
const confirmButton = collect(dialog, (node) => hasClass(node, 'dsh-plugin-sources-dialog-button') && node.props?.['data-primary'] === 'true')[0];
confirmButton.props.onClick();
await new Promise((resolve) => setTimeout(resolve, 20));
check('confirmation removes the bundle', healthy.stats.calls[before], ['removeBundle', 'dsh-balance']);
check('the removed plugin leaves the list', textOf(render()).join(' ').includes('DeepSeek 余额'), false);

// 空态：全部未安装
const emptyLoaded = boot();
const emptyApi = emptyLoaded.factory(fakeRequire);
const empty = makeCtx([BUNDLES[5]]);
emptyApi.apply(empty.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));
const emptyText = textOf(expand(empty.stats.registrations[0].component(props()))).join(' ');
check('empty list shows the empty state', emptyText.includes('没有已安装的插件'), true);

// 失败态
const failLoaded = boot();
const failApi = failLoaded.factory(fakeRequire);
const failing = makeCtx([]);
failing.ctx.remote.pluginManager.listBundles = async () => ({ ok: false, error: { message: 'boom' } });
failApi.apply(failing.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));
const failText = textOf(expand(failing.stats.registrations[0].component(props()))).join(' ');
check('failure is shown instead of throwing', failText.includes('boom'), true);

// 需要重启的改动给出提示
const restartLoaded = boot();
const restartApi = restartLoaded.factory(fakeRequire);
const restarting = makeCtx(BUNDLES, { answer: { changed: true, application: 'restart-required', restartReason: 'no-hmr', stage: 'enable', target: 'dsh-balance' } });
restartApi.apply(restarting.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));
const restartTab = restarting.stats.registrations[0];
const restartProps = props();
const restartTree = expand(restartTab.component(restartProps));
collect(restartTree, (node) => node.props?.role === 'switch')[0].props.onClick();
await new Promise((resolve) => setTimeout(resolve, 20));
const restartText = textOf(expand(restartTab.component(restartProps))).join(' ');
check('a change that needs a restart says so', restartText.includes('重启 DSH 后生效'), true);
check('the restart notice names the reason', restartText.includes('只在启动时应用改动'), true);

// --- 折叠 --------------------------------------------------------------
localStorage.setItem('dsh.pluginSources.collapsed.v2', '{"keys":[]}');
const foldLoaded = boot();
const foldApi = foldLoaded.factory(fakeRequire);
const fold = makeCtx(BUNDLES);
foldApi.apply(fold.ctx);
await new Promise((resolve) => setTimeout(resolve, 20));
const foldTab = fold.stats.registrations[0];
const foldProps = props();

const foldTree = expand(foldTab.component(foldProps));
const foldHeaders = collect(foldTree, (node) => node.type === 'button' && node.props?.['aria-expanded'] !== undefined);
check('all three groups render expanded', foldHeaders.length, 3);

// 折第三个组（顺序按数量降序：registry(2) / github(2) / local(1)）
const target = foldHeaders[2];
target.props.onClick();
const afterCollapse = expand(foldTab.component(foldProps));
check('collapsing a group hides its cards', collect(afterCollapse, (node) => hasClass(node, 'dsh-plugin-sources-card')).length, 4);
check(
  'collapsed state is persisted',
  JSON.parse(localStorage.getItem('dsh.pluginSources.collapsed.v2')).keys.length,
  1,
);

const restoredHeader = collect(
  afterCollapse,
  (node) => node.type === 'button' && node.props?.['aria-expanded'] === false,
)[0];
restoredHeader.props.onClick();
check(
  'expanding restores the cards',
  collect(expand(foldTab.component(foldProps)), (node) => hasClass(node, 'dsh-plugin-sources-card')).length,
  5,
);

if (failures.length > 0) {
  console.error(`plugin sources wiring: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('plugin sources wiring: all checks passed');
