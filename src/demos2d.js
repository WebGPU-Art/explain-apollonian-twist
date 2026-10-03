// 纯 Canvas2D 的小演示:折叠、反演、2D 光线步进
import { fold1 } from './math.js'

function setup(canvas, range) {
  const ctx = canvas.getContext('2d')
  const S = {
    ctx, range,
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(canvas.clientWidth * dpr)
      canvas.height = Math.round(canvas.clientHeight * dpr)
    },
    // 世界坐标 -> 像素
    X: (x) => ((x / range) * 0.5 + 0.5) * canvas.height + (canvas.width - canvas.height) / 2,
    Y: (y) => (0.5 - (y / range) * 0.5) * canvas.height,
    L: (l) => (l / range) * 0.5 * canvas.height,
    toWorld(e) {
      const r = canvas.getBoundingClientRect()
      const px = ((e.clientX - r.left) / r.width) * canvas.width
      const py = ((e.clientY - r.top) / r.height) * canvas.height
      return [((px - (canvas.width - canvas.height) / 2) / canvas.height - 0.5) * 2 * range, (0.5 - py / canvas.height) * 2 * range]
    },
  }
  return S
}

// 拖动若干个句柄
function handles(canvas, S, pts, onChange) {
  let active = -1
  canvas.addEventListener('pointerdown', (e) => {
    const w = S.toWorld(e)
    let best = 1e9
    pts.forEach((p, i) => {
      const d = Math.hypot(p[0] - w[0], p[1] - w[1])
      if (d < best) { best = d; active = i }
    })
    if (best > S.range * 0.15) active = -1
    if (active >= 0) canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (active < 0) return
    const w = S.toWorld(e)
    pts[active][0] = w[0]
    pts[active][1] = w[1]
    onChange()
  })
  const up = () => { active = -1 }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
}

function dot(ctx, x, y, r, color) {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

function arrow(ctx, x0, y0, x1, y1, color, w) {
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  const a = Math.atan2(y1 - y0, x1 - x0)
  const h = 4 * w
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4))
  ctx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4))
  ctx.fill()
}

// ① 折叠:p = -1 + 2·fract(0.5p + 0.5),把整个空间平移回 [-1,1] 的盒子
export function mountFold(root) {
  const canvas = root.querySelector('canvas.plane')
  const graph = root.querySelector('canvas.graph')
  const out = root.querySelector('.readout')
  const S = setup(canvas, 4)
  const pts = [[2.6, 1.4]]
  const draw = () => {
    S.resize()
    const { ctx } = S
    const dpr = canvas.width / canvas.clientWidth
    ctx.fillStyle = '#05060a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 每个 2×2 的格子
    for (let i = -5; i <= 5; i += 2) {
      for (let j = -5; j <= 5; j += 2) {
        const home = i === -1 && j === -1
        ctx.fillStyle = home ? '#17233d' : (((i + j) / 2) % 2 === 0 ? '#0d1220' : '#0a0e18')
        ctx.fillRect(S.X(i), S.Y(j + 2), S.L(2), S.L(2))
        // 每个格子里放同一个“图案”,说明折叠后它们都是同一份
        ctx.strokeStyle = home ? '#ffd27a' : '#ffd27a55'
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        ctx.arc(S.X(i + 1 + 0.35), S.Y(j + 1 + 0.25), S.L(0.38), 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(S.X(i + 1 - 0.7), S.Y(j + 1 - 0.5))
        ctx.lineTo(S.X(i + 1 - 0.2), S.Y(j + 1 - 0.5))
        ctx.lineTo(S.X(i + 1 - 0.2), S.Y(j + 1 + 0.1))
        ctx.stroke()
      }
    }
    ctx.strokeStyle = '#6ea8ff'
    ctx.lineWidth = 2 * dpr
    ctx.strokeRect(S.X(-1), S.Y(1), S.L(2), S.L(2))
    const p = pts[0]
    const f = [fold1(p[0]), fold1(p[1])]
    arrow(ctx, S.X(p[0]), S.Y(p[1]), S.X(f[0]), S.Y(f[1]), '#ffffff88', 1.5 * dpr)
    dot(ctx, S.X(p[0]), S.Y(p[1]), 7 * dpr, '#ff6b8b')
    dot(ctx, S.X(f[0]), S.Y(f[1]), 6 * dpr, '#6ef0c0')
    out.innerHTML = `p = (${p[0].toFixed(2)}, ${p[1].toFixed(2)}) → 折叠后 (${f[0].toFixed(2)}, ${f[1].toFixed(2)})`
    drawGraph()
  }
  const drawGraph = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    graph.width = graph.clientWidth * dpr
    graph.height = graph.clientHeight * dpr
    const g = graph.getContext('2d')
    const W = graph.width, H = graph.height
    const gx = (x) => ((x + 5) / 10) * W
    const gy = (y) => H / 2 - (y / 1.6) * (H / 2)
    g.fillStyle = '#05060a'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#262c3d'
    g.lineWidth = dpr
    g.beginPath()
    g.moveTo(0, gy(0)); g.lineTo(W, gy(0))
    g.moveTo(gx(0), 0); g.lineTo(gx(0), H)
    g.stroke()
    g.strokeStyle = '#6ea8ff'
    g.lineWidth = 2 * dpr
    g.beginPath()
    for (let i = 0; i <= 800; i++) {
      const x = -5 + (10 * i) / 800
      const y = fold1(x)
      if (i > 0 && Math.abs(y - fold1(x - 10 / 800)) > 1) g.moveTo(gx(x), gy(y))
      else g.lineTo(gx(x), gy(y))
    }
    g.stroke()
    const p = pts[0][0]
    dot(g, gx(p), gy(fold1(p)), 5 * dpr, '#6ef0c0')
    g.fillStyle = '#8d96b0'
    g.font = `${11 * dpr}px sans-serif`
    g.fillText('y = −1 + 2·fract(x/2 + ½)   (锯齿波,周期 2)', 8 * dpr, 14 * dpr)
  }
  handles(canvas, S, pts, draw)
  window.addEventListener('resize', draw)
  draw()
}

