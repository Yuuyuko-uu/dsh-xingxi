// ⭐ 0.4.6：群里两台机器报的 bug 的最小复现。
//
//   ① 星汐自己派出去干活的会话，被当成了「要整理的会话」
//      —— 过滤写死 `/.dsh/xingxi/`，数据装在 F:\dsh-home 的人一个都滤不掉
//   ② 账本超前（账本写着 11-23，内容只到 11-17）→ 永久「0 天」，谁都切不出料
//   ③ 报错原因拼出来的（暂停 → 一律说「连续 N 次没进展」，N=0 也这么说）
//   ④ 日志不可诊断（只打「还有几天」，不打「读到几条 / 账本哪天」）
//
// 跑法：node tests/可见性与账本.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const 根 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const 临时家 = fs.mkdtempSync(path.join(os.tmpdir(), 'xingxi-home-'))
process.env.DSH_HOME = 临时家

const 模 = await import('file:///' + path.join(根, 'index.js').replace(/\\/g, '/') + '?t=' + Date.now())

const 造 = (p) => {
  fs.mkdirSync(p, { recursive: true })
  return p
}

// ═══════════════════════════════════════════════════
// ① 「这个会话是不是星汐自己的」
// ═══════════════════════════════════════════════════
test('星汐自己的会话：默认安装位置（~/.dsh）要认得出来', () => {
  const f = 模.是星汐自己的会话
  assert.equal(typeof f, 'function', '没有导出 是星汐自己的会话')
  assert.equal(f('C:\\Users\\zheny\\.dsh\\xingxi\\临时\\session-abc', 'C:\\Users\\zheny\\.dsh'), true)
})

test('星汐自己的会话：换到 F:\\dsh-home 也要认得出来（群里那台就是这个）', () => {
  const f = 模.是星汐自己的会话
  assert.equal(f('F:\\dsh-home\\xingxi\\临时\\session-ea7cb1d7', 'F:\\dsh-home'), true)
  // 老写法只认 `/.dsh/xingxi/`，这条会 false —— 正是 bug 本身
})

test('星汐自己的会话：大小写、正反斜杠都不能影响判断', () => {
  const f = 模.是星汐自己的会话
  assert.equal(f('f:/DSH-HOME/Xingxi/临时/session-abc', 'F:\\dsh-home'), true)
  assert.equal(f('F:\\DSH-HOME\\xingxi\\临时\\x', 'f:/dsh-home'), true)
})

test('星汐自己的会话：真会话一个字都不能误伤', () => {
  const f = 模.是星汐自己的会话
  for (const cw of [
    'F:\\SurfCore\\core\\state\\agents',
    'F:\\workspace',
    'C:\\Users\\zheny\\Documents\\deepseek-harness\\default-workspace',
    // 名字里带 xingxi、但不是星汐的数据目录 —— 不能藏
    'D:\\xingxi-notes\\项目',
    'F:\\dsh-home-别的项目\\src',
  ]) {
    assert.equal(f(cw, 'F:\\dsh-home'), false, '误伤了：' + cw)
  }
})

test('星汐自己的会话：没有 cwd 时不乱藏', () => {
  const f = 模.是星汐自己的会话
  assert.equal(f('', 'F:\\dsh-home'), false)
  assert.equal(f(null, 'F:\\dsh-home'), false)
  assert.equal(f(undefined, undefined), false)
})

// ═══════════════════════════════════════════════════
// ② 账本超前
// ═══════════════════════════════════════════════════
test('账本超前：账本写在内容前面时要报出来', () => {
  const 夹 = 造(path.join(临时家, '超前'))
  fs.writeFileSync(path.join(夹, '.xingxi.json'), JSON.stringify({ 已整理到: '2026-11-23', 已到: 1794478303571 }), 'utf8')
  const 结果 = 模.检测账本超前(夹, '2026-11-17')
  assert.equal(结果.超前, true, '没报出超前')
  assert.equal(结果.账本, '2026-11-23')
  assert.equal(结果.内容最晚, '2026-11-17')
})

test('账本超前：账本和内容齐平不算超前', () => {
  const 夹 = 造(path.join(临时家, '齐平'))
  fs.writeFileSync(path.join(夹, '.xingxi.json'), JSON.stringify({ 已整理到: '2026-11-17' }), 'utf8')
  assert.equal(模.检测账本超前(夹, '2026-11-17').超前, false)
})

