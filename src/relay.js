// 「迭代接力」演示:2D 简化版(只保留 x,y),把 apollian() 的每一轮拆成 折叠 → 反演 → 交给下一轮,
// 一轮一格画出来。数学和着色器完全一样,只是少了 z、w 两个维度。
import { fold1 } from './math.js'

const COLORS = { before: '#ffffff', fold: '#6ef0c0', inv: '#ffd27a', line: '#9fd36a', box: '#6ea8ff', grid: '#1a2236' }

// 迭代 n 轮,返回每轮的细节
export function trace2d(p0, s, n) {
  const rows = []
  let p = p0.slice()
  let scale = 1
  for (let i = 0; i < n; i++) {
    const before = p.slice()
    const folded = [fold1(p[0]), fold1(p[1])]
    const shift = [folded[0] - before[0], folded[1] - before[1]]
    const r2 = Math.max(folded[0] ** 2 + folded[1] ** 2, 1e-9)
    const k = s / r2
    p = [folded[0] * k, folded[1] * k]
    scale *= k
    rows.push({ i, before, folded, shift, r2, k, after: p.slice(), scale, d: Math.abs(p[1]) / scale })
  }
  return rows
}

function dist2d(x, y, s, n) {
  let px = x, py = y, scale = 1
  for (let i = 0; i < n; i++) {
    px = fold1(px); py = fold1(py)
    const r2 = Math.max(px * px + py * py, 1e-9)
    const k = s / r2
    px *= k; py *= k; scale *= k
  }
  return Math.abs(py) / scale
}

const fmt = (v) => `(${v[0].toFixed(2)}, ${v[1].toFixed(2)})`

