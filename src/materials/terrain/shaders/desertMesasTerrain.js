const DESERT_MESAS_TERRAIN_SCALE = 0.105;
const DESERT_MESAS_HEIGHT_SCALE = 28.0;
const DESERT_MESAS_HEIGHT_OFFSET = -5.0;
const DESERT_MESAS_RENDER_DISTANCE = 2200.0;

function fract(value) {
  return value - Math.floor(value);
}

function mesaNoise(x, y) {
  return {
    x: Math.sin(x) + 1.0,
    y: Math.cos(y) + 1.0
  };
}

function mesaFbm1(x, y, octaves, i1, value1) {
  let value = value1;
  let amplitude = 0.65 / i1;
  let freq = 2.1 / i1;
  let n1 = 0.0;
  let noise2x = 0.0;
  let noise2y = 0.0;

  for (let index = 0; index < octaves; index += 1) {
    const noise2 = mesaNoise(noise2y + x * freq, noise2x + y * freq);
    noise2x = noise2.x;
    noise2y = noise2.y;
    const noise1x = noise2x - value;
    const noise1y = noise2y - value;
    freq *= 2.1;
    n1 = noise1x + noise1y;
    value = value + Math.abs(n1) * amplitude - n1 / freq;
    amplitude *= amplitude;
    x -= n1 / freq;
    y -= n1 / freq;
  }

  return value;
}

function mesaFbm(x, y, octaves = 8) {
  let result = 0.0;
  let oct = octaves;

  for (let i = 1; i < 3; i += 1) {
    const i1 = i * i;
    result -= mesaFbm1(x / i1, y / i1, oct, i1, result / i1);
    oct -= 2;
  }

  return result / 6.0;
}

export const desertMesasTerrainShader = {
  id: "desert-mesas",
  label: "Desert Mesas",
  description: "Fast sine/cosine FBM mesa terrain adapted from the provided desert mesas shader. Terrain-only, no sky/clouds.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.01, max: 0.35, step: 0.001, default: DESERT_MESAS_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 90.0, step: 0.1, default: DESERT_MESAS_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: DESERT_MESAS_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 9000.0, step: 20.0, default: DESERT_MESAS_RENDER_DISTANCE },
    { key: "mesaContrast", label: "Mesa Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.1 },
    { key: "sandTint", label: "Sand Tint", min: 0.0, max: 1.0, step: 0.01, default: 0.55 }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? DESERT_MESAS_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? DESERT_MESAS_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? DESERT_MESAS_HEIGHT_OFFSET);
    const raw = mesaFbm(x * terrainScale, z * terrainScale, 8);
    return heightOffset + raw * heightScale;
  },

  glsl: /* glsl */`
#define DESERT_MESAS_OCTAVES 8

float terrainEnabled() {
  return 1.0;
}

vec2 desertMesasNoise(vec2 uv) {
  return vec2(sin(uv.x), cos(uv.y)) + vec2(1.0);
}

float desertMesasFbm1(vec2 uv, int octaves, float i1, float value1) {
  float value = value1;
  float amplitude = 0.65 / i1;
  float freq = 2.1 / i1;
  float n1 = 0.0;
  vec2 noise2 = vec2(0.0);

  for (int i = 0; i < DESERT_MESAS_OCTAVES; i++) {
    if (i >= octaves) {
      break;
    }

    noise2 = desertMesasNoise(noise2.yx + uv * freq);
    vec2 noise1 = noise2 - value;
    freq *= 2.1;
    n1 = noise1.x + noise1.y;
    value = value + abs(n1) * amplitude - n1 / freq;
    amplitude *= amplitude;
    uv -= vec2(n1) / freq;
  }

  return value;
}

float desertMesasFbm(vec2 uv) {
  float result = 0.0;
  int octaves = DESERT_MESAS_OCTAVES;

  for (int i = 1; i < 3; i++) {
    float fi = float(i);
    float i1 = fi * fi;
    result -= desertMesasFbm1(uv / i1, octaves, i1, result / i1);
    octaves -= 2;
  }

  return result / 6.0;
}

float desertMesasHeightRaw(vec2 xz) {
  return desertMesasFbm(xz * clamp(terrainParam(0), 0.01, 0.35));
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  return clamp(terrainParam(2), -80.0, 40.0) + desertMesasHeightRaw(xz) * clamp(terrainParam(1), 0.0, 90.0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 9000.0);
}

float desertMesasHash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float desertMesasValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(desertMesasHash21(i), desertMesasHash21(i + vec2(1.0, 0.0)), u.x),
    mix(desertMesasHash21(i + vec2(0.0, 1.0)), desertMesasHash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  time += 0.0;
  float raw = desertMesasHeightRaw(worldPos.xz);
  float height01 = clamp(raw * 0.55 + 0.42, 0.0, 1.0);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float contrast = clamp(terrainParam(4), 0.2, 2.5);
  float tint = clamp(terrainParam(5), 0.0, 1.0);
  float grain = desertMesasValueNoise(worldPos.xz * clamp(terrainParam(0), 0.01, 0.35) * 9.0 + 13.7);

  vec3 redClay = vec3(0.55, 0.22, 0.10);
  vec3 sand = vec3(0.82, 0.61, 0.34);
  vec3 pale = vec3(0.94, 0.78, 0.48);
  vec3 shadow = vec3(0.25, 0.12, 0.08);

  vec3 col = mix(redClay, sand, smoothstep(0.05, 0.62, height01));
  col = mix(col, pale, smoothstep(0.62, 1.0, height01 + normal.y * 0.08));
  col = mix(col, shadow, slope * 0.45);
  col *= 0.86 + grain * 0.28;
  col = mix(col, col * vec3(1.22, 1.06, 0.84), tint);
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
