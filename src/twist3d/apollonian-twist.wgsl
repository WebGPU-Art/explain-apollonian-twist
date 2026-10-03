#import soluble::perspective

struct BaseCell {
  position: vec4<f32>,
  velocity: vec4<f32>,
  arm: vec4<f32>,
  p1: f32, p2: f32, p3: f32, p4: f32,
  p5: f32,
  p6: f32,
  p7: f32,
  p8: f32,
};

@group(1) @binding(0) var<storage, read> base_points: array<BaseCell>;

const AP_SCENE_SCALE: f32 = 0.012;
const AP_MAX_DISTANCE: f32 = 14.0;
const AP_MAX_TRACE_STEPS: u32 = 160u;
const AP_APOLLIAN_ITERS: u32 = 16u;
const AP_GATE_MARGIN: f32 = 0.36;

const AP_MAIN_RADIUS: f32 = 1.34;
const AP_SAT_GATE_RADIUS: f32 = 1.28;
const AP_SAT1_EVAL_MARGIN: f32 = 0.34;
const AP_SAT2_EVAL_MARGIN: f32 = 0.32;
const AP_SAT1_CENTER: vec3<f32> = vec3<f32>(1.05, 0.28, -0.22);
const AP_SAT1_SCALE: f32 = 0.34;
const AP_SAT2_CENTER: vec3<f32> = vec3<f32>(-0.90, -0.42, 0.30);
const AP_SAT2_SCALE: f32 = 0.29;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(1) uv: vec2<f32>,
};

struct FoldResult {
  dist: f32,
  trap: vec4<f32>,
  detail: f32,
};

struct MapData {
  dist: f32,
  trap: vec4<f32>,
  detail: f32,
};

struct TraceResult {
  hit: bool,
  t: f32,
  trap: vec4<f32>,
};

@vertex
fn vertex_main(@location(0) position: vec2<f32>) -> VertexOut {
  var output: VertexOut;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = position;
  return output;
}

fn rotate2(p: vec2<f32>, a: f32) -> vec2<f32> {
  let c = cos(a);
  let s = sin(a);
  return vec2<f32>(c * p.x + s * p.y, -s * p.x + c * p.y);
}

fn psin(x: f32) -> f32 {
  return 0.5 + 0.5 * sin(x);
}

fn tanh_approx(x: f32) -> f32 {
  let x2 = x * x;
  return clamp(x * (27.0 + x2) / (27.0 + 9.0 * x2), -1.0, 1.0);
}

fn apollian(p0: vec4<f32>, s: f32) -> FoldResult {
  var p = p0;
  var scale = 1.0;
  var trap = vec4<f32>(1000.0);
  var detail = 0.0;

  for (var i = 0u; i < AP_APOLLIAN_ITERS; i = i + 1u) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    let r2 = max(dot(p, p), 1.0e-5);
    trap = min(trap, vec4<f32>(abs(p.x), abs(p.y), abs(p.z), r2));
    let iterWeight = f32(i + 1u) / f32(AP_APOLLIAN_ITERS);
    detail = max(detail, iterWeight * exp(-1.25 * r2));
    let k = s / r2;
    p = p * k;
    scale = scale * k;
  }

  detail = clamp(max(detail, clamp(log2(max(scale, 1.0)) / 22.0, 0.0, 1.0)), 0.0, 1.0);

  return FoldResult(abs(p.y) / scale, trap, detail);
}

// Lightweight distance-only fold for normal estimation (9 iters, no trap/detail)
fn apollian_dist(p0: vec4<f32>, s: f32) -> f32 {
  var p = p0;
  var scale = 1.0;
  for (var i = 0u; i < 9u; i = i + 1u) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    let r2 = max(dot(p, p), 1.0e-5);
    let k = s / r2;
    p = p * k;
    scale = scale * k;
  }
  return abs(p.y) / scale;
}

fn cluster(p: vec3<f32>, time: f32, phase: f32, thickness: f32, radius: f32) -> MapData {
  let tm = 0.22 * time;
  var q = p;
  q.xy = rotate2(q.xy, tm * 0.40 + 0.55 * phase);
  q.yz = rotate2(q.yz, tm * 0.24 - 0.28 * phase);
  q.xz = rotate2(q.xz, tm * 0.16 + 0.22 * phase);

  let r = 0.32;
  let off = vec3<f32>(
    r * psin(tm * sqrt(3.0) + 0.9 * phase),
    r * psin(tm * sqrt(1.5) - 0.7 * phase),
    r * psin(tm * sqrt(2.0) + 0.5 * phase)
  );

  var pp = vec4<f32>(q + off, 0.0);
  pp.w = 0.055 * (1.0 - tanh_approx(0.82 * length(pp.xyz)));
  pp.yz = rotate2(pp.yz, tm * 0.52 + 0.14 * phase);
  pp.xz = rotate2(pp.xz, tm * 0.35 - 0.10 * phase);
  pp.xw = rotate2(pp.xw, -tm * 0.46 + 0.38 * phase);
  pp.yw = rotate2(pp.yw, tm * 0.64 - 0.22 * phase);

  let zoom = 4.10;
  pp = pp / zoom;

  let fold = apollian(pp, 1.24);
  let fractal = fold.dist * zoom - thickness;
  // Intersect with sphere to bound the fractal — matching Metal version.
  // Without this, abs(p.y)/scale creates an infinite persistent flat disc.
  return MapData(max(fractal, length(p) - radius), fold.trap, fold.detail);
}

