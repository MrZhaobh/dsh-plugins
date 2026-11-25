# @mrzhaobh/dsh-session-stars

给 DeepSeek Harness 侧栏会话一键加星。

| 交互 | 位置 |
|---|---|
| 悬停会话行 → 出现 `☆`，点击变金色 `★` | `sidebar.session.row.hover` |
| 已星标的行尾常驻 🌟 | `sidebar.session.row.trailing` |

星标与置顶、排序完全独立：加星不改顺序、不改分组，也不会动置顶。再点一次取消。

## 为什么不用替换整包

会话区（`@deepseek-ai/dsh-client-ui-workspace`）在自己的 `sidebar.workspaces` 槽位里声明了三个行级 list 槽位：

```js
"sidebar.session.row.leading":  { kind: 'list', scope: 'root', inline: true },
"sidebar.session.row.trailing": { kind: 'list', scope: 'root', inline: true },
"sidebar.session.row.hover":    { kind: 'list', scope: 'root' },
```

本插件只是往其中两个注册条目，**不 disable、不替换任何内置行**。所以只要这些槽位协议不变，DSH 升级就不需要跟着改（对比：替换整包的做法每次升级都得重放补丁）。

两个位置的取舍：

- **`hover`** 而不是 `session.row.action`：后者是常驻的操作按钮区（归档、置顶在那儿），星标开关放悬停区更贴合原手感，也不和归档/置顶挤位置。
- **`trailing`** 而不是 `leading`：行首的 `leading` 槽位在有运行状态点（运行中/待审批等）时会被状态点顶掉，星标标记不能跟着状态闪。

## 数据落点

浏览器 `localStorage["dsh.workspace.starred.v1"]`，格式 `{ "ids": ["session-…"] }`，新加的在前。

这个 key 与早先 fork 版 `dsh-my-tool` 用的**完全一致**，所以升级到这个插件后已有的星标不会丢。

星标是**浏览器本地**的：桌面窗口与 Web GUI、不同设备之间不共享（和 DSH 自己的视图状态一致）。清缓存会丢。

## 兼容性

`dsh.engines.dsh` 为 `>=0.2.2-rc.5` —— 较早的 DSH 没有 `sidebar.session.row.trailing` 槽位。

如果装到不兼容的版本上，DSH 会在 Discover 里直接拒绝安装，而不是装上一个按钮永远不出现的插件。

## 安装

从索引源安装 `@mrzhaobh/dsh-session-stars`，或本地开发：

```powershell
dsh plugin --profile desktop add "link:J:/myProject/dsh-plugins/packages/dsh-session-stars"
```

装完**重启 DSH**（bundle 列表在启动时组合）。

## 验证

重启后悬停任意会话行，行尾应出现 `☆`；点一下变 `★`，同一行行尾出现 🌟，并且**不会**打开会话（点击已拦截冒泡）。

再点 `★` 取消。

## 卸载

```powershell
dsh plugin --profile desktop remove @mrzhaobh/dsh-session-stars
```

星标数据留在 localStorage 里，不会被删除。

## 已知限制

- 星标不跨设备同步（浏览器本地存储）。
- `hover` 槽位只在会话行悬停时渲染，所以按钮不会常驻。
- 右键菜单里的「星标会话 / 取消星标」这一版没做，只有悬停按钮。
- 排序仍然是 DSH 原生的（手动 / 最近更新），星标不改变顺序。
