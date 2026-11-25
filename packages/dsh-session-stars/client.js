window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-session-stars",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");

		const NS = "session-stars";
		const STORAGE_KEY = "dsh.workspace.starred.v1";

		/** 内嵌字典：locale/ 下的 json 只给 Plugins 页读 meta，运行时文案走这里。 */
		const zh = {
			star: "星标会话",
			unstar: "取消星标",
			starred: "已星标",
		};
		const en = {
			star: "Star session",
			unstar: "Remove star",
			starred: "Starred",
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

		/** 模块级单例 store：两个槽位里的组件共享同一份状态，任一处修改另一处立刻跟。 */
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

		/**
		 * 悬停区里的 ☆ / ★ 按钮。hover 槽位只在会话行悬停时渲染，正合「悬停出现按钮」。
		 * `t` 由注册时的 locale 命名空间注入；万一没注入也不能让整行跟着崩，所以退化成中文。
		 */
		function StarToggle({ sessionId, t }) {
			const ids = useIds();
			const starred = ids.indexOf(sessionId) !== -1;
			const label = typeof t === "function" ? t(starred ? "unstar" : "star") : starred ? "取消星标" : "星标会话";
			return jsxRuntime.jsx("button", {
				type: "button",
				className: "dsh-session-star-toggle",
				"data-starred": starred ? "true" : "false",
				"aria-label": label,
				"aria-pressed": starred,
				title: label,
				style: {
					background: "none",
					border: "0",
					padding: "0 3px",
					margin: "0",
					cursor: "pointer",
					font: "inherit",
					fontSize: "12px",
					lineHeight: "1",
					color: starred ? "#e8b339" : "inherit",
					opacity: starred ? "1" : "0.7",
				},
				onClick: (event) => {
					// 会话行本身可点开，必须拦住冒泡，否则点星标会跳转会话
					event.preventDefault();
					event.stopPropagation();
					toggle(sessionId);
				},
				children: starred ? "★" : "☆",
			});
		}

		/**
		 * 行尾的 🌟 标记。放在 trailing 而不是 leading：leading 在有运行状态点时
		 * 会被状态点顶掉，星标标记不能跟着状态闪。
		 */
		function StarMark({ sessionId, t }) {
			const ids = useIds();
			if (ids.indexOf(sessionId) === -1) return null;
			const label = typeof t === "function" ? t("starred") : "已星标";
			return jsxRuntime.jsx("span", {
				className: "dsh-session-star-mark",
				role: "img",
				"aria-label": label,
				title: label,
				style: {
					marginLeft: "2px",
					fontSize: "10px",
					lineHeight: "1",
					verticalAlign: "middle",
				},
				children: "🌟",
			});
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-stars: dictionaries");

			// 两个槽位都由内置 ui-workspace 声明；插件被禁用或未装时这里只是挂着，不报错。
			ctx.slots.inject("sidebar.session.row.hover", () =>
				ctx.slots.register(
					{ name: "sidebar.session.row.hover", id: "session-stars-toggle", order: 50, locale: NS },
					StarToggle,
				),
			);
			ctx.slots.inject("sidebar.session.row.trailing", () =>
				ctx.slots.register(
					{ name: "sidebar.session.row.trailing", id: "session-stars-mark", order: 50, locale: NS },
					StarMark,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale"];
		return module.exports;
	},
});
