# @mrzhaobh/dsh-sidebar-day-groups

把 DeepSeek Harness 侧栏的会话列表按**天**分段：`今天` / `昨天` / `11月23日` ……

- 每段带条数，点段标题可折叠，折叠状态记在本机
- 置顶的会话单独成最上面的「置顶」段
- 段按日期倒序，段内保持 DSH 原本的会话顺序

> 星标是**另一个插件**（`@mrzhaobh/dsh-session-stars`），不在这里。这个包只管分组。

## 实现方式：8 处定点移植（不是复制整包重打补丁）

会话区的分组方式菜单、日期分段渲染都在 `@deepseek-ai/dsh-client-ui-workspace` 的浏览器 bundle 内部，
DSH 没有提供从外部插入这些位置的 slot，所以只能替换内置那一行。

做法是：

```yaml
# cordis.patch.yml
- id: ui-workspace
  disabled: true
- insert:
    - id: ui-workspace
      name: "./vendor/ui-workspace/index.js"
```

然后 `vendor/ui-workspace/client.js` **不是**手工维护的，它由 `scripts/port-day-groups.mjs`
在**当前安装的上游 bundle** 上做 8 处字符串替换生成：

| # | 改动 | 性质 |
|---|---|---|
| 1 | 插入 `deriveDaySections` 等函数 | 纯新增 |
| 2 | `deriveGroups` 开头分支到按天 | 1 行 |
| 3 | 视图选项菜单加「按天」 | 菜单数组加一项 |
| 4 | 菜单 `onSelect` 认得 `day` | 条件加一个分支 |
| 5 | zh / en 字典加 `groupBy.day` | 2 处 |
| 6 | 组标题改为优先用 `label` | 1 行（日期段没有 workspaceId） |
| 7 | 调用点把原始 `groupExpansion` 传进 `view` | 1 处（日期段自己的展开状态） |

关键点：

- **每处替换都断言「必须命中且只命中一次」**，任何一处找不到就整体退出、**不写任何文件**。
  所以升级后最坏的结果是「停在旧版本继续能用」，不会产出一个坏包。
- 新增代码直接复用上游现成的 `sessionVisible` / `sectionMembers` / `sessionNode`，
  返回结构与 `deriveGroups` 完全一致，下游的折叠、水位线、当前会话定位都不用改。
- 日期段的 `workspaceId` 保持 `undefined`，所以它们**不会**挂上工作区的右键菜单和拖拽。

## DSH 升级之后

**升级不会自动让侧栏崩掉**：`vendor/ui-workspace/client.js` 是你自己的副本，升级只替换 `app.asar`，
它不会被动到。所以升级后侧栏仍然能用，只是**停留在旧版本的会话区实现**上。

要跟上新版本，跑一次：

```powershell
cd packages/dsh-sidebar-day-groups
node scripts/refresh.mjs --check   # 先看要不要重跑
node scripts/refresh.mjs           # 抽取新上游 + 重新移植 + 跑测试
```

`--check` 会打印上游版本、我们的基准版本，以及 8 处锚点是否还成立。

`refresh.mjs` 会自动从 `app.asar` 抽取新的上游 bundle，然后：

1. 比对版本，不一致会明确提示
2. 重跑 8 处移植
3. 跑 `test/day-groups.test.mjs`

**如果某一处锚点找不到**，脚本会报出是哪一处、然后退出（不写文件）。这时候需要针对那一处重新定位：
上游改了那行代码，把 `port-day-groups.mjs` 里对应的 `from` 字符串换成新写法即可，其它 7 处不用动。

移植成功后别忘了：

1. 把 `vendor/ui-workspace/package.json` 的 `version` 改成新上游的版本
2. 如果上游的 `dsh.client.inject` 变了，同步过去（`refresh.mjs` 会警告）
3. 在 DSH 里重新安装这个 bundle，让它重新组合

## 目录

| 路径 | 作用 |
|---|---|
| `cordis.patch.yml` | bundle 层：禁用内置 `ui-workspace`，插入 vendor 里的副本 |
| `vendor/ui-workspace/` | 被替换的会话区包（`package.json` 的 `name` **必须**是上游包名） |
| `vendor/ui-workspace/client.js` | 产物，由 `port-day-groups.mjs` 生成，**不要手改** |
| `upstream/client.orig.js` | 当前安装版本的上游原始 bundle（移植的输入） |
| `scripts/port-day-groups.mjs` | 8 处定点移植，`--check` 只比对不写文件 |
| `scripts/refresh.mjs` | 抽取上游 + 重跑移植 + 测试 |
| `test/day-groups.test.mjs` | 分组逻辑测试 + 移植接线断言 |
| `scripts/live-check.mjs` | touch bundle，看 Host 的 rev 是否变化（确认 Host 在服务本包） |
| `scripts/cdp-verify.mjs`、`cdp-scroll-shot.mjs` | headless Edge + DevTools 截图验证 |

## 为什么 `vendor/ui-workspace/package.json` 的 name 不能改

`dsh-client-modules` 用「解析到的 manifest 包名」当浏览器模块 id，`ui-sidebar` / `ui-chat` /
`ui-conversation` 都按 `@deepseek-ai/dsh-client-ui-workspace` 这个 id 依赖它。换成别的名字，
这些插件就找不到模块、整个侧边栏不渲染。

## 数据落点

| 数据 | 位置 |
|---|---|
| 分组方式（`workspace` / `workspace-tree` / `flat` / `day`） | 浏览器 `localStorage["dsh.workspace.view.v5"]` 的 `groupBy` |
| 段折叠状态 | 同一份存储的 `groupExpansion`（`day:2026-11-23` 这样的 key） |

都是浏览器本地的，桌面窗口与 Web GUI 不共享。

## 已知限制

- 替换整包：上游对会话区的新改进不会自动进来，必须跑 `refresh.mjs` 重新移植。
- 日期取的会话 `updatedAt`，所以一次旧会话的新消息会把它挪到「今天」。
- 段顺序固定为「置顶 → 日期倒序」，段内保持 DSH 原本顺序，不支持拖动排序。
- 日期段没有工作区右键菜单和拖拽（它们不属于任何工作区）。
- 分段是「列表里连续的同一天」聚合：如果 DSH 的排序让同一天被隔开，会出现两个相同标题的段。

## 安装

```powershell
dsh plugin --profile desktop add "link:J:/myProject/dsh-plugins/packages/dsh-sidebar-day-groups"
```

装完**重启 DSH**（bundle 组合变动需要重启，热更新只换内容不换 bundles 列表）。

然后在侧栏 → 视图选项（滑杆图标）→ 分组方式 → **按天**。
