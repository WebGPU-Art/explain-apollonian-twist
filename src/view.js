import { getDevice, FullscreenPass, fitCanvas, onVisible, buildControls, showError, getToolbar } from './gpu.js'
import { SHADER_WGSL, DEFAULTS, packUniforms } from './shader.js'

// 把整个着色器画进一个 canvas:支持拖动平移、滚轮缩放、时间播放、控件、叠加层
// opts: { params, controls, overlay(ctx, api), onPick(worldPoint, api), clickPick, scale }
export async function mountShader(root, opts = {}) {
  const params = { ...DEFAULTS, ...(opts.params || {}) }
  const canvas = root.querySelector('canvas.gl')
  const ov = root.querySelector('canvas.ov')
  const fps = root.querySelector('.fps')
  let pass
  try {
    pass = new FullscreenPass(await getDevice(), canvas, SHADER_WGSL, 28)
  } catch (e) {
    showError(canvas, e)
    ov?.remove()
    return null
  }
  let dirty = true, visible = false
  let last = performance.now(), frames = 0, fpsT = last, tick = 0
  const dprScale = opts.dprScale ?? 0.75
  // 按需驱动:只有在视口内且(正在播放或有改动)时才排下一帧,离开视口后循环完全停止
  let raf = 0
  const kick = () => {
    if (raf || !visible) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const mark = () => { dirty = true; kick() }

  const api = {
    params,
    redraw: () => { mark() },
    toWorld(e) {
      const r = canvas.getBoundingClientRect()
      const qx = (e.clientX - r.left) / r.width, qy = (e.clientY - r.top) / r.height
      const aspect = r.width / r.height
      return [params.cx + (-1 + 2 * qx) * aspect * params.scale, params.cy + (1 - 2 * qy) * params.scale]
    },
    toPixel(x, y, w, h) {
      const aspect = w / h
      return [((x - params.cx) / (aspect * params.scale) + 1) * 0.5 * w, (1 - (y - params.cy) / params.scale) * 0.5 * h]
    },
    refresh: () => {},
  }
  const ctlHost = root.querySelector('.ctl')
  if (ctlHost && opts.controls) api.refresh = buildControls(ctlHost, params, opts.controls, () => { syncBtn(); mark() })

  // 暂停 / 播放按钮(只给一开始就在动的画面加)
  let syncBtn = () => {}
  if (params.play && params.speed > 0) {
    const btn = document.createElement('button')
    btn.className = 'pausebtn'
    btn.type = 'button'
    syncBtn = () => { btn.textContent = params.play ? '⏸ 暂停' : '▶ 播放' }
    btn.onclick = () => { params.play = params.play ? 0 : 1; syncBtn(); api.refresh(); mark() }
    ;getToolbar(root).append(btn)
    syncBtn()
  }
  const baseRefresh = api.refresh
  api.refresh = () => { baseRefresh(); syncBtn() }

  let drag = null
  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: params.cx, cy: params.cy, moved: false }
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (drag && opts.pan !== false) {
      const r = canvas.getBoundingClientRect()
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true
      if (opts.dragPick) { opts.onPick?.(api.toWorld(e), api); mark(); return }
      params.cx = drag.cx - ((e.clientX - drag.x) / r.height) * 2 * params.scale
      params.cy = drag.cy + ((e.clientY - drag.y) / r.height) * 2 * params.scale
      mark()
    } else if (!drag && !opts.clickPick) {
      opts.onPick?.(api.toWorld(e), api)
      mark()
    }
  })
  canvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) { opts.onPick?.(api.toWorld(e), api); mark() }
    drag = null
  })
  canvas.addEventListener('pointercancel', () => { drag = null })
  if (opts.zoomable !== false) {
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const before = api.toWorld(e)
      params.scale = Math.max(0.002, Math.min(8, params.scale * Math.exp(e.deltaY * 0.0012)))
      const after = api.toWorld(e)
      params.cx += before[0] - after[0]
      params.cy += before[1] - after[1]
      mark()
    }, { passive: false })
  }
  root.querySelector('.reset-view')?.addEventListener('click', () => {
    params.cx = 0; params.cy = 0; params.scale = opts.params?.scale ?? 1; mark()
  })

  function frame(now) {
    raf = 0
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!visible) return
    const playing = params.play && params.speed > 0
    if (!playing && !dirty) return
    if (playing) {
      params.time += dt * params.speed
      if (++tick % 8 === 0) api.refresh()
    }
    fitCanvas(canvas, dprScale)
    packUniforms(pass.u, params, canvas.width, canvas.height)
    pass.draw()
    if (ov && opts.overlay) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.round(ov.clientWidth * dpr), h = Math.round(ov.clientHeight * dpr)
      if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h }
      const ctx = ov.getContext('2d')
      ctx.clearRect(0, 0, w, h)
      opts.overlay(ctx, api, w, h, dpr)
    }
    dirty = false
    frames++
    if (params.play && params.speed > 0) kick()
    if (fps && now - fpsT > 500) {
      fps.textContent = `${Math.round((frames * 1000) / (now - fpsT))} fps`
      frames = 0
      fpsT = now
    }
  }
  onVisible(root, (v) => { visible = v; if (v) mark() })
  window.addEventListener('resize', () => { mark() })
  return api
}
