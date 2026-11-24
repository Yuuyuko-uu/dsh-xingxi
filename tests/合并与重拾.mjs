// ⭐ 0.4.6：两个新东西的回归。
//
//   ⑥ 「重拾某一天」→「重拾一段」（老大反馈：先拾新会话、再拾旧窗口，就永远补不进去了）
//   ⑦ 合并档案：几份档案合成一份（记忆卡 + 日记），原档一个字节都不许动
//
// 这两个都是**先算出计划、再交给 AI 去写**，所以纯计算部分必须能单独测。
//
// 跑法：node tests/合并与重拾.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const 根 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const 临时家 = fs.mkdtempSync(path.join(os.tmpdir(), 'xingxi-home2-'))
process.env.DSH_HOME = 临时家

const 模 = await import('file:///' + path.join(根, 'index.js').replace(/\\/g, '/') + '?t=' + Date.now())

let 计数 = 0
const 造夹 = () => {
  const p = path.join(临时家, '档' + ++计数)
  fs.mkdirSync(p, { recursive: true })
  return p
}
const 写日记 = (夹, 日, 正文) => {
  fs.mkdirSync(path.join(夹, '日记'), { recursive: true })
  fs.writeFileSync(path.join(夹, '日记', 日 + '.md'), '# ' + 日 + '\n\n' + 正文, 'utf8')
}
const 写原文 = (夹, 日, 正文) => {
  fs.mkdirSync(path.join(夹, '原始对话'), { recursive: true })
  fs.writeFileSync(path.join(夹, '原始对话', 日 + '.txt'), 正文, 'utf8')
}
const 写记忆卡 = (夹, 正文 = '# 记忆卡\n\n## 一｜我是谁\n\n- 一条\n') => {
  fs.writeFileSync(path.join(夹, '记忆卡.md'), 正文, 'utf8')
}

// ═══════════════════════════════════════════════════
// ⑥ 重拾一段
// ═══════════════════════════════════════════════════
test('重拾一段：单日写法要认得（老用法不能坏）', () => {
  const r = 模.解析重拾范围('2026-11-17')
  assert.ok(r, '单日被判成无效')
  assert.equal(r.从, '2026-11-17')
  assert.equal(r.到, '2026-11-17')
  assert.equal(r.天数, 1)
})

test('重拾一段：起止写法要认得', () => {
  for (const s of ['2026-11-10~2026-11-12', '2026-11-10 到 2026-11-12', '2026-11-10..2026-11-12', '2026-11-10-2026-11-12']) {
    const r = 模.解析重拾范围(s)
    assert.ok(r, '不认识：' + s)
    assert.equal(r.从, '2026-11-10', s)
    assert.equal(r.到, '2026-11-12', s)
    assert.equal(r.天数, 3, s)
  }
})

test('重拾一段：起止写反了要自动正过来', () => {
  const r = 模.解析重拾范围('2026-11-12~2026-11-10')
  assert.equal(r.从, '2026-11-10')
  assert.equal(r.到, '2026-11-12')
})

test('重拾一段：太长要拒绝（不许一口气补一年）', () => {
  assert.equal(模.解析重拾范围('2026-01-01~2026-12-31'), null)
})

test('重拾一段：乱七八糟的输入一律拒绝，不许猜', () => {
  for (const 坏 of ['', '  ', '明天', '2026', '2026-13-01', '2026-11-32', '11-10', null, undefined, '~']) {
    assert.equal(模.解析重拾范围(坏), null, '居然认了：' + String(坏))
  }
})

// ═══════════════════════════════════════════════════
// ⑦ 合并档案
// ═══════════════════════════════════════════════════
test('盘点：读出档案里有什么', () => {
  const 夹 = 造夹()
  写日记(夹, '2026-11-10', '今天聊了很久，她说起小时候的事，笑了好几回，后来还翻出了旧照片。')
  写日记(夹, '2026-11-11', '今天很短，但她一直在。')
  写原文(夹, '2026-11-10', '[2026-11-10 20:00 USER]\n在吗\n')
  写记忆卡(夹)
  const 盘 = 模.盘点档案(夹)
  assert.equal(盘.记忆卡, true)
  assert.deepEqual(盘.日记.sort(), ['2026-11-10', '2026-11-11'])
  assert.deepEqual(盘.原始对话, ['2026-11-10'])
})

