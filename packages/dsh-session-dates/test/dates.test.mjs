import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../client.js", import.meta.url), "utf8");
let moduleDefinition;
new Function("window", source.replace("exports.apply = apply;", "exports.apply = apply; exports.dateHeadings = dateHeadings;"))({
	__ModuleLoader__: { load: (definition) => { moduleDefinition = definition; } },
});
const plugin = moduleDefinition.factory(() => ({ jsx: (type, props) => ({ type, props }) }));

function mount(list = { getSnapshot() {}, subscribe() {} }) {
	const registrations = [];
	const effects = [];
	plugin.apply({
		get: () => ({ list }),
		effect: (effect) => effects.push(effect),
		slots: {
			inject: (name, register) => {
				assert.equal(name, "sidebar.session.row.trailing");
				register();
			},
			register: (declaration, component) => registrations.push({ declaration, component }),
		},
	});
	return { registrations, effects };
}

function item(id, hasMarker = true) {
	const child = {
		querySelector: (selector) => selector === "[data-dsh-session-day-row]" ? (hasMarker ? marker : null) : row,
		matches: () => false,
	};
	const row = { parentElement: child, getAttribute: () => `session:${id}` };
	const marker = { getAttribute: () => id, closest: () => row };
	return { child, marker, row };
}

const fixture = () => {
	const rows = [item("blank", false), item("pinned"), item("first"), item("second"), item("prior"), item("older")];
	const tree = { children: rows.map(({ child }) => child) };
	const now = new Date(2026, 10, 25, 16).getTime();
	const updatedAt = (month, day, hour = 12) => new Date(2026, month - 1, day, hour).getTime();
	const sessions = { byId: {
		blank: { blank: true },
		pinned: { updatedAt: updatedAt(11, 10) },
		first: { updatedAt: updatedAt(11, 25, 15) },
		second: { updatedAt: updatedAt(11, 25, 9) },
		prior: { updatedAt: updatedAt(11, 24) },
		older: { updatedAt: updatedAt(10, 31) },
	} };
	const workspaces = { pinnedSessionIds: ["pinned"], archivedSessionIds: [] };
	const t = (key, params) => params ? `${key}:${params.month}/${params.day}` : key;
	const translations = new Map(rows.map(({ marker }) => [marker, t]));
	const headings = () => plugin.dateHeadings(tree, sessions, workspaces, now, translations);
	return { rows, tree, sessions, headings };
};

test("contributes a hidden marker to the official row slot", () => {
	assert.equal(moduleDefinition.id, "@mrzhaobh/dsh-session-dates");
	assert.deepEqual(plugin.inject, ["slots", "locale", "sessions", "workspaces"]);
	const { registrations, effects } = mount();
	assert.equal(registrations.length, 1);
	assert.equal(effects.length, 2);
	const { declaration, component } = registrations[0];
	assert.equal(declaration.name, "sidebar.session.row.trailing");
	const marker = component({ sessionId: "test-session", t: () => "" });
	assert.equal(marker.type, "span");
	assert.equal(marker.props.hidden, true);
	assert.equal(marker.props["data-dsh-session-day-row"], "test-session");
});

test("marks only date boundaries, leaving the pinned and blank rows in place", () => {
	const { rows, tree, headings } = fixture();
	assert.deepEqual([...headings()], [[rows[2].child, "today"], [rows[4].child, "yesterday"], [rows[5].child, "dateThisYear:10/31"]]);
	assert.deepEqual(tree.children, rows.map(({ child }) => child));
});

test("leaves the list alone if rows arrive out of order or the DOM no longer matches", () => {
	const { rows, tree, sessions, headings } = fixture();
	tree.children.push(tree.children.splice(3, 1)[0]);
	assert.equal(headings().size, 0);
	tree.children = rows.map(({ child }) => child);
	rows[2].row.parentElement = {};
	assert.equal(headings().size, 0);
	rows[2].row.parentElement = rows[2].child;
	delete sessions.byId.first;
	assert.equal(headings().size, 0);
});

test("does not mount decorations without usable native stores", () => {
	const { registrations, effects } = mount({ subscribe() {} });
	assert.deepEqual(registrations, []);
	assert.deepEqual(effects, []);
	assert.equal(plugin.dateHeadings({}, undefined, {}, 0, new Map()).size, 0);
});
