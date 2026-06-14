const GRASS_TERRAIN_SCALE = 0.055;
const GRASS_HEIGHT_SCALE = 1.4;
const GRASS_HEIGHT_OFFSET = -0.4;
const GRASS_RENDER_DISTANCE = 1200.0;

function grassNoise(x, y) {
  let rx = x + Math.sin(y / 43.0) * 43.0;
  let ry = y + Math.sin(x / 37.0) * 37.0;
  let f = Math.sin(rx / 11.2312) + Math.sin(ry / 14.4235);
  f = f * 0.5 + Math.sin(rx / 24.0) * Math.sin(ry / 24.0);
  rx += Math.sin(y / 210.23) * 210.23;
  ry += Math.sin(x / 270.0) * 270.0;
  f = f * 0.5 + Math.sin(rx / 65.0) * Math.sin(ry / 65.0);
  f = f * 0.5 + Math.sin(rx / 165.0) * Math.sin(ry / 165.0);
  return f;
}

export const windGrassTerrainShader = {
  id: "wind-grass",
  label: "Wind Grass",
  description: "Procedural waving grass-field surface adapted from the provided blade-field shader as a terrain heightfield.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.005, max: 0.2, step: 0.001, default: GRASS_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 8.0, step: 0.01, default: GRASS_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -20.0, max: 20.0, step: 0.1, default: GRASS_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 100.0, max: 5000.0, step: 20.0, default: GRASS_RENDER_DISTANCE },
    { key: "bladeDensity", label: "Blade Density", min: 0.1, max: 4.0, step: 0.01, default: 1.0 },
    { key: "windStrength", label: "Wind Strength", min: 0.0, max: 2.0, step: 0.01, default: 0.65 },
    { key: "colorMix", label: "Color Mix", min: 0.0, max: 1.0, step: 0.01, default: 0.45 },
    { key: "brightness", label: "Brightness", min: 0.2, max: 2.0, step: 0.01, default: 1.0 }
  ],

  heightAtWorld({ x, z, timeSeconds, params }) {
    const terrainScale = Number(params.terrainScale ?? GRASS_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? GRASS_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? GRASS_HEIGHT_OFFSET);
    const windStrength = Number(params.windStrength ?? 0.65);
    const pX = x * terrainScale;
    const pZ = z * terrainScale;
    const base = grassNoise(pX * 35.0, pZ * 35.0) * 0.25;
    const wind = Math.sin(pX * 9.0 + timeSeconds * 2.4) * Math.sin(pZ * 7.0 + timeSeconds * 1.7) * 0.16 * windStrength;
    return heightOffset + (base + wind) * heightScale;
  },

  glsl: /* glsl */`
float terrainEnabled() {
  return 1.0;
}

float grassFreq(float k) {
  return k / 0.4;
}

float grassNoiseFunc(vec2 xy) {
  float x = xy.x;
  float y = xy.y;
  float rx = x + sin(y / 43.0) * 43.0;
  float ry = y + sin(x / 37.0) * 37.0;
  float f = sin(rx / 11.2312) + sin(ry / 14.4235);

  f = f * 0.5 + sin(rx / 24.0) * sin(ry / 24.0);
  rx += sin(y / 210.23) * 210.23;
  ry += sin(x / 270.0) * 270.0;
  f = f * 0.5 + sin(rx / 65.0) * sin(ry / 65.0);
  f = f * 0.5 + sin(rx / 165.0) * sin(ry / 165.0);

  return f;
}

float grassWindPower(float x) {
  float w = sin(x / grassFreq(5.0)) + sin(x / grassFreq(13.0));
  w *= 1.2;
  float bigW = sin(x / grassFreq(35.0)) + sin(x / grassFreq(33.0));
  bigW = bigW * 0.25 + 0.5;
  bigW *= bigW;
  w += bigW * 3.0;
  float hf = sin(x / grassFreq(0.65)) * 0.2;
  float lowF = max(sin(x / grassFreq(17.0)), 0.0);
  return lowF * (hf - lowF * 0.6) + w;
}

float grassHeightRaw(vec2 xz, float time) {
  vec2 p = xz * clamp(terrainParam(0), 0.005, 0.2);
  float base = grassNoiseFunc(p * 35.0) * 0.25;
  float wind = sin(p.x * 9.0 + time * 2.4) * sin(p.y * 7.0 + time * 1.7) * 0.16 * clamp(terrainParam(5), 0.0, 2.0);
  return base + wind;
}

float terrainHeight(vec2 xz, float time) {
  return clamp(terrainParam(2), -20.0, 20.0) + grassHeightRaw(xz, time) * clamp(terrainParam(1), 0.0, 8.0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 100.0, 5000.0);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  vec2 p = worldPos.xz * clamp(terrainParam(0), 0.005, 0.2);
  float density = clamp(terrainParam(4), 0.1, 4.0);
  float colorMix = clamp(terrainParam(6), 0.0, 1.0);
  float brightness = clamp(terrainParam(7), 0.2, 2.0);

  vec2 cell = floor(p * 18.0 * density);
  float bladeHash = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
  float blade = smoothstep(0.34, 1.0, bladeHash);
  float line = abs(fract(p.x * 22.0 * density + sin(p.y * 4.0 + time * 1.6) * 0.18) - 0.5);
  blade *= 1.0 - smoothstep(0.02, 0.23, line);

  float n = grassNoiseFunc(p * 80.0 + vec2(time * 3.0, 0.0));
  float shade = 0.65 + 0.35 * clamp(normal.y, 0.0, 1.0);

  vec3 orangeGrass = vec3(1.0, 0.45, 0.0);
  vec3 dryGrass = vec3(0.70, 0.60, 0.50);
  vec3 darkGround = vec3(0.08, 0.07, 0.045);
  vec3 grassCol = mix(orangeGrass, dryGrass, clamp(n * 0.5 + 0.5, 0.0, 1.0));
  grassCol = mix(grassCol, vec3(0.22, 0.35, 0.10), colorMix * 0.65);

  vec3 col = mix(darkGround, grassCol, clamp(0.45 + blade * 0.85, 0.0, 1.0));
  col *= shade * brightness;

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
