# @mrzhaobh/dsh-sidebar-day-groups

把 DeepSeek Harness 侧边栏的**会话区**换成本包里的实现，一个插件装下三件事：

| 功能 | 说明 |
|---|---|
| **按天分组** | 「视图选项 → 分组方式 → 按天」：`今天` / `昨天` / 具体日期分段，可折叠并显示条数 |
| **一键星标 🌟** | 会话行悬停出现 `☆` 按钮，点一下加星（行首出现 🌟、按钮变 `★` 金色），再点取消；右键菜单里也有「星标会话 / 取消星标」 |
| **置顶分段** | 会话行悬停的图钉按钮一键置顶（上游自带），按天模式下置顶会话单独进入最上面的「置顶」段；再点一次回到原来那一天 |

星标与置顶是**两个独立动作**：加星不改顺序、不改分组，置顶也不会自动加星。

## 目录

| 路径 | 作用 |
|---|---|
| `cordis.patch.yml` | 本包的 bundle 层：禁用内置 `ui-workspace`，插入 `vendor/ui-workspace/index.js`（同一 entry id） |
| `vendor/ui-workspace/` | 被替换的会话区包（自带 `package.json`，`name` 是上游包名） |
| `vendor/ui-workspace/client.js` | 浏览器端 bundle，唯一的运行时产物（含按天分组 + 星标） |
| `vendor/ui-workspace/index.js`、`locale/` | 上游 node 半边（空实现）与语言文件 |
| `upstream/client.orig.js` | 安装包里原始 bundle 的副本，用来生成/校验补丁 |
| `patch/workspace-fork.patch` | `upstream/client.orig.js` → `vendor/ui-workspace/client.js` 的统一 diff |
| `scripts/refresh.mjs` | 从当前 DSH 安装包重新抽取上游 bundle 并重放补丁（DSH 升级后用） |
| `scripts/make-patch.mjs` | 由两个 bundle 重新生成补丁 |
| `scripts/test-day-groups.mjs`、`scripts/test-stars.mjs` | 直接 eval 产物里对应区域，校验分桶 / 单条日期标签 / 星标增删与持久化 |
| `scripts/live-check.mjs` | 确认运行中的 Host 正在服务本包的 bundle（touch 文件看 rev 是否变化） |
| `scripts/cdp-verify.mjs`、`scripts/cdp-scroll-shot.mjs` | 用 headless Edge + DevTools 协议在临时 profile 上实测渲染 |

## 为什么是「替换」而不是普通插件

会话区的分组方式菜单、日期分段、会话行上的星标标记，都在
`@deepseek-ai/dsh-client-ui-workspace` 的浏览器 bundle 内部，DSH 没有提供能从外部插入这些位置的 slot。
所以本包用 DSH 自己的 profile 层机制：

1. 作为 `dsh.profile.bundles` 的一层，先 `disabled: true` 掉内置那一行；
2. 再插入 `vendor/ui-workspace/index.js`，entry id 仍然是 `ui-workspace`。

**`vendor/ui-workspace/package.json` 的 `name` 必须保持上游包名 `@deepseek-ai/dsh-client-ui-workspace`**：
`dsh-client-modules` 用「解析到的 manifest 包名」当浏览器模块 id，
`ui-sidebar` / `ui-chat` / `ui-conversation` 等插件都按这个 id 依赖它。换成别的名字，这些插件就找不到模块、整个侧边栏不渲染（实测过）。

patch 里的 `name` 用**相对路径** `./vendor/ui-workspace/index.js`：DSH 规定 insert 的相对路径锚定在 patch 文件旁，所以从 git 装进 profile 的 `node_modules` 后依然能解析，换机器不用改。

安装目录、`app.asar` 都不改。

## 安装

> **当前状态：尚不可安装在 0.2.2-rc.5 上。**
> 本包的 `vendor/ui-workspace/client.js` 是基于**上游 0.2.2-rc.1** 打的补丁；
> rc.5 把 browser bundle 压缩成了单行（6165 行 → 5 行）且有少量代码改动，
> 37 个 hunk 的补丁无法自动重放（`node scripts/refresh.mjs --check` 会在
> `lib/client.js:1153` 处失败）。因此 `package.json` 的 `dsh.engines.dsh` 锁定在
> `0.2.2-rc.1`，当前 DSH 会**主动拒绝安装**而不是装上再崩。
>
> 重做步骤见下面「DSH 升级之后」：拿到新版本上游后按 37 个 hunk 逐个移植、
> `make-patch`、`refresh`，再把 `engines.dsh` 改成新版本。
> `upstream/client.orig.rc5.reference.js` 是当前安装版本的原始 bundle，供移植时对照。

**从索引源安装**（推荐）：把仓库根的 `dsh-index.json` 加为 Discover 源，然后装
`@mrzhaobh/dsh-sidebar-day-groups`。

**本地开发用 link**：

```powershell
dsh plugin --profile desktop add "link:J:/myProject/dsh-plugins/packages/dsh-sidebar-day-groups"
```

装完**重启 DSH 生效**（bundle 层在启动时组合；运行期只热更新已加载 bundle 的内容，不会重新加载 bundles 列表）。

## DSH 升级之后

升级会替换 `app.asar` 里的上游 bundle，本包的 `vendor/ui-workspace/client.js` 仍是旧版，需要重新生成：

```powershell
cd packages/dsh-sidebar-day-groups
node scripts/refresh.mjs            # 重新抽取 + 重放补丁 + 语法检查 + 逻辑测试
node scripts/refresh.mjs --check    # 只检查本包是否等于「上游 + 补丁」
```

`refresh.mjs` 会顺带比对上游 `dsh.client.inject`，不一致时打印提示（需要手工同步 `vendor/ui-workspace/package.json`）。

若上游改动较大导致补丁打不上，脚本会明确报错并保留新的 `upstream/client.orig.js`，此时按
`patch/workspace-fork.patch` 的思路对新 bundle 手工移植，再：

```powershell
node scripts/make-patch.mjs
npm test
```

补丁在系统临时目录里重放（不在本仓库内 replay），避免 `git apply` 碰到仓库工作树。

**重放成功后，记得把 `package.json` 的 `dsh.engines.dsh` 改成新的 DSH 版本再发版**，否则新版本会因版本锁定而装不上。

## 数据落点

| 数据 | 位置 | 说明 |
|---|---|---|
| 星标 | 浏览器 `localStorage["dsh.workspace.starred.v1"]` | `{ "ids": ["session-…", …] }`，新加的在前 |
| 分组方式 / 段折叠 | 浏览器 `localStorage["dsh.workspace.view.v5"]` | 与 DSH 原生的视图状态同一个 store |
| 置顶 | Host 的 workspace 状态（`~/.dsh/storages/workspace.json`） | 与内置置顶完全一致 |

星标是**浏览器本地**的：桌面窗口与 Web GUI、不同设备之间不共享（和 DSH 自己的视图状态一致）。

## 已知限制

- 替换整包：上游对这个包的任何更新（含 bug 修复）都不会自动生效，升级后必须重放补丁。
- 与 DSH 版本强绑定，`engines.dsh` 是精确版本。
- 按天模式的顺序固定为「置顶 → 日期倒序 → 段内按列表顺序」，不接受拖动排序。
- 会话日期取 `updatedAt`（最近更新时间），一次旧会话的新消息会把它挪到「今天」。
