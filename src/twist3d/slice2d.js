import { getDevice, FullscreenPass, fitCanvas, onVisible, buildControls, showError } from '../gpu.js'
import { lift4, apollian } from './math.js'

// 把 cluster 的距离场在一个 2D 平面 (x, y, z=sliceZ) 上切开来看
const SLICE_WGSL = /* wgsl */ `
struct U {
  res: vec2f, center: vec2f,
  scale: f32, iters: f32, s: f32, zoom: f32,
  sliceZ: f32, sliceW: f32, wAmp: f32, rotXW: f32,
  rotYW: f32, thick: f32, mode: f32, bound: f32,
  hover: vec2f, hoverOn: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> u: U;

fn rotate2(p: vec2f, a: f32) -> vec2f {
  let c = cos(a); let s = sin(a);
  return vec2f(c * p.x + s * p.y, -s * p.x + c * p.y);
}
fn tanh_approx(x: f32) -> f32 {
  let x2 = x * x;
  return clamp(x * (27.0 + x2) / (27.0 + 9.0 * x2), -1.0, 1.0);
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = u.scale / u.res.y;
  let xy = u.center + vec2f(fc.x - 0.5 * u.res.x, 0.5 * u.res.y - fc.y) * px;
  let p3 = vec3f(xy, u.sliceZ);
  var pp = vec4f(p3, u.sliceW + u.wAmp * (1.0 - tanh_approx(0.82 * length(p3))));
  let a = rotate2(pp.xw, u.rotXW); pp = vec4f(a.x, pp.y, pp.z, a.y);
  let b = rotate2(pp.yw, u.rotYW); pp = vec4f(pp.x, b.x, pp.z, b.y);
  var p = pp / u.zoom;

  var scale = 1.0;
  var trap = 1000.0;
  var detail = 0.0;
  let n = u32(u.iters);
  for (var i = 0u; i < n; i = i + 1u) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    let r2 = max(dot(p, p), 1.0e-5);
    trap = min(trap, r2);
    detail = max(detail, f32(i + 1u) / f32(n) * exp(-1.25 * r2));
    let k = u.s / r2;
    p = p * k;
    scale = scale * k;
  }
  detail = clamp(max(detail, clamp(log2(max(scale, 1.0)) / 22.0, 0.0, 1.0)), 0.0, 1.0);
  var d = abs(p.y) / scale * u.zoom - u.thick;
  if (u.bound > 0.5) { d = max(d, length(p3) - 1.08); }

  var col: vec3f;
  if (u.mode < 0.5) {
    // 经典的距离场可视化:外部橙、内部蓝,等值线间隔 0.02
    col = select(vec3f(0.62, 0.82, 1.0), vec3f(0.92, 0.6, 0.32), d > 0.0);
    col *= 1.0 - exp(-24.0 * abs(d));
    col *= 0.78 + 0.22 * cos(6.28318 * d / 0.02);
    col = mix(col, vec3f(1.0), 1.0 - smoothstep(0.0, 1.5 * px, abs(d)));
  } else {
    // 接近原着色器的配色:detail 决定绿→金→白,trap 当作 AO
    let ao = pow(clamp(trap * 1.55, 0.0, 1.0), 0.55);
    let base = mix(vec3f(0.01, 0.05, 0.02), vec3f(0.18, 0.38, 0.10), sqrt(detail));
    let core = mix(vec3f(1.1, 0.88, 0.28), vec3f(1.0), smoothstep(0.74, 1.0, detail));
    col = mix(base, core, pow(detail, 1.6)) * (0.25 + 0.75 * ao);
    let edge = 1.0 - smoothstep(0.0, 2.0 * px, d);
    col = mix(col * 0.35, col * 1.4, edge);
  }
  // 包围球边界(虚线感)
  let rr = abs(length(p3) - 1.08);
  if (u.bound < 0.5 && rr < px) { col = mix(col, vec3f(0.5, 0.6, 0.9), 0.5); }
  // 悬停点
  if (u.hoverOn > 0.5) {
    let hd = length(xy - u.hover);
    if (abs(hd - 6.0 * px) < px) { col = vec3f(1.0, 0.3, 0.5); }
  }
  return vec4f(sqrt(clamp(col, vec3f(0.0), vec3f(1.0))) * 0.4 + clamp(col, vec3f(0.0), vec3f(1.0)) * 0.6, 1.0);
}
`

