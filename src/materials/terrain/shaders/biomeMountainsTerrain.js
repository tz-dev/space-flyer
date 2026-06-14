const BIOME_TERRAIN_SCALE = 0.1;
const BIOME_HEIGHT_OFFSET = -10.0;
const BIOME_HEIGHT_SCALE = 1.0;
const BIOME_RENDER_DISTANCE = 1800.0;

function fract(value) {
  return value - Math.floor(value);
}

function hash2(x, y) {
  return fract(Math.pow(Math.sin((x - y * 59.7177) * 41.7179) * 41.1536, 2.0) * 13.145);
}

function noise2d(x, y) {
  const fx = fract(x);
  const fy = fract(y);
  const ix = x - fx;
  const iy = y - fy;

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const ab = a * (1 - ux) + b * ux;
  const cd = c * (1 - ux) + d * ux;

  return ab * (1 - uy) + cd * uy;
}

function biomeWarpCoords(x, z, terrainScale, warpAmount) {
  const warp = Math.max(0, Number(warpAmount) || 0);

  if (warp <= 0.0001) {
    return { x, z };
  }

  const px = x * terrainScale * 0.10;
  const pz = z * terrainScale * 0.10;
  const wx = noise2d(px + 13.17, pz + 4.91) * 2.0 - 1.0;
  const wz = noise2d(px - 7.23, pz + 19.41) * 2.0 - 1.0;

  return {
    x: x + wx * warp * 20.0,
    z: z + wz * warp * 20.0
  };
}

function biomeHeightWarp(x, z, terrainScale, amount) {
  const heightWarp = Math.max(0, Number(amount) || 0);

  if (heightWarp <= 0.0001) {
    return 0;
  }

  const px = x * terrainScale * 0.07;
  const pz = z * terrainScale * 0.07;
  const broad = (noise2d(px + 6.1, pz + 3.7) - 0.5) * 0.65 +
    (noise2d(px * 2.3 - 11.4, pz * 2.3 + 8.2) - 0.5) * 0.35;

  return broad * heightWarp * 0.20;
}

function biomeHeightRaw(x, z, terrainScale = BIOME_TERRAIN_SCALE, mountainAmount = 1.0, detailAmount = 1.0) {
  const sx = x * terrainScale;
  const sz = z * terrainScale;
  const mountains = noise2d(sx * 0.05, sz * 0.05);

  let altitude = 0;
  altitude += noise2d(sx * 0.06125, sz * 0.06125) * 16.0 * mountains * mountainAmount;
  altitude += noise2d(sx * 0.25, sz * 0.25) * 4.0 * mountains * mountainAmount;
  altitude += noise2d(sx * 0.5 + altitude * 0.5, sz * 0.5 + altitude * 0.5) * 2.0 * mountains * detailAmount;
  altitude += noise2d(sx * 2.0, sz * 2.0) * 0.5 * mountains * detailAmount;
  altitude += noise2d(sx * 8.0, sz * 8.0) * 0.125 * mountains * detailAmount;

  return altitude;
}

