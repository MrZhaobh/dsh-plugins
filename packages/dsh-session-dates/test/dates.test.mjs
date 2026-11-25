// 日期标签的逻辑与接线测试：真实执行 client.js，验证日期折叠和槽位注册。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const PKG = '@mrzhaobh/dsh-session-dates';

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

// --- 最小 react / jsx / store 替身 -----------------------------------------
const react = { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot() };
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
check('declares the services it needs', api.inject, ['slots', 'locale', 'sessions']);

// --- 起 ctx，跑 apply ------------------------------------------------------
const dictionaries = [];
const registrations = [];
let sessionState = { byId: {}, ids: [] };
const list = {
  getSnapshot: () => sessionState,
  subscribe: () => () => {},
};
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
  },
  get: (name) => (name === 'sessions' ? { list } : undefined),
  slots: {
    inject: (name, callback) => { callback(); return () => {}; },
    register: (declaration, component) => {
      registrations.push({ declaration, component });
      return () => {};
    },
  },
};

api.apply(ctx);

check('ships both languages', Object.keys(dictionaries[0]?.dict ?? {}).sort(), ['en', 'zh']);
check('registers exactly one slot entry', registrations.length, 1);
const entry = registrations[0];
check('hooks the row trailing slot', entry.declaration.name, 'sidebar.session.row.trailing');
check('entry id', entry.declaration.id, 'session-dates');
check('carries the locale namespace', entry.declaration.locale, 'session-dates');
check('component is a function', typeof entry.component, 'function');

// --- 日期折叠（通过组件渲染验证）------------------------------------------
const t = (key, params) => {
  const dict = dictionaries[0].dict.zh;
  const template = dict[key] ?? key;
  if (params === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
};
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 11, 17, 15);

const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(NOW);
    else super(...args);
  }
  static now() { return NOW; }
};

const labelFor = (updatedAt) => {
  sessionState = { byId: { s1: { id: 's1', updatedAt } }, ids: ['s1'] };
  const node = entry.component({ sessionId: 's1', t });
  return node === null ? null : node.props.children;
};

check('today', labelFor(at(2026, 11, 17, 1)), '今天');
check('yesterday', labelFor(at(2026, 11, 16, 23)), '昨天');
check('this year', labelFor(at(2026, 11, 14)), '11月14日');
check('other year', labelFor(at(2025, 12, 31)), '2025年12月31日');
check('invalid timestamp renders nothing', labelFor(Number.NaN), null);

// 未知会话不渲染
sessionState = { byId: {}, ids: [] };
check('unknown session renders nothing', entry.component({ sessionId: 'nope', t }), null);

// 没有 sessions 服务时不能崩
const bareCtx = { ...ctx, get: () => undefined, slots: { inject: (n, cb) => { cb(); return () => {}; }, register: () => () => {} }, locale: { register: () => () => {} } };
let threw = false;
try { api.apply(bareCtx); } catch { threw = true; }
check('missing sessions service does not throw', threw, false);

globalThis.Date = RealDate;

if (failures.length > 0) {
  console.error(`session-dates: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('session-dates: all checks passed');
