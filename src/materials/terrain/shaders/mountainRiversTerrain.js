const MOUNTAIN_RIVERS_TERRAIN_SCALE = 0.05;
const MOUNTAIN_RIVERS_HEIGHT_SCALE = 24.0;
const MOUNTAIN_RIVERS_HEIGHT_OFFSET = -4.0;
const MOUNTAIN_RIVERS_RENDER_DISTANCE = 2400.0;

function mountainRiversNoise(x, y) {
  return Math.sin(x * 1.25) + Math.cos(y / 1.25);
}

function mountainRiversFbm(x, y) {
  let value = 0.0;
  let amplitude = 1.5;
  let freq = 0.8;
  x /= amplitude;
  y /= amplitude;

  for (let index = 0; index < 6; index += 1) {
    value = Math.max(value, value + (0.45 - Math.abs(mountainRiversNoise(x * freq, y * freq) - 0.45) * amplitude));
    amplitude *= -0.27;
    freq *= 3.5 - value / 8.0;
    x += y / freq;
    y += x / freq;
  }

  return value - 2.6;
}

function mountainRiversWarpCoords(x, z, terrainScale, warpAmount) {
  if (warpAmount <= 0.001) {
    return { x, z };
  }

  const pX = x * terrainScale * 0.12;
  const pZ = z * terrainScale * 0.12;
  const warpX = Math.sin(pX * 1.19 + Math.cos(pZ * 1.53));
  const warpZ = Math.cos(pZ * 1.31 + Math.sin(pX * 1.77));

  return {
    x: x + warpX * warpAmount * 20.0,
    z: z + warpZ * warpAmount * 20.0
  };
}

