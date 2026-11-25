// 接线测试：在 node 里模拟 DSH 的浏览器模块环境，真实执行 client.js，
// 断言它注册到哪些槽位、注册参数是否正确、组件渲染出的结构是否如预期。
// 这一层专门挡住「slot 名字拼错 / 注册参数漏字段 / 组件崩溃」这类只能等到
// 重启 DSH 才发现的错误。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'client.js'), 'utf8');
const PKG = '@mrzhaobh/dsh-session-stars';

// --- 最小的 react / jsx-runtime 替身 -------------------------------------
const react = {
  // 组件在测试里被直接调用，不需要真实订阅：getSnapshot 就是当前状态。
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
const jsx = (type, props) => ({ type, props });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: Symbol.for('react.fragment') };
const modules = {
  react,
  'react/jsx-runtime': jsxRuntime,
};
const fakeRequire = (specifier) => {
  const found = modules[specifier];
  if (found === undefined) throw new Error(`unexpected require("${specifier}")`);
  return found;
};

// --- 最小的 localStorage 替身 -------------------------------------------
const map = new Map();
const localStorage = {
  getItem: (key) => (map.has(key) ? map.get(key) : null),
  setItem: (key, value) => map.set(key, String(value)),
  removeItem: (key) => map.delete(key),
};

// --- 加载 client.js ------------------------------------------------------
let loaded;
const fakeWindow = {
  localStorage,
  __ModuleLoader__: {
    load: (definition) => {
      loaded = definition;
    },
  },
};
// eslint-disable-next-line no-new-func
new Function('window', 'require', source)(fakeWindow, fakeRequire);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('the bundle registers exactly one module', loaded === undefined ? 0 : 1, 1);
check('module id equals the package name', loaded.id, PKG);

const api = loaded.factory(fakeRequire);
check('apply is exported', typeof api.apply, 'function');
check('declares the services it needs', api.inject, ['slots', 'locale']);

// --- 跑一遍 apply，记录它和 ctx 的交互 ----------------------------------
const registrations = [];
const dictionaries = [];
let effectCalls = 0;
const ctx = {
  effect: (thunk) => {
    effectCalls += 1;
    thunk();
    return () => {};
  },
  locale: {
    register: (namespace, dict) => {
      dictionaries.push({ namespace, dict });
      return () => {};
    },
  },
  slots: {
    inject: (name, callback) => {
      // 真实实现里 inject 在槽位声明之后才回调；这里直接同步回调。
      callback();
      return () => {};
    },
    register: (declaration, component) => {
      registrations.push({ declaration, component });
      return () => {};
    },
  },
};

api.apply(ctx);

check('registers dictionaries once', dictionaries.length, 1);
check('dictionary namespace', dictionaries[0]?.namespace, 'session-stars');
check('ships both languages', Object.keys(dictionaries[0]?.dict ?? {}).sort(), ['en', 'zh']);
check('every slot registration got a locale namespace', registrations.map((r) => r.declaration.locale), [
  'session-stars',
  'session-stars',
]);

const byName = new Map(registrations.map((r) => [r.declaration.name, r]));
check('registers into the hover slot', byName.has('sidebar.session.row.hover'), true);
check('registers into the trailing slot', byName.has('sidebar.session.row.trailing'), true);
check('does not touch leading (状态点会顶掉它)', byName.has('sidebar.session.row.leading'), false);
check('registers nothing else', registrations.length, 2);
check('hover entry id', byName.get('sidebar.session.row.hover')?.declaration.id, 'session-stars-toggle');
check('trailing entry id', byName.get('sidebar.session.row.trailing')?.declaration.id, 'session-stars-mark');
check('components are functions', registrations.map((r) => typeof r.component), ['function', 'function']);

// --- 组件行为 -----------------------------------------------------------
const t = (key) => key;
const toggle = byName.get('sidebar.session.row.hover').component;
const mark = byName.get('sidebar.session.row.trailing').component;

const beforeStar = toggle({ sessionId: 'session-a', t });
check('hover renders a button', beforeStar.type, 'button');
check('unstarred shows the hollow star', beforeStar.props.children, '☆');
check('unstarred label', beforeStar.props['aria-label'], 'star');
check('unstarred aria-pressed', beforeStar.props['aria-pressed'], false);
check('no mark before starring', mark({ sessionId: 'session-a', t }), null);

// 点一下：必须拦住冒泡（否则点星标会打开会话）
let prevented = 0;
let stopped = 0;
beforeStar.props.onClick({
  preventDefault: () => (prevented += 1),
  stopPropagation: () => (stopped += 1),
});
check('click prevents the row navigation', prevented, 1);
check('click stops propagation', stopped, 1);

const afterStar = toggle({ sessionId: 'session-a', t });
check('starred shows the solid star', afterStar.props.children, '★');
check('starred label', afterStar.props['aria-label'], 'unstar');
check('starred aria-pressed', afterStar.props['aria-pressed'], true);

const starredMark = mark({ sessionId: 'session-a', t });
check('mark appears after starring', starredMark?.props?.children, '🌟');
check('mark carries an accessible label', starredMark?.props?.['aria-label'], 'starred');
check('other rows stay unmarked', mark({ sessionId: 'session-b', t }), null);
check('other rows stay unstarred', toggle({ sessionId: 'session-b', t }).props.children, '☆');

// 状态写进了文档约定的那个 key，且格式是 { ids: [...] }
check('persists under the documented key', [...map.keys()], ['dsh.workspace.starred.v1']);
check('persisted payload', JSON.parse(map.get('dsh.workspace.starred.v1')), { ids: ['session-a'] });

// 再点一次取消
afterStar.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
check('toggling off removes the mark', mark({ sessionId: 'session-a', t }), null);
check('toggling off restores the hollow star', toggle({ sessionId: 'session-a', t }).props.children, '☆');
check('removal is persisted', JSON.parse(map.get('dsh.workspace.starred.v1')), { ids: [] });

// 空 sessionId 不应写入垃圾数据
toggle({ sessionId: '', t }).props.onClick({ preventDefault: () => {}, stopPropagation: () => {} });
check('empty session id is ignored', JSON.parse(map.get('dsh.workspace.starred.v1')), { ids: [] });

if (failures.length > 0) {
  console.error(`session stars wiring: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('session stars wiring: all checks passed');
