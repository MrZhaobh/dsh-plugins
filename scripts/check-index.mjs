#!/usr/bin/env node
// 用当前 DSH 安装里的「官方」校验器验证 dsh-index.json，避免格式错误等到加源时才发现。
//
// 普通 node 读不了 app.asar，所以必须用 DSH 自带的 Electron 当 node 跑：
//
//   PowerShell:
//     $env:ELECTRON_RUN_AS_NODE = '1'
//     & $env:DSH_NODE_EXECUTABLE scripts/check-index.mjs
//
//   bash:
//     ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/check-index.mjs
//
// 需要 DSH_INSTALL_DIR 指向 DSH 的 CLI 包目录（DSH 自己会设置这个环境变量）。
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const indexFile = join(root, 'dsh-index.json')

/** 索引被真正读取时的 URL：相对 icon 会以它为基准解析，所以要和线上地址一致。 */
const INDEX_URL = 'https://raw.githubusercontent.com/MrZhaobh/dsh-plugins/refs/heads/main/dsh-index.json'

const installDir = process.env.DSH_INSTALL_DIR
if (installDir === undefined || installDir === '') {
  console.error('DSH_INSTALL_DIR is not set. Run this through the DSH Electron binary:')
  console.error('  $env:ELECTRON_RUN_AS_NODE = \'1\'; & $env:DSH_NODE_EXECUTABLE scripts/check-index.mjs')
  process.exit(2)
}

const requireFromDsh = createRequire(join(installDir, 'package.json'))
let validatorPath
try {
  // 解析包根（该包的 exports 只暴露 "."），不要写子路径 lib/index.js
  validatorPath = requireFromDsh.resolve('@deepseek-ai/dsh-plugin-market-index')
} catch (error) {
  console.error(`cannot resolve @deepseek-ai/dsh-plugin-market-index from ${installDir}`)
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(2)
}

const { parseMarketIndex, marketInstallTarget } = await import(pathToFileURL(validatorPath).href)
const document = JSON.parse(readFileSync(indexFile, 'utf8'))

try {
  const index = parseMarketIndex(document, INDEX_URL)
  console.log(`OK  ${index.plugins.length} plugin(s)  format=${index.format}`)
  for (const plugin of index.plugins) {
    const latest = plugin.versions[0]
    const target = marketInstallTarget(plugin.name, latest)
    console.log(`\n  ${plugin.name}@${latest.version}`)
    console.log(`    engines: ${JSON.stringify(latest.engines)}`)
    console.log(`    install: ${target.spec}`)
    console.log(`    icon:    ${plugin.icon ?? '(none)'}`)
    if (plugin.versions.length > 1) console.log(`    versions: ${plugin.versions.map((v) => v.version).join(', ')}`)
  }
} catch (error) {
  // MarketIndexError 带 JSON 路径，直接照它改
  console.error(`INVALID  ${error?.name ?? 'Error'}: ${error?.message ?? String(error)}`)
  process.exit(1)
}
