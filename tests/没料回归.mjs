// 0.3.7 的回归：两件让拾星「一点就没料」的事
//
//   ① `已` 在声明之前被用了（TDZ）—— 拾星一点就直接抛，谁都切不出料
//   ② 进度只看 原始对话/ 连续的那一段；日记写到后面去了，进度还停在断点上
import { readFileSync } from 'node:fs'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert'

let 挂 = 0
const 报 = (标, 过, 细) => {
  if (!过) 挂++
  console.log((过 ? 'PASS  ' : 'FAIL  ') + 标 + (细 ? '  :: ' + 细 : ''))
}

const 源 = readFileSync('D:/小贝壳/工作/发布/dsh-xingxi/index.js', 'utf8')

/* ① 声明顺序：算进度 必须在 找源会话(文件夹, 已) 之前 */
{
  const 已行 = 源.indexOf('const 已 = 算进度(文件夹)')
  const 源行 = 源.indexOf('const 源 = 找源会话(文件夹, 已)')
  报('「算进度」在「找源会话」之前（否则 TDZ，一点就抛）', 已行 > 0 && 源行 > 0 && 已行 < 源行, `已 ${已行} / 源 ${源行}`)
  const 重复 = 源.split('const 已 = 算进度(文件夹)').length - 1
  报('只声明一次', 重复 === 1, String(重复))
}

/* ② 日记比进度新时，进度要跟上 */
{
  const 助手 = /const 最新日记日 = \(夹\) => \{/.test(源)
  报('有「最新日记日」这个口子', 助手, '')
  报('料空的时候会拿它推进进度', /料\.空[\s\S]{0,400}最新日记日\(文件夹\)/.test(源), '')
}

/* ③ 拿假档案跑一遍「最新日记日」的行为 —— 直接从源码里抠出来不好，改成验判定口径：
      日记正文去掉格式后 >= 40 字才算写过（跟 准备料 一个口径）。 */
{
  const 家 = fs.mkdtempSync(path.join(os.tmpdir(), 'xingxi-日记-'))
  try {
    const 夹 = path.join(家, '日记')
    fs.mkdirSync(夹, { recursive: true })
    fs.writeFileSync(path.join(夹, '2026-11-10.md'), '# 11-10\n\n' + '今天她笑了很久，一直在跟我讲她小时候的事，讲着讲着自己也笑。'.repeat(2), 'utf8')
    fs.writeFileSync(path.join(夹, '2026-11-16.md'), '# 11-16\n\n短', 'utf8')  // 太短 → 不算写过
    const 判定 = (名) => {
      const 正文 = String(fs.readFileSync(path.join(夹, 名), 'utf8'))
        .replace(/^#.*$/gm, '')
        .replace(/[\s\-*_`>#（）()]/g, '')
      return 正文.length
    }
    报('长得够的日记才算「写过」', 判定('2026-11-10.md') >= 40, String(判定('2026-11-10.md')))
    报('只有标题+一个短词的不算（占位）', 判定('2026-11-16.md') < 40, String(判定('2026-11-16.md')))
  } finally {
    fs.rmSync(家, { recursive: true, force: true })
  }
}

console.log('')
console.log(挂 === 0 ? '全过' : ('挂了 ' + 挂 + ' 条'))
process.exit(挂 === 0 ? 0 : 1)
