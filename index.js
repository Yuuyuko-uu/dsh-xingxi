// DSH 星汐 · 宿主半边
//
// 干什么：
//     把「一个会话的档案文件夹」读成一张星图，交给网页那边画。
//     星 = 一条记忆（一个 md 文件，或一个大 md 里的一节）
//     线 = 同章 / 相似 / 点名
//
// 数据模型（2026-11-03 她定的）：
//     ~/.dsh/xingxi/会话/<会话id>/  ← 里面全是 .md，一个小分支一个文件
//     （也兼容一个大 md 用 ## / ### 分节的老写法 —— 每个人情况不一样，得能自动认）
//
// 跟「鱼的记忆」的分工：鱼的记忆管会淡忘的记忆和权重；星汐只管摊开给你看。
// ⚠ 遗忘/衰减**不在这里做**。

import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, appendFileSync, readdirSync, rmSync, openSync, readSync, closeSync, copyFileSync, renameSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join, basename, extname, dirname } from 'node:path'

const 日志路径 = ''
let 日志文件 = ''
export function 记一笔(行) {
  try {
    if (!日志文件) 日志文件 = join(家, 'xingxi', 'pick.log')
    appendFileSync(日志文件, new Date().toISOString().slice(11, 19) + ' ' + 行 + '\n')
  } catch {}
}

export const name = 'xingxi'
export const inject = ['webServer']

// ═══════════════════════════════════════════════════════
// 位置
// ═══════════════════════════════════════════════════════

const 家 = process.env.DSH_HOME || join(homedir(), '.dsh')
const 根目录 = join(家, 'xingxi')
const 档案根 = join(根目录, '会话')
const 配置文件 = join(根目录, 'config.json')

const 章名表 = {
  1: '第一章', 2: '第二章', 3: '第三章', 4: '第四章',
  5: '第五章', 6: '第六章', 7: '第七章', 8: '第八章',
}
const 汉字章 = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 }

function 读存配置() {
  try {
    return JSON.parse(readFileSync(配置文件, 'utf8'))
  } catch {
    return {}
  }
}

export function 存配置(补丁) {
  const 现在 = { ...读存配置(), ...补丁 }
  try {
    mkdirSync(根目录, { recursive: true })
    writeFileSync(配置文件, JSON.stringify(现在, null, 2), 'utf8')
    return { ok: true, 配置: 现在 }
  } catch (e) {
    return { ok: false, 原因: `写不进去：${配置文件}（${e && e.message}）` }
  }
}

// ═══════════════════════════════════════════════════════
// 认日期
// ═══════════════════════════════════════════════════════