export const mountainRiversTerrainShader = {
  id: "mountain-rivers",
  label: "Mountain Rivers",
  description: "Mountain terrain with lowland water channels adapted from the provided river shader. Terrain-only, no sky.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.020, max: 0.050, step: 0.001, default: MOUNTAIN_RIVERS_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 25.0, step: 0.1, default: MOUNTAIN_RIVERS_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 15.0, step: 0.1, default: MOUNTAIN_RIVERS_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 15000.0, step: 20.0, default: MOUNTAIN_RIVERS_RENDER_DISTANCE },
    { key: "waterLevel", label: "Water Level", min: -30.0, max: 30.0, step: 0.1, default: -0.5 },
    { key: "waterAmount", label: "Water Amount", min: 0.0, max: 1.0, step: 0.01, default: 0.85 },
    { key: "snowLevel", label: "Snow Level", min: 0.25, max: 1.0, step: 0.01, default: 0.72 },
    { key: "colorContrast", label: "Color Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.0 },
    { key: "warp", label: "Warp XZ", min: 0.0, max: 3.5, step: 0.05, default: 0.0, description: "Large-scale sideways deformation of the terrain shader." }
  ],

  heightAtWorld({ x, z, timeSeconds, params }) {
    const terrainScale = Number(params.terrainScale ?? MOUNTAIN_RIVERS_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? MOUNTAIN_RIVERS_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? MOUNTAIN_RIVERS_HEIGHT_OFFSET);
    const waterLevel = Number(params.waterLevel ?? -0.5);
    const waterAmount = Number(params.waterAmount ?? 0.85);
    const warp = Number(params.warp ?? 0.0);
    const warped = mountainRiversWarpCoords(x, z, terrainScale, warp);
    const land = heightOffset + mountainRiversFbm(warped.x * terrainScale / 3.0, warped.z * terrainScale / 3.0) * 3.0 * heightScale;
    const t = timeSeconds;
    const ripple = 0.04 * (Math.sin(z * terrainScale * 51.59 + t * 2.0) + Math.sin(x * terrainScale * 16.59 + t));
    const water = waterLevel + ripple;
    return land < water ? land * (1 - waterAmount) + water * waterAmount : land;
  },

  glsl: /* glsl */`
float terrainEnabled() {
  return 1.0;
}

float mountainRiversNoise(vec2 uv) {
  return sin(uv.x * 1.25) + cos(uv.y / 1.25);
}

float mountainRiversFbm(vec2 uv) {
  float value = 0.0;
  float amplitude = 1.5;
  float freq = 0.8;
  uv /= amplitude;

  for (int i = 0; i < 6; i++) {
    value = max(value, value + (0.45 - abs(mountainRiversNoise(uv * freq) - 0.45) * amplitude));
    amplitude *= -0.27;
    freq *= 3.5 - value / 8.0;
    uv += uv.yx / freq;
  }

  return value - 2.6;
}

vec2 mountainRiversWarpXZ(vec2 xz) {
  float warp = clamp(terrainParam(8), 0.0, 3.5);

  if (warp <= 0.001) {
    return xz;
  }

  float terrainScale = clamp(terrainParam(0), 0.020, 0.050);
  vec2 p = xz * terrainScale * 0.12;
  vec2 w = vec2(
    sin(p.x * 1.19 + cos(p.y * 1.53)),
    cos(p.y * 1.31 + sin(p.x * 1.77))
  );

  return xz + w * warp * 20.0;
}

float mountainRiversLandRaw(vec2 xz) {
  float factor = 3.0;
  return mountainRiversFbm(mountainRiversWarpXZ(xz) * clamp(terrainParam(0), 0.020, 0.050) / factor) * factor;
}

float mountainRiversWaterRaw(vec2 xz, float time) {
  vec2 p = xz * clamp(terrainParam(0), 0.020, 0.050) * 7.0;
  float w = 0.04 * (sin(p.y * 7.37 + time * 2.0) + sin(p.x * 2.37 + time));
  return clamp(terrainParam(4), -30.0, 30.0) + w;
}

float terrainHeight(vec2 xz, float time) {
  float land = clamp(terrainParam(2), -80.0, 15.0) + mountainRiversLandRaw(xz) * clamp(terrainParam(1), 0.0, 25.0);
  float water = mountainRiversWaterRaw(xz, time);
  float waterAmount = clamp(terrainParam(5), 0.0, 1.0);
  return mix(land, max(land, water), waterAmount);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 15000.0);
}

float mountainRiversHash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float mountainRiversValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(mountainRiversHash21(i), mountainRiversHash21(i + vec2(1.0, 0.0)), u.x),
    mix(mountainRiversHash21(i + vec2(0.0, 1.0)), mountainRiversHash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float heightScale = max(0.001, terrainParam(1));
  float waterLevel = clamp(terrainParam(4), -30.0, 30.0);
  float waterAmount = clamp(terrainParam(5), 0.0, 1.0);
  float snowLevel = clamp(terrainParam(6), 0.25, 1.0);
  float contrast = clamp(terrainParam(7), 0.2, 2.5);
  float height01 = clamp((worldPos.y - clamp(terrainParam(2), -80.0, 15.0)) / max(1.0, heightScale * 3.0), 0.0, 1.0);
  float wet = (1.0 - smoothstep(waterLevel - 0.35, waterLevel + 0.65, worldPos.y)) * waterAmount;
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float n = mountainRiversValueNoise(worldPos.xz * clamp(terrainParam(0), 0.020, 0.050) * 3.5 + 9.1);

  vec3 grass = vec3(0.18, 0.34, 0.14);
  vec3 rock = vec3(0.40, 0.35, 0.29);
  vec3 snow = vec3(0.90, 0.90, 0.86);
  vec3 water = vec3(0.08, 0.36, 0.56);

  vec3 landCol = mix(grass, rock, smoothstep(0.15, 0.70, height01 + slope * 0.5 + n * 0.12));
  landCol = mix(landCol, snow, smoothstep(snowLevel, 1.2, height01 + normal.y * 0.12));
  landCol = mix(landCol, landCol * 0.58, slope * 0.28);

  vec3 waterCol = mix(vec3(0.05, 0.18, 0.29), water, clamp(normal.y * 0.55 + n * 0.25 + 0.25, 0.0, 1.0));
  vec3 col = mix(landCol, waterCol, wet);
  col = (col - 0.5) * contrast + 0.5;

  time += 0.0;
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
