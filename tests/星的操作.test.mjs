// 星的操作（改 / 删）的自测。纯函数，不碰真档案。
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { 改日记, 找条目, 改条目, 删条目, 改整篇, 是整篇日记 } from '../lib/星的操作.mjs'

const 日记 = [
  '## 2026-11',
  '',
  '- **11-18**：上午陪她把阳台收拾了。',
  '- **11-18**：下午她说想去海边，最后没去。',
  '- **11-19**：她把鱼鱼窝的版本发出去了。',
  '',
  '## 2026-12',
  '',
  '- **12-01**：新的一个月。',
].join('\n')

test('改日记：同一天的好几行合成新内容，别的天一个字不动', () => {
  const 回 = 改日记(日记, '2026-11-18', '上午收拾阳台。\n\n下午想去海边，没去成。')
  assert.equal(回.ok, true)
  assert.equal(回.原来几行, 2)
  assert.equal(回.现在几行, 2)
  assert.ok(回.全文.includes('- **11-18**：上午收拾阳台。'))
  assert.ok(回.全文.includes('- **11-18**：下午想去海边，没去成。'))
  assert.ok(回.全文.includes('- **11-19**：她把鱼鱼窝的版本发出去了。'), '别的天不许动')
  assert.ok(!回.全文.includes('上午陪她把阳台收拾了'), '旧的要被替换掉')
})

test('改日记：只给一行也行（那天的两行会并成一行）', () => {
  const 回 = 改日记(日记, '2026-11-18', '就这一句')
  assert.equal(回.ok, true)
  assert.equal(回.现在几行, 1)
  assert.ok(回.全文.includes('- **11-18**：就这一句'))
  assert.equal((回.全文.match(/- \*\*11-18\*\*/g) || []).length, 1)
})

test('改日记：找不到那一天就报错，绝不乱动', () => {
  const 回 = 改日记(日记, '2026-11-30', '随便')
  assert.equal(回.ok, false)
  assert.match(回.原因, /找不到/)
})

test('改日记：新内容为空不给改', () => {
  const 回 = 改日记(日记, '2026-11-18', '   ')
  assert.equal(回.ok, false)
})

const 卡片 = [
  '# 记忆卡',
  '',
  '## 三｜她是谁',
  '',
  '这一章讲什么：她是谁、身体、喜好。',
  '',
  '- 她姓优，网名小鱿鱼。',
  '- 她喜欢咖啡，不加糖。',
  '',
  '## 五｜我们的约定',
  '',
  '- 周日不算差事。',
  '- 周日不算差事。',
].join('\n')

test('找条目：唯一命中才给动', () => {
  const 一 = 找条目(卡片, '- 她姓优，网名小鱿鱼。')
  assert.equal(一.ok, true)
  assert.equal(一.行数, 1)
})

test('找条目：出现两次就不给动（宁可报错）', () => {
  const 回 = 找条目(卡片, '- 周日不算差事。')
  assert.equal(回.ok, false)
  assert.match(回.原因, /2 处/)
})

test('找条目：找不到就报错', () => {
  const 回 = 找条目(卡片, '- 这句根本不在文件里。')
  assert.equal(回.ok, false)
  assert.match(回.原因, /找不到/)
})

test('改条目：只换那一条，缩进和行首记号保留', () => {
  const 回 = 改条目(卡片, '- 她喜欢咖啡，不加糖。', '她喜欢咖啡，只喝热的，不加糖。')
  assert.equal(回.ok, true)
  assert.ok(回.全文.includes('- 她喜欢咖啡，只喝热的，不加糖。'))
  assert.ok(回.全文.includes('- 她姓优，网名小鱿鱼。'), '别的条目不许动')
  assert.ok(!回.全文.includes('- 她喜欢咖啡，不加糖。'))
})

test('改条目：多段会变成一条里的多行', () => {
  const 回 = 改条目(卡片, '- 她姓优，网名小鱿鱼。', '第一段\n\n第二段')
  assert.equal(回.ok, true)
  assert.equal(回.现在几行, 2)
  assert.ok(回.全文.includes('- 第一段'))
  assert.ok(回.全文.includes('  第二段'))
})

test('删条目：删掉那一条，别的都在', () => {
  const 回 = 删条目(卡片, '- 她喜欢咖啡，不加糖。')
  assert.equal(回.ok, true)
  assert.ok(!回.全文.includes('咖啡'))
  assert.ok(回.全文.includes('- 她姓优，网名小鱿鱼。'))
  assert.ok(回.全文.includes('## 五｜我们的约定'))
})

