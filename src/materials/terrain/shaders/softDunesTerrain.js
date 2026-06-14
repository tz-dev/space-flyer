const SOFT_DUNES_TERRAIN_SCALE = 0.06;
const SOFT_DUNES_HEIGHT_SCALE = 20.0;
const SOFT_DUNES_HEIGHT_OFFSET = -3.5;
const SOFT_DUNES_RENDER_DISTANCE = 2200.0;

function fract(value) {
  return value - Math.floor(value);
}

function hash2x(x, y) {
  const px = x * 127.1 + y * 311.7;
  const py = x * 269.5 + y * 183.3;
  return {
    x: -1.0 + 2.0 * fract(Math.sin(px) * 43758.5453123),
    y: -1.0 + 2.0 * fract(Math.sin(py) * 43758.5453123)
  };
}

function noise2(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);

  function d(dx, dy) {
    const h = hash2x(ix + dx, iy + dy);
    return h.x * (fx - dx) + h.y * (fy - dy);
  }

  return (d(0, 0) * (1 - ux) + d(1, 0) * ux) * (1 - uy) + (d(0, 1) * (1 - ux) + d(1, 1) * ux) * uy;
}

function softDunesWarpCoords(x, z, terrainScale, warpAmount) {
  const warp = Math.max(0, Number(warpAmount) || 0);

  if (warp <= 0.0001) {
    return { x, z };
  }

  const px = x * terrainScale * 0.18;
  const pz = z * terrainScale * 0.18;
  const wx = noise2(px + 5.1, pz + 9.7);
  const wz = noise2(px - 3.4, pz + 12.2);

  return {
    x: x + wx * warp * 16.0,
    z: z + wz * warp * 16.0
  };
}

function softDunesHeightWarp(x, z, terrainScale, amount) {
  const heightWarp = Math.max(0, Number(amount) || 0);

  if (heightWarp <= 0.0001) {
    return 0;
  }

  const px = x * terrainScale * 0.10;
  const pz = z * terrainScale * 0.10;
  const broad = noise2(px + 15.3, pz - 8.7) * 0.65 + noise2(px * 2.0 - 2.1, pz * 2.0 + 4.6) * 0.35;

  return broad * heightWarp * 0.18;
}

function terrainH(x, z) {
  let valS = noise2(x * 0.5, z * 0.5) + 0.5;
  valS = 1.0 - Math.abs(valS - 0.5) * 2.0;
  valS = Math.pow(valS, 2.0);
  let valM = noise2(x * 0.26, z * 0.26) + 0.5;
  valM = 1.0 - Math.abs(valM - 0.5) * 2.0;
  valM = Math.pow(valM, 2.0);
  const valB = Math.max(0.0, Math.min(1.0, noise2(x * 0.2, z * 0.2) + 0.5));
  return (valS * 0.01 + valM * 0.19 + valB * 0.8) * 1.3 - 0.3;
}

