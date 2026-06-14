const TURBULENT_SEA_HEIGHT_SCALE = 0.75;
const TURBULENT_SEA_SPEED = 1.0;
const TURBULENT_SEA_RENDER_DISTANCE = 3200.0;

function hash13(x, y, z) {
  const fx = x - Math.floor(x);
  const fy = y - Math.floor(y);
  const fz = z - Math.floor(z);
  const px = fx * 0.1031;
  const py = fy * 0.1031;
  const pz = fz * 0.1031;
  const d = px * (pz + 31.32) + py * (py + 31.32) + pz * (px + 31.32);
  return ((px + d) + (py + d)) * (pz + d) % 1;
}

function noise2D(x, y) {
  return (Math.sin(x) + Math.cos(y)) * 0.5;
}

function oceanFundamental(x, z, time, iter = 6) {
  let px = x;
  let pz = z;
  let a = noise2D(px * 0.01, pz * 0.01) * 8.0 + 3.0;
  let h = 0.0;
  px -= time * 5.0;
  px *= 0.025;
  pz *= 0.025;
  const step = 1.0 / Math.max(1, iter);

  for (let index = 0; index <= iter; index += 1) {
    const i = index * step;
    const t = (2.0 - i) * time * 0.5;
    const r = noise2D(px * 2.1, pz * 2.1) * i;
    const y1x = Math.cos(px - t) + 1.0;
    const y1z = Math.cos(pz - t) + 1.0;
    const y2x = 1.0 - Math.abs(Math.sin(px - t));
    const y2z = 1.0 - Math.abs(Math.sin(pz - t));
    const mx = y1x + (y2x - y1x) * r;
    const mz = y1z + (y2z - y1z) * r;
    h += (mx + mz) * a;
    a *= 0.59;
    const nx = px * 1.4 + pz * -1.4;
    const nz = px * 1.4 + pz * 1.4;
    px = nx + 19.9 + r * 0.5 + time * 0.5;
    pz = nz + 19.9 + r * 0.5 + time * 0.5;
  }

  return h * 0.08;
}

