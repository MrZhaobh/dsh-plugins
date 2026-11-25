# dsh-plugins

赵彬豪（[MrZhaobh](https://github.com/MrZhaobh)）自用的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件仓库。

## 加为插件源

DSH 侧边栏 → **Plugins** → **Discover** → 右上 **Manage index sources…** → 粘贴：

```
https://raw.githubusercontent.com/MrZhaobh/dsh-plugins/refs/heads/main/dsh-index.json
```

或者直接写进 profile 的 `cordis.patch.yml`（`~/.dsh/profiles/<name>/cordis.patch.yml`）：

```yaml
- id: plugin-market
  name: "@deepseek-ai/dsh-plugin-market"
  config:
    indexes:
      - <你原有的源>
      - https://raw.githubusercontent.com/MrZhaobh/dsh-plugins/refs/heads/main/dsh-index.json
```

> `indexes` 是**整块替换**而不是追加：加的时候必须把原有条目一起抄上，否则会被冲掉。

## 插件

| 包名 | 分类 | 说明 |
|---|---|---|
| `@mrzhaobh/dsh-plugin-sources` | 市场与源 | Plugins 页加「按来源」tab，把已安装插件按来源仓库分组（默认展开、可折叠） |
| `@mrzhaobh/dsh-session-stars` | 侧栏 | 悬停时在原生会话标题前显示星标按钮，已加星的会话在同一位置显示 🌟 |
| `@mrzhaobh/dsh-session-dates` | 侧栏 | 在「单列表 + 最近更新」的原生会话列表里显示日期分组标题，保留星标与原生操作 |
| `@mrzhaobh/dsh-composer-heal` | 输入框 | 输入框消失时自动重载页面，带熔断和现场落盘 |
| `@mrzhaobh/dsh-sidebar-day-groups` | 侧栏 | 会话区按天分组 + 一键星标 + 置顶段（替换内置 `ui-workspace`）。**当前不上架**：见下 |

### 未上架的包

`dsh-sidebar-day-groups` 的 bundle 是基于上游 `0.2.2-rc.1` 打的补丁，而 `0.2.2-rc.5` 把上游
browser bundle 压成了单行，37 个 hunk 无法自动重放。它的 `package.json` 带
`dshMarket.exclude: true`，所以**不会出现在索引里**（Discover 里看不到），代码仍留在仓库中，
作为将来重做「按天分组」的基础（含 rc.5 的原始 bundle 供对照）。

各自的细节、限制和数据落点见包内的 `README.md`。

## 版本兼容

- **`dsh-session-stars`** 只往内置 `ui-workspace` 声明的行槽位里注册条目，不 disable、不替换任何内置行，要求 `>=0.2.2-rc.5`（更早的版本没有 `sidebar.session.row.trailing`）。DSH 升级通常不需要跟着改。
- **`dsh-sidebar-day-groups` 精确锁定 DSH `0.2.2-rc.1`**。它替换内置的 `@deepseek-ai/dsh-client-ui-workspace`，上游 bundle 一变就可能让侧边栏不渲染。升级 DSH 后先按包内 README 重放补丁，再改 `engines.dsh` 重新发版。**当前 0.2.2-rc.5 上会被拒绝安装，这是故意的。**
- **`dsh-composer-heal`** 不替换任何内置行，只插入自己的一行，兼容 `>=0.2.1-rc.1`。

`engines.dsh` 写在索引里，DSH 会据此判断能否安装，不兼容时会直接拒绝而不是装上再崩。

## 仓库结构

```
dsh-index.json              插件市场索引（plugin market index format 1）
scripts/build-index.mjs     从 packages/* 重新生成索引
packages/<包名>/             每个插件一个目录，自带 package.json + cordis.patch.yml
```

## 发版流程

1. 改 `packages/<包名>/package.json` 的 `version`
2. `git commit && git push`
3. `node scripts/build-index.mjs` —— 给每个版本钉上该包目录最后一次改动的 commit
4. 自检（普通 node 读不了 `app.asar`，要用 DSH 自带的 Electron 当 node）：
   ```powershell
   $env:ELECTRON_RUN_AS_NODE = '1'; & $env:DSH_NODE_EXECUTABLE scripts/check-index.mjs
   ```
5. `git add dsh-index.json && git commit -m "chore: rebuild index" && git push`
6. DSH 的 Discover 页刷新

索引里每个版本的 `source.commit` 指向**代码那次提交**，`publishTimestamp` 取那次提交的时间，所以第 3 步不会自指；历史版本从旧索引继承。

`scripts/check-index.mjs` 调用的是 DSH 安装里**官方**的 `parseMarketIndex`，格式不合法时会直接给出出错的 JSON 路径，不用等加源时才发现。

## 许可

MIT
