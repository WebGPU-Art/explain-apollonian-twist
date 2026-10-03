import { addFullscreenAll } from './gpu.js'
import { mountShader } from './view.js'
import { mountFold, mountInversion } from './demos2d.js'
import { mountRelay } from './relay.js'
import { MODES, DEFAULTS, STAGES } from './shader.js'
import { weird, lightGeom, liftSteps } from './math.js'
import glsl from './apollian-twist.glsl?raw'
import { SHADER_WGSL } from './shader.js'

const $ = (s) => document.querySelector(s)
const R = (key, label, min, max, step, digits) => ({ key, label, type: 'range', min, max, step, digits })
const K = (key, label) => ({ key, label, type: 'check' })
const modeSel = (opts = MODES) => ({ key: 'mode', label: '视图', type: 'select', options: opts })

$('#source-glsl').textContent = glsl
$('#source-wgsl').textContent = SHADER_WGSL

// 主视窗
mountShader($('#hero'), {
  dprScale: 0.75,
  controls: [modeSel(), R('speed', '速度', 0, 4, 0.05, 2), K('play', '播放'), R('time', '时间', 0, 400, 0.1, 1)],
})

mountFold($('#fold-demo'))
mountInversion($('#inv-demo'))
mountRelay($('#relay-demo'))

// 3 · 迭代:点击取点,右边打印轨道
{
  const root = $('#iter-demo')
  const orbit = root.querySelector('.orbit')
  const readout = root.querySelector('.readout')
  let pick = null
  const show = (api) => {
    if (!pick) return
    const P = api.params
    const log = []
    const d = weird([pick[0] / P.zoom, pick[1] / P.zoom], P, P.time, log) * P.zoom
    const f = (v) => v.map((x) => x.toFixed(2).padStart(6)).join(' ')
    const big = (x) => (x >= 1000 ? x.toExponential(1) : x.toFixed(2))
    orbit.textContent = ' i  折叠前 (x y z w)           折叠后 (x y z w)          r²      k     反演后 y   scale    d_i\n' +
      log.map((l) => `${String(l.i).padStart(2)}  ${f(l.before)}  ${f(l.folded)}  ${l.r2.toFixed(3).padStart(6)} ${l.k.toFixed(2).padStart(6)} ${l.after[1].toFixed(2).padStart(9)} ${big(l.scale).padStart(8)} ${l.d.toExponential(1).padStart(8)}`).join('\n')
    readout.innerHTML = `点 (${pick[0].toFixed(3)}, ${pick[1].toFixed(3)}) → df = <b>${d.toExponential(2)}</b>(越接近 0 越靠近曲线)`
  }
  mountShader(root, {
    params: { mode: 2, play: 0, time: 5, iters: 3, scale: 1 },
    clickPick: true,
    dprScale: 0.6,
    controls: [R('iters', '迭代次数', 0, 12, 1), R('s', 's', 0.8, 2, 0.005), R('time', '时间 (切面位置)', 0, 60, 0.05, 2)],
    onPick: (w, api) => { pick = w; show(api) },
    overlay: (ctx, api, w, h, dpr) => {
      show(api)
      if (!pick) return
      const [x, y] = api.toPixel(pick[0], pick[1], w, h)
      ctx.strokeStyle = '#ff6b8b'; ctx.lineWidth = 2 * dpr
      ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, 7); ctx.stroke()
    },
  })
}

