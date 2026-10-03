import { mountShader } from './view.js'
import { mountFold, mountInversion, drawSide } from './demos2d.js'
import { MODES, DEFAULTS } from './shader.js'
import { weird, lightGeom } from './math.js'
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
    const f = (v) => v.map((x) => x.toFixed(3).padStart(7)).join(' ')
    const big = (x) => (x >= 1000 ? x.toExponential(2) : x.toFixed(3))
    orbit.textContent = ' i   折叠后 p (x y z w)                  r²        k=s/r²     scale\n' +
      log.map((l) => `${String(l.i).padStart(2)}  ${f(l.folded)}  ${l.r2.toFixed(4).padStart(8)}  ${l.k.toFixed(3).padStart(9)}  ${big(l.scale).padStart(9)}`).join('\n')
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

// 4 · twist:手动控制 4D 切面
mountShader($('#twist-demo'), {
  params: { mode: 2, play: 0, time: 5, manual: 1, ox: 0.25, oy: 0.25, oz: 0.25, scale: 0.9 },
  dprScale: 0.6,
  controls: [
    K('manual', '手动偏移'),
    R('ox', 'off.x', -1, 1.5, 0.005), R('oy', 'off.y', -1, 1.5, 0.005), R('oz', 'off.z', -1, 1.5, 0.005),
    R('wAmp', 'w 鼓包幅度', 0, 0.5, 0.001), R('tanhK', '鼓包衰减', 0.2, 4, 0.01, 2),
    K('rot4d', '4D 旋转 (yz, xz)'), R('time', '时间 (转角)', 0, 60, 0.05, 2), K('spin', '屏幕自转'),
    modeSel([[2, '距离场等值线'], [4, '曲线与辉光']]),
  ],
})

// 5 · 两层缩放
mountShader($('#zoom-demo'), {
  params: { mode: 4, play: 0, time: 5 },
  dprScale: 0.6,
  controls: [R('z', 'z (weird 内部)', 1, 12, 0.05, 2), R('zoom', 'zoom (df 外部)', 0.15, 3, 0.01, 2), R('s', 's', 0.8, 2, 0.005), R('iters', '迭代次数', 1, 12, 1), R('time', '时间', 0, 60, 0.05, 2)],
})

// 6 · 地板与灯
{
  const root = $('#light-demo')
  const side = root.querySelector('canvas.side')
  const readout = root.querySelector('.readout')
  let pick = [0.35, 0.2]
  const drawAll = (ctx, api, w, h, dpr) => {
    const P = api.params
    const g = lightGeom(pick, P, P.time)
    // 俯视图上标出采样点
    const mark = (pt, color, r) => {
      const [x, y] = api.toPixel(pt[0], pt[2], w, h)
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r * dpr, 0, 7); ctx.fill()
      ctx.strokeStyle = '#000'; ctx.lineWidth = dpr; ctx.stroke()
    }
    const link = (a, b, color) => {
      const [x0, y0] = api.toPixel(a[0], a[2], w, h), [x1, y1] = api.toPixel(b[0], b[2], w, h)
      ctx.strokeStyle = color; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    }
    link(g.pp, g.bp, '#ffffffaa'); link(g.bp, g.sp1, '#ffe9a0aa'); link(g.bp, g.sp2, '#ff9ad0aa')
    mark(g.pp, '#ffffff', 5); mark(g.bp, '#6ef0c0', 5); mark(g.sp1, '#ffe9a0', 6); mark(g.sp2, '#ff9ad0', 6)
    // 侧视图
    const sdpr = Math.min(window.devicePixelRatio || 1, 2)
    const sw = Math.round(side.clientWidth * sdpr), sh = Math.round(side.clientHeight * sdpr)
    if (side.width !== sw || side.height !== sh) { side.width = sw; side.height = sh }
    drawSide(side.getContext('2d'), g, P, sw, sh, sdpr)
    const shadow = (sd) => (sd < 0.01 ? '被挡住' : sd < 0.05 ? '擦边' : '穿过空隙')
    readout.innerHTML = `p = (${pick[0].toFixed(2)}, ${pick[1].toFixed(2)}) · bp 与 pp 相差 ${Math.hypot(g.bp[0] - g.pp[0], g.bp[2] - g.pp[2]).toFixed(3)}<br>` +
      `<span style="color:#ffe9a0">灯1</span>:sd1 = ${g.sd1.toFixed(3)}(${shadow(g.sd1)})→ 贡献 ${g.c1.toFixed(3)}<br>` +
      `<span style="color:#ff9ad0">灯2</span>:sd2 = ${g.sd2.toFixed(3)}(${shadow(g.sd2)})→ 贡献 ${g.c2.toFixed(3)}`
  }
  mountShader(root, {
    params: { mode: 3, play: 0, time: 5, speed: 1, floorB: -0.125 },
    clickPick: true,
    dragPick: true,
    pan: true,
    dprScale: 0.6,
    controls: [
      modeSel([[3, '只看地板上的光'], [2, '距离场等值线'], [0, '最终画面']]),
      R('floorB', '地板深度 b', -1.2, -0.01, 0.005, 3), R('lightH', '灯高', 0.3, 3, 0.01, 2), R('camT', '相机高度', 1.5, 20, 0.1, 1),
      R('ss', 'ss', 1, 60, 0.5, 1), K('bugFix', '修正 sp2'), R('time', '时间', 0, 60, 0.05, 2),
    ],
    onPick: (w) => { pick = w },
    overlay: drawAll,
  })
}

// 7 · 配色
mountShader($('#color-demo'), {
  dprScale: 0.75,
  controls: [modeSel(), R('glowGain', '辉光强度', 0, 3, 0.01, 2), R('lightGain', '地板光强度', 0, 3, 0.01, 2), K('play', '播放'), R('speed', '速度', 0, 4, 0.05, 2)],
})