test('账本超前：账本落后于内容时更不算超前的反例（正常推进中）', () => {
  const 夹 = 造(path.join(临时家, '落后'))
  fs.writeFileSync(path.join(夹, '.xingxi.json'), JSON.stringify({ 已整理到: '2026-11-10' }), 'utf8')
  assert.equal(模.检测账本超前(夹, '2026-11-17').超前, false)
})

test('账本超前：没有账本、没有源都不许崩', () => {
  const 夹 = 造(path.join(临时家, '空夹'))
  assert.equal(模.检测账本超前(夹, '2026-11-17').超前, false)
  assert.equal(模.检测账本超前(夹, '').超前, false)
  assert.equal(模.检测账本超前('', '2026-11-17').超前, false)
})

test('账本超前：只检测，不许自己改文件', () => {
  const 夹 = 造(path.join(临时家, '不许动'))
  const 账路 = path.join(夹, '.xingxi.json')
  const 原 = JSON.stringify({ 已整理到: '2026-11-23', 已到: 123 })
  fs.writeFileSync(账路, 原, 'utf8')
  const 前 = fs.statSync(账路).mtimeMs
  assert.equal(模.检测账本超前(夹, '2026-11-17').超前, true)
  assert.equal(fs.readFileSync(账路, 'utf8'), 原, '检测过程中改了文件')
  assert.equal(fs.statSync(账路).mtimeMs, 前, '检测过程中碰了文件')
})

test('账本退回：退到指定日期，并且先留一份备份', () => {
  const 夹 = 造(path.join(临时家, '退回'))
  const 账路 = path.join(夹, '.xingxi.json')
  fs.writeFileSync(账路, JSON.stringify({ 已整理到: '2026-11-23', 已到: 1794478303571 }), 'utf8')
  const 结果 = 模.退回账本(夹, '2026-11-17')
  assert.equal(结果.ok, true, 结果.原因 || '')
  const 读回 = JSON.parse(fs.readFileSync(账路, 'utf8'))
  assert.equal(读回.已整理到, '2026-11-17')
  assert.equal(读回.已到, 0, '退回去时毫秒水位必须一起归零，不然那天前半段还是进不来')
  const 备份们 = fs.readdirSync(夹).filter((f) => f.includes('.bak-'))
  assert.equal(备份们.length, 1, '没留备份')
  assert.equal(JSON.parse(fs.readFileSync(path.join(夹, 备份们[0]), 'utf8')).已整理到, '2026-11-23', '备份里应该是退回前的值')
})

test('账本退回：日子格式不对要拒绝，不许乱写', () => {
  const 夹 = 造(path.join(临时家, '退回坏参数'))
  const 账路 = path.join(夹, '.xingxi.json')
  fs.writeFileSync(账路, JSON.stringify({ 已整理到: '2026-11-23' }), 'utf8')
  for (const 坏 of ['', '2026-11', 'tomorrow', null, '20261117']) {
    const r = 模.退回账本(夹, 坏)
    assert.equal(r.ok, false, '坏参数居然过了：' + String(坏))
  }
  assert.equal(JSON.parse(fs.readFileSync(账路, 'utf8')).已整理到, '2026-11-23', '被坏参数改过文件')
})

// ═══════════════════════════════════════════════════
// ③ 停下时到底该说什么
// ═══════════════════════════════════════════════════
test('停下原因：连续三次没进展就说连续三次', () => {
  const s = 模.停下说什么({ 暂停: true, 连续失败: 3, 暂停原因: '连续三次没进展' })
  assert.match(s, /三次|3 次/)
})

test('停下原因：手动停的别赖到「没进展」头上', () => {
  const s = 模.停下说什么({ 暂停: true, 手动停: true, 暂停原因: '手动停止', 连续失败: 0 })
  assert.doesNotMatch(s, /0 次没进展/, '「连续 0 次没进展」就是群里那句假话')
  assert.match(s, /手动|你停的|停过/)
})

test('停下原因：完成的任务说完成，不说停下', () => {
  const s = 模.停下说什么({ 完成: true, 已到: '2026-11-17', 连续失败: 0 })
  assert.match(s, /完成|整理完/)
  assert.doesNotMatch(s, /没进展/)
})

test('停下原因：什么都没记的时候说清楚「原因没记」，不许编', () => {
  const s = 模.停下说什么({ 暂停: true, 连续失败: 0 })
  assert.doesNotMatch(s, /0 次没进展/)
  assert.match(s, /没记|不知道|原因/)
})