test('盘点：空夹子不崩，什么都不返回假的', () => {
  const 盘 = 模.盘点档案(造夹())
  assert.equal(盘.记忆卡, false)
  assert.deepEqual(盘.日记, [])
  assert.deepEqual(盘.原始对话, [])
})

test('合并计划：同一天只有一份 → 原样复制；多份 → 交给 AI 合', () => {
  const a = 造夹(); const b = 造夹(); const c = 造夹()
  写日记(a, '2026-11-10', 'A 写的第十天，讲了很久的话，足足两百来字，细节都在里面。')
  写日记(a, '2026-11-11', 'A 只写过第十一天，而且只有这一份，内容够长了，不能再丢。')
  写日记(b, '2026-11-10', 'B 也写第十天，是另一个窗口里的另一段经历，也不短，不能丢。')
  写日记(c, '2026-11-12', 'C 写第十二天，唯独它有这一天，原样搬过去就对了，别改。')

  const 计 = 模.合并计划([a, b, c])
  assert.deepEqual(计.只一份.sort(), ['2026-11-11', '2026-11-12'], '只出现一天的那几天算错了')
  const 多 = 计.要合.map((x) => x.日).sort()
  assert.deepEqual(多, ['2026-11-10'], '重复的那天没挑出来')
  const 那天 = 计.要合.find((x) => x.日 === '2026-11-10')
  assert.equal(那天.来源.length, 2, '第十天应该有两个来源')
})

test('合并计划：记忆卡只有一份就不必让 AI 合', () => {
  const a = 造夹(); const b = 造夹()
  写记忆卡(a)
  const 计 = 模.合并计划([a, b])
  assert.equal(计.记忆卡份数, 1)
  assert.equal(计.记忆卡要合, false)
})

test('合并计划：记忆卡两份以上才要合', () => {
  const a = 造夹(); const b = 造夹()
  写记忆卡(a); 写记忆卡(b)
  const 计 = 模.合并计划([a, b])
  assert.equal(计.记忆卡份数, 2)
  assert.equal(计.记忆卡要合, true)
})

test('合并计划：目标夹子就在源里面时要拒绝（防止自己合自己）', () => {
  const a = 造夹()
  写记忆卡(a)
  const 坏 = 模.合并计划([a], a)
  assert.equal(坏.ok, false)
  assert.match(String(坏.原因), /自己|同一个|目标/)
})

test('合并计划：一个夹子都没有要拒绝', () => {
  assert.equal(模.合并计划([]).ok, false)
  assert.equal(模.合并计划(null).ok, false)
})

test('合并计划：原档一个字节都不许动', () => {
  const a = 造夹(); const b = 造夹()
  写日记(a, '2026-11-10', 'A 的第十天，内容很长很长，够四十个字，不会被当成占位丢掉。')
  写日记(b, '2026-11-10', 'B 的第十天，同样很长很长，够四十个字，也是真的写过的日记。')
  写记忆卡(a); 写记忆卡(b)
  const 快照 = (夹) => fs.readdirSync(夹, { withFileTypes: true })
    .flatMap((d) => d.isDirectory()
      ? fs.readdirSync(path.join(夹, d.name)).map((f) => d.name + '/' + f + ':' + fs.statSync(path.join(夹, d.name, f)).mtimeMs)
      : [d.name + ':' + fs.statSync(path.join(夹, d.name)).mtimeMs])
    .sort()
  const 前a = 快照(a); const 前b = 快照(b)
  模.合并计划([a, b])
  assert.deepEqual(快照(a), 前a, '算计划的时候把 A 动了')
  assert.deepEqual(快照(b), 前b, '算计划的时候把 B 动了')
})

test('合并提示词：要写明「矛盾的都留着、不许自己判谁对」', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  assert.match(源, /有分歧/, '记忆卡合并提示词里没有「有分歧」这条规矩')
  assert.match(源, /不许自己判断|不许自己判/, '没有明令禁止 AI 自己挑一个')
  assert.match(源, /原样复制|原样搬/, '日记合并提示词里没有「只有一份的原样复制」')
})
