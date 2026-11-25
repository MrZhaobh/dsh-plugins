# @mrzhaobh/dsh-composer-heal

输入框（composer）自愈插件。

## 问题

DSH 的输入框是 `conversation.composer.bar` 这个 **single 型槽位**的条目：渲染期崩一次会被槽位仲裁
**永久注销**（只有整页重载才会重新注册）；客户端插件热替换失败也不回滚（DSH 文档：no failure rollback）。
所以偶尔会「会话在、输入框没了」，重启 DSH 才好。

## 它做什么

本插件不依赖任何服务、不注册任何槽位，只做三件事：

1. 每秒看一次 `[data-composer-seat]` 的高度：会话已打开（`[data-conversation-session]` 非空）但座位连续
   2 秒低于 24px，判定为「输入框真的没了」；
2. 自动 `location.reload()`（整页重载，比退 app 快；运行中的回合在服务端继续，不会中断）；
3. 记录现场并**熔断**：10 分钟内最多自动重载 3 次，超过就停手、右下角挂一条提示，绝不刷新死循环。

三条安全线保证不误伤：新会话 hero、设置页、文件页、审批/提问卡片顶替输入框（座位仍有高度）这些情况都不会误判。

## 数据落点

现场记录**落盘**在 `~/.dsh/logs/composer-heal.jsonl`（`$DSH_HOME/logs/`，JSONL 追加写，不轮转），
由 `index.js` 在 host 上注册 `POST /composer-self-heal/log` 接收浏览器半边上报；
localStorage 里另存一份最近的副本（`dsh.myTool.composerHeal`，清缓存就没了，只当兜底）。

| `kind` | 谁写 | 含义 |
|---|---|---|
| `activate` | host | Host 启动时自愈插件被加载；**没有这一行 = 那一次插件根本没起来** |
| `client-activate` | 浏览器 | 浏览器半边真的跑起来了，带当时页面 URL |
| `slot-crash` | 浏览器 | 槽位条目崩溃原文（`slot entry crashed in '…'` + 错误信息），**根治靠这条** |
| `composer-missing` | 浏览器 | 判定输入框没了（带 `sessionId`、座位高度、`data-slot-error` 列表），随即自动重载 |
| `composer-missing-gave-up` | 浏览器 | 触发 10 分钟 3 次熔断，停手 |

```powershell
# 看最近 20 行
Get-Content "$env:USERPROFILE\.dsh\logs\composer-heal.jsonl" -Tail 20
```

```js
// 浏览器端副本
JSON.parse(localStorage['dsh.myTool.composerHeal'])
```

`kind: "slot-crash"` 的 `detail` 里带 `slot entry crashed in '…'` 的原文 —— 那才是崩溃真凶，
拿它去修才叫根治；自愈只是兜底。

## 手工冒烟测试

在 GUI 的 DevTools Console 里跑，约 2 秒后页面自动重载：

```js
document.querySelector('[data-composer-seat]').style.height = '0px'
```

## 实现注意

`client.js` 第一行的 `window.__ModuleLoader__.load({ id })` 里的 **id 必须与 `package.json` 的 `name` 完全一致**。
`dsh-client-modules` 用「解析到的 manifest 包名」当浏览器模块 id，两者不一致时浏览器半边不会被挂上（manifest 里也不会报错）。

## 安装

从索引源安装 `@mrzhaobh/dsh-composer-heal`，或本地开发：

```powershell
dsh plugin --profile desktop add "link:J:/myProject/dsh-plugins/packages/dsh-composer-heal"
```

本包不替换任何内置行，兼容 `>=0.2.1-rc.1`。
