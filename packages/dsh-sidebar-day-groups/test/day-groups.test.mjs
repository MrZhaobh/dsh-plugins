// 按天分组的纯逻辑测试：从打过移植的 client.js 里抠出 day-groups 区域直接 eval，
// 产物一旦漂移或移植失效，这里先失败。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, '..', 'vendor', 'ui-workspace', 'client.js');
const bundle = readFileSync(bundlePath, 'utf8');

const START = '//#region day-groups';
const END = '//#endregion day-groups';
const start = bundle.indexOf(START);
const end = bundle.indexOf(END, start);
if (start === -1 || end === -1) {
  throw new Error('day-groups region not found — 先跑 node scripts/port-day-groups.mjs');
}
const region = bundle.slice(bundle.indexOf('\n', start) + 1, end);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

/** 上游 stubs：只保留 deriveDaySections 依赖的那几个。 */
const makeApi = (groupBy) => {
  const storage = {
    getItem: (key) =>
      key === 'dsh.workspace.view.v5' ? JSON.stringify({ groupBy, orderBy: 'updated', groupExpansion: {} }) : null,
    setItem: () => {},
  };
  const fakeWindow = { localStorage: storage };
  const mainSessionId = (list) => list.ids[0];
  const sessionVisible = () => true;
  const sectionMembers = (members) => members;
  const sessionNode = (session) => ({ id: session.id, updatedAt: session.updatedAt, title: session.title ?? '' });
  // eslint-disable-next-line no-new-func
  const factory = new Function(
    'window',
    'mainSessionId',
    'sessionVisible',
    'sectionMembers',
    'sessionNode',
    `${region}\nreturn { deriveDaySections, __dayKey, __dayLabel, __dayGroupBy };`,
  );
  return factory(fakeWindow, mainSessionId, sessionVisible, sectionMembers, sessionNode);
};

const api = makeApi('day');

// --- 读当前分组方式 ---
check('reads day from the persisted view store', api.__dayGroupBy(), 'day');
check('reads workspace too', makeApi('workspace').__dayGroupBy(), 'workspace');
check('missing key reads as undefined', makeApi(undefined).__dayGroupBy(), undefined);

// --- 日期键 ---
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
check('day key pads month and day', api.__dayKey(at(2026, 1, 5)), '2026-01-05');
check('day key on an invalid timestamp', api.__dayKey(Number.NaN), 'unknown');

// --- 日期标签（把 now 固定在 2026-11-17） ---
const now = at(2026, 11, 17, 15);
check('today', api.__dayLabel(at(2026, 11, 17, 0), now), '今天');
check('today late hour', api.__dayLabel(at(2026, 11, 17, 23), now), '今天');
check('yesterday', api.__dayLabel(at(2026, 11, 16, 9), now), '昨天');
check('this year exact date', api.__dayLabel(at(2026, 11, 15), now), '11月15日');
check('other year exact date', api.__dayLabel(at(2025, 12, 31), now), '2025年12月31日');
check('invalid timestamp label', api.__dayLabel(Number.NaN, now), '更早');

// --- 分段 ---
// deriveDaySections 内部用 Date.now() 判断「今天/昨天」，这里把时钟固定成数据的基准日。
Date.now = () => at(2026, 11, 17, 15);

const list = {
  phase: 'ready',
  ids: ['a', 'b', 'c', 'd', 'e'],
  byId: {
    a: { id: 'a', title: 'A', updatedAt: at(2026, 11, 17, 14) },
    b: { id: 'b', title: 'B', updatedAt: at(2026, 11, 17, 9) },
    c: { id: 'c', title: 'C', updatedAt: at(2026, 11, 16, 20) },
    d: { id: 'd', title: 'D', updatedAt: at(2026, 11, 14, 8) },
    e: { id: 'e', title: 'E', updatedAt: at(2026, 11, 17, 10) },
  },
};
/** dayExpansion 是原始 groupExpansion：只记「显式折叠过」的 key。 */
const view = (expansion) => ({ dayExpansion: expansion, ungroupedOrder: [] });
const rowState = { archivedSessionIds: [], pinnedSessionIds: [], archivedFilter: 'default' };

const all = api.deriveDaySections(list, rowState, new Map(), view({}));
check('section count', all.length, 4);
check('section keys', all.map((s) => s.key), [
  'day:2026-11-17',
  'day:2026-11-17',
  'day:2026-11-16',
  'day:2026-11-14',
]);
check('first bucket holds consecutive same-day rows', all[0].sessions.map((s) => s.id), ['a', 'b']);
check('second bucket is the split remainder', all[1].sessions.map((s) => s.id), ['e']);
check('session counts', all.map((s) => s.sessionCount), [2, 1, 1, 1]);
check('labels', all.map((s) => s.label), ['今天', '今天', '昨天', '11月14日']);

