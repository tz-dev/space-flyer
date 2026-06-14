const DESERT_MOUNTAINS_TERRAIN_SCALE = 0.003;
const DESERT_MOUNTAINS_HEIGHT_SCALE = 36.0;
const DESERT_MOUNTAINS_HEIGHT_OFFSET = -5.5;
const DESERT_MOUNTAINS_RENDER_DISTANCE = 2800.0;

function fract(value) {
  return value - Math.floor(value);
}

function rotate2(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: x * c + y * s, y: -x * s + y * c };
}

function desertMountainsFbm(x, y, octaves = 8, warp = 1.0) {
  let value = 0.0;
  let amplitude = 0.75;
  let n1x = 0.0;
  let n1y = 0.0;
  const terrainScale = 16.0;
  x *= terrainScale;
  y *= terrainScale;

  for (let index = 0; index < octaves; index += 1) {
    let u1 = 2.0;
    for (let j = 0; j < 3; j += 1) {
      const s3x = Math.sin(x / u1 * amplitude + u1);
      const s3y = Math.cos(y / u1 * amplitude + u1);
      n1x += s3x * amplitude * warp;
      n1y += s3x * amplitude * warp;
      const r = rotate2(s3x, s3y, 12.0);
      x += r.x;
      y += r.y;
      u1 *= 2.0;
    }

    n1x = (n1x + Math.abs(n1x - Math.sin(x))) * 0.5;
    n1y = (n1y + Math.abs(n1y - Math.cos(y))) * 0.5;
    const n2 = n1x + n1y;
    value -= Math.abs(n2) * amplitude;
    value = Math.sqrt(value * value + 0.0001);
    amplitude *= 0.37;
    const r = rotate2(x * 2.0 + n1x, y * 2.0 + n1y, 12.0);
    x = r.x;
    y = r.y;
  }

  return value / terrainScale;
}

export const desertMountainsTerrainShader = {
  id: "desert-mountains",
  label: "Desert Mountains",
  description: "Domain-warped desert mountain terrain adapted from the provided complex mountain shader. Terrain-only, sky/clouds omitted.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.0005, max: 0.02, step: 0.0001, default: DESERT_MOUNTAINS_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 120.0, step: 0.1, default: DESERT_MOUNTAINS_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: DESERT_MOUNTAINS_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 12000.0, step: 20.0, default: DESERT_MOUNTAINS_RENDER_DISTANCE },
    { key: "warp", label: "Domain Warp", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "colorContrast", label: "Color Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.05 }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? DESERT_MOUNTAINS_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? DESERT_MOUNTAINS_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? DESERT_MOUNTAINS_HEIGHT_OFFSET);
    const warp = Number(params.warp ?? 1.0);
    return heightOffset + desertMountainsFbm(x * terrainScale, z * terrainScale, 8, warp) * heightScale;
  },

  glsl: /* glsl */`
#define DESERT_MOUNTAINS_OCTAVES 8

float terrainEnabled() {
  return 1.0;
}

mat2 desertMountainsRotate2D(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

float desertMountainsFbm(vec2 uv, int octaves) {
  float value = 0.0;
  float amplitude = 0.75;
  vec2 n1 = vec2(0.0);
  mat2 r = desertMountainsRotate2D(12.0);
  float terrainScale = 16.0;
  float warp = clamp(terrainParam(4), 0.0, 2.0);
  uv *= terrainScale;

  for (int i = 0; i < DESERT_MOUNTAINS_OCTAVES; i++) {
    if (i >= octaves) {
      break;
    }

    float u1 = 2.0;
    for (int j = 0; j < 3; j++) {
      vec2 s3 = vec2(sin(uv.x / u1 * amplitude + u1), cos(uv.y / u1 * amplitude + u1));
      n1 += s3.x * amplitude * warp;
      uv += s3 * r;
      u1 *= 2.0;
    }

    n1 = (n1 + abs(n1 - vec2(sin(uv.x), cos(uv.y)))) * 0.5;
    float n2 = n1.x + n1.y;
    value -= abs(n2) * amplitude;
    value = sqrt(value * value + 0.0001);
    amplitude *= 0.37;
    uv = uv * 2.0 * r + n1;
  }

  return value / terrainScale;
}

float desertMountainsHeightRaw(vec2 xz) {
  return desertMountainsFbm(xz * clamp(terrainParam(0), 0.0005, 0.02), DESERT_MOUNTAINS_OCTAVES);
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  return clamp(terrainParam(2), -80.0, 40.0) + desertMountainsHeightRaw(xz) * clamp(terrainParam(1), 0.0, 120.0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 12000.0);
}

float desertMountainsHash21(vec2 p) {
  vec2 q = 55.1876653 * fract(p * 10.1321513);
  return fract((q.x + q.y) * q.x * q.y);
}

float desertMountainsNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(desertMountainsHash21(i), desertMountainsHash21(i + vec2(1.0, 0.0)), u.x),
    mix(desertMountainsHash21(i + vec2(0.0, 1.0)), desertMountainsHash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  time += 0.0;
  float raw = desertMountainsHeightRaw(worldPos.xz);
  float height01 = clamp(raw * 2.4, 0.0, 1.0);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float contrast = clamp(terrainParam(5), 0.2, 2.5);
  float n = desertMountainsNoise2(worldPos.xz * clamp(terrainParam(0), 0.0005, 0.02) * 180.0);

  vec3 sand = vec3(0.67, 0.57, 0.44);
  vec3 warm = vec3(0.86, 0.61, 0.32);
  vec3 rock = vec3(0.38, 0.28, 0.21);
  vec3 dust = vec3(0.88, 0.76, 0.58);

  vec3 col = mix(rock, sand, smoothstep(0.02, 0.55, height01));
  col = mix(col, warm, smoothstep(0.25, 0.85, height01 + n * 0.2));
  col = mix(col, dust, smoothstep(0.72, 1.0, normal.y + n * 0.2));
  col = mix(col, rock * 0.72, slope * 0.42);
  col = (col - 0.5) * contrast + 0.5;

  return clamp(col, 0.0, 1.0);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  worldPos += vec3(0.0);
  normal += vec3(0.0);
  time += 0.0;
  return vec3(0.0);
}
`
};
