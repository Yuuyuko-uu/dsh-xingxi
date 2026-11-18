// 0.3.9 的回归：会话一多，「找一个会话的日志在哪」不能变成平方。
//
// 群友报的现场：0.3.3、259 间会话，切会话卡十几秒、主进程单核 100%、读盘 0（纯 CPU）。
//   原因：`找会话日志` 每次调用都重扫整个 sessions 目录（readdir + 每个子目录一次 existsSync），
//   外层又是逐会话循环 —— 代价是会话数的平方。
//
// 现在：目录列表 1.5 秒 TTL 缓存 + 一张 id→路径 的表。
// 这个用例守三件事：
//   ① 所有会话都还找得到（缓存不能漏人）
//   ② 找不到的就是找不到，不会返回一个假路径
//   ③ 新会话最迟 1.5 秒后能看到、删掉的也会消失（缓存不能把人锁死在外面）
//
// 跑法：node tests/会话查找缓存.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const 家 = fs.mkdtempSync(path.join(os.tmpdir(), 'xingxi-cache-'))
process.env.DSH_HOME = 家
const 会话根 = path.join(家, 'sessions')
fs.mkdirSync(会话根, { recursive: true })

let 通过 = 0
async function 测(名, 做) {
  try { await 做(); 通过 += 1; console.log('PASS  ' + 名) }
  catch (e) { console.log('FAIL  ' + 名 + '  :: ' + ((e && e.message) || e)); process.exitCode = 1 }
}
const 等 = (ms) => new Promise((r) => setTimeout(r, ms))
const TTL = 1700   // 略大于缓存时长，等它自然过期

// 造 200 间：一半在工作区目录里，一半是裸 uuid（插件建的那种）
const 建 = (id, 子 = '') => {
  const dir = path.join(会话根, 子, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), 'x')
  return dir
}
const 打头 = []
for (let i = 0; i < 200; i++) {
  const id = 'session-' + i
  if (i % 2 === 0) 建(id, '--w' + String(i % 10).padStart(2, '0') + '--')
  else 建(id)
  打头.push(id)
}

const { 找会话日志 } = await import('../index.js')

await 测('200 间会话一个都不漏', () => {
  let 找到 = 0
  for (const id of 打头) if (找会话日志(id)) 找到 += 1
  assert.equal(找到, 打头.length)
})

await 测('不存在的会话返回空，不乱给路径', () => {
  assert.equal(找会话日志('session-不存在'), '')
  assert.equal(找会话日志(''), '')
})

await 测('查得多也快：再查 200 次不重新扫盘', () => {
  const t = process.hrtime.bigint()
  for (const id of 打头) 找会话日志(id)
  const ms = Number(process.hrtime.bigint() - t) / 1e6
  // 旧写法这里大约是「一次扫盘的耗时 × 200」；新写法是个位数毫秒。
  // 给到 300ms 是防机器特别慢时误报，不是为了放宽标准。
  assert.ok(ms < 300, '200 次查找用了 ' + ms.toFixed(1) + 'ms，太慢了')
})

await 测('刚建的会话在缓存过期后能看到', async () => {
  const id = 'session-新来的'
  建(id)
  await 等(TTL)
  assert.ok(找会话日志(id), '刚建的会话应该能找到')
})

await 测('删掉的会话在缓存过期后会消失', async () => {
  const id = 'session-要删的'
  const 目录 = 建(id)
  await 等(TTL)
  assert.ok(找会话日志(id), '删之前应该能找到')
  fs.rmSync(目录, { recursive: true, force: true })
  await 等(TTL)
  assert.equal(找会话日志(id), '')
})

console.log('')
console.log('通过 ' + 通过 + ' 项')
fs.rmSync(家, { recursive: true, force: true })
