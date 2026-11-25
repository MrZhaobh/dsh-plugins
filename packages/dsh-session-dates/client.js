window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-session-dates",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const jsxRuntime = require("react/jsx-runtime");
		const jsx = jsxRuntime.jsx;

		const NS = "session-dates";

		const zh = {
			today: "今天",
			yesterday: "昨天",
			dateThisYear: "{month}月{day}日",
			date: "{year}年{month}月{day}日",
		};
		const en = {
			today: "Today",
			yesterday: "Yesterday",
			dateThisYear: "{month}/{day}",
			date: "{year}/{month}/{day}",
		};

		//#region date-core
		/**
		 * 把一个时间戳折成「今天 / 昨天 / 本月某日 / 某年某日」。
		 * 纯函数，便于测试：返回 { key, params }，由字典插值。
		 */
		function relativeDayOf(at, now) {
			if (typeof at !== "number" || !Number.isFinite(at)) return undefined;
			const date = new Date(at);
			if (Number.isNaN(date.getTime())) return undefined;
			const sameDay = (a, b) =>
				a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
			const today = new Date(now);
			if (sameDay(date, today)) return { key: "today" };
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			if (sameDay(date, yesterday)) return { key: "yesterday" };
			const month = date.getMonth() + 1;
			const day = date.getDate();
			if (date.getFullYear() === today.getFullYear()) return { key: "dateThisYear", params: { month, day } };
			return { key: "date", params: { year: date.getFullYear(), month, day } };
		}
		//#endregion

		const SLOT = "sidebar.session.row.trailing";
		const VIEW_KEY = "dsh.workspace.view.v5";
		const MARKER = "data-dsh-session-day-row";
		const HEADING = "data-dsh-session-day-heading";
		const ROW = '[role="treeitem"][data-row-key^="session:"]';

		function usesRecentFlatView() {
			try {
				const view = JSON.parse(window.localStorage.getItem(VIEW_KEY));
				return view?.groupBy === "flat" && view.orderBy === "updated";
			} catch {
				return false;
			}
		}

		function flatTree() {
			const trees = document.querySelectorAll('[data-sidebar-list-area] [role="tree"]');
			return [...trees].find((tree) => [...tree.classList].some((name) => name.endsWith("_flatList")));
		}

		function dateHeadings(tree, sessions, workspaces, now, translations) {
			const headings = new Map();
			if (!sessions?.byId || !Array.isArray(workspaces?.pinnedSessionIds) || !Array.isArray(workspaces.archivedSessionIds)) {
				return headings;
			}
			const pinned = new Set(workspaces.pinnedSessionIds);
			const archived = new Set(workspaces.archivedSessionIds);
			let previousLabel;
			let previousTime = Infinity;
			for (const child of tree.children) {
				const marker = child.querySelector(`[${MARKER}]`);
				if (marker === null) {
					// A blank session has no trailing slot. Any other session without our
					// marker means the DOM or slot contract has changed.
					const row = child.matches(ROW) ? child : child.querySelector(ROW);
					const id = row?.getAttribute("data-row-key").slice("session:".length);
					if (id && sessions.byId[id]?.blank !== true) return new Map();
					continue;
				}
				const id = marker.getAttribute(MARKER);
				const row = marker.closest(ROW);
				if (row?.parentElement !== child || row.getAttribute("data-row-key") !== `session:${id}`) return new Map();
				if (pinned.has(id) && !archived.has(id)) continue;
				const at = sessions.byId[id]?.updatedAt;
				const translation = translations.get(marker);
				const date = relativeDayOf(at, now);
				if (!translation || !date || at > previousTime) return new Map();
				const label = translation(date.key, date.params);
				if (label !== previousLabel) headings.set(child, label);
				previousLabel = label;
				previousTime = at;
			}
			return headings;
		}

		function stopSubscription(stop) {
			if (typeof stop !== "function") return;
			try {
				stop();
			} catch {
				// A changed store contract must not prevent the decoration from cleaning up.
			}
		}

		function apply(ctx) {
			const sessions = ctx.get("sessions")?.list;
			const workspaces = ctx.get("workspaces")?.list;
			if (![sessions, workspaces].every((store) =>
				typeof store?.getSnapshot === "function" && typeof store.subscribe === "function"
			)) return;
			const translations = new WeakMap();
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-dates: dictionaries");

			let schedule = () => {};
			ctx.effect(() => {
				let stopSessions;
				let stopWorkspaces;
				try {
					stopSessions = sessions.subscribe(() => schedule());
					stopWorkspaces = workspaces.subscribe(() => schedule());
				} catch {
					stopSubscription(stopSessions);
					return;
				}

				const style = document.createElement("style");
				style.textContent = `
					[${HEADING}]::before {
						content: attr(${HEADING});
						display: block;
						margin: 8px 0 3px;
						padding: 0 8px;
						color: var(--dsw-alias-label-tertiary, #737373);
						font-size: 11px;
						font-weight: 600;
						line-height: 18px;
						pointer-events: none;
					}
				`;
				document.head.append(style);

				let painted = new Map();
				let observedTree;
				let frame;
				const observer = new MutationObserver(() => schedule());
				function render() {
					frame = undefined;
					const tree = flatTree();
					if (tree !== observedTree) {
						observer.disconnect();
						observedTree = tree;
						if (tree) observer.observe(tree, { childList: true, subtree: true });
					}
					let headings = new Map();
					if (tree && usesRecentFlatView()) {
						try {
							headings = dateHeadings(tree, sessions.getSnapshot(), workspaces.getSnapshot(), Date.now(), translations);
						} catch {
							// A changed native contract leaves the list without date headings.
						}
					}
					for (const node of painted.keys()) {
						if (!headings.has(node)) node.removeAttribute(HEADING);
					}
					for (const [node, value] of headings) {
						if (painted.get(node) !== value) node.setAttribute(HEADING, value);
					}
					painted = headings;
				}
				schedule = () => {
					if (frame === undefined) frame = window.requestAnimationFrame(render);
				};

				// The view store saves same-window preferences after local menu actions.
				document.addEventListener("click", schedule, true);
				document.addEventListener("keydown", schedule, true);
				window.addEventListener("storage", schedule);
				const scheduleMidnight = () => {
					const tomorrow = new Date();
					tomorrow.setHours(24, 0, 0, 0);
					return window.setTimeout(() => {
						schedule();
						midnight = scheduleMidnight();
					}, tomorrow.getTime() - Date.now());
				};
				let midnight = scheduleMidnight();
				schedule();

				return () => {
					stopSubscription(stopSessions);
					stopSubscription(stopWorkspaces);
					observer.disconnect();
					document.removeEventListener("click", schedule, true);
					document.removeEventListener("keydown", schedule, true);
					window.removeEventListener("storage", schedule);
					window.clearTimeout(midnight);
					if (frame !== undefined) window.cancelAnimationFrame(frame);
					schedule = () => {};
					for (const node of painted.keys()) node.removeAttribute(HEADING);
					style.remove();
				};
			}, "session-dates: native list headings");

			function SessionDateMarker({ sessionId, t }) {
				return jsx("span", {
					hidden: true,
					[MARKER]: sessionId,
					ref: (node) => {
						if (node) translations.set(node, t);
						schedule();
					},
				});
			}
			ctx.slots.inject(SLOT, () =>
				ctx.slots.register({ name: SLOT, id: "session-dates", order: 30, locale: NS }, SessionDateMarker),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "sessions", "workspaces"];
		return module.exports;
	},
});
