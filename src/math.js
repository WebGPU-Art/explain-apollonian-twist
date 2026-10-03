// JS 版的 apollian() / weird() / color() 几何部分:用于逐轮打印轨道,以及在俯视图上标出光线采样点
export function fold1(x) {
  const t = 0.5 * x + 0.5
  return -1 + 2 * (t - Math.floor(t))
}

export const rot = (a, b, ang) => {
  const c = Math.cos(ang), s = Math.sin(ang)
  return [c * a + s * b, -s * a + c * b]
}
const psin = (x) => 0.5 + 0.5 * Math.sin(x)

export function apollian(p0, s, n, log) {
  let p = p0.slice()
  let scale = 1
  for (let i = 0; i < n; i++) {
    const before = p.slice()
    p = p.map(fold1)
    const r2 = Math.max(p[0] * p[0] + p[1] * p[1] + p[2] * p[2] + p[3] * p[3], 1e-9)
    const k = s / r2
    const folded = p.slice()
    p = p.map((v) => v * k)
    scale *= k
    log?.push({ i, before, folded, r2, k, scale, after: p.slice(), d: Math.abs(p[1]) / scale })
  }
  return { dist: Math.abs(p[1]) / scale, scale, p }
}

// 把 2D 点抬到 4D(weird() 的前半段)
export function lift(p0, P, time) {
  let [x, y] = P.spin ? rot(p0[0], p0[1], time * 0.1) : p0
  const tm = 0.2 * time
  const r = P.offR
  const off = P.manual > 0.5 ? [P.ox, P.oy, P.oz] : [r * psin(tm * Math.sqrt(3)), r * psin(tm * Math.sqrt(1.5)), r * psin(tm * Math.sqrt(2))]
  let pp = [x + off[0], y + off[1], off[2], 0]
  pp[3] = P.wAmp * (1 - Math.tanh(P.tanhK * Math.hypot(pp[0], pp[1], pp[2])))
  if (P.rot4d) {
    ;[pp[1], pp[2]] = rot(pp[1], pp[2], tm)
    ;[pp[0], pp[2]] = rot(pp[0], pp[2], tm * Math.sqrt(0.5))
  }
  return pp.map((v) => v / P.z)
}

export function weird(p0, P, time, log) {
  const r = apollian(lift(p0, P, time), P.s, P.iters, log)
  return r.dist * P.z
}

export function df(p, P, time) {
  return weird([p[0] / P.zoom, p[1] / P.zoom], P, time) * P.zoom
}

const sub = (a, b) => a.map((v, i) => v - b[i])
const add = (a, b) => a.map((v, i) => v + b[i])
const mul = (a, k) => a.map((v) => v * k)
const len = (a) => Math.hypot(...a)
const nrm = (a) => mul(a, 1 / len(a))

// color() 里的几何部分:相机射线 → 地板 → 两盏灯 → 回到曲线平面
export function lightGeom(p, P, time) {
  const lh = P.lightH, t = P.camT, b = P.floorB
  const lp1 = [0.5, lh, 0.5], lp2 = [-0.5, lh, 0.5]
  const ro = [0, t, 0]
  const pp = [p[0], 0, p[1]]
  const rd = nrm(sub(pp, ro))
  const bt = -(t - b) / rd[1]
  const bp = add(ro, mul(rd, bt))
  const s1 = nrm(sub(lp1, bp)), s2 = nrm(sub(lp2, bp))
  const st1 = (0 - b) / s1[1], st2 = (0 - b) / s2[1]
  const sp1 = add(bp, mul(s1, st1))
  const sp2 = add(bp, mul(s2, P.bugFix ? st2 : st1))
  const sp2True = add(bp, mul(s2, st2))
  const bl21 = len(sub(lp1, bp)) ** 2, bl22 = len(sub(lp2, bp)) ** 2
  const sd1 = df([sp1[0], sp1[2]], P, time), sd2 = df([sp2[0], sp2[2]], P, time)
  const c1 = (1 - Math.exp(-P.ss * Math.max(sd1, 0))) / bl21
  const c2 = (0.5 * (1 - Math.exp(-P.ss * Math.max(sd2, 0)))) / bl22
  return { lp1, lp2, ro, pp, bp, sp1, sp2, sp2True, sd1, sd2, c1, c2, bl21, bl22 }
}

// weird() 前半段的逐步分解:每一步之后的 4D 坐标
export function liftSteps(p0, P, time) {
  const steps = []
  const tm = 0.2 * time
  let [x, y] = P.spin ? rot(p0[0], p0[1], time * 0.1) : p0
  if (P.spin) steps.push(['p *= ROT(TIME·0.1)', [x, y, 0, 0]])
  else steps.push(['p(未自转)', [x, y, 0, 0]])
  const r = P.offR
  const off = P.manual > 0.5 ? [P.ox, P.oy, P.oz] : [r * psin(tm * Math.sqrt(3)), r * psin(tm * Math.sqrt(1.5)), r * psin(tm * Math.sqrt(2))]
  let pp = [x + off[0], y + off[1], off[2], 0]
  steps.push([`+ off = (${off.map((v) => v.toFixed(3)).join(', ')}, 0)`, pp.slice()])
  pp[3] = P.wAmp * (1 - Math.tanh(P.tanhK * Math.hypot(pp[0], pp[1], pp[2])))
  steps.push([`w = ${P.wAmp}·(1 − tanh|xyz|)`, pp.slice()])
  if (P.rot4d) {
    ;[pp[1], pp[2]] = rot(pp[1], pp[2], tm)
    steps.push([`yz 旋转 tm = ${tm.toFixed(3)}`, pp.slice()])
    ;[pp[0], pp[2]] = rot(pp[0], pp[2], tm * Math.sqrt(0.5))
    steps.push([`xz 旋转 tm·√0.5 = ${(tm * Math.sqrt(0.5)).toFixed(3)}`, pp.slice()])
  }
  pp = pp.map((v) => v / P.z)
  steps.push([`/ z (${P.z})`, pp.slice()])
  return steps
}
