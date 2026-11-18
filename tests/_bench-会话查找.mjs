// 量一下「会话很多时，找一个会话的日志要多久」——
// 旧写法每次调用都要重扫整个 sessions 目录（readdir + 每个子目录 existsSync），
// 外层逐会话循环就是会话数的平方。这个脚本造 250 间会话，量新写法。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const 家 = fs.mkdtempSync(path.join(os.tmpdir(), 'xingxi-bench-'))
process.env.DSH_HOME = 家
const 会话根 = path.join(家, 'sessions')
fs.mkdirSync(会话根, { recursive: true })

const 会话数 = 250
const 工作区数 = 10
const id们 = []
for (let i = 0; i < 会话数; i++) {
  const 区 = '--w' + String(i % 工作区数).padStart(2, '0') + '--'
  // 一半散在工作区目录里，一半是裸 uuid（插件建的）
  const 目录 = i % 2 === 0 ? path.join(会话根, 区, 'session-' + i) : path.join(会话根, 'session-' + i)
  fs.mkdirSync(目录, { recursive: true })
  fs.writeFileSync(path.join(目录, 'session.v4.jsonl.zstd'), 'x')
  id们.push('session-' + i)
}

const { 找会话日志 } = await import('../index.js')

// 第一次会建表：这就是旧写法里**每一次**调用都要付的代价
let t = process.hrtime.bigint()
找会话日志(id们[0])
const 建表 = Number(process.hrtime.bigint() - t) / 1e6

// 之后 250 次查询
t = process.hrtime.bigint()
let 命中 = 0
for (const id of id们) if (找会话日志(id)) 命中 += 1
const 全查 = Number(process.hrtime.bigint() - t) / 1e6

console.log('会话数:', 会话数, ' 工作区数:', 工作区数)
console.log('建表一次（= 旧写法每次调用的代价）:', 建表.toFixed(2), 'ms')
console.log('新写法查 ' + 会话数 + ' 次共:', 全查.toFixed(2), 'ms', ' 命中', 命中)
console.log('旧写法估: ' + (建表 * 会话数).toFixed(0) + ' ms（' + 会话数 + ' 次扫描）')
console.log('提速约', (建表 * 会话数 / Math.max(全查, 0.001)).toFixed(0) + ' 倍')

fs.rmSync(家, { recursive: true, force: true })