// ② 反演:p ← s·p / |p|²
export function mountInversion(root) {
  const canvas = root.querySelector('canvas')
  const out = root.querySelector('.readout')
  const sInput = root.querySelector('input[name=s]')
  const S = setup(canvas, 3)
  // 圆:中心 + 圆上一点;直线:两点
  const pts = [[1.5, 0.6], [1.95, 0.6], [-2.2, -1.8], [0.8, -1.2]]
  const inv = (p, s) => {
    const r2 = Math.max(p[0] * p[0] + p[1] * p[1], 1e-6)
    return [(p[0] * s) / r2, (p[1] * s) / r2]
  }
  const path = (ctx, list, color, w) => {
    ctx.strokeStyle = color
    ctx.lineWidth = w
    ctx.beginPath()
    let pen = false
    for (const q of list) {
      const ok = Math.abs(q[0]) < 50 && Math.abs(q[1]) < 50
      if (!ok) { pen = false; continue }
      if (pen) ctx.lineTo(S.X(q[0]), S.Y(q[1]))
      else ctx.moveTo(S.X(q[0]), S.Y(q[1]))
      pen = true
    }
    ctx.stroke()
  }
  const draw = () => {
    S.resize()
    const { ctx } = S
    const dpr = canvas.width / canvas.clientWidth
    const s = Number(sInput.value)
    ctx.fillStyle = '#05060a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 网格及其反演像
    for (let g = -3; g <= 3; g += 0.5) {
      const a = [], b = []
      for (let t = -3; t <= 3; t += 0.01) { a.push([g, t]); b.push([t, g]) }
      path(ctx, a, '#1a2134', dpr)
      path(ctx, b, '#1a2134', dpr)
      path(ctx, a.map((q) => inv(q, s)), '#2a3a5a', dpr)
      path(ctx, b.map((q) => inv(q, s)), '#2a3a5a', dpr)
    }
    // 反演球
    ctx.setLineDash([6 * dpr, 6 * dpr])
    ctx.strokeStyle = '#6ea8ff'
    ctx.lineWidth = 1.5 * dpr
    ctx.beginPath()
    ctx.arc(S.X(0), S.Y(0), S.L(Math.sqrt(s)), 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    // 圆
    const [c, e] = pts
    const r = Math.hypot(e[0] - c[0], e[1] - c[1])
    const circ = []
    for (let i = 0; i <= 400; i++) {
      const a = (i / 400) * Math.PI * 2
      circ.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)])
    }
    path(ctx, circ, '#ff9a5c', 2 * dpr)
    path(ctx, circ.map((q) => inv(q, s)), '#ffd27a', 2.5 * dpr)
    // 直线
    const [a, b] = [pts[2], pts[3]]
    const line = []
    for (let t = -40; t <= 40; t += 0.01) line.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    path(ctx, line, '#c084fc', 2 * dpr)
    path(ctx, line.map((q) => inv(q, s)), '#f0abfc', 2.5 * dpr)
    for (const p of pts) dot(ctx, S.X(p[0]), S.Y(p[1]), 6 * dpr, '#ffffff')
    const d2 = c[0] * c[0] + c[1] * c[1]
    out.innerHTML = `反演球半径 √s = ${Math.sqrt(s).toFixed(3)} · 橙色圆的放大倍数 ≈ s/|c|² = ${(s / Math.max(d2 - r * r, 1e-4)).toFixed(2)} ${d2 < r * r ? '(圆包住了原点:像会翻到外面)' : ''}`
  }
  handles(canvas, S, pts, draw)
  sInput.oninput = draw
  window.addEventListener('resize', draw)
  draw()
}

