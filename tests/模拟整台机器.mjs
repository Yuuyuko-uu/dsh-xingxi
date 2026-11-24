// ⭐ 0.4.6 模拟整台机器：把群里那台的形状整个造出来，用**真的代码**跑一遍。
//
//   造的东西（全部在临时目录，不碰任何真实数据）：
//     <家>/sessions/--F-workspace--/session-真会话/session.v4.jsonl.zstd   有 11-10 ~ 11-17 的内容
//     <家>/sessions/--F-home-xingxi-临时-session-xx--/session-工人/session.v4.jsonl.zstd   星汐自己的
//     <家>/xingxi/会话/session-真会话/.xingxi.json                        账本超前到 11-23
//
//   要验证的是那条**完整的死循环**：
//     账本 11-23 + 内容只到 11-17 → 按天切 = 0 天 → 永远没料
//     → 退回账本到 11-17 → 又切得出 7 天 → 不再卡死
//
// 跑法：node tests/模拟整台机器.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const 根 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── 造这台的「家」 ─────────────────────────────────────
const 家 = fs.mkdtempSync(path.join(os.tmpdir(), 'xingxi-sim-'))
process.env.DSH_HOME = 家

const 会话根 = path.join(家, 'sessions')
const 造目录 = (p) => {
  fs.mkdirSync(p, { recursive: true })
  return p
}

/** 造一个符合 DSH 格式的会话日志：多条 zstd 帧首尾相接 */
function 造日志(工作区名, 会目录名, 事件们) {
  const 夹 = 造目录(path.join(会话根, 工作区名, 会目录名))
  const 帧们 = 事件们.map((e) =>
    zlib.zstdCompressSync(Buffer.from(JSON.stringify(e) + '\n', 'utf8')),
  )
  fs.writeFileSync(path.join(夹, 'session.v4.jsonl.zstd'), Buffer.concat(帧们))
  return 夹
}

const 说话 = (时, 角色, 文) =>
  角色 === 'USER'
    ? {
        type: 'user/message',
        time: 时,
        data: { source: { kind: 'user' }, content: [{ type: 'text', text: 文 }] },
      }
    : {
        type: 'assistant/message',
        time: 时,
        data: { message: { content: [{ type: 'text', text: 文 }] } },
      }

const 某天 = (s) => Date.parse(s + 'T20:00:00+08:00')

// 真会话：11-10 到 11-17，每天两句话
const 真会话 = 'session-11111111-2222-3333-4444-555555555555'
const 真事件 = []
for (let d = 10; d <= 17; d++) {
  const 日 = '2026-11-' + String(d).padStart(2, '0')
  真事件.push(说话(某天(日), 'USER', 日 + ' 她在跟我讲今天的事'))
  真事件.push(说话(某天(日) + 60000, 'ASSISTANT', 日 + ' 我在听，也回了几句'))
}
造日志('--F-workspace--', 真会话, 真事件)

// 星汐自己的工人会话：cwd 落在 <家>/xingxi/临时 下面
const 工人会话 = 'session-99999999-8888-7777-6666-555555555555'
造日志('--F-home-xingxi-临时-session-99999999--', 工人会话, [
  说话(某天('2026-11-17'), 'USER', '按格式交出来'),
  说话(某天('2026-11-17') + 1000, 'ASSISTANT', '收到了'),
])

// 档案：账本超前的那个
const 档 = 造目录(path.join(家, 'xingxi', '会话', 真会话))
fs.writeFileSync(path.join(档, '.xingxi.json'), JSON.stringify({ 已整理到: '2026-11-23', 已到: 0 }, null, 2), 'utf8')

const 模 = await import('file:///' + path.join(根, 'index.js').replace(/\\/g, '/') + '?t=' + Date.now())

// ═══════════════════════════════════════════════════
// 一、会话可见性（F:\dsh-home 那台的老毛病）
// ═══════════════════════════════════════════════════
test('模拟：星汐自己的工人会话认得出来，真会话不误伤', () => {
  assert.equal(模.是星汐自己的会话(path.join(家, 'xingxi', '临时', 工人会话), 家), true, '工人会话没认出来')
  assert.equal(模.是星汐自己的会话('F:\\workspace', 家), false, '把真会话藏了')
})

// ═══════════════════════════════════════════════════
// 二、日志真的读得出来（多帧 zstd 那条路不能坏）
// ═══════════════════════════════════════════════════
test('模拟：多帧 zstd 的会话日志，读得出来', () => {
  const 路 = 模.找会话日志(真会话)
  assert.ok(路, '找不到这个会话的日志')
  assert.match(路, /session\.v4\.jsonl\.zstd$/)
  const { 事件 } = 模.读会话(真会话)
  assert.equal(事件.length, 16, '应该读到 16 条（8 天 × 2）')
  assert.equal(事件[0].日, '2026-11-10')
  assert.equal(事件[事件.length - 1].日, '2026-11-17')
})

// ═══════════════════════════════════════════════════
// 三、死循环本身：账本超前 → 0 天
// ═══════════════════════════════════════════════════
test('模拟：账本超前时，切出来就是 0 天（这正是「卡在 11-17」的真相）', () => {
  const 切 = 模.按天切(真会话, '2026-11-23', 0)
  assert.equal(切.天数, 0, '账本超前还切出了东西？')
  assert.equal(切.全部事件, 16, '但事件其实是读到了的 —— 全被账本挡在后面')
  assert.equal(切.最晚, '', '没有可做的天')
})

