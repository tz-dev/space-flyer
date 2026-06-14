const SEA_ITER_GEOMETRY = 3;
const SEA_ITER_FRAGMENT = 5;
const SEA_HEIGHT = 0.6;
const SEA_CHOPPY = 4.0;
const SEA_SPEED = 0.8;
const SEA_FREQ = 0.16;
const SEA_RENDER_DISTANCE = 1000.0;

function hash2(x, y) {
  const h = x * 127.1 + y * 311.7;
  return (Math.sin(h) * 43758.5453123) % 1;
}

function fract(value) {
  return value - Math.floor(value);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fract(x);
  const fy = fract(y);
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);

  const a = -1.0 + 2.0 * fract(Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123);
  const b = -1.0 + 2.0 * fract(Math.sin((ix + 1.0) * 127.1 + iy * 311.7) * 43758.5453123);
  const c = -1.0 + 2.0 * fract(Math.sin(ix * 127.1 + (iy + 1.0) * 311.7) * 43758.5453123);
  const d = -1.0 + 2.0 * fract(Math.sin((ix + 1.0) * 127.1 + (iy + 1.0) * 311.7) * 43758.5453123);

  return mix(mix(a, b, ux), mix(c, d, ux), uy);
}

function seaOctave(x, y, choppy) {
  const n = noise2(x, y);
  x += n;
  y += n;

  let wx = 1.0 - Math.abs(Math.sin(x));
  let wy = 1.0 - Math.abs(Math.sin(y));
  const sx = Math.abs(Math.cos(x));
  const sy = Math.abs(Math.cos(y));

  wx = mix(wx, sx, wx);
  wy = mix(wy, sy, wy);

  return Math.pow(1.0 - Math.pow(wx * wy, 0.65), choppy);
}

function seaHeightAt(x, z, timeSeconds, params, iterations) {
  let freq = Number(params.frequency ?? SEA_FREQ);
  let amp = Number(params.waveHeight ?? SEA_HEIGHT);
  let choppy = Number(params.choppy ?? SEA_CHOPPY);
  const time = 1.0 + timeSeconds * Number(params.speed ?? SEA_SPEED);

  let uvx = x;
  let uvz = z;
  uvx *= 0.75;

  let h = 0.0;

  for (let index = 0; index < iterations; index += 1) {
    let d = seaOctave((uvx + time) * freq, (uvz + time) * freq, choppy);
    d += seaOctave((uvx - time) * freq, (uvz - time) * freq, choppy);
    h += d * amp;

    const nextX = uvx * 1.6 + uvz * -1.2;
    const nextZ = uvx * 1.2 + uvz * 1.6;
    uvx = nextX;
    uvz = nextZ;
    freq *= 1.9;
    amp *= 0.22;
    choppy = mix(choppy, 1.0, 0.2);
  }

  return h;
}

