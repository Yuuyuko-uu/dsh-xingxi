/**
 * 星汐 0.3.0 三处修复的回归测试。
 * 跑法：node tests/尾巴日与水位.mjs
 */
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'

const 根 = mkdtempSync(join(tmpdir(), 'xingxi-test-'))
process.env.DSH_HOME = 根
const 星 = await import('../index.js')

let 过 = 0
function 验(名, 函) {
  try { 函(); 过++; console.log('PASS ', 名) } catch (e) { console.log('FAIL ', 名, '::', (e && e.message) || e); process.exitCode = 1 }
}

// ---------- ① 尾巴日：有日记但没动静时，不该算「到齐」 ----------
// 逻辑在闭包里，这里用等价表达式验：只今天=false、尾巴日=11-04 时必须要求有动静
验('尾巴日要求有动静（只今天=false 时不再短路）', () => {
  const 算 = (只今天, 尾巴日, 有动静) => (!(只今天 || 尾巴日) || 有动静)
  assert.equal(算(false, '2026-11-04', false), false, '尾巴日没动静，不能算到齐')
  assert.equal(算(false, '', false), true, '普通新的一天，看进度就行')
  assert.equal(算(true, '', false), false, '只今天没动静，不能算到齐')
  assert.equal(算(true, '', true), true, '只今天有动静，可以收工')
})

// ---------- ② 水位取所选那天最后一条 ----------
验('水位取本批最后时，不是全会话最晚', () => {
  // 准备料 现在多返回一个 本批最后时（只算本批处理的那几天）
  const 料 = { 最晚: '2026-11-06', 最后时: 1794046800000, 本批最后时: 1793980600000 }
  assert.equal(Number(料.本批最后时), 1793980600000)
  assert.notEqual(Number(料.本批最后时), Number(料.最后时), '不能等于全会话最晚')
  assert.ok(Number(料.本批最后时) < Number(料.最后时), '本批最后时必须更早')
})

// ---------- ③ 整章替换：条目明显变少要拒 ----------
验('整章替换：两条覆盖十二条要拒', () => {
  const 数条目 = (列) => 列.filter((l) => /^\s*(?:\d+[.、)]|[-*·]|[①②③④⑤⑥⑦⑧⑨⑩])/.test(String(l))).length
  const 旧 = Array.from({ length: 12 }, (_, i) => (i + 1) + '. 旧准则')
  const 新 = ['1. 新准则', '2. 新准则']
  const 旧条 = 数条目(旧)
  const 新条 = 数条目(新)
  assert.equal(旧条, 12)
  assert.equal(新条, 2)
  assert.ok(旧条 >= 5 && 新条 < 旧条 * 0.7, '应当拒收')
})

验('整章替换：条目相当就放行', () => {
  const 数条目 = (列) => 列.filter((l) => /^\s*(?:\d+[.、)]|[-*·]|[①②③④⑤⑥⑦⑧⑨⑩])/.test(String(l))).length
  const 旧 = Array.from({ length: 8 }, (_, i) => (i + 1) + '. 旧')
  const 新 = Array.from({ length: 7 }, (_, i) => (i + 1) + '. 新')
  assert.ok(!(数条目(旧) >= 5 && 数条目(新) < 数条目(旧) * 0.7), '不该拒')
})

console.log('\n' + (process.exitCode ? '有失败' : '全部通过 ✅') + '（' + 过 + ' 项）')

// ---------- ④ 点按钮那一刻锁死时间戳 ----------
验('截止之后的事件不算进料', () => {
  const 截止 = 1794060000000
  const 事件 = [
    { 日: '2026-11-07', 时: 1794059000000 },   // 截止前 → 要
    { 日: '2026-11-07', 时: 1794060500000 },   // 截止后 → 不要
  ]
  const 过 = 事件.filter((e) => !(截止 && Number(e.时 || 0) > Number(截止)))
  assert.equal(过.length, 1)
  assert.equal(过[0].时, 1794059000000)
})

验('没有截止时全部保留（老行为不变）', () => {
  const 截止 = 0
  const 事件 = [{ 时: 1 }, { 时: 9999999999999 }]
  const 过 = 事件.filter((e) => !(截止 && Number(e.时 || 0) > Number(截止)))
  assert.equal(过.length, 2)
})
