const LAGOON_TERRAIN_SCALE = 0.02;
const LAGOON_HEIGHT_SCALE = 1.0;
const LAGOON_HEIGHT_OFFSET = -2.5;
const LAGOON_RENDER_DISTANCE = 2600.0;

function fract(value) {
  return value - Math.floor(value);
}

function hash3(x, y, z) {
  const hx = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  const hy = Math.sin(x * 269.5 + y * 183.3 + z * 246.1) * 43758.5453123;
  const hz = Math.sin(x * 113.5 + y * 271.9 + z * 124.6) * 43758.5453123;
  return {
    x: -1 + 2 * fract(hx),
    y: -1 + 2 * fract(hy),
    z: -1 + 2 * fract(hz)
  };
}

function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  function dotGrad(dx, dy, dz) {
    const h = hash3(ix + dx, iy + dy, iz + dz);
    return h.x * (fx - dx) + h.y * (fy - dy) + h.z * (fz - dz);
  }

  const x00 = dotGrad(0, 0, 0) * (1 - ux) + dotGrad(1, 0, 0) * ux;
  const x10 = dotGrad(0, 1, 0) * (1 - ux) + dotGrad(1, 1, 0) * ux;
  const x01 = dotGrad(0, 0, 1) * (1 - ux) + dotGrad(1, 0, 1) * ux;
  const x11 = dotGrad(0, 1, 1) * (1 - ux) + dotGrad(1, 1, 1) * ux;
  const y0 = x00 * (1 - uy) + x10 * uy;
  const y1 = x01 * (1 - uy) + x11 * uy;
  return y0 * (1 - uz) + y1 * uz;
}

function lagoonHeightRaw(x, z, scale = LAGOON_TERRAIN_SCALE, islandAmount = 1.0, quality = 3) {
  let qx = x * scale;
  let qz = z * scale;
  let h = 0;
  let s = 1;
  const iterations = Math.max(4, Math.min(9, Math.round(quality) + 3));

  for (let index = 0; index < iterations; index += 1) {
    h += s * noise3(qx, qz, 1);
    const nx = qx * 0.60 - qz * 0.80;
    const nz = qx * 0.80 + qz * 0.60;
    qx = nx * 3.01;
    qz = nz * 3.01;
    s *= 0.334;
  }

  return h * 25 * islandAmount;
}

