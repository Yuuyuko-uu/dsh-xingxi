// DSH 星汐 · 网页半边
//
// 页面结构：
//   ┌ 顶栏：星汐 · 星图 / 档案 / 日记 ───────────── 当前会话 ┐
//   ├ 主区（星图 或 档案 或 日记）        │ 右边会话侧栏      ┤
//   └──────────────────────────────────┴───────────────┘
//   星图只是其中一块，不是整页。每个会话一张图；没档案的会话只有背景 + 一颗暗星。
//
// 只读。

window.__ModuleLoader__.load({
  id: 'dsh-xingxi',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useRef, useState, useCallback } = React

    let 客户端 = null   // 客户端上下文：弹系统选文件夹窗口要用它

    const 章名表 = {
      1: '第一章', 2: '第二章', 3: '第三章', 4: '第四章',
      5: '第五章', 6: '第六章', 7: '第七章', 8: '第八章',
    }

    function 透明(色, a) {
      const m = /^#([0-9a-f]{6})$/i.exec(色 || '')
      if (!m) return `rgba(200,220,255,${a})`
      const v = parseInt(m[1], 16)
      return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`
    }
    // ⭐ 星色按「宝石色相 × 明度层」展开：彼此有明显色相差，同时不过分荧光。
    //   id 负责稳定选色；冷暖、明暗交错，避免整张星图落进同一片蓝紫色。
    const 彩盘 = [
      '#4f9eff', '#1d72d8', '#8ccaff', // 海蓝
      '#26c7a4', '#087f78', '#80e4c9', // 青绿
      '#9d70ff', '#6847dc', '#c5a6ff', // 紫罗兰
      '#ff8548', '#d94c32', '#ffc05b', // 珊瑚 / 琥珀
      '#ef5b98', '#c93673', '#ff9cbe', // 玫瑰
      '#a9ce32', '#708d20', '#d8e87d', // 柔和青柠
    ]
    // 八章连接线使用固定珠宝色系，保持跨次打开的一致性。
    const 章色 = {
      1: '#74aaff', 2: '#54cbb9', 3: '#b28aff', 4: '#ff9777',
      5: '#ef78a7', 6: '#e4ba62', 7: '#9acb62', 8: '#67bfdf',
    }

    // 日记颜色固定按月份循环；相邻月份尽量用不同色相，缩小显示时也容易分辨。
    const 月色 = {
      1: '#58a6ff', 2: '#35d0a1', 3: '#b0d847', 4: '#ffc247',
      5: '#ff7b4f', 6: '#f15d76', 7: '#dd66c7', 8: '#ab78ff',
      9: '#686cf2', 10: '#45c6dc', 11: '#168f8a', 12: '#cc4365',
    }

    // 由星 id 决定取哪个颜色（同一次打开里稳定，不会闪）
    function 彩号(星) {
      const t = String(星.id || 星.title || '')
      let h = 2166136261
      for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
      return h % 彩盘.length
    }

    function 星色(星) {
      if (星 && 星.kind === 'diary') {
        const 月 = Number(String(星.date || '').slice(5, 7))
        return 月色[月] || '#35c7ad'
      }
      return 彩盘[彩号(星)] || '#b9c6e8'
    }

    function 时间轴可见(星, 截止, 视觉时序, 进度) {
      if (!星 || !截止) return true
      const 日期 = String(星.事件日 || (星.kind === 'diary' ? 星.date : '') || '')
      if (/^\d{4}-\d{2}-\d{2}$/.test(日期)) return Date.parse(日期 + 'T00:00:00Z') <= 截止
      if (星.kind === 'diary') return true
      const 序 = 视觉时序 && 视觉时序.get(星.id)
      return 序 === undefined || 序 <= 进度
    }

    function 造随机(种子) {
      let a = 种子 >>> 0
      const 随 = () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
      随.区间 = (lo, hi) => lo + 随() * (hi - lo)
      随.高斯 = () => {
        let u = 0
        let v = 0
        while (!u) u = 随()
        while (!v) v = 随()
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
      }
      return 随
    }

    // ── 图标 ────────────────────────────────────────────
    function 图标(props) {
      const 尺 = props && props.size ? props.size : 18
      const 亮 = props && props.active
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: 尺, height: 尺, 'aria-hidden': true, style: { display: 'block' } },
        h('path', {
          d: 'M4.6 15.2L9.2 6.7l5.1 4.7 5.1-5.4',
          fill: 'none', stroke: 'currentColor', strokeWidth: 0.85,
          strokeLinecap: 'round', strokeLinejoin: 'round', opacity: 亮 ? 0.5 : 0.32,
        }),
        h('circle', { cx: 4.6, cy: 15.2, r: 2.05, fill: 'currentColor', opacity: 亮 ? 1 : 0.72 }),
        h('circle', { cx: 9.2, cy: 6.7, r: 1.25, fill: 'currentColor', opacity: 亮 ? 0.95 : 0.52 }),
        h('circle', { cx: 14.3, cy: 11.4, r: 1.5, fill: 'currentColor', opacity: 亮 ? 0.9 : 0.48 }),
        h('circle', { cx: 19.4, cy: 6, r: 1.05, fill: 'currentColor', opacity: 亮 ? 0.8 : 0.4 }),
      )
    }

    // ── 摆位：一团散开的星云，从中间那颗往外 ──────────────
    const 章序 = [7, 2, 3, 5, 6, 4, 8]
    const 簇半径 = { 7: 150, 2: 215, 3: 285, 5: 350, 6: 415, 4: 475, 8: 535 }

    function 摆位(星们) {
      const n = 星们.length
      const 号 = new Map()
      星们.forEach((s, i) => 号.set(s.id, i))
      const 随 = 造随机(20260816)
      const x = new Float64Array(n)
      const y = new Float64Array(n)
      const z = new Float64Array(n)
      const 本体 = new Float64Array(n).fill(12)

      // ⭐ 全随机：每颗星在球体里随便一个位置，**不分章、不分团、不分区**
      //   （用户要的：位置也随机，不是一块一块的）
      const 半径 = 520
      for (let i = 0; i < n; i++) {
        // 球内均匀采样：方向均匀 + 半径按 cbrt 分布
        const u = 随() * 2 - 1
        const φ = Math.acos(u)
        const θ = 随() * Math.PI * 2
        const r = 半径 * Math.cbrt(随())
        x[i] = Math.sin(φ) * Math.cos(θ) * r
        y[i] = Math.cos(φ) * r
        z[i] = Math.sin(φ) * Math.sin(θ) * r
        const s = 星们[i]
        // 大小：跟内容量有关，但乘一个随机数，别整齐
        本体[i] = (s.kind === 'diary' ? 8 : 10) + Math.min(12, Math.log10(1 + String(s.text || '').length) * 5) * (0.6 + 随() * 0.9)
      }

      // ⭐ 规则（对所有档案都成立）：
      //   1. 第一章首条核心记忆：最大最亮
      //   2. 每章的第一条：比普通条目大一档，好认
      //   3. 同章的星互连最近的 2 颗 → 有脉络，不是一盘散沙
      let 核心 = 0
      const 章首 = new Map()
      for (let i = 0; i < n; i++) {
        const s = 星们[i]
        if (s.kind !== 'card') continue
        const c = Number(s.chapter) || 0
        if (c && !章首.has(c)) 章首.set(c, i)
      }
      const 一 = 星们.findIndex((s) => s.kind === 'card' && Number(s.chapter) === 1)
      if (一 >= 0) {
        核心 = 一
        x[核心] = 0
        y[核心] = 0
        z[核心] = 0
        本体[核心] = 44
      }
      for (const [, i] of 章首) {
        if (i === 核心) continue
        本体[i] = Math.max(本体[i], 24)
      }

      // 同章近邻线：每颗星连到同章最近的 2 颗（太远的不连）
      const 按章 = new Map()
      for (let i = 0; i < n; i++) {
        const s = 星们[i]
        if (s.kind !== 'card' || !s.chapter) continue
        const c = Number(s.chapter)
        if (!按章.has(c)) 按章.set(c, [])
        按章.get(c).push(i)
      }
      const 线 = []
      const 连过 = new Set()
      const 最远 = 210
      for (const [c, idxs] of 按章) {
        for (const i of idxs) {
          const 距 = []
          for (const j of idxs) {
            if (j === i) continue
            距.push([Math.hypot(x[i] - x[j], y[i] - y[j], z[i] - z[j]), j])
          }
          距.sort((a, b) => a[0] - b[0])
          for (let k = 0; k < Math.min(2, 距.length); k++) {
            const d = 距[k][0]
            const j = 距[k][1]
            if (d > 最远) continue
            const 键 = i < j ? i + '-' + j : j + '-' + i
            if (连过.has(键)) continue
            连过.add(键)
            线.push({ a: i, b: j, c, 距: d })
          }
        }
      }

      return { x, y, z, 本体, 号, 核心, 线, 线组: [], 章心: new Map(), 章表: new Map() }
    }

    // ── 贴图 ────────────────────────────────────────────
    function 造星点(色) {
      const c = document.createElement('canvas')
      c.width = 64
      c.height = 64
      const g = c.getContext('2d')
      const 渐 = g.createRadialGradient(32, 32, 0, 32, 32, 32)
      // 所有星点共用同一种圆形珠光造型，只有颜色、尺寸与亮度不同。
      渐.addColorStop(0, 透明(色, 1))
      渐.addColorStop(0.055, 透明(色, 0.98))
      渐.addColorStop(0.16, 透明(色, 0.78))
      渐.addColorStop(0.38, 透明(色, 0.32))
      渐.addColorStop(0.68, 透明(色, 0.085))
      渐.addColorStop(1, 透明(色, 0))
      g.fillStyle = 渐
      g.fillRect(0, 0, 64, 64)
      const 核光 = g.createRadialGradient(32, 32, 0, 32, 32, 7)
      核光.addColorStop(0, 'rgba(255,255,255,0.84)')
      核光.addColorStop(0.28, 'rgba(255,255,255,0.34)')
      核光.addColorStop(1, 'rgba(255,255,255,0)')
      g.globalCompositeOperation = 'screen'
      g.fillStyle = 核光
      g.beginPath()
      g.arc(32, 32, 7, 0, Math.PI * 2)
      g.fill()
      return c
    }

    function 造背景() {
      const 随 = 造随机(911)
      const 尘 = []
      // 细微星尘为主，少量针尖亮星拉开景深；避免满屏颗粒造成噪声。
      for (let i = 0; i < 600; i++) {
        const 亮星 = i < 24
        尘.push({
          u: 随(), v: 随(),
          r: 亮星 ? 0.8 + 随() * 1.1 : 0.35 + 随() * 0.8,
          a: 亮星 ? 0.16 + 随() * 0.2 : 0.018 + Math.pow(随(), 2) * 0.12,
          亮星,
          色: ['#b9d4ff', '#9de6e0', '#f1c4ff', '#ffe0aa'][Math.floor(随() * 4)],
          相位: 随() * Math.PI * 2,
        })
      }
      // 星云做成细长、低对比的漫反射光带，不再是突兀的大色块。
      const 云 = [
        { u: 0.23, v: 0.28, 半径: 0.5, 色: '#415fae', 强: 0.055 },
        { u: 0.78, v: 0.72, 半径: 0.42, 色: '#824b91', 强: 0.047 },
        { u: 0.75, v: 0.23, 半径: 0.32, 色: '#277f83', 强: 0.04 },
        { u: 0.42, v: 0.82, 半径: 0.3, 色: '#a55c46', 强: 0.026 },
      ]

      return { 尘, 云, 带宽: 0.12 }
    }

    const 焦 = 2400

    function 投影(x, y, z, 转, 俯, 缩, 宽, 高) {
      const c1 = Math.cos(转)
      const s1 = Math.sin(转)
      const X1 = x * c1 + z * s1
      const Z1 = -x * s1 + z * c1
      const c2 = Math.cos(俯)
      const s2 = Math.sin(俯)
      const Y2 = y * c2 - Z1 * s2
      const Z2 = y * s2 + Z1 * c2
      const k = (焦 / (焦 + Z2)) * 缩
      return { X: 宽 / 2 + X1 * k, Y: 高 / 2 + Y2 * k, k, Z: Z2, X1, Y2 }
    }

    // ── 星图画布（主区里的一块）─────────────────────────
    function 星图({ 图, 选中, 设选中 }) {
      const 画布ref = useRef(null)
      const 容器 = useRef(null)
      const 机位 = useRef({ 转: 0.42, 俯: -0.68, 缩: 0.6, 宽: 600, 高: 500 })
      const 适配缩 = useRef(0.6)
      const 拖 = useRef(null)
      const 自动缩 = useRef(true)
      const 位 = useRef(null)
      const 悬停ref = useRef(null)
      const 态ref = useRef({ 选中: null })
      // ⭐ 底部检索栏：输入关键词，命中的星亮、其余变暗
      const [搜, 设搜] = useState('')
      const [年轮, 设年轮] = useState(0)
      const [播放, 设播放] = useState(false)
      const 年轮ref = useRef(0)
      年轮ref.current = 年轮
      const 播放ref = useRef(false)
      播放ref.current = 播放
      const 时间资料ref = useRef(null)
      const 时间输入ref = useRef(null)
      const [连线开, 设连线开] = useState(() => {
        try { return localStorage.getItem('dsh-xingxi-lines') !== 'off' } catch { return true }
      })
      const 连线ref = useRef(连线开)
      连线ref.current = 连线开
      const 切换连线 = () => 设连线开((旧) => {
        const 新 = !旧
        try { localStorage.setItem('dsh-xingxi-lines', 新 ? 'on' : 'off') } catch {}
        return 新
      })
      const 搜ref = useRef('')
      const 时间资料 = useMemo(() => {
        const 星们 = 图 && Array.isArray(图.星) ? 图.星 : []
        const 全日期星 = 星们.filter((星) => /^\d{4}-\d{2}-\d{2}$/.test(String(星.事件日 || (星.kind === 'diary' ? 星.date : '') || '')))
        const 有日期 = (星) => /^\d{4}-\d{2}-\d{2}$/.test(String(星.事件日 || (星.kind === 'diary' ? 星.date : '') || ''))
        const 无日期卡 = 星们.filter((星) => 星.kind === 'card' && !有日期(星))
        const 取日 = (星) => 星.kind === 'diary' ? 星.date : 星.事件日
        const 日记日期们 = 全日期星.filter((星) => 星.kind === 'diary').map(取日).sort()
        const 日期们 = 全日期星.map(取日).sort()
        // 日记是时间线基准；更早的记忆卡事件只作为已发生的背景，不把时间轴起点往前拖。
        const 最早 = 日记日期们[0] || 日期们[0] || ''
        const 最晚 = 日期们[日期们.length - 1] || ''
        const 数字 = (日) => {
          const [年, 月, 天] = 日.split('-').map(Number)
          return Date.UTC(年, 月 - 1, 天)
        }
        const 有真实日期 = 日期们.length > 0
        const 从 = 最早 ? 数字(最早) : 1
        const 真实最晚 = 最晚 ? 数字(最晚) : 0
        const 滑动最晚 = Math.max(真实最晚, 从 + 86400000)
        return { 数量: 全日期星.length + 无日期卡.length, 有真实日期, 有日期数: 全日期星.length, 无日期卡数: 无日期卡.length, 无日期卡, 最早: 从, 最晚: 滑动最晚, 真实最晚, 最早日: 最早, 最晚日: 最晚 }
      }, [图])
      const 全量视图 = () => {
        年轮ref.current = 0
        设年轮(0)
        设播放(false)
      }
      const 视觉时序 = useMemo(() => {
        const 卡们 = 时间资料.无日期卡
        const 可排 = 卡们.filter((星) => Number(星.chapter) > 0)
        const 章节 = [...new Set(可排.map((星) => Number(星.chapter)))].sort((a, b) => a - b)
        const 每章 = new Map(章节.map((章) => [章, 可排.filter((星) => Number(星.chapter) === 章).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.id).localeCompare(String(b.id)))]))
        const 顺序 = new Map()
        章节.forEach((章, 章序) => {
          const 列表 = 每章.get(章) || []
          列表.forEach((星, 项序) => 顺序.set(星.id, 0.08 + ((章序 + (项序 + 1) / (列表.length + 1)) / Math.max(1, 章节.length)) * 0.84))
        })
        const 未分章 = 卡们.filter((星) => !顺序.has(星.id)).sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')))
        未分章.forEach((星, i) => 顺序.set(星.id, 0.12 + (i + 1) / (未分章.length + 1) * 0.76))
        return 顺序
      }, [时间资料])
      const 年轮进度 = 年轮 <= 0 ? 1 : Math.max(0, Math.min(1, (年轮 - 时间资料.最早) / Math.max(1, 时间资料.最晚 - 时间资料.最早)))
      function 日期文字(戳) {
        if (!戳) return ''
        const d = new Date(Number(戳))
        if (Number.isNaN(d.getTime())) return ''
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0')
      }
      const 年轮状态 = 年轮 <= 0 ? '' : 时间资料.有真实日期 ? 日期文字(Math.min(年轮, 时间资料.真实最晚 || 年轮)) : Math.round(年轮进度 * 100) + '%'
      const 年轮进度ref = useRef(年轮进度)
      年轮进度ref.current = 年轮进度
      const 视觉时序ref = useRef(视觉时序)
      视觉时序ref.current = 视觉时序

      const 开始年轮 = () => {
        const t = 时间资料ref.current
        if (!t || !t.数量) return
        const 当前 = 年轮ref.current
        const 从头 = 当前 === 0 || 当前 >= t.最晚
        const 起 = 从头 ? t.最早 : 当前
        年轮ref.current = 起
        设年轮(起)
        设播放(起 < t.最晚)
      }
      const 拉年轮 = (值) => {
        const t = 时间资料ref.current
        if (!t) return
        const v = Math.max(t.最早, Math.min(t.最晚, Number(值) || t.最早))
        年轮ref.current = v
        设年轮(v)
        设播放(false)
      }
      useEffect(() => {
        年轮ref.current = 0
        设年轮(0)
        设播放(false)
      }, [图 && 图.会话])
      const 搜命中数 = useMemo(() => {
        const 词 = 搜.trim()
        if (!图 || !Array.isArray(图.星)) return null
        if (!词) return 图.星.length
        const 查 = 词.toLocaleLowerCase()
        return 图.星.reduce((总, 星) => 总 + (String(星.title || '').toLocaleLowerCase().includes(查) || String(星.text || '').toLocaleLowerCase().includes(查) ? 1 : 0), 0)
      }, [图, 搜])

      const 摆好 = useMemo(() => {
        if (!图 || !图.星 || !图.星.length) return null
        return 摆位(图.星)
      }, [图])

      useEffect(() => {
        位.current = 摆好
        自动缩.current = true
      }, [摆好])

      useEffect(() => {
        态ref.current.选中 = 选中
      }, [选中])

      useEffect(() => {
        if (时间输入ref.current && 时间资料.数量) {
          时间输入ref.current.value = String(年轮 > 0 ? Math.max(时间资料.最早, Math.min(时间资料.最晚, 年轮)) : 时间资料.最晚)
        }
      }, [年轮, 时间资料])

      const 贴图 = useMemo(() => {
        const m = {}
        // 宝石色盘与月份色分别缓存统一的圆形星点贴图。
        m.彩 = 彩盘.map((c) => 造星点(c))
        for (const k of Object.keys(章色)) m[k] = 造星点(章色[k])
        for (const k of Object.keys(月色)) m['m' + k] = 造星点(月色[k])
        m.默认 = 造星点('#eaf0ff')
        m.核心 = 造星点('#ffe6a1')
        return m
      }, [])
      const 背景 = useMemo(() => 造背景(), [])

      useEffect(() => {
        const 布 = 画布ref.current
        if (!布) return
        const 笔 = 布.getContext('2d')
        let 停 = false
        let 帧 = 0

        const 定缩 = () => {
          const p = 位.current
          const 框 = 容器.current
          if (!p || !框 || !自动缩.current) return
          const { 转, 俯 } = 机位.current
          const w = 框.clientWidth
          const ht = 框.clientHeight
          if (!w || !ht) return
          let 边X = 1
          let 边Y = 1
          for (let i = 0; i < p.x.length; i++) {
            const q = 投影(p.x[i], p.y[i], p.z[i], 转, 俯, 1, 0, 0)
            const k = 焦 / (焦 + q.Z)
            边X = Math.max(边X, Math.abs(q.X1 * k))
            边Y = Math.max(边Y, Math.abs(q.Y2 * k))
          }
          机位.current.缩 = Math.min((0.48 * w) / 边X, (0.48 * ht) / 边Y)
          适配缩.current = 机位.current.缩
        }

        const 量尺寸 = () => {
          const 框 = 容器.current
          if (!框) return
          const dpr = Math.min(window.devicePixelRatio || 1, 2)
          const w = 框.clientWidth
          const ht = 框.clientHeight
          机位.current.宽 = w
          机位.current.高 = ht
          布.width = Math.max(1, Math.floor(w * dpr))
          布.height = Math.max(1, Math.floor(ht * dpr))
          布.style.width = w + 'px'
          布.style.height = ht + 'px'
          笔.setTransform(dpr, 0, 0, dpr, 0, 0)
          定缩()
        }
        量尺寸()
        const 观 = new ResizeObserver(量尺寸)
        if (容器.current) 观.observe(容器.current)

      // ⭐ 自己慢慢转：不拖的时候每帧转一点点（一圈约 4 分钟，几乎察觉不到但一直是活的）
      //   拖着、或者正悬停在某颗星上时停转，免得看的时候在动
      const 自转 = () => {
      if (拖.current || 悬停ref.current) return
      机位.current.转 += 0.00016
      }
      const 时间步 = () => {
        const t = 时间资料ref.current
        if (!t || !播放ref.current || !t.数量) return
        const 幅 = Math.max(0, t.最晚 - t.最早)
        const 步 = Math.max(1, 幅 / 360)
        const 下个 = Math.min(t.最晚, 年轮ref.current + 步)
        if (下个 >= t.最晚) {
          年轮ref.current = t.最晚
          设年轮(t.最晚)
          设播放(false)
        } else {
          年轮ref.current = 下个
          设年轮(下个)
        }
      }
      时间资料ref.current = 时间资料.数量
        ? { 数量: 时间资料.数量, 最早: 时间资料.最早, 最晚: 时间资料.最晚 }
        : null

        const 画 = () => {
          if (停) return
          自转()   // 自己慢慢转，拖着/悬停时停
          if (播放ref.current) 时间步()
          const { 转, 俯, 缩, 宽, 高 } = 机位.current
          const p = 位.current
          const 数 = 图
          const 态 = 态ref.current
          笔.clearRect(0, 0, 宽, 高)

          // 银河带
          笔.save()
          笔.translate(宽 / 2, 高 / 2)
          笔.rotate(-0.34)
          const 带 = 笔.createLinearGradient(0, -高 * 背景.带宽, 0, 高 * 背景.带宽)
          带.addColorStop(0, 'rgba(120,160,230,0)')
          带.addColorStop(0.28, 'rgba(132,166,226,0.018)')
          带.addColorStop(0.5, 'rgba(172,195,244,0.058)')
          带.addColorStop(0.72, 'rgba(132,166,226,0.018)')
          带.addColorStop(1, 'rgba(120,160,230,0)')
          笔.fillStyle = 带
          笔.fillRect(-宽, -高, 宽 * 2, 高 * 2)
          笔.restore()

          笔.globalCompositeOperation = 'screen'
          for (let ci = 0; ci < 背景.云.length; ci++) {
            const 云 = 背景.云[ci]
            const 漂 = performance.now() / 1000
            const cx = ((云.u + Math.sin(漂 * 0.035 + ci) * 0.018) % 1) * 宽
            const cy = ((云.v + Math.cos(漂 * 0.03 + ci * 1.7) * 0.014) % 1) * 高
            const r = 云.半径 * Math.min(宽, 高)
            笔.save()
            笔.translate(cx, cy)
            笔.rotate(-0.34 + ci * 0.08)
            笔.scale(1.65, 0.48)
            const g = 笔.createRadialGradient(0, 0, 0, 0, 0, r)
            const 呼吸 = 0.97 + 0.03 * Math.sin(漂 * 0.12 + ci * 1.3)
            g.addColorStop(0, 透明(云.色, 云.强 * 呼吸))
            g.addColorStop(0.55, 透明(云.色, 云.强 * 0.34))
            g.addColorStop(1, 透明(云.色, 0))
            笔.fillStyle = g
            笔.beginPath()
            笔.arc(0, 0, r, 0, Math.PI * 2)
            笔.fill()
            笔.restore()
          }
          笔.globalCompositeOperation = 'lighter'
          // ── 动态背景 ──────────────────────────────────────
          //   · 星尘自己缓慢流动（跟镜头无关，镜头动时再叠一层视差）
          //   · 每颗微尘按自己的相位呼吸，像夜里慢慢闪的星
          //   · 星云极慢地漂移 + 明暗起伏
          const 秒 = performance.now() / 1000
          for (let k = 0; k < 背景.尘.length; k++) {
            const s = 背景.尘[k]
            const px = (((s.u + 转 * 0.015 + 秒 * 0.0035) % 1) + 1) % 1
            const py = (((s.v + 俯 * 0.02 + 秒 * 0.0025 + 1) % 1) + 1) % 1
            const 闪 = s.亮星
              ? 0.72 + 0.28 * Math.sin(秒 * 0.42 + s.相位)
              : 0.7 + 0.3 * Math.sin(秒 * (0.22 + (k % 9) * 0.025) + s.相位)
            笔.fillStyle = s.色
            笔.globalAlpha = Math.min(s.亮星 ? 0.5 : 0.22, s.a * (0.58 + 0.6 * 闪))
            if (s.亮星) {
              笔.beginPath()
              笔.arc(px * 宽, py * 高, s.r * (0.7 + 0.35 * 闪), 0, Math.PI * 2)
              笔.fill()
            } else {
              笔.fillRect(px * 宽, py * 高, s.r * (0.8 + 0.25 * 闪), s.r * (0.8 + 0.25 * 闪))
            }
          }
          笔.globalAlpha = 1

          if (p && 数) {
            const 时 = performance.now()
            const n = 数.星.length
            const 投 = new Array(n)
            for (let i = 0; i < n; i++) 投[i] = 投影(p.x[i], p.y[i], p.z[i], 转, 俯, 缩, 宽, 高)
            if (p.核心 >= 0 && p.核心 < n && 时间轴可见(数.星[p.核心], 年轮ref.current, 视觉时序ref.current, 年轮进度ref.current)) {
            const 核 = 投[p.核心] || 投影(0, 0, 0, 转, 俯, 缩, 宽, 高)
            const 核脉动 = 0.97 + 0.03 * Math.sin(performance.now() / 1000 * 0.55)
            const 核r = Math.max(112, 168 * 缩 * 核脉动)
            const 核光 = 笔.createRadialGradient(核.X, 核.Y, 0, 核.X, 核.Y, 核r)
            核光.addColorStop(0, 'rgba(255,238,199,0.28)')
            核光.addColorStop(0.22, 'rgba(255,213,145,0.16)')
            核光.addColorStop(0.56, 'rgba(176,151,255,0.045)')
            核光.addColorStop(1, 'rgba(60,100,180,0)')
            笔.save()
            笔.globalCompositeOperation = 'screen'
            笔.globalAlpha = 0.9
            笔.fillStyle = 核光
            笔.beginPath()
            笔.arc(核.X, 核.Y, 核r, 0, Math.PI * 2)
            笔.fill()
            笔.restore()
            }

            const 焦点 = 态.选中 || 悬停ref.current
            // 焦点星的「邻居」：同章线 + 共享桥牵过手的
            // ⚠ 邻居**一律按星的 id 认**，不要混用数组下标：
            //   数.线 的下标是「摆位后」的，图.桥 的下标是「出图时」的，两套对不上，
            //   混用就会「该亮的被压暗、不相干的被点亮」（用户看到的就是这个）。
            let 邻 = null
            let 焦号 = -1
            if (焦点 && 连线ref.current) {
              邻 = new Set([焦点])
              const 取号 = (i) => {
                const st = 数.星 && 数.星[i]
                return st ? st.id : null
              }
              const 取桥号 = (i) => {
                const st = (数.星 && 数.星[i]) || (图.星 && 图.星[i])
                return st ? st.id : null
              }
              if (数.号) 焦号 = 数.号.get(焦点) === undefined ? -1 : 数.号.get(焦点)
              if (连线ref.current) {
                for (const l of 数.线 || []) {
                  if (l.a === 焦号) 邻.add(取号(l.b))
                  if (l.b === 焦号) 邻.add(取号(l.a))
                }
                for (const b of 图.桥 || []) {
                  if (取桥号(b.a) === 焦点) 邻.add(取桥号(b.b))
                  if (取桥号(b.b) === 焦点) 邻.add(取桥号(b.a))
                }
              }
            }

            // ⭐ 章球 → 章下每一颗小球：一根线连回去，像星座挂在它那颗主星上
            if (连线ref.current && 数.线组 && 数.线组.length) {
              const 焦点章 = (() => {
                const 焦 = 数.星 && 焦点 ? 数.星[数.号.get(焦点)] : null
                return 焦 && 焦.kind === 'card' ? Number(焦.chapter || 0) : 0
              })()
              for (const 组 of 数.线组) {
                const 亮 = 焦点章 !== 0 && 焦点章 === 组.c
                const 色 = 章色[组.c] || '#b9c6e8'
                const 心投 = 投影(组.心[0], 组.心[1], 组.心[2], 转, 俯, 缩, 宽, 高)
                笔.strokeStyle = 透明(色, 亮 ? 0.9 : 焦点 ? 0.08 : 0.22)
                笔.lineWidth = 亮 ? 1.55 : 0.82
                for (const i of 组.标) {
                  if (!时间轴可见(数.星[i], 年轮ref.current, 视觉时序ref.current, 年轮进度ref.current)) continue
                  const q = 投[i]
                  笔.beginPath()
                  笔.moveTo(心投.X, 心投.Y)
                  笔.lineTo(q.X, q.Y)
                  笔.stroke()
                }
              }
            }

            // ⭐ 同章近邻线：同一章的星连最近的几颗，淡淡的，有脉络
            if (连线ref.current && 数.线 && 数.线.length) {
              for (const l of 数.线) {
                const a星 = 数.星[l.a]
                const b星 = 数.星[l.b]
                if (!时间轴可见(a星, 年轮ref.current, 视觉时序ref.current, 年轮进度ref.current) || !时间轴可见(b星, 年轮ref.current, 视觉时序ref.current, 年轮进度ref.current)) continue
                const a = 投[l.a]
                const b = 投[l.b]
                if (!a || !b) continue
                const 亮 = 焦点 && (a星.id === 焦点 || b星.id === 焦点)
                const 色 = 章色[l.c] || '#b5c4e8'
                笔.strokeStyle = 透明(色, 亮 ? 0.94 : 焦点 ? 0.07 : 0.2)
                笔.lineWidth = 亮 ? 1.7 : 0.82
                笔.beginPath()
                笔.moveTo(a.X, a.Y)
                笔.lineTo(b.X, b.Y)
                笔.stroke()
              }
            }

            // ⭐ 共享桥：两颗星提到同一个少见的词（「平潭」「小娇娇」那种）就牵一根橙线。
            //   默认极淡，点某颗星时才把它那几根亮起来。
            if (连线ref.current && 图.桥 && 图.桥.length) {
              for (const b of 图.桥) {
                const ia = 数.号 ? 数.号.get(数.星[b.a] && 数.星[b.a].id) : undefined
                const ib = 数.号 ? 数.号.get(数.星[b.b] && 数.星[b.b].id) : undefined
                const a = ia === undefined ? b.a : ia
                const c = ib === undefined ? b.b : ib
                if (a === undefined || c === undefined) continue
                if (!时间轴可见(数.星[a], 年轮ref.current, 视觉时序ref.current, 年轮进度ref.current) || !时间轴可见(数.星[c], 年轮ref.current, 视觉时序ref.current, 年轮进度ref.current)) continue
                if (投[a] === undefined || 投[c] === undefined) continue
                const 亮 = 焦点 && (数.星[a].id === 焦点 || 数.星[c].id === 焦点)
                笔.strokeStyle = 亮 ? 'rgba(255,198,130,0.78)' : 焦点 ? 'rgba(255,190,120,0.025)' : 'rgba(255,190,120,0.08)'
                笔.lineWidth = 亮 ? 1.35 : 0.6
                笔.beginPath()
                笔.moveTo(投[a].X, 投[a].Y)
                笔.lineTo(投[c].X, 投[c].Y)
                笔.stroke()
              }
            }

            if (连线ref.current && 焦点 && 数.线) {
              笔.lineWidth = 1.2
              for (const l of 数.线) {
                if (l.a !== 焦点 && l.b !== 焦点) continue
                if (l.type !== 'ref' && l.type !== 'similar') continue
                const a = p.号.get(l.a)
                const b = p.号.get(l.b)
                if (a === undefined || b === undefined) continue
                笔.strokeStyle = l.type === 'ref' ? 'rgba(255,200,130,0.42)' : 'rgba(255,255,255,0.3)'
                笔.setLineDash(l.type === 'ref' ? [2, 4] : [])
                笔.beginPath()
                笔.moveTo(投[a].X, 投[a].Y)
                笔.lineTo(投[b].X, 投[b].Y)
                笔.stroke()
              }
              笔.setLineDash([])
            }

            const 顺序 = []
            for (let i = 0; i < n; i++) 顺序.push(i)
            顺序.sort((a, b) => 投[b].Z - 投[a].Z)
            for (const i of 顺序) {
              const 星 = 数.星[i]
              const q = 投[i]
              const 色 = 星色(星)
              const 月 = Number((星.date || '').slice(5, 7))
              const 键基 = 星.kind === 'card' ? String(星.chapter || 99) : 'm' + 月
              const 本体 = p.本体[i]
              // 中心星仍使用自己的淡色调；所有星点统一为圆形，章节代表星仅由尺寸突出。
              const 是核心 = i === p.核心
              const 图块 = 是核心
                ? 贴图.核心
                : 星.kind === 'diary'
                  ? (贴图['m' + 月] || 贴图.默认)
                  : (贴图.彩 && 贴图.彩[彩号(星)]) || 贴图.默认
              const 深 = 焦 / (焦 + q.Z)
              // 完整事件日期按真实日期筛选；未标日期的记忆卡按章节视觉顺序渐显。
              if (!时间轴可见(星, 年轮ref.current, 视觉时序ref.current, 年轮进度ref.current)) continue
              // ⭐ 能量：越新越亮，越久越暗（化石态是「暗但不消失」）
              const 天 = 星.时 ? (Date.now() - 星.时) / 86400000 : 120
              const 能量 = 0.42 + 0.58 * Math.exp(-Math.max(0, 天) / 110)
              // ⭐ 呼吸：每颗星按自己的相位轻微明灭（周期 4~7 秒，幅度只有 8%）
              // 用稳定相位而非数组下标调制呼吸，切换会话时不出现整片同步闪动。
              const 相位 = 彩号(星) * 2.399
              const 呼 = 0.965 + 0.035 * Math.sin(时 / 1000 * (0.42 + (彩号(星) % 7) * 0.025) + 相位)
              // 检索：有词的时候，命中的保持原样，不命中的压到很暗
              const 词 = 搜ref.current.trim()
              const 查词 = 词.toLocaleLowerCase()
              const 命中 = 词
                ? String(星.title || '').toLocaleLowerCase().includes(查词) || String(星.text || '').toLocaleLowerCase().includes(查词)
                : true
              let 大小 = Math.max(7, 本体 * (0.8 + 0.5 * 缩) * 深 * 呼)
              if (词 && !命中) 大小 *= 0.55
              if (星.kind !== 'card') 大小 *= 0.85      // 日记整体再收一点，跟分支拉开
              // 关联的星：稍微大一点（光晕太丑，去掉）
              if (邻 && 邻.has(星.id) && 星.id !== 焦点) 大小 *= 1.12
              if (是核心) 大小 *= 1.2
              if (态.选中 === 星.id) 大小 *= 1.7
              else if (悬停ref.current === 星.id) 大小 *= 1.3
              const 星透明 =
                Math.min(1, (0.84 + 深 * 0.22) * 呼 * 能量) *
                (词 && !命中 ? 0.22 : 1) *
                // 聚焦时：关联的亮起来，别的一起暗下去（暗才看得清）
                (邻 ? (邻.has(星.id) ? 1 : 0.32) : 1) *
                (是核心 ? 1 : 1)
              笔.globalCompositeOperation = 'source-over'
              笔.globalAlpha = 星透明
              // 选中和悬停只给焦点星一圈精致的色晕，其余星点保持干净。
              if (态.选中 === 星.id || 悬停ref.current === 星.id) {
                笔.save()
                笔.globalCompositeOperation = 'screen'
                笔.globalAlpha = 星透明 * (态.选中 === 星.id ? 0.28 : 0.17)
                const 光r = 大小 * (态.选中 === 星.id ? 1.9 : 1.45)
                const 光 = 笔.createRadialGradient(q.X, q.Y, 0, q.X, q.Y, 光r)
                光.addColorStop(0, 透明(色, 0.65))
                光.addColorStop(0.4, 透明(色, 0.2))
                光.addColorStop(1, 透明(色, 0))
                笔.fillStyle = 光
                笔.beginPath()
                笔.arc(q.X, q.Y, 光r, 0, Math.PI * 2)
                笔.fill()
                笔.restore()
              }
              笔.globalAlpha = 星透明
              笔.drawImage(图块, q.X - 大小 / 2, q.Y - 大小 / 2, 大小, 大小)
              // 第一章核心记忆用独立白金光晕成为全图的视觉锚点。
              if (是核心) {
                笔.save()
                笔.globalCompositeOperation = 'screen'
                const 环r = Math.max(15, 大小 * 2.05)
                const 脉动 = 0.96 + 0.04 * Math.sin(时 / 1000 * 0.72)
                笔.globalAlpha = 星透明 * 0.32 * 脉动
                const 环 = 笔.createRadialGradient(q.X, q.Y, 大小 * 0.08, q.X, q.Y, 环r)
                环.addColorStop(0, 'rgba(255,247,220,0.88)')
                环.addColorStop(0.18, 'rgba(255,226,164,0.44)')
                环.addColorStop(0.48, 'rgba(255,197,108,0.16)')
                环.addColorStop(1, 'rgba(255,190,110,0)')
                笔.fillStyle = 环
                笔.beginPath()
                笔.arc(q.X, q.Y, 环r, 0, Math.PI * 2)
                笔.fill()
                笔.restore()
              }
            }
            笔.globalAlpha = 1
            笔.globalCompositeOperation = 'source-over'

            if (态.选中 && p.号.get(态.选中) !== undefined) {
              const si = p.号.get(态.选中)
              const q = 投[si]
              const 选色 = 星色(数.星[si])
              const 选r = Math.max(10, p.本体[si] * (0.8 + 0.5 * 缩) * 焦 / (焦 + q.Z) * 0.72)
              笔.save()
              笔.globalCompositeOperation = 'source-over'
              笔.strokeStyle = 透明(选色, 0.9)
              笔.lineWidth = 1.15
              笔.beginPath()
              笔.arc(q.X, q.Y, 选r, 0, Math.PI * 2)
              笔.stroke()
              笔.strokeStyle = 'rgba(236,242,255,0.34)'
              笔.lineWidth = 0.7
              笔.beginPath()
              笔.arc(q.X, q.Y, 选r + 3, 0, Math.PI * 2)
              笔.stroke()
              笔.restore()
            }
          } else {
            // 没有档案：一颗几乎熄掉的星
            笔.globalCompositeOperation = 'lighter'
            const 暗 = 笔.createRadialGradient(宽 / 2, 高 / 2, 0, 宽 / 2, 高 / 2, 26)
            暗.addColorStop(0, 'rgba(150,170,210,0.5)')
            暗.addColorStop(0.35, 'rgba(120,145,200,0.16)')
            暗.addColorStop(1, 'rgba(100,130,190,0)')
            笔.fillStyle = 暗
            笔.beginPath()
            笔.arc(宽 / 2, 高 / 2, 26, 0, Math.PI * 2)
            笔.fill()
            笔.globalCompositeOperation = 'source-over'
            笔.fillStyle = 'rgba(150,170,210,0.55)'
            笔.beginPath()
            笔.arc(宽 / 2, 高 / 2, 1.8, 0, Math.PI * 2)
            笔.fill()
          }

          // 悬停标签
          if (悬停ref.current && p && 数) {
            const i = p.号.get(悬停ref.current)
            if (i !== undefined) {
              const q = 投影(p.x[i], p.y[i], p.z[i], 转, 俯, 缩, 宽, 高)
              const 当前星 = 数.星[i]
              const 文 = String(当前星.title || '（没有标题）').slice(0, 24)
              const 色 = 星色(当前星)
              笔.font = '12px "PingFang SC","Microsoft YaHei",system-ui,sans-serif'
              const w = 笔.measureText(文).width + 34
              const bx = Math.max(6, Math.min(q.X + 12, 宽 - w - 6))
              const by = Math.max(28, q.Y - 28)
              笔.save()
              笔.globalCompositeOperation = 'source-over'
              笔.globalAlpha = 1
              笔.fillStyle = 'rgba(8,13,25,0.94)'
              笔.beginPath()
              笔.roundRect(bx, by, w, 24, 7)
              笔.fill()
              笔.strokeStyle = 透明(色, 0.58)
              笔.lineWidth = 0.8
              笔.stroke()
              笔.fillStyle = 色
              笔.beginPath()
              笔.arc(bx + 9, by + 12, 2.4, 0, Math.PI * 2)
              笔.fill()
              笔.fillStyle = 'rgba(236,242,255,0.96)'
              笔.fillText(文, bx + 16, by + 16)
              笔.restore()
            }
          }

          帧 = requestAnimationFrame(画)
        }
        帧 = requestAnimationFrame(画)
        return () => {
          停 = true
          cancelAnimationFrame(帧)
          观.disconnect()
        }
      }, [图, 摆好, 贴图, 背景])

      const 取最近 = useCallback(
        (px, py) => {
          const p = 位.current
          if (!p || !图) return null
          const { 转, 俯, 缩, 宽, 高 } = 机位.current
          let 最近 = null
          let 最近距 = 16
          for (let i = 0; i < 图.星.length; i++) {
            const q = 投影(p.x[i], p.y[i], p.z[i], 转, 俯, 缩, 宽, 高)
            const d = Math.hypot(q.X - px, q.Y - py)
            if (d < 最近距) {
              最近距 = d
              最近 = 图.星[i]
            }
          }
          return 最近
        },
        [图],
      )

      const 按下 = (e) => {
        拖.current = { x: e.clientX, y: e.clientY, 转: 机位.current.转, 俯: 机位.current.俯, 动: false }
      }
      const 移动 = (e) => {
        const 布 = 画布ref.current
        if (!布) return
        const r = 布.getBoundingClientRect()
        const d = 拖.current
        if (d) {
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 3) d.动 = true
          机位.current.转 = d.转 + dx * 0.006
          机位.current.俯 = Math.max(-1.35, Math.min(1.35, d.俯 + dy * 0.005))
          return
        }
        const 星 = 取最近(e.clientX - r.left, e.clientY - r.top)
        悬停ref.current = 星 ? 星.id : null
        布.style.cursor = 星 ? 'pointer' : 'grab'
      }
      const 松开 = (e) => {
        const d = 拖.current
        拖.current = null
        if (d && !d.动) {
          const 布 = 画布ref.current
          const r = 布.getBoundingClientRect()
          const 星 = 取最近(e.clientX - r.left, e.clientY - r.top)
          设选中(星 ? 星.id : null)
        }
      }
      const 滚轮 = (e) => {
        e.preventDefault()
        自动缩.current = false
        机位.current.缩 = Math.max(0.2, Math.min(3.4, 机位.current.缩 * (e.deltaY > 0 ? 0.92 : 1.08)))
      }
      const 手动缩放 = (倍数) => {
        自动缩.current = false
        机位.current.缩 = Math.max(0.2, Math.min(3.4, 机位.current.缩 * 倍数))
      }
      const 重置视图 = () => {
        机位.current.转 = 0.42
        机位.current.俯 = -0.68
        机位.current.缩 = 适配缩.current
        自动缩.current = true
      }

      useEffect(() => {
        const 布 = 画布ref.current
        if (!布) return
        布.addEventListener('wheel', 滚轮, { passive: false })
        return () => 布.removeEventListener('wheel', 滚轮)
      }, [])

      return h('div', { ref: 容器, style: { position: 'absolute', inset: 0, overflow: 'hidden' } },
        h('canvas', {
          ref: 画布ref,
          style: { display: 'block' },
          onMouseDown: 按下,
          onMouseMove: 移动,
          onMouseUp: 松开,
          onMouseLeave: () => {
            拖.current = null
            悬停ref.current = null
          },
        }),
        // 轻量图例和操作提示：让第一次打开的人一眼知道星点与操作方式。
        h('div', {
          style: {
            position: 'absolute', left: 18, top: 16, pointerEvents: 'none',
            width: 'fit-content', maxWidth: 'min(320px, calc(100% - 36px))', boxSizing: 'border-box',
            padding: '11px 13px', minWidth: 0, borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(14,22,40,0.78), rgba(9,14,27,0.48))',
            border: '1px solid rgba(178,202,255,0.12)',
            boxShadow: '0 8px 28px rgba(0,0,0,0.18)', backdropFilter: 'blur(12px)',
          },
        },
          h('div', { style: { fontSize: 11, letterSpacing: 1.4, color: 'rgba(218,231,255,0.72)' } }, 'MEMORY UNIVERSE'),
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 } },
            h('span', { style: { fontSize: 19, fontWeight: 500, letterSpacing: 0.4, color: '#e4edff' } }, 图 && 图.统计 ? String(图.统计.星 || 0) : '0'),
            h('span', { style: { fontSize: 11, color: 'rgba(205,220,247,0.48)' } }, '颗记忆星'),
            图 && 图.统计 && 图.统计.日
              ? h('span', { style: { fontSize: 10.5, marginLeft: 5, color: 'rgba(176,201,238,0.38)' } }, '· ' + 图.统计.日 + ' 篇日记')
              : null),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 9, paddingTop: 8, borderTop: '1px solid rgba(178,202,255,0.09)' } },
            h('span', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(205,220,247,0.58)' } },
              h('span', { style: { display: 'inline-flex', gap: 2, alignItems: 'center' } },
                ['#4f9eff', '#26c7a4', '#9d70ff', '#ff8548', '#ef5b98', '#a9ce32'].map((色, i) => h('i', { key: i, style: { width: 5, height: 5, borderRadius: 9, background: 色, boxShadow: '0 0 5px ' + 透明(色, 0.38) } }))), '记忆'),
            h('span', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(205,220,247,0.58)' } },
              h('i', { style: { width: 6, height: 6, borderRadius: 9, background: '#35d0a1', boxShadow: '0 0 7px rgba(53,208,161,0.48)' } }), '日记'))),
        h('div', {
          style: {
            position: 'absolute', right: 16, top: 17, pointerEvents: 'auto',
            maxWidth: 'calc(100% - 36px)', boxSizing: 'border-box',
            padding: '9px 10px', borderRadius: 10,
            background: 'rgba(12,19,34,0.5)', border: '1px solid rgba(178,202,255,0.09)',
            color: 'rgba(197,215,246,0.56)', fontSize: 10.5, letterSpacing: 0.2,
            backdropFilter: 'blur(10px)', boxShadow: '0 8px 22px rgba(0,0,0,0.15)',
          },
        },
          h('div', null, '拖动旋转　·　滚轮缩放　·　点击星点'),
          h('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5, marginTop: 7, pointerEvents: 'auto' } },
            h('button', {
              type: 'button', title: '切换星图关系连线', 'aria-label': 连线开 ? '关闭常驻连线' : '开启常驻连线',
              onClick: 切换连线,
              style: {
                height: 24, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 5,
                borderRadius: 7, border: '1px solid ' + (连线开 ? 'rgba(126,208,193,0.24)' : 'rgba(178,202,255,0.12)'),
                background: 连线开 ? 'rgba(55,165,143,0.13)' : 'rgba(154,181,232,0.055)',
                color: 连线开 ? 'rgba(164,231,214,0.9)' : 'rgba(196,211,239,0.58)', fontSize: 10, cursor: 'pointer',
              },
            },
              h('i', { style: { width: 5, height: 5, borderRadius: 99, background: 连线开 ? '#70d9bc' : 'rgba(173,190,220,0.38)', boxShadow: 连线开 ? '0 0 7px rgba(112,217,188,0.5)' : 'none' } }),
              连线开 ? '连线开' : '连线关'),
            h('button', {
              type: 'button', title: '缩小', 'aria-label': '缩小星图', onClick: () => 手动缩放(0.82),
              style: { width: 25, height: 24, borderRadius: 7, border: '1px solid rgba(178,202,255,0.12)', background: 'rgba(154,181,232,0.08)', color: 'rgba(224,235,255,0.7)', fontSize: 15, lineHeight: 1, cursor: 'pointer' },
            }, '−'),
            h('button', {
              type: 'button', title: '放大', 'aria-label': '放大星图', onClick: () => 手动缩放(1.22),
              style: { width: 25, height: 24, borderRadius: 7, border: '1px solid rgba(178,202,255,0.12)', background: 'rgba(154,181,232,0.08)', color: 'rgba(224,235,255,0.7)', fontSize: 15, lineHeight: 1, cursor: 'pointer' },
            }, '+'),
            h('button', {
              type: 'button', title: '恢复初始视角', 'aria-label': '重置星图视角', onClick: 重置视图,
              style: { height: 24, padding: '0 8px', borderRadius: 7, border: '1px solid rgba(178,202,255,0.12)', background: 'rgba(154,181,232,0.08)', color: 'rgba(224,235,255,0.62)', fontSize: 10, cursor: 'pointer' },
            }, '重置'))),
        // 搜索与时间控制并排，使用同一高度和同一浮层样式。
        h('div', { style: {
          position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)',
          width: 'min(720px, calc(100% - 28px))', display: 'flex', alignItems: 'stretch', justifyContent: 'center',
          gap: 8, flexWrap: 'nowrap', pointerEvents: 'none',
        } },
        h('div', {
          style: {
            flex: '1 1 0', minWidth: 0, height: 48, boxSizing: 'border-box',
            display: 'flex', alignItems: 'center', gap: 9, padding: '0 11px', pointerEvents: 'auto',
            background: 'linear-gradient(135deg, rgba(17,25,44,0.88), rgba(9,14,27,0.84))',
            border: '1px solid rgba(163,190,244,0.16)', borderRadius: 10,
            backdropFilter: 'blur(14px)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.035)',
          },
        },
          h('span', { style: { fontSize: 12, opacity: 0.4 } }, '⌕'),
          h('input', {
            value: 搜,
            placeholder: '搜关键词…',
            spellCheck: false,
            onChange: (e) => {
              设搜(e.target.value)
              搜ref.current = e.target.value
            },
            style: {
              flex: 1, minWidth: 0, width: 0, fontSize: 12, fontFamily: 'inherit', color: '#e2ebff',
              background: 'transparent', border: 'none', outline: 'none',
            },
          }),
          搜
            ? h('span', { style: { minWidth: 32, textAlign: 'right', fontSize: 10, color: 搜命中数 ? 'rgba(147,220,195,0.78)' : 'rgba(255,162,143,0.82)' } },
                搜命中数 + ' 条')
            : null,
          搜
            ? h('button', {
                style: { ...小按钮, padding: '2px 8px' },
                onClick: () => {
                  设搜('')
                  搜ref.current = ''
                },
              }, '清')
            : null),
        时间资料.数量
          ? h('div', {
              style: {
                flex: '1 1 0', minWidth: 0, height: 48, boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', gap: 7, padding: '0 9px', pointerEvents: 'auto',
                background: 'linear-gradient(135deg, rgba(17,25,44,0.9), rgba(9,14,27,0.87))',
                border: '1px solid rgba(163,190,244,0.15)', borderRadius: 10, backdropFilter: 'blur(14px)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.035)',
              },
            },
              h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1, width: '100%', height: '100%', minWidth: 0 } },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, width: '100%', minWidth: 0 } },
                h('button', {
                  type: 'button', title: 播放 ? '暂停时间线' : '从最早记忆开始播放', 'aria-label': 播放 ? '暂停时间线' : '播放时间线',
                  onClick: () => 播放 ? 设播放(false) : 开始年轮(),
                  style: {
                    width: 21, height: 20, flex: 'none', borderRadius: 6,
                    border: '1px solid rgba(224,197,137,0.14)',
                    background: 'linear-gradient(135deg, rgba(209,165,89,0.11), rgba(150,113,181,0.08))',
                    color: '#f0d8a3', cursor: 'pointer', fontSize: 9,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
                  },
                }, 播放 ? 'Ⅱ' : '▶'),
                h('input', {
                  ref: 时间输入ref, type: 'range', min: 时间资料.最早, max: 时间资料.最晚,
                  value: 年轮 > 0 ? Math.max(时间资料.最早, Math.min(时间资料.最晚, 年轮)) : 时间资料.最晚,
                  onMouseDown: () => 设播放(false),
                  onTouchStart: () => 设播放(false),
                  onChange: (e) => 拉年轮(e.target.value),
                  'aria-label': '拖动时间线以渐显记忆和日记',
                  'aria-valuetext': 年轮状态 || '显示全部记忆',
                  style: { flex: 1, minWidth: 0, height: 13, accentColor: '#d7b975', cursor: 'pointer' },
                }),
                年轮状态 ? h('span', { style: { flex: 'none', minWidth: 52, textAlign: 'center', fontSize: 8.5, color: 'rgba(225,207,164,0.72)', whiteSpace: 'nowrap' } }, 年轮状态) : null,
                h('button', {
                  type: 'button', onClick: 全量视图, title: '显示全部', 'aria-label': '显示全部星点',
                  style: { width: 22, height: 22, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid rgba(163,190,244,0.1)', background: 'rgba(154,181,232,0.045)', color: 'rgba(206,221,245,0.62)', cursor: 'pointer', fontSize: 13, lineHeight: 1 },
                }, '↺')),
                h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 8, lineHeight: '10px', color: 'rgba(183,201,232,0.34)' } },
                  h('span', null, 时间资料.有真实日期 ? 时间资料.最早日 : '0%'),
                  h('span', null, 时间资料.有真实日期 ? 时间资料.最晚日 : '100%'))))
          : null))
    }

    // ── 列表（星册 / 星历共用）───────────────────────────
    function 列表页({ 星们, 空话, 选中, 设选中, 类型 }) {
      const [词, 设词] = useState('')
      const 查 = 词.trim().toLocaleLowerCase()
      const 结果 = useMemo(() => {
        if (!查) return 星们
        return 星们.filter((s) => {
          const 字段 = [s.title, s.text, s.date, s.chapterName, ...(s.小标题们 || [])]
          return 字段.some((v) => String(v || '').toLocaleLowerCase().includes(查))
        })
      }, [星们, 查])
      const 日记页 = 类型 === '日记' || 星们.some((s) => s.kind === 'diary')
      return h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', minHeight: 0 } },
        h('div', { style: { flex: 'none', padding: '16px 20px 12px', borderBottom: '1px solid rgba(160,185,235,0.08)', background: 'linear-gradient(180deg, rgba(14,21,37,0.7), rgba(8,13,24,0.34))' } },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 11 } },
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', { style: { fontSize: 15, fontWeight: 600, letterSpacing: 0.2, color: '#e7efff' } }, 日记页 ? '星历' : '星册'),
              h('div', { style: { fontSize: 10.5, marginTop: 3, color: 'rgba(192,209,239,0.4)' } }, 日记页 ? '按时间收下的每一天' : '整理好的记忆分支')),
            h('span', { style: { flex: 'none', padding: '4px 8px', borderRadius: 99, fontSize: 10, color: 'rgba(193,213,248,0.58)', background: 'rgba(136,166,225,0.08)', border: '1px solid rgba(158,185,239,0.1)' } },
              查 ? `${结果.length} / ${星们.length} 条` : `${星们.length} 条`)),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(157,185,240,0.13)', background: 'rgba(10,16,29,0.62)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)' } },
            h('span', { style: { color: 'rgba(178,203,244,0.55)', fontSize: 14, lineHeight: 1 } }, '⌕'),
            h('input', {
              type: 'search', value: 词, 'aria-label': 日记页 ? '搜索星历' : '搜索星册',
              placeholder: 日记页 ? '搜日期、标题或日记内容…' : '搜标题、章节或记忆内容…',
              spellCheck: false, onChange: (e) => 设词(e.target.value),
              style: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: '#e0eaff', fontSize: 11.5, fontFamily: 'inherit' },
            }),
            词 ? h('button', {
              type: 'button', onClick: () => 设词(''), title: '清除搜索',
              style: { border: 'none', background: 'transparent', color: 'rgba(196,213,242,0.55)', cursor: 'pointer', fontSize: 13, padding: '0 2px' },
            }, '×') : null)),
        h('div', { style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 20px 22px' } },
          !星们.length
            ? h('div', { style: { padding: '52px 20px', textAlign: 'center', color: 'rgba(204,218,244,0.42)', fontSize: 12, lineHeight: 1.8 } }, 空话)
            : !结果.length
              ? h('div', { style: { padding: '48px 20px', textAlign: 'center', color: 'rgba(204,218,244,0.42)', fontSize: 12, lineHeight: 1.8 } },
                  h('div', { style: { fontSize: 22, marginBottom: 8, opacity: 0.5 } }, '⌕'), '没有找到匹配的', 日记页 ? '日记' : '记忆', '，试试别的关键词。')
              : 结果.map((s) => {
                  const 色 = 星色(s)
                  const 副标 = s.kind === 'diary'
                    ? (s.date || '日记')
                    : (s.chapterName || (s.chapter ? 章名表[s.chapter] : '记忆卡'))
                  return h('div', {
                    key: s.id,
                    onClick: () => 设选中(s.id),
                    style: {
                      position: 'relative', overflow: 'hidden',
                      padding: '12px 14px 12px 16px', marginBottom: 8, borderRadius: 11, cursor: 'pointer',
                      background: 选中 === s.id ? `linear-gradient(110deg, ${透明(色, 0.16)}, rgba(126,90,175,0.1))` : 'linear-gradient(120deg, rgba(255,255,255,0.027), rgba(140,170,230,0.018))',
                      border: '1px solid ' + (选中 === s.id ? 透明(色, 0.32) : 'rgba(157,185,240,0.075)'),
                      boxShadow: 选中 === s.id ? `0 6px 20px ${透明(色, 0.08)}` : '0 3px 12px rgba(0,0,0,0.08)',
                      transition: 'background .16s ease, border-color .16s ease, box-shadow .16s ease',
                    },
                  },
                    h('i', { style: { position: 'absolute', left: 0, top: 9, bottom: 9, width: 2, borderRadius: 4, background: 色, opacity: 选中 === s.id ? 0.92 : 0.48, boxShadow: `0 0 9px ${透明(色, 0.42)}` } }),
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                      h('span', { style: { fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0, color: 'rgba(232,239,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.title || '（没有标题）'),
                      h('span', { style: { flex: 'none', fontSize: 9.5, color: 透明(色, 0.9), padding: '2px 6px', borderRadius: 99, background: 透明(色, 0.09), border: '1px solid ' + 透明(色, 0.12) } }, 副标)),
                    h('div', { style: { fontSize: 11.2, color: 'rgba(197,212,240,0.5)', marginTop: 6, lineHeight: 1.65 } },
                      (s.text || '').replace(/[*#>`]/g, '').replace(/\s+/g, ' ').slice(0, 100) || '（空）'),
                  )
                })))
    }

    // ── 星坊：定规矩的地方（模型 / 文件夹 / 定时 / 关键词）──
    //    本页只放置模型、档案目录和定时写日记设置；拾星进度在对应操作中反馈。
    function 星坊页({ 会话, 图, 刷新, 会话们 }) {
      const [模, 设模] = useState(null)
      const [改夹, 设改夹] = useState(null)
      // 支持手动输入路径，也可通过系统目录选择窗口选择档案文件夹。
      const 选夹 = async () => {
        const 成了 = await 弹窗选夹()
        // ⚠ 只有**真失败**才退成输入框。原来不管成没成都退，
        //   结果存成功后输入框又冒出来、还填着旧路径，看着像"没存上"。
        if (成了 === false) 设改夹(会话 && 会话.目录 ? 会话.目录 : '')
      }

      const 弹窗选夹 = async () => {
        // ⭐ DSH 客户端本来就有选目录的能力（设置页那些「浏览…」就是它）——
        //   必须在这边调，宿主那头调不到。
        try {
          const r = await fetch('/dsh-xingxi/pickdir', { method: 'POST' })
          const j = await r.json()
          if (j.ok && j.目录) return 存夹(j.目录)   // 存夹 会返回 true / false
          设跑({ ok: false, 原因: '系统窗口没给出路径：' + String(j.原因 || '') + '（可以手填）' })
          return false
        } catch (e) {
          设跑({ ok: false, 原因: '系统窗口弹不出来（可以手填）' })
          return false
        }
      }

      const 存夹 = async (路径) => {
        const p = String(路径 || '').trim()
        try {
          const r = await fetch('/dsh-xingxi/bind', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sid: 会话 && 会话.id, 目录: p }),
          })
          const j = await r.json()
          if (!j.ok) {
            设跑({ ok: false, 原因: '存不上：' + String(j.原因 || '') })
            return false
          }
          设改夹(null)
          刷新 && 刷新()
          return true
        } catch (e) {
          设跑({ ok: false, 原因: '存不上：' + String((e && e.message) || e) })
          return false
        }
      }
      useEffect(() => {
        fetch('/dsh-xingxi/models', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => 设模(j))
          .catch(() => 设模({ 错: '读不到模型列表' }))
      }, [])
      const 换模型 = (provider, model) => {
        fetch('/dsh-xingxi/models', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider, model }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => j && 设模(j))
          .catch(() => {})
      }

      const 选中 = (模 && (模.选中的 || 模.默认)) || null
      const 当前家 = 选中 && 模 ? (模.providers || []).find((p) => p.id === 选中.provider) : null

      const 行 = (标, 值, 注) =>
        h('div', { style: 行式 },
          h('span', { style: 标式 }, 标),
          h('span', { style: 值式 }, 值 || '—'),
          注 ? h('span', { style: 注式 }, 注) : null)

      const 卡 = (标题, 副, 内容们) =>
        h('div', { style: 卡片 },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('i', { style: { width: 3, height: 14, borderRadius: 4, background: 'linear-gradient(180deg, #81b7ff, #a787ef)', boxShadow: '0 0 10px rgba(129,183,255,0.26)' } }),
            h('div', { style: { fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3, color: 'rgba(230,239,255,0.9)' } }, 标题)),
          h('div', { style: { fontSize: 11, color: 'rgba(190,207,237,0.46)', marginTop: 5, marginBottom: 12, lineHeight: 1.65, paddingLeft: 11 } }, 副),
          内容们)

      const 下拉 = { fontSize: 11.5, padding: '6px 10px', borderRadius: 8, fontFamily: 'inherit',
        background: 'linear-gradient(135deg, rgba(22,32,54,0.96), rgba(14,22,39,0.96))', color: '#dbe6ff', border: '1px solid rgba(153,181,232,0.19)',
        colorScheme: 'dark', outline: 'none', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)' }   // ⭐ 不加这句，系统弹出的列表是白底，字看不清
      const 选项 = { background: '#101a2e', color: '#dbe6ff' }

      // ── 日记定时 ───────────────────────────────────────
      const [日设, 设日] = useState(null)
      const 日记设置代 = useRef(0)
      useEffect(() => {
        const 代 = ++日记设置代.current
        let 活着 = true
        fetch('/dsh-xingxi/diary', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (!活着 || 日记设置代.current !== 代) return
            设日(j && j.写日记 ? { ...j.写日记, 会话: 会话 && 会话.id ? 会话.id : '' } : { 开: true, 时: 23, 分: 30, 会话: 会话 && 会话.id ? 会话.id : '' })
          })
          .catch(() => {
            if (活着 && 日记设置代.current === 代) 设日({ 开: true, 时: 23, 分: 30, 会话: 会话 && 会话.id ? 会话.id : '' })
          })
        return () => { 活着 = false }
      }, [会话 && 会话.id])
      const 存日 = async (改) => {
        const 新 = { ...(日设 || {}), ...改, 会话: 会话 && 会话.id ? 会话.id : '' }
        设日(新)
        try {
          await fetch('/dsh-xingxi/diary', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(新),
          })
        } catch (e) {}
      }
      useEffect(() => {
        if (会话 && 会话.id && 日设 && 日设.会话 !== 会话.id) 存日({ 会话: 会话.id })
      }, [会话 && 会话.id, 日设 && 日设.会话])
      const 时串 = 日设 ? String(日设.时).padStart(2, '0') + ':' + String(日设.分).padStart(2, '0') : ''

      const 日记卡 = 卡('写日记', '到点提醒当前会话写当日日记，并存进这个会话绑定的档案目录', [
        h('div', { style: { ...行式, borderTop: 'none', paddingTop: 2 } },
          h('span', { style: 标式 }, '几点'),
          h('input', {
            type: 'time',
            value: 时串,
            onChange: (e) => {
              const v = String(e.target.value || '')
              if (!v) return
              const [a, b] = v.split(':')
              存日({ 时: Number(a), 分: Number(b) })
            },
            style: { ...下拉, colorScheme: 'dark', width: 96 },
          }),
          h('div', { style: { ...行式, justifyContent: 'space-between' } },
            h('span', { style: 标式 }, '自动写日记'),
            h('button', {
              type: 'button', role: 'switch', 'aria-checked': Boolean(日设 && 日设.开),
              onClick: () => 存日({ 开: !Boolean(日设 && 日设.开) }),
              style: {
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 5px',
                borderRadius: 999, border: '1px solid ' + (日设 && 日设.开 ? 'rgba(91,213,180,0.3)' : 'rgba(158,181,224,0.16)'),
                background: 日设 && 日设.开 ? 'linear-gradient(110deg, rgba(45,164,135,0.2), rgba(52,116,132,0.14))' : 'rgba(143,160,190,0.075)',
                color: 日设 && 日设.开 ? '#a7ead7' : 'rgba(196,209,232,0.56)',
                fontSize: 10.5, letterSpacing: 0.2, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: 日设 && 日设.开 ? 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 14px rgba(62,180,152,0.08)' : 'none',
                transition: 'all .18s ease',
              },
            },
              h('i', { style: {
                width: 24, height: 14, borderRadius: 99, padding: 2, boxSizing: 'border-box', display: 'flex',
                justifyContent: 日设 && 日设.开 ? 'flex-end' : 'flex-start', alignItems: 'center',
                background: 日设 && 日设.开 ? 'rgba(74,202,162,0.48)' : 'rgba(150,165,190,0.3)',
                transition: 'all .18s ease',
              } },
                h('i', { style: { width: 10, height: 10, borderRadius: 99, background: 日设 && 日设.开 ? '#d8fff1' : '#c2ccdd', boxShadow: 日设 && 日设.开 ? '0 0 8px rgba(171,255,224,0.52)' : '0 1px 3px rgba(0,0,0,0.25)' } })),
              日设 && 日设.开 ? '已开启' : '已关闭'))),
        h('div', { style: { ...行式, gap: 8, padding: '6px 0 2px', fontSize: 10.5, color: 'rgba(187,205,235,0.42)' } },
          h('span', { style: { width: 5, height: 5, borderRadius: 99, background: 会话 && 会话.id ? '#66d2b0' : '#e9b877', boxShadow: 会话 && 会话.id ? '0 0 8px rgba(102,210,176,0.45)' : 'none' } }),
          会话 && 会话.id ? '将由当前会话写入并保存日记' : '先选择一个会话，定时日记才会运行'),
      ])


      const 模型行 = h('div', { style: { ...行式, borderTop: 'none', paddingTop: 2 } },
        h('span', { style: 标式 }, '模型'),
        !模
          ? h('span', { style: { fontSize: 12, opacity: 0.4 } }, '正在读…')
          : 模.错
            ? h('span', { style: { fontSize: 12, color: '#ff9b8a' } }, 模.错)
            : h('span', { style: { display: 'flex', gap: 6, flex: 1 } },
                h('select', {
                  value: 选中 ? 选中.provider : '',
                  onChange: (e) => {
                    const p = (模.providers || []).find((x) => x.id === e.target.value)
                    const m = p && p.models && p.models[0] ? p.models[0].id : ''
                    换模型(e.target.value, m)
                  },
                  style: 下拉,
                }, (模.providers || []).map((p) => h('option', { key: p.id, value: p.id, style: 选项 }, p.name))),
                h('select', {
                  value: 选中 ? 选中.model : '',
                  onChange: (e) => 换模型(选中 ? 选中.provider : '', e.target.value),
                  style: 下拉,
                }, ((当前家 && 当前家.models) || []).map((m) => h('option', { key: m.id, value: m.id, style: 选项 }, m.name))),
              ),
        模 && 模.选中的 ? null : h('span', { style: { fontSize: 10.5, opacity: 0.3, flex: 'none' } }, '还没选，用默认'),
      )

      const [跑, 设跑] = useState(null)
      const 开始 = async () => {
        if (!会话 || !会话.id) return
        设跑('跑')
        try {
          const r = await fetch('/dsh-xingxi/pick', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sid: 会话.id }),
          })
          const j = await r.json()
          设跑(j)
        } catch (e) {
          设跑({ ok: false, 原因: String((e && e.message) || e) })
        }
      }
      const 跑着 = 跑 === '跑'

      return h('div', { style: { position: 'absolute', inset: 0, overflowY: 'auto', padding: '28px 30px 36px', background: 'radial-gradient(80% 60% at 15% 0%, rgba(54,81,132,0.1), transparent 72%)' } },
        h('div', { style: { maxWidth: 680 } },
          卡('现在这个会话', '星图、星册、星历画的就是它', [
            行('会话', 会话 && 会话.名, 会话 && 会话.有 ? (会话.字 / 10000).toFixed(1) + ' 万字' : '还没建档'),
            h('div', { style: { ...行式, alignItems: 'center' } },
              h('span', { style: 标式 }, '文件夹'),
              !会话
                ? h('span', { style: 值式 }, '—')
                : 改夹 === null
                  ? h('span', { style: 值式, title: 会话.目录 }, 会话.目录 || '（还没定）')
                  : h('input', {
                      value: 改夹,
                      onChange: (e) => 设改夹(e.target.value),
                      placeholder: '例如 D:\\记忆档案',
                      spellCheck: false,
                      style: {
                        flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'inherit',
                        padding: '5px 9px', borderRadius: 6, color: '#dbe6ff',
                        background: 'rgba(20,30,52,0.95)', border: '1px solid rgba(140,170,230,0.28)',
                        outline: 'none',
                      },
                    }),
              会话
                ? 改夹 === null
                  ? h('span', { style: { display: 'flex', gap: 6, flex: 'none' } },
                      h('button', { style: { ...小按钮, padding: '4px 10px' }, onClick: 选夹 }, '改'),
                      h('button', { style: { ...小按钮, padding: '4px 10px' }, onClick: 弹窗选夹 }, '选…'))
                  : h('span', { style: { display: 'flex', gap: 6, flex: 'none' } },
                      h('button', { style: { ...小按钮, padding: '4px 10px' }, onClick: () => 存夹(改夹) }, '存'),
                      h('button', { style: { ...小按钮, padding: '4px 10px' }, onClick: () => 设改夹(null) }, '取消'))
                : null),
            行('现有', 图 && !图.空 ? `${图.统计.星} 颗星 · ${图.统计.卡} 分支 · ${图.统计.日} 天` : '空'),
          ]),
           卡('拾星', 会话 && 会话.没跑完
            ? '上次没跑完：整理到 ' + (会话.没跑完.已到 || '还没开始') + '，目标到 ' + 会话.没跑完.最晚
            : '把会话里还没进档案的日子拾出来，写进上面那个文件夹', [
            模型行,
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 } },
              h('button', {
                onClick: 开始,
                disabled: 跑着 || !(会话 && 会话.id),
                style: { ...主按钮, ...(跑着 || !(会话 && 会话.id) ? { opacity: 0.4, cursor: 'not-allowed' } : {}) },
              }, 跑着 ? '正在开…' : (会话 && 会话.没跑完 ? '接着拾' : '拾星')),
              h('span', { style: { fontSize: 11, opacity: 0.35, lineHeight: 1.6 } },
                跑着 ? '在切料、开新会话' : 会话 && !会话.有 ? '还没有档案，拾完就有了' : '会新开一个会话，让它一天一天往下做')),
            跑 && 跑 !== '跑'
              ? h('div', { style: { marginTop: 12, fontSize: 11.5, lineHeight: 1.8, color: 跑.ok ? 'rgba(158,208,255,0.9)' : '#ff9b8a' } },
                  跑.ok
                    ? `开好了：切了 ${跑.天数} 天（${跑.最早} ~ ${跑.最晚}），新会话已经领到活儿。`
                    : String(跑.原因 || '没跑成'))
              : null,
          ]),
          日记卡,
        ))
    }

    function 说重(字) {
      const n = Number(字) || 0
      if (!n) return '还没建档'
      if (n >= 10000) return (n / 10000).toFixed(1) + ' 万字'
      return n + ' 字'
    }

    // ═══════════════════════════════════════════════════
    function 星汐() {
      const [会话们, 设会话们] = useState([])
      const [当前, 设当前] = useState('')
      const [图, 设图] = useState(null)
      const [页, 设页] = useState('图')
      const [选中, 设选中] = useState(null)
      const [错, 设错] = useState('')
      const [加载, 设加载] = useState(true)
      const [拖会话, 设拖会话] = useState('')
      const [放置会话, 设放置会话] = useState('')
      const 拖会话ref = useRef(null)
      const 抑制点击ref = useRef('')

      const 当前ref = useRef('')
      useEffect(() => {
        当前ref.current = 当前
      }, [当前])

      const 拉会话 = useCallback(async () => {
        try {
          // 带上当前会话，让宿主只列**当前工作区**的（跟 DSH 侧栏对齐）
          const 问 = 当前ref.current
          const r = await fetch('/dsh-xingxi/sessions' + (问 ? '?sid=' + encodeURIComponent(问) : ''), { cache: 'no-store' })
          if (!r.ok) throw new Error('宿主没回应（' + r.status + '）')
          const j = await r.json()
          设会话们(j.会话 || [])
          设当前((旧) => (旧 && (j.会话 || []).some((x) => x.id === 旧) ? 旧 : (j.会话 && j.会话[0] ? j.会话[0].id : '')))
        } catch (e) {
          设错(String((e && e.message) || e))
        }
      }, [])

      const 保存会话顺序 = async (源id, 目标id) => {
        const 从 = 会话们.findIndex((s) => s.id === 源id)
        const 到 = 会话们.findIndex((s) => s.id === 目标id)
        if (从 < 0 || 到 < 0 || 从 === 到) return
        const 新列 = 会话们.slice()
        const [项] = 新列.splice(从, 1)
        const 插入 = 新列.findIndex((s) => s.id === 目标id)
        新列.splice(插入 < 0 ? 新列.length : 插入, 0, 项)
        设会话们(新列)
        try {
          const r = await fetch('/dsh-xingxi/顺序', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ 顺序: 新列.map((s) => s.id) }),
          })
          const j = await r.json()
          if (!r.ok || !j.ok) throw new Error(j.原因 || '顺序没存上')
          设错('')
        } catch (e) {
          设错('会话顺序保存失败：' + String((e && e.message) || e))
          拉会话()
        }
      }
      const 会话指针按下 = (e, id) => {
        if (e.button !== undefined && e.button !== 0) return
        const 拖 = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, 目标: id, 激活: false, timer: 0 }
        拖会话ref.current = 拖
        try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
        拖.timer = window.setTimeout(() => {
          if (拖会话ref.current !== 拖) return
          拖.激活 = true
          抑制点击ref.current = id
          设拖会话(id)
          设放置会话(id)
        }, 360)
      }
      const 会话指针移动 = (e) => {
        const 拖 = 拖会话ref.current
        if (!拖 || 拖.pointerId !== e.pointerId) return
        if (!拖.激活) {
          if (Math.hypot(e.clientX - 拖.x, e.clientY - 拖.y) > 8) {
            window.clearTimeout(拖.timer)
            拖会话ref.current = null
          }
          return
        }
        e.preventDefault()
        const 下 = document.elementFromPoint(e.clientX, e.clientY)
        const 行 = 下 && 下.closest ? 下.closest('[data-xingxi-session]') : null
        const id = 行 && 行.getAttribute('data-xingxi-session')
        if (id) {
          拖.目标 = id
          设放置会话(id)
        }
      }
      const 会话指针结束 = (e) => {
        const 拖 = 拖会话ref.current
        if (!拖 || 拖.pointerId !== e.pointerId) return
        window.clearTimeout(拖.timer)
        拖会话ref.current = null
        if (拖.激活) {
          抑制点击ref.current = 拖.id
          window.setTimeout(() => { if (抑制点击ref.current === 拖.id) 抑制点击ref.current = '' }, 350)
          const 下 = document.elementFromPoint(e.clientX, e.clientY)
          const 行 = 下 && 下.closest ? 下.closest('[data-xingxi-session]') : null
          const 目标 = (行 && 行.getAttribute('data-xingxi-session')) || 拖.目标
          if (目标 && 目标 !== 拖.id) 保存会话顺序(拖.id, 目标)
        }
        设拖会话('')
        设放置会话('')
      }
      const 会话指针取消 = () => {
        const 拖 = 拖会话ref.current
        if (拖) window.clearTimeout(拖.timer)
        if (拖 && 拖.激活 && 抑制点击ref.current === 拖.id) 抑制点击ref.current = ''
        拖会话ref.current = null
        设拖会话('')
        设放置会话('')
      }

      const 拉图 = useCallback(async (sid) => {
        if (!sid) {
          设图(null)
          设加载(false)
          return
        }
        设加载(true)
        try {
          const r = await fetch('/dsh-xingxi/graph?sid=' + encodeURIComponent(sid), { cache: 'no-store' })
          if (!r.ok) throw new Error('宿主没回应（' + r.status + '）')
          const j = await r.json()
          if (j.错) throw new Error(j.错)
          设图(j)
          设错('')
        } catch (e) {
          设错(String((e && e.message) || e))
          设图(null)
        } finally {
          设加载(false)
        }
      }, [])

      useEffect(() => {
        拉会话()
      }, [拉会话])

      useEffect(() => {
        拉图(当前)
        设选中(null)
      }, [当前, 拉图])

      const 本站 = useMemo(() => {
        if (!图) return []
        return 图.星 || []
      }, [图])

      const 卡们 = useMemo(() => 本站.filter((s) => s.kind === 'card'), [本站])
      const 日们 = useMemo(
        () => 本站.filter((s) => s.kind === 'diary').slice().sort((a, b) => (a.date < b.date ? 1 : -1)),
        [本站],
      )
      const 选中星 = useMemo(() => 本站.find((s) => s.id === 选中) || null, [本站, 选中])
      const 现在会话 = 会话们.find((x) => x.id === 当前) || null

      useEffect(() => {
        if (!现在会话 || !现在会话.id) return
        fetch('/dsh-xingxi/diary', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ 会话: 现在会话.id }),
        }).catch(() => {})
      }, [当前, 现在会话 && 现在会话.id])

      return h('div', { style: 外层 },
        // 顶栏
        h('div', { style: 顶栏 },
          h('span', { style: { fontSize: 15, fontWeight: 600, letterSpacing: 1, marginRight: 18 } }, '星汐'),
          [['图', '星图'], ['档案', '星册'], ['日记', '星历'], ['坊', '星坊']].map(([k, 名]) =>
            h('button', {
              key: k,
              onClick: () => 设页(k),
              style: {
                ...页签,
                color: 页 === k ? '#f2f6ff' : 'rgba(226,236,255,0.52)',
                background: 页 === k ? 'linear-gradient(135deg, rgba(101,151,235,0.28), rgba(124,107,218,0.16))' : 'transparent',
                borderColor: 页 === k ? 'rgba(169,196,255,0.19)' : 'transparent',
                boxShadow: 页 === k ? 'inset 0 1px 0 rgba(255,255,255,0.07), 0 3px 12px rgba(38,72,143,0.13)' : 'none',
              },
            }, 名)),
          h('span', { style: { flex: 1 } }),
          错 ? h('span', { style: { color: '#ff9b8a', fontSize: 11.5, marginRight: 10 } }, 错) : null,
          h('span', { style: { fontSize: 11.5, opacity: 0.4 } },
            (现在会话 ? 现在会话.名 + ' · ' : '') + (图 && !图.空 ? 图.统计.星 + ' 颗星' : '还没有星')),
        ),
        // 主体
        h('div', { style: { flex: 1, display: 'flex', minHeight: 0 } },
          h('div', { style: { position: 'relative', flex: 1, minWidth: 0 } },
            加载 ? h('div', { style: 居中 }, h('span', { style: { fontSize: 12.5, opacity: 0.5 } }, '正在把档案摊开…')) : null,
            页 === '图'
              ? h(星图, { 图, 选中, 设选中 })
              : null,
            页 === '档案'
              ? h(列表页, { 星们: 卡们, 空话: '这个会话还没有档案', 选中, 设选中, 类型: '档案' })
              : null,
            页 === '日记'
              ? h(列表页, { 星们: 日们, 空话: '这个会话还没有日记', 选中, 设选中, 类型: '日记' })
              : null,
            页 === '坊'
              ? h(星坊页, {
                  会话: 现在会话,
                  图,
                  会话们,
                  刷新: () => {
                    拉会话()
                    拉图(当前)
                  },
                })
              : null,
            选中星 ? h(详情卡, { 星: 选中星, 关: () => 设选中(null) }) : null,
          ),
          // 右侧会话栏
          h('div', { style: 会话栏 },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '15px 15px 8px' } },
              h('span', { style: { fontSize: 10.5, letterSpacing: 0.8, color: 'rgba(194,211,242,0.48)' } }, '会话'),
              h('span', { style: { fontSize: 8.5, color: 'rgba(174,193,226,0.28)' } }, '长按可排序')) ,
            会话们.length === 0
              ? h('div', { style: { fontSize: 11.5, opacity: 0.35, padding: '4px 12px', lineHeight: 1.7 } },
                  '还没有档案。在 ~/.dsh/xingxi/会话/<会话id>/ 里放 .md 就有星了。')
              : 会话们.map((s) =>
                  h('div', {
                    key: s.id,
                    'data-xingxi-session': s.id,
                    title: '长按拖动调整会话顺序',
                    onPointerDown: (e) => 会话指针按下(e, s.id),
                    onPointerMove: 会话指针移动,
                    onPointerUp: 会话指针结束,
                    onPointerCancel: 会话指针取消,
                    onContextMenu: (e) => e.preventDefault(),
                    onClick: (e) => {
                      if (抑制点击ref.current === s.id) {
                        抑制点击ref.current = ''
                        e.preventDefault()
                        return
                      }
                      设当前(s.id)
                      设页('图')
                    },
                    style: {
                      padding: '8px 10px',
                      margin: '3px 8px',
                      borderRadius: 9,
                      cursor: 拖会话 === s.id ? 'grabbing' : 'grab',
                      touchAction: 'pan-y', userSelect: 'none',
                      opacity: 拖会话 === s.id ? 0.5 : 1,
                      transform: 拖会话 === s.id ? 'scale(0.985)' : 'none',
                      background: 当前 === s.id ? 'linear-gradient(110deg, rgba(87,132,207,0.2), rgba(107,87,181,0.11))' : 'rgba(140,170,230,0.018)',
                      border: '1px solid ' + (放置会话 === s.id && 拖会话 && 拖会话 !== s.id ? 'rgba(170,202,255,0.42)' : 当前 === s.id ? 'rgba(159,189,245,0.12)' : 'transparent'),
                      boxShadow: 放置会话 === s.id && 拖会话 && 拖会话 !== s.id ? 'inset 0 0 0 1px rgba(170,202,255,0.12)' : 'none',
                      transition: 'background .16s ease, border-color .16s ease, opacity .16s ease, transform .16s ease',
                    },
                  },
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: 7 } },
                      h('i', { style: {
                        width: 6, height: 6, borderRadius: 99, flex: 'none',
                        background: s.有 ? '#9ed0ff' : 'rgba(150,170,210,0.35)',
                      } }),
                      h('span', { style: { fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s.名),
                      // ⭐ 0.1.6：DSH 侧栏里那栏「未分组」的会话（不属于任何工作区）
                      s.未分组
                        ? h('span', { style: { flex: 'none', fontSize: 9.5, padding: '1px 5px', borderRadius: 6, background: 'rgba(150,170,210,0.12)', color: 'rgba(186,205,236,0.55)' } }, '未分组')
                        : null,
                      h('span', { 'aria-hidden': true, style: { flex: 'none', fontSize: 12, letterSpacing: -2, opacity: 拖会话 === s.id ? 0.78 : 0.23, color: 'rgba(198,216,247,0.8)', cursor: 'grab', transition: 'opacity .15s ease' } }, '⠿')),

                    h('div', { style: { fontSize: 10.5, opacity: 0.34, marginLeft: 13 } },
                      s.有 ? 说重(s.字) : '还没建档'),
                  ),
                )),
        ),
      )
    }

    function 详情卡({ 星, 关 }) {
      // ⚠ 点某颗星直接崩掉整页的教训：详情卡里任何一个字段是 undefined 都会把渲染炸掉，
      //   炸了以后整个星汐都打不开。这里整块兜住，出错就显示一句，不让它带崩插件。
      try {
        return 详情卡内容({ 星, 关 })
      } catch (e) {
        return h('div', { style: 详情 },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('span', { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, '这颗星打不开'),
            h('button', { style: { ...小按钮, padding: '1px 8px' }, onClick: 关 }, '×')),
          h('div', { style: { fontSize: 11, opacity: 0.5, marginTop: 6, lineHeight: 1.7 } },
            String((e && e.message) || e)))
      }
    }

    function 详情卡内容({ 星, 关 }) {
      const 名 = String((星 && (星.title || 星.name || 星.ref)) || '（没有名字）')
      const 色 = 星色(星) || '#b9c6e8'
      return h('div', { style: { ...详情, borderColor: 透明(色, 0.24), boxShadow: `0 18px 50px rgba(0,0,0,0.5), 0 0 30px ${透明(色, 0.08)}` } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 } },
          h('i', { style: { width: 9, height: 9, borderRadius: 99, background: 色, flex: 'none', boxShadow: `0 0 12px ${透明(色, 0.58)}` } }),
          h('span', { style: { fontSize: 14, fontWeight: 600, letterSpacing: 0.1, flex: 1, lineHeight: 1.5 } }, 名),
          h('button', { style: { ...小按钮, padding: '2px 8px', borderRadius: 7, color: 'rgba(222,234,255,0.75)' }, onClick: 关 }, '×')),
        h('div', { style: { fontSize: 10.5, letterSpacing: 0.25, color: 透明(色, 0.85), marginBottom: 10, paddingLeft: 18 } },
          星.kind === 'card'
            ? (星.chapter ? '记忆 · ' + (星.chapterName || 章名表[星.chapter] || '') : '记忆' + (星.chapterName ? ' · ' + 星.chapterName : ''))
            : '日记 · ' + 星.date),
        星.小标题们 && 星.小标题们.length
          ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 } },
              星.小标题们.map((t, i) => h('span', { key: i, style: 小标签 }, t)))
          : null,
        h('div', { style: { flex: 1, overflowY: 'auto', fontSize: 12.5, lineHeight: 1.85, opacity: 0.88, paddingRight: 4 } },
          正文段落(星.text).map((p, i) => h('p', { key: i, style: { margin: '0 0 10px' } }, p))),
      )
    }

    function 正文段落(文) {
      if (!文) return ['（这条只有标题，正文还没写）']
      const 净 = String(文)
        .replace(/^>\s?/gm, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^[-*]\s+/gm, '· ')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 单行超长就按句号断一下，不然详情里是一大坨没有换行的字
      return 净
        .split(/\n{2,}/)
        .flatMap((段) => {
          const t = 段.trim()
          if (t.length <= 120) return [t]
          const 句们 = t.match(/[^。！？；]+[。！？；]?/g) || [t]
          const 出 = []
          let 缓 = ''
          for (const 句 of 句们) {
            if ((缓 + 句).length > 90) {
              if (缓) 出.push(缓.trim())
              缓 = 句
            } else 缓 += 句
          }
          if (缓.trim()) 出.push(缓.trim())
          return 出
        })
        .filter(Boolean)
    }

    // ── 样式 ──
    const 外层 = {
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      background: 'radial-gradient(110% 85% at 50% 43%, #111a31 0%, #080d1a 48%, #04060c 100%)',
      color: '#e6edff', fontFamily: '"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
    }
    const 顶栏 = {
      display: 'flex', alignItems: 'center', gap: 5, height: 50, padding: '0 17px',
      borderBottom: '1px solid rgba(160,185,235,0.12)', flex: 'none',
      background: 'linear-gradient(180deg, rgba(18,26,44,0.58), rgba(8,13,24,0.28))',
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    }
    const 页签 = {
      border: '1px solid transparent', borderRadius: 8, padding: '6px 13px', fontSize: 12.5,
      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .16s',
      letterSpacing: 0.15,
    }
    const 会话栏 = {
      width: 216, flex: 'none', borderLeft: '1px solid rgba(160,185,235,0.1)',
      overflowY: 'auto', background: 'linear-gradient(180deg, rgba(9,14,25,0.68), rgba(5,8,15,0.55))',
    }
    const 居中 = {
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', padding: 24,
    }
    const 小按钮 = {
      background: 'linear-gradient(135deg, rgba(130,158,211,0.13), rgba(105,126,174,0.08))', color: 'rgba(220,232,255,0.84)',
      border: '1px solid rgba(153,181,232,0.18)', borderRadius: 8, fontSize: 11.5,
      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .16s ease',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
    }
    const 主按钮 = {
      background: 'linear-gradient(120deg, rgba(84,153,230,0.28), rgba(132,104,217,0.2))', color: '#e1edff',
      border: '1px solid rgba(139,183,245,0.34)', borderRadius: 9,
      padding: '9px 23px', fontSize: 12.5, fontFamily: 'inherit',
      cursor: 'pointer', letterSpacing: 0.5, transition: 'all .18s ease',
      boxShadow: '0 6px 18px rgba(48,94,158,0.14), inset 0 1px 0 rgba(255,255,255,0.06)',
    }
    const 卡片 = {
      background: 'linear-gradient(145deg, rgba(255,255,255,0.038), rgba(120,150,210,0.018))',
      border: '1px solid rgba(156,184,239,0.11)',
      borderRadius: 14, padding: '17px 18px', marginBottom: 15,
      boxShadow: '0 8px 26px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.025)',
    }
    const 行式 = {
      display: 'flex', alignItems: 'center', gap: 12, minHeight: 36,
      borderTop: '1px solid rgba(140,170,230,0.065)',
    }
    const 标式 = { width: 68, flex: 'none', fontSize: 11.5, opacity: 0.45, letterSpacing: 0.3 }
    const 值式 = { flex: 1, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
    const 注式 = { fontSize: 10.5, opacity: 0.3, flex: 'none' }
    const 小标签 = {
      fontSize: 10.5, padding: '2px 7px', borderRadius: 6,
      background: 'rgba(140,170,230,0.13)', color: 'rgba(226,236,255,0.72)',
    }
    const 详情 = {
      position: 'absolute', top: 12, right: 12, bottom: 12, width: 'min(360px, 44%)',
      display: 'flex', flexDirection: 'column', background: 'linear-gradient(155deg, rgba(17,24,42,0.96), rgba(8,12,23,0.94))',
      border: '1px solid rgba(160,188,242,0.15)', borderRadius: 15, padding: '15px 16px',
      backdropFilter: 'blur(16px)', boxShadow: '0 20px 60px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.035)',
    }

    return {
      inject: ['slots', 'remote.directoryPicker'],
      apply(ctx) {
        客户端 = ctx
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'xingxi', order: 20, label: () => '星汐' },
            图标,
          ),
        )
        // 兜错：渲染炸了也别白屏，把错误显示出来（能直接看出是哪一行）
        class 兜错 extends React.Component {
          constructor(p) {
            super(p)
            this.state = { 错: null }
          }
          static getDerivedStateFromError(e) {
            return { 错: e }
          }
          componentDidCatch(e, info) {
            try {
              console.error('[星汐]', e, info)
            } catch {}
          }
          render() {
            if (this.state.错) {
              const e = this.state.错
              return h(
                'div',
                { style: { padding: 20, color: '#ff9a9a', fontSize: 12.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' } },
                '星汐渲染出错：',
                String((e && e.message) || e),
                String.fromCharCode(10, 10),
                String((e && e.stack) || '').slice(0, 900),
              )
            }
            return this.props.children
          }
        }
        const 星汐兜 = (props) => h(兜错, null, h(星汐, props))
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'xingxi' }, 星汐兜))
      },
    }
  },
})
