// Shadertoy "Apollian with a twist" (Wl3fzM) 的 WGSL 移植。
// 结构和函数名与原 GLSL 一一对应;原来的常量换成 uniform,方便在页面里拖动。
export const SHADER_WGSL = /* wgsl */ `
struct U {
  a: vec4f,  // res.xy, time, mode
  b: vec4f,  // iters, s, z, zoom
  c: vec4f,  // wAmp, offR, camT, floorB
  d: vec4f,  // lightH, ss, rotate4d, post
  e: vec4f,  // center.xy, scale, spin
  f: vec4f,  // tanhK, bugFix, lightGain, glowGain
  g: vec4f,  // off.xyz 手动偏移(当 manual>0.5 时替代 PSIN 漂移), manual
};
@group(0) @binding(0) var<uniform> u: U;

fn rot(p: vec2f, a: f32) -> vec2f {
  let c = cos(a); let s = sin(a);
  return vec2f(c * p.x + s * p.y, -s * p.x + c * p.y);   // = p * mat2(c,s,-s,c)
}
fn psin(x: f32) -> f32 { return 0.5 + 0.5 * sin(x); }
fn L2(x: vec3f) -> f32 { return dot(x, x); }

fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

fn apollian(p0: vec4f, s: f32) -> f32 {
  var p = p0;
  var scale = 1.0;
  let n = i32(u.b.x);
  for (var i = 0; i < n; i = i + 1) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    let r2 = max(dot(p, p), 1.0e-9);
    let k = s / r2;
    p = p * k;
    scale = scale * k;
  }
  return abs(p.y) / scale;
}

fn weird(p0: vec2f) -> f32 {
  let z = u.b.z;
  let time = u.a.z;
  var p = rot(p0, time * 0.1 * u.e.w);
  let tm = 0.2 * time;
  let r = u.c.y;
  var off = vec4f(r * psin(tm * sqrt(3.0)), r * psin(tm * sqrt(1.5)), r * psin(tm * sqrt(2.0)), 0.0);
  if (u.g.w > 0.5) { off = vec4f(u.g.xyz, 0.0); }
  var pp = vec4f(p.x, p.y, 0.0, 0.0) + off;
  pp.w = u.c.x * (1.0 - tanh(u.f.x * length(pp.xyz)));
  let a = u.d.z;
  let yz = rot(pp.yz, tm * a);            pp = vec4f(pp.x, yz, pp.w);
  let xz = rot(pp.xz, tm * sqrt(0.5) * a); pp = vec4f(xz.x, pp.y, xz.y, pp.w);
  pp = pp / z;
  return apollian(pp, u.b.y) * z;
}

fn df(p0: vec2f) -> f32 {
  let zoom = u.b.w;
  return weird(p0 / zoom) * zoom;
}

struct Lit { floor_: vec3f, curve: vec3f, d: f32, sd1: f32, sd2: f32 };

fn color_parts(p: vec2f, aa: f32) -> Lit {
  let lh = u.d.x;
  let lp1 = vec3f(0.5, lh, 0.5);
  let lp2 = vec3f(-0.5, lh, 0.5);
  let d = df(p);
  let b = u.c.w;
  let t = u.c.z;
  let ro = vec3f(0.0, t, 0.0);
  let pp = vec3f(p.x, 0.0, p.y);
  let rd = normalize(pp - ro);
  let bt = -(t - b) / rd.y;
  let bp = ro + bt * rd;
  let srd1 = normalize(lp1 - bp);
  let srd2 = normalize(lp2 - bp);
  let bl21 = L2(lp1 - bp);
  let bl22 = L2(lp2 - bp);
  let st1 = (0.0 - b) / srd1.y;
  let st2 = (0.0 - b) / srd2.y;
  let sp1 = bp + srd1 * st1;
  // 原作这里用的是 st1(而不是 st2),看起来是个笔误;bugFix=1 时改成 st2
  let sp2 = bp + srd2 * select(st1, st2, u.f.y > 0.5);
  let sd1 = df(sp1.xz);
  let sd2 = df(sp2.xz);
  let ss = u.d.y;

  var col = vec3f(0.0);
  col = col + vec3f(1.0) * (1.0 - exp(-ss * max(sd1, 0.0))) / bl21;
  col = col + vec3f(0.5) * (1.0 - exp(-ss * max(sd2, 0.0))) / bl22;
  col = col * u.f.z;
  let l = length(p);
  let hue = fract(0.75 * l - 0.3 * u.a.z) + 0.3 + 0.15;
  let sat = 0.75 * tanh(2.0 * l);
  let bcol = hsv2rgb(vec3f(hue, sat, 1.0));
  col = col * (1.0 - tanh(0.75 * l)) * 0.5;

  var curve = mix(vec3f(0.0), bcol, smoothstep(-aa, aa, -d));
  curve = curve + 0.5 * sqrt(bcol.zxy) * exp(-(10.0 + 100.0 * tanh(l)) * max(d, 0.0)) * u.f.w;
  var out: Lit;
  out.floor_ = col;
  out.curve = curve;
  out.d = d; out.sd1 = sd1; out.sd2 = sd2;
  return out;
}

fn post(c0: vec3f, q: vec2f) -> vec3f {
  var col = pow(clamp(c0, vec3f(0.0), vec3f(1.0)), vec3f(1.0 / 2.2));
  col = col * 0.6 + 0.4 * col * col * (3.0 - 2.0 * col);
  col = mix(col, vec3f(dot(col, vec3f(0.33))), -0.4);
  col = col * (0.5 + 0.5 * pow(max(19.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.0), 0.7));
  return col;
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let q = fc.xy / u.a.xy;
  var p = -1.0 + 2.0 * vec2f(q.x, 1.0 - q.y);
  p.x = p.x * u.a.x / u.a.y;
  p = u.e.xy + p * u.e.z;
  let aa = 2.0 * u.e.z / u.a.y;
  let mode = i32(u.a.w + 0.5);
  let P = color_parts(p, aa);
  var col: vec3f;
  if (mode == 2) {
    // 距离场等值线:d 永远 >= 0,只有零集(曲线)才是“表面”
    let d = P.d;
    col = vec3f(0.95, 0.62, 0.3) * (1.0 - exp(-7.0 * d)) * (0.78 + 0.22 * cos(6.28318 * d / 0.06));
    col = mix(vec3f(1.0), col, smoothstep(0.0, 1.5 * aa, d));
    return vec4f(col, 1.0);
  }
  if (mode == 3) { col = P.floor_; }
  else if (mode == 4) { col = P.curve; }
  else {
    // 原作:floor 色先乘衰减,再用曲线的 smoothstep 覆盖,最后叠加辉光
    let l = length(p);
    let hue = fract(0.75 * l - 0.3 * u.a.z) + 0.3 + 0.15;
    let bcol = hsv2rgb(vec3f(hue, 0.75 * tanh(2.0 * l), 1.0));
    col = mix(P.floor_, bcol, smoothstep(-aa, aa, -P.d));
    col = col + 0.5 * sqrt(bcol.zxy) * exp(-(10.0 + 100.0 * tanh(l)) * max(P.d, 0.0)) * u.f.w;
  }
  if (mode == 0 || mode == 3 || mode == 4) { col = post(col, q); }
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`