fn cluster_dist(p: vec3<f32>, time: f32, phase: f32, thickness: f32, radius: f32) -> f32 {
  let tm = 0.22 * time;
  var q = p;
  q.xy = rotate2(q.xy, tm * 0.40 + 0.55 * phase);
  q.yz = rotate2(q.yz, tm * 0.24 - 0.28 * phase);
  q.xz = rotate2(q.xz, tm * 0.16 + 0.22 * phase);
  let r = 0.32;
  let off = vec3<f32>(
    r * psin(tm * sqrt(3.0) + 0.9 * phase),
    r * psin(tm * sqrt(1.5) - 0.7 * phase),
    r * psin(tm * sqrt(2.0) + 0.5 * phase)
  );
  var pp = vec4<f32>(q + off, 0.0);
  pp.w = 0.055 * (1.0 - tanh_approx(0.82 * length(pp.xyz)));
  pp.yz = rotate2(pp.yz, tm * 0.52 + 0.14 * phase);
  pp.xz = rotate2(pp.xz, tm * 0.35 - 0.10 * phase);
  pp.xw = rotate2(pp.xw, -tm * 0.46 + 0.38 * phase);
  pp.yw = rotate2(pp.yw, tm * 0.64 - 0.22 * phase);
  let zoom = 4.10;
  pp = pp / zoom;
  return max(apollian_dist(pp, 1.24) * zoom - thickness, length(p) - radius);
}

fn scene_gate(p: vec3<f32>) -> f32 {
  // Use a large encompassing sphere so fractal tendrils are never clipped.
  // Tight per-cluster spheres caused spike artifacts at grazing angles.
  return length(p) - 3.0;
}

fn map_scene(p: vec3<f32>, time: f32) -> MapData {
  var result = cluster(p, time, 0.0, 0.0048, 1.08);

  let sat1Local = (p - AP_SAT1_CENTER) / AP_SAT1_SCALE;
  let sat1Gate = (length(sat1Local) - AP_SAT_GATE_RADIUS) * AP_SAT1_SCALE;
  if (sat1Gate < AP_SAT1_EVAL_MARGIN) {
    var sat1 = cluster(sat1Local, time, 1.7, 0.0040, 0.92);
    sat1.dist = sat1.dist * AP_SAT1_SCALE;
    if (sat1.dist < result.dist) {
      result = sat1;
    }
  }

  let sat2Local = (p - AP_SAT2_CENTER) / AP_SAT2_SCALE;
  let sat2Gate = (length(sat2Local) - AP_SAT_GATE_RADIUS) * AP_SAT2_SCALE;
  if (sat2Gate < AP_SAT2_EVAL_MARGIN) {
    var sat2 = cluster(sat2Local, time, -2.0, 0.0038, 0.88);
    sat2.dist = sat2.dist * AP_SAT2_SCALE;
    if (sat2.dist < result.dist) {
      result = sat2;
    }
  }

  return result;
}

fn map_distance(p: vec3<f32>, time: f32) -> f32 {
  // Fast path: use low-iter apollian for gradient estimation only
  var d = cluster_dist(p, time, 0.0, 0.0048, 1.08);
  let sat1Local = (p - AP_SAT1_CENTER) / AP_SAT1_SCALE;
  let sat1Gate = (length(sat1Local) - AP_SAT_GATE_RADIUS) * AP_SAT1_SCALE;
  if (sat1Gate < AP_SAT1_EVAL_MARGIN) {
    d = min(d, cluster_dist(sat1Local, time, 1.7, 0.0040, 0.92) * AP_SAT1_SCALE);
  }
  let sat2Local = (p - AP_SAT2_CENTER) / AP_SAT2_SCALE;
  let sat2Gate = (length(sat2Local) - AP_SAT_GATE_RADIUS) * AP_SAT2_SCALE;
  if (sat2Gate < AP_SAT2_EVAL_MARGIN) {
    d = min(d, cluster_dist(sat2Local, time, -2.0, 0.0038, 0.88) * AP_SAT2_SCALE);
  }
  return d;
}

