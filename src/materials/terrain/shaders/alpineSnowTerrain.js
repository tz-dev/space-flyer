const ALPINE_TERRAIN_SCALE = 0.08;
const ALPINE_HEIGHT_SCALE = 12.5;
const ALPINE_HEIGHT_OFFSET = -1.8;
const ALPINE_RENDER_DISTANCE = 1800.0;
const ALPINE_SPACING = 2.15;

function alpineNoise2(x, y) {
  return {
    x: Math.sin(x) + 1,
    y: Math.cos(y) + 1
  };
}

function alpineFbm1(x, y, octaves, i1, value1, spacing = ALPINE_SPACING) {
  const f = Math.max(0.0001, spacing);
  let value = value1;
  const amplitude = i1 * value1;
  let freq = i1 / f;
  let noise1x = 0;
  let noise1y = 0;

  for (let index = 0; index < octaves; index += 1) {
    const noise2 = alpineNoise2(noise1y + x / freq, noise1x + y / freq);
    const nextNoise1x = noise2.x - value - noise1y * freq;
    const nextNoise1y = noise2.y - value - noise1x * freq;

    noise1x = nextNoise1x;
    noise1y = nextNoise1y;
    freq /= -f;

    const n1 = noise1x + noise1y;
    value += n1 * (amplitude - freq);

    x += noise2.y * freq;
    y += noise2.x * freq;
  }

  return value / 3.5;
}

function alpineFbm(x, y, spacing = ALPINE_SPACING) {
  let result = 0;
  let octaves = 8;

  for (let i = 1; i < 3; i += 1) {
    const i1 = i * i;
    result -= alpineFbm1(x, y, octaves, i1, result / i1, spacing);
    octaves = Math.floor(octaves / 2);
  }

  return result;
}

export const alpineSnowTerrainShader = {
  id: "alpine-snow",
  label: "Alpine Snow",
  description: "Sharp icy mountain terrain adapted from the provided shader variant.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.01, max: 0.3, step: 0.001, default: ALPINE_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 60.0, step: 0.1, default: ALPINE_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: ALPINE_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 8000.0, step: 20.0, default: ALPINE_RENDER_DISTANCE },
    { key: "spacing", label: "Mountain Spacing", min: 1.2, max: 4.0, step: 0.01, default: ALPINE_SPACING },
    { key: "snowBias", label: "Snow Bias", min: 0.0, max: 1.0, step: 0.01, default: 0.82 },
    { key: "shadowStrength", label: "Blue Shadow", min: 0.0, max: 1.5, step: 0.01, default: 0.72 },
    { key: "contrast", label: "Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.15 }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? ALPINE_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? ALPINE_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? ALPINE_HEIGHT_OFFSET);
    const spacing = Number(params.spacing ?? ALPINE_SPACING);
    const raw = alpineFbm(x * terrainScale, z * terrainScale, spacing);
    return heightOffset + raw * heightScale;
  },

  glsl: /* glsl */`
#define ALPINE_OCTAVES 8

float terrainEnabled() {
  return 1.0;
}

vec2 alpineNoise(vec2 uv) {
  return vec2(sin(uv.x), cos(uv.y)) + vec2(1.0);
}

float alpineFbm1(vec2 uv, int octaves, float i1, float value1) {
  float f = clamp(terrainParam(4), 1.2, 4.0);
  float value = value1;
  float amplitude = i1 * value1;
  float freq = i1 / f;
  float n1 = 0.0;
  vec2 noise1 = vec2(0.0);
  vec2 noise2 = vec2(0.0);

  for (int i = 0; i < ALPINE_OCTAVES; i++) {
    if (i >= octaves) {
      break;
    }

    noise2 = alpineNoise(noise1.yx + uv / freq);
    noise1 = noise2 - vec2(value) - noise1.yx * freq;
    freq /= -f;
    n1 = noise1.x + noise1.y;

    value += n1 * (amplitude - freq);
    uv += noise2.yx * freq;
  }

  return value / 3.5;
}

float alpineFbm(vec2 uv) {
  float result = 0.0;
  int octaves = ALPINE_OCTAVES;

  for (int i = 1; i < 3; i++) {
    float fi = float(i);
    float i1 = fi * fi;
    result -= alpineFbm1(uv, octaves, i1, result / i1);
    octaves /= 2;
  }

  return result;
}

float alpineHeightRaw(vec2 xz) {
  return alpineFbm(xz * clamp(terrainParam(0), 0.01, 0.3));
}

float terrainHeight(vec2 xz, float time) {
  return clamp(terrainParam(2), -80.0, 40.0) + alpineHeightRaw(xz) * clamp(terrainParam(1), 0.0, 60.0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 8000.0);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float raw = alpineHeightRaw(worldPos.xz);
  float height01 = clamp(raw * 0.30 + 0.52, 0.0, 1.0);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float snowBias = clamp(terrainParam(5), 0.0, 1.0);
  float shadowStrength = clamp(terrainParam(6), 0.0, 1.5);
  float contrast = clamp(terrainParam(7), 0.2, 2.5);

  vec3 snowBright = vec3(0.98, 0.985, 0.99);
  vec3 snowMid = vec3(0.90, 0.93, 0.97);
  vec3 shadowBlue = vec3(0.48, 0.61, 0.78);
  vec3 deepBlue = vec3(0.22, 0.34, 0.48);

  float crest = smoothstep(0.28 - snowBias * 0.12, 0.88, height01);
  float ridges = pow(clamp(slope, 0.0, 1.0), 1.35);
  float bowls = smoothstep(0.22, 0.95, height01) * (1.0 - clamp(normal.y, 0.0, 1.0));

  vec3 col = mix(snowMid, snowBright, crest);
  col = mix(col, shadowBlue, ridges * 0.55 * shadowStrength);
  col = mix(col, deepBlue, bowls * 0.28 * shadowStrength);
  col = (col - 0.5) * contrast + 0.5;

  return clamp(col, 0.0, 1.0);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  return vec3(0.0);
}
`
};