export function mountRelay(root) {
  const left = root.querySelector('canvas.input')
  const film = root.querySelector('.film')
  const sIn = root.querySelector('input[name=s]')
  const nIn = root.querySelector('input[name=n]')
  const sOut = root.querySelector('output.s')
  const nOut = root.querySelector('output.n')
  const summary = root.querySelector('.summary')
  const P = [0.62, 0.37]
  const R_LEFT = 2.5

  const dpr = () => Math.min(window.devicePixelRatio || 1, 2)
  const size = (c) => {
    const w = Math.round(c.clientWidth * dpr())
    if (c.width !== w || c.height !== w) { c.width = w; c.height = w }
    return w
  }
  const circle = (ctx, x, y, r, fill, stroke, lw = 2) => {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
    if (fill) { ctx.fillStyle = fill; ctx.fill() }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
  }
  const arrow = (ctx, x0, y0, x1, y1, color, lw) => {
    const a = Math.atan2(y1 - y0, x1 - x0)
    if (Math.hypot(x1 - x0, y1 - y0) < 4) return
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    const h = 5 * lw
    ctx.beginPath(); ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - h * Math.cos(a - 0.4), y1 - h * Math.sin(a - 0.4))
    ctx.lineTo(x1 - h * Math.cos(a + 0.4), y1 - h * Math.sin(a + 0.4)); ctx.fill()
  }

  // 左图:输入空间。画出“迭代 n 轮后仍落在 y=0 上”的点集,也就是分形曲线
  const img = document.createElement('canvas')
  function drawLeft(rows, s, n) {
    const w = size(left)
    const ctx = left.getContext('2d')
    const N = 200
    img.width = N; img.height = N
    const g = img.getContext('2d')
    const data = g.createImageData(N, N)
    const px = (2 * R_LEFT) / N
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -R_LEFT + (i + 0.5) * px, y = R_LEFT - (j + 0.5) * px
        const d = dist2d(x, y, s, n)
        const a = Math.max(0, 1 - d / (1.6 * px))
        const k = (j * N + i) * 4
        const glow = Math.exp(-6 * d) * 0.28
        data.data[k] = 255 * Math.min(1, a + glow * 0.6)
        data.data[k + 1] = 255 * Math.min(1, a + glow * 0.9)
        data.data[k + 2] = 255 * Math.min(1, a + glow)
        data.data[k + 3] = 255
      }
    }
    g.putImageData(data, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(img, 0, 0, w, w)
    const X = (x) => ((x + R_LEFT) / (2 * R_LEFT)) * w
    const Y = (y) => ((R_LEFT - y) / (2 * R_LEFT)) * w
    // 折叠的格子边界(每 2 个单位一格,中心格 [-1,1] 用蓝框)
    ctx.lineWidth = dpr()
    ctx.strokeStyle = '#2a3a5a'
    for (let c = -3; c <= 3; c += 2) {
      ctx.beginPath(); ctx.moveTo(X(c), 0); ctx.lineTo(X(c), w); ctx.moveTo(0, Y(c)); ctx.lineTo(w, Y(c)); ctx.stroke()
    }
    ctx.strokeStyle = COLORS.box; ctx.lineWidth = 2 * dpr()
    ctx.strokeRect(X(-1), Y(1), X(1) - X(-1), Y(-1) - Y(1))
    // 点:每一轮的“前像”都落在这个点上,这里只画输入点
    circle(ctx, X(P[0]), Y(P[1]), 7 * dpr(), '#ff6b8b', '#000', dpr())
    ctx.fillStyle = '#ffffffcc'; ctx.font = `${12 * dpr()}px sans-serif`
    ctx.fillText('p₀(拖我)', X(P[0]) + 10 * dpr(), Y(P[1]) - 8 * dpr())
  }

  // 右侧:一轮一格
  function drawFilm(rows, s) {
    film.innerHTML = ''
    rows.forEach((r, idx) => {
      const cell = document.createElement('div')
      cell.className = 'cell'
      const cv = document.createElement('canvas')
      cell.append(cv)
      const cap = document.createElement('pre')
      cap.className = 'cap'
      cell.append(cap)
      film.append(cell)
      const w = size(cv)
      const ctx = cv.getContext('2d')
      const R = 2.6   // 所有格子用同一个视野,方便前后对照
      const X = (x) => ((x + R) / (2 * R)) * w
      const Y = (y) => ((R - y) / (2 * R)) * w
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, w, w)
      // 折叠格子
      ctx.lineWidth = dpr(); ctx.strokeStyle = COLORS.grid
      for (let c = -5; c <= 5; c += 2) {
        ctx.beginPath(); ctx.moveTo(X(c), 0); ctx.lineTo(X(c), w); ctx.moveTo(0, Y(c)); ctx.lineTo(w, Y(c)); ctx.stroke()
      }
      // 目标线 y = 0
      ctx.strokeStyle = COLORS.line; ctx.lineWidth = 2 * dpr()
      ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(w, Y(0)); ctx.stroke()
      // 中心盒子与反演圆
      ctx.strokeStyle = COLORS.box
      ctx.strokeRect(X(-1), Y(1), X(1) - X(-1), Y(-1) - Y(1))
      ctx.setLineDash([5 * dpr(), 4 * dpr()]); ctx.strokeStyle = '#8aa0d0'; ctx.lineWidth = dpr()
      circle(ctx, X(0), Y(0), (Math.sqrt(s) / (2 * R)) * w, null, '#8aa0d0', dpr())
      ctx.setLineDash([])
      // ① 前像 → ② 折叠后 → ③ 反演后
      const b = [X(r.before[0]), Y(r.before[1])], f = [X(r.folded[0]), Y(r.folded[1])]
      arrow(ctx, b[0], b[1], f[0], f[1], COLORS.fold + 'cc', 1.5 * dpr())
      const inside = Math.abs(r.after[0]) < R * 0.97 && Math.abs(r.after[1]) < R * 0.97
      let a = [X(r.after[0]), Y(r.after[1])]
      if (!inside) {
        const t = (R * 0.95) / Math.max(Math.abs(r.after[0]), Math.abs(r.after[1]))
        a = [X(r.after[0] * t), Y(r.after[1] * t)]
      }
      arrow(ctx, f[0], f[1], a[0], a[1], COLORS.inv + 'cc', 1.5 * dpr())
      circle(ctx, b[0], b[1], 6 * dpr(), null, COLORS.before, 2 * dpr())
      circle(ctx, f[0], f[1], 5 * dpr(), COLORS.fold, '#000', dpr())
      circle(ctx, a[0], a[1], 6 * dpr(), COLORS.inv, '#000', dpr())
      ctx.font = `${11 * dpr()}px sans-serif`
      const label = (t, c, [x, y], dy) => {
        ctx.fillStyle = c
        const tw = ctx.measureText(t).width
        ctx.fillText(t, x + 10 * dpr() + tw > w ? x - 10 * dpr() - tw : x + 10 * dpr(), y + dy * dpr())
      }
      label('进入', COLORS.before, b, -6)
      label('折叠后', COLORS.fold, f, 14)
      label(inside ? '反演后' : '反演后(出画面)', COLORS.inv, a, -6)
      ctx.fillStyle = '#8e9a92'; ctx.fillText(`第 ${idx + 1} 轮`, 6 * dpr(), 14 * dpr())
      const shiftTxt = `(${r.shift[0].toFixed(0)}, ${r.shift[1].toFixed(0)})`
      cap.textContent =
        `进入  ${fmt(r.before)}\n` +
        `折叠  ${fmt(r.folded)}  平移 ${shiftTxt}\n` +
        `r²=${r.r2.toFixed(3)}  k=s/r²=${r.k.toFixed(2)}\n` +
        `反演  ${fmt(r.after)}\n` +
        `scale=${r.scale >= 1000 ? r.scale.toExponential(1) : r.scale.toFixed(2)}  d=|y|/scale=${r.d.toExponential(1)}`
      if (idx < rows.length - 1) {
        const hand = document.createElement('div')
        hand.className = 'hand'
        hand.textContent = '↓ 反演后的点,原封不动交给下一轮当“进入”'
        cell.append(hand)
      }
    })
  }

  function draw() {
    const s = Number(sIn.value), n = Number(nIn.value)
    sOut.textContent = s.toFixed(2); nOut.textContent = n
    const rows = trace2d(P, s, n)
    drawLeft(rows, s, n)
    drawFilm(rows, s)
    const last = rows[rows.length - 1]
    summary.innerHTML = `迭代 ${n} 轮后:最终距离估计 d = |y| / scale = <b>${last.d.toExponential(2)}</b>(左图白线是所有 d≈0 的点)。`
  }

  let dragging = false
  const move = (e) => {
    const r = left.getBoundingClientRect()
    P[0] = ((e.clientX - r.left) / r.width * 2 - 1) * R_LEFT
    P[1] = (1 - (e.clientY - r.top) / r.height * 2) * R_LEFT
    draw()
  }
  left.addEventListener('pointerdown', (e) => { dragging = true; left.setPointerCapture(e.pointerId); move(e) })
  left.addEventListener('pointermove', (e) => { if (dragging) move(e) })
  left.addEventListener('pointerup', () => { dragging = false })
  sIn.oninput = draw
  nIn.oninput = draw
  window.addEventListener('resize', draw)
  draw()
}
