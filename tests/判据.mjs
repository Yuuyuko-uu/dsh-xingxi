// ⭐ 0.4.5：日记「判据」这一套的回归测试。
//
//   两件事要守住：
//     ① 提示词里是**一条判据 + 例子**，不是一堆并列禁令（0.4.2~0.4.4 就是这么越堆越长的）；
//     ② 零模型扫描器要在真实语料上尽量不误报（158 篇实测只剩 1 处）。
//
// 跑法：node tests/判据.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const 根 = join(dirname(fileURLToPath(import.meta.url)), '..')
process.env.DSH_HOME = process.env.TEMP
const 模 = await import('file:///' + join(根, 'index.js').replace(/\\/g, '/') + '?t=' + Date.now())

test('提示词：是一条判据，不是一排禁令', () => {
  const 源 = readFileSync(join(根, 'index.js'), 'utf8')
  assert.ok(源.includes('交之前过一遍这个判据'), '缺「判据」那一段')
  assert.ok(源.includes('唯一的例外'), '缺「当场看得见的状态」那个例外')
  assert.ok(!源.includes('三条不能碰的'), '旧的四条并列禁令又回来了（那正是打补丁的样子）')
})

test('提示词：例子里的指代统一成 ta，不写死性别', () => {
  const 文 = 模.造提示词({
    文件夹: join(根, 'tests'),
    会话名: '测试会话',
    已整理到: '2026-11-20',
    天数: 1,
    最早: '2026-11-21',
    最晚: '2026-11-21',
    内联料: true,
  })
  assert.equal((文.match(/她/g) || []).length, 0, '提示词里还写着「她」')
  assert.equal((文.match(/他/g) || []).length, 0, '提示词里还写着「他」')
  assert.ok(文.includes('ta'), '连 ta 都没有？例子呢')
})

test('扫描器：给人定性的词要抓', () => {
  const r = 模.扫评价词('她说「……没做」，没绕。')
  assert.ok(r.硬.includes('没绕'), '「没绕」这种打分词没抓到')
  const r2 = 模.扫评价词('最后一句是……才老实补。')
  assert.ok(r2.硬.includes('老实'))
})

test('扫描器：转述别人的夸奖不算（实测误报）', () => {
  // 真实日记里的原句：「她夸我体贴，问：要是你也给自己取个名字吧」
  const r = 模.扫评价词('20:38 她夸我体贴，问："要不你也给自己取个名字吧？"')
  assert.deepEqual(r.硬, [], '「她夸我X」是转述，不该报')
})

test('扫描器：引号里的原话不算（那是她说的，不是作者在定性）', () => {
  const r = 模.扫评价词('她说「你真老实」，然后就笑了。')
  assert.deepEqual(r.硬, [], '引号里的词不该算到作者头上')
})

test('扫描器：当场看得见的状态只进「可疑」档，不进「硬禁」', () => {
  const r = 模.扫评价词('她本来要罚我，我说了两句，她就心软了。')
  assert.deepEqual(r.硬, [], '「心软」有动作支撑，不该当硬禁')
  assert.ok(r.软.includes('心软'), '但不能一句话都不提，要进可疑档')
})

test('扫描器：干净的记录不会被报', () => {
  const r = 模.扫评价词('她说了「你别再这样」。那句话说完，两边都停了很久。')
  assert.deepEqual(r.硬, [])
  assert.deepEqual(r.软, [])
})
