// Logic test for the starred-session region added to the ui-workspace fork bundle.
// It evaluates the exact source text shipped in lib/client.js (between the starred
// region markers) against small stubs, so the test fails if the shipped code drifts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = readFileSync(join(here, '..', 'vendor', 'ui-workspace', 'client.js'), 'utf8');

const start = bundle.indexOf('//#region lib/types/client/starred.js');
const end = bundle.indexOf('//#endregion', start);
if (start === -1 || end === -1) throw new Error('starred region not found in lib/client.js');
const region = bundle.slice(bundle.indexOf('\n', start) + 1, end);

/** Snapshot-store stub with the same surface createSnapshotStore exposes. */
const createStore = (initial, options) => {
  let state = initial;
  const listeners = new Set();
  return {
    persistName: options?.persist?.name,
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (next) => {
      state = next;
      for (const listener of [...listeners]) listener();
    },
    notifyCount: () => listeners.size,
  };
};

const storeModule = { createSnapshotStore: createStore };
const react = { useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot() };
const jsxRuntime = { jsx: (type, props) => ({ type, props }) };

const factory = new Function(
  '_deepseek_ai_dsh_client_store',
  'react',
  'react_jsx_runtime',
  `${region}\nreturn { STARRED_STORE_NAME, NO_STARRED_IDS, createStarStore, starredIdsOf, useStarred, toggleStarred, StarMenuIcon, StarredMenuIcon, store: () => starredStore };`,
);
const api = factory(storeModule, react, jsxRuntime);

const failures = [];
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n  expected ${e}\n  actual   ${a}`);
};

check('storage key', api.STARRED_STORE_NAME, 'dsh.workspace.starred.v1');

const store = api.createStarStore();
check('persist option is the documented key', store.persistName, api.STARRED_STORE_NAME);
check('fresh store has nothing starred', api.starredIdsOf(store), []);
check('fresh store has no marker', api.useStarred('a'), false);

api.toggleStarred('a');
check('first star', api.starredIdsOf(store), ['a']);
check('star marks the row', api.useStarred('a'), true);
check('other rows stay unmarked', api.useStarred('b'), false);

api.toggleStarred('b');
check('newest star leads', api.starredIdsOf(store), ['b', 'a']);

api.toggleStarred('a');
check('re-toggling removes only that id', api.starredIdsOf(store), ['b']);
check('removed id is no longer marked', api.useStarred('a'), false);

const notified = [];
const unsubscribe = store.subscribe(() => notified.push(api.starredIdsOf(store).join(',')));
api.toggleStarred('c');
api.toggleStarred('c');
unsubscribe();
api.toggleStarred('d');
check('subscribers see both writes and none after unsubscribe', notified, ['c,b', 'b']);

// A star must not touch pins or ordering: the region exposes exactly one write shape.
check('write payload keeps the ids array shape', Object.keys(store.getSnapshot()), ['ids']);
check('no pin api is exported from the star region', typeof api.store().pinnedSessionIds, 'undefined');

// Legacy persisted payloads (an object without ids, or a non-array) read as empty.
store.set({ someOther: true });
check('payload without ids reads as empty', api.starredIdsOf(store), []);
store.set({ ids: 'not-an-array' });
check('non-array ids reads as empty', api.starredIdsOf(store), []);
api.toggleStarred('e');
check('toggling from a legacy payload starts a clean list', api.starredIdsOf(store), ['e']);

// The region must never allocate a fresh empty array per read: rows compare by identity.
const first = api.starredIdsOf({ getSnapshot: () => ({}) });
const second = api.starredIdsOf({ getSnapshot: () => ({}) });
check('empty reads share one frozen array', first === second && Object.isFrozen(first), true);

check('menu icons render the glyphs', [api.StarMenuIcon().props.children, api.StarredMenuIcon().props.children], ['☆', '★']);

if (failures.length > 0) {
  console.error(`star logic: ${failures.length} failure(s)\n` + failures.join('\n'));
  process.exit(1);
}
console.log('star logic: all checks passed');