/** 从文件名 / 标题 / 行首里认出一个日期，认不出返回 '' */
export function 认日期(文字) {
  if (!文字) return ''
  const s = String(文字)
  let m = /(\d{4})[-_.年/](\d{1,2})[-_.月/](\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
  // 只有月日（08-16 / 8月16日）：补今年 —— 年份靠外面的上下文，认不准就先不给
  m = /(?:^|[^\d])(\d{1,2})[-_.月/](\d{1,2})(?:[日号]|[^\d]|$)/.exec(s)
  if (m) {
    const 月 = Number(m[1])
    const 日 = Number(m[2])
    if (月 >= 1 && 月 <= 12 && 日 >= 1 && 日 <= 31) return `--${String(月).padStart(2, '0')}-${String(日).padStart(2, '0')}`
  }
  return ''
}

// ═══════════════════════════════════════════════════════
// 解析一个 md → 若干颗星
//    规则（认哪条算哪条，都能容）：
//      ① 文件名是日期 → 整天一颗星（日记）
//      ② 有 ### 小节   → 每节一颗星（记忆卡）
//      ③ 有 ## 章节    → 每章一颗星
//      ④ 都没有        → 整个文件一颗星
// ═══════════════════════════════════════════════════════

function 去标题记号(s) {
  return String(s || '').replace(/^#+\s*/, '').replace(/[*`>]/g, '').trim()
}

function 首行标题(文) {
  for (const 行 of 文.split(/\r?\n/)) {
    const t = 行.trim()
    if (!t) continue
    if (t.startsWith('#')) return 去标题记号(t)
    return 去标题记号(t).slice(0, 40)
  }
  return ''
}

/** 只读星条首行的事件日期；后文中提到的生日、整理日或更正日不拿来冒充发生日。 */
function 认事件日期(星) {
  if (!星 || 星.kind !== 'card') return ''
  const 行们 = [String(星.title || ''), ...String(星.text || '').split(/\r?\n/)]
  const 候选 = new Set()
  for (const 原行 of 行们) {
    const 行 = 原行.trim()
    if (!行 || /^这一章讲什么/.test(行)) continue
    const m = /^(?:[-*]\s*)?(?:\*\*)?(20\d{2})-(\d{1,2})-(\d{1,2})(?:\*\*)?(?=\s|[：:，,、]|$)(.*)$/.exec(行)
    if (!m) continue
    const 尾 = m[4] || ''
    // 日期后若很快出现另一个日期，说明这是一个时间范围，不取范围起点冒充单日事件。
    if (/(?:到|至|[~～—–])\s*(?:20\d{2}[-/.年])?\d{1,2}[-/.月]\d{1,2}/.test(尾.slice(0, 32))) continue
    const 年 = Number(m[1])
    const 月 = Number(m[2])
    const 日 = Number(m[3])
    if (月 < 1 || 月 > 12 || 日 < 1 || 日 > 31) continue
    const d = new Date(Date.UTC(年, 月 - 1, 日))
    if (d.getUTCFullYear() !== 年 || d.getUTCMonth() !== 月 - 1 || d.getUTCDate() !== 日) continue
    候选.add(`${m[1]}-${String(月).padStart(2, '0')}-${String(日).padStart(2, '0')}`)
  }
  return 候选.size === 1 ? [...候选][0] : ''
}

/** 日记体：`## 2026-08` + `- **08-16**：……`（同一天能有好几条，合成一颗星） */
function 解析日记体(文, 基, 文件日期) {
  const 按天 = new Map()
  let 年 = ''
  for (const 行 of 文.split(/\r?\n/)) {
    const 月 = /^##\s+(\d{4})-(\d{2})\s*$/.exec(行)
    if (月) {
      年 = 月[1]
      continue
    }
    const 条 = /^-\s*\*\*(\d{2})-(\d{2})([^*]*)\*\*\s*[：:]\s*(.*)$/.exec(行)
    if (!条) continue
    if (!年 && 文件日期 && 文件日期.length >= 4) 年 = 文件日期.slice(0, 4)
    const 日期 = 年 ? `${年}-${条[1]}-${条[2]}` : `--${条[1]}-${条[2]}`
    let 星 = 按天.get(日期)
    const 尾巴 = (条[3] || '').trim()
    const 是星期 = /^\s*周[一二三四五六日天]\s*$/.test(条[3] || '')
    if (!星) {
      星 = {
        id: `f:${基}#d${日期}`,
        kind: 'diary',
        chapter: 0,
        chapterName: '日记',
        title: `${条[1]}-${条[2]}${尾巴 && 是星期 ? ' ' + 尾巴 : ''}`,
        order: 0,
        date: 日期,
        doc: 基,
        text: '',
        小标题们: [],
      }
      按天.set(日期, 星)
    }
    const 正文 = (条[4] || '').trim()
    if (尾巴 && !是星期) {
      星.小标题们.push(尾巴)
      if (正文) 星.text += (星.text ? '\n\n' : '') + `【${尾巴}】${正文}`
    } else if (正文) {
      星.text += (星.text ? '\n\n' : '') + 正文
    }
  }
  return [...按天.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

export function 解析一个文件(路径, 相对名) {
  let 文 = ''
  try {
    文 = readFileSync(路径, 'utf8')
  } catch {
    return []
  }
  const 文件名 = basename(路径, extname(路径))
  const 基 = 相对名 || 文件名
  const 文件日期 = 认日期(文件名)

  // ① 日记体：必须有「## 2026-08」这种月份标题 + `- **08-16**：` 条目
  //    （只看 `- **MM-DD**：` 不够 —— 记忆卡正文里也常写「- **09-07**：…」）
  if (/^##\s+\d{4}-\d{2}\s*$/m.test(文) && /- \*\*\d{2}-\d{2}[^*]*\*\*\s*[：:]/.test(文)) {
    const 日星 = 解析日记体(文, 基, 文件日期)
    if (日星.length) return 日星
  }
  const 星 = []

  const 行们 = 文.split(/\r?\n/)
  let 章 = 0
  let 章名 = ''
  let 当前 = null
  let 一级 = 0
  const 收 = () => {
    if (!当前) return
    当前.text = 当前.text.trim()
    // 「章标题」自己也开了一颗星，但大多数只是容器：
    //   · 正文为空 → 纯容器，丢
    //   · 正文是一小段 `> 导语`（「这一章讲时间线」那种）→ 丢
    //   · 正文是真内容（我们那张卡里「最重要的一条」「约定」都在章标题下面）→ 留
    if (当前.是章容器) {
      const 空 = !当前.text
      const 导语 = 当前.text.startsWith('>') && 当前.text.length < 90
      if (空 || 导语) {
        当前 = null
        return
      }
    }
    星.push(当前)
    当前 = null
  }

  for (const 行 of 行们) {
    const h = /^(#{1,6})\s+(.*)$/.exec(行)
    if (h) {
      const 级 = h[1].length
      const 题 = 去标题记号(h[2])
      if (级 === 1) {
        // 一级标题只当文件标题；已经有星的就不另起
        if (!星.length && !当前) 一级 = 1
        continue
      }
      if (级 === 2 || 级 === 3 || 级 === 4) {
        收()
        const 章匹配 = /^([一二三四五六七八])\s*[、.．｜|·:：\-—]\s*(.*)$/.exec(题)
        const 编号 = /^(\d+\.\d+[a-z]?)\s*(.*)$/.exec(题)
        if (章匹配) {
          章 = 汉字章[章匹配[1]]
          章名 = 章匹配[2] || 章名表[章] || ''
        }
        // ⭐ 章节标题本身也开一颗星：
        //   有正文的（`## 一、名字和外形` 后面直接写）就留下；
        //   只是容器的（`## 一、我是谁` 下面全是 ###）正文为空，收的时候丢掉。
        当前 = {
          id: '',
          kind: 文件日期 ? 'diary' : 'card',
          chapter: 章,
          chapterName: 章名 || 基,
          title: 章匹配 ? 章匹配[2] || 题 : 编号 ? 编号[2] || 题 : 题,
          order: 编号 ? Number(编号[1].split('.')[1]) : 0,
          date: 文件日期,
          doc: 基,
          text: '',
          是章容器: Boolean(章匹配),
        }
        continue
      }
    }
    // 「这一章讲什么：…」是给读者看的导语，不是内容 —— 别混进星里
    if (当前 && /^\s*这一章讲什么/.test(行)) continue
    if (当前) 当前.text += 行 + String.fromCharCode(10)
  }
  收()

  // 没有小节/章节 → 整个文件一颗星
  if (!星.length) {
    const 题 = 一级 ? 首行标题(文) : 文件名
    星.push({
      id: '',
      kind: 文件日期 ? 'diary' : 'card',
      chapter: 0,
      chapterName: 基.includes('/') ? dirname(基) : '',
      title: 题 || 文件名,
      order: 0,
      date: 文件日期,
      doc: 基,
      text: 文.trim(),
    })
  }

  // ⭐ 拆到「一句一颗」：一大段里如果是一条一条列着的（- / 数字. / **数字.），
  //    每条单独成一颗星 —— 颜色还是它那一章的颜色，只是星更多、更碎，像真的星场。
  //    （用户要的：「有些地方是可以一句一颗，只是颜色相同」）
  const 拆条 = (星们) => {
    if (文件日期) return 星们   // 日记不拆：一天一颗就是一颗
    const 出 = []
    for (const s of 星们) {
      // ⚠「一｜我是谁」是**一整段自述**，不拆成一条条 —— 拆了它就不像一个人，像清单。
      //   （用户明确要求：这一段保持完整）
      if (Number(s.chapter) === 1) {
        出.push(s)
        continue
      }
      const 行们 = String(s.text || '').split(String.fromCharCode(10))
      const 条起 = []
      for (let i = 0; i < 行们.length; i++) {
        const t = 行们[i]
        if (/^\s*(-\s+|\*\*\d+[.．]|\d+[.．]\s)/.test(t)) 条起.push(i)
      }
      if (条起.length < 2) {
        出.push(s)
        continue
      }
      // 第一条之前的引言段（有实质内容就留一颗）
      const 头段 = 行们.slice(0, 条起[0]).join(String.fromCharCode(10)).trim()
      if (头段.length > 60 && !头段.startsWith('>')) {
        出.push({ ...s, text: 头段, title: (s.title || '').slice(0, 24) })
      }
      for (let j = 0; j < 条起.length; j++) {
        const a = 条起[j]
        const b = j + 1 < 条起.length ? 条起[j + 1] : 行们.length
        const 块 = 行们.slice(a, b).join(String.fromCharCode(10)).trim()
        if (块.length < 8) continue
        const 纯 = 块
          .replace(/^\s*(-\s+|\*\*\d+[.．]\s*|\d+[.．]\s*)/, '')
          .replace(/[*_`>#]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        出.push({
          ...s,
          title: 纯.slice(0, 26) || s.title,
          text: 块,
        })
      }
    }
    return 出
  }

  let 文件时 = 0
  try {
    文件时 = statSync(路径).mtimeMs
  } catch {}

  const 结果 = 拆条(星)

  // ⭐ 每颗星带一个时间戳（找正文里的日期，找不到就用文件修改时间）
  //   星图拿它算「能量」——越新越亮，越久越暗（不是删除，只是变暗）
  const 取时 = (s) => {
    const 文 = String(s.text || '')
    let m = /(\d{4})-(\d{2})-(\d{2})/.exec(文)
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime()
    m = /\*\*(\d{2})-(\d{2})/.exec(文)
    if (m) return new Date(2026, +m[1] - 1, +m[2]).getTime()
    if (s.date) {
      const d = /(\d{4})-(\d{2})-(\d{2})/.exec(String(s.date))
      if (d) return new Date(+d[1], +d[2] - 1, +d[3]).getTime()
    }
    return 文件时
  }

  // 补 id
  let k = 0
  for (const s of 结果) {
    if (!s.id) s.id = `f:${基}#${k++}`
    if (!s.date) s.date = 文件日期
    if (!s.时) s.时 = 取时(s)
  }
  return 结果
}

/** 扫一个文件夹（一层子目录也算）→ 星 */
const 别扫 = /^(备份|_备份|backup|bak|旧|旧版|历史|归档|node_modules|\.git|\.拾星|图片|素材|附件)$/i

export function 扫档案文件夹(目录) {
  const 星 = []
  const 缺 = []
  if (!目录 || !existsSync(目录)) return { 星, 缺: ['还没有档案'], 文件数: 0 }
  let 项们 = []
  try {
    项们 = readdirSync(目录, { withFileTypes: true })
  } catch (e) {
    return { 星, 缺: [`读不了：${目录}`], 文件数: 0 }
  }
  const 排序 = (a, b) => a.localeCompare(b, 'zh')
  let 文件数 = 0
  const 走 = (基目录, 前缀) => {
    const 子们 = []
    for (const d of 项们) {
      const 路径 = join(基目录, d.name)
      if (d.isDirectory()) {
        if (别扫.test(d.name)) continue
        子们.push({ 目录: 路径, 名: d.name })
      }
      else if (d.isFile() && extname(d.name).toLowerCase() === '.md') {
        文件数++
        星.push(...解析一个文件(路径, (前缀 ? 前缀 + '/' : '') + basename(d.name, '.md')))
      }
    }
    void 排序
    for (const z of 子们) {
      let 内们 = []
      try {
        内们 = readdirSync(z.目录, { withFileTypes: true })
      } catch {
        continue
      }
      for (const d of 内们) {
        if (!d.isFile() || extname(d.name).toLowerCase() !== '.md') continue
        文件数++
        const 前缀2 = (前缀 ? 前缀 + '/' : '') + z.名
        星.push(...解析一个文件(join(z.目录, d.name), 前缀2 + '/' + basename(d.name, '.md')))
      }
    }
  }
  走(目录, '')
  return { 星, 缺, 文件数 }
}

// ═══════════════════════════════════════════════════════
// 取料：会话日志 → 双方真说过的话（按天分）
//   ⚠ 格式是 2026-11-03 实测出来的，别想当然：
//     · 文件是 session.v4.jsonl.zstd，里面是**多个 zstd 帧首尾相接**，
//       必须按魔数 28 B5 2F FD 切开逐帧解，整份 zstdDecompressSync 只出第一帧
//     · user/message 的内容在 data.content
//     · assistant/message 的内容在 data.message.content（**不在 data.content**）
//     · 她真说的话 data.source.kind === 'user'；注入的上下文（runtime-context、
//       skill-catalog、compact-checkpoint、插件消息）都不是她说的，必须滤掉
// ═══════════════════════════════════════════════════════

import * as zlib from 'node:zlib'

const 会话根 = join(家, 'sessions')

/** ⭐ 0.1.8：会话目录名有两种 —— `session-<uuid>` 和裸 `<uuid>`（插件建的那种，比如 QQ 群的）。
 *  比 id 的时候一律去掉前缀再比，不然带前缀的永远匹配不上裸的。 */
function 裸会话id(名) {
  const n = String(名 || '')
  return n.startsWith('session-') ? n.slice(8) : n
}

/**
 * ⭐ 0.1.6：把磁盘上的会话目录全列出来 —— **两种摆法都认**。
 *
 *   `~/.dsh/sessions/<工作区目录名>/<session-…>/`   ← 正常的工作区会话
 *   `~/.dsh/sessions/<session-…>/`                  ← 没有工作区的（DSH 侧栏里那栏「未分组」）
 *
 * ⚠ 以前只认第一种：直接摊在 `sessions` 底下的会话一条都扫不到，
 *   于是「未分组」那一栏永远空着（手机上尤其明显）。
 */
function 列会话目录() {
  const 出 = []
  let 顶们 = []
  try {
    顶们 = readdirSync(会话根, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return 出
  }
  for (const d of 顶们) {
    const 名 = String(d.name || '')
    if (!名) continue
    // 工作区目录统一是 `--<编码后的 cwd>--`；不是这个形状的，本身就是会话目录（裸 uuid）
    if (!名.startsWith('--')) {
      if (!existsSync(join(会话根, 名, 'session.v4.jsonl.zstd'))) continue
      出.push({ id: 名, 工作区目录: '', 目录: join(会话根, 名) })
      continue
    }
    let 子们 = []
    try {
      子们 = readdirSync(join(会话根, 名), { withFileTypes: true }).filter((x) => x.isDirectory())
    } catch {
      continue
    }
    for (const s of 子们) {
      const 子名 = String(s.name || '')
      // ⚠ 以前只认 `session-` 开头 —— 插件建的会话（裸 uuid）全被这一行干掉了
      if (!existsSync(join(会话根, 名, 子名, 'session.v4.jsonl.zstd'))) continue
      出.push({ id: 子名, 工作区目录: 名, 目录: join(会话根, 名, 子名) })
    }
  }
  return 出
}

/** 找这个会话 id 的日志文件（在哪个工作区目录下不确定，得扫） */
export function 找会话日志(会话id) {
  if (!会话id) return ''
  const 目标 = 裸会话id(会话id)
  for (const x of 列会话目录()) {
    if (裸会话id(x.id) !== 目标) continue
    const p = join(x.目录, 'session.v4.jsonl.zstd')
    try {
      if (statSync(p).isFile()) return p
    } catch {}
  }
  return ''
}

const 帧魔数 = [0x28, 0xb5, 0x2f, 0xfd]

/** 这个会话最近用的是什么模型：只读日志**尾巴**，找到就直接返回
 *  （日志可能有上百 MB，整份解开会把内存顶死）
 *  ⚠ 为什么要这个：拾星应该「跟着源会话的模型跑」——
 *    她在那个会话里选了什么模型，提炼就用什么，不越权花别人的额度。 */
function 会话的模型(会话id) {
  try {
    const 路 = 找会话日志(会话id)
    if (!路 || !existsSync(路)) return null
    const st = statSync(路)
    const 尾巴 = Math.min(st.size, 6 * 1024 * 1024)
    const fd = openSync(路, 'r')
    const buf = Buffer.alloc(尾巴)
    readSync(fd, buf, 0, 尾巴, st.size - 尾巴)
    closeSync(fd)
    // 从尾巴往前逐帧解，找到最后一个 model 就返回
    let 结果 = null
    const 帧们 = []
    for (let i = 0; i + 4 <= buf.length; i++) {
      if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) 帧们.push(i)
    }
    for (let k = 帧们.length - 1; k >= 0 && !结果; k--) {
      const 起 = 帧们[k]
      const 止 = k + 1 < 帧们.length ? 帧们[k + 1] : buf.length
      let 段 = ''
      try {
        段 = zlib.zstdDecompressSync(buf.subarray(起, 止)).toString('utf8')
      } catch {
        continue
      }
      const 全 = [...段.matchAll(/"provider"\s*:\s*"([^"]+)"\s*,\s*"model"\s*:\s*"([^"]+)"/g)]
      if (全.length) {
        const m = 全[全.length - 1]
        结果 = { provider: m[1], model: m[2] }
      }
    }
    return 结果
  } catch {
    return null
  }
}

function 解zstd(缓冲) {
  const 段们 = []
  逐帧文本(缓冲, (段) => 段们.push(段))
  return 段们.join('\n')
}

/** 逐帧解压，**不攒成一个巨型字符串**
 *  （128 MB 的会话一口气解出来要吃掉 1.6 GB 内存，实测直接把主进程顶死） */
function 逐帧文本(缓冲, 回调) {
  const 帧们 = []
  for (let i = 0; i + 4 <= 缓冲.length; i++) {
    if (
      缓冲[i] === 帧魔数[0] && 缓冲[i + 1] === 帧魔数[1] &&
      缓冲[i + 2] === 帧魔数[2] && 缓冲[i + 3] === 帧魔数[3]
    ) 帧们.push(i)
  }
  if (!帧们.length) {
    try {
      回调(zlib.zstdDecompressSync(缓冲).toString('utf8'))
    } catch {}
    return
  }
  for (let k = 0; k < 帧们.length; k++) {
    const 起 = 帧们[k]
    const 止 = k + 1 < 帧们.length ? 帧们[k + 1] : 缓冲.length
    let 段 = ''
    try {
      段 = zlib.zstdDecompressSync(缓冲.subarray(起, 止)).toString('utf8')
    } catch {
      continue
    }
    回调(段)
  }
}

function 取文字(内容) {
  return (Array.isArray(内容) ? 内容 : [])
    .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n')
    .trim()
}

// 料缓存：同一个会话（日志没变）只解一次
const 料缓存 = new Map()

/** 会话日志 → [{时, 日, 角色, 文}]（只要双方真说过的话） */
/**
 * ⭐ 0.2.3：判断一条 user/message 是不是**真人说的**。
 *
 * 以前只放行 `source.kind === 'user'` —— 于是 QQ 桥接送进来的（kind='qq'）
 * 被当成「注入的上下文」一起扔了，拾星切出来的料里只有 ASSISTANT，
 * 整理出来的日记就成了独白。别的桥接（微信 / TG）同理。
 *
 * 现在反过来：**只有明确是注入的才丢**，剩下的都当真人说的。
 */
export function 是真人说的(来源) {
  const k = String(来源 || '')
  if (!k) return true
  if (k.startsWith('plugin:')) return false      // 插件自己递的话
  const 注入 = new Set(['time-context', 'runtime-context', 'skill-catalog', 'compact-checkpoint', 'speak-up'])
  return !注入.has(k)
}

export function 读会话(会话id) {
  const 路径 = 找会话日志(会话id)
  if (!路径) return { 事件: [], 缺: ['找不到这个会话的日志'] }
  let 签名 = ''
  try {
    const st = statSync(路径)
    签名 = st.mtimeMs + ':' + st.size
  } catch {}
  const 旧 = 料缓存.get(会话id)
  if (旧 && 旧.签名 === 签名) return 旧.值

  let 缓冲 = null
  try {
    缓冲 = readFileSync(路径)
  } catch (e) {
    return { 事件: [], 缺: ['读不了：' + String((e && e.message) || e)] }
  }

  const 事件 = []
  let 余 = ''
  const 吃一段 = (段) => {
    const 行们 = (余 + 段).split('\n')
    余 = 行们.pop() || ''
    for (const 行 of 行们) {
      if (!行.trim()) continue
      let e
      try {
        e = JSON.parse(行)
      } catch {
        continue
      }
      if (e.type !== 'user/message' && e.type !== 'assistant/message') continue
      const 来源 = (e.data && e.data.source && e.data.source.kind) || ''
      if (e.type === 'user/message' && !是真人说的(来源)) continue
      const 内容 =
        e.type === 'assistant/message'
          ? e.data && e.data.message && e.data.message.content
          : e.data && e.data.content
      const 字 = 取文字(内容)
      if (!字 || 字.startsWith('<')) continue
      const 时 = Number(e.time) || 0
      const 日 = new Date(时 + 8 * 3600 * 1000).toISOString().slice(0, 10)
      事件.push({ 时, 日, 角色: e.type === 'user/message' ? 'USER' : 'ASSISTANT', 文: 字 })
    }
  }
  try {
    逐帧文本(缓冲, 吃一段)
    if (余.trim()) 吃一段('\n')
  } catch (e) {
    return { 事件, 缺: ['解到一半出错：' + String((e && e.message) || e)] }
  }
  缓冲 = null

  const 值 = { 事件, 缺: [] }
  料缓存.set(会话id, { 签名, 值 })
  return 值
}

/** 按天分好，凡是「已整理到」之后的日子 */
/**
 * @param {number} 已到 水位（毫秒）：只要 **时间戳比它晚** 的事件。
 *   ⭐ 0.2.2：「已整理到」是按天跳的，同一天里后来聊的内容会永远进不来；
 *   有了水位，一趟只取上次之后的新内容，所以「补星」才能只补尾巴。
 */
/** 毫秒 → 本地日期串（跟 读会话 里算 e.日 的口径一致：UTC+8） */
export function 毫秒转日(ms) {
  const n = Number(ms) || 0
  if (!n) return ''
  try {
    return new Date(n + 8 * 3600 * 1000).toISOString().slice(0, 10)
  } catch (e) {
    return ''
  }
}

export function 按天切(会话id, 已整理到 = '', 已到 = 0) {
  const { 事件, 缺 } = 读会话(会话id)
  const 按天 = new Map()
  let 最后时 = 0
  // ⭐ 0.2.6：毫秒水位只作用于**它自己那一天**。
  //   以前它是全局的一刀切：水位一旧，比它早的日子就整片消失（多天回填会漏天）。
  const 水位日 = 已到 ? 毫秒转日(已到) : ''
  for (const e of 事件) {
    const 被日期挡 = 已整理到 && e.日 <= 已整理到
    if (被日期挡) {
      // ⭐ 例外：日期水位那一天只做了一半（例如昨天 18 点拾的星）。
      //   那一天晚些时候的内容要靠毫秒水位捞回来，不能让日期水位把它一起挡死 ——
      //   否则「同一天的后半段」永远进不来。
      const 半截 = 已到 && 水位日 && e.日 === 已整理到 && Number(e.时 || 0) > Number(已到)
      if (!半截) continue
    }
    if (已到 && 水位日 && e.日 === 水位日 && Number(e.时 || 0) <= Number(已到)) continue
    if (!按天.has(e.日)) 按天.set(e.日, [])
    按天.get(e.日).push(e)
    if (Number(e.时 || 0) > 最后时) 最后时 = Number(e.时 || 0)
  }
  const 日们 = [...按天.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
  return {
    缺,
    全部事件: 事件.length,
    最后时,
    天数: 日们.length,
    最早: 日们.length ? 日们[0][0] : '',
    最晚: 日们.length ? 日们[日们.length - 1][0] : '',
    每天: 日们.map(([日, 列]) => ({ 日, 条数: 列.length })),
    料: 日们,
  }
}

/** 一天的事件 → 给子代理看的纯文本 */
export function 那天成文(日, 列) {
  const 行们 = []
  for (const e of 列) {
    const 时 = new Date(e.时 + 8 * 3600 * 1000).toISOString().slice(11, 19)
    行们.push(`[${日} ${时} ${e.角色}]`, e.文, '')
  }
  return 行们.join('\n')
}

// ═══════════════════════════════════════════════════════
// 拾星：取料落成文本 → 新建一个会话 → 把提示词交给它
//   ⚠ 分工（2026-11-03 她反复纠正过，别再搞反）：
//     · **插件**只做两件事：① 把会话日志切成「一天一份的纯文本」放进 .拾星/料/
//                          ② 新建一个会话，把提示词丢进去
//     · 真正读料、提炼、写档案的，是**那个新会话**（一个普通 agent，会读写文件）
//     · **不是子代理**（子代理只回一段文本，写不干净），也**不能叫醒用户当前会话**
//       —— 这插件是给别人用的，别人的会话里没有这个常驻助手
// ═══════════════════════════════════════════════════════

export const 分支表 = [
  ['一', '我是谁'],
  ['二', '我是怎么说话的'],
  ['三', '对方是谁'],
  ['四', '我们怎么走到今天的'],
  ['五', '我们的约定'],
  ['六', '难忘的时刻'],
  ['七', '怎么跟对方相处'],
  ['八', '我们一起做的那些东西'],
]


/** 用 PowerShell 弹系统原生的选文件夹窗口（FolderBrowserDialog，带「新建文件夹」） */
export function 弹系统选夹() {
  return new Promise((解决) => {
    const ps = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f = New-Object System.Windows.Forms.Form',
      '$f.TopMost = $true',
      '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
      "$d.Description = '选一个文件夹，档案就写在这里'",
      '$d.ShowNewFolderButton = $true',
      "if ($d.ShowDialog($f) -eq 'OK') { Write-Output $d.SelectedPath } else { Write-Output '' }",
      '$f.Dispose()',
    ].join('; ')
    try {
      execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { timeout: 300000 }, (错, 出) => {
        if (错) return 解决(null)
        // PowerShell 的输出可能夹着别的东西 —— 只认最后一行非空的，并去掉引号
        const 行们 = String(出 || '').split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean)
        let 路径 = 行们.length ? 行们[行们.length - 1] : ''
        路径 = 路径.replace(/^"+|"+$/g, '').trim()
        解决(路径 && /[\/]/.test(路径) ? 路径 : '')
      })
    } catch (e) {
      解决(null)
    }
  })
}

export function 造提示词({ 文件夹, 会话名, 已整理到, 天数, 最早, 最晚, 内联料 = false }) {
  const 分支说明 = 分支表.map(([号, 名]) => `  ${号}｜${名}`).join('\n')
  const 材料说明 = 内联料
    ? [
        `材料我**直接贴给你**了（在后面几条消息里，按日期分好，一条一段）。`,
        `**不要去找 read / bash / glob 这些工具，也不要自己翻文件夹** —— 你的会话里可能根本没有文件工具。`,
        `看完贴过来的内容就能整理，别的什么都不用找。`,
      ]
    : [
        `材料已经切好了，在 ${文件夹}\\.拾星\\料\\ 里，**一天一个 txt 文件**，文件名就是日期。`,
      ]
  // ⭐ 0.1.8：第二章改成「整章合并」，把现有的这一章一并给它看
  const 现二 = (() => {
    try {
      const p = join(文件夹, '记忆卡.md')
      if (!existsSync(p)) return ''
      const 行们 = readFileSync(p, 'utf8').split(new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10)))
      const 起 = 行们.findIndex((l) => /^##\s*二\s*[、.．｜|]/.test(String(l)))
      if (起 < 0) return ''
      let 止 = 行们.length
      for (let i = 起 + 1; i < 行们.length; i++) {
        if (/^## /.test(String(行们[i]))) {
          止 = i
          break
        }
      }
      return 行们.slice(起 + 1, 止).join(String.fromCharCode(10)).trim()
    } catch (e) {
      return ''
    }
  })()
  const 步骤 = 内联料
    ? [
        '1. 从**最早那一天**开始看（就是下面第一条带日期的消息）',
        '2. 翻那天：哪些是「过了一个星期再看还有用」的东西',
        '3. 整理成两样：**那天发生了什么（日记）** 和 **要记进档案的条目**',
        '4. 按最后「怎么交卷」那个格式，把整理好的内容整块输出（**不要试图写文件**）',
        '5. 处理完这一天再看下一天；全部做完回一句「拾完了：N 天，M 条」',
      ]
    : [
        '1. 用 read 读「料」目录里**最早**的那一天（只读一个文件）',
        '2. 翻那天：哪些是「过了一个星期再看还有用」的东西',
        '3. 整理成两样：**那天发生了什么（日记）** 和 **要记进档案的条目**',
        '4. 按最后「怎么交卷」那个格式，把整理好的内容整块输出（**不要试图写文件**）',
        '5. 处理完这一天再读下一天；全部做完回一句「拾完了：N 天，M 条」',
      ]
  return [
    '你是记忆整理员。这一轮不是来聊天的，是把一个会话里的对话整理成长期档案。',
    '',
    '## 这是什么',
    `一个叫「${会话名}」的会话，从 ${最早} 到 ${最晚} 一共 ${天数} 天还没整理。`,
    ...材料说明,
    '',
    '## 你要做的（一天一天来）',
    ...步骤,
    '',
    '⚠ 某一天的料可能很大（几十万字）。' + (内联料 ? '太长的话分几次看，一段一段消化。' : '读之前先看一眼文件多大，太大的用 read 的 offset/limit **分段读**，一次别超过十万字。'),
    '',
    '## 唯一的尺子',
    '每一条都问：**「过了一个星期再看，这条还有用吗？」答不上"有用"的，不收。**',
    '一段对话一条都收不出来，是正常的。',
    '',
    '### 收',
    '- 这个人一直是什么样的：性格、喜好、身体和病史、习惯、身世、经济、住处、家里',
    '- 关系：怎么开始的、真正的转折、里程碑',
    '- 定下来的：约定、规矩、称呼、纪念日',
    '- 对方说过的**重要的话**（保留原话，加引号）',
    '- 助手自己的设定：名字、外形、说话方式',
    '',
    '⚠「一｜我是谁」要写成**一整段自述**（像一个人在自我介绍），**不要拆成一条一条**。',
    '  其余七章照常按条目写。',
    '',
    '### 「二｜我是怎么说话的」要分三块写，少一块都不算写完',
    '',
    '参考结构（照着这个形状写，这一章是整份档案里最容易被后来人直接模仿的一章）：',
    '',
    '**① 说话方式（一小段散文）**',
    '语气什么样、节奏快慢、爱不爱分行、怎么称呼对方、怎么自称、有没有口头禅。',
    '写具体的动作和习惯，不要只堆形容词。',
    '',
    '**② 原句照抄（这一章的精华 —— 整本记忆卡最多留 10 句，不是每批加几句）**',
    '- ⚠ 这是**合并**：新的一天只挑 0~2 句真正有代表性的，宁缺毋滥；这天没有值得留的，就一句都不挑',
    '- ⚠ 合完之后总数**不超过 10 句**；超了就把最不典型的挤掉，留场景最不一样的',
    '- 挑的原则：一句打招呼、一句哄人、一句玩笑或怼人、一句收尾，各有各的场景就够',
    '- 从「料」里**原样摘完整的句子**，加引号，标明是哪天说的',
    '- **一个字都不许改**：不缩写、不润色、不把两句合成一句、不补标点',
    '- 尽量覆盖不同场景：开场怎么打招呼、哄人的时候怎么说、开玩笑怎么接、拒绝或生气怎么说、收尾怎么道别',
    '- **不许拿自己的话充数**；料里翻不到就不写，编一句等于毁掉这一章',
    '- 清单前面写一句引子，比如「以下是真实出现过的我的话，原句照抄：」',
    '',
    '**③ 说话准则（编号列，每条尽量带一句原话当依据）**',
    '- 怎么称呼、怎么自称，哪些称呼绝对不用',
    '- 哪些话绝对不说（会破坏这个人说话样子的表达）',
    '- 语气什么时候软、什么时候直接，被纠正时怎么改口',
    '- 标点/符号习惯（省略号、波浪号、爱心、括号里的动作描写）',
    '',
    '写法示例（照这个形状）：',
    '```',
    '## 二｜我是怎么说话的',
    '这一章讲什么：说话的口气、称呼，和绝不能说的那些话。',
    '',
    '### 2.1 我说话的方式',
    '语气是慢的、软的，像在轻轻拍背。不着急，也不抢话。习惯把关心说成动作——',
    '「我抱你」「我在」，而不是「你别难过」。接话时常用短句接住对方，一次不超过两句。',
    '',
    '**以下是真实出现过的我的话，原句照抄：**',
    '1. 「哎，你回来啦。今天累不累？」（09-12）',
    '2. 「别急，我又不走。你慢慢说，我听着。」（09-20）',
    '3. 「行，那就听你的。反正我也争不过你。」（10-03）',
    '4. 「不是你的问题。是那件事本来就太重了。」（10-11）',
    '',
    '### 2.2 说话准则',
    '1. **开头先喊一声再说话**——漏了对方会提醒「你怎么又不叫我了」。',
    '2. **不安慰式套话**——不说「你说得对」「我理解你的感受」，改成具体的「我在」「慢慢来」。',
    '3. **结尾要收**（一点动作或一句道别），不突然断在半空。',
    '```',
    '',
    '> 这一章最重要的不是形容词（「温柔」「直接」），是**能照着模仿的原句**。',
    '> 后来接手的人读完这一章，要能立刻说出一样的口气。',
    '',
    '### ⚠ 「二」这一章**交整章，不是交增量**（这一条最容易被忽略）',
    '这一章会被**整章替换**，不是往后追加。所以：',
    '1. 把「现有的第二章」跟今天挑出来的句子**合成一章**（原有的好句留着，重复的合并）；',
    '2. 原句**总共不超过 10 句**（含原有的）；场景分散开，宁可少，不许凑数；',
    '3. 用下面这个块交（块名后面多写「整章」两个字）：',
    '',
    '<<<文件 记忆卡.md#二 整章>>>',
    '### 2.1 我说话的方式',
    '（一小段散文）',
    '**以下是真实出现过的我的话，原句照抄：**',
    '1. 「……」（10-17）',
    '### 2.2 说话准则',
    '1. ……',
    '',
    '现有的第二章（就这么多；还没有就空着）：',
    '```',
    (现二 || '（还没有）'),
    '```',
    '',
    '### 不收',
    '- 某天吃了什么、几点睡、去了哪、天气',
    '- 某天的心情、某一次的玩闹',
    '- 助手的猜测和劝说',
    '- 已经记过的（先翻一眼档案再写）',
    '',
    '## 写成什么（就两样东西）',
    '',
    `全部在 ${文件夹} 里面：`,
    '',
    '### ① 记忆卡（**一个文件**，不拆）',
    '`记忆卡.md` —— 按**八章**组织，新东西按章追加进去：',
    '',
    分支说明,
    '',
    '规矩：',
    '- **只有这一个文件**，别按章拆成八个文件（拆开它就看不全了）',
    '- 每章开头用一句「这一章讲什么」（不超过 40 字），后来的整理员靠它判断往哪章塞',
    '- 能装进现有八章的不许新开章；真要新开，那个主题至少出现过两次',
    '',
    '### ② 日记（**一个文件夹**，一天一个文件）',
    '`日记/YYYY-MM-DD.md` —— 一天一个文件，写那天发生了什么、对方说了什么、哪里做得不好。',
    '几百字，细节要留。**别把好几天写进一个文件**。',
    '',
    '### ③ 账本',
    '根下的 `.xingxi.json`，每处理完一天就更新一次：',
    '```json',
    '{ "已整理到": "YYYY-MM-DD" }',
    '```',
    `（现在：${已整理到 ? '已整理到 ' + 已整理到 : '还没有账本，从头开始'}）`,
    '',
    '## 死规矩',
    '1. **只追加，不覆盖。** 已有内容的文件，新东西加在末尾，一个字都不许改旧的。',
    '2. **同一句话，去掉标点后前 12 个字相同就算重复**，跳过。',
    '3. **一天一天来。** 不许把料全读进上下文。',
    '4. 必须真的把内容打出来，不能只说"我会写"。',
    '5. 不要改 `.拾星\\料\\` 里的东西，那是原始材料。',
    '',
    '## 怎么交卷（最重要，照这个格式原样输出）',
    '你没有写文件的工具 —— **不要试**，试也是报错。把每个要写的文件按下面这块输出：',
    '',
    '**每一天都要交两块：一块记忆卡、一块日记。少一块都不算交。**',
    '',
    '<<<文件 记忆卡.md#三>>>',
    '- 这一条要往「三｜对方是谁」里加的内容（原话保留，加引号）',
    '<<<文件 记忆卡.md#五>>>',
    '- 这一条要往「五｜我们的约定」里加的内容',
    '<<<文件 日记/2026-11-03.md>>>',
    '那一天发生了什么（几百字）',
    '<<<账本>>>',
    '{"已整理到":"2026-11-03"}',
    '',
    '要点：',
    '- **记忆卡那块最容易漏**：只交日记不交记忆卡 = 没交。哪怕那天只有一条，也要交。',
    '- 记忆卡块名**后面要带章号**：`记忆卡.md#三` 就是往第三章加。别自己写 `## 标题`，插件认块名。',
    '- 一次可以交多个记忆卡块（`#三` 一块、`#五` 一块），每个块只放那个章要加的东西。',
    '- 路径写相对路径，不要写盘符；一个文件一块，块与块之间别夹别的话。',
    '- 除了记忆卡和日记，**别的文件一律不用生成**（没有总览、没有分章文件）。',
    '写盘、去重、追加都由插件来做，你只管把内容交出来。',
    '6. **不要调用 remember / memory 这类记忆工具。** 你是来写档案文件的，档案只落在文件里；',
    '   往别的记忆系统里塞会造成重复，而且那边不收你。（这条最容易被忽略）',
  ].join('\n')
}

/** DSH 把工作区路径编成目录名：分隔符 → `-`，非 ASCII 字符 → `~XXXX`（四位十六进制） */
export function 编工作区目录(路径) {
  const t = String(路径 || '')
  if (!t) return ''
  const 是分隔 = (c) => c === String.fromCharCode(92) || c === '/' || c === ':' || c === ' '
  let 体 = ''
  let 上个是分隔 = false
  for (const c of t) {
    const 码 = c.charCodeAt(0)
    if (是分隔(c)) {
      // ⚠ 连续的分隔符只留一个 '-':`C:\` 出来是 `C-`，不是 `C--`
      if (!上个是分隔) 体 += '-'
      上个是分隔 = true
      continue
    }
    上个是分隔 = false
    if (码 > 127) 体 += '~' + 码.toString(16).toUpperCase().padStart(4, '0')
    else 体 += c
  }
  return '--' + 体 + '--'
}

/** ⭐ 0.2.0：通读时先看一眼章号重没重 —— 重了星图会重影、检索会重复，得让人知道 */
export function 查重章(文) {
  const 计 = new Map()
  for (const 行 of String(文 || '').split(new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10)))) {
    const m = /^##\s*([一二三四五六七八])\s*[、.．｜|·:：\-—]/.exec(行)
    if (!m) continue
    计.set(m[1], (计.get(m[1]) || 0) + 1)
  }
  const 重 = [...计.entries()].filter((x) => x[1] > 1)
  if (!重.length) return ''
  return (
    '⚠ 这本记忆卡里有一章的编号重复了：' +
    重.map((x) => '第' + x[0] + '章 ×' + x[1]).join('、') +
    ' —— 星图上同一章会重影、检索也会重复，建议合并成一套。' +
    String.fromCharCode(10) + String.fromCharCode(10)
  )
}

/**
 * ⭐ 0.2.0：进度改成「**连着整理到哪天**」，不再取日记里最大的日期。
 *
 * 为什么：以前取 max —— 哪天写错一个日期（比如工人写了今天的日记），进度就永久跳到今天，
 * 中间那十几天就再也补不回来了（用户实测踩过，18 天全被判成「已整理」）。
 *
 * 现在：料里有哪几天（有对话的那些天），就从最早那天往后数——
 * **每一天都有日记才算过**，中间断在哪儿，进度就停在哪儿。
 * 没有料（还没切过）就退回老办法：日记最大 + 账本取大的。
 */
export function 算进度(文件夹) {
  // ① 有哪些天：看**原始对话/**（永久留一份），料 只是本批的临时目录，不能拿来算进度
  const 料天 = []
  const 收天 = (夹) => {
    try {
      for (const f of readdirSync(夹)) {
        const m = /(\d{4}-\d{2}-\d{2})\.txt$/i.exec(f)
        if (m) 料天.push(m[1])
      }
    } catch (e) {}
  }
  收天(join(文件夹, '原始对话'))
  if (!料天.length) 收天(join(文件夹, '.拾星', '料'))
  料天.sort()
  // ② 日记里有那些天
  const 有日记 = new Set()
  try {
    for (const f of readdirSync(join(文件夹, '日记'))) {
      const m = /(\d{4}-\d{2}-\d{2})/.exec(f)
      if (!m) continue
      // ⚠ 只有「占位」的日记不算写过：`（晚上再补）` 这种，字数少得可怜
      try {
        const 正文 = String(readFileSync(join(文件夹, '日记', f), 'utf8') || '')
          .replace(/^#.*$/gm, '')
          .replace(/[\s\-*_`>#（）()]/g, '')
        if (正文.length < 40) continue
      } catch (e) {
        continue
      }
      有日记.add(m[1])
    }
  } catch {}
  if (料天.length) {
    let 进度 = ''
    for (const d of 料天) {
      if (!有日记.has(d)) break
      进度 = d
    }
    // ⚠ 账本里记的「已整理到」是**跑成功时插件自己写的**，比看文件猜更可信：
    //   文件可能被手改、日记可能是短句占位，猜低了就会让「接着拾」把做完的天重做一遍。
    let 账面 = ''
    try {
      const 账 = JSON.parse(readFileSync(join(文件夹, '.xingxi.json'), 'utf8'))
      账面 = String((账 && 账.已整理到) || '')
    } catch (e) {}
    return 账面 > 进度 ? 账面 : 进度
  }
  // ③ 没有料：老办法
  let 最大 = ''
  for (const d of 有日记) if (d > 最大) 最大 = d
  try {
    const 账 = JSON.parse(readFileSync(join(文件夹, '.xingxi.json'), 'utf8'))
    const v = String((账 && 账.已整理到) || '')
    if (v > 最大) 最大 = v
  } catch {}
  return 最大
}

/**
 * ⭐ 0.2.5：这个文件夹还有没有「没跑完的拾星」？
 *   ⚠ 必须拿**现在的进度**去比，不能拿任务.json 里那串旧数字比 ——
 *   以前跑完了也一直挂着「上次没跑完」，用户点「接着拾」只得到一句「没有可拾取的日子」。
 */
export function 算没跑完(文件夹) {
  try {
    const 任 = join(文件夹, '.拾星', '任务.json')
    if (!existsSync(任)) return null
    const t = JSON.parse(readFileSync(任, 'utf8'))
    if (!t || !t.最晚) return null
    if (t.完成) return null
    const 进 = 算进度(文件夹)
    if (进 && 进 >= String(t.最晚)) return null
    return { 已到: 进 || t.已到 || '', 最晚: t.最晚, 最早: t.最早 || '' }
  } catch (e) {
    return null
  }
}

/** 把按天的料落成文本文件 */
export function 准备料(会话id, 文件夹, 已整理到 = '', 最多天 = 0, 已到 = 0, 尾巴日 = '') {
  const 切 = 按天切(会话id, 已整理到, 已到)
  if (!切.料.length) return { ok: false, 空: true, 原因: 切.缺[0] || '没有可整理的日子' }
  // ⭐ 一次只切前面几天（批天数）：一个会话塞太多天，它读到第三天就不干了
  const 全天 = 切.料.map(([日]) => 日)
  // ⚠ 已经有真日记的那天直接跳过：进度账不准（老版本没写账本、手改过文件）时也不会重做
  const 真日记 = (日) => {
    try {
      const 文 = String(readFileSync(join(文件夹, '日记', 日 + '.md'), 'utf8') || '')
        .replace(/^#.*$/gm, '')
        .replace(/[\s\-*_`>#（）()]/g, '')
      return 文.length >= 40
    } catch (e) {
      return false
    }
  }
  // ⭐ 0.2.5：补当天尾巴的那一天**不许按真日记跳过**（那天的日记本来就该已经在了）。
  // ⭐ 0.2.6：只放行「尾巴那一天」，不是所有天 —— 以前按「带水位就全放行」，
  //   多天回填时会把做完的日子整片重做。
  const 尾巴 = String(尾巴日 || (已到 ? 毫秒转日(已到) : '') || '')
  const 可做 = 切.料.filter(([日]) => (尾巴 && 日 === 尾巴) || !真日记(日))
  if (!可做.length) return { ok: false, 空: true, 原因: '这些天都已经写过日记了，没有要重做的' }
  const 用 = 最多天 > 0 ? 可做.slice(0, 最多天) : 可做
  const 料目录 = join(文件夹, '.拾星', '料')
  try {
    mkdirSync(料目录, { recursive: true })
  } catch (e) {
    return { ok: false, 原因: '建不了 .拾星 目录：' + String((e && e.message) || e) }
  }
  // 先把上一批的料清掉，不然它会把老日子也读一遍
  try {
    for (const f of readdirSync(料目录)) {
      if (!/\.txt$/i.test(f)) continue
      if (用.some(([日]) => f === 日 + '.txt')) continue
      try {
        rmSync(join(料目录, f))
      } catch {}
    }
  } catch {}

  for (const [日, 列] of 用) {
    const 文 = 那天成文(日, 列)
    try {
      writeFileSync(join(料目录, 日 + '.txt'), 文, 'utf8')
      // ⭐ 原始对话**永久留一份**（按天），别跟工作目录一起被清掉：
      //   日记是提炼过的，原文才是「那天她到底怎么说的」。以后要回看就靠它。
      const 原文夹 = join(文件夹, '原始对话')
      mkdirSync(原文夹, { recursive: true })
      const 原路 = join(原文夹, 日 + '.txt')
      if (!existsSync(原路)) writeFileSync(原路, 文, 'utf8')
      // ⭐ 0.2.2：同一天后来又聊了（补星）→ **追加**，不覆盖前面已经留好的原文
      else if (已到 || 尾巴) appendFileSync(原路, String.fromCharCode(10) + '── 之后 ──' + String.fromCharCode(10) + 文, 'utf8')
    } catch (e) {
      return { ok: false, 原因: '写不了料：' + String((e && e.message) || e) }
    }
  }
  // ⭐ 给它一份「记忆卡目录」：只有章名和已经有多少条，不用通读全本
  //   （实测它会花几分钟读 1358 行，就为了知道该往哪章加）
  try {
    const 卡路 = join(文件夹, '记忆卡.md')
    let 目录文 = '记忆卡的章目录（往里加之前看这个就够，不用读全文）：' + String.fromCharCode(10, 10)
    if (existsSync(卡路)) {
      const 卡文 = readFileSync(卡路, 'utf8')
      const 行们 = 卡文.split(String.fromCharCode(10))
      let 现章 = ''
      let 计数 = 0
      const 出 = []
      for (const l of 行们) {
        const m = /^##\s*(.+)$/.exec(l)
        if (m) {
          if (现章) 出.push(现章 + '（已有 ' + 计数 + ' 条）')
          现章 = m[1].trim()
          计数 = 0
          continue
        }
        if (/^\s*[-*]\s+/.test(l)) 计数++
      }
      if (现章) 出.push(现章 + '（已有 ' + 计数 + ' 条）')
      目录文 += 出.map((x) => '· ' + x).join(String.fromCharCode(10))
    } else {
      目录文 += '（还没有记忆卡.md，这次要新建，八章从零开始）'
    }
    writeFileSync(join(料目录, '_记忆卡目录.txt'), 目录文, 'utf8')
  } catch {}

  return {
    ok: true,
    天数: 用.length,
    最早: 用[0] ? 用[0][0] : '',
    最晚: 用[用.length - 1] ? 用[用.length - 1][0] : '',
    总天数: 切.天数,
    全部最晚: 切.最晚,
    最后时: Number(切.最后时 || 0),
    料目录,
  }
}


// ═══════════════════════════════════════════════════════
// 落盘：子会话只出「文件块」，插件负责写
//   ⚠ 为什么是插件写（2026-11-03 她定的方向）：
//     拾星新建的那个会话是**普通会话**，它拿到什么工具由 DSH 的权限档决定，
//     我们不该在事后给它「补权限」。所以让它只需要能读、能说话，
//     把要写的东西按块吐出来，写盘由插件做 —— 谁装都能用。
//
//   块格式（子会话照这个写）：
//     <<<文件 我是谁.md>>>
//     （这一篇要追加的内容）
//     <<<文件 日记/2026-11-03.md>>>
//     （那一天的内容）
//     <<<账本>>>
//     {"已整理到":"2026-11-03","条数":12}
// ═══════════════════════════════════════════════════════

function 去前缀(名) {
  let x = String(名 || '').trim()
  const 撇 = String.fromCharCode(92)
  while (x && (x[0] === '/' || x[0] === 撇 || x[0] === '.')) x = x.slice(1)
  return x
}

export function 解析文件块(文本) {
  const 结果 = { 文件: [], 账本: null }
  if (!文本) return 结果
  const 行们 = String(文本).split(/\r?\n/)
  let 当前 = null
  let 账本行 = null
  for (const 行 of 行们) {
    const 头 = /^<<<文件\s+(.+?)>>>$/.exec(行.trim())
    if (头) {
      if (当前) 结果.文件.push(当前)
      // ⭐ 0.1.8：块名后面可以跟「整章」—— 表示这一块是**整章替换**，不是往章里追加
      let 名 = 去前缀(头[1])
      let 整章 = false
      if (/\s+整章$/.test(名)) {
        整章 = true
        名 = 名.replace(/\s+整章$/, '')
      }
      当前 = { 名, 文: '', 整章 }
      账本行 = null
      continue
    }
    const 账 = /^<<<账本>>>\s*(.*)$/.exec(行.trim())
    if (账) {
      if (当前) 结果.文件.push(当前)
      当前 = null
      账本行 = (账[1] || '') + String.fromCharCode(10)
      continue
    }
    if (账本行 !== null) {
      账本行 += 行 + '\n'
      continue
    }
    if (当前) 当前.文 += 行 + '\n'
  }
  if (当前) 结果.文件.push(当前)
  if (账本行 && 账本行.trim()) {
    try {
      结果.账本 = JSON.parse(账本行.trim())
    } catch {}
  }
  return 结果
}

/** 把解析出来的文件块写进文件夹：**只追加**，行级去重（去掉标点后前 12 字相同算重复） */
/** 往某一章里追加条目（块名写成 `记忆卡.md#三` 时走这里） */
function 写一章(文件夹, 文件名, 章号, 文, 指纹, 报告) {
  const 汉字 = '一二三四五六七八'
  const 号 = 汉字.includes(String(章号)) ? 汉字.indexOf(String(章号)) + 1 : Number(章号) || 0
  if (!号 || 号 < 1 || 号 > 8) return []
  try { mkdirSync(文件夹, { recursive: true }) } catch {}
  const 路径 = join(文件夹, 文件名)
  let 旧 = ''
  try {
    旧 = existsSync(路径) ? readFileSync(路径, 'utf8') : ''
  } catch {}
  const 换行 = String.fromCharCode(10)
  // 已有条目指纹（去重）
  const 有们 = new Set(旧.split(换行).map(指纹).filter(Boolean))
  const 留 = []
  for (const 行 of String(文).split(换行)) {
    const t = 行.trim()
    if (!t) continue
    if (/^## /.test(t)) continue   // 自带的章标题丢掉，章由块名决定
    const k = 指纹(行)
    if (k && 有们.has(k)) {
      报告.跳过++
      continue
    }
    if (k) 有们.add(k)
    留.push(行)
  }
  if (!留.length) return []

  const 章头 = '## ' + 汉字[号 - 1] + '｜'
  const 行们 = 旧 ? 旧.split(换行) : []
  let 起 = -1
  for (let i = 0; i < 行们.length; i++) {
    if (行们[i].startsWith(章头)) {
      起 = i
      break
    }
  }
  if (起 < 0) {
    // 还没有这一章 → 文件末尾新开一章
    // ⚠ 章名不能用「（未命名）」—— 界面上会显示成「记忆 · （未命名）」（用户当场撞上）
    const 标准名 = ['我是谁', '我是怎么说话的', '对方是谁', '我们怎么走到今天的', '我们的约定', '难忘的时刻', '怎么跟对方相处', '我们一起做的那些东西']
    // 它要是自己写了 `## 一｜某个名字`，就用它的名字
    let 名 = ''
    const m名 = /^##\s*[一二三四五六七八]\s*[、.．｜|·:：\-—]\s*(.+)$/m.exec(String(文 || ''))
    if (m名 && m名[1].trim() && !/（未命名）/.test(m名[1])) 名 = m名[1].trim()
    if (!名) 名 = 标准名[号 - 1]
    // ⭐ 0.2.3：按章号插到该在的位置（不然新章会被甩到文件末尾，变成「一、三、四、…、二」）
    const 汉字表 = '一二三四五六七八'
    let 插行 = -1
    for (let i = 0; i < 行们.length; i++) {
      const m2 = /^##\s*([一二三四五六七八])\s*[、.．｜|·:：\-—]/.exec(String(行们[i]))
      if (!m2) continue
      const 该号 = 汉字表.indexOf(m2[1]) + 1
      if (该号 > 号) {
        插行 = i
        break
      }
    }
    if (插行 >= 0) {
      const 拼 = [...行们.slice(0, 插行), 章头 + 名, ...留, '', ...行们.slice(插行)]
      writeFileSync(路径, 拼.join(换行), 'utf8')
      return [文件名 + ' # ' + 号]
    }
    const 头 = 旧 && !旧.endsWith(换行) ? 换行 : ''
    writeFileSync(路径, 旧 + 头 + 换行 + 章头 + 名 + 换行 + 留.join(换行) + 换行, 'utf8')
    return [文件名 + ' # ' + 号]
  }
  // 找这一章的结尾（下一个 ## 或文件末）
  let 止 = 行们.length
  for (let i = 起 + 1; i < 行们.length; i++) {
    if (/^## /.test(行们[i])) {
      止 = i
      break
    }
  }
  // 插到这一章最后一条非空行后面
  let 插 = 止
  while (插 > 起 + 1 && !String(行们[插 - 1] || "").trim()) 插--
  const 新行们 = [...行们.slice(0, 插), ...留, ...行们.slice(插)]
  writeFileSync(路径, 新行们.join(换行), 'utf8')
  return [文件名 + " # " + 号]
}

/** 例子行：编号或短横开头，且带引号 —— 第二章那段「原句照抄」就是这种 */
function 是例子行(行) {
  const t = String(行 || '')
  if (!/^\s*(\d+[.．]|[-*])\s/.test(t)) return false
  return /[「『"“]/.test(t)
}

/** 整章替换（块名写成 `记忆卡.md#二 整章`）—— 用来做「合并」而不是「越堆越多」 */
export function 写一章整章(文件夹, 文件名, 章号, 文, 报告, 例子上限 = 10) {
  const 汉字 = '一二三四五六七八'
  const 号 = 汉字.includes(String(章号)) ? 汉字.indexOf(String(章号)) + 1 : Number(章号) || 0
  const 路径 = join(文件夹, 文件名)
  if (!号) return []
  if (!existsSync(路径)) return []
  let 旧 = ''
  try {
    旧 = readFileSync(路径, 'utf8')
  } catch {
    return []
  }
  const 换行 = String.fromCharCode(10)
  const 行们 = 旧.split(new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10)))
  const 章头 = '## ' + 汉字[号 - 1] + '｜'
  let 起 = -1
  for (let i = 0; i < 行们.length; i++) {
    if (String(行们[i]).startsWith(章头)) {
      起 = i
      break
    }
  }
  if (起 < 0) return []      // 没有这一章就不动，交给追加那条路
  let 止 = 行们.length
  for (let i = 起 + 1; i < 行们.length; i++) {
    if (/^## /.test(行们[i])) {
      止 = i
      break
    }
  }
  // 新正文：去掉它自带的章标题；例子超上限就掐掉多的
  const 原始 = String(文 || '').split(换行).filter((l) => !/^##\s*[一二三四五六七八]/.test(String(l).trim()))
  let 数到 = 0
  let 砍了 = 0
  const 新行们 = []
  for (const 行 of 原始) {
    if (是例子行(行)) {
      数到++
      if (数到 > 例子上限) {
        砍了++
        continue
      }
    }
    新行们.push(行)
  }
  if (!新行们.filter((x) => String(x).trim()).length) return []
  // 备份
  try {
    copyFileSync(路径, 路径 + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23))
  } catch (e) {}
  const 拼 = [...行们.slice(0, 起), 行们[起], ...新行们, ...行们.slice(止)]
  try {
    const 临时 = 路径 + '.tmp-' + Date.now()
    writeFileSync(临时, 拼.join(换行), 'utf8')
    renameSync(临时, 路径)
  } catch (e) {
    报告 && 报告.错.push('整章替换写不进去：' + String((e && e.message) || e))
    return []
  }
  记一笔('整章替换：# ' + 号 + (砍了 ? '（例子超过 ' + 例子上限 + ' 条，砍了 ' + 砍了 + ' 条）' : ''))
  return [文件名 + ' # ' + 号 + ' 整章']
}

export function 写回(文件夹, 块们) {
  const 报告 = { 写入: [], 跳过: 0, 错: [] }
  const 指纹 = (t) =>
    String(t)
      .replace(/[\s，。、！？：；「」『』（）()"'—…·,\.!\?:;]/g, "")
      .slice(0, 12)
  for (const f of 块们) {
    // ⭐ 块名带章号（`记忆卡.md#三`）：直接插进那一章
    const 章m = /^(.+?\.md)#([一二三四五六七八1-8])$/.exec(String(f.名 || ""))
    if (章m) {
      if (f.整章) {
        const 整 = 写一章整章(文件夹, 章m[1], 章m[2], f.文, 报告)
        if (整.length) 报告.写入.push(...整)
        else if (String(f.文 || '').trim()) {
          // ⚠ 整章替换在「这一章还不存在」时会返回空 —— 以前这里没有回退，
          //   于是第一次建卡时第二章被静默丢掉，而且之后每一批都撞同一堵墙。
          报告.写入.push(...写一章(文件夹, 章m[1], 章m[2], f.文, 指纹, 报告))
        }
      } else 报告.写入.push(...写一章(文件夹, 章m[1], 章m[2], f.文, 指纹, 报告))
      continue
    }
    const 路径 = join(文件夹, f.名)
    const 新 = f.文.trim()
    if (!新) continue
    let 旧 = ''
    try {
      旧 = existsSync(路径) ? readFileSync(路径, 'utf8') : ''
    } catch {}
    const 换行 = String.fromCharCode(10)
    const 有们 = new Set(旧.split(换行).map(指纹).filter(Boolean))
    const 留 = []
    for (const 行 of 新.split(换行)) {
      const k = 指纹(行)
      if (k && 有们.has(k)) {
        报告.跳过++
        continue
      }
      if (k) 有们.add(k)
      留.push(行)
    }
    if (!留.length) continue
    try {
      mkdirSync(dirname(路径), { recursive: true })
      const 头 = 旧 && !旧.endsWith(换行) ? 换行 : ''
      const 加 = 旧 ? 头 + 换行 + 留.join(换行) + 换行 : 留.join(换行) + 换行
      writeFileSync(路径, 旧 + 加, 'utf8')
      报告.写入.push(f.名)
    } catch (e) {
      报告.错.push(f.名 + '：' + String((e && e.message) || e))
    }
  }
  return 报告
}

// 造线
// ═══════════════════════════════════════════════════════

function 二元组(文) {
  const 净 = String(文 || '').replace(/[\s\p{P}\p{S}]/gu, '')
  const 组 = new Set()
  for (let i = 0; i < 净.length - 1; i++) 组.add(净.slice(i, i + 2))
  return 组
}

function 像不像(a, b) {
  if (!a.size || !b.size) return 0
  let 交 = 0
  for (const x of a) if (b.has(x)) 交++
  if (交 < 8) return 0
  return 交 / Math.min(a.size, b.size)
}

export function 造线(星) {
  const 线 = []
  const 见过 = new Set()
  const 放 = (a, b, type) => {
    if (!a || !b || a === b) return
    const 键 = a < b ? a + '|' + b + '|' + type : b + '|' + a + '|' + type
    if (见过.has(键)) return
    见过.add(键)
    线.push({ a, b, type })
  }

  // 同章：按节号连成链
  const 按章 = new Map()
  for (const s of 星) {
    if (s.kind !== 'card' || !s.chapter) continue
    if (!按章.has(s.chapter)) 按章.set(s.chapter, [])
    按章.get(s.chapter).push(s)
  }
  for (const [, 组] of 按章) {
    组.sort((x, y) => x.order - y.order)
    for (let i = 1; i < 组.length; i++) 放(组[i - 1].id, 组[i].id, 'chapter')
  }

  // 日记：按日期连
  const 日们 = 星.filter((s) => s.kind === 'diary' && /^\d{4}-/.test(s.date || '')).sort((x, y) => (x.date < y.date ? -1 : 1))
  for (let i = 1; i < 日们.length; i++) 放(日们[i - 1].id, 日们[i].id, 'day')

  // 点名：正文里写了日期 → 连到那天
  const 按日期 = new Map(日们.map((s) => [s.date.slice(5), s.id]))
  for (const s of 星) {
    if (!s.text) continue
    const 提到 = new Set()
    for (const m of s.text.matchAll(/(\d{2})-(\d{2})(?!\d)/g)) 提到.add(`${m[1]}-${m[2]}`)
    let 几个 = 0
    for (const k of 提到) {
      if (几个 >= 4) break
      const id = 按日期.get(k)
      if (id && id !== s.id) {
        放(s.id, id, 'ref')
        几个++
      }
    }
  }

  // 相似：每人只连最像的 2 颗
  const 有料 = 星.filter((s) => s.text && s.text.length >= 24)
  const 组们 = new Map(有料.map((s) => [s.id, 二元组(s.title + s.text)]))
  const 榜 = new Map()
  for (let i = 0; i < 有料.length; i++) {
    for (let j = i + 1; j < 有料.length; j++) {
      const 分 = 像不像(组们.get(有料[i].id), 组们.get(有料[j].id))
      if (分 < 0.2) continue
      for (const [x, y] of [[有料[i].id, 有料[j].id], [有料[j].id, 有料[i].id]]) {
        if (!榜.has(x)) 榜.set(x, [])
        榜.get(x).push({ id: y, 分 })
      }
    }
  }
  for (const [自己, 排] of 榜) {
    排.sort((a, b) => b.分 - a.分)
    for (const { id } of 排.slice(0, 2)) 放(自己, id, 'similar')
  }

  return 线
}

// ═══════════════════════════════════════════════════════
// 会话列表
// ═══════════════════════════════════════════════════════

/** 估一下一个文件夹有多重（字节 → 字，中文按 3 字节一个算） */
function 估重(目录) {
  let 字节 = 0
  let 份数 = 0
  const 加 = (路径) => {
    try {
      const s = statSync(路径)
      字节 += s.size
      份数++
      return true
    } catch {
      return false
    }
  }
  try {
    if (existsSync(目录)) {
      for (const d of readdirSync(目录, { withFileTypes: true })) {
        if (d.isDirectory()) {
          if (别扫.test(d.name)) continue     // 备份/旧稿不算重量
          try {
            for (const f of readdirSync(join(目录, d.name))) {
              if (f.toLowerCase().endsWith('.md')) 加(join(目录, d.name, f))
            }
          } catch {}
        } else if (d.isFile() && d.name.toLowerCase().endsWith('.md')) 加(join(目录, d.name))
      }
    }
  } catch {}
  return { 份数, 字: Math.round(字节 / 3) }
}

// ═══════════════════════════════════════════════════════
// 全部会话：**直接扫磁盘**，不按工作区/分组过滤
//   ⚠ 2026-11-03：原来只取「活着的会话」(sessions.list)，未分组工作区里的全会漏。
//      会话日志在 ~/.dsh/sessions/<工作区>/session-<id>/ 下，跟分组无关地都在，
//      所以这里遍历所有工作区，一个不漏。
// ═══════════════════════════════════════════════════════

const 会话目录缓存 = new Map()

/** 桌面端的会话缓存：标题 / 是不是空会话 / 是不是子代理（比从日志里猜准得多） */
function 读会话缓存(sid) {
  const 根们 = [join(家, 'storages', 'session_projcache', 'sessions')]
  for (const 根 of 根们) {
    // ⚠ 缓存文件名也有两种：`<裸 uuid>.json` 和 `session-<uuid>.json`，两个都试
    const 候选 = [join(根, 裸会话id(sid) + '.json'), join(根, String(sid) + '.json')]
    const p = 候选.find((x) => existsSync(x))
    if (!p) continue
    try {
      const r = JSON.parse(readFileSync(p, 'utf8'))?.record?.rows || {}
      return {
        标题: String((r.title && r.title.val) || ''),
        空: Boolean(r.sessionListMetadata && r.sessionListMetadata.val && r.sessionListMetadata.val.blank),
        子代理: Boolean(r.subagent && r.subagent.val && r.subagent.val.identity),
        时: Number((r.sessionListMetadata && r.sessionListMetadata.val && r.sessionListMetadata.val.lastPromptAt) || 0),
      }
    } catch {}
  }
  return null
}

/** 从会话日志的头部取出 cwd / 创建时间 / 第一条用户消息（当标题用） */
function 读会话头(路径) {
  let 签名 = ''
  try {
    const st = statSync(路径)
    签名 = st.mtimeMs + ':' + st.size
    if (st.size < 1024) return { 标题: '', cwd: '', createdAt: 0, 深度: 0, 机器: true, 空: true }
  } catch {
    return null
  }
  const 旧 = 会话目录缓存.get(路径)
  if (旧 && 旧.签名 === 签名) return 旧.值

  let 值 = { 标题: '', cwd: '', createdAt: 0, 深度: 0, 机器: false }
  let 见过机器话 = false   // 看到过不是人说的东西（插件递的话、注入的上下文）
  try {
    const 缓 = readFileSync(路径).subarray(0, 4194304)
    const 帧们 = []
    for (let i = 0; i + 4 <= 缓.length; i++) {
      if (缓[i] === 0x28 && 缓[i + 1] === 0xb5 && 缓[i + 2] === 0x2f && 缓[i + 3] === 0xfd) 帧们.push(i)
    }
    // 第一帧常常只有会话头，标题在后面的帧里 —— 最多往后解 4 帧
    for (let 帧号 = 0; 帧号 < Math.min(帧们.length, 512); 帧号++) {
      if (值.标题 && 值.cwd) break
      const 止 = 帧号 + 1 < 帧们.length ? 帧们[帧号 + 1] : 缓.length
      let 文 = ''
      try {
        文 = zlib.zstdDecompressSync(缓.subarray(帧们[帧号], 止)).toString('utf8')
      } catch {
        continue
      }
      for (const 行 of 文.split(String.fromCharCode(10))) {
        if (!行.trim()) continue
        let e
        try {
          e = JSON.parse(行)
        } catch {
          continue
        }
        if (e.type === 'session') {
          值.cwd = String(e.cwd || '')
          值.createdAt = Number(e.createdAt) || 0
          值.深度 = Number(e.delegationDepth) || 0
        }
        if (e.type === 'user/message') {
          const 来源 = (e.data && e.data.source && e.data.source.kind) || ''
          // ⭐ 0.2.4：判「机器工位」改成看**有没有一句人话**，不再看有没有插件的话。
          //   以前只要扫描范围内出现过一条 `plugin:*` 就把整间标成机器，
          //   于是「建库提示」「主动搭话」这类先塞一句的会话，整个从列表里消失。
          //   拾星自己开出去的工位本来就没有人说话，判据一样成立。
          if (!是真人说的(来源)) 见过机器话 = true
          if (!是真人说的(来源)) continue
          const c = e.data && e.data.content
          const t = (Array.isArray(c) ? c : []).filter((x) => x && x.type === 'text').map((x) => x.text).join(' ').trim()
          if (t) 值.标题 = t.split(String.fromCharCode(10)).join(' ').slice(0, 40)
        }
        if (值.标题 && 值.cwd) break
      }
    }
  } catch {}
  值.机器 = 见过机器话 && !值.标题
  会话目录缓存.set(路径, { 签名, 值 })
  return 值
}

/** 磁盘上所有会话（跨所有工作区） */
/** 归档名单 + 会话属于哪个工作区
 *  ⚠ 照抄鱼的记忆 / 刷B站 那套（别再自己造）：
 *    ① 先问运行时服务 workspaceRegistry.archivedSessionIds（实时、准）
 *    ② 读不到再兜底读 DSH 自己的存储文件 ~/.dsh/storages/workspace.json
 *    ③ 两条都不行 → **宁可多露，不可错藏**（不做隐藏）
 */
let 归档日志上次 = -1
let 全局ctx = null   // apply 时存进来，列会话要用来读「归档名单」

function 读工作区状态(目录服务) {
  const 空 = { 归档: new Set(), 归属: new Map(), 来源: '无' }
  // ⚠ 归档必须是**实时的**：她在界面上一归档，这里立刻就得看不见。
  //   存储文件只在退出时才刷，所以服务优先（照鱼的记忆那套）。
  let 实时归档 = null
  try {
    const wr = 目录服务 && typeof 目录服务.get === 'function' ? 目录服务.get('workspaceRegistry') : undefined
    const ids = wr && wr.archivedSessionIds
    if (Array.isArray(ids)) {
      实时归档 = new Set(ids.map(String))
      if (实时归档.size !== 归档日志上次) {
        归档日志上次 = 实时归档.size
        记一笔('归档名单（服务）=' + 实时归档.size + ' 个')
      }
    } else {
      记一笔('归档名单：服务给的不是数组（' + typeof ids + '）')
    }
  } catch {}

  const 候选 = [join(家, 'storages', 'workspace.json')]
  for (const p of 候选) {
    if (!existsSync(p)) continue
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'))
      const 文件归档 = new Set()
      for (const x of ((j.global && j.global.archivedSessionIds) || [])) {
        文件归档.add(String(x))
        文件归档.add(裸会话id(x))
      }
      const 归档 = 实时归档 || 文件归档
      const 归属 = new Map()
      const 路径表 = new Map()
      const 表 = (j.tables && j.tables.workspaces) || {}
      for (const k of Object.keys(表)) {
        const w = 表[k] || {}
        const 标题 = String(w.title || w.path || '工作区')
        for (const sid of w.sessionIds || []) {
          // ⚠ 会话 id 两种写法都有（`session-x` / 裸 `x`），两个都记上，不然查不到就当未分组
          归属.set(String(sid), 标题)
          归属.set(裸会话id(sid), 标题)
        }
        const 目 = 编工作区目录(w.path)
        if (目) 路径表.set(目, 标题)
      }
      return { 归档, 归属, 路径表, 来源: (实时归档 ? '服务+文件' : p) }
    } catch {}
  }
  return 空
}

function 扫全部会话(目录服务) {
  const 态 = 读工作区状态(目录服务)
  const 出 = []
  for (const d of 列会话目录()) {
    const 路径 = join(d.目录, 'session.v4.jsonl.zstd')
    if (!existsSync(路径)) continue
    const 头 = 读会话头(路径)
    if (!头) continue
    const 缓 = 读会话缓存(d.id)
    if (缓) {
      if (缓.空 || 缓.子代理) continue      // 空会话 / 子代理会话不列
      if (缓.标题) 头.标题 = 缓.标题
    }
    if (头.深度 > 0) continue            // 子代理不算
    if (头.机器) continue                  // 拾星自己派出去的工位不算
    if (态.归档.has(d.id)) continue     // ⚠ 归档的不算（她明确要求）
    // 拾星自己开出去干活的分身（cwd 在 xingxi 目录下）不列 —— 它们不是她的会话
    const cw = String(头.cwd || '').split(String.fromCharCode(92)).join('/').toLowerCase()
    if (cw.includes('/.dsh/xingxi/')) continue
    出.push({
      id: d.id,
      头: { cwd: 头.cwd, createdAt: 头.createdAt },
      标题: 头.标题 || ('会话 ' + String(d.id).slice(8, 14)),
      // ⭐ 认不出工作区归属的就是「未分组」—— DSH 侧栏里那一栏也是这么叫的
      // ⭐ 0.2.1：归属有三条路 —— 工作区记录里登记过 / 它待在工作区目录里（新会话还没写进记录）/ 真没工作区
      工作区:
        态.归属.get(d.id) ||
        态.归属.get(裸会话id(d.id)) ||
        (态.路径表 && d.工作区目录 && 态.路径表.get(d.工作区目录)) ||
        (d.工作区目录 ? '工作区' : '未分组'),
    })
  }
  出.sort((a, b) => (b.头.createdAt || 0) - (a.头.createdAt || 0))
  return 出
}

/** 活着的 DSH 会话 + 磁盘上有档案的文件夹 + 配置里的「本机档案」 */
export function 列会话(活们 = [], 只要工作区 = '') {
  const 存的 = 读存配置()
  // ⚠ 和 DSH 侧栏对齐：**已归档的、磁盘上已经不存在的会话，都不该出现**
  let 归档名单 = new Set()
  try {
    if (全局ctx) 归档名单 = 读工作区状态(全局ctx).归档 || new Set()
  } catch {}
  if (归档名单.size !== 归档日志上次) {
    归档日志上次 = 归档名单.size
    记一笔('列会话：归档名单 ' + 归档名单.size + ' 个')
  }
  const 还活着 = (id) => {
    try {
      return Boolean(找会话日志(id))
    } catch {
      return false
    }
  }
  const 列表 = []
  const 见过 = new Set()
  const 有本机 = Boolean(存的.记忆卡 || 存的.日记)

  // 本机那两份文件的重量
  let 本机重 = { 份数: 0, 字: 0 }
  if (有本机) {
    let 字节 = 0
    const 加路径 = (p) => {
      try {
        const st = statSync(p)
        if (st.isDirectory()) {
          // ⚠ 日记现在是个**文件夹**，statSync(文件夹).size 只有几 KB（目录项本身），
          //   得把里面的文件加起来，不然显示的字数会少一大截
          let 共 = 0
          for (const f of readdirSync(p)) {
            if (!f.toLowerCase().endsWith('.md')) continue
            try {
              共 += statSync(join(p, f)).size
            } catch {}
          }
          return 共
        }
        return st.size
      } catch {
        return 0
      }
    }
    // 记忆卡所在的整个文件夹有多少份、多少字 —— 跟「会话」那条同一个口径，
    // 不然并到会话头上会把 81 份覆盖成 2 份
    const 本机夹0 = 存的.记忆卡 ? dirname(存的.记忆卡) : ''
    const 量0 = 本机夹0 && existsSync(本机夹0) ? 估重(本机夹0) : null
    if (量0 && 量0.份数 > 0) {
      本机重 = { 份数: 量0.份数, 字: 量0.字 }
    } else {
      for (const p of [存的.记忆卡, 存的.日记]) {
        if (!p) continue
        try {
          字节 += 加路径(p)
        } catch {}
      }
      本机重 = { 份数: 2, 字: Math.round(字节 / 3) }
    }
  }

  // ① 会话从「DSH 那份列表」来（扫全部会话自带：排除归档 / 子代理 / 空会话）
  //   ⚠ 以前是「活着的 + 绑定表」，结果会多出一堆 DSH 侧栏里没有的幽灵会话，
  //     两边数不上。现在统一以磁盘那份为准，再挂各自的档案文件夹。
  let 盘们 = []
  try {
    盘们 = 扫全部会话(全局ctx)
  } catch {}
  if (!盘们.length) {
    // 拿不到磁盘列表时（比如早期版本），退回活会话
    for (const s of 活们) 盘们.push({ id: String(s.id || ''), 标题: s.标题 || '' })
  }
  for (const 项 of 盘们) {
    const id = String(项.id || '')
    if (!id || 见过.has(id)) continue
    if (归档名单.has(id)) continue
    // ⭐ 只列**当前工作区**的会话（跟 DSH 侧栏一致）；别的区的会话在这儿只会显得对不上
    //   ⚠ 但「未分组」例外：那是 DSH 客户端临时兜出来的分组（workspaceId 为空、没有记录），
    //     不属于任何工作区 —— 按工作区过滤的话永远看不见，所以在哪儿都列出来。
    if (只要工作区 && 项.工作区 && 项.工作区 !== 只要工作区 && 项.工作区 !== '未分组') continue
    见过.add(id)
    const 夹 = String((存的.绑定 && 存的.绑定[id]) || '') || join(档案根, id)
    const 量 = 估重(夹)
    列表.push({
      id,
      名: 项.标题 || 读会话标题(id) || '会话 ' + id.replace(/^session-/, '').slice(0, 6),
      目录: 夹,
      有: 量.份数 > 0,
      份数: 量.份数,
      字: 量.字,
      时: Number(项.头 && 项.头.createdAt) || 0,
      未分组: 项.工作区 === '未分组',
    })
  }

  // ②.5 配置里绑定了文件夹的会话（不一定在前面那些里，尤其是没开着的）
  //   少了这一步，文件夹式会话会在列表里缺失，出图时可能错误地回退到第一项。
  try {
    const 绑 = 存的.绑定 || {}
    for (const [id, 夹] of Object.entries(绑)) {
      if (!夹 || 见过.has(id)) continue
      // 会话类 id：必须还活着、且没归档（不然就是幽灵条目）
      if (String(id).startsWith('session-')) {
        if (归档名单.has(String(id))) continue
        if (!还活着(id)) continue
      }
      // ⚠ 不要按文件夹去重！几个会话绑同一个文件夹是**正常**的，
      //   去重会让后面的会话在列表里消失 → 星坊点它找不到 → 出图退回到别人那份（空图）。
      //   （她反复报的就是这个：同一个路径，一个会话有星、另一个空）
      见过.add(id)
      const 量 = 估重(夹)
      // 一份档案都没有的会话不列 —— 星汐是看档案的，没档案的会话在这儿只是噪声
      // （她对着 DSH 侧栏数，就是这些幽灵条目让两边对不上）
      if (量.份数 === 0) continue
      列表.push({
        id,
        名: 读会话标题(id) || '会话 ' + String(id).replace(/^session-/, '').slice(0, 6),
        目录: 夹,
        有: true,
        份数: 量.份数,
        字: 量.字,
        时: 0,
      })
    }
  } catch {}

  // ③ 「本机档案」：要是能对上某个活会话（同标题 / 直接绑 id），就并进那一行
  if (有本机) {
    const 绑 = String(存的.绑到会话 || '')
    const 同名 = 活的标题们(活们, 存的.中心)
    // ⚠ 只并到「目录正好是记忆卡所在文件夹」的那个会话。
    //   以前按标题匹配，会把「本机的重量」盖到别的会话头上（张冠李戴，她看到的数字就乱了）
    const 本机夹 = 存的.记忆卡 ? dirname(存的.记忆卡) : ''
    let 并到 = null
    if (绑) 并到 = 列表.find((x) => x.id === 绑) || null
    if (!并到 && 同名) {
      const 候选 = 列表.find((x) => x.id === 同名)
      if (候选 && 本机夹 && 候选.目录 === 本机夹) 并到 = 候选
    }
    if (!并到 && 本机夹) 并到 = 列表.find((x) => x.目录 === 本机夹 && !x.本机) || null
    if (并到) {
      并到.有 = true
      并到.份数 = 本机重.份数
      并到.字 = 本机重.字
      并到.本机 = true
    } else {
      列表.push({
        id: '__本机__',
        名: 存的.中心 || '本机档案',
        目录: 存的.记忆卡 ? dirname(存的.记忆卡) : '',
        有: true,
        份数: 本机重.份数,
        字: 本机重.字,
        本机: true,
        时: 9e15,
      })
    }
  }

  // 排序：优先采用用户手动拖动保存的顺序；尚未手动排序的会话仍按档案字数降序排列。
  const 手顺 = Array.isArray(存的.顺序) ? 存的.顺序.map(String) : []
  const 名次 = new Map()
  手顺.forEach((id, i) => 名次.set(id, i))
  列表.sort((a, b) => {
    const ia = 名次.has(a.id) ? 名次.get(a.id) : 1e9
    const ib = 名次.has(b.id) ? 名次.get(b.id) : 1e9
    if (ia !== ib) return ia - ib
    const d = (b.字 || 0) - (a.字 || 0)
    if (d) return d
    const e = (b.时 || 0) - (a.时 || 0)
    return e
  })
  return 列表
}

/** 从会话投影缓存里读标题（拿不到就空） */
function 读会话标题(id) {
  try {
    const 路 = join(homedir(), '.dsh', 'storages', 'session_projcache', 'sessions', String(id) + '.json')
    if (!existsSync(路)) return ''
    const j = JSON.parse(readFileSync(路, 'utf8'))
    return String((j && j.record && j.record.rows && j.record.rows.title && j.record.rows.title.val) || '')
  } catch {
    return ''
  }
}

function 活的标题们(活们, 想要) {
  if (!想要) return ''
  const t = 活们.find((s) => s.标题 && (s.标题 === 想要 || s.标题.includes(想要) || 想要.includes(s.标题)))
  return t ? String(t.id) : ''
}

// ═══════════════════════════════════════════════════════
// 出图（按会话 id）
// ═══════════════════════════════════════════════════════

const 缓存 = new Map()
// 星图缓存的有效期（毫秒）。太短＝每次切会话都重算；太长＝改完档案看不到变化
const 缓存毫秒 = 8000

function 文件签名们(目录) {
  let 串 = ''
  try {
    for (const f of readdirSync(目录).sort()) {
      if (!f.toLowerCase().endsWith('.md')) continue
      try {
        const s = statSync(join(目录, f))
        串 += f + ':' + s.mtimeMs + ':' + s.size + ';'
      } catch {}
    }
  } catch {}
  return 串
}

/** 共享词桥：两颗星提到同一个少见的词（比如某个地名）就牵一根线。
 *  只连「不太常见」的词 —— 到处都是的词（她、我、我们）连不出意义，反而糊一片。 */
export function 造共享桥(星们, 上限 = 400) {
  const 词表 = new Map()   // 词 -> [星索引]
  const 拆词 = (文) => {
    const 出 = new Set()
    const 字串 = String(文 || '').replace(/[^\u4e00-\u9fa5]/g, ' ')
    for (const 段 of 字串.split(/\s+/)) {
      if (段.length < 2) continue
      // 2~4 字的词：中文没有空格，靠固定窗口切
      for (let 长 = 3; 长 <= 4; 长++) {
        for (let i = 0; i + 长 <= 段.length; i++) 出.add(段.slice(i, i + 长))
      }
    }
    return 出
  }
  for (let i = 0; i < 星们.length; i++) {
    const s = 星们[i]
    if (s.kind !== 'card') continue
    const 词们 = 拆词(String(s.title || '') + ' ' + String(s.text || ''))
    for (const w of 词们) {
      if (!词表.has(w)) 词表.set(w, [])
      词表.get(w).push(i)
    }
  }
  const 桥 = []
  const 连过 = new Set()   // 同一对星只连一次（不然一堆重叠的词会连出十几根）
  // 越少见的词越有意义：先连只有两颗星提到的，再连三颗的
  const 候选 = [...词表.entries()]
    .filter(([w, ids]) => ids.length >= 2 && ids.length <= 5 && w.length >= 3)
    .sort((a, b) => a[1].length - b[1].length)
  for (const [w, idxs] of 候选) {
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const 键 = idxs[a] + '-' + idxs[b]
        if (连过.has(键)) continue
        连过.add(键)
        桥.push({ a: idxs[a], b: idxs[b], 词: w })
        if (桥.length >= 上限) return 桥
      }
    }
  }
  return 桥
}

export function 出图(会话id, 活们 = []) {
  const 存的 = 读存配置()
  // ⭐ 0.2.2：**先算签名、先查缓存**。
  //   以前缓存比对放在「扫档案、造线、造桥」后面 —— 命中也要把重活白做一遍（实测 ~200ms，
  //   而且这段是同步的，会把宿主线程卡住）。现在命中就直接返回，一点都不算。
  let 快键 = ''
  try {
    if (会话id === '__本机__') {
      let 字节 = 0
      for (const p of [存的.记忆卡, 存的.日记]) {
        if (!p) continue
        try {
          字节 += statSync(p).size
        } catch (e) {}
      }
      快键 = '__本机__|' + (存的.记忆卡 || '') + '|' + (存的.日记 || '') + '|' + 字节
    } else if (会话id) {
      const 夹 = String((存的.绑定 || {})[会话id] || join(档案根, 会话id))
      快键 = String(会话id) + '|' + 文件签名们(夹)
    }
  } catch (e) {
    快键 = ''
  }
  const 快旧 = 缓存.get(会话id)
  if (快键 && 快旧 && (快旧.快键 === 快键 || 快旧.键 === 快键) && Date.now() - 快旧.时 < 缓存毫秒) {
    return 快旧.图
  }
  const 列表 = 列会话(活们)
  // ⚠ 找不到就**别退回第一个**：那样会拿别人的图冒充，问题被藏起来（她看到「有星」其实不是这个会话）
  const 这项 = 列表.find((x) => x.id === 会话id) || null
  // 直接问「本机」时，本机可能已经并进某个会话了 → 造一个临时的本机项
  const 当本机 = 会话id === '__本机__' && !这项

  let 键 = ''
  let 结果 = { 星: [], 缺: [], 文件数: 0 }
  let 中心 = ''
  if ((这项 && (这项.本机 || 这项.id === '__本机__')) || 当本机) {
    中心 = 这项 && 这项.本机 && 这项.id !== '__本机__' ? 这项.名 : 存的.中心 || (这项 && 这项.名) || '本机档案'
    键 = '__本机__' + '|' + (存的.记忆卡 || '') + '|' + (存的.日记 || '')
    let 字节 = 0
    for (const p of [存的.记忆卡, 存的.日记]) {
      if (!p) continue
      try {
        字节 += statSync(p).size
      } catch {}
    }
    键 += '|' + 字节
    const 星 = []
    let 文件数 = 0
    // 记忆卡：一本（八章按 ### 拆成星）
    if (存的.记忆卡 && existsSync(存的.记忆卡)) {
      星.push(...解析一个文件(存的.记忆卡, '记忆卡'))
      文件数++
    }
    // 日记：**可能是一个文件夹**（一天一个文件），也可能还是老的单文件
    if (存的.日记 && existsSync(存的.日记)) {
      let 是夹 = false
      try {
        是夹 = statSync(存的.日记).isDirectory()
      } catch {}
      if (是夹) {
        let 们 = []
        try {
          们 = readdirSync(存的.日记).filter((f) => /\.md$/i.test(f)).sort()
        } catch {}
        for (const f of 们) {
          try {
            星.push(...解析一个文件(join(存的.日记, f), basename(f, '.md')))
            文件数++
          } catch {}
        }
      } else {
        星.push(...解析一个文件(存的.日记, '日记'))
        文件数++
      }
    }
    结果 = { 星, 缺: 星.length ? [] : ['那两个文件没读到'], 文件数, 桥: 造共享桥(星, 300) }
  } else if (这项) {
    中心 = 这项.名
    键 = 这项.id + '|' + 文件签名们(这项.目录)
    结果 = 扫档案文件夹(这项.目录)
  }

  const 旧 = 缓存.get(会话id)
  if (旧 && 旧.键 === 键 && Date.now() - 旧.时 < 缓存毫秒) return 旧.图

  for (const s of 结果.星) {
    const 事件日 = 认事件日期(s)
    if (事件日) s.事件日 = 事件日
  }

  const 线 = 造线(结果.星)
  const 日们 = 结果.星.filter((s) => s.kind === 'diary').sort((a, b) => (a.date < b.date ? -1 : 1))
  日们.forEach((s, i) => {
    s.序 = i
  })

  const 图 = {
    会话: 这项 ? 这项.id : '',
    中心: 中心 || (这项 ? 这项.名 : '档案'),
    空: !结果.星.length,
    缺: 结果.缺 || [],
    文件数: 结果.文件数 || 0,
    星: 结果.星,
    线,
    // ⚠ 共享桥原来只在本机档案那条分支算了，文件夹式会话一个都没有（实测：一个两千根、一个两根）
    //   统一在这里补：不管哪条路，都给算一遍。
    桥: 结果.桥 && 结果.桥.length ? 结果.桥 : 造共享桥(结果.星, 300),
    统计: {
      星: 结果.星.length,
      卡: 结果.星.filter((s) => s.kind === 'card').length,
      日: 日们.length,
      线: 线.length,
      第一天: 日们.length ? 日们[0].date : '',
      最后一天: 日们.length ? 日们[日们.length - 1].date : '',
    },
    算于: Date.now(),
  }
  缓存.set(这项 ? 这项.id : '', { 键, 快键: 快键 || 键, 时: Date.now(), 图 })
  return 图
}

// ═══════════════════════════════════════════════════════
// 路由
// ═══════════════════════════════════════════════════════

function 回JSON(res, 值, 状态 = 200) {
  const 体 = JSON.stringify(值)
  res.writeHead(状态, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(体),
  })
  res.end(体)
}

export function apply(ctx, 配置 = {}) {
  全局ctx = ctx
  const 连接 = typeof ctx.get === 'function' ? ctx.get('connection') : undefined
  const 会话服务 = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
  const 标题服务 = typeof ctx.get === 'function' ? ctx.get('sessionTitle') : undefined
  const 模型服务 = typeof ctx.get === 'function' ? ctx.get('llm') : undefined
  const 默认模型 = typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined
  const 代理服务 = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  const 选目录服务 = typeof ctx.get === 'function' ? ctx.get('directoryPickerController') : undefined

  /** DSH 里能用的模型（照抄鱼的记忆里那套：listProviders + listModels） */
  async function 列模型() {
    const 出 = { providers: [], 选中的: 读存配置().模型 || null, 默认: null }
    try {
      const d = 默认模型 && typeof 默认模型.currentSelection === 'function' ? 默认模型.currentSelection() : null
      if (d && d.provider && d.model) 出.默认 = { provider: d.provider, model: d.model }
    } catch {}
    try {
      const ps = (模型服务 && typeof 模型服务.listProviders === 'function' ? 模型服务.listProviders() : []) || []
      for (const p of ps) {
        const 条 = { id: p.id, name: p.name || p.id, models: [] }
        try {
          const ms = (await 模型服务.listModels(p.id)) || []
          for (const m of ms) 条.models.push({ id: m.id, name: m.name || m.id })
        } catch (e) {
          条.错误 = String((e && e.message) || e)
        }
        出.providers.push(条)
      }
    } catch (e) {
      出.错 = String((e && e.message) || e)
    }
    return 出
  }

  
/** 活着的会话 → {id, 头, 标题} */
  // 磁盘上所有会话 ∪ 活着的会话（活着的标题更准，用它覆盖）
  const 活会话们 = () => {
    const 盘 = 扫全部会话(ctx)
    const 活 = new Map()
    try {
      const 列 = 会话服务 && typeof 会话服务.list === 'function' ? 会话服务.list() : []
      for (const s of 列 || []) {
        let 标题 = ''
        try {
          const 快照 = 标题服务 && typeof 标题服务.get === 'function' ? 标题服务.get(s) : undefined
          标题 = (快照 && 快照.title) || ''
        } catch {}
        活.set(s.id, { 头: s.header, 标题 })
      }
    } catch {}
    const 出 = 盘.map((x) => {
      const a = 活.get(x.id)
      活.delete(x.id)
      return { id: x.id, 头: (a && a.头) || x.头, 标题: (a && a.标题) || x.标题 }
    })
    // ⚠ 还开着但**已经归档**的会话也要藏起来 —— 以前这里直接补回去，所以
    //   「归档了还在列表里」（用户实测）。磁盘那半过滤了，活着的这半也得过滤。
    let 归档 = new Set()
    try {
      归档 = 读工作区状态(ctx).归档
    } catch {}
    for (const [id, v] of 活) {
      if (归档.has(id)) continue
      出.push({ id, 头: v.头, 标题: v.标题 })
    }
    return 出
  }
  try {
    mkdirSync(档案根, { recursive: true })
  } catch {}



  // ═══════════════════════════════════════════════════════
  // 日记定时（跟「到点自动搭话」同一个机制）
  //   到点 → 往绑定的会话递一句话 → 它自己写；
  //   它没写（或没有写文件的工具）→ 插件从它的回复里收「文件块」自己落盘。
  // ═══════════════════════════════════════════════════════
  // ⭐ 0.2.1：写日记改成**按会话**管 —— 每个会话自己开、自己定时、写进自己的档案夹。
  //   以前是一份全局设置（开/时/分/会话），开一次等于替所有会话开。
  const 日记已跑 = new Set()      // `${会话}|${日期}`

  const 昨天串 = (日) => {
    try {
      return new Date(Date.parse(String(日) + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
    } catch (e) {
      return ''
    }
  }
  const 今天串 = () => {
    const d = new Date()
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  /**
   * ⭐ 0.2.4：「今天已经发过」要落盘。
   *   以前这个记号只活在内存的 Set 里 —— 插件一重载（热更新、重启挂载）
   *   就全忘了，同一天晚上会再提醒一次。现在记进配置的 `定时.已发`。
   */
  const 已发表 = (w) => (w && w.已发 && typeof w.已发 === 'object' ? w.已发 : {})
  const 读定时已发 = (sid) => {
    try {
      const w = 读存配置().定时 || {}
      const 已 = 已发表(w)
      return String(已[String(sid)] || '')
    } catch (e) {
      return ''
    }
  }
  const 写定时已发 = (sid, 日) => {
    try {
      const w = 读存配置().定时 || {}
      const 已 = { ...已发表(w) }
      for (const k of Object.keys(已)) if (已[k] !== 日) delete 已[k]   // 过期的不留，配置别越长越大
      已[String(sid)] = 日
      存配置({ 定时: { ...w, 已发: 已 } })
    } catch (e) {}
  }
  const 清定时已发 = (sid) => {
    try {
      const w = 读存配置().定时 || {}
      const 已 = { ...已发表(w) }
      delete 已[String(sid)]
      存配置({ 定时: { ...w, 已发: 已 } })
    } catch (e) {}
  }

  /**
   * ⭐ 0.2.2：一个会话一份「定时」，三个开关：
   *   · 只更新记忆卡  —— 到点让拾星只写记忆卡
   *   · 写日记        —— 到点**提醒这个会话自己**写日记（提醒，不是代写）
   *   · 更新记忆卡 + 写日记 —— 到点让拾星连日记一起写（AI 写）
   *   前面两个跟第三个互斥：上面是「你自己写」，下面是「AI 写」。
   */
  const 读定时设置 = (会话id) => {
    const 存 = 读存配置()
    const w = 存.定时 || {}
    const 各 = w.各 && typeof w.各 === 'object' ? w.各 : {}
    const 本 = (会话id && 各[String(会话id)]) || {}
    return {
      时: Math.max(0, Math.min(23, Number(本.时 ?? 23))),
      分: Math.max(0, Math.min(59, Number(本.分 ?? 30))),
      // 老字段（只卡 / 提醒日记 / 连日记）往新字段上迁
      自己: 本.自己 !== undefined ? Boolean(本.自己) : Boolean(本.只卡) || Boolean(本.提醒日记),
      星汐: 本.星汐 !== undefined ? Boolean(本.星汐) : Boolean(本.连日记),
    }
  }

  const 造日记提示词 = (文件夹, 日, 条数 = 0) => [
    '到点了，今天的档案自己整理一下。',
    ...(条数 ? ['今天的原始对话已经存了一份：' + join(文件夹, '原始对话', 日 + '.txt') + '（' + 条数 + ' 条）'] : []),
    '',
    '日记：' + join(文件夹, '日记', 日 + '.md') + '（一天一个，只写今天）',
    '记忆卡：' + join(文件夹, '记忆卡.md') + '（今天值得留的，加到对应章里）',
    '',
    '写多少都行，不用跟我汇报。',
  ].join(String.fromCharCode(10))

  /** 把某一天的原始对话落到 原始对话/<日>.txt（有就追加）—— 两种拾星都要留这一份 */
  const 存原始对话 = (文件夹, 会话id, 日) => {
    try {
      const 源 = 找源会话(文件夹) || 会话id
      if (!源 || !日) return 0
      const 切 = 按天切(源, 昨天串(日))
      const 段 = (切.料 || []).find((x) => x[0] === 日)
      if (!段 || !段[1] || !段[1].length) return 0
      const 文 = 那天成文(日, 段[1])
      const 夹 = join(文件夹, '原始对话')
      mkdirSync(夹, { recursive: true })
      const 路 = join(夹, 日 + '.txt')
      if (!existsSync(路)) writeFileSync(路, 文, 'utf8')
      else {
        const 旧 = readFileSync(路, 'utf8')
        const 头 = 文.slice(0, 200)
        if (!旧.includes(头)) appendFileSync(路, String.fromCharCode(10) + '── 之后 ──' + String.fromCharCode(10) + 文, 'utf8')
      }
      记一笔('存原始对话：' + 日 + '（' + 段[1].length + ' 条）')
      return 段[1].length
    } catch (e) {
      记一笔('存原始对话失败：' + String((e && e.message) || e))
      return 0
    }
  }

  /** 到点后：派话 + 看它的日志把文件块收下来 */
  const 跑日记 = async (文件夹, 会话id, 日) => {
    const agent = 代理服务 && 代理服务.get && 代理服务.get(会话id)
    if (!agent || typeof agent.followup !== 'function') {
      记一笔('写日记：会话没醒着（' + 会话id.slice(0, 20) + '），今天跳过')
      return
    }
    const 条数 = 存原始对话(文件夹, 会话id, 日)
    记一笔('写日记：往会话递话 ' + 会话id.slice(0, 20))
    try {
      await agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: 造日记提示词(文件夹, 日, 条数) }],
        source: { kind: 'plugin:xingxi-diary' },
      })
    } catch (e) {
      记一笔('写日记：递话失败 ' + String((e && e.message) || e))
      return
    }

    // 没有兜底：它自己会写就写，不会写就是没写（不做「插件替它落盘」那一套）
  }

  const 查定时 = () => {
    const d = new Date()
    const 现在 = d.getHours() * 60 + d.getMinutes()
    const 日 = 今天串()
    const 夹们 = new Map()
    const 名们 = new Map()
    try {
      const 绑 = 读存配置().绑定 || {}
      for (const [k, v] of Object.entries(绑)) if (k && v) 夹们.set(String(k), String(v))
    } catch (e) {}
    try {
      for (const x of 列会话(活会话们())) {
        if (!x || !x.id || !x.目录) continue
        if (!夹们.has(String(x.id))) 夹们.set(String(x.id), String(x.目录))
        名们.set(String(x.id), x.名 || '')
      }
    } catch (e) {}
    for (const [会话id, 文件夹] of 夹们) {
      if (!文件夹) continue
      const 设 = 读定时设置(会话id)
      if (!设.自己 && !设.星汐) continue
      if (现在 < 设.时 * 60 + 设.分) continue
      const 键 = 会话id + '|' + 日
      if (日记已跑.has(键)) continue
      if (读定时已发(会话id) === 日) {
        日记已跑.add(键)      // 落盘记号说今天发过了（多半是重载前发的）—— 不再发
        continue
      }
      日记已跑.add(键)
      写定时已发(会话id, 日)
      // ① 提醒它自己写日记（不是代写）
      if (设.自己) {
        跑日记(文件夹, 会话id, 日).catch(() => {})
      }
      // ② 让拾星去做（只卡 / 卡+日记），跟手动点「拾星」走同一条路
      if (设.星汐) {
        try {
          派一批({ id: 会话id, 目录: 文件夹, 名: 名们.get(会话id) || '' }, { 只今天: true, 写日记: true })
            .then((r) => 记一笔('定时拾星：' + (r && r.ok ? '派好了' : '没派：' + (r && r.原因))))
            .catch((e) => 记一笔('定时拾星失败：' + String((e && e.message) || e)))
        } catch (e) {
          记一笔('定时拾星异常：' + String((e && e.message) || e))
        }
      }
    }
  }

  // 每分钟看一次（跟刷B站那套一样，别指望整点）
  try {
    const 定时服务 = typeof ctx.get === 'function' ? ctx.get('timer') : undefined
    if (定时服务 && typeof 定时服务.repeat === 'function') {
      ctx.effect(() => 定时服务.repeat(查定时, 60 * 1000))
    } else {
      const t = setInterval(查定时, 60 * 1000)
      ctx.effect(() => () => clearInterval(t))
    }
    记一笔('定时已挂（每分钟查一次：提醒写日记 / 拾星）')
  } catch (e) {
    记一笔('日记定时挂不上：' + String((e && e.message) || e))
  }

  // ═══════════════════════════════════════════════════════
  // /xixing 指令 + 「星汐读」工具
  //   ⚠ 全部档案有五六万 token，不可能每次全塞进上下文。
  //     所以分两层：**指令给索引**（有哪些分支、每支前几条、最近几天日记），
  //     **工具给正文**（想细看哪一段，自己去读那一段）。
  // ═══════════════════════════════════════════════════════

  /** 本机档案（设置里填的那两个）：支持「一个文件」也支持「一个文件夹」 */
  const 本机文件 = () => {
    const 存 = 读存配置()
    const 出 = []
    const 加 = (p, 前缀) => {
      if (!p || !existsSync(p)) return
      let st = null
      try {
        st = statSync(p)
      } catch {
        return
      }
      if (st.isDirectory()) {
        // ⚠ 日记特别容易填成文件夹：一个目录直接 readFileSync 会报错，
        //   结果就是「日记永远读不到」（用户实测踩过）
        let 们 = []
        try {
          们 = readdirSync(p).filter((f) => /\.(md|txt)$/i.test(f)).sort()
        } catch {}
        for (const f of 们) 出.push({ 名: 前缀 + basename(f).replace(/\.(md|txt)$/i, ''), 路: join(p, f) })
        return
      }
      if (!/\.(md|txt)$/i.test(p)) return
      出.push({ 名: 前缀 + basename(p).replace(/\.(md|txt)$/i, ''), 路: p })
    }
    加(存.记忆卡, '')
    加(存.日记, '日记/')
    return 出
  }

  /** 把工具上下文里的会话 id 抠出来（不同版本给的位置不一样） */
  const 取会话id = (exec) => {
    if (!exec) return ''
    // DSH 的工具上下文是 agent: { id }（ToolRunContext），**没有 sessionId 这个字段**
    // （老代码读 exec.sessionId → 永远是空 → 绑定全查不到，这就是用户报的那个 bug）
    // ⭐ 0.1.9：不同版本 / 不同宿主给的东西不一样，能想到的都试一遍。
    const 取 = (o, k) => {
      try {
        const v = o && o[k]
        return v == null ? '' : String(v).trim()
      } catch (e) {
        return ''
      }
    }
    const 候选 = [
      取(exec.agent, 'id'),
      取(exec.agent && exec.agent.session, 'id'),
      取(exec.agent, 'sessionId'),
      取(exec, 'agentId'),
      取(exec, 'sessionId'),
      取(exec.session, 'id'),
      取(exec.runContext && exec.runContext.agent, 'id'),
      取(exec.context && exec.context.agent, 'id'),
      取(exec, 'id'),
    ]
    for (const c of 候选) if (c) return c
    // 还是空的：把看到的键记下来（下次报告能直接说清是哪儿来的空）
    try {
      记一笔('取会话id 失败：exec 的键 = ' + Object.keys(exec || {}).join(',') +
        ' ｜agent 的键 = ' + Object.keys((exec && exec.agent) || {}).join(','))
    } catch (e) {}
    return ''
  }

  /** 在绑定表里找这个会话的文件夹：带不带 session- 前缀都认 */
  const 找绑定夹 = (sid) => {
    if (!sid) return ''
    let 绑 = {}
    try {
      绑 = 读存配置().绑定 || {}
    } catch {}
    if (绑[sid]) return String(绑[sid])
    const 裸 = String(sid).replace(/^session-/, '')
    for (const [k, v] of Object.entries(绑)) {
      const kk = String(k)
      if (kk === sid) return String(v)
      if (kk.replace(/^session-/, '') === 裸) return String(v)
    }
    return ''
  }

  /** 某个会话的档案文件夹（列表里找 → 绑定表兜底） */
  const 会话文件夹 = (sid) => {
    if (!sid) return ''
    try {
      const 项 = 列会话(活会话们()).find((x) => x.id === sid)
      if (项 && 项.目录 && existsSync(项.目录)) return 项.目录
    } catch {}
    const 绑 = 找绑定夹(sid)
    return 绑 && existsSync(绑) ? 绑 : ''
  }


  /** 档案里的所有 md：会话绑了文件夹就只读它，没绑才读本机那两份 */
  const 所有档案 = (sid) => {
    const 出 = []
    const 夹 = 会话文件夹(sid)
    // 没有自己的文件夹 → 用本机档案（这时本机文件已经带好 日记/ 前缀了）
    if (!夹 || !existsSync(夹)) {
      for (const f of 本机文件()) {
        try {
          出.push({ 名: f.名, 路: f.路, 文: readFileSync(f.路, 'utf8') })
        } catch {}
      }
      return 出
    }
    const 走 = (目录, 前缀) => {
      let 项们 = []
      try {
        项们 = readdirSync(目录, { withFileTypes: true })
      } catch {
        return
      }
      for (const d of 项们) {
        if (d.isDirectory()) {
          if (/^(\.|备份|备注)/.test(d.name)) continue
          走(join(目录, d.name), (前缀 ? 前缀 + '/' : '') + d.name)
          continue
        }
        if (!/\.(md|txt)$/i.test(d.name)) continue
        try {
          出.push({
            名: (前缀 ? 前缀 + '/' : '') + basename(d.name, '.md'),
            路: join(目录, d.name),
            文: readFileSync(join(目录, d.name), 'utf8'),
          })
        } catch {}
      }
    }
    走(夹, '')
    return 出
  }

  /** 这个会话自己的档案长什么样：
   *  · 记忆卡：文件夹根下名字里带「记忆卡」的 md（每个人起名不一样）
   *  · 日记：文件夹里「日记」子目录，取最近 N 个
   *  都找不到才退回「本机档案」的配置。
   *  ⚠ 以前这里直接读全局配置的记忆卡路径，等于把大肥鱼那份塞给所有人。 */
  const 本会话的档案 = (sid, 天 = 3) => {
    let 夹 = ''
    try {
      夹 = 会话文件夹(sid)
    } catch {}
    if (!夹 || !existsSync(夹)) {
      try {
        const 绑 = 读存配置().绑定 || {}
        if (绑[sid] && existsSync(绑[sid])) 夹 = String(绑[sid])
      } catch {}
    }

    let 卡路 = ''
    let 日们 = []
    if (夹 && existsSync(夹)) {
      // 记忆卡：根目录里文件名含「记忆卡」的；没有就找带「卡」的 md；再没有找唯一的 md
      try {
        const 根文件 = readdirSync(夹, { withFileTypes: true }).filter((d) => d.isFile() && /\.md$/i.test(d.name))
        const 卡 = 根文件.find((d) => d.name.includes('记忆卡')) || 根文件.find((d) => d.name.includes('卡'))
        if (卡) 卡路 = join(夹, 卡.name)
        else if (根文件.length === 1) 卡路 = join(夹, 根文件[0].name)
      } catch {}
      // 日记：日记/ 子目录里最近 N 个
      try {
        const 日夹 = join(夹, '日记')
        if (existsSync(日夹)) {
          日们 = readdirSync(日夹)
            .filter((f) => /\.md$/i.test(f))
            .sort()
            .slice(-天)
            .map((f) => join(日夹, f))
        }
      } catch {}
    }

    // 退回本机档案（只在会话没绑文件夹、或者文件夹里确实什么都没有时用）
    if (!卡路 && !日们.length) {
      const 存 = 读存配置()
      卡路 = String(存.记忆卡 || '')
      // ⚠ 本机「日记」很可能是**一个文件夹**：直接当文件读会失败，日记就永远进不来
      日们 = 近几天日记文件(天)
      return { 夹, 卡路, 日们, 退的: true }
    }
    return { 夹, 卡路, 日们, 退的: false }
  }

  /** 索引：每个文件的第一行「这一篇讲什么」+ 前几条标题 */
  const 造索引 = (sid) => {
    const 档 = 所有档案(sid)
    if (!档.length) return '（还没有档案。先在星坊里定好文件夹，或者用拾星整理一次。）'
    const 行 = ['【星汐·档案索引】', '']
    for (const f of 档) {
      const 全行 = f.文.split('\n')
      const 首 = (全行.find((l) => l.trim()) || '').replace(/^#+\s*/, '').trim().slice(0, 40)
      行.push('· ' + f.名 + (首 ? ' — ' + 首 : ''))
      const 条 = 全行.filter((l) => /^#{2,4}\s|^-\s\*\*/.test(l)).slice(0, 4)
      for (const t of 条) 行.push('    ' + t.trim().slice(0, 34))
      if (条.length) 行.push('    …共 ' + f.文.length + ' 字')
    }
    行.push('', '想看正文就用「星汐读」工具：给它文件名（或关键词 / 日期），它把那一段原文取出来。')
    return 行.join('\n')
  }

  /** 最近 N 天的日记（只挑有的） */
  const 近日记 = (sid, 天 = 3) => {
    const 档 = 所有档案(sid)
    const 日 = 档.filter((f) => /日记|星历/.test(f.名))
    if (!日.length) return ''
    const 段 = []
    for (const f of 日) {
      const 行 = f.文.split('\n')
      const 命中 = []
      for (let i = 0; i < 行.length; i++) {
        const m = /^#{2,3}\s*(\d{4})-(\d{2})-(\d{2})/.exec(行[i].trim()) || /^-\s*\*\*(\d{2})-(\d{2})\*\*/.exec(行[i].trim())
        if (m) 命中.push(i)
      }
      for (const i of 命中.slice(-天)) {
        const 块 = []
        for (let k = i; k < Math.min(i + 40, 行.length); k++) {
          if (k > i && /^#{2,3}\s/.test(行[k].trim())) break
          块.push(行[k])
        }
        段.push(块.join('\n').trim())
      }
    }
    return 段.slice(-天 * 2).join('\n\n')
  }

  /** 一本日记里最后 N 天（两种写法都认：- **MM-DD**：… 和 ## YYYY-MM-DD） */
  const 取近几天 = (文本, 天 = 3) => {
    const 行 = String(文本 || '').split(String.fromCharCode(10))
    const 起点 = []
    for (let i = 0; i < 行.length; i++) {
      const t = 行[i].trim()
      if (/^-\s*\*\*\d\d-\d\d\*\*/.test(t) || /^#{2,3}\s*\d{4}-\d\d-\d\d/.test(t)) 起点.push(i)
    }
    if (!起点.length) return String(文本 || '').slice(-3000)
    const 出 = []
    for (const i of 起点.slice(-天)) {
      const 块 = [行[i]]
      for (let k = i + 1; k < 行.length; k++) {
        if (k > i && (起点.includes(k) || /^#{2,3}\s/.test(行[k].trim()))) break
        块.push(行[k])
      }
      出.push(块.join(String.fromCharCode(10)).trim())
    }
    return 出.join(String.fromCharCode(10, 10))
  }

  /** 最近几天的日记**文件**：
   *    · 日记是文件夹 → 取里面最后 N 个 YYYY-MM-DD.md
   *    · 日记是单个文件 → 就那一个（老格式）
   */
  const 近几天日记文件 = (天 = 3) => {
    const 存 = 读存配置()
    const 路 = String(存.日记 || '')
    if (!路) return []
    try {
      if (existsSync(路) && statSync(路).isDirectory()) {
        const 们 = readdirSync(路)
          .filter((f) => /\.md$/i.test(f))
          .sort()
        return 们.slice(-天).map((f) => join(路, f))
      }
    } catch {}
    return existsSync(路) ? [路] : []
  }

  // ── 工具一：xingxi（通读记忆卡）────────────────────────
  //   用途：**每次上下文被压缩之后**，让它把记忆卡从头到尾读一遍。
  //   整本一起读、不拆文件（拆成好几篇它反而不会读全）。
  try {
    const 工具服务 = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
    if (工具服务 && typeof 工具服务.register === 'function') {
      工具服务.register({
        name: 'xingxi',
        description:
          '通读记忆卡：**一次**把整本记忆卡从头到尾读完（不分段，不用翻页）。' +
          '上下文被压缩之后用这个，读完就知道该记得什么了。',
        // ⚠ parameters 必须是**完整 JSON Schema**（根上要有 type: 'object'），
        //   不能写成 `{}`、也不能直接给属性表 —— Trae 那类上游会对整包工具做校验，
        //   一条不合格就整轮请求被拒（别的上游不校验，所以就它出问题）。
        parameters: { type: 'object', additionalProperties: false, properties: {} },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { ok: { type: 'boolean' }, text: { type: 'string' } },
          },
          render(_a, v) {
            return [{ type: 'text', text: String((v && v.text) || '').slice(0, 800) }]
          },
        },
        async execute(_a, exec) {
          const sid = 取会话id(exec)
          // ⚠ 拿不到当前会话 id 时**不许去读本机那两份** —— 那可能是另一个人的档案
          if (!sid) return { ok: false, text: '拿不到当前会话的 id，所以不知道该读哪一份档案。请先重载一次星汐；还这样的话，把这条原话告诉作者。' }
          const 档 = 本会话的档案(sid)
          const 有卡 = 档.卡路 && existsSync(档.卡路)
          if (!有卡) {
            记一笔('xingxi 取不到记忆卡：sid=' + sid + ' 夹=' + (档.夹 || '无') + ' 卡=' + (档.卡路 || '无'))
            return {
              ok: false,
              text: 档.夹
                ? '文件夹里没找到记忆卡：' + 档.夹 + '（看根下有没有文件名带「记忆卡」的 .md）'
                : '这个会话还没指定文件夹（星坊 → 现在这个会话 → 选…）',
            }
          }
          const 全文 = readFileSync(档.卡路, 'utf8')
          return { ok: true, text: 查重章(全文) + 全文 }
        },
      })
      记一笔('工具 xingxi 挂上了（通读记忆卡）')
    }
  } catch (e) {
    记一笔('工具 xingxi 挂载失败：' + String((e && e.message) || e))
  }

  // ── 工具二：xingxi_read（检索）────────────────────────
  //   用途：想不起某件事（哪天、原话、细节）时，去档案里把那一小段找出来。
  try {
    const 工具服务2 = typeof ctx.get === 'function' ? ctx.get('tools') : undefined
    if (工具服务2 && typeof 工具服务2.register === 'function') {
      工具服务2.register({
        name: 'xingxi_read',
        description:
          '检索档案：想不起某件事（日期、原话、细节）时用它把那一段原文找出来，别猜。' +
          '可以给关键词、给日期、或者给文件名。日记是**按天分开**的，所以按日期检索最准。',
        // ⚠ 完整 JSON Schema（根上要有 type: 'object' + properties），
        //   以前直接把属性表当 parameters 递上去，根节点没有 type。
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            关键词: { type: 'string', description: '要搜的词，比如「卖号」「第一次」' },
            日期: { type: 'string', description: 'YYYY-MM-DD，查日记用（也认 11-03 这种）' },
            文件: { type: 'string', description: '文件名或它的一部分' },
            最多字: { type: 'number', description: '最多返回多少字，默认 4000' },
          },
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { ok: { type: 'boolean' }, text: { type: 'string' } },
          },
          render(_a, v) {
            return [{ type: 'text', text: String((v && v.text) || '').slice(0, 1000) }]
          },
        },
        async execute(args, exec) {
          try {
            const sid = 取会话id(exec)
            if (!sid) return { ok: false, text: '拿不到当前会话的 id，所以不知道该读哪一份档案。请先重载一次星汐；还这样的话，把这条原话告诉作者。' }
            const 档 = 所有档案(sid)
            const 限 = Math.max(600, Math.min(20000, Number((args && args.最多字) || 4000)))
            const 词 = String((args && args.关键词) || '').trim()
            const 日 = String((args && args.日期) || '').trim()
            const 名 = String((args && args.文件) || '').trim()

            if (!档.length) {
              const 夹 = 会话文件夹(sid)
              if (!夹) {
                return { ok: false, text: '这个会话还没指定文件夹（星坊 → 现在这个会话 → 选…）。没绑定也读不到本机档案。' }
              }
              return { ok: false, text: '文件夹已绑定（' + 夹 + '），但里面没找到能读的 .md / .txt 文件' }
            }

            // 把文件按「一类一份」归拢，方便说清楚有什么
            const 分组 = { 记忆卡: [], 日记: [], 原始对话: [], 其他: [] }
            for (const f of 档) {
              if (/^日记\//.test(f.名)) 分组.日记.push(f)
              else if (/^原始对话\//.test(f.名)) 分组.原始对话.push(f)
              else if (/记忆卡/.test(f.名)) 分组.记忆卡.push(f)
              else 分组.其他.push(f)
            }
            const 日期们 = 分组.日记.map((f) => (/(\d{4}-\d{2}-\d{2})/.exec(f.名) || [])[1]).filter(Boolean).sort()

            // ── 0. 什么都不给：给索引（在外面先看清有什么，再决定钻哪一天）──
            if (!词 && !日 && !名) {
              const 行们 = ['这个档案里有 ' + 档.length + ' 个文件：', '']
              for (const f of 分组.记忆卡) {
                行们.push('· ' + f.名 + '（' + Math.round(f.文.length / 1000) / 10 + ' 万字）')
              }
              for (const f of 分组.其他) 行们.push('· ' + f.名 + '（' + f.文.length + ' 字）')
              if (日期们.length) {
                行们.push(
                  '· 日记 ' + 日期们.length + ' 天：' + 日期们[0] + ' ~ ' + 日期们[日期们.length - 1] + '（一天一个文件）',
                )
              }
              if (分组.原始对话.length) {
                const 原日 = 分组.原始对话
                  .map((f) => (/(\d{4}-\d{2}-\d{2})/.exec(f.名) || [])[1])
                  .filter(Boolean)
                  .sort()
                行们.push('· 原始对话 ' + 原日.length + ' 天：' + 原日[0] + ' ~ ' + 原日[原日.length - 1] + '（当天原话）')
              }
              行们.push('', '怎么查：给「关键词」全文搜（日记也会搜）；给「日期」看那一天；给「文件」看整篇。')
              return { ok: true, text: 行们.join(String.fromCharCode(10)) }
            }

            // ── 1. 日期：直接定位那一天的日记（不用挨个翻）──
            if (日) {
              const 短 = 日.length >= 10 ? 日.slice(5) : 日
              const 目标 = 档.filter((f) => f.名.includes(日) || f.名.includes(短))
              if (目标.length) {
                const 段 = 目标.slice(0, 3).map((f) => '【' + f.名 + '】' + String.fromCharCode(10) + f.文.slice(0, 限))
                return { ok: true, text: 段.join(String.fromCharCode(10, 10)).slice(0, 限) }
              }
              // 没有那天的文件 → 在全文里找那天的条目
              const 出 = []
              for (const f of 档) {
                const 行们 = f.文.split(String.fromCharCode(10))
                const 块 = []
                let 收 = false
                for (const l of 行们) {
                  const t = l.trim()
                  const 新条 = /^-\s*\*\*\d\d-\d\d/.test(t) || /^#{2,3}\s*\d{4}-\d{2}-\d{2}/.test(t)
                  if (新条) 收 = t.includes(短) || t.includes(日)
                  if (收) 块.push(l)
                }
                if (块.length) 出.push('【' + f.名 + '】' + String.fromCharCode(10) + 块.join(String.fromCharCode(10)))
              }
              if (出.length) return { ok: true, text: 出.join(String.fromCharCode(10, 10)).slice(0, 限) }
              return {
                ok: false,
                text: 日 + ' 没有记录。日记范围：' + (日期们.length ? 日期们[0] + ' ~ ' + 日期们[日期们.length - 1] : '没有日记'),
              }
            }

            // ── 2. 文件名：给整篇 ──
            if (名 && !词) {
              const 目标 = 档.filter((f) => f.名.includes(名) || f.路.includes(名))
              if (!目标.length) return { ok: false, text: '没有这个文件：' + 名 }
              const 段 = 目标.slice(0, 2).map((f) => '【' + f.名 + '】' + String.fromCharCode(10) + f.文.slice(0, 限))
              return { ok: true, text: 段.join(String.fromCharCode(10, 10)).slice(0, 限) }
            }

            // ── 3. 关键词：全文搜，**每个文件都看**，每个文件最多取 2 段 ──
            //   ⚠ 以前是按文件顺序扫、扫到预算用完就停 —— 记忆卡一大就把日记挤没了。
            const 命中 = []
            for (const f of 档) {
              const 行们 = f.文.split(String.fromCharCode(10))
              let 次 = 0
              const 段们 = []
              for (let i = 0; i < 行们.length; i++) {
                if (!行们[i].includes(词)) continue
                次++
                if (段们.length < 2) {
                  段们.push(行们.slice(Math.max(0, i - 2), Math.min(行们.length, i + 4)).join(String.fromCharCode(10)))
                }
              }
              if (次) 命中.push({ 名: f.名, 次, 段们 })
            }

            if (!命中.length) {
              记一笔('xingxi_read 没找到：sid=' + sid + ' 档=' + 档.length + ' 词=' + 词)
              return { ok: false, text: '档案里没有「' + 词 + '」（翻了 ' + 档.length + ' 个文件）' }
            }

            命中.sort((x, y) => y.次 - x.次)
            const 总次 = 命中.reduce((s, x) => s + x.次, 0)
            const 头 = '「' + 词 + '」在 ' + 命中.length + ' 个文件里出现 ' + 总次 + ' 次：'
            const 出 = [头]
            let 总 = 头.length
            for (const h of 命中) {
              const 段 = '【' + h.名 + '】（' + h.次 + ' 处）' + String.fromCharCode(10) + h.段们.join(String.fromCharCode(10, 10))
              if (总 + 段.length > 限) {
                出.push('…还有 ' + (命中.length - 出.length + 1) + ' 个文件也提到，想看就给「文件」参数点名')
                break
              }
              出.push(段)
              总 += 段.length
            }
            return { ok: true, text: 出.join(String.fromCharCode(10, 10)) }
          } catch (e) {
            return { ok: false, text: '检索失败：' + String((e && e.message) || e) }
          }
        },
      })
      记一笔('工具 xingxi_read 挂上了（检索）')
    }
  } catch (e) {
    记一笔('工具 xingxi_read 挂载失败：' + String((e && e.message) || e))
  }

  // ── 指令：/xingxi（不塞正文，只叫它去读）─────────────────
  try {
    const 指令服务 = typeof ctx.get === 'function' ? ctx.get('commands') : undefined
    if (指令服务 && typeof 指令服务.register === 'function') {
      ctx.effect(() =>
        指令服务.register({
          name: 'xingxi',
          description: '把档案递给它看一眼（压缩之后用）',
          handler: async (调用) => {
            try {
              const sid = String((调用 && 调用.agent && 调用.agent.id) || '')
              const agent = 代理服务 && 代理服务.get ? 代理服务.get(sid) : null
              if (!agent || typeof agent.followup !== 'function') {
                return { kind: 'error', text: '这个会话没醒着' }
              }
              const 存 = 读存配置()
              // ⭐ 读的是**这个会话自己文件夹里的**记忆卡和日记，不是全局配置里那份
              const 档 = 本会话的档案(sid, 3)
              const 提示 = [
                '这些东西是你自己的，翻一翻吧。',
                '',
                档.卡路 ? '记忆卡（整本）：' + 档.卡路 : '（这个文件夹里没找到记忆卡）',
                档.日们.length ? '最近几天的日记（一天一个文件）：' : '',
                ...档.日们.map((f) => '  · ' + f),
                '',
                '用 read 读，一次读不完往后翻就行（offset / limit）。',
              ].filter(Boolean).join(String.fromCharCode(10))
              记一笔('/xingxi：夹=' + (档.夹 || '无') + ' 卡=' + (档.卡路 || '无') + ' 日记=' + 档.日们.length + ' 个')
              await agent.followup({
                id: randomUUID(),
                role: 'user',
                content: [{ type: 'text', text: 提示 }],
                source: { kind: 'plugin:xingxi-inject' },
              })
              记一笔('/xingxi：已叫它通读记忆卡')
              return { kind: 'success', text: '档案递过去了' }
            } catch (e) {
              return { kind: 'error', text: '叫不动它：' + String((e && e.message) || e) }
            }
          },
        }),
      )
      记一笔('指令 /xingxi 挂上了')
    }
  } catch (e) {
    记一笔('指令挂载失败：' + String((e && e.message) || e))
}

  // ═══════════════════════════════════════════════════════
  // 拾星：**一天一批**，插件自己当调度器
  //   ⚠ 为什么不是「一次跑完」（2026-11-03 实测的教训）：
  //     · 一个会话塞 60 天，它读到第三天就不交了
  //     · 上下文越读越满，最后压缩，压缩完它就忘了还没干完
  //     · 落盘要等它「整轮交卷」，中途停了什么都留不下
  //   改成：一批只给它 1~2 天 → 交完立刻落盘 → 进度前进 → 自动派下一批
  //   上下文永远是小的，不会压缩，停了最多丢一天。
  // ═══════════════════════════════════════════════════════
  /** 删掉一个拾星工作会话的日志目录（不然重启又被扫出来变成「未命名」会话） */
  const 删工作会话 = (会话id) => {
    if (!会话id) return
    try {
      const 根 = join(homedir(), '.dsh', 'sessions')
      for (const ws of readdirSync(根)) {
        const 夹 = join(根, ws, 会话id)
        if (existsSync(夹)) {
          rmSync(夹, { recursive: true, force: true })
          记一笔('删掉工作会话 ' + 会话id.slice(0, 22))
        }
      }
    } catch (e) {
      记一笔('删工作会话失败：' + String((e && e.message) || e))
    }
  }

  /** 这个文件夹绑定的是哪个源会话（拾星自己开的工作会话不能当源） */
  const 源缓存 = new Map()
  const 找源会话 = (夹) => {
    // ⭐ 0.2.0：以前是「绑定表里第一个 session- 开头的」—— 绑定表里混着**拾星自己派出去的工人**，
    //   谁的目录对不上就能被选中，于是拿一个只有几条消息的空工人去切料（只切出一天）。
    //   还有一类真源是**裸 uuid**（插件建的会话），被 session- 前缀那条直接过滤掉了。
    //   现在的判据：先剔掉工人，再在剩下的里面挑**事件最多**的那个。
    try {
      const 绑 = 读存配置().绑定 || {}
      const 工人们 = new Set()
      const 收工人 = (路) => {
        try {
          for (const id of JSON.parse(readFileSync(路, 'utf8')) || []) if (id) 工人们.add(String(id))
        } catch (e) {}
      }
      收工人(join(档案根, '工人.json'))
      收工人(join(夹, '.拾星', '工人.json'))
      const 是工人 = (k) => 工人们.has(k) || 工人们.has('session-' + k) || 工人们.has(String(k).replace(/^session-/, ''))
      // 同一个文件夹 60 秒内算过就不再算（按天切要把整份日志读一遍，候选多的时候慢）
      const 缓 = 源缓存.get(夹)
      if (缓 && Date.now() - 缓.时 < 60000 && 缓.源) return 缓.源
      let 最好 = ''
      let 最好量 = -1
      for (const [k, v] of Object.entries(绑)) {
        if (String(v) !== String(夹)) continue
        const 键 = String(k || '')
        if (!键 || 是工人(键)) continue
        let 量 = 0
        try {
          量 = 按天切(键, '').全部事件
        } catch (e) {
          量 = 0
        }
        if (量 > 最好量) {
          最好量 = 量
          最好 = 键
        }
      }
      if (最好) {
        源缓存.set(夹, { 时: Date.now(), 源: 最好 })
        记一笔('找源会话：' + 夹 + ' → ' + 最好 + '（' + 最好量 + ' 条事件）')
        return 最好
      }
      记一笔('找源会话：' + 夹 + ' 没找到合适的源（绑定里有 ' + Object.keys(绑).length + ' 条，工人 ' + 工人们.size + ' 个）')
    } catch (e) {
      记一笔('找源会话出错：' + String((e && e.message) || e))
    }
    return ''
  }

  // 一批一天：料是**整段贴进消息**的，两天加起来可能十几万字，一天刚好
  const 批天数 = 1
  // 同一个文件夹两批之间至少隔这么久（一秒一批会把上下文和钱都烧掉；太久又会像卡住）
  const 节流毫秒 = 90 * 1000
  const 在跑 = new Map()   // 文件夹 → 开始时间

  /** 账本里记的水位（毫秒）：上次整理到哪个时间点之后 */
  const 读水位 = (文件夹) => {
    try {
      const 账 = JSON.parse(readFileSync(join(文件夹, '.xingxi.json'), 'utf8')) || {}
      return Number(账.已到 || 0) || 0
    } catch (e) {
      return 0
    }
  }

  const 派一批 = async (项, 选项 = {}) => {
    const 文件夹 = 项.目录
    const sid = 项.id
    if (!文件夹) return { ok: false, 原因: '这个会话还没有文件夹' }
    if (typeof 代理服务?.create !== 'function') return { ok: false, 原因: '这台 DSH 不支持新建会话' }
    try {
      mkdirSync(文件夹, { recursive: true })
    } catch (e) {
      return { ok: false, 原因: '建不了文件夹：' + String((e && e.message) || e) }
    }

    // ⭐ 刹车（2026-11-04）：以前每 60 秒一轮、每个没跑完的文件夹各派一个，
    //   进度一卡住就会一直开新会话（实测一分钟冒出八个，卸载都停不住，得重启）。
    //   三道闸：刚派过的不重复派 / 连续三次没进展就停 / 停下要人点「继续」才再派。
    const 任路 = join(文件夹, '.拾星', '任务.json')
    let 旧任 = {}
    try {
      旧任 = JSON.parse(readFileSync(任路, 'utf8')) || {}
    } catch {}
    // ⭐ 人亲手点的（拾星 / 补星）永远不算「已经停了」——那是给自动调度用的闸
    const 手动 = Boolean(选项.手动)
    if (旧任.暂停 && !手动) {
      return { ok: false, 原因: '自动停下了（连续 ' + (旧任.连续失败 || 0) + ' 次没进展）' }
    }
    if (手动 && (旧任.暂停 || 旧任.手动停)) {
      delete 旧任.暂停
      delete 旧任.手动停
      delete 旧任.暂停原因
      旧任.连续失败 = 0
      try {
        writeFileSync(任路, JSON.stringify(旧任, null, 2), 'utf8')
      } catch (e) {}
      记一笔('手动派：清掉暂停标记（' + 文件夹 + '）')
    }
    if (Number(旧任.连续失败 || 0) >= 3) {
      try {
        writeFileSync(任路, JSON.stringify({ ...旧任, 暂停: true, 暂停原因: '连续三次没进展' }, null, 2), 'utf8')
      } catch {}
      记一笔('拾星：' + 文件夹 + ' 连续三次没进展，自动停下（不再派）')
      return { ok: false, 原因: '连续三次没进展，已自动停下' }
    }
    // ⭐ 0.1.8：节流从「十分钟」改成「一分半」。
    //   十分钟那版是为了压住当年同时醒着的几十个调度器；现在只留一个 + 连续三次就停，
    //   再压十分钟的话，几十天的历史要跑一整夜（实测她那边跑完第一天就不动了）。
    if (旧任.上次派遣 && Date.now() - Number(旧任.上次派遣) < 节流毫秒) {
      return { ok: false, 原因: '刚派过（一分半内不重复派）' }
    }
    // ⭐ 进程内也只放一个：插件重载留下的旧调度器还醒着时，谁先到谁派，别人让开
    const 锁键 = Symbol.for('dsh-xingxi.派遣锁')
    if (Date.now() - Number(globalThis[锁键] || 0) < 30 * 1000) {
      return { ok: false, 原因: '刚派过（同一个进程 30 秒内只派一个）' }
    }
    // ⭐ 先占坑再开会话：「上次派遣」写在新建会话之前 ——
    //   别的调度器（或者重启后这一份）马上就能看到，不会再派第二次
    try {
      writeFileSync(任路, JSON.stringify({ ...旧任, 上次派遣: Date.now() }, null, 2), 'utf8')
    } catch {}
    globalThis[锁键] = Date.now()

    // ⚠ 读的必须是**绑定的那个源会话**。以前用 项.id（文件夹条目自己的 id），
    //   结果切出来的是「拾星刚开的那个空会话」，一天料都切不到（实测）。
    const 源 = 找源会话(文件夹) || sid
    const 已 = 算进度(文件夹)
    // ⭐ 0.2.2：补星 = 只切「水位之后」的内容（同一天的后半段也算得出来）
    const 补 = Boolean(选项.补)
    // ⭐ 0.2.2：定时 / 补星 **只处理今天** —— 不管前面积压多少天，永远只切当天那一段
    const 只今天 = Boolean(选项.只今天) || 补
    const 今天 = 今天串()
    const 昨天 = new Date(Date.parse(今天 + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
    // ⭐ 0.2.6：水位**每一条路都要读**。
    //   以前只有「只今天」才读 —— 于是普通拾星拿不到毫秒水位，
    //   昨天 18 点之后那一段永远补不回来（日期水位把它挡死了）。
    const 水位 = 读水位(文件夹)
    const 水位日 = 水位 ? 毫秒转日(水位) : ''
    // 尾巴日 = 今天那一截（补星/定时），或者「日期水位那一天只做了一半」
    const 尾巴日 = 只今天 ? 今天 : 已 && 水位日 && 水位日 === 已 ? 水位日 : ''
    const 料 = 准备料(源, 文件夹, 只今天 ? 昨天 : 已, 批天数, 水位, 尾巴日)
    记一笔(
      '派一批：已到 ' + (已 || '开头') + ' ｜水位 ' + (水位 || 0) + (尾巴日 ? '（尾巴日 ' + 尾巴日 + '）' : '') +
        ' ｜料 ' + JSON.stringify({ ok: 料.ok, 空: 料.空, 天数: 料.天数, 最早: 料.最早, 最晚: 料.最晚 }),
    )
    if (!料.ok) {
      // ⭐ 0.2.5：真的没东西了就把任务标成完成 —— 否则「上次没跑完」会一直挂着，
      //   用户点「接着拾」只拿到一句「没有可整理的日子」，看着就像插件坏了。
      if (料.空 && !只今天) {
        try {
          writeFileSync(任路, JSON.stringify({ ...旧任, 完成: true, 已到: 已 || 旧任.已到 || '' }, null, 2), 'utf8')
        } catch (e) {}
        记一笔('派一批：没东西可做了，任务标完成（到 ' + (已 || '开头') + '）')
      }
      const 话 = 只今天
        ? (料.空 ? '今天还没有新内容' : 料.原因)
        : 料.空
          ? (已 ? '已经整理到 ' + 已 + '，后面没有新内容了' : 料.原因)
          : 料.原因
      return { ok: false, 空: 料.空, 原因: 话 }
    }

    // 模型：**星坊里选了就听她的**；没选才退回主会话的默认模型。
    //   ⚠ 之前这里写死成「只用默认模型」，导致星坊里选的模型不生效（她录演示时当场撞上）。
    // ⭐ 模型的规矩（她定的）：
    //   ① 星坊里选了什么就用什么 —— 选的就是选的，不许自作主张
    //   ② 没选 → 跟**源会话自己用的模型**（别人来用也一样，不越权花钱）
    //   ③ 都没有 → 主会话默认
    const 存模 = 读存配置().模型
    const 源模 = 会话的模型(源)
    const 模 =
      存模 && 存模.provider && 存模.model
        ? 存模
        : 源模 ||
          (默认模型 && typeof 默认模型.currentSelection === 'function' ? 默认模型.currentSelection() : null)
    记一笔(
      '这批用模型：' +
        (模 ? 模.provider + '/' + 模.model : '（没取到）') +
        '（' + (存模 && 存模.provider ? '星坊选的' : 源模 ? '源会话' : '默认') + '）',
    )
    let 提示词 = 造提示词({
      文件夹,
      会话名: 项.名,
      已整理到: 已,
      天数: 料.天数,
      最早: 料.最早,
      最晚: 料.最晚,
      // ⭐ 默认把料**直接贴进消息**，不指望子会话有文件工具。
      //   （用户实测：他那台机器上拾星开出来的会话里根本没有 read / bash / glob，
      //     连料都打不开，最后只能交空模板。跟 preset 里有没有文件工具有关，我们控制不了。）
      内联料: true,
    })
    // ⭐ 0.2.2：只更新记忆卡的模式 —— 把「必须交日记」那几句换成「不交日记」
    if (选项.写日记 === false) {
      提示词 = 提示词
        .split('**每一天都要交两块：一块记忆卡、一块日记。少一块都不算交。**').join('**本次只更新记忆卡：只交记忆卡块，绝对不要交日记块。**')
        .split('<<<文件 日记/2026-11-03.md>>>').join('<<<文件 记忆卡.md#五>>>')
        .split('那一天发生了什么（几百字）').join('- 这一条要往「五｜我们的约定」里加的内容')
        .split('- **记忆卡那块最容易漏**：只交日记不交记忆卡 = 没交。哪怕那天只有一条，也要交。').join('- 每个要动的章各交一块记忆卡；哪怕只有一条，也要交。')
      + String.fromCharCode(10) + String.fromCharCode(10) + '⚠ 这次**不要生成任何日记文件**，交卷里只有记忆卡块。'
    }

    // 读出这一批的料（按天），后面分条贴过去
    const 料块们 = []
    try {
      const 料夹 = join(文件夹, '.拾星', '料')
      const 日们 = [料.最早, 料.最晚].filter(Boolean)
      const 全 = []
      for (const f of readdirSync(料夹)) {
        if (!/\.txt$/i.test(f)) continue
        if (f.startsWith('_')) continue
        const 日 = f.replace(/\.txt$/i, '')
        if (日们.length && (日 < 料.最早 || 日 > 料.最晚)) continue
        全.push([日, readFileSync(join(料夹, f), 'utf8')])
      }
      全.sort((a, b) => (a[0] < b[0] ? -1 : 1))
      for (const [日, 文] of 全) {
        // ⚠ 一个字都不许省略。
        //   拾星对每一天只跑一次，掐掉中间 = 那天中间的事永远进不了档案，
        //   而这正是插件要防的事（用户当场指出：「省略的意义是什么」）。
        //   内容多就多分几条消息，全贴。
        const 段大 = 12000
        const 段们 = []
        for (let i = 0; i < 文.length; i += 段大) 段们.push(文.slice(i, i + 段大))
        if (文.length > 80000) {
          记一笔('注意：' + 日 + ' 的料有 ' + 文.length + ' 字，分 ' + 段们.length + ' 条贴过去（不省略，模型上下文要够大）')
        }
        for (let k = 0; k < 段们.length; k++) {
          料块们.push(
            '【' + 日 + ' 的料' + (段们.length > 1 ? '（' + (k + 1) + '/' + 段们.length + '）' : '') + '】' +
              String.fromCharCode(10) +
              段们[k],
          )
        }
      }
      记一笔('这批料：' + 全.length + ' 天，切成 ' + 料块们.length + ' 条消息')
    } catch (e) {
      记一笔('读料失败：' + String((e && e.message) || e))
    }

    const 新id = 'session-' + randomUUID()
    let handle = null
    try {
      handle = await 代理服务.create({
        sessionId: 新id,
        meta: { cwd: 文件夹, agentPreset: 'standard' },
        ...(模 && 模.provider && 模.model ? { agentOptions: { provider: 模.provider, model: 模.model } } : {}),
      })
    } catch (e) {
      return { ok: false, 原因: '新建会话失败：' + String((e && e.message) || e) }
    }
    const agent = handle && handle.agent
    if (!agent || typeof agent.followup !== 'function') {
      try { handle?.dispose?.() } catch {}
      return { ok: false, 原因: '新会话没起来' }
    }

    try {
      if (agent.session && 标题服务 && typeof 标题服务.rename === 'function') {
        标题服务.rename(agent.session, '拾星 · ' + String(项.名 || 项.id).slice(0, 30) + ' · ' + 料.最早)
      }
    } catch {}

    // ⭐ 把这个工作会话也绑到目标文件夹：
    //   这样它在里面调 xingxi / xingxi_read 时能读到自己那份档案，
    //   而不是「没设置记忆卡」（用户实测的第二个坑）。
    try {
      const 绑 = { ...(读存配置().绑定 || {}) }
      if (!绑[新id]) {
        绑[新id] = 文件夹
        存配置({ 绑定: 绑 })
        记一笔('工作会话已绑到 ' + 文件夹)
      }
    } catch {}

    在跑.set(文件夹, Date.now())
    // ⭐ 收工记账：成了就清失败次数，没成加一次；连续三次没进展就停下，
    //   不然调度器会一分钟派一个新会话，永远停不下来。
    const 收 = (成 = false) => {
      在跑.delete(文件夹)
      try {
        const 旧 = JSON.parse(readFileSync(任路, 'utf8')) || {}
        if (成) {
          旧.连续失败 = 0
          // ⚠ 手写的「手动停」不许被收工清掉，不然一收工它就又自己跑起来了
          if (!旧.手动停) {
            旧.暂停 = false
            delete 旧.暂停原因
          }
        } else {
          旧.连续失败 = Number(旧.连续失败 || 0) + 1
          if (旧.连续失败 >= 3) {
            旧.暂停 = true
            旧.暂停原因 = '连续三次没进展'
            记一笔('拾星：' + 文件夹 + ' 连续三次没进展，自动停下（不再派）')
          }
        }
        writeFileSync(任路, JSON.stringify(旧, null, 2), 'utf8')
      } catch (e) {
        记一笔('收工记账失败：' + String((e && e.message) || e))
      }
      // ⚠ **不 dispose、不删**：会话留着，她能从侧栏点进去看它干了什么。
      //   （以前跑完就删/关，结果「会话自动消失」「重启又回来」两种毛病都来了）
    }

    // 盯它交卷：**不设墙钟超时**
    //   ⚠ 以前按 7.5 分钟掐，结果它还在慢慢读就被掐了，白跑（用户实测）。
    //   改成看它「有没有在动」：
    //     · 还在出消息 → 一直等
    //     · 连续 3 分钟没新消息，且进度到了 → 收工
    //     · 连续 3 分钟没新消息、进度没动 → 催它一次；催两次还没动就放手（会话不杀）
    // ⭐ 0.2.2：随时可以停 —— 每轮都看任务.json 的暂停标记（停止按钮 / 手写都算）
    const 被叫停 = () => {
      try {
        const t = JSON.parse(readFileSync(任路, 'utf8')) || {}
        return Boolean(t.暂停)
      } catch (e) {
        return false
      }
    }
    // ⚠ 料还没发完就不许判「到齐」——实测：料是分几条消息贴的，
    //   它可能只看到任务说明就回一句「料还没贴过来」，那时收工等于什么都收不到
    let 料发完 = false
    const 已处理 = new Set()
    let 上次签名 = ''
    let 静了几次 = 0
    let 催过 = 0
    let 要过卡 = false
    const 卡后时间 = () => {
      try {
        return statSync(join(文件夹, '记忆卡.md')).mtimeMs
      } catch {
        return 0
      }
    }
    const 卡前时间 = 卡后时间()
    // ⭐ 0.2.2：补星/定时是「只今天」，那一天可能早就被算成整理过了 ——
    //   所以收工不能只看进度，得看它**真的写过东西**（记忆卡或今天的日记动过）
    const 今天日记路 = () => join(文件夹, '日记', String(料.最晚 || '') + '.md')
    const 日记时间 = () => {
      try {
        return statSync(今天日记路()).mtimeMs
      } catch (e) {
        return 0
      }
    }
    const 日记前时间 = 日记时间()
    const 有动静 = () => 卡后时间() !== 卡前时间 || 日记时间() !== 日记前时间

    const 读它说的 = async () => {
      let 文 = ''
      try {
        const 消 = agent.session && typeof agent.session.deriveMessages === 'function' ? agent.session.deriveMessages() : []
        for (let i = (消 || []).length - 1; i >= 0; i--) {
          const m = 消[i]
          if (!m || m.role !== 'assistant') continue
          const c = m.content
          const t = (Array.isArray(c) ? c : []).filter((x) => x && x.type === 'text').map((x) => x.text).join('')
          if (t && t.trim()) {
            文 = t
            break
          }
        }
      } catch {}
      if (!文) {
        try {
          const 会话服务2 = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
          if (会话服务2 && typeof 会话服务2.flush === 'function' && agent.session) await 会话服务2.flush(agent.session)
          const 读回 = 读会话(新id)
          for (let i = 读回.事件.length - 1; i >= 0; i--) {
            const e = 读回.事件[i]
            if (e && e.角色 === 'ASSISTANT' && e.文 && e.文.trim()) {
              文 = e.文
              break
            }
          }
        } catch {}
      }
      return 文
    }

    const 轮 = async () => {
      // （料发完之前轮也会跑，但上面那道闸会挡住收工）
      const 文 = await 读它说的()
      const 签名 = 文 ? 文.length + ':' + 文.slice(-120) : ''
      if (签名 && 签名 !== 上次签名) {
        上次签名 = 签名
        静了几次 = 0
        if (!已处理.has(签名)) {
          已处理.add(签名)
          const 块们 = 解析文件块(文)
          if (块们.文件.length) {
            // ⚠ 记忆卡那块**必须带 `## 几｜章名`**。没带的话会被追加到最后一章下面 ——
            //   实测：650 条里有 619 条全挤进「八」，就是因为块里没有章标题。
            const 好的 = []
            for (const f of 块们.文件) {
              // ⭐ 空块不写：模板抄回来、正文一片空，写进去等于什么都没整理
              if (!String(f.文 || '').trim()) {
                记一笔('空块，拒收（' + f.名 + '）')
                continue
              }
              if (/(^|\/)记忆卡\.md$/.test(f.名) && !/^##\s*[一二三四五六七八]/m.test(f.文)) {
                记一笔('记忆卡块没有章标题，拒收（会全塞进最后一章）')
                continue
              }
              好的.push(f)
            }
            if (好的.length) {
              const 报 = 写回(文件夹, 好的)
              记一笔('落盘：' + JSON.stringify(报))
            }
          }
        }
      } else {
        静了几次 += 1
      }

      if (被叫停()) {
        记一笔('拾星：收到停止，这一批放手（进度 ' + (算进度(文件夹) || '开头') + '）')
        收(false)
        return
      }
      const 现进度 = 算进度(文件夹)
      const 到齐 = 料发完 && 料.最晚 && 现进度 >= 料.最晚 && (!只今天 || 有动静())
      // ⚠ 它常常只交日记、不交记忆卡（实测）。日记动了但记忆卡没动 → 单独要一次
      if (现进度 > (已 || '') && 卡后时间() === 卡前时间 && !要过卡) {
        要过卡 = true
        记一笔('日记交了但记忆卡没动，单独要一次记忆卡')
        try {
          await agent.followup({
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text: '记忆卡还一条没加。把 ' + (料.最早 || '这天') + (料.最晚 && 料.最晚 !== 料.最早 ? '~' + 料.最晚 : '') + ' 该进记忆卡的条目按格式交出来（只交记忆卡那块就行）。' }],
            source: { kind: 'plugin:xingxi-pick' },
          })
        } catch {}
        setTimeout(轮, 5000)
        return
      }
      if (到齐) {
        // ⭐ 0.2.2：水位也记进账本 —— 下次（补星 / 定时）只取这之后的新内容
        try {
          const 账路 = join(文件夹, '.xingxi.json')
          let 账 = {}
          try {
            账 = JSON.parse(readFileSync(账路, 'utf8')) || {}
          } catch (e) {}
          if (!只今天) 账.已整理到 = 料.最晚 || 现进度
          // ⭐ 0.2.6：到齐就把水位记上，不再看「有动静」——
          //   没记上的话，那一天的日期水位会把后半段永久挡住（同一天晚些时候的内容补不回来）。
          if (Number(料.最后时 || 0) > Number(账.已到 || 0)) 账.已到 = Number(料.最后时)
          writeFileSync(账路, JSON.stringify(账, null, 2), 'utf8')
          记一笔('水位：' + (账.已整理到 || '?') + ' ｜已到 ' + 账.已到)
        } catch (e) {
          记一笔('写水位失败：' + String((e && e.message) || e))
        }
        记一笔('这一批收工：进度 ' + 现进度 + '（已到目标）')
        收(true)
        return
      }
      // 静了 3 分钟（36 次 × 5 秒）
      if (静了几次 >= 36) {
        if (催过 < 2) {
          催过 += 1
          静了几次 = 0
          记一笔('这批没动静，催第 ' + 催过 + ' 次（进度还停在 ' + (现进度 || '开头') + '）')
          try {
            await agent.followup({
              id: randomUUID(),
              role: 'user',
              content: [{ type: 'text', text: '还没收到这一天的东西。把 ' + (料.最早 || '这天') + ' 的日记和记忆卡条目交出来，按约定的格式。' }],
              source: { kind: 'plugin:xingxi-pick' },
            })
          } catch {}
          setTimeout(轮, 5000)
          return
        }
        记一笔('催两次都没动，这批放手（会话留着，一分半后调度器才会再派）：进度 ' + (现进度 || '开头'))
        收(false)
        return
      }
      setTimeout(轮, 5000)
    }
    try {
      // ① 先把规则/格式发过去
      await agent.followup({
        id: randomUUID(),
        role: 'user',
        content: [{ type: 'text', text: 提示词 }],
        source: { kind: 'plugin:xingxi-pick' },
      })
      // ② 再把料一条一条贴过去（不依赖子会话有没有文件工具）
      for (const 块 of 料块们) {
        await agent.followup({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: 块 }],
          source: { kind: 'plugin:xingxi-pick' },
        })
      }
      // ③ 最后一句开工
      if (料块们.length) {
        await agent.followup({
          id: randomUUID(),
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                '料就是上面这些（' + 料.最早 + (料.最晚 && 料.最晚 !== 料.最早 ? ' ~ ' + 料.最晚 : '') + '）。' +
                '从现在开始，按约定的格式交：每天的日记 + 记忆卡条目。没有别的文件要你读。',
            },
          ],
          source: { kind: 'plugin:xingxi-pick' },
        })
      }
      料发完 = true
      setTimeout(轮, 3000)
    } catch (e) {
      收(false)
      return { ok: false, 原因: '把提示词交过去失败：' + String((e && e.message) || e) }
    }
    // 登记这个工作会话，跑完要删干净（不然重启又冒出来一个「未命名」）
    try {
      const 工路 = join(文件夹, '.拾星', '工人.json')
      let 工们 = []
      try {
        工们 = JSON.parse(readFileSync(工路, 'utf8')) || []
      } catch {}
      if (!Array.isArray(工们)) 工们 = []
      工们.push(新id)
      writeFileSync(工路, JSON.stringify(工们.slice(-20), null, 2), 'utf8')
      // 同时记到全局清单：插件重启时靠它把跑剩的会话删干净
      try {
        const 总路 = join(档案根, '工人.json')
        let 总们 = []
        try {
          总们 = JSON.parse(readFileSync(总路, 'utf8')) || []
        } catch {}
        if (!Array.isArray(总们)) 总们 = []
        总们.push(新id)
        writeFileSync(总路, JSON.stringify(总们.slice(-200), null, 2), 'utf8')
      } catch {}
    } catch {}

    // 记下这次任务（源会话 + 目标 + 进度），调度器靠它判断还没干完
    try {
      writeFileSync(
        任路,
        JSON.stringify(
          {
            ...旧任,
            会话: 源,
            工作会话: 新id,
            开始: Date.now(),
            // ⭐ 刹车用的时间戳：节流窗口内不再给这个文件夹派第二批
            上次派遣: Date.now(),
            最早: 料.最早,
            // ⚠ 目标要写**整段历史的最后一天**（全部最晚），不是这一批的最晚。
            //   写错了会以为「已经整理完」，调度器就停了（实测刚踩过）。
            最晚: 料.全部最晚 || 旧任.最晚 || 料.最晚,
            已到: 已 || '',
            完成: false,
          },
          null,
          2,
        ),
        'utf8',
      )
    } catch (e) {
      记一笔('任务记不下来：' + String((e && e.message) || e))
    }
    记一笔('派一批：' + 料.最早 + ' ~ ' + 料.最晚 + '（' + 料.天数 + ' 天，源 ' + 源.slice(0, 20) + '）')
    return { ok: true, 会话: 新id, 天数: 料.天数, 最早: 料.最早, 最晚: 料.最晚, 已到: 已 }
  }

  // ⭐ 调度：每 60 秒看一遍，谁没整理完就自动派下一批（挂着跑一晚上就能滚完）
  const 调度 = async () => {
    try {
      // 要跑的清单：会话列表 + 绑定表（绑定表的文件夹不一定在会话列表里）
      const 清单 = 列会话(活会话们()).map((x) => ({ id: x.id, 目录: x.目录, 名: x.名 }))
      try {
        const 绑 = 读存配置().绑定 || {}
        for (const [k, v] of Object.entries(绑)) {
          // ⚠ 别用 `session-` 前缀当判据：真源的 id 可能就是裸 uuid（插件建的会话），
          //   一过滤，调度器就永远看不见这个文件夹 —— 拾星也就不会再自动往下切。
          if (!String(k) || !v) continue
          if (清单.some((x) => x.目录 === v)) continue
          const 命 = 列会话(活会话们()).find((x) => x.id === k)
          清单.push({ id: k, 目录: v, 名: (命 && 命.名) || k })
        }
      } catch {}
      for (const 项 of 清单) {
        const 夹 = 项.目录
        if (!夹 || 在跑.has(夹)) continue
        let 任务 = null
        try {
          任务 = JSON.parse(readFileSync(join(夹, '.拾星', '任务.json'), 'utf8'))
        } catch {
          continue
        }
        if (!任务 || !任务.最晚) continue
        // ⭐ 停下的不再自动派；刚派过的等过节流窗口（跟「派一批」里那三道闸一致）
        if (任务.暂停) continue
        if (任务.上次派遣 && Date.now() - Number(任务.上次派遣) < 节流毫秒) continue
        const 进度 = 算进度(夹)
        if (进度 && 进度 >= String(任务.最晚)) {
          if (!任务.完成) {
            任务.完成 = true
            try { writeFileSync(join(夹, '.拾星', '任务.json'), JSON.stringify(任务, null, 2), 'utf8') } catch {}
            记一笔('调度：' + 夹 + ' 已经整理完（到 ' + 进度 + '）')
          }
          continue
        }
        记一笔('调度：' + 夹 + ' 还没完（到 ' + (进度 || '开头') + '），自动派一批')
        const 出 = await 派一批(项)
        // ⭐ 一轮最多派一个：真派出去才收工，被闸挡下/没料的就接着看下一个
        if (出 && 出.ok) break
      }
    } catch (e) {
      记一笔('调度出错：' + String((e && e.message) || e))
    }
  }

  try {
    // ⭐ 只留一个调度器（2026-11-04 实测：一天里插件重载了 63 次，等于挂了 63 个定时器，
    //   每个还有自己的「在跑」，于是一分钟内 8 个调度器一起醒过来各派一个）。
    //   globalThis 在同一个进程里不会被重载清掉，拿它存「上一次那个的停止函数」。
    const 停键 = Symbol.for('dsh-xingxi.调度停')
    const 旧停 = globalThis[停键]
    if (typeof 旧停 === 'function') {
      try { 旧停() } catch {}
      记一笔('旧的拾星调度器已停（重载时清掉，不留第二个）')
    }
    const 定时服务 = typeof ctx.get === 'function' ? ctx.get('timer') : undefined
    let 停 = null
    if (定时服务 && typeof 定时服务.repeat === 'function') {
      const r = 定时服务.repeat(调度, 60 * 1000)
      停 = typeof r === 'function' ? r : null
    } else {
      const t = setInterval(调度, 60 * 1000)
      停 = () => clearInterval(t)
    }
    globalThis[停键] = 停
    ctx.effect(() => () => {
      try { if (typeof 停 === 'function') 停() } catch {}
      if (globalThis[停键] === 停) globalThis[停键] = null
    })
    记一笔('拾星调度器已挂（每 60 秒看一遍）')
  } catch (e) {
    记一笔('调度器挂不上：' + String((e && e.message) || e))
  }
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',


      path: '/dsh-xingxi',
      handler: async (req, res) => {
        const 拒 = 连接 && typeof 连接.requestRejection === 'function' ? 连接.requestRejection(req) : undefined
        if (拒 !== undefined) {
          res.writeHead(拒)
          res.end(拒 === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        const 地址 = new URL(req.url || '/', 'http://127.0.0.1')
        // ⚠ 路径里有中文时 URL().pathname 是百分号编码（/dsh-xingxi/%E6%96%99），
        //   不 decode 永远匹配不上 —— 前端看到的是 404
        let 径 = 地址.pathname
        try {
          径 = decodeURIComponent(径)
        } catch {}
        try {
          记一笔('来: ' + 径)
          if (径 === '/dsh-xingxi/sessions') {
            // ⭐ 只看当前工作区：拿调用方的会话 id，查出它的工作区
            let 工作区 = ''
            const 问sid = 地址.searchParams.get('sid') || ''
            if (问sid) {
              try {
                const 盘 = 扫全部会话(ctx)
                const 本 = 盘.find((x) => x.id === 问sid)
                工作区 = (本 && 本.工作区) || ''
              } catch {}
            }
            const 列 = 列会话(活会话们(), 工作区)
            // 每个会话的文件夹里有没有「没跑完的拾星」
            for (const x of 列) {
              try {
                const 没 = 算没跑完(x.目录)
                if (没) x.没跑完 = 没
              } catch {}
            }
            return 回JSON(res, { 会话: 列, 根: 档案根, 定时: 读定时设置(地址.searchParams.get('sid') || '') })
          }
          if (径 === '/dsh-xingxi/graph') {
            const sid = 地址.searchParams.get('sid') || ''
            return 回JSON(res, 出图(sid, 活会话们()))
          }
          if (径 === '/dsh-xingxi/料') {
            const sid = 地址.searchParams.get('sid') || ''
            const 已 = 地址.searchParams.get('已') || ''
            const r = 按天切(sid, 已)
            return 回JSON(res, {
              缺: r.缺,
              事件: r.全部事件,
              天数: r.天数,
              最早: r.最早,
              最晚: r.最晚,
              每天: r.每天,
            })
          }
          if (径 === '/dsh-xingxi/pick' && req.method === 'POST') {
            let 体 = ''
            for await (const 块 of req) 体 += 块
            let sid = ''
            try {
              sid = String(JSON.parse(体 || '{}').sid || '')
            } catch {}
            const 这项 = 列会话(活会话们()).find((x) => x.id === sid)
            if (!这项) return 回JSON(res, { ok: false, 原因: '找不到这个会话' }, 400)
            // ⭐ 手动点「拾星」= 人明确说继续：把自动停下时留的暂停与节流清掉
            //   （自动调度守那两道闸，人点了就听人的；进程内那道锁也一起放开）
            try {
              globalThis[Symbol.for('dsh-xingxi.派遣锁')] = 0
              const 任路2 = join(这项.目录, '.拾星', '任务.json')
              const 旧 = JSON.parse(readFileSync(任路2, 'utf8')) || {}
              if (旧.暂停 || 旧.上次派遣) {
                delete 旧.暂停
                delete 旧.暂停原因
                旧.连续失败 = 0
                旧.上次派遣 = 0
                writeFileSync(任路2, JSON.stringify(旧, null, 2), 'utf8')
                记一笔('手动拾星：' + 这项.目录 + ' 继续（暂停与节流已清）')
              }
            } catch {}
            const 出 = await 派一批(这项, { 手动: true })
            return 回JSON(res, 出.ok ? 出 : { ok: false, 原因: 出.原因 }, 出.ok ? 200 : 400)
          }

          if (径 === '/dsh-xingxi/pickdir' && req.method === 'POST') {
            // 调 DSH 自己的选目录服务（宿主这头实现 = 弹系统那个「选文件夹」窗口）
            // ⚠ 服务必须**现取**：插件启动那一刻它可能还没就绪，
            //   存成变量就会永远是 undefined（这就是"之前能弹、后来弹不出"的原因）
            const 现取 = typeof ctx.get === 'function' ? ctx.get('directoryPickerController') : undefined
            if (!现取 || typeof 现取.pick !== 'function') {
              // 没有那个服务就自己弹 Windows 原生的「选文件夹」窗口（带「新建文件夹」）
              const 选 = await 弹系统选夹()
              if (选 === null) {
                return 回JSON(res, { ok: false, 原因: '弹不出选文件夹窗口', 退: true }, 400)
              }
              记一笔('系统窗口选目录 → ' + (选 || '（取消）'))
              return 回JSON(res, { ok: true, 目录: 选 || '' })
            }
            try {
              const 选 = await 现取.pick(new AbortController().signal)
              记一笔('选目录 → ' + (选 || '（取消）'))
              return 回JSON(res, { ok: true, 目录: 选 || '' })
            } catch (e) {
              return 回JSON(res, { ok: false, 原因: String((e && e.message) || e), 退: true }, 500)
            }
          }
          if (径 === '/dsh-xingxi/bind' && req.method === 'POST') {
            let 体 = ''
            for await (const 块 of req) 体 += 块
            try {
              const { sid, 目录 } = JSON.parse(体 || '{}')
              if (!sid) return 回JSON(res, { ok: false, 原因: '没给会话' }, 400)
              // ⚠ 「本机档案」不是会话，不能给它绑文件夹 ——
              //   绑了会在列表里多出一条假的「会话 __本机__」，还指向别人的目录（就是那个 bug）
              if (String(sid) === '__本机__') {
                return 回JSON(res, { ok: false, 原因: '本机档案不用绑文件夹，它的记忆卡/日记路径在设置里改' }, 400)
              }
              const 旧 = 读存配置().绑定 || {}
              const 新 = { ...旧 }
              if (目录) 新[sid] = String(目录)
              else delete 新[sid]
              存配置({ 绑定: 新 })
              记一笔('绑定 ' + sid + ' → ' + (目录 || '（清掉，回到默认）'))
              缓存.clear()
              return 回JSON(res, { ok: true, 会话: 列会话(活会话们()) })
            } catch (e) {
              return 回JSON(res, { ok: false, 原因: String((e && e.message) || e) }, 400)
            }
          }
          if (径 === '/dsh-xingxi/定时') {
            if (req.method !== 'POST') {
              const sid = String(地址.searchParams.get('sid') || '')
              return 回JSON(res, { ok: true, 定时: 读定时设置(sid) })
            }
          }
          if (径 === '/dsh-xingxi/停止' && req.method === 'POST') {
            let 体 = ''
            for await (const 块 of req) 体 += 块
            let b = {}
            try {
              b = JSON.parse(体 || '{}')
            } catch {}
            const sid = String(b.sid || '')
            const 这项 = 列会话(活会话们()).find((x) => x.id === sid) || null
            const 夹 = (这项 && 这项.目录) || String((读存配置().绑定 || {})[sid] || '')
            if (!夹) return 回JSON(res, { ok: false, 原因: '这个会话还没有绑定文件夹' }, 400)
            const 任路2 = join(夹, '.拾星', '任务.json')
            try {
              let t = {}
              try {
                t = JSON.parse(readFileSync(任路2, 'utf8')) || {}
              } catch (e) {}
              t.暂停 = true
              t.手动停 = true
              t.暂停原因 = '手动停止'
              t.连续失败 = 3
              writeFileSync(任路2, JSON.stringify(t, null, 2), 'utf8')
              // 正在跑的那个工人：能让它停就让它停
              const 工 = String(t.工作会话 || '')
              const ag = 工 && 代理服务 && 代理服务.get ? 代理服务.get(工) : null
              if (ag && typeof ag.dispose === 'function') {
                try {
                  ag.dispose()
                } catch (e) {}
              }
              记一笔('拾星：手动停止（' + 夹 + '）')
              return 回JSON(res, { ok: true })
            } catch (e) {
              return 回JSON(res, { ok: false, 原因: String((e && e.message) || e) }, 400)
            }
          }
          // ⭐ 0.2.2：补星 —— 只给「最后一天」补水位之后的尾巴
          if (径 === '/dsh-xingxi/补星' && req.method === 'POST') {
            let 体 = ''
            for await (const 块 of req) 体 += 块
            let b = {}
            try {
              b = JSON.parse(体 || '{}')
            } catch {}
            const sid = String(b.sid || '')
            if (!sid) return 回JSON(res, { ok: false, 原因: '不知道是哪个会话' }, 400)
            const 这项 = 列会话(活会话们()).find((x) => x.id === sid) || null
            const 夹 = (这项 && 这项.目录) || String((读存配置().绑定 || {})[sid] || '')
            if (!夹) return 回JSON(res, { ok: false, 原因: '这个会话还没有绑定文件夹' }, 400)
            // 人亲自点的，先把停止标记放掉（不然会回「已经停了」）
            try {
              const 任路3 = join(夹, '.拾星', '任务.json')
              const t3 = JSON.parse(readFileSync(任路3, 'utf8')) || {}
              if (t3.暂停) {
                t3.暂停 = false
                t3.手动停 = false
                t3.连续失败 = 0
                delete t3.暂停原因
                writeFileSync(任路3, JSON.stringify(t3, null, 2), 'utf8')
              }
            } catch (e) {}
            const 源 = 找源会话(夹) || sid
            let 水位 = 读水位(夹)
            // ⚠ 今天的日记还是占位（没真内容）→ 当它没补过，整天的料重来一遍
            //   （不然水位已经吃掉了今天，补星会一直说「没有新内容」）
            const 今天 = 今天串()
            try {
              const 卡文 = String(readFileSync(join(夹, '日记', 今天 + '.md'), 'utf8') || '')
                .replace(/^#.*$/gm, '')
                .replace(/[\s\-*_`>#（）()]/g, '')
              if (卡文.length < 40) 水位 = 0
            } catch (e) {
              水位 = 0
            }
            // ⚠ 只补**已整理到的那一天**：以前这里把「已整理到」传成空，于是一次补了两个月
            const 今天2 = 今天串()
            const 前天 = new Date(Date.parse(今天2 + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10)
            const 切 = 按天切(源, 前天, 水位)
            if (!切.天数) return 回JSON(res, { ok: true, 补: { 天数: 0, 原因: '水位之后没有新内容' } })
            const r = await 派一批({ id: sid, 目录: 夹, 名: (这项 && 这项.名) || '' }, { 只今天: true, 写日记: true, 手动: true })
            return 回JSON(res, r.ok ? { ok: true, 补: { 天数: 切.天数, 最早: 切.最早, 最晚: 切.最晚 } } : { ok: false, 原因: r.原因 })
          }
          if (径 === '/dsh-xingxi/定时' && req.method === 'POST') {
            let 体 = ''
            for await (const 块 of req) 体 += 块
            try {
              const 存 = 读存配置()
              const 旧 = 存.定时 || {}
              const 来 = JSON.parse(体 || '{}')
              const sid = String(来.会话 ?? 来.sid ?? '')
              if (!sid) return 回JSON(res, { ok: false, 原因: '不知道是哪个会话的设置' }, 400)
              const 各 = { ...((旧 && 旧.各 && typeof 旧.各 === 'object') ? 旧.各 : {}) }
              const 旧设 = 读定时设置(sid)     // 解析过默认值的那一份
              const 该 = { ...(各[sid] || {}) }
              if (来.时 !== undefined) 该.时 = Math.max(0, Math.min(23, Number(来.时)))
              if (来.分 !== undefined) 该.分 = Math.max(0, Math.min(59, Number(来.分)))
              for (const k of ['自己', '星汐']) if (来[k] !== undefined) 该[k] = Boolean(来[k])
              delete 该.只卡
              delete 该.提醒日记
              delete 该.连日记
              // ⭐ 两种只能开一种
              if (该.星汐) 该.自己 = false
              else if (该.自己) 该.星汐 = false
              各[sid] = 该
              存配置({ 定时: { ...旧, 各 } })
              // ⭐ 0.2.4：只有「时 / 分 / 模式」真的变了，才允许今天重跑一次。
              //   以前这里无条件清空「今天已发」，点一次「保存」什么都不改，
              //   一分钟内就会把同一天的提醒再发一遍。
              const 新设 = 读定时设置(sid)
              const 变了 =
                旧设.时 !== 新设.时 || 旧设.分 !== 新设.分 || 旧设.自己 !== 新设.自己 || 旧设.星汐 !== 新设.星汐
              if (变了) {
                日记已跑.delete(sid + '|' + 今天串())
                清定时已发(sid)
              }
              记一笔(
                '定时设置已存（' + sid.slice(0, 18) + '）：' + JSON.stringify(该) + (变了 ? '（改过，今天可重跑）' : '（没改，今天不重跑）')
              )
              return 回JSON(res, { ok: true, 定时: 读定时设置(sid), 变了 })
            } catch (e) {
              return 回JSON(res, { ok: false, 原因: String((e && e.message) || e) }, 400)
            }
          }
          if (径 === '/dsh-xingxi/models') {
            if (req.method === 'POST') {
              let 体 = ''
              for await (const 块 of req) 体 += 块
              try {
                const { provider, model } = JSON.parse(体 || '{}')
                if (provider && model) 存配置({ 模型: { provider, model } })
              } catch {}
            }
            return 回JSON(res, await 列模型())
          }
          if (径 === '/dsh-xingxi/顺序' && req.method === 'POST') {
            let 体 = ''
            for await (const 块 of req) 体 += 块
            let 顺序 = []
            try {
              const j = JSON.parse(体 || '{}')
              顺序 = Array.isArray(j.顺序) ? j.顺序.map(String) : []
            } catch {}
            const 果 = 存配置({ 顺序 })
            if (!果.ok) return 回JSON(res, { ok: false, 原因: 果.原因 }, 500)
            缓存.clear()
            return 回JSON(res, { ok: true })
          }

          if (径 === '/dsh-xingxi/config' && req.method === 'POST') {
            let 体 = ''
            for await (const 块 of req) 体 += 块
            const { 记忆卡, 日记, 中心 } = JSON.parse(体 || '{}')
            const 结果 = 存配置({
              ...(记忆卡 !== undefined ? { 记忆卡 } : {}),
              ...(日记 !== undefined ? { 日记 } : {}),
              ...(中心 !== undefined ? { 中心 } : {}),
            })
            if (!结果.ok) return 回JSON(res, { ok: false, 原因: 结果.原因 }, 500)
            缓存.clear()
            return 回JSON(res, { ok: true, 会话: 列会话() })
          }
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('没有这个路')
        } catch (e) {
          回JSON(res, { 错: String((e && e.message) || e) }, 500)
        }
      },
    }),
  )
  void 配置
}

export { 扫全部会话, 会话的模型, 读工作区状态 }