fn trace_scene(ro: vec3<f32>, rd: vec3<f32>, time: f32) -> TraceResult {
  var t = 0.0;
  var trap = vec4<f32>(1000.0);

  for (var i = 0u; i < AP_MAX_TRACE_STEPS; i = i + 1u) {
    let samplePos = ro + rd * t;
    let gate = scene_gate(samplePos);
    if (gate > AP_GATE_MARGIN) {
      t = t + clamp(gate * 0.76, 0.015, 0.22);
      if (t > AP_MAX_DISTANCE) {
        break;
      }
      continue;
    }

    let hit = map_scene(samplePos, time);
    trap = min(trap, hit.trap);
    let precis = 0.00012 + 0.00009 * t;
    if (hit.dist < precis) {
      return TraceResult(true, t, trap);
    }

    t = t + clamp(hit.dist * 0.82, 0.0015, 0.15);
    if (t > AP_MAX_DISTANCE) {
      break;
    }
  }

  return TraceResult(false, t, trap);
}

fn calc_normal(pos: vec3<f32>, time: f32, eps: f32) -> vec3<f32> {
  let e = vec2<f32>(eps, -eps);
  return normalize(
    e.xyy * map_distance(pos + e.xyy, time) +
    e.yyx * map_distance(pos + e.yyx, time) +
    e.yxy * map_distance(pos + e.yxy, time) +
    e.xxx * map_distance(pos + e.xxx, time)
  );
}

fn background(rd: vec3<f32>) -> vec3<f32> {
  let up = rd.y * 0.5 + 0.5;
  var sky = mix(vec3<f32>(0.00014, 0.00018, 0.00022), vec3<f32>(0.0016, 0.0020, 0.0026), up);
  let glow = pow(max(1.0 - abs(rd.y), 0.0), 3.4);
  sky = sky + glow * vec3<f32>(0.0011, 0.00055, 0.0016);
  return sqrt(max(sky, vec3<f32>(0.0)));
}

fn render_scene(ro: vec3<f32>, rd: vec3<f32>, time: f32) -> vec3<f32> {
  let trace = trace_scene(ro, rd, time);
  if (!trace.hit) {
    return background(rd);
  }

  let pos = ro + rd * trace.t;
  let hit = map_scene(pos, time);
  let nor = calc_normal(pos, time, max(0.0008, 0.00035 * trace.t));

  let light1 = normalize(vec3<f32>(0.55, 0.72, -0.42));
  let light2 = normalize(vec3<f32>(-0.48, 0.28, 0.83));
  let key = clamp(dot(nor, light1), 0.0, 1.0);
  let fill = clamp(0.2 + 0.8 * dot(nor, light2), 0.0, 1.0);
  let rim = pow(1.0 - max(dot(-rd, nor), 0.0), 2.5);

  let ao = pow(clamp(min(trace.trap.w, hit.trap.w) * 1.55, 0.0, 1.0), 0.72);
  let detail = clamp(hit.detail, 0.0, 1.0);

  let deepGreen = vec3<f32>(0.004, 0.018, 0.008);
  let midGreen = vec3<f32>(0.18, 0.38, 0.10);
  let gold = vec3<f32>(1.10, 0.88, 0.28);
  let warmWhite = vec3<f32>(1.00, 1.00, 0.98);

  // Sharper ao contrast: lower exponent = stronger darkening in crevices
  let ao2 = pow(clamp(min(trace.trap.w, hit.trap.w) * 1.55, 0.0, 1.0), 0.55);

  let base = mix(deepGreen, midGreen, sqrt(detail));
  let brightCore = mix(gold, warmWhite, smoothstep(0.74, 1.0, detail));
  let highlight = mix(midGreen, brightCore, pow(detail, 1.05));

  // Wider key spread: deeper shadows, brighter lit areas
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

  let shadowFloor = base * (0.006 + 0.004 * ao2) + vec3<f32>(0.0002, 0.0003, 0.0002);
  // Stronger contrast curve
  col = max((col - 0.12) * 1.72 + 0.12, shadowFloor);
  return sqrt(max(col, vec3<f32>(0.0)));
}

@fragment
fn fragment_main(vx_out: VertexOut) -> @location(0) vec4<f32> {
  let coord = vx_out.uv * uniforms.screen_wh;
  let p = coord * 0.00055 / max(uniforms.scale, 0.0001);
  let dummySeed = f32(arrayLength(&base_points));
  let time = uniforms.time * 0.0005 + dummySeed * 0.0;

  let ro = uniforms.viewer_position * AP_SCENE_SCALE;
  let rd = normalize(p.x * uniforms.rightward + p.y * uniforms.upward + 2.35 * uniforms.forward);
  let color = render_scene(ro, rd, time);

  return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}