export const SLICE_DEFAULTS = {
  iters: 16, s: 1.24, zoom: 4.1, sliceZ: 0, sliceW: 0, wAmp: 0.055, rotXW: 0, rotYW: 0,
  thick: 0.0048, mode: 0, bound: 1,
}

// opts: { params, controls, view: {cx,cy,scale}, orbit: 元素(显示轨道表) }
export async function mountSlice(root, opts = {}) {
  const params = { ...SLICE_DEFAULTS, ...(opts.params || {}) }
  const view = { cx: 0, cy: 0, scale: 2.6, ...(opts.view || {}) }
  const canvas = root.querySelector('canvas')
  let pass
  try {
    pass = new FullscreenPass(await getDevice(), canvas, SLICE_WGSL, 20)
  } catch (e) {
    showError(canvas, e)
    return null
  }
  let dirty = true
  let visible = false
  let hover = null
  const orbitEl = root.querySelector('.orbit')
  const readout = root.querySelector('.readout')

  const ctlHost = root.querySelector('.ctl')
  if (ctlHost && opts.controls) buildControls(ctlHost, params, opts.controls, () => { dirty = true; updateOrbit() })

  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect()
    return [view.cx + ((e.clientX - r.left - r.width / 2) / r.height) * view.scale, view.cy + ((r.height / 2 - (e.clientY - r.top)) / r.height) * view.scale]
  }
  let drag = null
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, moved: false }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const r = canvas.getBoundingClientRect()
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true
      view.cx = drag.cx - ((e.clientX - drag.x) / r.height) * view.scale
      view.cy = drag.cy + ((e.clientY - drag.y) / r.height) * view.scale
      dirty = true
    } else if (!opts.clickToPick) {
      hover = toWorld(e)
      dirty = true
      updateOrbit()
    }
  })
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      hover = toWorld(e)
      updateOrbit()
    }
    drag = null
    dirty = true
  })
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    const before = toWorld(e)
    view.scale *= Math.exp(e.deltaY * 0.0012)
    const after = toWorld(e)
    view.cx += before[0] - after[0]
    view.cy += before[1] - after[1]
    dirty = true
  }, { passive: false })

  function updateOrbit() {
    if (!hover) return
    const log = []
    const p4 = lift4(hover[0], hover[1], params.sliceZ, params)
    const res = apollian(p4, params.s, params.iters, log)
    let d = res.dist * params.zoom - params.thick
    if (params.bound) d = Math.max(d, Math.hypot(hover[0], hover[1], params.sliceZ) - 1.08)
    if (readout) {
      readout.innerHTML = `点 (${hover[0].toFixed(3)}, ${hover[1].toFixed(3)}) · 累计缩放 scale = <b>${fmtBig(res.scale)}</b> · 距离估计 d = <b>${d.toExponential(2)}</b> · 最小 r² = ${res.trap.toFixed(3)}`
    }
    if (orbitEl) {
      const f = (v) => v.map((x) => x.toFixed(3).padStart(7)).join(' ')
      orbitEl.textContent = ' i   折叠后 p (x y z w)                   r²       k=s/r²     scale\n' +
        log.map((l) => `${String(l.i).padStart(2)}  ${f(l.folded)}   ${l.r2.toFixed(4).padStart(7)}  ${l.k.toFixed(3).padStart(9)}  ${fmtBig(l.scale).padStart(9)}`).join('\n')
    }
  }

  function frame() {
    requestAnimationFrame(frame)
    if (!visible || !dirty) return
    fitCanvas(canvas)
    const u = pass.u
    u.set([canvas.width, canvas.height, view.cx, view.cy, view.scale, params.iters, params.s, params.zoom,
      params.sliceZ, params.sliceW, params.wAmp, params.rotXW, params.rotYW, params.thick, params.mode, params.bound,
      hover ? hover[0] : 0, hover ? hover[1] : 0, hover ? 1 : 0, 0])
    pass.draw()
    dirty = false
  }
  onVisible(root, (v) => { visible = v; dirty = true })
  window.addEventListener('resize', () => { dirty = true })
  requestAnimationFrame(frame)
  return { params, view, redraw: () => { dirty = true; updateOrbit() } }
}

function fmtBig(x) {
  return x >= 1000 ? x.toExponential(2) : x.toFixed(3)
}
