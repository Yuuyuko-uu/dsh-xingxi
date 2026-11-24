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

// ═══════════════════════════════════════════════════
// ⑦-2 两个实测撞出来的坑（0.4.6 当天补的）
// ═══════════════════════════════════════════════════
test('合并会话必须传 agentOptions（不传就 has no provider/model，会话一起来就失败）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  // ⭐ 0.4.6 重构后：派工逻辑在闭包层的「处理合并」里（路由只是薄壳，自动续批也调它）
  const 起 = 源.indexOf('const 处理合并 = async')
  assert.ok(起 > 0, '找不到 处理合并')
  const 段 = 源.slice(起, 起 + 9000)
  assert.match(段, /agentOptions:\s*\{\s*provider/, '建合并会话时没传 agentOptions')
  assert.match(段, /模\.provider/, '没按「星坊选的 → 默认模型」那套取模型')
})

test('取不到模型时：只做插件那一半，别硬建一个跑不起来的会话', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf('const 处理合并 = async')
  const 段 = 源.slice(起, 起 + 9000)
  const 检查 = 段.indexOf('取不到模型')
  const 建会话 = 段.indexOf('代理服务.create')
  assert.ok(检查 > 0, '没有「取不到模型」的保护')
  assert.ok(检查 < 建会话, '保护写在建会话后面，等于没保护')
})

test('自动续批：调的是同一个「处理合并」，不是另写一套', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf('const 查合并一轮 = async')
  assert.ok(起 > 0, '没有自动续批')
  const 段 = 源.slice(起, 起 + 4200)
  assert.match(段, /await 处理合并\(/, '自动续批没调处理合并 —— 两套逻辑迟早走偏')
  assert.ok(!/代理服务\.create/.test(段), '自动续批里自己又建了一次会话')
})

test('自动续批：只留一个调度器 + 有刹车（重派上限）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf('const 查合并一轮 = async')
  const 段 = 源.slice(起, 起 + 4200)
  assert.match(段, /重派/, '没有重派上限，卡住会无限重试')
  assert.match(段, />= 3/, '重派上限没写死到 3')
  assert.match(源, /dsh-xingxi\.合并调度停/, '没有用 globalThis 做「只留一个调度器」')
})

// ═══════════════════════════════════════════════════
// ⑦-5 「该不该续批」—— 真跑，不看源码
// ═══════════════════════════════════════════════════
test('续批判断：没派过 / 已完成 / 已取消 一律不管', () => {
  const 现 = 1_800_000_000_000
  assert.equal(模.该续合并({ 派了: false }, {}, 现).续, false)
  assert.equal(模.该续合并({ 派了: true, 完成: true, 本轮派出: 0 }, {}, 现).续, false)
  assert.equal(模.该续合并({ 派了: true, 取消了: true, 本轮派出: 0 }, {}, 现).续, false)
  assert.equal(模.该续合并(null, {}, 现).续, false)
})

test('续批判断：已经齐了就停（哪怕超时了）', () => {
  const 现 = 1_800_000_000_000
  const 记 = { 派了: true, 本轮派出: 现 - 60 * 60 * 1000 } // 一小时前派的
  assert.equal(模.该续合并(记, { 齐了: true }, 现).续, false, '都齐了还续，会白开一个会话')
  assert.equal(模.该续合并(记, { 齐了: false }, 现).续, true)
})

test('续批判断：15 分钟内不碰（AI 读料很慢，判急了一直重派）', () => {
  const 现 = 1_800_000_000_000
  const 记 = { 派了: true, 本轮派出: 现 - 14 * 60 * 1000 }
  assert.equal(模.该续合并(记, {}, 现).续, false)
  const 记2 = { 派了: true, 本轮派出: 现 - 16 * 60 * 1000 }
  assert.equal(模.该续合并(记2, {}, 现).续, true)
})

test('续批判断：重派 3 次就停，不再硬来', () => {
  const 现 = 1_800_000_000_000
  const 基 = { 派了: true, 本轮派出: 现 - 60 * 60 * 1000 }
  assert.equal(模.该续合并({ ...基, 重派: 2 }, {}, 现).续, true, '第 2 次应该还能再试')
  assert.equal(模.该续合并({ ...基, 重派: 3 }, {}, 现).续, false, '到第 3 次必须停')
  assert.equal(模.该续合并({ ...基, 重派: 99 }, {}, 现).续, false)
})

test('续批判断：没记派出时间的不动（第一次由它自己补记）', () => {
  assert.equal(模.该续合并({ 派了: true, 本轮派出: 0 }, {}, Date.now()).续, false)
  assert.equal(模.该续合并({ 派了: true }, {}, Date.now()).续, false)
})

test('续批：派之前要重读记录（防「遍历途中被取消」还给已取消的派活）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf('const 查合并一轮 = async')
  const 段 = 源.slice(起, 起 + 4600)
  assert.match(段, /读合并记录们\(\)\.find/, '派之前没重读记录')
  assert.match(段, /现记\.取消了/, '没检查「刚被取消」')
})