// 4 · twist:手动控制 4D 切面,点击查看一个点被抬到 4D 的每一步
{
  const root = $('#twist-demo')
  const lift = root.querySelector('.lift')
  let pick = null
  const show = (api) => {
    if (!pick) return
    const P = api.params
    const steps = liftSteps([pick[0] / P.zoom, pick[1] / P.zoom], P, P.time)
    const f = (v) => v.map((x) => x.toFixed(3).padStart(7)).join(' ')
    lift.textContent = `df 把 p=(${pick[0].toFixed(2)}, ${pick[1].toFixed(2)}) 除以 zoom 后交给 weird:\n\n` +
      steps.map(([t, v]) => `${f(v)}   ${t}`).join('\n') + '\n\n最后一行就是传给 apollian() 的 vec4。'
  }
  mountShader(root, {
    params: { mode: 2, play: 0, time: 5, manual: 1, ox: 0.25, oy: 0.25, oz: 0.25, scale: 0.9 },
    dprScale: 0.6,
    clickPick: true,
    controls: [
      K('manual', '手动偏移'),
      R('ox', 'off.x', -1, 1.5, 0.005), R('oy', 'off.y', -1, 1.5, 0.005), R('oz', 'off.z', -1, 1.5, 0.005),
      R('wAmp', 'w 鼓包幅度', 0, 0.5, 0.001), R('tanhK', '鼓包衰减', 0.2, 4, 0.01, 2),
      K('rot4d', '4D 旋转 (yz, xz)'), R('time', '时间 (转角)', 0, 60, 0.05, 2), K('spin', '屏幕自转'),
      modeSel([[2, '距离场等值线'], [4, '曲线与辉光']]),
    ],
    onPick: (w, api) => { pick = w; show(api) },
    overlay: (ctx, api, w, h, dpr) => {
      show(api)
      if (!pick) return
      const [x, y] = api.toPixel(pick[0], pick[1], w, h)
      ctx.strokeStyle = '#ff6b8b'; ctx.lineWidth = 2 * dpr
      ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, 7); ctx.stroke()
    },
  })
}

// 5 · 两层缩放
mountShader($('#zoom-demo'), {
  params: { mode: 4, play: 0, time: 5 },
  dprScale: 0.6,
  controls: [R('z', 'z (weird 内部)', 1, 12, 0.05, 2), R('zoom', 'zoom (df 外部)', 0.15, 3, 0.01, 2), R('s', 's', 0.8, 2, 0.005), R('iters', '迭代次数', 1, 12, 1), R('time', '时间', 0, 60, 0.05, 2)],
})

// 7 · 地板与灯(简述)
mountShader($('#light-demo'), {
  params: { mode: 3, play: 1, speed: 0.5, time: 5, floorB: -0.125 },
  dprScale: 0.6,
  controls: [
    modeSel([[3, '只看地板上的光'], [4, '只看曲线与辉光'], [0, '最终画面']]),
    R('floorB', '地板深度 b', -1.2, -0.01, 0.005, 3), R('lightH', '灯高', 0.3, 3, 0.01, 2),
    K('bugFix', '修正 sp2'), K('play', '动画'),
  ],
})

// 7 · 配色
mountShader($('#color-demo'), {
  dprScale: 0.75,
  controls: [modeSel(), R('glowGain', '辉光强度', 0, 3, 0.01, 2), R('lightGain', '地板光强度', 0, 3, 0.01, 2), K('play', '播放'), R('speed', '速度', 0, 4, 0.05, 2)],
})

// ★ 分步搭建
{
  const root = $('#build-demo')
  const bar = root.querySelector('.stepper')
  const title = root.querySelector('.st-title')
  const text = root.querySelector('.st-text')
  let idx = 0
  let api = null
  let timer = null
  const btns = STAGES.map((st, i) => {
    const b = document.createElement('button')
    b.textContent = st.title.slice(0, 1)
    b.title = st.title
    b.onclick = () => go(i)
    bar.append(b)
    return b
  })
  function go(i) {
    idx = (i + STAGES.length) % STAGES.length
    const st = STAGES[idx]
    title.textContent = st.title
    text.textContent = st.text
    btns.forEach((b, j) => b.classList.toggle('on', j === idx))
    if (api) { api.params.mode = st.mode; api.refresh(); api.redraw() }
  }
  root.querySelector('.prev').onclick = () => go(idx - 1)
  root.querySelector('.next').onclick = () => go(idx + 1)
  const pb = root.querySelector('.playstep')
  pb.onclick = () => {
    if (timer) { clearInterval(timer); timer = null; pb.textContent = '自动播放'; return }
    pb.textContent = '停止'
    timer = setInterval(() => go(idx + 1), 2500)
  }
  mountShader(root, {
    params: { mode: STAGES[0].mode, play: 1, speed: 1, time: 5 },
    dprScale: 0.6,
    controls: [K('play', '动画'), R('speed', '速度', 0, 4, 0.05, 2)],
  }).then((a) => { api = a; go(0) })
  go(0)
}

addFullscreenAll()
