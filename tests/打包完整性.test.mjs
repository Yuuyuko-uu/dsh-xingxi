// ⭐ 0.4.4：这一条是为了不再犯同一个错。
//
//   0.4.3 发出去之后载入失败：index.js 里 `import './lib/星的操作.mjs'`，
//   可 package.json 的 `files` 里没有 `lib` —— npm 打包时整目录被丢掉，
//   装机后直接 ERR_MODULE_NOT_FOUND，插件根本起不来。
//   本地怎么跑都是好的，因为本地有那个目录。
//
//   所以这里直接问 npm「你到底会打进去哪些文件」，再回头核 index.js / client.js
//   里引用的每一个本地模块在不在里面。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const 根 = join(dirname(fileURLToPath(import.meta.url)), '..')

function 打包清单() {
  // ⚠ 用 execSync 传**一整条命令**：Windows 上直接 execFile('npm.cmd') 会 EINVAL，
  //   而 execFile + shell:true + 参数数组又会触发 DEP0190（退出码变 1，整套跑挂）。
  const 出 = execSync('npm pack --dry-run --json', {
    cwd: 根,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  // npm 有时会在前面打印一点别的东西（warning / 提示），从第一个 '[' 开始截
  const 段 = 出.slice(出.indexOf('['))
  const j = JSON.parse(段)
  return j[0].files.map((f) => String(f.path).replace(/\\/g, '/'))
}

test('打包会漏文件吗：index.js / client.js 引用的本地模块必须都在包里', () => {
  const 清单 = new Set(打包清单())
  const 缺 = []
  for (const 名 of ['index.js', 'client.js']) {
    let 文 = ''
    try {
      文 = readFileSync(join(根, 名), 'utf8')
    } catch {
      continue
    }
    for (const m of 文.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const 相对 = normalize(m[1]).replace(/\\/g, '/')
      if (!清单.has(相对)) 缺.push(名 + ' → ' + 相对)
    }
  }
  assert.deepEqual(缺, [], '打包漏了这些本地模块（装上去会 ERR_MODULE_NOT_FOUND）：' + 缺.join('、'))
})

test('包里带着 lib 目录（星图改删那两个模块就在这儿）', () => {
  const 清单 = 打包清单()
  assert.ok(清单.some((p) => p.startsWith('lib/')), 'lib/ 没进包')
})
