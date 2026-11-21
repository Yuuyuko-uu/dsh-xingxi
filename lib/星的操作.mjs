// 星汐 · 星的操作（改 / 删）
//
// 这是**纯函数**模块：给一段文件全文 + 一颗星，返回改完之后的全文。
// 不读盘、不写盘、不碰任何状态 —— 好测、好回滚，也方便将来做撤销。
//
// 两种格式，切法不一样：
//   日记   一天一条/几条：`- **08-16**：正文…`（一行一条，同一天多行合成一颗星）
//   记忆卡 八章 + 条目：`- 一条…`（拆条之后一颗星基本就是一条，text 里**带着**行首的 `- `）
//
// ⚠ 三条铁律：
//   1. **只动匹配到的那几行**，其余一个字节不碰（绝不整篇重写）
//   2. **定位不唯一就不动** —— 宁可报错，不许猜
//   3. 日记**只给改，不给删**（删了就是凭空少一天，那不行）

/**
 * 整篇替换（**一天一个文件**的日记就是这样：星图显示的就是那一整个 md）。
 * 保留原文件的换行符和 BOM；新内容就是新的全文。
 */
export function 改整篇(全文, 新文) {
  const 装 = 拆文(全文)
  const 新段 = String(新文 == null ? '' : 新文).replace(/\r\n/g, '\n').trim()
  if (!新段) return { ok: false, 原因: '新内容是空的 —— 要清空请直接在文件里删' }
  const 行们 = 新段.split('\n')
  return {
    ok: true,
    全文: 合文(行们, 装) + 装.换行,
    原来几行: 装.行们.length,
    现在几行: 行们.length,
  }
}

