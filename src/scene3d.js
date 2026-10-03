// 原着色器 apollonian-twist.wgsl 的可调版本:常量换成 uniform,并加了若干调试视图。
// 结构和函数名与原文件一一对应,方便对照阅读。
export const SCENE_WGSL = /* wgsl */ `
struct U {
  res: vec2f, time: f32, mode: f32,
  cam: vec3f, focal: f32,
  right: vec3f, iters: f32,
  up: vec3f, s: f32,
  fwd: vec3f, wAmp: f32,
  flags: vec4f,   // x: 包围球  y: 卫星团簇  z: 4D 旋转  w: 外壳厚度倍率
  extra: vec4f,   // x: zoom  y: 法线迭代次数  z: 额外 4D 扭转角  w: 步长系数
};
@group(0) @binding(0) var<uniform> u: U;

const AP_MAX_DISTANCE: f32 = 14.0;
const AP_MAX_TRACE_STEPS: u32 = 160u;
const AP_GATE_MARGIN: f32 = 0.36;
const AP_SAT_GATE_RADIUS: f32 = 1.28;
const AP_SAT1_EVAL_MARGIN: f32 = 0.34;
const AP_SAT2_EVAL_MARGIN: f32 = 0.32;
const AP_SAT1_CENTER: vec3f = vec3f(1.05, 0.28, -0.22);
const AP_SAT1_SCALE: f32 = 0.34;
const AP_SAT2_CENTER: vec3f = vec3f(-0.90, -0.42, 0.30);
const AP_SAT2_SCALE: f32 = 0.29;

struct Fold { dist: f32, trap: vec4f, detail: f32 };
struct TraceResult { hit: bool, t: f32, trap: vec4f, steps: f32 };

fn rotate2(p: vec2f, a: f32) -> vec2f {
  let c = cos(a); let s = sin(a);
  return vec2f(c * p.x + s * p.y, -s * p.x + c * p.y);
}
fn psin(x: f32) -> f32 { return 0.5 + 0.5 * sin(x); }
fn tanh_approx(x: f32) -> f32 {
  let x2 = x * x;
  return clamp(x * (27.0 + x2) / (27.0 + 9.0 * x2), -1.0, 1.0);
}

fn apollian(p0: vec4f, s: f32, n: u32) -> Fold {
  var p = p0;
  var scale = 1.0;
  var trap = vec4f(1000.0);
  var detail = 0.0;
  for (var i = 0u; i < n; i = i + 1u) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    let r2 = max(dot(p, p), 1.0e-5);
    trap = min(trap, vec4f(abs(p.x), abs(p.y), abs(p.z), r2));
    let iterWeight = f32(i + 1u) / f32(n);
    detail = max(detail, iterWeight * exp(-1.25 * r2));
    let k = s / r2;
    p = p * k;
    scale = scale * k;
  }
  detail = clamp(max(detail, clamp(log2(max(scale, 1.0)) / 22.0, 0.0, 1.0)), 0.0, 1.0);
  return Fold(abs(p.y) / scale, trap, detail);
}

fn apollian_dist(p0: vec4f, s: f32, n: u32) -> f32 {
  var p = p0;
  var scale = 1.0;
  for (var i = 0u; i < n; i = i + 1u) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    let r2 = max(dot(p, p), 1.0e-5);
    let k = s / r2;
    p = p * k;
    scale = scale * k;
  }
  return abs(p.y) / scale;
}

// cluster() 前半段:旋转 + 漂移 + 抬到 4D + 4D 旋转 + 缩放
fn warp(p: vec3f, time: f32, phase: f32) -> vec4f {
  let tm = 0.22 * time;
  var q = p;
  q = vec3f(rotate2(q.xy, tm * 0.40 + 0.55 * phase), q.z);
  let qyz = rotate2(q.yz, tm * 0.24 - 0.28 * phase); q = vec3f(q.x, qyz);
  let qxz = rotate2(q.xz, tm * 0.16 + 0.22 * phase); q = vec3f(qxz.x, q.y, qxz.y);

  let r = 0.32;
  let off = vec3f(
    r * psin(tm * sqrt(3.0) + 0.9 * phase),
    r * psin(tm * sqrt(1.5) - 0.7 * phase),
    r * psin(tm * sqrt(2.0) + 0.5 * phase)
  );

  var pp = vec4f(q + off, 0.0);
  pp.w = u.wAmp * (1.0 - tanh_approx(0.82 * length(pp.xyz)));
  let a = rotate2(pp.yz, tm * 0.52 + 0.14 * phase); pp = vec4f(pp.x, a, pp.w);
  let b = rotate2(pp.xz, tm * 0.35 - 0.10 * phase); pp = vec4f(b.x, pp.y, b.y, pp.w);
  if (u.flags.z > 0.5) {
    let c = rotate2(pp.xw, -tm * 0.46 + 0.38 * phase + u.extra.z); pp = vec4f(c.x, pp.y, pp.z, c.y);
    let d = rotate2(pp.yw, tm * 0.64 - 0.22 * phase + u.extra.z); pp = vec4f(pp.x, d.x, pp.z, d.y);
  }
  return pp / u.extra.x;
}

fn cluster(p: vec3f, time: f32, phase: f32, thickness: f32, radius: f32) -> Fold {
  let fold = apollian(warp(p, time, phase), u.s, u32(u.iters));
  var d = fold.dist * u.extra.x - thickness * u.flags.w;
  if (u.flags.x > 0.5) { d = max(d, length(p) - radius); }
  return Fold(d, fold.trap, fold.detail);
}

fn cluster_dist(p: vec3f, time: f32, phase: f32, thickness: f32, radius: f32) -> f32 {
  var d = apollian_dist(warp(p, time, phase), u.s, u32(u.extra.y)) * u.extra.x - thickness * u.flags.w;
  if (u.flags.x > 0.5) { d = max(d, length(p) - radius); }
  return d;
}

fn scene_gate(p: vec3f) -> f32 { return length(p) - 3.0; }

fn map_scene(p: vec3f, time: f32) -> Fold {
  var result = cluster(p, time, 0.0, 0.0048, 1.08);
  if (u.flags.y > 0.5) {
    let l1 = (p - AP_SAT1_CENTER) / AP_SAT1_SCALE;
    if ((length(l1) - AP_SAT_GATE_RADIUS) * AP_SAT1_SCALE < AP_SAT1_EVAL_MARGIN) {
      var s1 = cluster(l1, time, 1.7, 0.0040, 0.92);
      s1.dist = s1.dist * AP_SAT1_SCALE;
      if (s1.dist < result.dist) { result = s1; }
    }
    let l2 = (p - AP_SAT2_CENTER) / AP_SAT2_SCALE;
    if ((length(l2) - AP_SAT_GATE_RADIUS) * AP_SAT2_SCALE < AP_SAT2_EVAL_MARGIN) {
      var s2 = cluster(l2, time, -2.0, 0.0038, 0.88);
      s2.dist = s2.dist * AP_SAT2_SCALE;
      if (s2.dist < result.dist) { result = s2; }
    }
  }
  return result;
}

fn map_distance(p: vec3f, time: f32) -> f32 {
  var d = cluster_dist(p, time, 0.0, 0.0048, 1.08);
  if (u.flags.y > 0.5) {
    let l1 = (p - AP_SAT1_CENTER) / AP_SAT1_SCALE;
    if ((length(l1) - AP_SAT_GATE_RADIUS) * AP_SAT1_SCALE < AP_SAT1_EVAL_MARGIN) {
      d = min(d, cluster_dist(l1, time, 1.7, 0.0040, 0.92) * AP_SAT1_SCALE);
    }
    let l2 = (p - AP_SAT2_CENTER) / AP_SAT2_SCALE;
    if ((length(l2) - AP_SAT_GATE_RADIUS) * AP_SAT2_SCALE < AP_SAT2_EVAL_MARGIN) {
      d = min(d, cluster_dist(l2, time, -2.0, 0.0038, 0.88) * AP_SAT2_SCALE);
    }
  }
  return d;
}

fn trace_scene(ro: vec3f, rd: vec3f, time: f32) -> TraceResult {
  var t = 0.0;
  var trap = vec4f(1000.0);
  var steps = 0.0;
  for (var i = 0u; i < AP_MAX_TRACE_STEPS; i = i + 1u) {
    steps = steps + 1.0;
    let samplePos = ro + rd * t;
    let gate = scene_gate(samplePos);
    if (gate > AP_GATE_MARGIN) {
      t = t + clamp(gate * 0.76, 0.015, 0.22);
      if (t > AP_MAX_DISTANCE) { break; }
      continue;
    }
    let hit = map_scene(samplePos, time);
    trap = min(trap, hit.trap);
    let precis = 0.00012 + 0.00009 * t;
    if (hit.dist < precis) { return TraceResult(true, t, trap, steps); }
    t = t + clamp(hit.dist * u.extra.w, 0.0015, 0.15);
    if (t > AP_MAX_DISTANCE) { break; }
  }
  return TraceResult(false, t, trap, steps);
}

fn calc_normal(pos: vec3f, time: f32, eps: f32) -> vec3f {
  let e = vec2f(eps, -eps);
  return normalize(
    e.xyy * map_distance(pos + e.xyy, time) +
    e.yyx * map_distance(pos + e.yyx, time) +
    e.yxy * map_distance(pos + e.yxy, time) +
    e.xxx * map_distance(pos + e.xxx, time)
  );
}

fn background(rd: vec3f) -> vec3f {
  let up = rd.y * 0.5 + 0.5;
  var sky = mix(vec3f(0.00014, 0.00018, 0.00022), vec3f(0.0016, 0.0020, 0.0026), up);
  let glow = pow(max(1.0 - abs(rd.y), 0.0), 3.4);
  sky = sky + glow * vec3f(0.0011, 0.00055, 0.0016);
  return sqrt(max(sky, vec3f(0.0)));
}

fn heat(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0);
  return vec3f(smoothstep(0.0, 0.5, x), smoothstep(0.3, 0.85, x), smoothstep(0.7, 1.0, x) + 0.45 * sin(3.14159 * min(x * 2.0, 1.0)));
}

fn render_scene(ro: vec3f, rd: vec3f, time: f32) -> vec3f {
  let trace = trace_scene(ro, rd, time);
  let mode = i32(u.mode + 0.5);
  if (mode == 5) { return heat(trace.steps / 100.0); }
  if (!trace.hit) { return background(rd); }

  let pos = ro + rd * trace.t;
  let hit = map_scene(pos, time);
  let nor = calc_normal(pos, time, max(0.0008, 0.00035 * trace.t));

  let light1 = normalize(vec3f(0.55, 0.72, -0.42));
  let light2 = normalize(vec3f(-0.48, 0.28, 0.83));
  let key = clamp(dot(nor, light1), 0.0, 1.0);
  let fill = clamp(0.2 + 0.8 * dot(nor, light2), 0.0, 1.0);
  let rim = pow(1.0 - max(dot(-rd, nor), 0.0), 2.5);
  let detail = clamp(hit.detail, 0.0, 1.0);
  let ao2 = pow(clamp(min(trace.trap.w, hit.trap.w) * 1.55, 0.0, 1.0), 0.55);

  if (mode == 1) { return nor * 0.5 + 0.5; }
  if (mode == 2) { return vec3f(ao2); }
  if (mode == 3) { return heat(detail); }
  if (mode == 4) {
    let g = exp(-13.0 * hit.trap.x) + 0.55 * exp(-22.0 * hit.trap.y);
    return vec3f(1.0, 0.8, 0.3) * g;
  }
  if (mode == 6) { return vec3f(key * 0.9 + 0.05); }

  let deepGreen = vec3f(0.004, 0.018, 0.008);
  let midGreen = vec3f(0.18, 0.38, 0.10);
  let gold = vec3f(1.10, 0.88, 0.28);
  let warmWhite = vec3f(1.00, 1.00, 0.98);

  let base = mix(deepGreen, midGreen, sqrt(detail));
  let brightCore = mix(gold, warmWhite, smoothstep(0.74, 1.0, detail));
  let highlight = mix(midGreen, brightCore, pow(detail, 1.05));

  let keyBand = 0.04 + 1.60 * pow(key, 1.28);
  let fillBand = 0.03 + 0.20 * pow(fill, 1.06);
  let whiteLift = smoothstep(0.72, 1.0, detail) * (0.42 + 0.90 * key) * ao2;
  let detailBoost = mix(1.0, 2.4, smoothstep(0.62, 1.0, detail));

  var col = base * keyBand * ao2;
  col = col + highlight * fillBand * ao2;
  col = col + highlight * rim * (0.05 + 0.20 * detail);
  col = col + brightCore * (0.12 + 0.50 * detail)
    * (exp(-13.0 * hit.trap.x) + 0.55 * exp(-22.0 * hit.trap.y));
  col = mix(col, warmWhite, 0.88 * whiteLift);
  col = col * detailBoost;
  col = col * exp(-0.055 * trace.t);

  let shadowFloor = base * (0.006 + 0.004 * ao2) + vec3f(0.0002, 0.0003, 0.0002);
  col = max((col - 0.12) * 1.72 + 0.12, shadowFloor);
  return sqrt(max(col, vec3f(0.0)));
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = vec2f(fc.x - 0.5 * u.res.x, 0.5 * u.res.y - fc.y) / u.res.y;
  let rd = normalize(uv.x * u.right + uv.y * u.up + u.focal * u.fwd);
  let color = render_scene(u.cam, rd, u.time);
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`

export const SCENE_DEFAULTS = {
  iters: 16, s: 1.24, wAmp: 0.055, bound: 1, sats: 1, rot4d: 1, thick: 1,
  zoom: 4.1, nIters: 9, twist: 0, stepK: 0.82, mode: 0, speed: 1, focal: 2.35,
  autoRotate: 1, res: 0.5,
}

export const MODE_OPTIONS = [
  [0, '最终着色'], [1, '法线'], [2, '轨道陷阱 AO'], [3, 'detail 值'], [4, '陷阱发光项'], [6, '只有主光'], [5, '步进次数热图'],
]
