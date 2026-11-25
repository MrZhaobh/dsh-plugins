window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-sidebar-switch",
	factory: (require) => {
		const module = { exports: {} };
		const exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const jsxRuntime = require("react/jsx-runtime");
		const jsx = jsxRuntime.jsx;
		const jsxs = jsxRuntime.jsxs;

		const NS = "sidebar-switch";
		const TARGET = "@mrzhaobh/dsh-sidebar-day";
		/** 目标行被禁用时远程不会再报 entryId，这里保留一个已知的兜底值。 */
		const FALLBACK_ENTRY = "include:sidebar-day";

		const zh = {
			toDay: "切到按天分组",
			toOfficial: "切回官方会话列表",
			modeDay: "按天分组",
			modeOfficial: "官方列表",
			missing: "按天分组插件未安装",
			failed: "切换失败",
		};
		const en = {
			toDay: "Switch to grouping by day",
			toOfficial: "Switch to the built-in session list",
			modeDay: "By day",
			modeOfficial: "Built-in list",
			missing: "The by-day plugin is not installed",
			failed: "Switch failed",
		};

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "sidebar-switch: dictionaries");
			const t = ctx.locale.bind(NS);

			// 当前状态：目标 bundle 是否存在、它的行是否启用。
			let state = { available: false, enabled: false, entryId: FALLBACK_ENTRY };
			const listeners = new Set();
			const emit = () => {
				for (const listener of [...listeners]) listener();
			};
			const patch = (next) => {
				state = { ...state, ...next };
				emit();
			};
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const getSnapshot = () => state;

			const refresh = async () => {
				try {
					const result = await ctx.remote.pluginManager.listBundles();
					if (result?.ok !== true) return;
					const entry = result.value?.entries?.find((item) => item.name === TARGET);
					const row = entry?.rows?.[0];
					patch({
						available: entry !== undefined,
						enabled: entry?.enabled === true,
						entryId: row?.entryId ?? FALLBACK_ENTRY,
					});
				} catch (error) {
					console.warn("sidebar-switch: listBundles failed", error);
				}
			};

			ctx.remoteAccess.whenAccess("pluginManager/listBundles", function* () {
				void refresh();
				yield ctx.remote.$on("plugin-manager/changed", () => void refresh());
			});

			let busy = false;
			const toggle = async () => {
				if (busy) return;
				busy = true;
				try {
					const next = !state.enabled;
					const manager = ctx.remote?.pluginManager;
					if (manager === undefined || typeof manager.setPluginEnabled !== "function") {
						throw new Error("remote.pluginManager.setPluginEnabled 不可用");
					}
					const result = await manager.setPluginEnabled(state.entryId, next);
					if (result?.ok !== true) {
						throw new Error(result?.error?.code ?? result?.error?.message ?? "Host 拒绝了这次切换");
					}
					patch({ error: "" });
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					console.warn("sidebar-switch: setPluginEnabled failed", error);
					patch({ error: message });
				} finally {
					busy = false;
					void refresh();
				}
			};

			function Toggle() {
				const current = react.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
				const enabled = current.enabled;
				const failed = typeof current.error === "string" && current.error !== "";
				const hint = failed
					? current.error
					: current.available === false
						? t("missing")
						: enabled
							? t("toOfficial")
							: t("toDay");
				const text = failed ? t("failed") : enabled ? t("modeDay") : t("modeOfficial");
				return jsxs("button", {
					type: "button",
					title: hint,
					"aria-label": hint,
					"aria-pressed": enabled,
					"data-sidebar-switch": failed ? "failed" : enabled ? "day" : "official",
					onClick: () => void toggle(),
					style: {
						display: "flex",
						alignItems: "center",
						gap: "6px",
						width: "100%",
						boxSizing: "border-box",
						background: "var(--dsw-alias-bg-secondary, rgba(255,255,255,0.05))",
						border: failed
							? "1px solid var(--dsw-alias-state-error-primary, #e5534b)"
							: "1px solid var(--dsw-alias-border-secondary, rgba(255,255,255,0.10))",
						borderRadius: "8px",
						padding: "5px 8px",
						margin: "2px 0",
						cursor: "pointer",
						color: failed ? "var(--dsw-alias-state-error-primary, #e5534b)" : "inherit",
						font: "inherit",
						fontSize: "12px",
						lineHeight: "16px",
						textAlign: "left",
						opacity: current.available === false ? 0.5 : 1,
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
					{ name: "sidebar.footer.action", id: "sidebar-switch", order: 41, locale: NS },
					Toggle,
				),
			);
		}

		exports.apply = apply;
		exports.inject = ["slots", "locale", "remote", "remote.pluginManager", "remoteAccess"];
		return module.exports;
	},
});