export const biomeMountainsTerrainShader = {
  id: "biome-mountains",
  label: "Biome Mountains",
  description: "Mountain biome terrain with dirt, rock, sand, grass and snow layers adapted from the provided shader.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.1, max: 0.25, step: 0.001, default: BIOME_TERRAIN_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -150.0, max: 0.0, step: 0.1, default: BIOME_HEIGHT_OFFSET },
    { key: "heightScale", label: "Height Scale", min: 1.0, max: 8.0, step: 0.01, default: BIOME_HEIGHT_SCALE },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 15000.0, step: 20.0, default: BIOME_RENDER_DISTANCE },
    { key: "waterLevel", label: "Water Level", min: -10.0, max: 20.0, step: 0.1, default: 2.0 },
    { key: "snowAmount", label: "Snow Amount", min: -10.0, max: 12.0, step: 0.1, default: 4.0 },
    { key: "grassAmount", label: "Grass Amount", min: -4.0, max: 14.0, step: 0.1, default: 5.0 },
    { key: "sandAmount", label: "Sand Amount", min: 0.0, max: 4.0, step: 0.01, default: 1.0 },
    { key: "rockAmount", label: "Rock Amount", min: 0.0, max: 4.0, step: 0.01, default: 1.0 },
    { key: "mountainAmount", label: "Mountain Amount", min: 0.5, max: 1.35, step: 0.01, default: 1.0 },
    { key: "detailAmount", label: "Detail Amount", min: 0.0, max: 3.0, step: 0.01, default: 1.0 },
    { key: "hue", label: "Hue", min: -3.14, max: 3.14, step: 0.01, default: 0.0 },
    { key: "warp", label: "Warp XZ", min: 0.0, max: 3.5, step: 0.05, default: 0.0, description: "Large-scale sideways deformation of the terrain shader." },
    { key: "heightWarp", label: "Height Warp", min: 0.0, max: 200.0, step: 0.1, default: 0.0, description: "Large-scale height modulation of the terrain shader." }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? BIOME_TERRAIN_SCALE);
    const heightOffset = Number(params.heightOffset ?? BIOME_HEIGHT_OFFSET);
    const heightScale = Number(params.heightScale ?? BIOME_HEIGHT_SCALE);
    const mountainAmount = Number(params.mountainAmount ?? 1.0);
    const detailAmount = Number(params.detailAmount ?? 1.0);
    const warp = Number(params.warp ?? 0.0);
    const heightWarp = Number(params.heightWarp ?? 0.0);
    const warped = biomeWarpCoords(x, z, terrainScale, warp);
    return heightOffset + biomeHeightRaw(warped.x, warped.z, terrainScale, mountainAmount, detailAmount) * heightScale + biomeHeightWarp(x, z, terrainScale, heightWarp);
  },

  glsl: /* glsl */`
#define BIOME_TERRAIN_SCALE ${BIOME_TERRAIN_SCALE.toFixed(6)}
#define BIOME_HEIGHT_OFFSET ${BIOME_HEIGHT_OFFSET.toFixed(6)}
#define BIOME_HEIGHT_SCALE ${BIOME_HEIGHT_SCALE.toFixed(6)}
#define BIOME_RENDER_DISTANCE ${BIOME_RENDER_DISTANCE.toFixed(1)}

float terrainEnabled() {
  return 1.0;
}

float biomeHash(float x) {
  return fract(pow(sin(x * 41.7179) * 41.1536, 2.0) * 13.145);
}

float biomeHash(vec2 v) {
  return biomeHash(v.x - v.y * 59.7177);
}

float biomeNoise2d(vec2 p) {
  vec2 f = fract(p);
  vec2 id = p - f;
  f = f * f * (3.0 - 2.0 * f);

  float a = biomeHash(id + vec2(0.0, 0.0));
  float b = biomeHash(id + vec2(1.0, 0.0));
  float c = biomeHash(id + vec2(0.0, 1.0));
  float d = biomeHash(id + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 biomeNoiseMap(vec2 p) {
  return vec3(
    biomeNoise2d(p + vec2(13.17, 4.91)),
    biomeNoise2d(p + vec2(-7.23, 19.41)),
    biomeNoise2d(p + vec2(31.73, -11.37))
  );
}

vec3 biomeHueRotate(vec3 col, float hueShift) {
  float s = sin(hueShift);
  float c = cos(hueShift);

  mat3 m = mat3(
    vec3(0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787),
    vec3(0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715),
    vec3(0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072)
  );

  return clamp(m * col, 0.0, 1.0);
}

vec2 biomeWarpXZ(vec2 xz) {
  float warp = clamp(terrainParam(12), 0.0, 3.5);

  if (warp <= 0.001) {
    return xz;
  }

  float terrainScale = clamp(terrainParam(0), 0.1, 0.25);
  vec2 p = xz * terrainScale * 0.10;
  vec2 w = biomeNoiseMap(p).xy * 2.0 - 1.0;

  return xz + w * warp * 20.0;
}

float biomeHeightWarp(vec2 xz) {
  float amount = clamp(terrainParam(13), 0.0, 200.0);

  if (amount <= 0.001) {
    return 0.0;
  }

  float terrainScale = clamp(terrainParam(0), 0.1, 0.25);
  vec2 p = xz * terrainScale * 0.07;
  float broad = (biomeNoise2d(p + vec2(6.1, 3.7)) - 0.5) * 0.65 +
    (biomeNoise2d(p * 2.3 + vec2(-11.4, 8.2)) - 0.5) * 0.35;

  return broad * amount * 0.20;
}

float biomeHeightRaw(vec2 coord2d) {
  coord2d = biomeWarpXZ(coord2d);
  coord2d *= clamp(terrainParam(0), 0.1, 0.25);

  float altitude = 0.0;
  float mountains = biomeNoise2d(coord2d * 0.05);

  float mountainAmount = clamp(terrainParam(9), 0.5, 1.35);
  float detailAmount = clamp(terrainParam(10), 0.0, 3.0);

  altitude += biomeNoise2d(coord2d * 0.06125) * 16.0 * mountains * mountainAmount;
  altitude += biomeNoise2d(coord2d * 0.25) * 4.0 * mountains * mountainAmount;
  altitude += biomeNoise2d(coord2d * 0.5 + altitude * 0.5) * 2.0 * mountains * detailAmount;
  altitude += biomeNoise2d(coord2d * 2.0) * 0.5 * mountains * detailAmount;
  altitude += biomeNoise2d(coord2d * 8.0) * 0.125 * mountains * detailAmount;

  return altitude;
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  return clamp(terrainParam(1), -150.0, 0.0) + biomeHeightRaw(xz) * clamp(terrainParam(2), 1.0, 8.0) + biomeHeightWarp(xz);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 15000.0);
}

float biomeDistanceFromWater(vec3 pos) {
  float waterLevel = clamp(terrainParam(4), -10.0, 20.0);
  return pos.y + 14.0 - waterLevel;
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float snowAmount = clamp(terrainParam(5), -10.0, 12.0);
  float grassAmount = clamp(terrainParam(6), -4.0, 14.0);
  float sandAmount = clamp(terrainParam(7), 0.0, 4.0);
  float rockAmount = clamp(terrainParam(8), 0.0, 4.0);

  vec3 colorSnow = vec3(0.96, 0.98, 0.99);
  vec3 colorGrass = vec3(0.30, 0.50, 0.20);
  vec3 colorDirt = vec3(0.24, 0.16, 0.12);
  vec3 colorRock = vec3(0.52, 0.54, 0.50);
  vec3 colorSand = vec3(0.90, 0.80, 0.40);

  float altitude = worldPos.y + 5.0;

  vec3 map1 = biomeNoiseMap(worldPos.xz * BIOME_TERRAIN_SCALE * 0.10);
  vec3 map2 = biomeNoiseMap(worldPos.xz * BIOME_TERRAIN_SCALE * 0.05 + vec2(23.7, -8.1));
  vec3 map3 = biomeNoiseMap(worldPos.xz * BIOME_TERRAIN_SCALE * 0.025 + vec2(-41.3, 17.9));

  vec3 color = mix(colorDirt, colorDirt * 0.125, map1.x);

  float rockMask = clamp(
    8.0 * (length(normal.xz) * rockAmount + altitude * 0.5 - 3.0 + map1.z * 0.5) * 0.1,
    0.0,
    1.0
  );
  color = mix(color, colorRock * map3 * 1.5 - 0.1, rockMask);

  float sand = clamp(
    normal.y * 4.0 * sandAmount - biomeDistanceFromWater(worldPos) * 16.0,
    0.0,
    1.0
  );
  color = mix(color, colorSand, sand);

  float grass = clamp(
    map2.y * 8.0 +
    normal.y * 2.5 +
    normal.x -
    altitude * 0.1 -
    10.0 + grassAmount -
    color.y * 2.0 -
    sand,
    0.0,
    1.0
  );
  color = mix(color, colorGrass * map2 * 1.4, grass);

  float snow = clamp(
    map1.y * 2.0 +
    normal.y * 4.0 +
    altitude -
    6.5 + snowAmount,
    0.0,
    1.0
  );
  color = mix(color, colorSnow, snow);

  float hue = clamp(terrainParam(11), -3.14, 3.14);
  if (abs(hue) > 0.001) {
    color = biomeHueRotate(color, hue);
  }

  return clamp(color, 0.0, 1.0);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  return vec3(0.0);
}
`
};
