import { getDevice, FullscreenPass, fitCanvas, onVisible, buildControls, showError } from '../gpu.js'
import { SCENE_WGSL, SCENE_DEFAULTS } from './scene3d.js'

// 一个 3D 视窗:轨道相机(拖动旋转、滚轮缩放)+ 一组控件
// opts: { params: 覆盖默认参数, controls: 控件定义, camera: {yaw,pitch,dist}, onFrame }
export async function mountViewer(root, opts = {}) {
  const params = { ...SCENE_DEFAULTS, ...(opts.params || {}) }
  const canvas = root.querySelector('canvas')
  const ctlHost = root.querySelector('.ctl')
  const cam = { yaw: 0.6, pitch: 0.25, dist: 4.6, ...(opts.camera || {}) }
  let pass
  try {
    const device = await getDevice()
    pass = new FullscreenPass(device, canvas, SCENE_WGSL, 28)
  } catch (e) {
    showError(canvas, e)
    return null
  }

  let visible = false
  let dirty = true
  let paused = false
  let raf = 0
  // 按需驱动:只有在视口内且(正在动画或有改动)时才排下一帧
  const kick = () => {
    if (raf || !visible) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const mark = () => { dirty = true; kick() }
  let simTime = opts.startTime ?? 6.0
  let last = performance.now()
  const fps = root.querySelector('.fps')
  let frames = 0
  let fpsT = last

  let refresh = () => {}
  if (ctlHost && opts.controls) {
    refresh = buildControls(ctlHost, params, opts.controls, () => { mark() })
  }

  // 相机交互
  let drag = null
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return
    cam.yaw = drag.yaw - (e.clientX - drag.x) * 0.008
    cam.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.008))
    mark()
  })
  const up = () => { drag = null; kick() }
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    cam.dist = Math.max(0.3, Math.min(12, cam.dist * Math.exp(e.deltaY * 0.0012)))
    mark()
  }, { passive: false })

  const isAnimating = () => !paused && (params.speed > 0 || (params.autoRotate && !drag))

  function frame(now) {
    raf = 0
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!visible) return
    const animating = isAnimating()
    if (!animating && !dirty) return
    if (!paused) simTime += dt * 0.5 * params.speed
    if (animating && params.autoRotate && !drag) cam.yaw += dt * 0.08
    opts.onFrame?.(params, cam)
    fitCanvas(canvas, params.res)
    const cp = Math.cos(cam.pitch)
    const camPos = [cam.dist * cp * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch), cam.dist * cp * Math.cos(cam.yaw)]
    const fwd = norm(camPos.map((v) => -v))
    const right = norm(cross(fwd, [0, 1, 0]))
    const upv = cross(right, fwd)
    const u = pass.u
    u.set([canvas.width, canvas.height, simTime, params.mode])
    u.set([...camPos, params.focal], 4)
    u.set([...right, params.iters], 8)
    u.set([...upv, params.s], 12)
    u.set([...fwd, params.wAmp], 16)
    u.set([params.bound, params.sats, params.rot4d, params.thick], 20)
    u.set([params.zoom, params.nIters, params.twist, params.stepK], 24)
    pass.draw()
    dirty = false
    frames++
    if (isAnimating()) kick()
    if (fps && now - fpsT > 500) {
      fps.textContent = `${Math.round((frames * 1000) / (now - fpsT))} fps · ${canvas.width}×${canvas.height}`
      frames = 0
      fpsT = now
    }
  }
  onVisible(root, (v) => { visible = v; if (v) mark() })
  if (params.speed > 0 || params.autoRotate) {
    const btn = document.createElement('button')
    btn.className = 'pausebtn'
    btn.type = 'button'
    const sync = () => { btn.textContent = paused ? '▶ 播放' : '⏸ 暂停' }
    btn.onclick = () => { paused = !paused; sync(); mark() }
    ;(root.querySelector('.stack') || canvas.parentElement).append(btn)
    sync()
  }
  return { params, cam, refresh, redraw: () => { mark() } }
}

function norm(v) {
  const l = Math.hypot(...v)
  return v.map((x) => x / l)
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
