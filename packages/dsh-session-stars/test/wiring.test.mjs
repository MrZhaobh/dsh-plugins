import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../client.js", import.meta.url), "utf8");
const storageKey = "dsh.workspace.starred.v1";

function fixture({ knownTitle = true } = {}) {
	const values = new Map([[storageKey, JSON.stringify({ ids: ["session-a"] })]]);
	let definition;
	let registered;
	let pendingLayout;
	let currentMount = null;
	let inserted;
	let removed = false;
	const anchor = { closest: () => row };
	const title = { classList: [knownTitle ? "class_title" : "unrecognized"], before: (host) => { inserted = host; } };
	const row = {
		closest: () => true,
		getAttribute: () => "session:session-a",
		children: [title],
		ownerDocument: { createElement: () => ({ remove: () => { removed = true; } }) },
	};
	const react = {
		useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
		useRef: () => ({ current: anchor }),
		useState: () => [currentMount, (next) => { currentMount = next; }],
		useLayoutEffect: (effect) => { pendingLayout = effect; },
	};
	const jsx = (type, props) => ({ type, props });
	const modules = {
		react,
		"react-dom": { createPortal: (element, host) => ({ element, host }) },
		"react/jsx-runtime": { jsx, jsxs: jsx, Fragment: Symbol() },
	};
	new Function("window", source)({
		__ModuleLoader__: { load: (d) => { definition = d; } },
		localStorage: { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) },
	});
	const plugin = definition.factory((name) => modules[name]);
	plugin.apply({
		effect: () => {},
		slots: {
			inject: (name, callback) => {
				assert.equal(name, "sidebar.session.row.trailing");
				callback();
			},
			register: (declaration, component) => { registered = { declaration, component }; },
		},
	});
	const render = () => registered.component({ sessionId: "session-a", t: (key) => key }).props.children[1];
	return { values, registered, render, layout: () => pendingLayout(), host: () => inserted, removed: () => removed };
}

test("uses a native slot to mount before the title and keeps existing stars", () => {
	const f = fixture();
	assert.equal(f.registered.declaration.name, "sidebar.session.row.trailing");
	assert.equal(f.render(), null);
	const cleanup = f.layout();
	const { element, host } = f.render();
	assert.equal(host, f.host());
	assert.equal(host.className, "dsh-session-star-prefix");
	assert.equal(element.props["aria-pressed"], true);
	assert.equal(element.props.children, "🌟");
	let stopped = false;
	element.props.onClick({ preventDefault() {}, stopPropagation() { stopped = true; } });
	assert(stopped);
	assert.equal(f.render().element.props["aria-pressed"], false);
	assert.deepEqual(JSON.parse(f.values.get(storageKey)), { ids: [] });
	f.render().element.props.onClick({ preventDefault() {}, stopPropagation() {} });
	assert.deepEqual(JSON.parse(f.values.get(storageKey)), { ids: ["session-a"] });
	cleanup();
	assert(f.removed());
});

test("skips a row when its native title cannot be located", () => {
	const f = fixture({ knownTitle: false });
	assert.equal(f.render(), null);
	assert.equal(f.layout(), undefined);
	assert.equal(f.host(), undefined);
	assert.equal(f.render(), null);
	assert.deepEqual(JSON.parse(f.values.get(storageKey)), { ids: ["session-a"] });
});
