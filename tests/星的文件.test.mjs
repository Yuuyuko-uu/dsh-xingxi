// 星的文件定位的自测 —— 用临时目录造两套「档案」，检查它绝不跨档案。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { 定位档案文件, 名字安全, 文件在档案里 } from '../lib/星的文件.mjs'

// A 档案：绑了会话 a
// B 档案：绑了会话 b
const 根 = mkdtempSync(join(tmpdir(), '星汐文件-'))
const A = join(根, 'A档案')
const B = join(根, 'B档案')
mkdirSync(join(A, '日记'), { recursive: true })
mkdirSync(join(B, '日记'), { recursive: true })
writeFileSync(join(A, '甲的记忆卡.md'), '- 甲的一条\n')
writeFileSync(join(A, '日记', '2026-11-19.md'), '【2026-11-19】\n\n甲的这一天\n')
writeFileSync(join(B, '甲的回忆.md'), '- 乙的一条\n')
writeFileSync(join(B, '日记', '2026-11-19.md'), '【2026-11-19】\n\n乙的这一天\n')

const 存 = {
  绑定: { 'session-a': A, 'session-b': B },
  记忆卡: join(B, '甲的记忆卡.md'),
  日记: join(B, '日记'),
}

test('会话绑了文件夹：只在那一个文件夹里找（子目录丢了也找得到）', () => {
  const 回 = 定位档案文件(存, 'session-a', '2026-11-19')
  assert.equal(回.ok, true)
  assert.equal(回.文件, join(A, '日记', '2026-11-19.md'), '必须落在 A 档案里')
})

test('带上子目录的 doc 一样认', () => {
  const 回 = 定位档案文件(存, 'session-a', '日记/2026-11-19')
  assert.equal(回.ok, true)
  assert.equal(回.文件, join(A, '日记', '2026-11-19.md'))
})

test('裸 id（没有 session- 前缀）也要认', () => {
  const 回 = 定位档案文件(存, 'a', '2026-11-19')
  assert.equal(回.ok, true)
  assert.equal(回.文件, join(A, '日记', '2026-11-19.md'))
})

test('A 档案里没有的东西，绝不去 B 档案里捞', () => {
  const 回 = 定位档案文件(存, 'session-a', '甲的回忆')
  assert.equal(回.ok, false, 'B 里有这个文件，但 A 的星不该读到 B 的')
})

test('没绑文件夹又不是本机 → 直接拒绝（不许退到别的档案）', () => {
  const 回 = 定位档案文件(存, 'session-陌生', '2026-11-19')
  assert.equal(回.ok, false)
  assert.match(回.原因, /绑文件夹/)
})

test('没绑文件夹、但默认目录里有 → 就在它自己的默认目录里找（不算跨档案）', () => {
  const 档根 = join(根, '默认档案根')
  mkdirSync(join(档根, 'session-陌生', '日记'), { recursive: true })
  writeFileSync(join(档根, 'session-陌生', '日记', '2026-11-19.md'), '【2026-11-19】\n\n默认目录里的这一天\n')
  const 回 = 定位档案文件(存, 'session-陌生', '日记/2026-11-19', 档根)
  assert.equal(回.ok, true)
  assert.equal(回.文件, join(档根, 'session-陌生', '日记', '2026-11-19.md'))
})

test('没给会话 → 拒绝', () => {
  assert.equal(定位档案文件(存, '', '2026-11-19').ok, false)
})

test('本机的「记忆卡」认配置里那一份（文件名不一定叫记忆卡）', () => {
  const 回 = 定位档案文件({ ...存, 记忆卡: join(A, '甲的记忆卡.md') }, '__本机__', '记忆卡')
  assert.equal(回.ok, true)
  assert.equal(回.文件, join(A, '甲的记忆卡.md'))
})

test('本机按日期找日记', () => {
  const 回 = 定位档案文件(存, '__本机__', '2026-11-19')
  assert.equal(回.ok, true)
  assert.equal(回.文件, join(B, '日记', '2026-11-19.md'))
})

test('不安全的文件名一律不接', () => {
  for (const 坏 of ['../逃出去', '..\\windows', '/etc/passwd', 'C:\\Windows\\x.md', '..', '']) {
    assert.equal(名字安全(坏), false, 坏 + ' 应该被拒')
    assert.equal(定位档案文件(存, 'session-a', 坏).ok, false)
  }
})

test('同一个档案里两个同名文件 → 拒绝（不猜）', () => {
  writeFileSync(join(A, '2026-11-19.md'), '同名的一份\n')
  const 回 = 定位档案文件(存, 'session-a', '2026-11-19')
  assert.equal(回.ok, false)
  assert.match(回.原因, /2 个同名/)
  rmSync(join(A, '2026-11-19.md'))
})

test('档案里根本没有 → 报找不到，并带上 doc', () => {
  const 回 = 定位档案文件(存, 'session-a', '2020-01-01')
  assert.equal(回.ok, false)
  assert.match(回.原因, /2020-01-01/)
})

test.after(() => {
  try {
    rmSync(根, { recursive: true, force: true })
  } catch {}
})

// ── 界面直接把「星图来源的文件路径」递回来时，只做一道安全检查 ──
test('文件在档案里：档案目录里的 .md 放行', () => {
  assert.equal(文件在档案里(存, 根, join(A, '日记', '2026-11-19.md')), true)
  assert.equal(文件在档案里(存, 根, join(B, '甲的回忆.md')), true)
})

test('文件在档案里：档案外面的、非 .md 的、带 .. 的一律不放行', () => {
  assert.equal(文件在档案里(存, 根, join(tmpdir(), '别处.md')), false)
  assert.equal(文件在档案里(存, 根, join(A, '日记', '2026-11-19.txt')), false)
  assert.equal(文件在档案里(存, 根, join(A, '..', '..', 'x.md')), false)
  assert.equal(文件在档案里(存, 根, ''), false)
})
