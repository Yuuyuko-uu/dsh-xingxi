// 星汐 · 星星对应的文件在哪（纯逻辑 + fs，能单独测）
//
// 为什么要单独一个文件：这套「doc → 真实文件」的查找真出过一次事故 ——
//   她改的是 A 档案里的一天，结果兜底链跨到了 B 档案，把 B 里同名的那篇覆盖了。
//   所以：**只在这颗星所属的那个档案范围里找**，宁可拒绝，绝不跨档案。
//
// 规矩（每条都有测试兜着）：
//   1. 会话绑了文件夹 → 只在那一个文件夹里找
//   2. 没绑文件夹、又不是「本机」→ 拒绝
//   3. 「本机」→ 只在记忆卡/日记各自所在的目录里找
//   4. doc 里不许有 `..`、不许是绝对路径（防止跳出档案）
//   5. 同一个档案里找到多个同名文件 → 拒绝（不猜）
//   6. 「记忆卡」这颗星的文件名在配置里可能叫别的（大肥鱼的记忆卡.md）→ 直接认配置那份

import { existsSync, statSync, readdirSync } from 'node:fs'
import { join, basename, dirname, resolve, sep } from 'node:path'

const 是夹 = (p) => {
  try {
    return Boolean(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

const 是文件 = (p) => {
  try {
    return Boolean(p) && existsSync(p) && !statSync(p).isDirectory()
  } catch {
    return false
  }
}

/**
 * 这个路径是不是「某个档案里的文件」（界面会把星图的来源文件路径直接带回来）。
 * 只认 .md，而且必须落在这些目录里头：档案根、记忆卡所在目录、日记目录、所有绑定的文件夹。
 */
export function 文件在档案里(存, 档案根, 路径) {
  const p = String(路径 == null ? '' : 路径).trim()
  if (!p) return false
  if (!/\.md$/i.test(p)) return false
  if (p.includes('..')) return false
  const 实 = resolve(p)
  const 根们 = []
  const 加根 = (x) => {
    if (!x) return
    const s = String(x)
    根们.push(是夹(s) ? s : dirname(s))
  }
  if (档案根) 根们.push(String(档案根))
  if (存 && 存.记忆卡) 加根(String(存.记忆卡))
  if (存 && 存.日记) 加根(String(存.日记))
  for (const 夹 of Object.values((存 && 存.绑定) || {})) 加根(String(夹 || ''))
  for (const 根 of 根们) {
    try {
      const 净根 = resolve(根)
      if (实 === 净根 || 实.startsWith(净根.endsWith(sep) ? 净根 : 净根 + sep)) return true
    } catch {}
  }
  return false
}

/** doc 是不是安全的相对名字（不许 `..`、不许绝对路径 / 盘符） */
export function 名字安全(doc) {
  const d = String(doc == null ? '' : doc).trim()
  if (!d) return false
  if (d.includes('..')) return false
  if (/^[\\/]/.test(d)) return false
  if (/^[A-Za-z]:/.test(d)) return false
  return true
}

/**
 * 找这颗星对应的那个文件。
 * @param {{绑定?:Record<string,string>, 记忆卡?:string, 日记?:string}} 存 配置
 * @param {string} sid  '本机' 用 '__本机__'；其它是会话 id（带不带 `session-` 前缀都认）
 * @param {string} doc  星带的相对名（可能带子目录、可能没扩展名）
 * @param {string} [档案根]  没绑文件夹的会话，档案默认就在 `<档案根>/<会话id>/`（这仍然是它自己的，不算跨档案）
 * @returns {{ok:true, 文件:string}|{ok:false, 原因:string}}
 */
export function 定位档案文件(存, sid, doc, 档案根) {
  const 名 = String(doc == null ? '' : doc).trim()
  if (!名字安全(名)) return { ok: false, 原因: '这个文件名不安全，不动它' }
  const 本机 = String(sid || '') === '__本机__'
  if (!sid) return { ok: false, 原因: '没说是哪个会话的档案，不敢动' }

  const 名字们 = new Set([basename(名)])
  if (!/\.md$/i.test(名)) 名字们.add(basename(名) + '.md')

  const 根们 = []
  const 绑们 = (存 && 存.绑定) || {}
  const 另种 = (x) => (String(x || '').startsWith('session-') ? String(x).slice(8) : 'session-' + String(x || ''))
  const 绑夹 = String(绑们[sid] || 绑们[另种(sid)] || '')
  if (绑夹 && 是夹(绑夹)) 根们.push(绑夹)

  if (!根们.length) {
    if (本机) {
      if (存 && 存.记忆卡) 根们.push(dirname(String(存.记忆卡)))
      if (存 && 存.日记) 根们.push(是夹(存.日记) ? String(存.日记) : dirname(String(存.日记)))
    } else {
      // 没绑文件夹的会话：档案默认就在 `档案根/<会话id>/`。
      // ⚠ 这**不是**跨档案 —— 那就是它自己的档案目录（出图也是这么读的）。
      //   只有连默认目录都没有时才拒绝。
      for (const 候 of [String(sid), 另种(sid)]) {
        if (!档案根) continue
        const p = join(String(档案根), 候)
        if (是夹(p)) {
          根们.push(p)
          break
        }
      }
    }
  }
  if (!根们.length) return { ok: false, 原因: '这个会话还没有档案目录（没绑文件夹，默认目录也没建）' }

  const 命中 = []
  // 「记忆卡」这一颗：配置里的文件名可能根本不叫「记忆卡」
  if (本机 && (basename(名) === '记忆卡' || basename(名) === '记忆卡.md') && 存 && 存.记忆卡) {
    if (是文件(存.记忆卡)) 命中.push(String(存.记忆卡))
  }

  for (const 根 of 根们) {
    for (const 候 of [名, 名 + '.md']) {
      const p = join(根, 候)
      if (是文件(p)) 命中.push(p)
    }
    // doc 常常只剩文件名（子目录丢了）→ 在这一档案里递归按名字找
    const 走 = (d, 深) => {
      if (深 > 4) return
      let 们 = []
      try {
        们 = readdirSync(d, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of 们) {
        const p = join(d, e.name)
        if (e.isDirectory()) {
          if (!e.name.startsWith('.')) 走(p, 深 + 1)
          continue
        }
        if (名字们.has(e.name)) 命中.push(p)
      }
    }
    走(根, 0)
  }

  const 唯 = [...new Set(命中)]
  if (!唯.length) return { ok: false, 原因: '这个档案里找不到这颗星的文件（doc=' + 名 + '）' }
  if (唯.length > 1) {
    return {
      ok: false,
      原因: '这个档案里有 ' + 唯.length + ' 个同名的文件，不敢动：' + 唯.map((p) => basename(dirname(p)) + '/' + basename(p)).join('、'),
    }
  }
  return { ok: true, 文件: 唯[0] }
}
