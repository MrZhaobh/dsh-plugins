window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-session-stars",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const { createPortal } = require("react-dom");

		const NS = "session-stars";
		const STORAGE_KEY = "dsh.workspace.starred.v1";

		/** 内嵌字典：locale/ 下的 json 只给 Plugins 页读 meta，运行时文案走这里。 */
		const zh = {
			star: "星标会话",
			unstar: "取消星标",
		};
		const en = {
			star: "Star session",
			unstar: "Remove star",
		};

		//#region stars-core
		/**
		 * 存储格式与内置的视图状态同构：`{ "ids": ["session-…"] }`，新加的在前。
		 * 沿用 fork 时代同一个 localStorage key，所以已有的星标数据不会丢。
		 */
		function normalizeIds(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
			if (!Array.isArray(value.ids)) return [];
			const seen = new Set();
			const ids = [];
			for (const id of value.ids) {
				if (typeof id !== "string" || id === "" || seen.has(id)) continue;
				seen.add(id);
				ids.push(id);
			}
			return ids;
		}

		/** 加星放在最前（和原实现一致），再点一次只移除这一个 id。 */
		function toggleIn(ids, id) {
			return ids.indexOf(id) === -1 ? [id, ...ids] : ids.filter((existing) => existing !== id);
		}

		function readIds(storage) {
			try {
				const raw = storage.getItem(STORAGE_KEY);
				return normalizeIds(raw === null ? null : JSON.parse(raw));
			} catch (_) {
				return [];
			}
		}

		function writeIds(storage, ids) {
			try {
				storage.setItem(STORAGE_KEY, JSON.stringify({ ids }));
			} catch (_) {
				/* 存储不可用就只保留内存状态，按钮本身不能因此失效 */
			}
		}
		//#endregion

		/** 模块级单例 store：所有原生会话行共享同一份星标状态。 */
		const storage = (() => {
			try {
				return window.localStorage;
			} catch (_) {
				return null;
			}
		})();
		let state = { ids: storage === null ? [] : readIds(storage) };
		const listeners = new Set();

		function subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}

		function getSnapshot() {
			return state;
		}

		function commit(ids) {
			state = { ids };
			if (storage !== null) writeIds(storage, ids);
			for (const listener of [...listeners]) listener();
		}

		function toggle(sessionId) {
			if (typeof sessionId !== "string" || sessionId === "") return;
			commit(toggleIn(state.ids, sessionId));
		}

		function useIds() {
			return react.useSyncExternalStore(subscribe, getSnapshot, getSnapshot).ids;
		}

		const SLOT = "sidebar.session.row.trailing";
		const ROW = '[role="treeitem"][data-row-key^="session:"]';
		const HOST = "dsh-session-star-prefix";

		function StarAtTitle({ sessionId, t }) {
			const starred = useIds().includes(sessionId);
			const marker = react.useRef(null);
			const [mount, setMount] = react.useState(null);
			react.useLayoutEffect(() => {
				const anchor = marker.current;
				const row = anchor?.closest(ROW);
				if (!row?.closest("[data-sidebar-list-area]") || row.getAttribute("data-row-key") !== `session:${sessionId}`) return;
				const title = [...row.children].find((child) => [...child.classList].some((name) => name.endsWith("_title")));
				if (!title) return;
				const host = row.ownerDocument.createElement("span");
				host.className = HOST;
				title.before(host);
				setMount(host);
				return () => host.remove();
			}, [sessionId]);

			const label = typeof t === "function" ? t(starred ? "unstar" : "star") : starred ? "取消星标" : "星标会话";
			const button = jsxRuntime.jsx("button", {
				type: "button",
				className: "dsh-session-star-toggle",
				"data-starred": String(starred),
				"aria-label": label,
				"aria-pressed": starred,
				title: label,
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					toggle(sessionId);
				},
				children: "🌟",
			});
			return jsxRuntime.jsxs(jsxRuntime.Fragment, {
				children: [
					jsxRuntime.jsx("span", { hidden: true, ref: marker }),
					mount ? createPortal(button, mount) : null,
				],
			});
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-stars: dictionaries");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.textContent = `
					.${HOST} { display: none; }
					.${HOST}:has(> button[data-starred="true"]),
					html[data-input-modality="keyboard"] ${ROW}:focus-within > .${HOST} {
						display: inline-flex;
					}
					@media (hover: hover) {
						${ROW}:hover > .${HOST} { display: inline-flex; }
					}
					.${HOST} {
						flex: 0 0 20px;
						margin-inline-start: 4px;
						align-items: center;
						justify-content: center;
					}
					.${HOST} > button {
						display: grid;
						place-items: center;
						inline-size: 20px;
						block-size: 22px;
						background: none;
						border: 0;
						padding: 0;
						border-radius: 4px;
						font: inherit;
						font-size: 13px;
						cursor: pointer;
					}
					.${HOST} > button[data-starred="false"] { filter: grayscale(1); opacity: .7; }
					.${HOST} > button:hover,
					.${HOST} > button:focus-visible { background: var(--dsw-alias-interactive-bg-hover); opacity: 1; }
				`;
				document.head.append(style);
				return () => style.remove();
			}, "session-stars: primary row button");

			ctx.slots.inject(SLOT, () =>
				ctx.slots.register(
					{ name: SLOT, id: "session-stars-at-title", order: 50, locale: NS },
					StarAtTitle,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale"];
		return module.exports;
	},
});
