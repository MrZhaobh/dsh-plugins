import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const name = "composer-self-heal";
export const inject = ["webServer"];

/** 浏览器半边 POST 到这里；同源相对路径，桌面版会经 dsh-app://app 转发到 host。 */
const ROUTE = "/composer-self-heal/log";
/** 日志行足够小，超过这个体积一律视为脏数据。 */
const MAX_BODY_BYTES = 64 * 1024;
const VERSION = "0.1.0";

/**
 * 输入框自愈插件的 host 半边：把浏览器半边记下的现场追加到一份 JSONL。
 *
 * 落盘位置：`$DSH_HOME/logs/composer-heal.jsonl`（默认 `~/.dsh/logs/composer-heal.jsonl`）。
 * 每行一条 JSON：`{ kind, at, ... }`，追加写、不轮转、不清理 —— 出问题时直接读这个文件
 * 就能知道「当时有没有加载到自愈插件、是哪种失败、哪个会话、哪些槽位报错」。
 */
function logFile() {
	const home = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== "" ? process.env.DSH_HOME : join(homedir(), ".dsh");
	return join(home, "logs", "composer-heal.jsonl");
}

/** 追加一行；日志写不进去也不能影响别的任何事。 */
async function append(line) {
	try {
		const file = logFile();
		await mkdir(dirname(file), { recursive: true });
		await appendFile(file, `${JSON.stringify(line)}\n`, "utf8");
	} catch {
		/* 落盘是尽力而为 */
	}
}

/** 收一个有上限的请求体；超限就抽干并返回 null。 */
async function readBoundedBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.byteLength;
		if (size > MAX_BODY_BYTES) {
			req.resume();
			return null;
		}
		chunks.push(chunk);
	}
	return Buffer.concat(chunks, size).toString("utf8");
}

/** 只接受 {event:{kind,...}} 这一种形状，其余字段按白名单挑，别把任意对象写进日志。 */
function parseBody(text) {
	if (text === null) return null;
	let body;
	try {
		body = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof body !== "object" || body === null) return null;
	const event = body.event;
	if (typeof event !== "object" || event === null) return null;
	const kind = typeof event.kind === "string" ? event.kind.slice(0, 64) : "";
	if (kind === "") return null;
	const slotErrors = Array.isArray(event.slotErrors) ? event.slotErrors.slice(0, 20).map((item) => String(item).slice(0, 80)) : undefined;
	return {
		kind,
		at: typeof event.at === "number" ? event.at : Date.now(),
		receivedAt: Date.now(),
		sessionId: typeof event.sessionId === "string" ? event.sessionId.slice(0, 120) : undefined,
		slotErrors,
		detail: typeof event.detail === "string" ? event.detail.slice(0, 2000) : undefined,
	};
}

export function apply(ctx) {
	// 每次 Host 启动都记一行：下次看日志就知道「那一次自愈插件到底有没有被加载」。
	void append({
		kind: "activate",
		at: Date.now(),
		version: VERSION,
		pid: process.pid,
		file: logFile(),
	});
	ctx.effect(
		() =>
			ctx.webServer.register({
				kind: "exact",
				path: ROUTE,
				handler: async (req, res) => {
					if (req.method !== "POST") {
						res.statusCode = 405;
						res.setHeader("allow", "POST");
						res.end();
						return;
					}
					const event = parseBody(await readBoundedBody(req));
					if (event === null) {
						res.statusCode = 400;
						res.end();
						return;
					}
					await append(event);
					res.statusCode = 204;
					res.end();
				},
			}),
		`composer-self-heal: POST ${ROUTE}`,
	);
}
