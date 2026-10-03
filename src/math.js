// JS 版的 apollian():用于逐步打印轨道、以及 2D 光线步进演示
export function fold1(x) {
  // -1 + 2*fract(0.5*x + 0.5)
  const t = 0.5 * x + 0.5
  return -1 + 2 * (t - Math.floor(t))
}

export function tanhApprox(x) {
  const x2 = x * x
  return Math.max(-1, Math.min(1, (x * (27 + x2)) / (27 + 9 * x2)))
}

export function rot(a, b, ang) {
  const c = Math.cos(ang), s = Math.sin(ang)
  return [c * a + s * b, -s * a + c * b]
}

// 从 cluster 局部坐标 (x,y,z) 构造 4D 点,和着色器里 warp() 的静态部分一致
export function lift4(x, y, z, o) {
  const len = Math.hypot(x, y, z)
  let p = [x, y, z, (o.sliceW || 0) + o.wAmp * (1 - tanhApprox(0.82 * len))]
  ;[p[0], p[3]] = rot(p[0], p[3], o.rotXW || 0)
  ;[p[1], p[3]] = rot(p[1], p[3], o.rotYW || 0)
  return p.map((v) => v / o.zoom)
}

export function apollian(p0, s, n, log) {
  let p = p0.slice()
  let scale = 1
  let trap = Infinity
  for (let i = 0; i < n; i++) {
    const before = p.slice()
    p = p.map(fold1)
    const r2 = Math.max(p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3], 1e-5)
    trap = Math.min(trap, r2)
    const k = s / r2
    p = p.map((v) => v * k)
    scale *= k
    log?.push({ i, before, folded: p.map((v) => v / k), r2, k, scale })
  }
  return { dist: Math.abs(p[1]) / scale, trap, scale, p }
}

// 2D 切片上的距离场(cluster 的一部分,不含动画)
export function sliceDE(x, y, o) {
  const p4 = lift4(x, y, o.sliceZ || 0, o)
  let d = apollian(p4, o.s, o.iters).dist * o.zoom - (o.thick || 0)
  if (o.bound) d = Math.max(d, Math.hypot(x, y, o.sliceZ || 0) - 1.08)
  return d
}
