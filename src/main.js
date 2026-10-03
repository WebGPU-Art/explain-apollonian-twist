import { mountViewer } from './viewer3d.js'
import { mountSlice } from './slice2d.js'
import { mountFold, mountInversion, mountMarch } from './demos2d.js'
import { MODE_OPTIONS } from './scene3d.js'
import source from './apollonian-twist.wgsl?raw'

const $ = (s) => document.querySelector(s)
const C = {
  speed: { key: 'speed', label: '动画速度', type: 'range', min: 0, max: 4, step: 0.05, digits: 2 },
  autoRotate: { key: 'autoRotate', label: '相机自转', type: 'check' },
  res: { key: 'res', label: '分辨率', type: 'range', min: 0.25, max: 1, step: 0.05, digits: 2 },
  iters: { key: 'iters', label: '迭代次数', type: 'range', min: 0, max: 16, step: 1 },
  s: { key: 's', label: 's', type: 'range', min: 0.8, max: 2.0, step: 0.005 },
  zoom: { key: 'zoom', label: 'zoom', type: 'range', min: 1, max: 10, step: 0.05, digits: 2 },
  wAmp: { key: 'wAmp', label: '鼓包幅度', type: 'range', min: 0, max: 0.3, step: 0.001 },
  rot4d: { key: 'rot4d', label: '4D 旋转 (xw, yw)', type: 'check' },
  twist: { key: 'twist', label: '额外 4D 扭转角', type: 'range', min: -3.14, max: 3.14, step: 0.01, digits: 2 },
  bound: { key: 'bound', label: '包围球', type: 'check' },
  sats: { key: 'sats', label: '卫星团簇', type: 'check' },
  thick: { key: 'thick', label: '壳厚度倍率', type: 'range', min: 0, max: 6, step: 0.05, digits: 2 },
  mode: { key: 'mode', label: '视图', type: 'select', options: MODE_OPTIONS },
  nIters: { key: 'nIters', label: '法线迭代', type: 'range', min: 1, max: 16, step: 1 },
  stepK: { key: 'stepK', label: '步长系数', type: 'range', min: 0.3, max: 1.5, step: 0.01, digits: 2 },
}

$('#source').textContent = source

mountViewer($('#hero'), { controls: [C.speed, C.autoRotate, C.res] })
mountFold($('#fold-demo'))
mountInversion($('#inv-demo'))
mountSlice($('#iter-demo'), {
  params: { iters: 3, wAmp: 0, thick: 0 },
  controls: [
    { key: 'iters', label: '迭代次数', type: 'range', min: 0, max: 16, step: 1 },
    { key: 's', label: 's', type: 'range', min: 0.8, max: 2.0, step: 0.005 },
    { key: 'zoom', label: 'zoom', type: 'range', min: 1, max: 10, step: 0.05, digits: 2 },
    { key: 'sliceZ', label: 'z 截面', type: 'range', min: -1, max: 1, step: 0.005 },
    { key: 'thick', label: '壳厚度', type: 'range', min: 0, max: 0.05, step: 0.0005, digits: 4 },
    { key: 'bound', label: '包围球', type: 'check' },
    { key: 'mode', label: '配色', type: 'select', options: [[0, '距离场'], [1, '原着色器配色']] },
  ],
})
mountSlice($('#twist-slice'), {
  params: { mode: 1, thick: 0.004 },
  controls: [
    { key: 'wAmp', label: '鼓包幅度', type: 'range', min: 0, max: 0.4, step: 0.001 },
    { key: 'sliceW', label: 'w 平移', type: 'range', min: -0.5, max: 0.5, step: 0.002 },
    { key: 'rotXW', label: 'xw 旋转', type: 'range', min: -3.14, max: 3.14, step: 0.01, digits: 2 },
    { key: 'rotYW', label: 'yw 旋转', type: 'range', min: -3.14, max: 3.14, step: 0.01, digits: 2 },
    { key: 'sliceZ', label: 'z 截面', type: 'range', min: -1, max: 1, step: 0.005 },
    { key: 'mode', label: '配色', type: 'select', options: [[0, '距离场'], [1, '原着色器配色']] },
  ],
})
mountViewer($('#twist-3d'), {
  params: { speed: 0, autoRotate: 0, sats: 0, res: 0.5 },
  camera: { dist: 3.6 },
  controls: [C.twist, C.wAmp, C.rot4d, C.speed, C.res],
})
mountViewer($('#cluster-3d'), {
  params: { autoRotate: 1, res: 0.5 },
  camera: { dist: 6.5, pitch: 0.45 },
  controls: [C.bound, C.sats, C.thick, C.iters, C.zoom, C.s, C.speed, C.res],
})
mountMarch($('#march-demo'))
mountViewer($('#shade-3d'), {
  params: { autoRotate: 0, speed: 0.5, res: 0.5 },
  camera: { dist: 3.2, yaw: 1.1, pitch: 0.15 },
  controls: [C.mode, C.nIters, C.stepK, C.speed, C.res],
})