// 侧视图:把 color() 里的 3D 光路投影到 x–y 平面(按真实比例)
export function drawSide(ctx, g, P, w, h, dpr) {
  const X0 = -1.7, X1 = 1.7, Y0 = -0.45, Y1 = 1.7
  const X = (x) => ((x - X0) / (X1 - X0)) * w
  const Y = (y) => (1 - (y - Y0) / (Y1 - Y0)) * h
  ctx.fillStyle = '#05060a'
  ctx.fillRect(0, 0, w, h)
  const line = (x0, y0, x1, y1, c, lw = 1.2, dash) => {
    ctx.strokeStyle = c; ctx.lineWidth = lw * dpr; ctx.setLineDash(dash ? dash.map((v) => v * dpr) : [])
    ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke(); ctx.setLineDash([])
  }
  const pt = (x, y, c, r = 5) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r * dpr, 0, 7); ctx.fill() }
  const txt = (t, x, y, c = '#8e9a92') => { ctx.fillStyle = c; ctx.font = `${11 * dpr}px sans-serif`; ctx.fillText(t, X(x), Y(y)) }
  line(X0, 0, X1, 0, '#9fd36a', 2.5)
  line(X0, P.floorB, X1, P.floorB, '#5a6a8a', 2)
  txt('y = 0  曲线所在的平面 df()', X0 + 0.05, 0.07, '#9fd36a')
  txt(`y = ${P.floorB.toFixed(3)}  “地板”`, X0 + 0.05, P.floorB - 0.07, '#8aa0d0')
  // 相机射线(几乎垂直向下)
  line(g.pp[0] * (P.camT - 1.7) / P.camT, 1.7, g.pp[0], 0, '#ffffff66', 1.2, [4, 4])
  line(g.pp[0], 0, g.bp[0], P.floorB, '#ffffffaa', 1.5)
  // 两条朝灯的“阴影射线”
  line(g.bp[0], P.floorB, g.lp1[0], g.lp1[1], '#ffe9a066', 1.2)
  line(g.bp[0], P.floorB, g.lp2[0], g.lp2[1], '#ff9ad066', 1.2)
  pt(g.lp1[0], g.lp1[1], '#ffe9a0', 6); txt('灯1', g.lp1[0] + 0.05, g.lp1[1] + 0.04)
  pt(g.lp2[0], g.lp2[1], '#ff9ad0', 6); txt('灯2', g.lp2[0] + 0.05, g.lp2[1] + 0.04)
  pt(g.pp[0], 0, '#ffffff', 5)
  pt(g.bp[0], P.floorB, '#6ef0c0', 5); txt('bp', g.bp[0] + 0.04, P.floorB - 0.06, '#6ef0c0')
  pt(g.sp1[0], 0, '#ffe9a0', 5); txt('sp1', g.sp1[0] + 0.03, 0.12, '#ffe9a0')
  pt(g.sp2[0], 0, '#ff9ad0', 5); txt('sp2', g.sp2[0] + 0.03, -0.1, '#ff9ad0')
  txt('相机在正上方 y = ' + P.camT + ' ↑', -0.3, 1.62)
}