// --- 默认展开：这是上一版最大的坑（上游的 expandedGroups 不含 day key，导致全折叠） ---
check('sections are expanded by default', all.map((s) => s.expanded), [true, true, true, true]);
check('default sections render their rows', all.map((s) => s.sessions.length), [2, 1, 1, 1]);

// --- 显式折叠 ---
const collapsed = api.deriveDaySections(
  list,
  rowState,
  new Map(),
  view({ 'day:2026-11-17': false, 'day:2026-11-16': false, 'day:2026-11-14': false }),
);
check('explicit false collapses a section', collapsed.map((s) => s.expanded), [false, false, false, false]);
check('collapsed sections render no rows', collapsed.map((s) => s.sessions.length), [0, 0, 0, 0]);
check('sessionCount survives collapsing', collapsed.map((s) => s.sessionCount), [2, 1, 1, 1]);

// 只折叠其中一天，其它照常
const mixed = api.deriveDaySections(list, rowState, new Map(), view({ 'day:2026-11-16': false }));
check('only the collapsed day loses its rows', mixed.map((s) => s.sessions.length), [2, 1, 0, 1]);

// --- 置顶单独成段 ---
const pinnedState = { archivedSessionIds: [], pinnedSessionIds: ['c'], archivedFilter: 'default' };
const pinnedSections = api.deriveDaySections(list, pinnedState, new Map(), view({}));
check('pinned section leads', pinnedSections[0].key, 'day:pinned');
check('pinned section label', pinnedSections[0].label, '置顶');
check('pinned section holds the pinned row', pinnedSections[0].sessions.map((s) => s.id), ['c']);
check(
  'the pinned row leaves its day',
  pinnedSections.map((s) => s.sessions.map((r) => r.id)).flat(),
  ['c', 'a', 'b', 'e', 'd'],
);

// --- 无效时间戳落到 unknown 段 ---
const brokenList = {
  phase: 'ready',
  ids: ['x'],
  byId: { x: { id: 'x', title: 'X', updatedAt: Number.NaN } },
};
const broken = api.deriveDaySections(brokenList, rowState, new Map(), view({}));
check('invalid timestamp becomes the unknown bucket', broken.map((s) => s.key), ['day:unknown']);
check('unknown bucket label', broken.map((s) => s.label), ['更早']);

// --- containsCurrent ---
check('the current session marks its own section', all[0].containsCurrent, true);
check('other sections are not marked', all.slice(1).map((s) => s.containsCurrent), [false, false, false]);

// --- 空列表 ---
check('empty list yields no sections', api.deriveDaySections({ phase: 'ready', ids: [], byId: {} }, rowState, new Map(), view({})), []);

// --- 移植是否真的接上了上游（不是孤立的死代码）---
check(
  'deriveGroups branches to day mode',
  bundle.includes('if(__dayGroupBy()===`day`)return deriveDaySections('),
  true,
);
check('menu offers the day mode', bundle.includes('id:`day`,label:t(`groupBy.day`)'), true);
check('menu routes the day pick', bundle.includes('||id===`day`)onGroupPick(id)'), true);
check('zh dictionary ships the label', bundle.includes('"groupBy.day":`按天`'), true);
check('en dictionary ships the label', bundle.includes('"groupBy.day":`By day`'), true);

// 分段没有 workspaceId，上游原来按 workspaceId 决定标题，会把标题吞成「未分组」。
check(
  'group title prefers the label (day sections have no workspaceId)',
  bundle.includes('const label=row.label??t(`group.ungrouped`);'),
  true,
);
check(
  'the workspaceId-driven title override is gone',
  bundle.includes('row.workspaceId===void 0?t(`group.ungrouped`):row.label'),
  false,
);

// 展开状态必须来自未过滤的 groupExpansion，否则日期段查不到自己、全部折叠。
check(
  'the call site passes the raw groupExpansion',
  bundle.includes('dayExpansion:groupExpansion'),
  true,
);
check(
  'groupExpansion is a memo dependency',
  bundle.includes('expandedGroups,ungroupedSessionIds,groupExpansion]'),
  true,
);
check(
  'deriveDaySections no longer reads the workspace-only expandedGroups',
  region.includes('view.expandedGroups'),
  false,
);

if (failures.length > 0) {
  console.error(`day-group port: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('day-group port: all checks passed');