export const DEFAULTS = {
  iters: 7, s: 1.2, z: 4, zoom: 0.5,
  wAmp: 0.125, offR: 0.5, camT: 10, floorB: -0.125, lightH: 1.25,
  ss: 15, rot4d: 1, spin: 1, tanhK: 1, bugFix: 0, lightGain: 1, glowGain: 1,
  manual: 0, ox: 0.25, oy: 0.25, oz: 0.25,
  mode: 0, time: 0, play: 1, speed: 1,
  cx: 0, cy: 0, scale: 1,
}

export const MODES = [
  [0, '最终画面(含后处理)'],
  [1, '最终画面(不含后处理)'],
  [2, '距离场 d 的等值线'],
  [3, '只看地板上的光'],
  [4, '只看曲线与辉光'],
]

export function packUniforms(u, p, w, h) {
  u.set([w, h, p.time, p.mode], 0)
  u.set([p.iters, p.s, p.z, p.zoom], 4)
  u.set([p.wAmp, p.offR, p.camT, p.floorB], 8)
  u.set([p.lightH, p.ss, p.rot4d, 1], 12)
  u.set([p.cx, p.cy, p.scale, p.spin], 16)
  u.set([p.tanhK, p.bugFix, p.lightGain, p.glowGain], 20)
  u.set([p.ox, p.oy, p.oz, p.manual], 24)
}
