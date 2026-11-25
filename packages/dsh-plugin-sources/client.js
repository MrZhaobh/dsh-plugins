window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-plugin-sources",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const jsx = jsxRuntime.jsx;
		const jsxs = jsxRuntime.jsxs;

		const NS = "plugin-sources";
		const COLLAPSED_KEY = "dsh.pluginSources.collapsed.v2";

		/** 固定分组的名字进字典；仓库型分组直接用 owner/repo 显示。 */
		const zh = {
			title: "按来源",
			loading: "正在读取已安装插件…",
			empty: "没有已安装的插件",
			error: "读取失败",
			retry: "重试",
			refresh: "刷新",
			"group.built-in": "安装自带",
			"group.registry": "npm registry",
			"group.local": "本地目录",
			"group.git": "其他 Git 源",
			"group.unknown": "来源未知",
		};
		const en = {
			title: "By source",
			loading: "Reading installed plugins…",
			empty: "No installed plugins",
			error: "Read failed",
			retry: "Retry",
			refresh: "Refresh",
			"group.built-in": "Built in",
			"group.registry": "npm registry",
			"group.local": "Local",
			"group.git": "Other Git",
			"group.unknown": "Unknown",
		};

		//#region group-core
		const FIXED_GROUPS = new Set(["built-in", "registry", "local", "git", "unknown"]);
		/** 本仓库的显示名；link 安装到本地检出目录时用它把"本地"和"git"区分开。 */
		const OWN_REPO = "MrZhaobh/dsh-plugins";

		/**
		 * 把一个 bundle 的 `source`（pnpm 接受的 spec）归到一个分组键。
		 * 认得的形态：
		 *   github:owner/repo#<commit>&path:/x  → github:owner/repo
		 *   link:/path/to/dsh-plugins/packages/x → local:MrZhaobh/dsh-plugins（本仓库的本地检出）
		 *   link:/other / file:…                → local
		 *   dsh-balance@0.2.9                   → registry
		 *   其他 git+… 或含协议的               → git
		 * 没有 source 的：安装自带的进 built-in，其余进 unknown。
		 */
		function groupKeyOf(entry) {
			const source = entry === null || typeof entry !== "object" ? undefined : entry.source;
			if (source === undefined || source === null || source === "") {
				return entry?.availability === "installation" || entry?.official === true ? "built-in" : "unknown";
			}
			const text = String(source);
			const hosted = /^(github|gitlab|bitbucket):(.+)$/u.exec(text);
			if (hosted !== null) {
				// 去掉 #commit 与 &path:/…，只留 owner/repo
				return `${hosted[1]}:${hosted[2].split(/[#&]/u)[0]}`;
			}
			if (text.startsWith("link:") || text.startsWith("file:")) {
				// 本地检出目录里带 dsh-plugins/packages/ 的，认成本仓库的本地版
				return /dsh-plugins[\\/]+packages[\\/]/iu.test(text) ? `local:${OWN_REPO}` : "local";
			}
			if (text.startsWith("git+") || text.includes("://")) return "git";
			// name@version / name@^range / npm:alias 都是走 registry 装的
			return "registry";
		}

		/** 分组标题：固定组走字典，仓库组显示 owner/repo，本仓库的本地版额外标注。 */
		function groupTitleOf(key) {
			if (FIXED_GROUPS.has(key)) return key;
			if (key.startsWith("local:")) return `${key.slice(6)}（本地）`;
			const scp = /^[a-z]+:(.+)$/u.exec(key);
			return scp === null ? key : scp[1];
		}

		/** 组按插件数降序，组内按名称；空输入返回空数组。 */
		function groupEntries(entries) {
			const byKey = new Map();
			for (const entry of Array.isArray(entries) ? entries : []) {
				const key = groupKeyOf(entry);
				const list = byKey.get(key);
				if (list === undefined) byKey.set(key, [entry]);
				else list.push(entry);
			}
			const groups = [];
			for (const [key, list] of byKey) {
				list.sort((left, right) => String(left.name).localeCompare(String(right.name)));
				groups.push({ key, entries: list, count: list.length });
			}
			groups.sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
			return groups;
		}

		function readCollapsed(storage) {
			try {
				const raw = storage === null ? null : storage.getItem(COLLAPSED_KEY);
				const parsed = raw === null ? null : JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.keys)) return [];
				return parsed.keys.filter((key) => typeof key === "string" && key !== "");
			} catch (_) {
				return [];
			}
		}

		function writeCollapsed(storage, keys) {
			try {
				if (storage !== null) storage.setItem(COLLAPSED_KEY, JSON.stringify({ keys }));
			} catch (_) {
				/* 记不住折叠状态不算故障 */
			}
		}
		//#endregion

		const storage = (() => {
			try {
				return window.localStorage;
			} catch (_) {
				return null;
			}
		})();

		/** 模块级 store：tab 组件和刷新逻辑共享同一份快照。 */
		let snapshot = { status: "idle", groups: [], collapsed: readCollapsed(storage), error: null };
		const listeners = new Set();

		function subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		}

		function getSnapshot() {
			return snapshot;
		}

		function patch(next) {
			snapshot = { ...snapshot, ...next };
			for (const listener of [...listeners]) listener();
		}

		function useSnapshot() {
			return react.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
		}

		function toggleCollapsed(key) {
			const has = snapshot.collapsed.indexOf(key) !== -1;
			const collapsed = has ? snapshot.collapsed.filter((existing) => existing !== key) : [...snapshot.collapsed, key];
			writeCollapsed(storage, collapsed);
			patch({ collapsed });
		}

		let loading = false;

		async function load(ctx) {
			if (loading) return;
			loading = true;
			if (snapshot.status !== "ready") patch({ status: "loading" });
			try {
				const result = await ctx.remote.pluginManager.listBundles();
				if (result === undefined || result.ok !== true) {
					const message = result?.error?.message ?? "listBundles returned an error";
					patch({ status: "error", error: String(message) });
					return;
				}
				// Remote 的 listBundles 返回的 value 本身就是**数组**（不是 { entries }）；
				// 这里两种形态都兼容，避免再次读空。
				const raw = result.value;
				const entries = Array.isArray(raw) ? raw : Array.isArray(raw?.entries) ? raw.entries : [];
				patch({ status: "ready", groups: groupEntries(entries), error: null });
			} catch (error) {
				patch({ status: "error", error: error instanceof Error ? error.message : String(error) });
			} finally {
				loading = false;
			}
		}

		const rowStyle = {
			display: "flex",
			alignItems: "center",
			gap: "8px",
			padding: "5px 10px 5px 24px",
			borderRadius: "6px",
			cursor: "pointer",
			fontSize: "12.5px",
			lineHeight: "18px",
		};

		function GroupHeader({ group, label, collapsed, onToggle }) {
			return jsxs("button", {
				type: "button",
				onClick: onToggle,
				"aria-expanded": !collapsed,
				style: {
					display: "flex",
					alignItems: "center",
					gap: "8px",
					width: "100%",
					boxSizing: "border-box",
					// 明显的分组标题：浅色底 + 左侧强调色竖条 + 分隔
					background: "var(--dsw-alias-bg-secondary, rgba(255,255,255,0.05))",
					borderTop: "1px solid var(--dsw-alias-border-secondary, rgba(255,255,255,0.08))",
					borderRight: "0",
					borderBottom: "0",
					borderLeft: "3px solid var(--dsw-alias-state-business-primary, #6f8ff8)",
					borderRadius: "0 6px 6px 0",
					padding: "9px 10px",
					margin: "10px 0 3px",
					cursor: "pointer",
					font: "inherit",
					fontSize: "12.5px",
					fontWeight: "600",
					letterSpacing: "0.01em",
					color: "var(--dsw-alias-label-primary, #e6e6e6)",
					textAlign: "left",
				},
				children: [
					jsx("span", { "aria-hidden": "true", style: { fontSize: "9px", opacity: "0.7" }, children: collapsed ? "▸" : "▾" }),
					jsx("span", { style: { flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: label }),
					jsx("span", {
						style: {
							flex: "0 0 auto",
							opacity: "0.8",
							fontWeight: "400",
							fontSize: "11px",
							padding: "0 6px",
							borderRadius: "999px",
							background: "var(--dsw-alias-bg-primary, rgba(0,0,0,0.25))",
						},
						children: String(group.count),
					}),
				],
			});
		}

		function PluginRow({ entry, t, openPackage }) {
			const enabled = entry.enabled === true;
			const version = entry.version === undefined ? "" : String(entry.version);
			return jsxs("div", {
				role: "button",
				tabIndex: 0,
				onClick: () => openPackage(entry.name),
				onKeyDown: (event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						openPackage(entry.name);
					}
				},
				style: rowStyle,
				children: [
					jsx("span", {
						"aria-hidden": "true",
						style: {
							width: "6px",
							height: "6px",
							borderRadius: "50%",
							flex: "0 0 auto",
							background: enabled ? "var(--dsw-accent, #3fb6a8)" : "var(--dsw-text-tertiary, #888)",
						},
					}),
					jsx("span", {
						style: { flex: "1 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
						title: String(entry.name),
						children: String(entry.name),
					}),
					version === ""
						? null
						: jsx("span", {
								style: { opacity: "0.6", fontSize: "11px", flex: "0 0 auto" },
								children: version,
							}),
				].filter((node) => node !== null),
			});
		}

		function SourcesSection(props) {
			const { t, openPackage } = props;
			const state = useSnapshot();

			if (state.status === "idle" || state.status === "loading") {
				return jsx("div", { style: { padding: "24px 10px", opacity: "0.7", fontSize: "13px" }, children: t("loading") });
			}
			if (state.status === "error") {
				return jsxs("div", {
					style: { padding: "24px 10px", fontSize: "13px" },
					children: [
						jsx("div", { style: { marginBottom: "8px" }, children: `${t("error")}: ${state.error}` }),
					],
				});
			}
			if (state.groups.length === 0) {
				return jsx("div", { style: { padding: "24px 10px", opacity: "0.7", fontSize: "13px" }, children: t("empty") });
			}

			return jsx("div", {
				style: { display: "flex", flexDirection: "column", padding: "4px 0 16px" },
				children: state.groups.map((group) => {
					const collapsed = state.collapsed.indexOf(group.key) !== -1;
					const label = FIXED_GROUPS.has(group.key) ? t(`group.${group.key}`) : groupTitleOf(group.key);
					return jsxs(
						"section",
						{
							style: { display: "flex", flexDirection: "column" },
							children: [
								jsx(GroupHeader, {
									group,
									label,
									collapsed,
									onToggle: () => toggleCollapsed(group.key),
								}),
								collapsed
									? null
									: jsxs(
											"div",
											{
												style: { display: "flex", flexDirection: "column", gap: "1px" },
												children: group.entries.map((entry) =>
													jsx(PluginRow, { entry, t, openPackage }, String(entry.name)),
												),
											},
										),
							].filter((node) => node !== null),
						},
						group.key,
					);
				}),
			});
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "plugin-sources: dictionaries");
			const t = ctx.locale.bind(NS);

			// 只读 Host 已配置的来源；权限被收回时静默停下，不把页面搞坏。
			ctx.remoteAccess.whenAccess("pluginManager/listBundles", function* () {
				void load(ctx);
				yield ctx.remote.$on("plugin-manager/changed", () => void load(ctx));
			});

			ctx.slots.inject("plugins.tab", () =>
				ctx.slots.register(
					{ name: "plugins.tab", id: "plugin-sources", label: () => t("title"), locale: NS, order: 20 },
					SourcesSection,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "remote", "remote.pluginManager", "remoteAccess"];
		return module.exports;
	},
});
