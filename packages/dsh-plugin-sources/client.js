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
			subtitle: "已安装插件 · 按来源分组",
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
			"status.on": "运行中",
			"status.off": "已停用",
			"status.error": "启动失败",
			"status.missing": "文件缺失",
			"badge.removable": "可卸载",
			"badge.builtin": "安装自带",
			"toggle.enable": "启用 {name}",
			"toggle.disable": "停用 {name}",
			"action.uninstall": "卸载",
			"action.open": "查看 {name} 的详情",
			"action.cancel": "取消",
			"action.confirm": "确认卸载",
			"busy.applying": "处理中…",
			"confirm.title": "卸载插件",
			"confirm.body": "将从本机 profile 移除 {name}。插件文件会被删除，需要时可以重新安装。",
			"notice.enabled": "已启用 {name}",
			"notice.disabled": "已停用 {name}",
			"notice.uninstalled": "已卸载 {name}",
			"notice.restart": "改动已写入，重启 DSH 后生效（{reason}）",
			"notice.overridden": "{name} 的改动被其他层覆盖",
			"notice.cancelled": "已取消对 {name} 的改动",
			"notice.failed": "操作失败：{reason}",
			"error.unknown": "未知错误",
			"error.managementRequired": "Host 没有开启插件管理",
			"error.notRemovable": "这个插件由 DSH 自带，不能卸载",
			"error.bundleInUse": "插件正在使用中，先停用再试",
			"error.unknownPlugin": "Host 上找不到这个插件",
			"error.stopProfile": "需要先停止正在运行的 profile",
			"error.operationError": "Host 操作出错",
			"error.unsupportedPlatform": "当前平台不支持这个插件",
			"error.incompatible": "这个插件与当前 DSH 版本不兼容",
			"reason.noHmr": "该 profile 只在启动时应用改动",
			"reason.packageMoved": "插件包目录发生了变化",
			"reason.hostModule": "改动涉及 Host 自身导入的模块",
			"reason.unmanagedPlugin": "插件运行在 Loader 之外",
			"reason.moduleComparison": "无法把已加载模块与磁盘对比",
			"reason.other": "原因未知",
		};
		const en = {
			title: "By source",
			subtitle: "Installed plugins · grouped by source",
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
			"status.on": "Running",
			"status.off": "Off",
			"status.error": "Failed to start",
			"status.missing": "Files missing",
			"badge.removable": "removable",
			"badge.builtin": "built in",
			"toggle.enable": "Enable {name}",
			"toggle.disable": "Disable {name}",
			"action.uninstall": "Uninstall",
			"action.open": "Open {name}",
			"action.cancel": "Cancel",
			"action.confirm": "Uninstall",
			"busy.applying": "Working…",
			"confirm.title": "Uninstall plugin",
			"confirm.body": "Removes {name} from this profile. Its files are deleted; you can install it again later.",
			"notice.enabled": "Enabled {name}",
			"notice.disabled": "Disabled {name}",
			"notice.uninstalled": "Uninstalled {name}",
			"notice.restart": "Saved; restart DSH to apply the change ({reason})",
			"notice.overridden": "{name} is overridden by another layer",
			"notice.cancelled": "Cancelled the change to {name}",
			"notice.failed": "Failed: {reason}",
			"error.unknown": "Unknown error",
			"error.managementRequired": "This Host does not manage a profile",
			"error.notRemovable": "This plugin ships with DSH and cannot be uninstalled",
			"error.bundleInUse": "The plugin is in use; disable it first",
			"error.unknownPlugin": "The Host does not know this plugin",
			"error.stopProfile": "The running profile must stop first",
			"error.operationError": "The Host operation failed",
			"error.unsupportedPlatform": "This platform does not support the plugin",
			"error.incompatible": "The plugin is incompatible with this DSH version",
			"reason.noHmr": "this profile applies changes only at startup",
			"reason.packageMoved": "the package directory moved",
			"reason.hostModule": "the change reaches modules the Host itself imports",
			"reason.unmanagedPlugin": "the plugin runs outside the Loader",
			"reason.moduleComparison": "loaded modules could not be compared with disk",
			"reason.other": "reason unknown",
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

		/**
		 * 这个视图只列**已安装**的插件：profile 里声明过依赖的 bundle（`installed`），
		 * 或者由 profile 提供的包。安装自带但没被选中的内置 bundle 不进列表——
		 * 它们属于 Plugins 页的 Installed/Discover。
		 */
		function isInstalledEntry(entry) {
			if (entry === null || typeof entry !== "object") return false;
			if (entry.installed === true) return true;
			return entry.availability === "profile";
		}

		/** 从 Host 的 bundle 清单里挑出已安装的那些；非数组返回空数组。 */
		function visibleEntries(entries) {
			return (Array.isArray(entries) ? entries : []).filter(isInstalledEntry);
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

		//#region display
		/** 当前界面语言；拿不到就按中文对待（本机默认中文界面）。 */
		function currentLanguage() {
			try {
				const declared =
					typeof document !== "undefined" && document.documentElement !== null
						? document.documentElement.lang
						: "";
				const raw = declared || (typeof navigator !== "undefined" ? navigator.language : "") || "zh";
				const text = String(raw).toLowerCase();
				return text.startsWith("zh") ? "zh" : text.split("-")[0];
			} catch (_) {
				return "zh";
			}
		}

		/** LocalizedText → 显示文本：字符串原样；对象按当前语言 → en → 第一个字符串。 */
		function localizedText(value) {
			if (typeof value === "string") return value;
			if (value === null || typeof value !== "object") return "";
			const language = currentLanguage();
			if (typeof value[language] === "string") return value[language];
			if (typeof value.en === "string") return value.en;
			for (const key of Object.keys(value)) {
				if (typeof value[key] === "string") return value[key];
			}
			return "";
		}

		/** 卡片标题：本地化标题 → 去掉 dsh 前缀的包名 → 完整包名。 */
		function displayTitle(entry) {
			const title = localizedText(entry?.meta?.title);
			if (title !== "") return title;
			const name = String(entry?.name ?? "");
			const unscoped = name.startsWith("@") ? name.slice(name.indexOf("/") + 1) : name;
			return unscoped.replace(/^dsh-(?:host-|client-)?/u, "") || name;
		}

		/** 卡片简介：本地化简介 → 包 manifest 的 description。 */
		function displayDescription(entry) {
			const localized = localizedText(entry?.meta?.description);
			if (localized !== "") return localized;
			return typeof entry?.description === "string" ? entry.description : "";
		}

		/** 一行状态：Host 报错 → 文件缺失 → 已启用/已停用。 */
		function statusOf(entry) {
			if (entry?.error !== undefined) return "error";
			if (entry?.availability === "missing") return "missing";
			return entry?.enabled === true ? "on" : "off";
		}

		/** 来源 spec 压成一行：hosted 源只留 owner/repo，过长的截断。 */
		function compactSource(source) {
			const hosted = /^(github|gitlab|bitbucket):(.+)$/u.exec(source);
			if (hosted !== null) return `${hosted[1]}:${hosted[2].split(/[#&]/u)[0]}`;
			return source.length > 92 ? `${source.slice(0, 89)}…` : source;
		}

		/** 卡片下方那行元信息：版本 · 包名 · 来源。 */
		function sourceSummary(entry) {
			const version = typeof entry?.version === "string" && entry.version !== "" ? `v${entry.version}` : "";
			const source = typeof entry?.source === "string" && entry["source"] !== "" ? compactSource(entry.source) : "";
			return [version, String(entry?.name ?? ""), source].filter((part) => part !== "").join(" · ");
		}

		/** Host 管理错误码 → 字典 key。 */
		const ERROR_KEYS = {
			"management-required": "error.managementRequired",
			"not-removable": "error.notRemovable",
			"bundle-in-use": "error.bundleInUse",
			"unknown-plugin": "error.unknownPlugin",
			"stop-profile": "error.stopProfile",
			"operation-error": "error.operationError",
			"unsupported-platform": "error.unsupportedPlatform",
			"incompatible-version": "error.incompatible",
		};

		/** 一个 Host 错误读成人话；operation-error 用 Host 自己的诊断。 */
		function managementText(error, t) {
			const code = error?.code;
			const diagnostic = typeof error?.diagnostic === "string" ? error.diagnostic : "";
			const key = code === undefined ? undefined : ERROR_KEYS[code];
			if (key !== undefined && !(code === "operation-error" && diagnostic !== "")) return t(key);
			if (diagnostic !== "") return diagnostic;
			if (key !== undefined) return t(key);
			return code === undefined ? t("error.unknown") : String(code);
		}

		/** 改动为什么要等重启。 */
		const RESTART_KEYS = {
			"no-hmr": "reason.noHmr",
			"package-moved": "reason.packageMoved",
			"host-module": "reason.hostModule",
			"unmanaged-plugin": "reason.unmanagedPlugin",
			"module-comparison": "reason.moduleComparison",
		};

		function restartReasonText(reason, t) {
			const key = reason === undefined ? undefined : RESTART_KEYS[reason];
			return t(key === undefined ? "reason.other" : key);
		}
		//#endregion

		const storage = (() => {
			try {
				return window.localStorage;
			} catch (_) {
				return null;
			}
		})();

		/** 模块级 store：tab 组件和刷新/操作逻辑共享同一份快照。 */
		let snapshot = {
			status: "idle",
			groups: [],
			collapsed: readCollapsed(storage),
			error: null,
			/** 正在处理的 bundle：name → { pending: "enable" | "disable" | "uninstall" }。 */
			ops: {},
			/** 顶部一行操作结果：{ tone: "ok" | "error", text, seq }。 */
			notice: null,
			/** 待确认的卸载：{ name, title }。 */
			confirm: null,
		};
		const listeners = new Set();
		/** apply 时写入的 Client ctx；操作与刷新都从这里走。 */
		let service = null;
		let noticeSeq = 0;
		let noticeTimer = null;

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

		function setPending(name, pending) {
			const ops = { ...snapshot.ops };
			if (pending === null) delete ops[name];
			else ops[name] = { pending };
			patch({ ops });
		}

		/** 顶部提示，6 秒后自动收起；后到的提示顶掉前一条。 */
		function say(tone, text) {
			const seq = ++noticeSeq;
			patch({ notice: { tone, text, seq } });
			if (noticeTimer !== null) clearTimeout(noticeTimer);
			noticeTimer = setTimeout(() => {
				noticeTimer = null;
				if (snapshot.notice !== null && snapshot.notice.seq === seq) patch({ notice: null });
			}, 6000);
		}

		let loading = false;

		/** 读一次 Host 的 bundle 清单；只保留已安装的，按来源分组。 */
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
				patch({ status: "ready", groups: groupEntries(visibleEntries(entries)), error: null });
			} catch (error) {
				patch({ status: "error", error: error instanceof Error ? error.message : String(error) });
			} finally {
				loading = false;
			}
		}

		/** 把一次 ChangeResult 翻成顶部提示；失败同时保留在 ops 里。 */
		function settleChange(name, action, answer, t) {
			if (answer === undefined || answer === null) {
				say("error", t("notice.failed", { reason: t("error.unknown") }));
				return;
			}
			if (answer.ok !== true) {
				const reason = answer.error?.message ?? t("error.unknown");
				say("error", t("notice.failed", { reason: String(reason) }));
				return;
			}
			const value = answer.value ?? {};
			if (value.error !== undefined) {
				say("error", t("notice.failed", { reason: managementText(value.error, t) }));
				return;
			}
			const application = value.application;
			if (application === "restart-required") {
				say("ok", t("notice.restart", { reason: restartReasonText(value.restartReason, t) }));
				return;
			}
			if (application === "failed") {
				say("error", t("notice.failed", { reason: t("error.operationError") }));
				return;
			}
			if (application === "overridden") {
				say("ok", t("notice.overridden", { name }));
				return;
			}
			if (application === "cancelled") {
				say("ok", t("notice.cancelled", { name }));
				return;
			}
			say("ok", t(action === "uninstall" ? "notice.uninstalled" : action === "enable" ? "notice.enabled" : "notice.disabled", { name }));
		}

		/**
		 * 执行一次启停或卸载：先标忙，再调 Host，最后无论成败都重读一次清单
		 * （Host 的 plugin-manager/changed 事件也会触发重读，这里兜底）。
		 */
		async function runMutation(name, action, t) {
			if (service === null) return;
			if (snapshot.ops[name] !== undefined) return;
			setPending(name, action);
			try {
				const answer =
					action === "uninstall"
						? await service.remote.pluginManager.removeBundle(name)
						: await service.remote.pluginManager.setBundleEnabled(name, action === "enable");
				settleChange(name, action, answer, t);
			} catch (error) {
				say("error", t("notice.failed", { reason: error instanceof Error ? error.message : String(error) }));
			} finally {
				setPending(name, null);
				void load(service);
			}
		}

		function askUninstall(entry) {
			patch({ confirm: { name: String(entry.name), title: displayTitle(entry) } });
		}

		function closeConfirm() {
			patch({ confirm: null });
		}

		const STYLES = `
.dsh-plugin-sources-root { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 24px; box-sizing: border-box; }
.dsh-plugin-sources-subtitle { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #8f8f8f); }
.dsh-plugin-sources-state { padding: 24px 4px; font-size: 13px; line-height: 20px; opacity: 0.75; }
.dsh-plugin-sources-group { display: flex; flex-direction: column; gap: 6px; }
.dsh-plugin-sources-group-header { display: flex; align-items: center; gap: 8px; width: 100%; box-sizing: border-box; margin: 10px 0 3px; padding: 9px 10px; border: 0; border-left: 3px solid var(--dsw-alias-state-business-primary, #6f8ff8); border-radius: 0 6px 6px 0; background: var(--dsw-alias-bg-secondary, rgba(255,255,255,0.05)); color: var(--dsw-alias-label-primary, #e6e6e6); font: inherit; font-size: 12.5px; font-weight: 600; letter-spacing: 0.01em; text-align: left; cursor: pointer; }
.dsh-plugin-sources-group-header:hover { background: var(--dsw-alias-bg-tertiary, rgba(255,255,255,0.08)); }
.dsh-plugin-sources-group-caret { font-size: 9px; opacity: 0.7; }
.dsh-plugin-sources-group-title { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-plugin-sources-group-count { flex: 0 0 auto; padding: 0 6px; border-radius: 999px; background: var(--dsw-alias-bg-primary, rgba(0,0,0,0.25)); font-size: 11px; font-weight: 400; opacity: 0.85; }
.dsh-plugin-sources-cards { display: flex; flex-direction: column; gap: 2px; margin: 0; padding: 0; list-style: none; }
.dsh-plugin-sources-card { display: flex; flex-direction: column; margin: 0 -8px; border-radius: 12px; }
.dsh-plugin-sources-card:hover { background: var(--dsw-alias-bg-secondary, rgba(255,255,255,0.05)); }
.dsh-plugin-sources-head { display: flex; align-items: center; gap: 14px; padding: 8px; }
.dsh-plugin-sources-artwork { display: inline-flex; flex: none; align-items: center; justify-content: center; width: 48px; height: 48px; overflow: hidden; border: 0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.12)); border-radius: 10px; color: var(--dsw-alias-label-secondary, #b4b4b4); }
.dsh-plugin-sources-artwork img { width: 44px; height: 44px; object-fit: contain; }
.dsh-plugin-sources-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dsh-plugin-sources-title-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.dsh-plugin-sources-title { max-width: 100%; padding: 0; border: 0; background: none; color: inherit; font: inherit; font-size: 14px; line-height: 20px; font-weight: 500; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.dsh-plugin-sources-title:hover { text-decoration: underline; }
.dsh-plugin-sources-desc { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 13px; line-height: 18px; color: var(--dsw-alias-label-tertiary, #9a9a9a); }
.dsh-plugin-sources-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary, #8f8f8f); opacity: 0.85; }
.dsh-plugin-sources-end { display: flex; flex: none; align-items: center; gap: 8px; }
.dsh-plugin-sources-tag { display: inline-flex; align-items: center; height: 18px; padding: 0 7px; border: 0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.16)); border-radius: 999px; font-size: 10px; line-height: 1; white-space: nowrap; color: var(--dsw-alias-label-secondary, #b0b0b0); }
.dsh-plugin-sources-tag[data-tone="on"] { color: var(--dsw-alias-state-success-primary, #45bf8f); border-color: currentColor; }
.dsh-plugin-sources-tag[data-tone="off"] { opacity: 0.7; }
.dsh-plugin-sources-tag[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #e5676f); border-color: currentColor; }
.dsh-plugin-sources-switch { position: relative; display: inline-flex; flex: none; align-items: center; width: 34px; height: 20px; padding: 2px; box-sizing: border-box; border: 0; border-radius: 999px; background: rgba(255,255,255,0.16); cursor: pointer; transition: background 120ms ease; }
.dsh-plugin-sources-switch[data-checked="true"] { background: var(--dsw-alias-state-business-primary, #6f8ff8); }
.dsh-plugin-sources-switch:disabled { cursor: default; opacity: 0.5; }
.dsh-plugin-sources-switch-knob { display: block; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 120ms ease; }
.dsh-plugin-sources-switch[data-checked="true"] .dsh-plugin-sources-switch-knob { transform: translateX(14px); }
.dsh-plugin-sources-busy { font-size: 11px; color: var(--dsw-alias-label-tertiary, #9a9a9a); }
.dsh-plugin-sources-uninstall { padding: 3px 10px; border: 0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.16)); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary, #b0b0b0); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; }
.dsh-plugin-sources-uninstall:hover { border-color: var(--dsw-alias-state-error-primary, #e5676f); color: var(--dsw-alias-state-error-primary, #e5676f); background: rgba(229,103,111,0.1); }
.dsh-plugin-sources-uninstall:disabled { cursor: default; opacity: 0.5; }
.dsh-plugin-sources-error { margin: 0; padding: 0 8px 10px 70px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary, #e5676f); overflow-wrap: anywhere; }
.dsh-plugin-sources-notice { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border: 0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.14)); border-radius: 10px; font-size: 12.5px; line-height: 18px; }
.dsh-plugin-sources-notice[data-tone="ok"] { color: var(--dsw-alias-state-success-primary, #45bf8f); border-color: currentColor; }
.dsh-plugin-sources-notice[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #e5676f); border-color: currentColor; }
.dsh-plugin-sources-mask { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.45); }
.dsh-plugin-sources-dialog { display: flex; flex-direction: column; gap: 12px; width: min(420px, calc(100vw - 48px)); box-sizing: border-box; padding: 20px; border: 0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.14)); border-radius: 14px; background: var(--dsw-alias-bg-primary, #262626); box-shadow: 0 18px 48px rgba(0,0,0,0.45); }
.dsh-plugin-sources-dialog-title { font-size: 15px; line-height: 22px; font-weight: 600; }
.dsh-plugin-sources-dialog-body { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary, #b8b8b8); }
.dsh-plugin-sources-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dsh-plugin-sources-dialog-button { padding: 5px 14px; border: 0.5px solid var(--dsw-alias-border-l3, rgba(255,255,255,0.16)); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; }
.dsh-plugin-sources-dialog-button[data-primary="true"] { border-color: transparent; background: var(--dsw-alias-state-error-primary, #e5676f); color: #fff; }
`;

		/** 当前语言下的文案；t 缺失时退回 key。 */
		function translate(props) {
			const bound = props.t;
			if (typeof bound !== "function") return (key) => key;
			return bound;
		}

		/** 默认插件图：没有 meta.icon 时画一个中性的插头形状。 */
		function DefaultArtwork() {
			return jsx("svg", {
				viewBox: "0 0 24 24",
				width: 22,
				height: 22,
				"aria-hidden": "true",
				focusable: "false",
				children: jsx("path", {
					d: "M9 3v5H7.5A2.5 2.5 0 0 0 5 10.5V13a7 7 0 0 0 6 6.93V21h2v-1.07A7 7 0 0 0 19 13v-2.5A2.5 2.5 0 0 0 16.5 8H15V3h-2v5h-2V3H9Z",
					fill: "currentColor",
				}),
			});
		}

		/** 卡片左侧图标：meta.icon 是 Host 给的 data URL，解码失败退回默认图。 */
		function Artwork({ icon }) {
			const [failed, setFailed] = react.useState(false);
			if (typeof icon !== "string" || icon === "" || failed) {
				return jsx("span", { className: "dsh-plugin-sources-artwork", "aria-hidden": "true", children: jsx(DefaultArtwork, {}) });
			}
			return jsxs("span", {
				className: "dsh-plugin-sources-artwork",
				"aria-hidden": "true",
				children: jsx("img", { src: icon, alt: "", onError: () => setFailed(true) }),
			});
		}

		function GroupHeader({ group, label, collapsed, onToggle }) {
			return jsxs("button", {
				type: "button",
				onClick: onToggle,
				"aria-expanded": !collapsed,
				className: "dsh-plugin-sources-group-header",
				children: [
					jsx("span", { "aria-hidden": "true", className: "dsh-plugin-sources-group-caret", children: collapsed ? "▸" : "▾" }),
					jsx("span", { className: "dsh-plugin-sources-group-title", children: label }),
					jsx("span", { className: "dsh-plugin-sources-group-count", children: String(group.count) }),
				],
			});
		}

		/** 状态标签：运行中 / 已停用 / 启动失败 / 文件缺失。 */
		function StatusTag({ status, t }) {
			if (status === "on") return jsx("span", { className: "dsh-plugin-sources-tag", "data-tone": "on", children: t("status.on") });
			if (status === "error") return jsx("span", { className: "dsh-plugin-sources-tag", "data-tone": "error", children: t("status.error") });
			if (status === "missing") return jsx("span", { className: "dsh-plugin-sources-tag", "data-tone": "error", children: t("status.missing") });
			return jsx("span", { className: "dsh-plugin-sources-tag", "data-tone": "off", children: t("status.off") });
		}

		function Toggle({ entry, title, busy, t }) {
			const checked = entry.enabled === true;
			const readOnly = entry.readOnlyReason !== undefined;
			const disabled = busy || readOnly;
			const label = t(checked ? "toggle.disable" : "toggle.enable", { name: title });
			return jsx("button", {
				type: "button",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				title: readOnly ? managementText({ code: entry.readOnlyReason }, t) : label,
				disabled,
				className: "dsh-plugin-sources-switch",
				"data-checked": checked ? "true" : "false",
				onClick: () => {
					if (disabled) return;
					void runMutation(String(entry.name), checked ? "disable" : "enable", t);
				},
				children: jsx("span", { className: "dsh-plugin-sources-switch-knob" }),
			});
		}

		function PluginCard({ entry, t, openPackage }) {
			const name = String(entry.name);
			const title = displayTitle(entry);
			const description = displayDescription(entry);
			const status = statusOf(entry);
			const pending = snapshot.ops[name]?.pending;
			const busy = pending !== undefined;
			const removable = entry.removable === true;
			const canOpen = typeof openPackage === "function";
			return jsxs("li", {
				className: "dsh-plugin-sources-card",
				"data-plugin-sources-package": name,
				"data-plugin-sources-status": status,
				children: [
					jsxs("div", {
						className: "dsh-plugin-sources-head",
						children: [
							jsx(Artwork, { icon: entry.meta?.icon }),
							jsxs("div", {
								className: "dsh-plugin-sources-main",
								children: [
									jsxs("div", {
										className: "dsh-plugin-sources-title-row",
										children: [
											canOpen
												? jsx("button", {
														type: "button",
														className: "dsh-plugin-sources-title",
														title,
														"aria-label": t("action.open", { name: title }),
														onClick: () => openPackage(name),
														children: title,
													})
												: jsx("span", { className: "dsh-plugin-sources-title", children: title }),
											jsx(StatusTag, { status, t }),
											jsx("span", {
												className: "dsh-plugin-sources-tag",
												children: removable ? t("badge.removable") : t("badge.builtin"),
											}),
										],
									}),
									description === "" ? null : jsx("span", { className: "dsh-plugin-sources-desc", children: description }),
									jsx("span", {
										className: "dsh-plugin-sources-meta",
										title: typeof entry.source === "string" ? entry.source : name,
										children: sourceSummary(entry),
									}),
								],
							}),
							jsxs("div", {
								className: "dsh-plugin-sources-end",
								children: [
									busy ? jsx("span", { className: "dsh-plugin-sources-busy", children: t("busy.applying") }) : null,
									jsx(Toggle, { entry, title, busy, t }),
									removable
										? jsx("button", {
												type: "button",
												disabled: busy,
												className: "dsh-plugin-sources-uninstall",
												onClick: () => askUninstall(entry),
												children: t("action.uninstall"),
											})
										: null,
								],
							}),
						],
					}),
					entry.error === undefined
						? null
						: jsx("p", { className: "dsh-plugin-sources-error", role: "status", children: managementText(entry.error, t) }),
				],
			});
		}

		function ConfirmDialog({ confirm, t }) {
			if (confirm === null) return null;
			return jsx("div", {
				className: "dsh-plugin-sources-mask",
				children: jsxs("div", {
					className: "dsh-plugin-sources-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": t("confirm.title"),
					children: [
						jsx("div", { className: "dsh-plugin-sources-dialog-title", children: t("confirm.title") }),
						jsx("div", { className: "dsh-plugin-sources-dialog-body", children: t("confirm.body", { name: confirm.title }) }),
						jsxs("div", {
							className: "dsh-plugin-sources-dialog-actions",
							children: [
								jsx("button", {
									type: "button",
									className: "dsh-plugin-sources-dialog-button",
									onClick: closeConfirm,
									children: t("action.cancel"),
								}),
								jsx("button", {
									type: "button",
									className: "dsh-plugin-sources-dialog-button",
									"data-primary": "true",
									onClick: () => {
										closeConfirm();
										void runMutation(confirm.name, "uninstall", t);
									},
									children: t("action.confirm"),
								}),
							],
						}),
					],
				}),
			});
		}

		function SourcesSection(props) {
			const t = translate(props);
			const openPackage = props.openPackage;
			const state = useSnapshot();

			if (state.status === "idle" || state.status === "loading") {
				return jsx("div", {
					className: "dsh-plugin-sources-root",
					children: jsxs("div", {
						className: "dsh-plugin-sources-state",
						children: [jsx("style", { children: STYLES }), t("loading")],
					}),
				});
			}
			if (state.status === "error") {
				return jsx("div", {
					className: "dsh-plugin-sources-root",
					children: jsxs("div", {
						className: "dsh-plugin-sources-state",
						children: [jsx("style", { children: STYLES }), `${t("error")}: ${state.error}`],
					}),
				});
			}
			if (state.groups.length === 0) {
				return jsx("div", {
					className: "dsh-plugin-sources-root",
					children: jsxs("div", {
						className: "dsh-plugin-sources-state",
						children: [jsx("style", { children: STYLES }), t("empty")],
					}),
				});
			}

			return jsxs("div", {
				className: "dsh-plugin-sources-root",
				children: [
					jsx("style", { children: STYLES }),
					jsx("div", { className: "dsh-plugin-sources-subtitle", children: t("subtitle") }),
					state.notice === null
						? null
						: jsx("div", {
								className: "dsh-plugin-sources-notice",
								"data-tone": state.notice.tone,
								role: "status",
								children: state.notice.text,
							}),
					...state.groups.map((group) => {
						const collapsed = state.collapsed.indexOf(group.key) !== -1;
						const label = FIXED_GROUPS.has(group.key) ? t(`group.${group.key}`) : groupTitleOf(group.key);
						return jsxs(
							"section",
							{
								className: "dsh-plugin-sources-group",
								children: [
									jsx(GroupHeader, {
										group,
										label,
										collapsed,
										onToggle: () => toggleCollapsed(group.key),
									}),
									collapsed
										? null
										: jsx("ul", {
												className: "dsh-plugin-sources-cards",
												children: group.entries.map((entry) =>
													jsx(PluginCard, { entry, t, openPackage }, String(entry.name)),
												),
											}),
								].filter((node) => node !== null),
							},
							group.key,
						);
					}),
					jsx(ConfirmDialog, { confirm: state.confirm, t }),
				],
			});
		}

		function apply(ctx) {
			service = ctx;
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "plugin-sources: dictionaries");

			// 只读 Host 已配置的来源；权限被收回时静默停下，不把页面搞坏。
			ctx.remoteAccess.whenAccess("pluginManager/listBundles", function* () {
				void load(ctx);
				yield ctx.remote.$on("plugin-manager/changed", () => void load(ctx));
			});

			const t = ctx.locale.bind(NS);
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
