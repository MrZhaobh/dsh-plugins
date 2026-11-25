// Logic test for the day-group region added to the ui-workspace client bundle.
// It evaluates the exact source text shipped in lib/client.js (between the
// day-groups region markers) against small stubs, so the test fails if the
// shipped code drifts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '..', 'vendor', 'ui-workspace', 'client.js'), 'utf8');

const start = bundle.indexOf('//#region lib/types/client/day-groups.js');
const end = bundle.indexOf('//#endregion', start);
if (start === -1 || end === -1) throw new Error('day-groups region not found in lib/client.js');
const region = bundle.slice(bundle.indexOf('\n', start) + 1, end);

const dict = {
  'day.today': '今天',
  'day.yesterday': '昨天',
  'day.pinned': '置顶',
  'day.dateThisYear': '{month}月{day}日',
  'day.date': '{year}年{month}月{day}日',
  'day.unknown': '更早',
};
const t = (key, params) => {
  const template = dict[key];
  if (template === undefined) throw new Error(`missing dictionary key ${key}`);
  return params === undefined ? template : template.replace(/\{(\w+)\}/g, (_, name) => String(params[name]));
};

const stubs = {
  // Mirrors the bundle's sessionVisible contract so the archived-filter wiring is exercised.
  sessionVisible: (session, current, archived, archivedFilter) => {
    if (session.origin === 'subagent') return false;
    if (session.blank && session.id !== current) return false;
    switch (archivedFilter) {
      case 'default': return !archived.has(session.id);
      case 'show': return true;
      case 'only': return archived.has(session.id);
      default: return false;
    }
  },
  mainSessionId: () => 'current',
  sessionNode: (session) => ({ id: session.id, title: session.title ?? '', updatedAt: session.updatedAt, archived: session.archived === true }),
};

const factory = new Function('sessionVisible', 'mainSessionId', 'sessionNode', `${region}\nreturn { dayKeyOf, dayLabelOf, deriveDaySections };`);
const { dayKeyOf, dayLabelOf, deriveDaySections } = factory(stubs.sessionVisible, stubs.mainSessionId, stubs.sessionNode);

const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const now = at(2026, 11, 17, 15, 30);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('dayKeyOf pads month and day', dayKeyOf(at(2026, 1, 5)), '2026-01-05');
check('dayKeyOf invalid timestamp', dayKeyOf(Number.NaN), 'unknown');

check('today', dayLabelOf(at(2026, 11, 17, 0, 0), now, t), '今天');
check('today late hour', dayLabelOf(at(2026, 11, 17, 23, 59), now, t), '今天');
check('yesterday', dayLabelOf(at(2026, 11, 16, 9, 0), now, t), '昨天');
check('this-year exact date', dayLabelOf(at(2026, 11, 15), now, t), '11月15日');
check('other-year exact date', dayLabelOf(at(2025, 12, 31), now, t), '2025年12月31日');
check('unknown timestamp label', dayLabelOf(Number.NaN, now, t), '更早');

const list = {
  phase: 'ready',
  ids: ['a', 'b', 'c', 'd', 'e', 'f'],
  byId: {
    a: { id: 'a', title: 'A', updatedAt: at(2026, 11, 17, 14, 0) },
    b: { id: 'b', title: 'B', updatedAt: at(2026, 11, 17, 9, 0) },
    c: { id: 'c', title: 'C', updatedAt: at(2026, 11, 16, 20, 0) },
    d: { id: 'd', title: 'D', updatedAt: at(2026, 11, 14, 8, 0) },
    e: { id: 'e', title: 'E', updatedAt: at(2026, 11, 17, 10, 0) },
    f: { id: 'f', title: 'F', updatedAt: Number.NaN },
  },
};
const rowState = { pinnedSessionIds: ['e'], archivedSessionIds: [], archivedFilter: 'default' };
const sections = deriveDaySections(list, list.ids, rowState, new Map());

check('section keys', sections.map((s) => s.key), ['day:pinned', 'day:2026-11-17', 'day:2026-11-16', 'day:2026-11-14', 'day:unknown']);
check('pinned flag', sections.map((s) => s.pinned), [true, false, false, false, false]);
check('pinned section holds the pinned row only', sections[0].sessions.map((s) => s.id), ['e']);
check('today bucket keeps caller order', sections[1].sessions.map((s) => s.id), ['a', 'b']);
check('today bucket count', sections[1].sessionCount, 2);
check('pinned section count', sections[0].sessionCount, 1);
check('older day label uses exact date', dayLabelOf(sections[2].latestAt, now, t), '昨天');
check('unknown bucket label', dayLabelOf(sections[4].latestAt, now, t), '更早');

const noPins = deriveDaySections(list, list.ids, { pinnedSessionIds: [], archivedSessionIds: [], archivedFilter: 'default' }, new Map());
check('no pinned section when nothing is pinned', noPins.map((s) => s.key), ['day:2026-11-17', 'day:2026-11-16', 'day:2026-11-14', 'day:unknown']);

const archivedRowState = { pinnedSessionIds: [], archivedSessionIds: ['a'], archivedFilter: 'only' };
const onlyArchived = deriveDaySections(list, list.ids, archivedRowState, new Map());
check('archived-only filter keeps one bucket', onlyArchived.map((s) => s.key), ['day:2026-11-17']);
check('archived filter delegates to sessionVisible', onlyArchived.length, 1);

if (failures.length > 0) {
  console.error(`day-group logic: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('day-group logic: all checks passed');
