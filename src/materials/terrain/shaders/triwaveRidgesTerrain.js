const TRIWAVE_TERRAIN_SCALE = 0.05;
const TRIWAVE_HEIGHT_SCALE = 22.0;
const TRIWAVE_HEIGHT_OFFSET = -4.0;
const TRIWAVE_RENDER_DISTANCE = 1800.0;
const TRIWAVE_SPACING = 2.15;

function fract(value) {
  return value - Math.floor(value);
}

function triwave(value) {
  return Math.abs(fract(value) - 0.5);
}

function rotate2(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: x * c + y * s,
    y: -x * s + y * c
  };
}

function triwaveWarpCoords(x, z, terrainScale, warpAmount) {
  const warp = Math.max(0, Number(warpAmount) || 0);

  if (warp <= 0.0001) {
    return { x, z };
  }

  const px = x * terrainScale * 0.13;
  const pz = z * terrainScale * 0.13;
  const wx = Math.sin(px * 1.37 + Math.sin(pz * 1.91));
  const wz = Math.cos(pz * 1.61 + Math.cos(px * 1.17));

  return {
    x: x + wx * warp * 18.0,
    z: z + wz * warp * 18.0
  };
}

function triwaveHeightWarp(x, z, terrainScale, amount) {
  const heightWarp = Math.max(0, Number(amount) || 0);

  if (heightWarp <= 0.0001) {
    return 0;
  }

  const px = x * terrainScale * 0.09;
  const pz = z * terrainScale * 0.09;
  const broad = Math.sin(px + Math.sin(pz * 1.7)) * 0.45 +
    Math.cos(pz * 0.9 + Math.cos(px * 1.3)) * 0.55;

  return broad * heightWarp * 0.14;
}

function triwaveFbm(x, y, octaves = 8, spacing = TRIWAVE_SPACING, rotation = 12.0, ridgePower = 1.0) {
  let value = 0;
  let value1 = 0;
  let value2 = 0;
  let amplitude = 2;
  let uvx = x / 8;
  let uvy = y / 8;
  let uv1x = uvx;
  let uv1y = uvy;

  for (let index = 0; index < octaves; index += 1) {
    const t1x = triwave(uvx);
    const t1y = triwave(uvy);

    value1 = Math.sqrt(value1 * value1 + value * value + 0.01);
    value = Math.abs(Math.pow(Math.abs(t1x - t1y), ridgePower) * amplitude - value);
    value2 = (value1 + value2) * 0.5;
    amplitude /= spacing;

    uv1x = uvx;
    uv1y = uvy;
    const next = rotate2(uvy * spacing + t1x, uvx * spacing + t1y, rotation);
    uvx = next.x + uv1x * 0.0;
    uvy = next.y + uv1y * 0.0;
  }

  return value2;
}