export const softDunesTerrainShader = {
  id: "soft-dunes",
  label: "Soft Dunes",
  description: "Simple fast desert dune terrain adapted from the second dunes shader.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.015, max: 0.060, step: 0.001, default: SOFT_DUNES_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 15.0, max: 60.0, step: 0.1, default: SOFT_DUNES_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: SOFT_DUNES_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 15000.0, step: 20.0, default: SOFT_DUNES_RENDER_DISTANCE },
    { key: "rippleStrength", label: "Ripple Strength", min: 0.0, max: 2.0, step: 0.01, default: 0.8 },
    { key: "rippleScale", label: "Ripple Scale", min: 0.05, max: 0.5, step: 0.01, default: 0.5, description: "Frequency scaling of the fine dune ripple pattern." },
    { key: "colorContrast", label: "Color Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.0 },
    { key: "hue", label: "Hue", min: -3.14, max: 3.14, step: 0.01, default: 0.0 },
    { key: "saturation", label: "Saturation", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "warp", label: "Warp XZ", min: 0.0, max: 10.0, step: 0.05, default: 0.0, description: "Large-scale sideways deformation of the terrain shader." },
    { key: "heightWarp", label: "Height Warp", min: 0.0, max: 250.0, step: 0.1, default: 0.0, description: "Large-scale height modulation of the terrain shader." }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? SOFT_DUNES_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? SOFT_DUNES_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? SOFT_DUNES_HEIGHT_OFFSET);
    const warp = Number(params.warp ?? 0.0);
    const heightWarp = Number(params.heightWarp ?? 0.0);
    const warped = softDunesWarpCoords(x, z, terrainScale, warp);
    return heightOffset + terrainH(warped.x * terrainScale, warped.z * terrainScale) * heightScale + softDunesHeightWarp(x, z, terrainScale, heightWarp);
  },

  glsl: /* glsl */`
float terrainEnabled() {
  return 1.0;
}

vec2 softDunesHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float softDunesNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(dot(softDunesHash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)), dot(softDunesHash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(softDunesHash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(softDunesHash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

vec3 softDunesHueRotate(vec3 col, float hueShift) {
  float s = sin(hueShift);
  float c = cos(hueShift);

  mat3 m = mat3(
    vec3(0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787),
    vec3(0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715),
    vec3(0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072)
  );

  return clamp(m * col, 0.0, 1.0);
}

vec3 softDunesColorize(vec3 col, float hue, float saturation) {
  vec3 shifted = softDunesHueRotate(col, hue);
  float luma = dot(shifted, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(luma), shifted, saturation), 0.0, 1.0);
}

vec2 softDunesWarpXZ(vec2 xz) {
  float warp = clamp(terrainParam(9), 0.0, 10.0);

  if (warp <= 0.001) {
    return xz;
  }

  float terrainScale = clamp(terrainParam(0), 0.015, 0.060);
  vec2 p = xz * terrainScale * 0.18;
  vec2 w = vec2(
    softDunesNoise(p + vec2(5.1, 9.7)),
    softDunesNoise(p + vec2(-3.4, 12.2))
  );

  return xz + w * warp * 16.0;
}

float softDunesHeightWarp(vec2 xz) {
  float amount = clamp(terrainParam(10), 0.0, 250.0);

  if (amount <= 0.001) {
    return 0.0;
  }

  float terrainScale = clamp(terrainParam(0), 0.015, 0.060);
  vec2 p = xz * terrainScale * 0.10;
  float broad = softDunesNoise(p + vec2(15.3, -8.7)) * 0.65 +
    softDunesNoise(p * 2.0 + vec2(-2.1, 4.6)) * 0.35;

  return broad * amount * 0.18;
}

float softDunesHeightRaw(vec2 p) {
  float valS = softDunesNoise(p * 0.5) + 0.5;
  valS = 1.0 - abs(valS - 0.5) * 2.0;
  valS = pow(valS, 2.0);

  float valM = softDunesNoise(p * 0.26) + 0.5;
  valM = 1.0 - abs(valM - 0.5) * 2.0;
  valM = pow(valM, 2.0);

  float valB = smoothstep(0.0, 1.0, softDunesNoise(p * 0.2) + 0.5);
  return (valS * 0.01 + valM * 0.19 + valB * 0.8) * 1.3 - 0.3;
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  return clamp(terrainParam(2), -80.0, 40.0) + softDunesHeightRaw(softDunesWarpXZ(xz) * clamp(terrainParam(0), 0.015, 0.060)) * clamp(terrainParam(1), 15.0, 60.0) + softDunesHeightWarp(xz);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 15000.0);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float scale = clamp(terrainParam(0), 0.015, 0.060);
  float rippleStrength = clamp(terrainParam(4), 0.0, 2.0);
  float rippleScale = clamp(terrainParam(5), 0.05, 0.5);
  float contrast = clamp(terrainParam(6), 0.2, 2.5);
  float hue = clamp(terrainParam(7), -3.14, 3.14);
  float saturation = clamp(terrainParam(8), 0.0, 2.0);
  float h = softDunesHeightRaw(worldPos.xz * scale);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float grain = softDunesNoise(worldPos.xz * scale * 74.0);
  float ripple = sin(worldPos.x * scale * 650.0 * rippleScale + sin(worldPos.z * scale * 201.5 * rippleScale) + time * 0.08) * 0.5 + 0.5;

  vec3 sand = vec3(0.90, 0.70, 0.40);
  vec3 warm = vec3(0.96, 0.58, 0.22);
  vec3 shadow = vec3(0.40, 0.24, 0.12);
  vec3 col = mix(sand, warm, clamp(h * 0.8 + 0.42, 0.0, 1.0));
  col *= 0.9 + grain * 0.18 + ripple * 0.12 * rippleStrength;
  col = mix(col, shadow, slope * 0.22);
  col = (col - 0.5) * contrast + 0.5;
  col = softDunesColorize(col, hue, saturation);

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
