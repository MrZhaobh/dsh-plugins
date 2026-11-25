#!/usr/bin/env node
// 从 packages/* 生成 dsh-index.json（plugin market index format 1）。
//
// 用法（在仓库任意位置都可以）：node scripts/build-index.mjs
//
// 关键点：
// - 每个版本的 commit 指向「该包目录最后一次改动」的提交，不是 index 自己的提交，
//   所以这个脚本生成的 dsh-index.json 与它自己那次 commit 不会自指。
// - publishTimestamp 取那次提交的时间（秒）。
// - 历史版本从旧 index 里继承，只按 version 去重。
// - 分类/标签由各包 package.json 的 `dshMarket` 字段声明，脚本只做聚合；
//   dsh-index.json 顶层必须把用到的 category / label id 全部声明，否则校验失败。
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')
const REPO = 'https://github.com/MrZhaobh/dsh-plugins'
const INDEX_PATH = join(ROOT, 'dsh-index.json')

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

/** 用到的分类和标签必须在顶层声明，插件里的引用才通得过校验。 */
const declarations = {
  categories: {
    sidebar: { title: { en: 'Sidebar', zh: '侧栏' } },
    composer: { title: { en: 'Composer', zh: '输入框' } },
    market: { title: { en: 'Market and sources', zh: '市场与源' } },
  },
  labels: {
    'builtin-fork': { title: { en: 'Replaces built-in', zh: '替换内置' } },
    'version-pinned': { title: { en: 'Version pinned', zh: '版本锁定' } },
    'needs-restart': { title: { en: 'Needs restart', zh: '需重启' } },
    'zero-config': { title: { en: 'No setup', zh: '零配置' } },
    'writes-log': { title: { en: 'Writes a log', zh: '会写日志' } },
    'uses-slots': { title: { en: 'Uses built-in slots', zh: '用内置槽位' } },
    'local-data': { title: { en: 'Stored locally', zh: '仅存本机' } },
  },
}

/** 无依赖的 SemVer 比较，只用于让生成的 versions 保持降序。 */
function compareVersion(a, b) {
  const parse = (v) => {
    const [core, pre] = v.split('-')
    return { nums: core.split('.').map(Number), pre: pre ? pre.split('.') : [] }
  }
  const l = parse(a)
  const r = parse(b)
  for (let i = 0; i < 3; i += 1) if (l.nums[i] !== r.nums[i]) return l.nums[i] - r.nums[i]
  if (l.pre.length === 0 && r.pre.length === 0) return 0
  if (l.pre.length === 0) return 1
  if (r.pre.length === 0) return -1
  for (let i = 0; i < Math.max(l.pre.length, r.pre.length); i += 1) {
    const x = l.pre[i]
    const y = r.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/.test(x)
    const yNumeric = /^\d+$/.test(y)
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y)
    } else if (xNumeric) return -1
    else if (yNumeric) return 1
    else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

const readLocale = (dir, language) => {
  const file = join(ROOT, dir, 'locale', `${language}.json`)
  if (!existsSync(file)) return {}
  return JSON.parse(readFileSync(file, 'utf8')).meta ?? {}
}

const previous = existsSync(INDEX_PATH) ? JSON.parse(readFileSync(INDEX_PATH, 'utf8')) : { plugins: [] }
const history = new Map((previous.plugins ?? []).map((plugin) => [plugin.name, plugin.versions ?? []]))

const plugins = []
for (const entry of readdirSync(join(ROOT, 'packages'), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue
  const dir = `packages/${entry.name}`
  const manifestPath = join(ROOT, dir, 'package.json')
  if (!existsSync(manifestPath)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (manifest.dsh?.bundle?.patch === undefined) {
    console.warn(`skip ${dir}: no dsh.bundle.patch`)
    continue
  }
  if (manifest.dshMarket?.exclude === true) {
    // 仓库里留着代码，但不进索引：Discover 里就不会挂一个装不上的条目
    console.log(`skip ${dir}: excluded from the index (dshMarket.exclude)`)
    continue
  }

  const en = readLocale(dir, 'en')
  const zh = readLocale(dir, 'zh')
  const market = manifest.dshMarket ?? {}

  const [commit, commitTime] = git('log', '-1', '--format=%H%n%ct', '--', dir).split('\n')
  if (!/^[0-9a-f]{40}$/u.test(commit ?? '')) {
    // 没有提交就取不到可钉的 commit，宁可报错也不要产出空值（校验器会拒收）
    console.error(`${dir}: no commit yet — commit this package before rebuilding the index`)
    process.exitCode = 1
    continue
  }

  const current = {
    version: manifest.version,
    publishTimestamp: Number(commitTime),
    source: { type: 'git', url: REPO, commit, path: dir },
    ...(manifest.dsh.engines?.dsh === undefined ? {} : { engines: { dsh: manifest.dsh.engines.dsh } }),
  }

  const versions = [current, ...(history.get(manifest.name) ?? []).filter((old) => old.version !== current.version)]
    .sort((left, right) => compareVersion(right.version, left.version))

  plugins.push({
    name: manifest.name,
    title: { en: en.title ?? manifest.name, zh: zh.title ?? en.title ?? manifest.name },
    description: { en: en.description ?? '', zh: zh.description ?? en.description ?? '' },
    author: 'MrZhaobh',
    homepage: `${REPO}/tree/main/${dir}`,
    repository: { url: REPO, directory: dir },
    icon: `${dir}/icon.svg`,
    metadata: {
      ...(market.category === undefined ? {} : { category: market.category }),
      labels: market.labels ?? [],
      keywords: market.keywords ?? [],
    },
    versions,
  })
}

const index = {
  format: 1,
  title: { en: "MrZhaobh's DSH plugins", zh: 'MrZhaobh 的 DSH 插件' },
  description: {
    en: 'Personal DeepSeek Harness plugins: sidebar day groups, composer self-heal.',
    zh: '自用的 DeepSeek Harness 插件：侧栏按天分组、输入框自愈。',
  },
  metadata: declarations,
  plugins,
}

writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`)
console.log(`dsh-index.json: ${plugins.length} plugin(s)`)
for (const plugin of plugins) {
  const latest = plugin.versions[0]
  console.log(`  ${plugin.name}@${latest.version}  ${latest.source.commit.slice(0, 7)}  path=${latest.source.path}`)
}
