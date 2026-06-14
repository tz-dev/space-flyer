const EFFICIENT_TERRAIN_SCALE = 0.04;
const EFFICIENT_HEIGHT_SCALE = 8.5;
const EFFICIENT_HEIGHT_OFFSET = -2.35;
const EFFICIENT_RENDER_DISTANCE = 1200.0;
const EFFICIENT_SPACING = 2.15;

function efficientNoise2(x, y) {
  return {
    x: Math.sin(x) + 1,
    y: Math.cos(y) + 1
  };
}

function efficientFbm1(x, y, octaves, i1, value1, spacing = EFFICIENT_SPACING) {
  const f = Math.max(0.0001, spacing);
  let value = value1;
  const amplitude = i1 * value1;
  let freq = i1 / f;
  let noise1x = 0;
  let noise1y = 0;

  for (let index = 0; index < octaves; index += 1) {
    const noise2 = efficientNoise2(noise1y - x / freq, noise1x - y / freq);
    const nextNoise1x = noise2.x - value - noise1y * freq;
    const nextNoise1y = noise2.y - value - noise1x * freq;

    noise1x = nextNoise1x;
    noise1y = nextNoise1y;
    freq /= -f;

    const n1 = noise1x + noise1y;
    value += n1 * (amplitude - freq);

    x -= noise2.y * freq;
    y -= noise2.x * freq;
  }

  return value / 4;
}

function efficientFbm(x, y, spacing = EFFICIENT_SPACING) {
  let result = 0;
  let octaves = 8;

  for (let i = 1; i < 3; i += 1) {
    const i1 = i * i;
    result = efficientFbm1(x, y, octaves, i1, result - result / i1, spacing);
    octaves = Math.floor(octaves / 2);
  }

  return result;
}

function efficientWarpCoords(x, z, terrainScale, warpAmount) {
  const warp = Math.max(0, Number(warpAmount) || 0);

  if (warp <= 0.0001) {
    return { x, z };
  }

  const px = x * terrainScale * 0.18;
  const pz = z * terrainScale * 0.18;
  const wx = Math.sin(px * 1.71 + Math.cos(pz * 0.93) * 1.63);
  const wz = Math.cos(pz * 1.37 + Math.sin(px * 1.11) * 1.47);

  return {
    x: x + wx * warp * 18.0,
    z: z + wz * warp * 18.0
  };
}

function efficientHeightWarp(x, z, terrainScale, amount) {
  const heightWarp = Math.max(0, Number(amount) || 0);

  if (heightWarp <= 0.0001) {
    return 0;
  }

  const px = x * terrainScale * 0.11;
  const pz = z * terrainScale * 0.11;
  const broad = Math.sin(px + Math.cos(pz * 1.7)) * 0.5 +
    Math.sin(pz * 0.73 + Math.cos(px * 1.23)) * 0.5;

  return broad * heightWarp * 0.12;
}