export const turbulentSeaTerrainShader = {
  id: "turbulent-sea",
  label: "Turbulent Sea",
  description: "Rough animated ocean surface adapted from Dave Hoskins' Rough Seas. Terrain-only version.",
  params: [
    { key: "waveHeight", label: "Wave Height", min: 0.05, max: 20.0, step: 0.01, default: TURBULENT_SEA_HEIGHT_SCALE },
    { key: "waveSpeed", label: "Wave Speed", min: 0.0, max: 3.0, step: 0.01, default: TURBULENT_SEA_SPEED },
    { key: "renderDistance", label: "Render Distance", min: 300.0, max: 15000.0, step: 20.0, default: TURBULENT_SEA_RENDER_DISTANCE },
    { key: "foamAmount", label: "Foam Amount", min: 0.0, max: 2.0, step: 0.01, default: 0.85 },
    { key: "quality", label: "Quality", min: 3.0, max: 8.0, step: 1.0, default: 5.0 },
    { key: "hue", label: "Hue", min: -3.14, max: 3.14, step: 0.01, default: 0.0 },
    { key: "saturation", label: "Saturation", min: 0.0, max: 2.0, step: 0.01, default: 1.0 }
  ],

  heightAtWorld({ x, z, timeSeconds, params }) {
    const waveHeight = Number(params.waveHeight ?? TURBULENT_SEA_HEIGHT_SCALE);
    const waveSpeed = Number(params.waveSpeed ?? TURBULENT_SEA_SPEED);
    const quality = Number(params.quality ?? 5.0);
    return oceanFundamental(x, z, timeSeconds * waveSpeed + 10.0, quality) * waveHeight;
  },

  glsl: /* glsl */`
float terrainEnabled() {
  return 1.0;
}

float turbulentSeaHash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 turbulentSeaHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float turbulentSeaNoise2D(vec2 p) {
  return (sin(p.x) + cos(p.y)) * 0.5;
}

float turbulentSeaNoise3D(vec3 p) {
  const vec2 add = vec2(1.0, 0.0);
  vec3 f = fract(p);
  f *= f * (3.0 - 2.0 * f);
  p = floor(p);

  float h = mix(
    mix(mix(turbulentSeaHash13(p), turbulentSeaHash13(p + add.xyy), f.x), mix(turbulentSeaHash13(p + add.yxy), turbulentSeaHash13(p + add.xxy), f.x), f.y),
    mix(mix(turbulentSeaHash13(p + add.yyx), turbulentSeaHash13(p + add.xyx), f.x), mix(turbulentSeaHash13(p + add.yxx), turbulentSeaHash13(p + add.xxx), f.x), f.y),
    f.z
  );
  return h * h * h * 2.0;
}

vec3 turbulentSeaHueRotate(vec3 col, float hueShift) {
  float s = sin(hueShift);
  float c = cos(hueShift);

  mat3 m = mat3(
    vec3(0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787),
    vec3(0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715),
    vec3(0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072)
  );

  return clamp(m * col, 0.0, 1.0);
}

vec3 turbulentSeaColorize(vec3 col, float hue, float saturation) {
  vec3 shifted = turbulentSeaHueRotate(col, hue);
  float luma = dot(shifted, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(luma), shifted, saturation), 0.0, 1.0);
}

float turbulentSeaOceanFundamental(vec2 p, float tim, int iter) {
  float a = turbulentSeaNoise2D(p * 0.01) * 8.0 + 3.0;
  float h = 0.0;
  float spr = 0.0;
  p.x -= tim * 5.0;
  p *= 0.025;
  mat2 rot2D = mat2(1.4, 1.4, -1.4, 1.4);

  for (int j = 0; j < 8; j++) {
    if (j > iter) {
      break;
    }

    float i = float(j) / max(float(iter), 1.0);
    float t = (2.0 - i) * tim * 0.5;
    float r = turbulentSeaNoise2D(p * 2.1) * i;
    vec2 y1 = cos(p - t) + 1.0;
    vec2 y2 = 1.0 - abs(sin(p - t));
    y1 = mix(y1, y2, r);
    float s = y1.x + y1.y;
    h += s * a;
    a *= 0.59;
    p = p * rot2D;
    p += 19.9 + r * 0.5 + tim * 0.5;
  }

  spr += 0.0;
  return h * 0.08;
}

float turbulentSeaHeightRaw(vec2 xz, float time) {
  int iter = int(clamp(floor(terrainParam(4) + 0.5), 3.0, 8.0));
  return turbulentSeaOceanFundamental(xz, time * clamp(terrainParam(1), 0.0, 3.0) + 10.0, iter) * clamp(terrainParam(0), 0.05, 20.0);
}

float terrainHeight(vec2 xz, float time) {
  return turbulentSeaHeightRaw(xz, time);
}

float terrainRenderDistance() {
  return clamp(terrainParam(2), 300.0, 15000.0);
}

float turbulentSeaWaterPattern(vec2 p) {
  p *= 0.02;
  vec2 n = floor(p);
  vec2 f = fract(p);
  float wp = 1e10;

  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = turbulentSeaHash22(n + g);
      vec2 r = g + o - f;
      float d = dot(r, r);
      wp = min(wp, d);
    }
  }

  return pow(wp, 3.5);
}

vec3 turbulentSeaDetailedNormal(vec3 worldPos, float time) {
  float eps = mix(0.06, 0.26, smoothstep(0.0, 800.0, distance(worldPos, uCamPos)));
  float h = turbulentSeaHeightRaw(worldPos.xz, time);
  float hx = turbulentSeaHeightRaw(worldPos.xz + vec2(eps, 0.0), time);
  float hz = turbulentSeaHeightRaw(worldPos.xz + vec2(0.0, eps), time);
  return normalize(vec3(hx - h, eps, hz - h));
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  vec3 seaNormal = normalize(mix(normal, turbulentSeaDetailedNormal(worldPos, time), 0.72));
  vec3 eye = normalize(worldPos - uCamPos);
  vec3 ref = reflect(eye, seaNormal);
  float fres = clamp(pow(1.0 + dot(seaNormal, eye), 5.0), 0.0, 1.0);
  float h = smoothstep(0.0, 1.0, seaNormal.y);
  float foamAmount = clamp(terrainParam(3), 0.0, 2.0);

  vec3 mat = vec3(0.08, 0.16, 0.32);
  mat += h * 0.10;
  mat = mix(mat, vec3(0.38, 0.76, 0.66), clamp(h * 0.6, 0.0, 1.0));

  float foam = turbulentSeaWaterPattern(worldPos.xz * vec2(0.5, 1.0) + 99.0) * 15.0;
  foam += turbulentSeaWaterPattern(worldPos.xz * 3.63) * 10.0;
  foam += turbulentSeaWaterPattern(worldPos.xz * 12.0) * 3.0;
  foam = clamp(foam, 0.0, 1.0) * foamAmount;

  mat += foam * foam * vec3(1.0, 1.0, 0.92);
  vec3 skyCol = mix(vec3(0.40, 0.40, 0.50), vec3(0.20, 0.21, 0.26), abs(ref.y) * 1.7);
  vec3 col = mix(mat, skyCol, fres * 0.75);

  float hue = clamp(terrainParam(5), -3.14, 3.14);
  float saturation = clamp(terrainParam(6), 0.0, 2.0);
  col = turbulentSeaColorize(col, hue, saturation);

  time += 0.0;
  return clamp(col, 0.0, 1.0);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  vec3 seaNormal = normalize(mix(normal, turbulentSeaDetailedNormal(worldPos, time), 0.72));
  vec3 sunDir = normalize(vec3(4.0, 8.0, 18.0));
  vec3 eye = normalize(worldPos - uCamPos);
  vec3 ref = reflect(eye, seaNormal);
  float glint = pow(max(dot(ref, sunDir), 0.0), 64.0);
  return vec3(0.7, 0.8, 0.75) * glint * 0.9;
}
`
};
