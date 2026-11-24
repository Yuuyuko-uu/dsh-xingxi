// ⭐ 0.4.6：把群里那台的死循环**整条跑一遍**，不是源码断言。
//
//   那台的形状：
//     A 会话很大（说得很多），但内容停在 11-12
//     B 会话小一点，却有 11-17 的新内容
//     档案的账本却写着「已整理到 11-23」
//
//   → 按天切：两个都是 0 天（账本把它们全挡在后面）
//   → 排源会话只能按「事件多」排 → 选中又大又旧的 A
//   → 每次都说「还有 0 天没整理」→ 永远没料 → 定时名额被它占死
//   → 退回账本到 11-16 → B 有 1 天、A 还是 0 天 → 改选 B → 解开
//
//   ⚠ 这个文件必须**单独跑**：`列会话目录()` 有 1.5 秒 TTL 缓存，
//     跟别的用例混在一个文件里时，后造的会话会不在缓存里，测出来是假的 0。
//
// 跑法：node tests/选源死循环.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const 根 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const 家 = fs.mkdtempSync(path.join(os.tmpdir(), 'xingxi-死循环-'))
process.env.DSH_HOME = 家

const 会话根 = path.join(家, 'sessions')
const 某天 = (s) => Date.parse(s + 'T20:00:00+08:00')
const 说 = (时, 角色, 文) =>
  角色 === 'USER'
    ? { type: 'user/message', time: 时, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 文 }] } }
    : { type: 'assistant/message', time: 时, data: { message: { content: [{ type: 'text', text: 文 }] } } }

function 造日志(会id, 事件们) {
  const 夹 = path.join(会话根, '--F-workspace--', 会id)
  fs.mkdirSync(夹, { recursive: true })
  fs.writeFileSync(
    path.join(夹, 'session.v4.jsonl.zstd'),
    Buffer.concat(事件们.map((e) => zlib.zstdCompressSync(Buffer.from(JSON.stringify(e) + '\n', 'utf8')))),
  )
}

// A：11-01 ~ 11-12，条数多（模拟「说得很多但停得早」）
const A = 'session-aaaaaaaa-0000-0000-0000-000000000001'
const A事 = []
for (let d = 1; d <= 12; d++) {
  const 日 = '2026-11-' + String(d).padStart(2, '0')
  A事.push(说(某天(日), 'USER', 'A 那天说了一句话'))
  A事.push(说(某天(日) + 1000, 'ASSISTANT', 'A 那天回了一句'))
}
for (let i = 0; i < 6; i++) A事.push(说(某天('2026-11-12') + 2000 + i, 'USER', 'A 补一句 ' + i))
造日志(A, A事)

// B：11-13 ~ 11-17，条数少（模拟「小，但有新内容」）
const B = 'session-bbbbbbbb-0000-0000-0000-000000000002'
const B事 = []
for (let d = 13; d <= 17; d++) {
  const 日 = '2026-11-' + String(d).padStart(2, '0')
  B事.push(说(某天(日), 'USER', 'B 那天说了话'))
  B事.push(说(某天(日) + 1000, 'ASSISTANT', 'B 那天回了话'))
}
造日志(B, B事)

const 档 = path.join(家, 'xingxi', '会话', '卡住的那个')
fs.mkdirSync(档, { recursive: true })
fs.writeFileSync(path.join(档, '.xingxi.json'), JSON.stringify({ 已整理到: '2026-11-23', 已到: 0 }), 'utf8')

const 模 = await import('file:///' + path.join(根, 'index.js').replace(/\\/g, '/') + '?t=' + Date.now())

/** 跟 `找源会话` 里一模一样的算法：按天切 → 排源会话 */
const 候选 = (账本) =>
  [A, B].map((id) => {
    const 切 = 模.按天切(id, 账本, 0)
    return { id, 活: Number(切.天数) || 0, 量: 切.全部事件, 最晚: String(切.最晚 || '') }
  })

test('两个会话都读得到（不然下面的推论全废）', () => {
  assert.ok(模.找会话日志(A), 'A 的日志没找到')
  assert.ok(模.找会话日志(B), 'B 的日志没找到')
  assert.ok(模.读会话(A).事件.length > 0, 'A 读不出事件')
  assert.ok(模.读会话(B).事件.length > 0, 'B 读不出事件')
})

test('账本超前那一版：两个都是 0 天，于是选中又大又旧的 A（这就是「一直没料」）', () => {
  const 前 = 候选('2026-11-23')
  const A项 = 前.find((x) => x.id === A)
  const B项 = 前.find((x) => x.id === B)
  assert.equal(A项.活, 0, 'A 应该 0 天')
  assert.equal(B项.活, 0, 'B 也应该 0 天 —— 账本把 11-17 也挡在外面了')
  assert.ok(A项.量 > B项.量, 'A 的事件应该更多（所以它会被选中）')
  assert.equal(模.排源会话(前)[0], A, '应该选中 A —— 复现成功')
})

test('检测把账本超前报出来，并给出该退到哪天', () => {
  const 超 = 模.检测账本超前(档, '2026-11-17')
  assert.equal(超.超前, true)
  assert.equal(超.账本, '2026-11-23')
  assert.equal(超.内容最晚, '2026-11-17')
  assert.equal(超.差几天, 6)
  // 退到 11-17 本身不行 —— 那天还是被「已整理到」挡着
  assert.equal(超.建议退到, '2026-11-16', '得退到前一天，否则点完还是没料')
})

test('退回之后：B 有料了，改选 B —— 死循环解开', () => {
  assert.equal(模.退回账本(档, '2026-11-16').ok, true)
  const 后 = 候选('2026-11-16')
  const A项 = 后.find((x) => x.id === A)
  const B项 = 后.find((x) => x.id === B)
  assert.equal(A项.活, 0, 'A 的内容都在水位之前，还是 0 天')
  assert.equal(B项.活, 1, 'B 应该正好切出 11-17 那一天')
  assert.equal(B项.最晚, '2026-11-17')
  assert.equal(模.排源会话(后)[0], B, '退回之后应该选中真有料的 B')
})

test('退回到账本和内容齐平的位置：还是切不出东西（说明必须退到前一天）', () => {
  // 这条是给「退回日期该怎么算」立的规矩，防止以后有人把它改回去
  const 切 = 模.按天切(B, '2026-11-17', 0)
  assert.equal(切.天数, 0, `已整理到 11-17 意味着 11-17 及之前都做完了，那天切不出来是对的`)
})

console.log('')
console.log('（临时目录里造的假机器，跑完就删）')
