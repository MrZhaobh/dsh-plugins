window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-sidebar-day",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const jsx = jsxRuntime.jsx;
		const jsxs = jsxRuntime.jsxs;

		const NS = "sidebar-day";
		const COLLAPSED_KEY = "dsh.sidebarDay.collapsed.v1";
		const ENABLED_KEY = "dsh.sidebarDay.enabled.v1";

		const zh = {
			empty: "还没有会话",
			today: "今天",
			yesterday: "昨天",
			pinned: "置顶",
			dateThisYear: "{month}月{day}日",
			date: "{year}年{month}月{day}日",
			toOfficial: "切回官方的会话列表",
			toDay: "切到按天分组",
			modeDay: "按天分组",
			modeOfficial: "官方列表",
		};
		const en = {
			empty: "No sessions yet",
			today: "Today",
			yesterday: "Yesterday",
			pinned: "Pinned",
			dateThisYear: "{month}/{day}",
			date: "{year}/{month}/{day}",
			toOfficial: "Switch to the built-in session list",
			toDay: "Switch to grouping by day",
			modeDay: "By day",
			modeOfficial: "Built-in list",
		};

		//#region day-core
		function dayKeyOf(at) {
			if (typeof at !== "number" || !Number.isFinite(at)) return "unknown";
			const d = new Date(at);
			if (Number.isNaN(d.getTime())) return "unknown";
			const pad = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		}

		function dayLabelOf(at, now) {
			if (typeof at !== "number" || !Number.isFinite(at)) return { key: "unknown" };
			const d = new Date(at);
			if (Number.isNaN(d.getTime())) return { key: "unknown" };
			const sameDay = (a, b) =>
				a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
			const today = new Date(now);
			if (sameDay(d, today)) return { key: "today" };
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			if (sameDay(d, yesterday)) return { key: "yesterday" };
			const month = d.getMonth() + 1;
			const day = d.getDate();
			if (d.getFullYear() === today.getFullYear()) return { key: "dateThisYear", params: { month, day } };
			return { key: "date", params: { year: d.getFullYear(), month, day } };
		}

		/** 会话快照 + 工作区快照 → 按天分段（置顶单独成段）。 */
		function buildSections(list, workspaces, now) {
			const pinned = new Set(workspaces?.pinnedSessionIds ?? []);
			const archived = new Set(workspaces?.archivedSessionIds ?? []);
			const ids = Array.isArray(list?.ids) ? list.ids : [];
			const byId = list?.byId ?? {};
			const isPinned = (id) => pinned.has(id) && !archived.has(id);

			const pinnedRows = [];
			const rest = [];
			for (const id of ids) {
				const summary = byId[id];
				if (summary === undefined) continue;
				if (summary.origin === "subagent") continue;
				if (summary.archived === true || archived.has(id)) continue;
				if (isPinned(id)) pinnedRows.push(summary);
				else rest.push(summary);
			}

			const sections = [];
			if (pinnedRows.length > 0) sections.push({ key: "day:pinned", label: { key: "pinned" }, rows: pinnedRows });

			// 按日期归并：同一天即使被隔开也只出一个段，折叠状态才对得上。
			const buckets = new Map();
			for (const summary of rest) {
				const key = `day:${dayKeyOf(summary.updatedAt)}`;
				const existing = buckets.get(key);
				if (existing === undefined) buckets.set(key, { key, rows: [summary], at: summary.updatedAt });
				else existing.rows.push(summary);
			}
			const ordered = [...buckets.values()].sort((left, right) => (right.at ?? 0) - (left.at ?? 0));
			for (const bucket of ordered) sections.push({ key: bucket.key, label: dayLabelOf(bucket.at, now), rows: bucket.rows });
			return sections;
		}

		function readCollapsed() {
			try {
				const raw = window.localStorage.getItem(COLLAPSED_KEY);
				const parsed = raw === null ? null : JSON.parse(raw);
				return Array.isArray(parsed?.keys) ? parsed.keys.filter((key) => typeof key === "string") : [];
			} catch (_) {
				return [];
			}
		}

		function readEnabled() {
			// 启动时**总是**接管侧栏。切换状态刻意不持久化：
			// 一旦把 false 存进 localStorage，下次启用这个插件就会读到 false 而不注册，
			// 表现为「启用了但侧栏空白」，排查成本很高。
			return true;
		}

		function writeEnabled(value) {
			try {
				window.localStorage.setItem(ENABLED_KEY, value ? "1" : "0");
			} catch (_) {
				/* ignore */
			}
		}

		function writeCollapsed(keys) {
			try {
				window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify({ keys }));
			} catch (_) {
				/* ignore */
			}
		}
		//#endregion

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "sidebar-day: dictionaries");
			const t = ctx.locale.bind(NS);

			const sessions = ctx.get("sessions");
			const workspaces = ctx.get("workspaces");
			const layout = ctx.get("layout");
			const list = sessions?.list;
			const workspaceList = workspaces?.list;

			const subscribeSessions = (listener) => (list === undefined ? () => {} : list.subscribe(listener));
			const subscribeWorkspaces = (listener) => (workspaceList === undefined ? () => {} : workspaceList.subscribe(listener));
			const getSessions = () => (list === undefined ? { ids: [], byId: {} } : list.getSnapshot());
			const getWorkspaces = () => (workspaceList === undefined ? {} : workspaceList.getSnapshot());

			let mainReference;
			const open = (sessionId) => {
				if (typeof sessionId !== "string" || sessionId === "") return;
				// 优先走内置服务提供的官方入口：它内部会 retain + 导航 + 释放上一个引用。
				// 手工拼 retain 少了它的导航步骤，点了会没反应。
				const uiWorkspace = ctx.get("uiWorkspace");
				if (uiWorkspace !== undefined && uiWorkspace !== null && typeof uiWorkspace.openSession === "function") {
					try {
						uiWorkspace.openSession(sessionId);
						return;
					} catch (error) {
						console.warn("sidebar-day: uiWorkspace.openSession failed, falling back", error);
					}
				}
				const reference = sessions.retain(sessionId, { source: "mainView" });
				const previous = mainReference;
				mainReference = reference;
				previous?.release();
				layout.selectPanel(null);
			};
			ctx.effect(
				() => () => {
					mainReference?.release();
					mainReference = undefined;
				},
				"sidebar-day: release main reference",
			);

			function DaySidebar(props) {
				const renderSlot = props?.renderSlot;
				const state = react.useSyncExternalStore(subscribeSessions, getSessions, getSessions);
				const workspaceState = react.useSyncExternalStore(subscribeWorkspaces, getWorkspaces, getWorkspaces);
				const [collapsed, setCollapsed] = react.useState(readCollapsed);
				const [now, setNow] = react.useState(() => Date.now());

				react.useEffect(() => {
					const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
					return () => window.clearInterval(timer);
				}, []);

				const sections = react.useMemo(
					() => buildSections(state, workspaceState, now),
					[state, workspaceState, now],
				);

				const toggle = (key) => {
					const next = collapsed.indexOf(key) === -1 ? [...collapsed, key] : collapsed.filter((k) => k !== key);
					setCollapsed(next);
					writeCollapsed(next);
				};

				const selected = (() => {
					// 当前会话由 sessions 快照里的 retainedBy.mainView 标记，不是 workspaces 里的字段。
					const byId = state?.byId ?? {};
					for (const id of Object.keys(byId)) {
						if ((byId[id]?.retainedBy?.mainView ?? 0) > 0) return id;
					}
					return undefined;
				})();
				const slot = typeof renderSlot === "function" ? renderSlot : () => null;

				if (sections.length === 0) {
					return jsx("div", { style: { padding: "20px 12px", fontSize: "12px", opacity: "0.6" }, children: t("empty") });
				}

				return jsx("div", {
					role: "tree",
					"data-day-sidebar": "",
					style: { display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight: "0", overflowY: "auto", paddingBottom: "12px" },
					children: sections.map((section) => {
						const isCollapsed = collapsed.indexOf(section.key) !== -1;
						const label =
							section.label.params === undefined
								? t(section.label.key)
								: t(section.label.key, section.label.params);
						return jsxs(
							"section",
							{
								style: { display: "flex", flexDirection: "column" },
								children: [
									jsxs("button", {
										type: "button",
										onClick: () => toggle(section.key),
										"aria-expanded": !isCollapsed,
										style: {
											display: "flex",
											alignItems: "center",
											gap: "6px",
											width: "100%",
											background: "none",
											border: "0",
											padding: "10px 10px 4px",
											cursor: "pointer",
											font: "inherit",
											fontSize: "11px",
											fontWeight: "600",
											color: "var(--dsw-alias-label-secondary, #9aa0a6)",
											textAlign: "left",
										},
										children: [
											jsx("span", { "aria-hidden": "true", style: { fontSize: "9px" }, children: isCollapsed ? "▸" : "▾" }),
											jsx("span", { children: label }),
											jsx("span", { style: { opacity: "0.55", fontWeight: "400" }, children: String(section.rows.length) }),
										],
									}),
									isCollapsed
										? null
										: jsx("div", {
												role: "group",
												style: { display: "flex", flexDirection: "column" },
												children: section.rows.map((row) => {
													// summary.title 常是空串（未命名会话）或不存在，逐级兜底到 id 后缀，
													// 保证每行一定有可读文字，不会渲染成一条空白。
													const raw = typeof row.title === "string" ? row.title.trim() : "";
													const title =
														raw !== ""
															? raw
															: typeof row.displayTitle === "string" && row.displayTitle.trim() !== ""
																? row.displayTitle.trim()
																: String(row.id ?? "").replace(/^session-/u, "").slice(0, 8) || "(未命名)";
													const leading = slot("sidebar.session.row.leading", { sessionId: row.id });
													const trailing = slot("sidebar.session.row.trailing", { sessionId: row.id });
													const hover = slot("sidebar.session.row.hover", { sessionId: row.id });
													const actions = slot("sidebar.workspaces.session.row.action", {
														sessionId: row.id,
														displayTitle: title,
													});
													return jsx(
														"div",
														{
															role: "treeitem",
															tabIndex: 0,
															"data-row-key": `session:${row.id}`,
															onClick: () => open(row.id),
															onKeyDown: (event) => {
																if (event.key === "Enter" || event.key === " ") {
																	event.preventDefault();
																	open(row.id);
																}
															},
															style: {
																display: "flex",
																alignItems: "center",
																gap: "6px",
																minHeight: "30px",
																padding: "4px 6px 4px 14px",
																borderRadius: "6px",
																cursor: "pointer",
																fontSize: "13px",
																boxSizing: "border-box",
																color: "var(--dsw-alias-label-primary, #e6e6e6)",
																background:
																	selected === row.id
																		? "var(--dsw-alias-bg-secondary, rgba(255,255,255,0.06))"
																		: "transparent",
															},
															children: [
																leading === null || leading === undefined
																	? null
																	: jsx("span", { style: { flex: "0 0 auto", display: "flex" }, children: leading }),
																jsx("span", {
																	style: {
																		flex: "1 1 auto",
																		overflow: "hidden",
																		textOverflow: "ellipsis",
																		whiteSpace: "nowrap",
																	},
																	title,
																	children: title,
																}),
																trailing === null || trailing === undefined
																	? null
																	: jsx("span", { style: { flex: "0 0 auto", display: "flex", gap: "2px" }, children: trailing }),
																hover === null || hover === undefined
																	? null
																	: jsx("span", { style: { flex: "0 0 auto", display: "flex" }, children: hover }),
																actions === null || actions === undefined
																	? null
																	: jsx("span", { style: { flex: "0 0 auto", display: "flex" }, children: actions }),
															].filter((node) => node !== null),
														},
														row.id,
													);
												}),
											}),
								].filter((node) => node !== null),
							},
							section.key,
						);
					}),
				});
			}

			// ---- 注册 / 注销自己的 sidebar.workspaces ----
			// 内置行始终启用；注销我的注册后官方列表自动回来。按钮放在本插件自己的
			// 底部动作区 —— 本插件始终加载，不会把自己禁用掉。
			const enabledStore = (() => {
				let value = readEnabled();
				const listeners = new Set();
				return {
					get: () => value,
					set: (next) => {
						value = next;
						writeEnabled(next);
						for (const listener of [...listeners]) listener();
					},
					subscribe: (listener) => {
						listeners.add(listener);
						return () => {
							listeners.delete(listener);
						};
					},
				};
			})();

			const CHILDREN = {
				"sidebar.workspaces.directoryFlow": { kind: "single", scope: "root" },
				"sidebar.workspaces.session.row.action": { kind: "list", scope: "root" },
				"sidebar.session.row.leading": { kind: "list", scope: "root", inline: true },
				"sidebar.session.row.trailing": { kind: "list", scope: "root", inline: true },
				"sidebar.session.row.hover": { kind: "list", scope: "root" },
			};

			let registration = null;
			/** 诊断用：注销函数到底是什么形态（function / dispose / none）。 */
			let disposalKind = "none";

			const attach = () => {
				if (registration !== null) return;
				try {
					registration = ctx.slots.register({ name: "sidebar.workspaces", children: CHILDREN, locale: NS }, DaySidebar);
					if (typeof registration === "function") disposalKind = "function";
					else if (registration !== null && registration !== undefined && typeof registration.dispose === "function") {
						disposalKind = "dispose";
					} else if (
						registration !== null &&
						registration !== undefined &&
						typeof registration[Symbol.dispose] === "function"
					) {
						disposalKind = "symbol";
					} else {
						disposalKind = "none";
					}
				} catch (error) {
					registration = null;
					disposalKind = "error";
					console.warn("sidebar-day: register failed", error);
				}
			};

			const detach = () => {
				if (registration === null) return;
				const held = registration;
				registration = null;
				try {
					if (typeof held === "function") held();
					else if (typeof held?.dispose === "function") held.dispose();
					else if (typeof held?.[Symbol.dispose] === "function") held[Symbol.dispose]();
					else console.warn("sidebar-day: no usable disposer; registration left in place", held);
				} catch (error) {
					console.warn("sidebar-day: dispose failed", error);
				}
			};

			ctx.slots.inject("sidebar.workspaces", () => {
				if (enabledStore.get()) attach();
			});
			ctx.effect(() => () => detach(), "sidebar-day: detach on dispose");

			// ---- 侧栏底部的切换按钮 ----
			function Toggle() {
				const enabled = react.useSyncExternalStore(enabledStore.subscribe, enabledStore.get, enabledStore.get);
				const hint = `${enabled ? t("toOfficial") : t("toDay")} · dispose:${disposalKind}`;
				const text = enabled ? t("modeDay") : t("modeOfficial");
				return jsxs("button", {
					type: "button",
					title: hint,
					"aria-label": hint,
					"aria-pressed": enabled,
					"data-sidebar-day-mode": enabled ? "day" : "official",
					"data-disposal": disposalKind,
					onClick: () => {
						const next = !enabledStore.get();
						enabledStore.set(next);
						if (next) attach();
						else detach();
					},
					style: {
						display: "flex",
						alignItems: "center",
						gap: "6px",
						width: "100%",
						boxSizing: "border-box",
						background: "var(--dsw-alias-bg-secondary, rgba(255,255,255,0.05))",
						border: "1px solid var(--dsw-alias-border-secondary, rgba(255,255,255,0.10))",
						borderRadius: "8px",
						padding: "5px 8px",
						margin: "2px 0",
						cursor: "pointer",
						color: "inherit",
						font: "inherit",
						fontSize: "12px",
						lineHeight: "16px",
						textAlign: "left",
					},
					children: [
						jsxs("svg", {
							width: 15,
							height: 15,
							viewBox: "0 0 24 24",
							fill: "none",
							"aria-hidden": "true",
							style: { flex: "0 0 auto", opacity: enabled ? 1 : 0.7 },
							children: [
								jsx("rect", {
									x: "3",
									y: "4.5",
									width: "18",
									height: "16",
									rx: "3",
									stroke: "currentColor",
									"stroke-width": "1.7",
								}),
								jsx("path", { d: "M3 9.2h18", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round" }),
								enabled
									? jsx("path", {
											d: "M6.8 12.4h5M6.8 15.6h10.4M6.8 18.6h7.6",
											stroke: "currentColor",
											"stroke-width": "1.7",
											"stroke-linecap": "round",
										})
									: jsx("path", {
											d: "M8 12.6h8M8 16.2h5",
											stroke: "currentColor",
											"stroke-width": "1.7",
											"stroke-linecap": "round",
										}),
							],
						}),
						jsx("span", {
							style: { flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
							children: text,
						}),
					],
				});
			}

			ctx.slots.inject("sidebar.footer.action", () =>
				ctx.slots.register(
					{ name: "sidebar.footer.action", id: "sidebar-day-toggle", order: 40, locale: NS },
					Toggle,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "sessions", "workspaces", "layout"];
		return module.exports;
	},
});
