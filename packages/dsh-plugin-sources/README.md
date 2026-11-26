# @mrzhaobh/dsh-plugin-sources

在 Plugins 页的 **「按来源」** 标签页里，把**已安装的插件**按来源仓库分组，用和「已安装」/「发现」一样的卡片展示完整信息，并且可以直接**启用 / 停用 / 卸载**。

## 效果

```
Installed | Discover | 按来源
────────────────────────────────────────────
▾ v3887023/dsh-plugins                    6
  [icon] DS Harness Remote         运行中  可卸载        (开关)  卸载
        基于 P2P 网络、端到端加密的远程访问…
        v0.6.7 · @v3887023/dsh-… · github:v3887023/dsh-plugins
  …
▾ npm registry                            6
  [icon] DeepSeek 余额             运行中  可卸载        (开关)  卸载
        在输入框下方实时显示账户余额…
        v0.2.9 · dsh-balance · dsh-balance@0.2.9
  …
▾ MrZhaobh/dsh-plugins（本地）             1
  …
```

每张卡片显示：

- **图标**：包自己声明的 `icon`（Host 以 data URL 给出），没有就用默认图案
- **标题**：本地化的插件名
- **状态**：运行中 / 已停用 / 启动失败 / 文件缺失
- **简介**：插件自己的 `description`（本地化优先），最多两行
- **元信息**：版本 · 包名 · 来源 spec（GitHub 源压成 `github:owner/repo`）
- **开关**：直接启用 / 停用，等 Host 返回后刷新状态；Host 不允许改的会禁用并说明原因
- **卸载**：先弹确认框，确认后调用 Host 卸载；DSH 安装自带的插件不显示这个按钮

其它行为：

- **只列已安装的**：profile 里声明过的依赖（第三方插件、本地 link 插件），以及 profile 提供的包。没被选中的内置 bundle 不会出现在这里（那是 Installed/Discover 的活）
- 组默认全部展开，点组标题可折叠；折叠状态记在 localStorage
- 组按插件数降序，组内按包名
- 点标题跳到该 bundle 原来在 Installed 页的详情页（走页面自己的 `openPackage`）
- 开始/完成操作后自动重读清单，并监听 Host 的 `plugin-manager/changed`

## 分组规则

分组键来自 `pluginManager.listBundles()` 返回的每个 bundle 的 `source` 字段（就是 `pnpm add` 接受的那个 spec）：

| `source` 形态 | 落到哪组 |
|---|---|
| `github:owner/repo#<commit>&path:/packages/x` | `owner/repo` |
| `gitlab:owner/repo…` / `bitbucket:…` | 同上，按各自的宿主 |
| `dsh-balance@0.2.9`、`name@^range` | `npm registry` |
| `link:J:/…`、`file:…` | `本地目录` |
| `git+https://…` 或其他含协议的地址 | `其他 Git 源` |
| 没有 `source` 且 `availability === "installation"` | `安装自带` |
| 其余（无 source 的 profile bundle） | `来源未知` |

## 数据来源、权限与安全

- 读：`pluginManager.listBundles()`，通过 `ctx.remoteAccess.whenAccess("pluginManager/listBundles", …)` 做权限门控；没有该权限时 tab 不读数据，也不改变页面其它部分
- 写：开关调 `pluginManager.setBundleEnabled(name, enabled)`，卸载调 `pluginManager.removeBundle(name)`，都是 Host 自己的插件管理接口，和 Installed 页用的是同一套
- 卸载一定先弹确认框；DSH 自带的 bundle（`removable !== true`）没有卸载入口
- 改动需要重启时（Host 返回 `restart-required`）会在顶部提示原因；改动失败显示 Host 的错误码或诊断文本

## 已知限制

- **它是 Plugins 页的第三个 tab，不是替换 Installed tab**。DSH 的 `plugins.tab` 槽位语义就是「在 Installed 之后再加一个 tab」，所以切到 `Installed` 仍然是原来的平铺列表；「按来源」提供的是同一个 profile 的另一种视图。
- 只对**有 managed profile 的 Host** 有意义（否则 `listBundles` 返回不可用）。
- 分组靠解析 `source` 字符串，pnpm 新增未知 spec 形态时会落到 `npm registry` 或 `其他 Git 源`，不会报错。
- 卸载后如果该插件还有运行中的条目（例如它是别的插件的依赖），Host 会返回错误码，这里会原样提示。

## 兼容性

`dsh.engines.dsh` 为 `>=0.2.2-rc.5`：依赖 `plugins.tab` 槽位与 `remote.pluginManager` 的 `listBundles` / `setBundleEnabled` / `removeBundle`。不替换任何内置插件。

## 安装

从索引源安装 `@mrzhaobh/dsh-plugin-sources`，或本地开发：

```powershell
dsh plugin --profile desktop add "link:J:/myProject/dsh-plugins/packages/dsh-plugin-sources"
```

## 测试

```powershell
cd packages/dsh-plugin-sources
npm test
```

- `test/groups.test.mjs`：只列已安装的过滤、分组/排序/折叠持久化，含真实 pnpm spec 形态
- `test/wiring.test.mjs`：真实执行 `client.js`，断言注册到 `plugins.tab`、权限门控、订阅、卡片内容、开关调用 `setBundleEnabled`、卸载先确认再调 `removeBundle`、折叠、空态、失败态与「需要重启」提示
