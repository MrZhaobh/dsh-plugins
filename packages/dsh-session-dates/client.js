window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-session-dates",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
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

		/**
		 * 行尾的日期标签。挂在 sidebar.session.row.trailing 上，不替换任何内置实现，
		 * 所以 DSH 升级不需要重新适配。
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-dates: dictionaries");

			// sessions.list 是 Host 侧会话目录的 snapshot store，订阅它才能跟着会话刷新。
			const sessions = ctx.get("sessions");
			const list = sessions?.list;

			function SessionDate({ sessionId, t }) {
				const state =
					list === undefined
						? undefined
						: react.useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
				const summary = state?.byId?.[sessionId];
				const relative = relativeDayOf(summary?.updatedAt, Date.now());
				if (relative === undefined) return null;
				const text =
					relative.params === undefined ? t(relative.key) : t(relative.key, relative.params);
				return jsx("span", {
					className: "dsh-session-date",
					title: text,
					style: {
						flex: "0 0 auto",
						marginRight: "2px",
						padding: "0 4px",
						borderRadius: "4px",
						fontSize: "10px",
						lineHeight: "14px",
						whiteSpace: "nowrap",
						color: "var(--dsw-alias-label-tertiary, #8b8f96)",
						background: "var(--dsw-alias-bg-secondary, rgba(255,255,255,0.05))",
					},
					children: text,
				});
			}

			ctx.slots.inject("sidebar.session.row.trailing", () =>
				ctx.slots.register(
					{ name: "sidebar.session.row.trailing", id: "session-dates", order: 30, locale: NS },
					SessionDate,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "sessions"];
		return module.exports;
	},
});
