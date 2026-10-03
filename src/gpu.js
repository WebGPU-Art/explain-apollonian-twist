// WebGPU 通用封装:设备、全屏片元着色器、可见性、DPR 适配
let devicePromise
export function getDevice() {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU(请使用较新的 Chrome / Edge / Safari)')
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) throw new Error('没有可用的 WebGPU 适配器')
      return adapter.requestDevice()
    })()
  }
  return devicePromise
}

export function showError(el, e) {
  console.error(e)
  const d = document.createElement('div')
  d.className = 'err'
  d.textContent = String(e.message || e)
  el.replaceWith(d)
}

export function fitCanvas(canvas, dprScale = 1) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2) * dprScale
  const w = Math.max(2, Math.round(canvas.clientWidth * dpr))
  const h = Math.max(2, Math.round(canvas.clientHeight * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
    return true
  }
  return false
}

export const FULLSCREEN_VS = /* wgsl */ `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var q = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(q[i], 0.0, 1.0);
}
`

// 一个全屏三角形 + 一个 uniform buffer 的最小渲染器
export class FullscreenPass {
  constructor(device, canvas, code, floats) {
    this.device = device
    this.canvas = canvas
    this.ctx = canvas.getContext('webgpu')
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.ctx.configure({ device, format: this.format, alphaMode: 'opaque' })
    this.u = new Float32Array(floats)
    this.buf = device.createBuffer({ size: floats * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    const module = device.createShaderModule({ code: FULLSCREEN_VS + code })
    module.getCompilationInfo?.().then((info) => {
      for (const m of info.messages) if (m.type === 'error') console.error('WGSL', m.lineNum, m.message)
    })
    this.pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    })
    this.bind = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.buf } }],
    })
  }
  draw() {
    this.device.queue.writeBuffer(this.buf, 0, this.u)
    const enc = this.device.createCommandEncoder()
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bind)
    pass.draw(3)
    pass.end()
    this.device.queue.submit([enc.finish()])
  }
}

// 只在元素出现在视口里时才逐帧渲染,省 GPU
export function onVisible(el, cb) {
  const io = new IntersectionObserver((es) => { for (const e of es) cb(e.isIntersecting) }, { rootMargin: '100px' })
  io.observe(el)
}

// 声明式控件:{ key, label, type: 'range'|'check'|'select', min, max, step, options }
export function buildControls(host, params, defs, onChange) {
  const refresh = []
  for (const d of defs) {
    const lab = document.createElement('label')
    if (d.type === 'check') {
      const inp = document.createElement('input')
      inp.type = 'checkbox'
      inp.checked = !!params[d.key]
      inp.oninput = () => { params[d.key] = inp.checked ? 1 : 0; onChange(d.key) }
      lab.append(inp, document.createTextNode(d.label))
      refresh.push(() => { inp.checked = !!params[d.key] })
    } else if (d.type === 'select') {
      const sel = document.createElement('select')
      for (const [v, t] of d.options) {
        const o = document.createElement('option')
        o.value = v
        o.textContent = t
        sel.append(o)
      }
      sel.value = params[d.key]
      sel.oninput = () => { params[d.key] = Number(sel.value); onChange(d.key) }
      lab.append(document.createTextNode(d.label), sel)
      refresh.push(() => { sel.value = params[d.key] })
    } else {
      const inp = document.createElement('input')
      inp.type = 'range'
      inp.min = d.min
      inp.max = d.max
      inp.step = d.step ?? 0.01
      inp.value = params[d.key]
      const out = document.createElement('output')
      const fmt = () => { out.textContent = Number(params[d.key]).toFixed(d.digits ?? (Number(inp.step) >= 1 ? 0 : 3)) }
      fmt()
      inp.oninput = () => { params[d.key] = Number(inp.value); fmt(); onChange(d.key) }
      lab.append(document.createTextNode(d.label), inp, out)
      refresh.push(() => { inp.value = params[d.key]; fmt() })
    }
    host.append(lab)
  }
  return () => refresh.forEach((f) => f())
}

export function nav(active) {
  const items = [['index.html', '讲解'], ['play.html', '全屏玩法'], ['twist3d.html', '3D 版讲解'], ['twist3d-play.html', '3D 版玩法']]
  const el = document.createElement('nav')
  el.className = 'top'
  el.innerHTML = '<b>Apollonian Twist</b>' + items.map(([h, t]) => `<a href="./${h}" class="${h === active ? 'on' : ''}">${t}</a>`).join('') +
    '<span class="sp"></span><a href="https://github.com/WebGPU-Art/explain-apollonian-twist" target="_blank" rel="noopener">GitHub</a>'
  document.body.prepend(el)
}

// 每个 demo 右上角的小工具栏(暂停、全屏等按钮都放这里)
export function getToolbar(root) {
  const host = root.querySelector('.stack') || root.querySelector('canvas')?.parentElement || root
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  let bar = host.querySelector(':scope > .tools')
  if (!bar) {
    bar = document.createElement('div')
    bar.className = 'tools'
    host.append(bar)
  }
  return bar
}

// 给 root 加一个“全屏”按钮:把整个 demo(画面 + 控件 + 说明)一起全屏
export function addFullscreen(root) {
  const req = root.requestFullscreen || root.webkitRequestFullscreen
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'fsbtn'
  const cur = () => document.fullscreenElement || document.webkitFullscreenElement
  const isFull = () => cur() === root || root.classList.contains('fs-fake')
  const sync = () => { btn.textContent = isFull() ? '✕ 退出全屏' : '⛶ 全屏' }
  const notify = () => {
    sync()
    // 全屏切换后画布尺寸变了,通知各 demo 重画
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
  }
  // 浏览器不支持 / 拒绝 Fullscreen API(例如 iOS Safari、内嵌面板)时,退化成铺满视口的固定层
  const fake = (on) => {
    root.classList.toggle('fs-fake', on)
    document.documentElement.classList.toggle('fs-lock', document.querySelector('.fs-fake') !== null)
    notify()
  }
  btn.onclick = async () => {
    if (root.classList.contains('fs-fake')) return fake(false)
    if (cur() === root) return (document.exitFullscreen || document.webkitExitFullscreen).call(document)
    try {
      if (!req) throw new Error('unsupported')
      await req.call(root)
    } catch {
      fake(true)
    }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('fs-fake')) fake(false) })
  document.addEventListener('fullscreenchange', notify)
  document.addEventListener('webkitfullscreenchange', notify)
  sync()
  getToolbar(root).append(btn)
}

export function addFullscreenAll(selector = '.demo') {
  document.querySelectorAll(selector).forEach(addFullscreen)
}