export const efficientMountainsTerrainShader = {
  id: "efficient-mountains",
  label: "Efficient Mountains",
  description: "Fast sine/cosine FBM mountain terrain adapted from the provided shader.",
  params: [
    { key: "terrainScale", label: "Terrain Scale", min: 0.005, max: 0.040, step: 0.001, default: EFFICIENT_TERRAIN_SCALE },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 25.0, step: 0.1, default: EFFICIENT_HEIGHT_SCALE },
    { key: "heightOffset", label: "Height Offset", min: -80.0, max: 40.0, step: 0.1, default: EFFICIENT_HEIGHT_OFFSET },
    { key: "renderDistance", label: "Render Distance", min: 200.0, max: 15000.0, step: 20.0, default: EFFICIENT_RENDER_DISTANCE },
    { key: "spacing", label: "Mountain Spacing", min: 1.5, max: 4.0, step: 0.01, default: EFFICIENT_SPACING },
    { key: "snowStart", label: "Snow Start", min: 0.0, max: 1.0, step: 0.01, default: 0.56 },
    { key: "slopeDarkening", label: "Slope Darkening", min: 0.0, max: 1.0, step: 0.01, default: 0.45 },
    { key: "colorContrast", label: "Color Contrast", min: 0.2, max: 2.4, step: 0.01, default: 1.0 },
    { key: "textureMix", label: "Texture Mix", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
    { key: "textureScale", label: "Texture Scale", min: 0.05, max: 12.0, step: 0.01, default: 1.0 },
    { key: "textureSharpness", label: "Texture Sharpness", min: 0.0, max: 2.0, step: 0.01, default: 0.35 },
    { key: "textureBrightness", label: "Texture Brightness", min: 0.1, max: 3.0, step: 0.01, default: 1.0 },
    { key: "textureContrast", label: "Texture Contrast", min: 0.2, max: 3.0, step: 0.01, default: 1.15 },
    { key: "warp", label: "Warp XZ", min: 0.0, max: 10.0, step: 0.05, default: 0.0, description: "Large-scale sideways deformation of the terrain shader." },
    { key: "heightWarp", label: "Height Warp", min: 0.0, max: 200.0, step: 0.1, default: 0.0, description: "Large-scale height modulation of the terrain shader." }
  ],

  heightAtWorld({ x, z, params }) {
    const terrainScale = Number(params.terrainScale ?? EFFICIENT_TERRAIN_SCALE);
    const heightScale = Number(params.heightScale ?? EFFICIENT_HEIGHT_SCALE);
    const heightOffset = Number(params.heightOffset ?? EFFICIENT_HEIGHT_OFFSET);
    const spacing = Number(params.spacing ?? EFFICIENT_SPACING);
    const warp = Number(params.warp ?? 0.0);
    const heightWarp = Number(params.heightWarp ?? 0.0);
    const warped = efficientWarpCoords(x, z, terrainScale, warp);
    const raw = efficientFbm(warped.x * terrainScale, warped.z * terrainScale, spacing);
    return heightOffset + raw * heightScale + efficientHeightWarp(x, z, terrainScale, heightWarp);
  },

  glsl: /* glsl */`
#define EFFICIENT_OCTAVES 8

float terrainEnabled() {
  return 1.0;
}

vec2 efficientMountainsNoise(vec2 uv) {
  return vec2(sin(uv.x), cos(uv.y)) + vec2(1.0);
}

float efficientMountainsFbm1(vec2 uv, int octaves, float i1, float value1) {
  float f = clamp(terrainParam(4), 1.5, 4.0);
  float value = value1;
  float amplitude = i1 * value1;
  float freq = i1 / f;
  float n1 = 0.0;
  vec2 noise1 = vec2(0.0);
  vec2 noise2 = vec2(0.0);

  for (int i = 0; i < EFFICIENT_OCTAVES; i++) {
    if (i >= octaves) {
      break;
    }

    noise2 = efficientMountainsNoise(noise1.yx - uv / freq);
    noise1 = noise2 - vec2(value) - noise1.yx * freq;
    freq /= -f;
    n1 = noise1.x + noise1.y;

    value += n1 * (amplitude - freq);
    uv -= noise2.yx * freq;
  }

  return value / 4.0;
}

float efficientMountainsFbm(vec2 uv) {
  float result = 0.0;
  int octaves = EFFICIENT_OCTAVES;

  for (int i = 1; i < 3; i++) {
    float fi = float(i);
    float i1 = fi * fi;
    result = efficientMountainsFbm1(uv, octaves, i1, result - result / i1);
    octaves /= 2;
  }

  return result;
}

vec2 efficientMountainsWarpXZ(vec2 xz) {
  float warp = clamp(terrainParam(13), 0.0, 10.0);

  if (warp <= 0.001) {
    return xz;
  }

  float terrainScale = clamp(terrainParam(0), 0.005, 0.040);
  vec2 p = xz * terrainScale * 0.18;
  vec2 w = vec2(
    sin(p.x * 1.71 + cos(p.y * 0.93) * 1.63),
    cos(p.y * 1.37 + sin(p.x * 1.11) * 1.47)
  );

  return xz + w * warp * 18.0;
}

float efficientMountainsHeightWarp(vec2 xz) {
  float amount = clamp(terrainParam(14), 0.0, 200.0);

  if (amount <= 0.001) {
    return 0.0;
  }

  float terrainScale = clamp(terrainParam(0), 0.005, 0.040);
  vec2 p = xz * terrainScale * 0.11;
  float broad = sin(p.x + cos(p.y * 1.7)) * 0.5 +
    sin(p.y * 0.73 + cos(p.x * 1.23)) * 0.5;

  return broad * amount * 0.12;
}

float efficientMountainsHeightRaw(vec2 xz) {
  return efficientMountainsFbm(efficientMountainsWarpXZ(xz) * clamp(terrainParam(0), 0.005, 0.040));
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  return clamp(terrainParam(2), -80.0, 40.0) + efficientMountainsHeightRaw(xz) * clamp(terrainParam(1), 0.0, 25.0) + efficientMountainsHeightWarp(xz);
}

float terrainRenderDistance() {
  return clamp(terrainParam(3), 200.0, 15000.0);
}


vec3 efficientMountainsApplyContrast(vec3 col, float contrast) {
  return clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
}

vec3 efficientMountainsSampleSurfaceTexture(vec2 uv, float sharpness) {
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

float efficientMountainsViewLod(vec3 worldPos) {
  float d = distance(worldPos, uCamPos);
  return smoothstep(180.0, 1100.0, d);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float raw = efficientMountainsHeightRaw(worldPos.xz);
  float height01 = clamp(raw * 0.42 + 0.46, 0.0, 1.0);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);

  vec3 lowCol = vec3(0.46, 0.48, 0.50);
  vec3 midCol = vec3(0.73, 0.75, 0.74);
  vec3 highCol = vec3(0.96, 0.96, 0.92);

  float snowStart = clamp(terrainParam(5), 0.0, 1.0);
  float slopeDarkening = clamp(terrainParam(6), 0.0, 1.0);
  float colorContrast = clamp(terrainParam(7), 0.2, 2.4);

  vec3 col = mix(lowCol, midCol, smoothstep(0.12, 0.68, height01));
  col = mix(col, highCol, smoothstep(snowStart, min(1.0, snowStart + 0.39), height01));
  col = mix(col, col * vec3(0.62, 0.64, 0.68), slope * slopeDarkening);
  col = (col - 0.5) * colorContrast + 0.5;

  float textureMix = clamp(terrainParam(8), 0.0, 1.0);
  float textureScale = max(0.001, terrainParam(9));
  float textureSharpness = clamp(terrainParam(10), 0.0, 2.0);
  float textureBrightness = max(0.0, terrainParam(11));
  float textureContrast = max(0.0, terrainParam(12));

  if (uHasSurfaceTex > 0.5 && textureMix > 0.001) {
    float viewLod = efficientMountainsViewLod(worldPos);
    vec2 uv = worldPos.xz * 0.02 * textureScale;

    vec3 texCol = efficientMountainsSampleSurfaceTexture(
      uv,
      textureSharpness * (1.0 - viewLod)
    );

    texCol = efficientMountainsApplyContrast(texCol, textureContrast);
    texCol *= textureBrightness;
    texCol = clamp(texCol, 0.0, 1.0);

    float lodTexMix = textureMix * mix(1.0, 0.88, viewLod);
    col = mix(col, col * texCol * 1.45, lodTexMix);
  }

  return clamp(col, 0.0, 1.0);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  return vec3(0.0);
}
`
};