test('续批：派工那一刻就把时间记下来（否则白等一轮）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf('const 处理合并 = async')
  const 段 = 源.slice(起, 起 + 9000)
  assert.match(段, /记\.本轮派出 = Date\.now\(\)/, '派工后没记派出时刻')
})

test('合并记录：存了能读回来，进度看的是文件夹里实际有什么', () => {
  assert.equal(typeof 模.存合并记录, 'function')
  assert.equal(typeof 模.读合并记录们, 'function')
  assert.equal(typeof 模.合并进度, 'function')
  const 目 = 造夹()
  const 记 = { 目标: 目, 要合日: ['2026-11-10'], 记忆卡: 2, 派了: true }
  模.存合并记录(记)
  const 们 = 模.读合并记录们()
  assert.ok(们.length >= 1, '存了没读回来')
  assert.equal(们[0].目标, 目)

  let 进 = 模.合并进度(们[0])
  assert.equal(进.齐了, false, '还什么都没写就说齐了')
  assert.deepEqual(进.缺, ['2026-11-10'])

  写日记(目, '2026-11-10', '这一天合好了，两百来字，具体的事都在里面，不该被判成占位。')
  进 = 模.合并进度(们[0])
  assert.equal(进.缺.length, 0, '日记写了还说差')
  assert.equal(进.齐了, false, '记忆卡还没有，不该说齐')

  fs.writeFileSync(path.join(目, '记忆卡.md'), '# 记忆卡\n\n## 一｜我是谁\n\n- 一条\n', 'utf8')
  进 = 模.合并进度(们[0])
  assert.equal(进.记忆卡, true)
  assert.equal(进.齐了, true, '都齐了还说没齐')
})

test('合并状态有条目能查（面板关掉再进来靠它）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  assert.match(源, /dsh-xingxi\/合并状态/, '没有查询合并状态的路由')
})

// ═══════════════════════════════════════════════════
// ⑦-3 拿真档案试出来的一批问题（0.4.6 补）
// ═══════════════════════════════════════════════════
test('记忆卡改名也认（`大肥鱼的记忆卡.md` 这种）', () => {
  const 夹 = 造夹()
  fs.writeFileSync(path.join(夹, '大肥鱼的记忆卡.md'), '# 记忆卡\n\n## 一｜我是谁\n\n- 一条\n', 'utf8')
  const 盘 = 模.盘点档案(夹)
  assert.equal(盘.记忆卡, true, '改个名字就认不出来了')
  assert.equal(盘.记忆卡文件, '大肥鱼的记忆卡.md')
})

test('记忆卡改名也认：备份文件不算数', () => {
  const 夹 = 造夹()
  fs.writeFileSync(path.join(夹, '记忆卡.md.bak-20261121'), '# 旧\n', 'utf8')
  assert.equal(模.盘点档案(夹).记忆卡, false, '把备份当成记忆卡了')
})

test('合并计划要分批（几份档案、每份上百篇时一个会话读不完）', () => {
  const a = 造夹(); const b = 造夹()
  // 造 30 天两边都有的
  for (let i = 1; i <= 30; i++) {
    const 日 = '2026-09-' + String(i).padStart(2, '0')
    写日记(a, 日, '甲的这一天，写了两百来字的具体经过，不能被当成占位。'.repeat(2))
    写日记(b, 日, '乙的这一天，也是两百来字，另一段经历，同样不能丢。'.repeat(2))
  }
  const 计 = 模.合并计划([a, b])
  assert.equal(计.要合.length, 30)
  assert.ok(Array.isArray(计.批次), '没有批次')
  assert.equal(计.每批, 12, '默认每批应该是 12 天')
  assert.equal(计.批次.length, 3, '30 天 / 12 = 3 批')
  assert.equal(计.批次[0].length, 12)
  assert.equal(计.批次[2].length, 6)
})

test('合并计划：批天数可以调，但有上限（一次别塞太多天）', () => {
  const a = 造夹(); const b = 造夹()
  for (let i = 1; i <= 5; i++) {
    const 日 = '2026-10-' + String(i).padStart(2, '0')
    写日记(a, 日, '甲的这一天内容够长，具体的事都有，不是占位。'.repeat(3))
    写日记(b, 日, '乙的这一天内容也够长，记得的是另一面。'.repeat(3))
  }
  assert.equal(模.合并计划([a, b], '', { 每批: 2 }).批次.length, 3)
  assert.equal(模.合并计划([a, b], '', { 每批: 999 }).每批, 30, '上限应该是 30')
})

