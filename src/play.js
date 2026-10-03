import { mountShader } from './view.js'
import { MODES, DEFAULTS } from './shader.js'

const R = (key, label, min, max, step, digits) => ({ key, label, type: 'range', min, max, step, digits })
const K = (key, label) => ({ key, label, type: 'check' })

mountShader(document.querySelector('#play'), {
  dprScale: 0.75,
  controls: [
    { key: 'mode', label: '视图', type: 'select', options: MODES },
    K('play', '播放'), R('speed', '速度', 0, 4, 0.05, 2), R('time', '时间', 0, 400, 0.1, 1),
    R('iters', '迭代次数', 1, 12, 1), R('s', 's(反演强度)', 0.8, 2, 0.005),
    R('z', 'z', 1, 12, 0.05, 2), R('zoom', 'zoom', 0.15, 3, 0.01, 2),
    R('wAmp', 'w 鼓包幅度', 0, 0.5, 0.001), R('tanhK', '鼓包衰减', 0.2, 4, 0.01, 2),
    R('offR', '漂移幅度 r', 0, 1.5, 0.01, 2), K('rot4d', '4D 旋转'), K('spin', '屏幕自转'),
    R('floorB', '地板深度 b', -1.2, -0.01, 0.005, 3), R('lightH', '灯高', 0.3, 3, 0.01, 2), R('camT', '相机高度', 1.5, 20, 0.1, 1),
    R('ss', 'ss', 1, 60, 0.5, 1), K('bugFix', '修正 sp2'),
    R('lightGain', '地板光强度', 0, 3, 0.01, 2), R('glowGain', '辉光强度', 0, 3, 0.01, 2),
  ],
}).then((api) => {
  if (!api) return
  document.querySelector('#reset').onclick = () => { Object.assign(api.params, DEFAULTS); api.refresh(); api.redraw() }
})
