# @mrzhaobh/dsh-plugin-sources

在 Plugins 页加一个 **「按来源」** 标签页，把已安装插件按**来源仓库**分组。

## 效果

```
Installed | Discover | 按来源
────────────────────────────────
▾ v3887023/dsh-plugins        6
     @v3887023/dsh-deepseek-balance   0.1.1
     @v3887023/dsh-desktop-notify     3.0.1
     …
▾ npm registry                6
     dsh-balance                      0.2.9
     dsh-baton-host                   0.6.13
     …
▾ 本地目录                     1
     @mrzhaobh/dsh-session-stars      1.0.0
▾ 安装自带                    14
     @deepseek-ai/dsh-base            0.2.2-rc.5
     …
```

- **组默认全部展开**，点组标题可折叠；折叠状态记在 localStorage
- 组按插件数降序，组内按名称
- 每行左侧小圆点表示启用状态（实心＝已启用）
- 点一行跳到该 bundle 原本的详情页（走 Plugins 页自己的 `openPackage`）
- 每组标题后的数字是该组插件数

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

## 数据来源与安全

- 只读 `pluginManager.listBundles()`，**不安装、不启用、不卸载任何东西**
- 通过 `ctx.remoteAccess.whenAccess("pluginManager/listBundles", …)` 做权限门控：没有该权限时 tab 不会读数据，也不会改变页面其他部分
- 监听 `plugin-manager/changed` 自动重读，装/卸/启停插件后不用手动刷新

## 已知限制

- **它是顶替列表渲染，不是给原列表加分组**。DSH 的 `plugins.tab` 槽位语义就是「用这个 tab 的内容替换分组列表」，所以切到「按来源」时看到的是本插件画的列表；切回 `Installed` 就是原来的平铺列表。
- 只对**有 managed profile 的 Host** 有意义（否则 `listBundles` 返回不可用）。
- 分组靠解析 `source` 字符串，pnpm 新增未知 spec 形态时会落到 `npm registry` 或 `其他 Git 源`，不会报错。

## 兼容性

`dsh.engines.dsh` 为 `>=0.2.2-rc.5`：依赖 `plugins.tab` 槽位与 `remote.pluginManager` 这两个 rc.5 已有的接口。不替换任何内置插件。

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

- `test/groups.test.mjs`：分组/排序/折叠持久化，含真实 pnpm spec 形态
- `test/wiring.test.mjs`：真实执行 `client.js`，断言注册到 `plugins.tab`、权限门控、订阅、分组渲染、折叠与展开、点击跳转、空态与失败态