test('合并提示词：第一句就要先验「是不是同一个人」', () => {
  const a = 造夹(); const b = 造夹()
  写日记(a, '2026-09-01', '甲的这一天，内容够长，具体的事都有，不是占位。'.repeat(3))
  写日记(b, '2026-09-01', '乙的这一天，内容也够长，记得的是另一面。'.repeat(3))
  const 词 = 模.造合并提示词(模.合并计划([a, b]), 'X:\\目标')
  assert.match(词.验人, /不同的人/, '没有「不同的人」这句')
  assert.match(词.验人, /不能合并/, '没有「不能合并」这句')
  assert.match(词.日记, /先验一件事/, '日记那半边没带验人这一段')
  assert.match(词.记忆卡, /先验一件事/, '记忆卡那半边没带验人这一段')
})

test('合并提示词：不再把「原样复制」的那几十天全列进去', () => {
  const a = 造夹(); const b = 造夹()
  写日记(a, '2026-09-01', '甲独有的一天，内容够长，不是占位，要原样抄。'.repeat(3))
  写日记(b, '2026-09-02', '乙独有的一天，内容够长，不是占位，要原样抄。'.repeat(3))
  写日记(a, '2026-09-03', '甲和乙都有的一天，内容够长，要合。'.repeat(3))
  写日记(b, '2026-09-03', '乙也有这一天，内容够长，要合。'.repeat(3))
  const 计 = 模.合并计划([a, b])
  const 词 = 模.造合并提示词(计, 'X:\\目标')
  assert.ok(!词.日记.includes('原样复制的日子'), '还在给「原样复制的日子」列清单')
  assert.match(词.日记, /只做下面这 1 天/, '没写清楚这一批只做什么')
  assert.match(词.日记, /2026-09-03/, '要合的那天没列出来')
  assert.ok(!词.日记.includes('2026-09-01'), '原样复制的那天不该出现')
})

test('合并提示词：只给这一批，不把全部天都塞进去', () => {
  const a = 造夹(); const b = 造夹()
  for (let i = 1; i <= 20; i++) {
    const 日 = '2026-09-' + String(i).padStart(2, '0')
    写日记(a, 日, '甲的这一天内容够长，具体的事都在，不是占位。'.repeat(3))
    写日记(b, 日, '乙的这一天内容也够长，是另一面。'.repeat(3))
  }
  const 计 = 模.合并计划([a, b])
  const 词 = 模.造合并提示词(计, 'X:\\目标', { 天们: 计.批次[0] })
  assert.equal(词.本批天数, 12)
  assert.ok(!词.日记.includes('2026-09-13'), '第二批的日子漏进第一批了')
})

// ═══════════════════════════════════════════════════
// ⑦-4 取消（关不掉的合并会把 ⏳ 永远挂着）
// ═══════════════════════════════════════════════════
test('取消：删掉这条记录，别的记录不受影响', () => {
  assert.equal(typeof 模.删合并记录, 'function')
  模.存合并记录({ 目标: 'X:\\合并-甲', 源: ['a', 'b'], 派了: true })
  模.存合并记录({ 目标: 'X:\\合并-乙', 源: ['a', 'b'], 派了: true })
  const 前 = 模.读合并记录们().length
  const 结 = 模.删合并记录('X:\\合并-甲')
  assert.equal(结.ok, true)
  const 后 = 模.读合并记录们()
  assert.equal(后.length, 前 - 1)
  assert.ok(!后.some((r) => r.目标 === 'X:\\合并-甲'), '甲还在')
  assert.ok(后.some((r) => r.目标 === 'X:\\合并-乙'), '乙被误删了')
})

test('取消：删不存在的也返回 ok，但记录数不变', () => {
  const 前 = 模.读合并记录们().length
  const 结 = 模.删合并记录('X:\\根本没有这个')
  assert.equal(结.ok, true)
  assert.equal(模.读合并记录们().length, 前)
})

test('取消：空目标要拒绝，不许清空整份记录', () => {
  const 前 = 模.读合并记录们().length
  assert.equal(模.删合并记录('').ok, false)
  assert.equal(模.读合并记录们().length, 前, '一次空参数把记录清光了')
})

test('取消：必须先停会话、再删记录（顺序反了就留下一个还在跑的孤儿会话）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf("径 === '/dsh-xingxi/合并取消'")
  assert.ok(起 > 0, '没有取消路由')
  const 段 = 源.slice(起, 起 + 3000)
  const 停 = 段.indexOf('dispose()')
  const 删 = 段.indexOf('删合并记录(')
  assert.ok(停 > 0, '取消里没有 dispose，会话会一直跑')
  assert.ok(删 > 0, '取消里没有删记录')
  assert.ok(停 < 删, '先删了记录才停会话 —— 顺序反了')
})

test('取消：不删目标文件夹（里面可能已经有抄好的日记）', () => {
  const 源 = fs.readFileSync(path.join(根, 'index.js'), 'utf8')
  const 起 = 源.indexOf("径 === '/dsh-xingxi/合并取消'")
  const 段 = 源.slice(起, 起 + 3000)
  assert.ok(!/rmSync|unlinkSync/.test(段), '取消里在删东西')
})