/** 这份文件是不是「一天一个」的整篇日记（第一行是 `# 2026-11-19` 或 `【2026-11-19】`） */
export function 是整篇日记(全文) {
  const 装 = 拆文(全文)
  const 首 = 装.行们.find((l) => l.trim())
  return /^\s*(#+\s*)?【?\s*\d{4}-\d{2}-\d{2}\s*】?\s*$/.test(String(首 || ''))
}

/** 按空行切段，段内压成一行 */
function 分段(文) {
  return String(文 == null ? '' : 文)
    .split(/\r?\n\s*\r?\n/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/**
 * 拆文：把「换行符号」和「BOM」先摘出来，改完再原样装回去。
 * ⚠ 别人的文件可能是 CRLF、可能带 BOM —— 改一条就顺手把整篇的换行改掉，
 *   那是很讨厌的行为（git 上会显示整篇都变了）。所以必须原样保留。
 */
function 拆文(文) {
  let s = String(文 == null ? '' : 文)
  const BOM = s.startsWith('\uFEFF')
  if (BOM) s = s.slice(1)
  const CRLF = s.includes('\r\n')
  return { 行们: s.split(/\r?\n/), 换行: CRLF ? '\r\n' : '\n', BOM, 原文: s }
}

function 合文(行们, 装) {
  return (装.BOM ? '\uFEFF' : '') + 行们.join(装.换行)
}

/**
 * 改日记里的某一天。
 * @param {string} 全文  文件的全部内容
 * @param {string} 日期  'YYYY-MM-DD'（也认 'MM-DD'）
 * @param {string} 新文  新的正文；按空行分成几段，一段写成一行 `- **MM-DD**：…`
 * @returns {{ok:true, 全文:string, 原来几行:number, 现在几行:number}|{ok:false, 原因:string}}
 */
export function 改日记(全文, 日期, 新文) {
  const 文 = String(全文 == null ? '' : 全文)
  const 日 = String(日期 || '').trim()
  const mm = /^\d{4}-\d{2}-\d{2}$/.test(日) ? 日.slice(5) : /^\d{2}-\d{2}$/.test(日) ? 日 : ''
  if (!mm) return { ok: false, 原因: '日期看不懂：' + 日 }
  if (mm.startsWith('--')) return { ok: false, 原因: '这一天认不出年份，不敢改' }

  const 段们 = 分段(新文)
  if (!段们.length) return { ok: false, 原因: '新内容是空的 —— 要清空请直接在文件里删' }

  const 头 = new RegExp('^-\\s*\\*\\*' + mm.replace('-', '\\-') + '[^*]*\\*\\*\\s*[：:]')
  const 装 = 拆文(文)
  const 行们 = 装.行们
  const 位置 = []
  for (let i = 0; i < 行们.length; i++) if (头.test(行们[i].trim())) 位置.push(i)

  // ⭐ 0.4.3：**一天一个文件**的写法（`【2026-11-19】` 开头、正文是散文，没有 bullet）。
  //   这种一天就是一颗星，改法整篇换 —— 但只认「标题行里的日期 == 要改的那天」，
  //   对不上就绝不整篇覆盖（那会把别人的一天抹掉）。
  if (!位置.length) {
    const 头行 = 行们.findIndex((l) => /^\s*【\d{4}-\d{2}-\d{2}】\s*$/.test(l))
    const 要的 = /^\d{4}-\d{2}-\d{2}$/.test(日) ? 日 : ''
    if (头行 >= 0 && 要的) {
      const 头日 = /【(\d{4}-\d{2}-\d{2})】/.exec(行们[头行])[1]
      if (头日 === 要的) {
        const 新段 = String(新文).replace(/\r\n/g, '\n').trim()
        if (!新段) return { ok: false, 原因: '新内容是空的 —— 要清空请直接在文件里删' }
        // 草稿里本来就带着标题行就用它，没带就补回去
        const 有头 = new RegExp('^【' + 头日 + '】')
        const 出文 = 有头.test(新段) ? 新段 : '【' + 头日 + '】\n\n' + 新段
        return {
          ok: true,
          全文: 合文(出文.replace(/\n{3,}/g, '\n\n').split('\n'), 装) + (装.换行 === '\r\n' ? '\r\n' : '\n'),
          原来几行: 行们.length - 头行 - 1,
          现在几行: 出文.split('\n').length,
        }
      }
    }
    return { ok: false, 原因: '文件里找不到 ' + mm + ' 那几行' }
  }

  const 新行们 = 段们.map((s) => '- **' + mm + '**：' + s)
  const 出 = 行们.slice()
  // 从后往前删掉多出来的那几行，最后把第一处换成新内容
  for (let k = 位置.length - 1; k >= 1; k--) 出.splice(位置[k], 1)
  出.splice(位置[0], 1, ...新行们)
  return { ok: true, 全文: 合文(出, 装), 原来几行: 位置.length, 现在几行: 新行们.length }
}

/**
 * 在记忆卡里找到这颗星占的那几行（要求**唯一**）。
 * @param {string} 全文
 * @param {string} 星文  星自己的 text（拆条之后带着行首 `- `）
 */
export function 找条目(全文, 星文) {
  const 文 = String(全文 == null ? '' : 全文)
  const 块 = String(星文 == null ? '' : 星文).split(/\r?\n/).map((s) => s.trimEnd())
  while (块.length && !块[0].trim()) 块.shift()
  while (块.length && !块[块.length - 1].trim()) 块.pop()
  if (!块.length) return { ok: false, 原因: '这颗星没有内容' }
  const 首 = 块[0].trim()

  const 装 = 拆文(文)
  const 行们 = 装.行们
  const 位置 = []
  for (let i = 0; i < 行们.length; i++) {
    if (行们[i].trim() !== 首) continue
    // 后面几行也要对得上，才算同一块
    let 对 = true
    for (let k = 0; k < 块.length; k++) {
      const 本 = (行们[i + k] ?? '').trim()
      if (本 !== 块[k].trim()) { 对 = false; break }
    }
    if (对) 位置.push(i)
  }
  if (!位置.length) return { ok: false, 原因: '文件里找不到这一条（可能已经被改过）' }
  if (位置.length > 1) return { ok: false, 原因: '文件里有 ' + 位置.length + ' 处一模一样的，不敢动 —— 请直接在文件里改' }
  return { ok: true, 起: 位置[0], 行数: 块.length, 行们, 装, 原文: 块.join('\n') }
}

/**
 * 改记忆卡里的一条。
 * @param {string} 全文
 * @param {string} 星文  星原来的 text（用来定位）
 * @param {string} 新文  新内容；多段会用同样的行首续行（保持 `- 一条` 的形状）
 */
export function 改条目(全文, 星文, 新文) {
  const 找 = 找条目(全文, 星文)
  if (!找.ok) return 找
  const 段们 = 分段(新文)
  if (!段们.length) return { ok: false, 原因: '新内容是空的 —— 想删掉这条就点删除' }

  const 首行 = 找.行们[找.起]
  const 缩进 = /^\s*/.exec(首行)[0]
  const 记号 = /^\s*(-\s+|\*\*\d+[.．]\s*|\d+[.．]\s*)/.exec(首行)
  const 头 = 记号 ? 缩进 + 记号[1] : 缩进
  // 第一段带着原来的行首记号，后面几段用缩进 + 两个空格续上（Markdown 里算同一条）
  const 新行们 = 段们.map((s, i) => (i === 0 ? 头 + s : 缩进 + '  ' + s))

  const 出 = 找.行们.slice()
  出.splice(找.起, 找.行数, ...新行们)
  return { ok: true, 全文: 合文(出, 找.装), 原来几行: 找.行数, 现在几行: 新行们.length, 原文: 找.原文 }
}

/**
 * 删记忆卡里的一条（日记**不许**走这个）。
 * @param {string} 全文
 * @param {string} 星文
 */
export function 删条目(全文, 星文) {
  const 找 = 找条目(全文, 星文)
  if (!找.ok) return 找
  const 出 = 找.行们.slice()
  出.splice(找.起, 找.行数)
  // 删完之后如果留下连续空行，收成一个（别在文档里留坑）
  const 收好 = []
  for (const l of 出) {
    if (!l.trim() && 收好.length && !收好[收好.length - 1].trim()) continue
    收好.push(l)
  }
  return { ok: true, 全文: 合文(收好, 找.装), 删了: 找.行数, 原文: 找.原文 }
}
