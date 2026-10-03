import { mountViewer } from './viewer3d.js'
import { MODE_OPTIONS, SCENE_DEFAULTS } from './scene3d.js'

mountViewer(document.querySelector('#play'), {
  params: { res: 0.5 },
  controls: [
    { key: 'mode', label: '视图', type: 'select', options: MODE_OPTIONS },
    { key: 'speed', label: '动画速度', type: 'range', min: 0, max: 4, step: 0.05, digits: 2 },
    { key: 'autoRotate', label: '相机自转', type: 'check' },
    { key: 'iters', label: '迭代次数', type: 'range', min: 0, max: 16, step: 1 },
    { key: 's', label: 's(反演强度)', type: 'range', min: 0.8, max: 2.0, step: 0.005 },
    { key: 'zoom', label: 'zoom', type: 'range', min: 1, max: 10, step: 0.05, digits: 2 },
    { key: 'wAmp', label: '4D 鼓包幅度', type: 'range', min: 0, max: 0.3, step: 0.001 },
    { key: 'rot4d', label: '4D 旋转', type: 'check' },
    { key: 'twist', label: '额外 4D 扭转角', type: 'range', min: -3.14, max: 3.14, step: 0.01, digits: 2 },
    { key: 'thick', label: '壳厚度倍率', type: 'range', min: 0, max: 6, step: 0.05, digits: 2 },
    { key: 'bound', label: '包围球', type: 'check' },
    { key: 'sats', label: '卫星团簇', type: 'check' },
    { key: 'nIters', label: '法线迭代', type: 'range', min: 1, max: 16, step: 1 },
    { key: 'stepK', label: '步长系数', type: 'range', min: 0.3, max: 1.5, step: 0.01, digits: 2 },
    { key: 'focal', label: '焦距', type: 'range', min: 0.8, max: 5, step: 0.05, digits: 2 },
    { key: 'res', label: '分辨率', type: 'range', min: 0.25, max: 1, step: 0.05, digits: 2 },
  ],
}).then((v) => {
  if (!v) return
  document.querySelector('#reset').onclick = () => {
    Object.assign(v.params, SCENE_DEFAULTS, { res: 0.5 })
    v.refresh()
    v.redraw()
  }
})
