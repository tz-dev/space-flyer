const DUNE_STRIPES_TERRAIN_SCALE = 0.075;
const DUNE_STRIPES_HEIGHT_SCALE = 18.0;
const DUNE_STRIPES_HEIGHT_OFFSET = -3.0;
const DUNE_STRIPES_RENDER_DISTANCE = 2000.0;

function fract(value) {
  return value - Math.floor(value);
}

function hash2(x, y) {
  return fract(Math.sin(x * 113.0 + y) * 43758.5453);
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3.0 - 2.0 * fx);
  fy = fy * fy * (3.0 - 2.0 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

function duneStripesHeightRaw(x, z) {
  x /= 2.5;
  z /= 2.5;
  let layer1 = noise2(x * 0.2, z * 0.2) * 2.0 - 0.5;
  layer1 = Math.max(0.0, Math.min(1.0, layer1 / 1.05));
  layer1 = layer1 * layer1 * (3.0 - 2.0 * layer1);
  let layer2 = noise2(x * 0.275, z * 0.275);
  layer2 = 1.0 - Math.abs(layer2 - 0.5) * 2.0;
  layer2 = Math.max(0.0, Math.min(1.0, (layer2 * layer2 - 0.2) / 0.8));
  layer2 = layer2 * layer2 * (3.0 - 2.0 * layer2);
  const layer3 = noise2(x * 1.5, z * 1.5);
  return layer1 * 0.7 + layer2 * 0.25 + layer3 * 0.05;
}

export const duneStripesTerrainShader = {
  id: "dune-stripes",
  label: "Dune Stripes",
  description: "Soft sand dunes with procedural stripe ripples adapted from the DesertSand/DuneStripes shader.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.01, max: 0.25, step: 0.001, default: DUNE_STRIPES_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 60.0, step: 0.1, default: DUNE_STRIPES_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: DUNE_STRIPES_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 8000.0, step: 20.0, default: DUNE_STRIPES_RENDER_DISTANCE },
    { key: "stripeStrength", label: "Stripe Strength", min: 0.0, max: 2.0, step: 0.01, default: 0.8 },
    { key: "colorContrast", label: "Color Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.0 }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? DUNE_STRIPES_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? DUNE_STRIPES_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? DUNE_STRIPES_HEIGHT_OFFSET);
    return heightOffset + (0.5 - duneStripesHeightRaw(x * terrainScale, z * terrainScale)) * heightScale;
  },

  glsl: /* glsl */`
float terrainEnabled() {
  return 1.0;
}

float duneStripesHash(float n) {
  return fract(cos(n) * 45758.5453);
}

float duneStripesHash21(vec2 p) {
  return fract(sin(dot(p, vec2(21.71, 157.97))) * 45758.5453);
}

float duneStripesNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f *= f * (3.0 - 2.0 * f);

  return mix(
    mix(duneStripesHash21(i), duneStripesHash21(i + vec2(1.0, 0.0)), f.x),
    mix(duneStripesHash21(i + vec2(0.0, 1.0)), duneStripesHash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

mat2 duneStripesRot(float th) {
  vec2 a = sin(vec2(1.5707963, 0.0) + th);
  return mat2(a.x, -a.y, a.y, a.x);
}

float duneStripesGrad(float x, float offs) {
  x = abs(fract(x / 6.283 + offs - 0.25) - 0.5) * 2.0;
  float x2 = clamp(x * x * (-1.0 + 2.0 * x), 0.0, 1.0);
  x = smoothstep(0.0, 1.0, x);
  return mix(x, x2, 0.15);
}

float duneStripesSurf(vec3 p) {
  p /= 2.5;
  float layer1 = duneStripesNoise2(p.xz * 0.2) * 2.0 - 0.5;
  layer1 = smoothstep(0.0, 1.05, layer1);

  float layer2 = duneStripesNoise2(p.xz * 0.275);
  layer2 = 1.0 - abs(layer2 - 0.5) * 2.0;
  layer2 = smoothstep(0.2, 1.0, layer2 * layer2);

  float layer3 = duneStripesNoise2(p.xz * 1.5);
  return layer1 * 0.7 + layer2 * 0.25 + layer3 * 0.05;
}

float duneStripesRaw(vec2 xz) {
  vec3 p = vec3(xz * clamp(terrainParam(0), 0.01, 0.25), 0.0).xzy;
  return duneStripesSurf(p);
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  return clamp(terrainParam(2), -80.0, 40.0) + (0.5 - duneStripesRaw(xz)) * clamp(terrainParam(1), 0.0, 60.0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 8000.0);
}

float duneStripesSand(vec2 p) {
  p = vec2(p.y - p.x, p.x + p.y) * 0.7071 / 4.0;
  vec2 q = duneStripesRot(3.14159 / 18.0) * p;
  q.y += (duneStripesNoise2(q * 18.0) - 0.5) * 0.05;
  float grad1 = duneStripesGrad(q.y * 80.0, 0.0);

  q = duneStripesRot(-3.14159 / 20.0) * p;
  q.y += (duneStripesNoise2(q * 12.0) - 0.5) * 0.05;
  float grad2 = duneStripesGrad(q.y * 80.0, 0.5);

  q = duneStripesRot(3.14159 / 4.0) * p;
  float a2 = dot(sin(q * 12.0 - cos(q.yx * 12.0)), vec2(0.25)) + 0.5;
  float a1 = 1.0 - a2;
  grad1 *= a1;
  grad2 *= a2;
  return 1.0 - (1.0 - grad1) * (1.0 - grad2);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  time += 0.0;
  float raw = duneStripesRaw(worldPos.xz);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float stripes = duneStripesSand(worldPos.xz * clamp(terrainParam(0), 0.01, 0.25) * 1.8);
  float stripeStrength = clamp(terrainParam(4), 0.0, 2.0);
  float contrast = clamp(terrainParam(5), 0.2, 2.5);

  vec3 sand = vec3(0.90, 0.55, 0.16);
  vec3 pale = vec3(0.86, 0.68, 0.32);
  vec3 shadow = vec3(0.42, 0.24, 0.10);
  vec3 col = mix(sand, pale, raw * 0.8 + normal.y * 0.2);
  col = mix(col, col * (0.72 + stripes * 0.62), stripeStrength * 0.45);
  col = mix(col, shadow, slope * 0.26);
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