test('模拟：账本提前检测能把这台报出来', () => {
  const 账 = 模.检测账本超前(档, '2026-11-17')
  assert.equal(账.超前, true)
  assert.equal(账.账本, '2026-11-23')
  assert.equal(账.内容最晚, '2026-11-17')
  assert.equal(账.差几天, 6, '11-17 到 11-23 差 6 天')
})

test('模拟：退回账本之后，又切得出那 8 天（死循环解开）', () => {
  const 账 = 模.检测账本超前(档, '2026-11-17')
  // ⚠ 要退到**内容最晚的前一天**：`已整理到` 的意思是「这天及之前都做完了」，
  //   退到 11-17 本身的话，11-17 还是被挡在外面（这就是我第一版写错的地方）
  assert.equal(账.建议退到, '2026-11-16', '建议退回的日期不对')
  const 结 = 模.退回账本(档, 账.建议退到)
  assert.equal(结.ok, true, 结.原因 || '')
  const 切 = 模.按天切(真会话, 账.建议退到, 0)
  // 退回之后 11-17 那天又能切出来了；11-10 ~ 11-16 是它之前已经做完的
  assert.ok(切.天数 >= 1, '退回之后还是只有 ' + 切.天数 + ' 天')
  assert.equal(切.最晚, '2026-11-17', '退回去以后最晚一天应该是 11-17')
  assert.equal(切.最早, '2026-11-17')
})

test('模拟：退回动作本身没把日记和记忆卡碰掉', () => {
  fs.writeFileSync(path.join(档, '记忆卡.md'), '# 记忆卡\n\n## 一｜我是谁\n\n- 一条\n', 'utf8')
  造目录(path.join(档, '日记'))
  const 日路 = path.join(档, '日记', '2026-11-10.md')
  fs.writeFileSync(日路, '# 11-10\n\n' + '那天的事写了两百来字，日记是真的写过的，不该被账本操作碰。'.repeat(3), 'utf8')
  const 前卡 = fs.readFileSync(path.join(档, '记忆卡.md'), 'utf8')
  const 前日 = fs.readFileSync(日路, 'utf8')
  模.退回账本(档, '2026-11-10')
  assert.equal(fs.readFileSync(path.join(档, '记忆卡.md'), 'utf8'), 前卡, '记忆卡被动过')
  assert.equal(fs.readFileSync(日路, 'utf8'), 前日, '日记被动过')
})

// ═══════════════════════════════════════════════════
// 四、整台机器一起看：从「什么都有」到「合出来一份」
// ═══════════════════════════════════════════════════
test('模拟：两份档案合并，只一份的原样、重复的挑出来、原档不动', () => {
  const A = 造目录(path.join(家, '档案A'))
  const B = 造目录(path.join(家, '档案B'))
  fs.writeFileSync(path.join(A, '记忆卡.md'), '# 记忆卡\n\n## 一｜我是谁\n\n- A 说的一条\n', 'utf8')
  fs.writeFileSync(path.join(B, '记忆卡.md'), '# 记忆卡\n\n## 一｜我是谁\n\n- B 说的一条\n', 'utf8')
  造目录(path.join(A, '日记'))
  造目录(path.join(B, '日记'))
  fs.writeFileSync(path.join(A, '日记', '2026-11-10.md'), '# 11-10\n\nA 窗口里那天，写了两百来字的经过，细节都在。'.repeat(2), 'utf8')
  fs.writeFileSync(path.join(B, '日记', '2026-11-10.md'), '# 11-10\n\nB 窗口里同一天，是另一段经历，也不短，不能被丢掉。'.repeat(2), 'utf8')
  fs.writeFileSync(path.join(A, '日记', '2026-11-11.md'), '# 11-11\n\n只有 A 写过这一天，原样搬走就行，一个字不改。'.repeat(2), 'utf8')

  const 计 = 模.合并计划([A, B])
  assert.equal(计.ok, true)
  assert.deepEqual(计.只一份, ['2026-11-11'], '只出现一天的那几天不对')
  assert.equal(计.要合.length, 1)
  assert.equal(计.要合[0].日, '2026-11-10')
  assert.equal(计.记忆卡份数, 2)
  assert.equal(计.记忆卡要合, true)

  // 提示词要带出「有分歧要留着」这条规矩
  const 词 = 模.造合并提示词(计, path.join(家, '合并结果'))
  assert.match(词.记忆卡, /有分歧/)
  assert.match(词.日记, /2026-11-10/, '要合的那天得在提示词里')
  // ⭐ 0.4.6 改了：只有一份的那几天插件已经抄好，**不该再让 AI 去「原样复制」一遍**
  assert.ok(!词.日记.includes('2026-11-11'), '原样复制的那天漏进提示词了，会把 AI 的注意力浪费掉')
  // 验人那一段必须在两半里都有
  assert.match(词.日记, /不同的人/)
  assert.match(词.记忆卡, /不同的人/)
})

console.log('')
console.log('（这些都跑在临时目录里，跑完就删，不碰真实档案）')