export const triwaveRidgesTerrainShader = {
  id: "triwave-ridges",
  label: "Triwave Ridges",
  description: "Angular folded-ridge terrain adapted from the provided triwave FBM shader.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.005, max: 0.050, step: 0.001, default: TRIWAVE_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 5.0, max: 35.0, step: 0.1, default: TRIWAVE_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: TRIWAVE_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 15000.0, step: 20.0, default: TRIWAVE_RENDER_DISTANCE },
    { key: "spacing", label: "Ridge Spacing", min: 1.4, max: 7.5, step: 0.01, default: TRIWAVE_SPACING },
    { key: "ridgePower", label: "Ridge Power", min: 0.45, max: 2.5, step: 0.01, default: 1.0 },
    { key: "colorContrast", label: "Color Contrast", min: 0.2, max: 2.5, step: 0.01, default: 1.1 },
    { key: "snowAmount", label: "Snow Amount", min: 0.0, max: 1.0, step: 0.01, default: 0.45 },
    { key: "textureMix", label: "Texture Mix", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
    { key: "textureScale", label: "Texture Scale", min: 0.05, max: 12.0, step: 0.01, default: 1.0 },
    { key: "textureSharpness", label: "Texture Sharpness", min: 0.0, max: 2.0, step: 0.01, default: 0.35 },
    { key: "textureBrightness", label: "Texture Brightness", min: 0.1, max: 3.0, step: 0.01, default: 1.0 },
    { key: "textureContrast", label: "Texture Contrast", min: 0.2, max: 3.0, step: 0.01, default: 1.15 },
    { key: "warp", label: "Warp XZ", min: 0.0, max: 10.0, step: 0.05, default: 0.0, description: "Large-scale sideways deformation of the terrain shader." },
    { key: "heightWarp", label: "Height Warp", min: 0.0, max: 250.0, step: 0.1, default: 0.0, description: "Large-scale height modulation of the terrain shader." },
    { key: "tintR", label: "Tint R", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "tintG", label: "Tint G", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "tintB", label: "Tint B", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "hue", label: "Hue", min: -3.14, max: 3.14, step: 0.01, default: 0.0 },
    { key: "saturation", label: "Saturation", min: 0.0, max: 2.0, step: 0.01, default: 1.0 }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? TRIWAVE_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? TRIWAVE_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? TRIWAVE_HEIGHT_OFFSET);
    const spacing = Number(params.spacing ?? TRIWAVE_SPACING);
    const ridgePower = Number(params.ridgePower ?? 1.0);
    const warp = Number(params.warp ?? 0.0);
    const heightWarp = Number(params.heightWarp ?? 0.0);
    const warped = triwaveWarpCoords(x, z, terrainScale, warp);
    const raw = triwaveFbm(warped.x * terrainScale, warped.z * terrainScale, 8, spacing, 12.0, ridgePower);
    return heightOffset + raw * heightScale + triwaveHeightWarp(x, z, terrainScale, heightWarp);
  },

  glsl: /* glsl */`
#define TRIWAVE_OCTAVES 8

float terrainEnabled() {
  return 1.0;
}

vec2 triwaveFold(vec2 uv) {
  return abs(fract(uv) - 0.5);
}

mat2 triwaveRotate2D(float r) {
  return mat2(cos(r), sin(r), -sin(r), cos(r));
}

float triwaveFbm(vec2 uv) {
  float spacing = clamp(terrainParam(4), 1.4, 7.5);
  float ridgePower = clamp(terrainParam(5), 0.45, 2.5);
  float value = 0.0;
  float value1 = 0.0;
  float value2 = 0.0;
  float amplitude = 2.0;
  uv /= 8.0;
  mat2 r = triwaveRotate2D(12.0);

  for (int i = 0; i < TRIWAVE_OCTAVES; i++) {
    vec2 t1 = triwaveFold(uv);
    value1 = sqrt(value1 * value1 + value * value + 0.01);
    value = abs(pow(abs(t1.x - t1.y), ridgePower) * amplitude - value);
    value2 = (value1 + value2) * 0.5;
    amplitude /= spacing;
    uv = (uv.yx * spacing + t1) * r;
  }

  return value2;
}

vec2 triwaveWarpXZ(vec2 xz) {
  float warp = clamp(terrainParam(13), 0.0, 10.0);

  if (warp <= 0.001) {
    return xz;
  }

  float terrainScale = clamp(terrainParam(0), 0.005, 0.050);
  vec2 p = xz * terrainScale * 0.13;
  vec2 w = vec2(
    sin(p.x * 1.37 + sin(p.y * 1.91)),
    cos(p.y * 1.61 + cos(p.x * 1.17))
  );

  return xz + w * warp * 18.0;
}

float triwaveHeightWarp(vec2 xz) {
  float amount = clamp(terrainParam(14), 0.0, 250.0);

  if (amount <= 0.001) {
    return 0.0;
  }

  float terrainScale = clamp(terrainParam(0), 0.005, 0.050);
  vec2 p = xz * terrainScale * 0.09;
  float broad = sin(p.x + sin(p.y * 1.7)) * 0.45 +
    cos(p.y * 0.9 + cos(p.x * 1.3)) * 0.55;

  return broad * amount * 0.14;
}

float triwaveHeightRaw(vec2 xz) {
  return triwaveFbm(triwaveWarpXZ(xz) * clamp(terrainParam(0), 0.005, 0.050));
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  return clamp(terrainParam(2), -80.0, 40.0) + triwaveHeightRaw(xz) * clamp(terrainParam(1), 5.0, 35.0) + triwaveHeightWarp(xz);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 15000.0);
}

vec3 triwaveApplyContrast(vec3 col, float contrast) {
  return clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
}

vec3 triwaveHueRotate(vec3 col, float hueShift) {
  float s = sin(hueShift);
  float c = cos(hueShift);

  mat3 m = mat3(
    vec3(0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787),
    vec3(0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715),
    vec3(0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072)
  );

  return clamp(m * col, 0.0, 1.0);
}

vec3 triwaveColorize(vec3 col, float hue, float saturation, vec3 tint) {
  col *= tint;
  vec3 shifted = triwaveHueRotate(col, hue);
  float luma = dot(shifted, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(luma), shifted, saturation), 0.0, 1.0);
}

vec3 triwaveSampleSurfaceTexture(vec2 uv, float sharpness) {
  vec3 c = texture2D(uSurfaceTex, fract(uv)).rgb;

  if (sharpness <= 0.001) {
    return c;
  }

  vec2 texel = vec2(0.0025);

  vec3 n = texture2D(uSurfaceTex, fract(uv + vec2(0.0, texel.y))).rgb;
  vec3 s = texture2D(uSurfaceTex, fract(uv - vec2(0.0, texel.y))).rgb;
  vec3 e = texture2D(uSurfaceTex, fract(uv + vec2(texel.x, 0.0))).rgb;
  vec3 w = texture2D(uSurfaceTex, fract(uv - vec2(texel.x, 0.0))).rgb;

  vec3 blur = (n + s + e + w) * 0.25;
  vec3 sharpened = c + (c - blur) * sharpness;

  return clamp(sharpened, 0.0, 1.0);
}

float triwaveViewLod(vec3 worldPos) {
  float d = distance(worldPos, uCamPos);
  return smoothstep(180.0, 1100.0, d);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  time += 0.0;
  float raw = triwaveHeightRaw(worldPos.xz);
  float height01 = clamp(raw * 0.30 + 0.34, 0.0, 1.0);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float contrast = clamp(terrainParam(6), 0.2, 2.5);
  float snowAmount = clamp(terrainParam(7), 0.0, 1.0);

  vec3 lowCol = vec3(0.20, 0.22, 0.24);
  vec3 midCol = vec3(0.54, 0.55, 0.54);
  vec3 highCol = vec3(0.94, 0.94, 0.90);
  vec3 shadowCol = vec3(0.20, 0.28, 0.38);

  vec3 col = mix(lowCol, midCol, smoothstep(0.06, 0.58, height01));
  col = mix(col, highCol, smoothstep(1.0 - snowAmount * 0.72, 1.0, height01 + normal.y * 0.18));
  col = mix(col, shadowCol, slope * 0.42);
  col *= 0.86 + 0.22 * triwaveFbm(worldPos.xz * clamp(terrainParam(0), 0.005, 0.050) * 0.65 + 17.3);
  col = (col - 0.5) * contrast + 0.5;

  float textureMix = clamp(terrainParam(8), 0.0, 1.0);
  float textureScale = max(0.001, terrainParam(9));
  float textureSharpness = clamp(terrainParam(10), 0.0, 2.0);
  float textureBrightness = max(0.0, terrainParam(11));
  float textureContrast = max(0.0, terrainParam(12));

  if (uHasSurfaceTex > 0.5 && textureMix > 0.001) {
    float viewLod = triwaveViewLod(worldPos);
    vec2 uv = worldPos.xz * 0.02 * textureScale;

    vec3 texCol = triwaveSampleSurfaceTexture(
      uv,
      textureSharpness * (1.0 - viewLod)
    );

    texCol = triwaveApplyContrast(texCol, textureContrast);
    texCol *= textureBrightness;
    texCol = clamp(texCol, 0.0, 1.0);

    float lodTexMix = textureMix * mix(1.0, 0.88, viewLod);
    col = mix(col, col * texCol * 1.45, lodTexMix);
  }

  vec3 tint = vec3(
    clamp(terrainParam(15), 0.0, 2.0),
    clamp(terrainParam(16), 0.0, 2.0),
    clamp(terrainParam(17), 0.0, 2.0)
  );
  float hue = clamp(terrainParam(18), -3.14, 3.14);
  float saturation = clamp(terrainParam(19), 0.0, 2.0);
  col = triwaveColorize(col, hue, saturation, tint);

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