export const lagoonMountainsTerrainShader = {
  id: "lagoon-mountains",
  label: "Lagoon Mountains",
  description: "Noise-island and shallow-water terrain adapted from the water/mountain shader, without sky or clouds.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.005, max: 0.08, step: 0.001, default: LAGOON_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 4.0, step: 0.01, default: LAGOON_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: LAGOON_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 10000.0, step: 20.0, default: LAGOON_RENDER_DISTANCE },
    { key: "waterLevel", label: "Water Level", min: -20.0, max: 30.0, step: 0.1, default: 4.0 },
    { key: "waterAmount", label: "Water Amount", min: 0.0, max: 1.0, step: 0.01, default: 0.75 },
    { key: "islandAmount", label: "Island Amount", min: 0.0, max: 3.0, step: 0.01, default: 1.0 },
    { key: "colorContrast", label: "Color Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.0 },
    { key: "quality", label: "Quality", min: 1.0, max: 5.0, step: 1.0, default: 3.0 }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? LAGOON_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? LAGOON_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? LAGOON_HEIGHT_OFFSET);
    const waterLevel = Number(params.waterLevel ?? 4.0);
    const waterAmount = Number(params.waterAmount ?? 0.75);
    const islandAmount = Number(params.islandAmount ?? 1.0);
    const quality = Number(params.quality ?? 3.0);
    const land = heightOffset + lagoonHeightRaw(x, z, terrainScale, islandAmount, quality) * heightScale;
    return land < waterLevel ? land * (1 - waterAmount) + waterLevel * waterAmount : land;
  },

  glsl: /* glsl */`
float terrainEnabled() {
  return 1.0;
}

const mat2 lagoonM2 = mat2(0.60, -0.80, 0.80, 0.60);

float lagoonQuality() {
  return clamp(floor(terrainParam(8) + 0.5), 1.0, 5.0);
}

vec3 lagoonHash3(vec3 p) {
  p = vec3(
    dot(p, vec3(127.1, 311.7, 74.7)),
    dot(p, vec3(269.5, 183.3, 246.1)),
    dot(p, vec3(113.5, 271.9, 124.6))
  );
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float lagoonNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(dot(lagoonHash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)), dot(lagoonHash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
      mix(dot(lagoonHash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)), dot(lagoonHash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(dot(lagoonHash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)), dot(lagoonHash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
      mix(dot(lagoonHash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)), dot(lagoonHash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

float lagoonLandHeightRaw(vec2 xz) {
  vec2 q = xz * clamp(terrainParam(0), 0.005, 0.08);
  float h = 0.0;
  float s = 1.0;

  float quality = lagoonQuality();
  int landSteps = int(quality) + 3;

  for (int i = 0; i < 8; i++) {
    if (i >= landSteps) {
      break;
    }

    h += s * lagoonNoise3(vec3(q, 1.0));
    q = lagoonM2 * q * 3.01;
    s *= 0.334;
  }

  return h * 25.0 * clamp(terrainParam(6), 0.0, 3.0);
}

float lagoonWaterHeightRaw(vec2 xz, float time) {
  vec2 q = lagoonM2 * xz * clamp(terrainParam(0), 0.005, 0.08) * 10.0;
  float o = 0.0;
  float t = time * 0.3;
  float s = 0.3;

  float quality = lagoonQuality();
  int waterSteps = int(clamp(quality, 1.0, 5.0));

  for (int i = 0; i < 5; i++) {
    if (i >= waterSteps) {
      break;
    }

    o += s * lagoonNoise3(vec3(q + vec2(t), 1.0));
    q = lagoonM2 * q * 1.98;
    s *= 0.51;
    t *= 1.5;
  }

  return o;
}

float lagoonHeightRaw(vec2 xz, float time) {
  float land = lagoonLandHeightRaw(xz);
  float waterLevel = clamp(terrainParam(4), -20.0, 30.0);
  float waterAmount = clamp(terrainParam(5), 0.0, 1.0);
  float water = waterLevel + lagoonWaterHeightRaw(xz, time) * waterAmount * 0.55;
  return mix(land, max(land, water), waterAmount);
}

float terrainHeight(vec2 xz, float time) {
  return clamp(terrainParam(2), -80.0, 40.0) + lagoonHeightRaw(xz, time) * clamp(terrainParam(1), 0.0, 4.0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 10000.0);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float heightScale = max(0.001, terrainParam(1));
  float waterLevel = clamp(terrainParam(4), -20.0, 30.0);
  float contrast = clamp(terrainParam(7), 0.2, 2.5);
  float landRaw = clamp((worldPos.y - clamp(terrainParam(2), -80.0, 40.0)) / max(1.0, 25.0 * heightScale), -1.0, 1.0);
  float wet = 1.0 - smoothstep(waterLevel - 0.6, waterLevel + 1.2, worldPos.y);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float n = lagoonNoise3(vec3(worldPos.xz * clamp(terrainParam(0), 0.005, 0.08) * 3.0, 4.1));

  vec3 deepWater = vec3(0.03, 0.18, 0.23);
  vec3 shallowWater = vec3(0.09, 0.45, 0.46);
  vec3 sand = vec3(0.62, 0.54, 0.36);
  vec3 rock = vec3(0.36, 0.31, 0.25);
  vec3 high = vec3(0.76, 0.73, 0.66);

  vec3 landCol = mix(sand, rock, smoothstep(-0.05, 0.45, landRaw + n * 0.15));
  landCol = mix(landCol, high, smoothstep(0.38, 0.9, landRaw + normal.y * 0.08));
  landCol = mix(landCol, landCol * 0.62, slope * 0.35);

  vec3 waterCol = mix(deepWater, shallowWater, clamp(normal.y * 0.45 + n * 0.35 + 0.35, 0.0, 1.0));
  vec3 col = mix(landCol, waterCol, wet * clamp(terrainParam(5), 0.0, 1.0));
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