export const seascapeTerrainShader = {
  id: "seascape",
  label: "Seascape",
  description: "Animated ocean surface adapted closely from TDM's Seascape. Terrain-only version with the original defaults preserved.",
  params: [
    { key: "waveHeight", label: "Wave Height", min: 0.05, max: 3.0, step: 0.01, default: SEA_HEIGHT },
    { key: "choppy", label: "Choppiness", min: 0.5, max: 8.0, step: 0.01, default: SEA_CHOPPY },
    { key: "speed", label: "Wave Speed", min: 0.0, max: 3.0, step: 0.01, default: SEA_SPEED },
    { key: "frequency", label: "Wave Frequency", min: 0.02, max: 0.6, step: 0.001, default: SEA_FREQ },
    { key: "reflection", label: "Reflection", min: 0.0, max: 1.5, step: 0.01, default: 1.0 },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 8000.0, step: 20.0, default: SEA_RENDER_DISTANCE }
  ],

  heightAtWorld({ x, z, timeSeconds, params }) {
    return seaHeightAt(x, z, timeSeconds, params, SEA_ITER_GEOMETRY);
  },

  glsl: /* glsl */`
#define SEASCAPE_NUM_GEOMETRY 3
#define SEASCAPE_NUM_FRAGMENT 5
#define SEASCAPE_PI 3.141592

float terrainEnabled() {
  return 1.0;
}

float seascapeHash(vec2 p) {
  float h = dot(p, vec2(127.1, 311.7));
  return fract(sin(h) * 43758.5453123);
}

float seascapeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return -1.0 + 2.0 * mix(
    mix(seascapeHash(i + vec2(0.0, 0.0)), seascapeHash(i + vec2(1.0, 0.0)), u.x),
    mix(seascapeHash(i + vec2(0.0, 1.0)), seascapeHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float seascapeDiffuse(vec3 n, vec3 l, float p) {
  return pow(dot(n, l) * 0.4 + 0.6, p);
}

float seascapeSpecular(vec3 n, vec3 l, vec3 e, float s) {
  float nrm = (s + 8.0) / (SEASCAPE_PI * 8.0);
  return pow(max(dot(reflect(e, n), l), 0.0), s) * nrm;
}

vec3 seascapeSkyColor(vec3 e) {
  e.y = (max(e.y, 0.0) * 0.8 + 0.2) * 0.8;
  return vec3(pow(1.0 - e.y, 2.0), 1.0 - e.y, 0.6 + (1.0 - e.y) * 0.4) * 1.1;
}

mat2 seascapeOctaveMatrix() {
  return mat2(1.6, 1.2, -1.2, 1.6);
}

float seascapeOctave(vec2 uv, float choppy) {
  uv += seascapeNoise(uv);
  vec2 wv = 1.0 - abs(sin(uv));
  vec2 swv = abs(cos(uv));
  wv = mix(wv, swv, wv);
  return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);
}

float seascapeHeightRaw(vec2 xz, float time, int iterations) {
  float freq = clamp(terrainParam(3), 0.02, 0.6);
  float amp = clamp(terrainParam(0), 0.05, 3.0);
  float choppy = clamp(terrainParam(1), 0.5, 8.0);
  vec2 uv = xz;
  uv.x *= 0.75;

  float seaTime = 1.0 + time * clamp(terrainParam(2), 0.0, 3.0);
  float d = 0.0;
  float h = 0.0;
  mat2 octaveM = seascapeOctaveMatrix();

  for (int i = 0; i < SEASCAPE_NUM_FRAGMENT; i++) {
    if (i >= iterations) {
      break;
    }

    d = seascapeOctave((uv + seaTime) * freq, choppy);
    d += seascapeOctave((uv - seaTime) * freq, choppy);
    h += d * amp;

    uv *= octaveM;
    freq *= 1.9;
    amp *= 0.22;
    choppy = mix(choppy, 1.0, 0.2);
  }

  return h;
}

float terrainHeight(vec2 xz, float time) {
  return seascapeHeightRaw(xz, time, SEASCAPE_NUM_GEOMETRY);
}

float terrainRenderDistance() {
  return clamp(terrainParam(5), 200.0, 8000.0);
}

vec3 seascapeDetailedNormal(vec3 worldPos, float time) {
  float eps = mix(0.06, 0.22, smoothstep(0.0, 500.0, distance(worldPos, uCamPos)));
  float h = seascapeHeightRaw(worldPos.xz, time, SEASCAPE_NUM_FRAGMENT);
  float hx = seascapeHeightRaw(worldPos.xz + vec2(eps, 0.0), time, SEASCAPE_NUM_FRAGMENT);
  float hz = seascapeHeightRaw(worldPos.xz + vec2(0.0, eps), time, SEASCAPE_NUM_FRAGMENT);

  vec3 n;
  n.x = hx - h;
  n.y = eps;
  n.z = hz - h;
  return normalize(n);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  vec3 seaBase = vec3(0.0, 0.09, 0.18);
  vec3 waterColor = vec3(0.8, 0.9, 0.6) * 0.6;
  vec3 light = normalize(vec3(0.0, 1.0, 0.8));
  vec3 eye = normalize(worldPos - uCamPos);
  vec3 seaNormal = normalize(mix(normal, seascapeDetailedNormal(worldPos, time), 0.8));
  vec3 dist = worldPos - uCamPos;

  float fresnel = clamp(1.0 - dot(seaNormal, -eye), 0.0, 1.0);
  fresnel = min(fresnel * fresnel * fresnel, 0.5) * clamp(terrainParam(4), 0.0, 1.5);

  vec3 reflected = seascapeSkyColor(reflect(eye, seaNormal));
  vec3 refracted = seaBase + seascapeDiffuse(seaNormal, light, 80.0) * waterColor * 0.12;
  vec3 color = mix(refracted, reflected, fresnel);

  float atten = max(1.0 - dot(dist, dist) * 0.001, 0.0);
  color += waterColor * (worldPos.y - clamp(terrainParam(0), 0.05, 3.0)) * 0.18 * atten;

  return clamp(color, 0.0, 1.0);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  vec3 light = normalize(vec3(0.0, 1.0, 0.8));
  vec3 eye = normalize(worldPos - uCamPos);
  vec3 seaNormal = normalize(mix(normal, seascapeDetailedNormal(worldPos, time), 0.8));
  vec3 dist = worldPos - uCamPos;

  float sparkle = seascapeSpecular(
    seaNormal,
    light,
    eye,
    600.0 * inversesqrt(max(dot(dist, dist), 0.0001))
  );

  vec3 waterColor = vec3(0.8, 0.9, 0.6) * 0.6;
  return waterColor * sparkle * 1.4;
}
`
};
