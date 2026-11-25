window.__ModuleLoader__.load({
	id: "@mrzhaobh/dsh-composer-heal",
	factory: () => {
		/**
		 * 输入框（composer）自愈。
		 *
		 * 背景：DSH 的输入框是 "conversation.composer.bar" 这个 single 型槽位的条目，
		 * 渲染期崩一次就会被永久注销（slot 仲裁的「崩溃即退位」），插件热替换失败也不
		 * 回滚，所以只能整页重载才能重新注册。这个插件只做一件事：发现「会话已打开、
		 * 但输入框真的没了」时，自动重载页面，并记录现场（哪个会话、哪些槽位报错），
		 * 下次好定位真凶。
		 *
		 * 三条安全线：
		 *   1. 只在「会话已打开」时判断，新会话 hero / 设置页 / 文件页一律不管；
		 *   2. 连续 2 次（约 2 秒）探到才动手，避免会话切换的瞬态误判；
		 *   3. 10 分钟内最多自动重载 3 次，超过就停手并挂一条提示，绝不刷新死循环。
		 */
		const LOG_KEY = "dsh.myTool.composerHeal";
		const TICK_MS = 1000;
		const MISSING_TICKS = 2;
		const MAX_RELOADS = 3;
		const RELOAD_WINDOW_MS = 10 * 60 * 1000;
		const WARMUP_MS = 4000;
		/** 输入框卡片的高度下限；低于它基本可以断定座位是空的。 */
		const SEAT_MIN_HEIGHT = 24;

		const now = () => Date.now();

		function readState() {
			try {
				const raw = window.localStorage.getItem(LOG_KEY);
				const parsed = raw === null ? null : JSON.parse(raw);
				if (parsed !== null && typeof parsed === "object") {
					return {
						reloads: Array.isArray(parsed.reloads) ? parsed.reloads.filter((t) => typeof t === "number") : [],
						events: Array.isArray(parsed.events) ? parsed.events : [],
					};
				}
			} catch (_) {
				/* 存储不可用就当作空账本，自愈本身不能因此挂掉 */
			}
			return { reloads: [], events: [] };
		}

		function writeState(state) {
			try {
				state.events = state.events.slice(-20);
				state.reloads = state.reloads.slice(-10);
				window.localStorage.setItem(LOG_KEY, JSON.stringify(state));
			} catch (_) {
				/* ignore */
			}
		}

		/** 同源相对路径：桌面版经 dsh-app://app 转发到 Host，Web 版直接命中同一台服务。 */
		const LOG_ROUTE = "/composer-self-heal/log";
		let lastReport = Promise.resolve();

		/**
		 * 把现场同步给 host，落进 `$DSH_HOME/logs/composer-heal.jsonl`。
		 * localStorage 只是副本（清缓存就没），真正给人事后查的是这个文件。
		 */
		function report(event) {
			lastReport = (async () => {
				try {
					await fetch(LOG_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ event }),
						keepalive: true,
					});
				} catch (_) {
					/* 落盘是尽力而为：自愈本身不能因为日志送不出去而失败 */
				}
			})();
			return lastReport;
		}

		function record(state, event) {
			state.events.push(event);
			writeState(state);
			void report(event);
		}

		/**
		 * 顺手接管 console.error：slot 崩溃是 console.error 出来的，记下原文，
		 * 事后就能知道到底是哪个槽位、什么错（这是"彻底修"的唯一线索）。
		 */
		function watchSlotCrashes(state) {
			const original = console.error;
			if (original.__composerHealWrapped === true) return;
			const wrapped = function (...args) {
				try {
					const head = args[0];
					if (typeof head === "string" && head.indexOf("slot entry crashed in") !== -1) {
						record(state, {
							kind: "slot-crash",
							at: now(),
							detail: args
								.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg)))
								.join(" ")
								.slice(0, 1500),
						});
					}
				} catch (_) {
					/* ignore */
				}
				return original.apply(this, args);
			};
			wrapped.__composerHealWrapped = true;
			console.error = wrapped;
		}

		/** 读一次现场：只关心「会话已打开」的那种对话区。 */
		function diagnose() {
			const seat = document.querySelector("[data-composer-seat]");
			if (seat === null) return { relevant: false };
			const root = seat.closest("[data-conversation-session]");
			const sessionId = root === null ? "" : (root.getAttribute("data-conversation-session") || "");
			if (sessionId === "") return { relevant: false };
			return {
				relevant: true,
				sessionId,
				height: seat.getBoundingClientRect().height,
				slotErrors: Array.from(document.querySelectorAll("[data-slot-error]")).map((node) =>
					node.getAttribute("data-slot-error"),
				),
				hasBanner: document.querySelector("[data-composer-heal-banner]") !== null,
			};
		}

		/** 熔断后的兜底提示：给一个手动重载入口，别让人真的卡住。 */
		function showBanner(text) {
			if (document.querySelector("[data-composer-heal-banner]") !== null) return;
			const bar = document.createElement("div");
			bar.setAttribute("data-composer-heal-banner", "");
			bar.style.cssText = [
				"position:fixed",
				"right:16px",
				"bottom:16px",
				"z-index:2147483000",
				"max-width:340px",
				"padding:10px 12px",
				"border-radius:8px",
				"background:#3a2a0a",
				"color:#ffd591",
				"border:1px solid #7a5a1a",
				"font:12px/18px system-ui,sans-serif",
				"box-shadow:0 6px 24px rgba(0,0,0,.45)",
			].join(";");
			bar.appendChild(document.createTextNode(`${text} `));
			const button = document.createElement("button");
			button.type = "button";
			button.textContent = "重载页面";
			button.style.cssText =
				"margin-left:6px;padding:2px 8px;border-radius:6px;border:1px solid #7a5a1a;background:#5a4210;color:#ffe1b0;cursor:pointer";
			button.addEventListener("click", () => window.location.reload());
			bar.appendChild(button);
			document.body.appendChild(bar);
		}

		function start(state) {
			let missing = 0;
			const tick = () => {
				let scene;
				try {
					scene = diagnose();
				} catch (_) {
					return; // 页面正在卸载/切换，跳过这一拍
				}
				if (!scene.relevant || scene.height >= SEAT_MIN_HEIGHT) {
					missing = 0;
					return;
				}
				missing += 1;
				if (missing < MISSING_TICKS) return;
				missing = 0;
				const recent = state.reloads.filter((t) => now() - t < RELOAD_WINDOW_MS);
				const detail = {
					kind: "composer-missing",
					at: now(),
					sessionId: scene.sessionId,
					slotErrors: scene.slotErrors,
					detail: `seatHeight=${Math.round(scene.height)} slotErrors=${scene.slotErrors.join(",") || "none"}`,
				};
				if (recent.length >= MAX_RELOADS) {
					record(state, { ...detail, kind: "composer-missing-gave-up" });
					if (!scene.hasBanner) {
						showBanner(
							`输入框消失了，10 分钟内已自动重载 ${MAX_RELOADS} 次，为避免刷新死循环先停手。现场已写进 ~/.dsh/logs/composer-heal.jsonl。`,
						);
					}
					return;
				}
				record(state, detail);
				state.reloads = [...recent, now()];
				writeState(state);
				// 先把这一条送到 host 落盘，再重载（最多等 400ms，日志送不出去也照常自愈）。
				const flushed = Promise.race([lastReport, new Promise((resolve) => window.setTimeout(resolve, 400))]);
				void flushed.then(() => window.location.reload());
			};
			window.setInterval(tick, TICK_MS);
			tick();
		}

		/** 插件 apply：不在 ctx 上注册任何东西，也不依赖任何服务，越独立越不容易一起坏。 */
		function apply() {
			if (window.__dshComposerHealActive === true) return; // 热替换时避免叠出多个定时器
			window.__dshComposerHealActive = true;
			// 这一行证明「浏览器半边真的跑起来了」——Host 的 activate 行证明不了这一点。
			void report({ kind: "client-activate", at: now(), detail: window.location.href.slice(0, 120) });
			const state = readState();
			watchSlotCrashes(state);
			const boot = () => start(state);
			if (document.readyState === "complete") window.setTimeout(boot, WARMUP_MS);
			else window.addEventListener("load", () => window.setTimeout(boot, WARMUP_MS), { once: true });
		}

		return { apply };
	},
});