// ═══════════════════════════════════════════════════
// ④ 找源会话的日志：够不够查问题
// ═══════════════════════════════════════════════════
test('找源日志：要带「读到几条 / 账本哪天 / 源最晚哪天」', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf("'找源会话：' + 夹 + ' → '")
  assert.ok(起 > 0, '找不到那条日志了')
  const 段 = 源.slice(起, 起 + 600)
  assert.match(段, /读到/, '日志里没有「读到几条」')
  assert.match(段, /账本/, '日志里没有「账本」')
  assert.match(段, /源最晚/, '日志里没有「源最晚」')
})

test('证据：报告里那几个会话的 id，一个都不许写进产物', () => {
  // 只扫会发出去的那些文件；tests/ 本身是检查器，不算产物
  const 产物 = ['index.js', 'client.js']
  const 库 = path.join(根, 'lib')
  if (fs.existsSync(库)) for (const f of fs.readdirSync(库)) if (f.endsWith('.mjs') || f.endsWith('.js')) 产物.push('lib/' + f)
  // 用拼接写线索，免得这条测试自己变成泄漏源
  const 线索 = ['ea7cb1d7', '7634d406', 'badcc58f', '2052bcb7', '5f09d1c6', '9be281e7']
  for (const 名 of 产物) {
    const 文 = fs.readFileSync(path.join(根, 名), 'utf8')
    for (const c of 线索) assert.equal(文.includes(c), false, 名 + ' 里漏了一个别人的会话 id')
  }
})

// ═══════════════════════════════════════════════════
// ④ 修完之后自审出来的三处（0.4.6 二次复查）
// ═══════════════════════════════════════════════════
test('自审：「完成」的拦截不能挡定时那一趟（否则以后再也不整理）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf('旧任.完成 && !手动')
  assert.ok(起 > 0, '找不到那条拦截')
  const 行 = 源.slice(起, 起 + 120)
  assert.match(行, /只今天/, '拦「完成」时没放过「只今天」—— 同一个会话今天接着聊的东西永远进不来')
})

test('自审：定时那一轮的绑定表也要过一遍「看得见吗」', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf('const 查定时一轮 = async () => {')
  assert.ok(起 > 0, '找不到查定时一轮')
  const 段 = 源.slice(起, 起 + 1600)
  assert.match(段, /可见/, '查定时里没有「可见」这层，绑定表里的工人会话照样会被派')
  assert.match(段, /!可见\.has/, '没有把看不见的绑会话挡掉')
  // 顺序：先算可见，再拿它筛绑定表
  const 算 = 段.indexOf('可见 = new Set')
  const 筛 = 段.indexOf('!可见.has')
  assert.ok(算 > 0 && 筛 > 算, '先筛后算，等于没筛')
})

test('自审：找源会话的日志里要报「账本超前」', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf("'找源会话：' + 夹 + ' → '")
  assert.ok(起 > 0, '找不到那条日志')
  const 段 = 源.slice(起, 起 + 1400)
  assert.match(段, /账本超前/, '日志里不报账本超前，下一个人还得查 12 天')
  assert.match(段, /检测账本超前\(/, '没有真的去调用检测')
  assert.match(段, /建议退到|重拾/, '没有告诉他怎么救')
})

test('自审：没有账本的文件夹也要能重拾（新档案、从别处拷来的）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf("径 === '/dsh-xingxi/重拾'")
  assert.ok(起 > 0, '找不到重拾路由')
  const 段 = 源.slice(起, 起 + 1600)
  assert.match(段, /还没有账本/, '没账本时没放过，重拾会直接失败')
})

test('退回账本：真跑一遍（退到哪天、水位归零、备份里是旧值）', () => {
  const 夹 = 造(path.join(临时家, '退回实跑'))
  const 账路 = path.join(夹, '.xingxi.json')
  fs.writeFileSync(账路, JSON.stringify({ 已整理到: '2026-11-23', 已到: 999 }), 'utf8')
  const 结 = 模.退回账本(夹, '2026-11-16')
  assert.equal(结.ok, true)
  const 新 = JSON.parse(fs.readFileSync(账路, 'utf8'))
  assert.equal(新.已整理到, '2026-11-16')
  assert.equal(新.已到, 0, '水位没归零，那天前半段还是进不来')
  const bak = fs.readdirSync(夹).filter((f) => f.includes('.bak-'))[0]
  const 旧 = JSON.parse(fs.readFileSync(path.join(夹, bak), 'utf8'))
  assert.equal(旧.已整理到, '2026-11-23', '备份里应该是退回前的值')
  assert.equal(旧.已到, 999)
})