test('删条目：重复的不给删（防止误删两条）', () => {
  const 回 = 删条目(卡片, '- 周日不算差事。')
  assert.equal(回.ok, false)
})

// ── 一天一个文件的日记（【2026-11-19】开头 + 散文）──
const 单日 = '【2026-11-19】\n\n她夜里四点才睡。\n\n中午吃了疯狂星期四。\n'

test('改单日日记：标题行留着，正文换掉', () => {
  const 回 = 改日记('【2026-11-19】\n\n旧的正文。\n', '2026-11-19', '新的正文。')
  assert.equal(回.ok, true)
  assert.equal(回.全文, '【2026-11-19】\n\n新的正文。\n')
})

test('改单日日记：草稿自己带着标题行也不会重复', () => {
  const 回 = 改日记(单日, '2026-11-19', '【2026-11-19】\n\n她四点才睡。')
  assert.equal(回.ok, true)
  assert.equal((回.全文.match(/【2026-11-19】/g) || []).length, 1)
})

test('改单日日记：日期对不上就拒绝（绝不整篇覆盖别人的一天）', () => {
  const 回 = 改日记(单日, '2026-11-18', '乱写')
  assert.equal(回.ok, false)
  assert.match(回.原因, /找不到/)
})

test('改单日日记：新内容为空不给改', () => {
  const 回 = 改日记(单日, '2026-11-19', '  ')
  assert.equal(回.ok, false)
})

// ── 别人家的文件：CRLF / BOM 不许被顺手改掉 ──
test('CRLF 的文件改完还是 CRLF（不许整篇变成 LF）', () => {
  const 原 = '## 2026-11\r\n\r\n- **11-18**：甲\r\n- **11-19**：乙\r\n'
  const 回 = 改日记(原, '2026-11-19', '丙')
  assert.equal(回.ok, true)
  assert.ok(回.全文.includes('\r\n'), '还要有 CRLF')
  assert.ok(!/[^\r]\n/.test(回.全文), '不许混进光秃秃的 LF')
})

test('LF 的文件也不会被改成 CRLF', () => {
  const 回 = 改条目('- 甲\n- 乙\n', '- 乙', '丙')
  assert.equal(回.ok, true)
  assert.equal(回.全文.includes('\r\n'), false)
})

test('带 BOM 的文件改完还带 BOM', () => {
  const 回 = 改条目('\uFEFF- 甲\n- 乙\n', '- 乙', '丙')
  assert.equal(回.ok, true)
  assert.ok(回.全文.startsWith('\uFEFF'))
})

test('删条目也保住 BOM 和换行', () => {
  const 回 = 删条目('\uFEFF- 甲\r\n- 乙\r\n', '- 甲')
  assert.equal(回.ok, true)
  assert.ok(回.全文.startsWith('\uFEFF'))
  assert.ok(回.全文.includes('\r\n'))
})

// ── 一天一个文件的日记：整篇替换（星图显示的就是那整个 md）──
const 我的那天 = '# 2026-11-19\n\n她早上六点才睡。\n\n下午把鱼鱼窝推了。\n'

test('认得出「整篇日记」：# 日期 或 【日期】 开头的都算', () => {
  assert.equal(是整篇日记(我的那天), true)
  assert.equal(是整篇日记('【2026-11-19】\n\n正文\n'), true)
  assert.equal(是整篇日记('## 2026-11\n\n- **11-19**：甲\n'), false, '老那种多天合一的不是整篇')
})

test('改整篇：把新内容整篇写回去，标题行不动', () => {
  const 新 = 我的那天.replace('下午把鱼鱼窝推了。', '下午把鱼鱼窝推了，还写了 changelog。')
  const 回 = 改整篇(我的那天, 新)
  assert.equal(回.ok, true)
  assert.ok(回.全文.includes('还写了 changelog'))
  assert.ok(回.全文.startsWith('# 2026-11-19'))
})

test('改整篇：CRLF 文件改完还是 CRLF', () => {
  const 回 = 改整篇('# 2026-11-19\r\n\r\n旧的\r\n', '# 2026-11-19\r\n\r\n新的\r\n')
  assert.equal(回.ok, true)
  assert.ok(回.全文.includes('\r\n'))
  assert.ok(!/[^\r]\n/.test(回.全文))
})

test('改整篇：空内容不给改', () => {
  assert.equal(改整篇(我的那天, '   ').ok, false)
})

