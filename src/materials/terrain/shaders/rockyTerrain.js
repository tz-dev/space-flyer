export const rockyTerrainShader = {
  id: "rocky",
  label: "Rocky",
  description: "Reddish alpine / moon-like surface inspired by Red Alp, implemented as an efficient static heightfield with color controls and a fixed surface texture.",

  params: [
    { key: "baseHeight", label: "Base Height", min: -20.0, max: 20.0, step: 0.1, default: 0.0, description: "Vertical offset of the surface." },
    { key: "heightScale", label: "Height Scale", min: 0.0, max: 1.5, step: 0.05, default: 1.0, description: "Amplifies or reduces the terrain shape." },
    { key: "featureScale", label: "Feature Scale", min: 1.0, max: 5.0, step: 0.05, default: 1.0, description: "Scales the size of mountain structures." },
    { key: "warp", label: "Warp XZ", min: 0.0, max: 10.0, step: 0.05, default: 0.85, description: "Large-scale sideways deformation of the landscape." },
    { key: "heightWarp", label: "Height Warp", min: 0.0, max: 50.0, step: 0.1, default: 0.75, description: "Large-scale height modulation of the landscape." },
    { key: "ridgeSharpness", label: "Ridge Sharpness", min: 1.0, max: 3.5, step: 0.05, default: 2.6, description: "Sharpness and prominence of mountain ridges." },

    { key: "colorContrast", label: "Color Contrast", min: 0.5, max: 2.0, step: 0.05, default: 1.0, description: "Contrast of the rock surface." },
    { key: "brightness", label: "Brightness", min: 0.4, max: 1.8, step: 0.05, default: 1.0, description: "Base brightness of the surface." },
    { key: "saturation", label: "Saturation", min: 0.0, max: 2.0, step: 0.05, default: 1.0, description: "Color intensity of the surface." },
    { key: "hue", label: "Hue", min: -3.14, max: 3.14, step: 0.01, default: 0.0, description: "Hue shift of the surface." },
    { key: "tintR", label: "Tint R", min: 0.2, max: 2.0, step: 0.05, default: 1.0, description: "Red channel of the global tint." },
    { key: "tintG", label: "Tint G", min: 0.2, max: 2.0, step: 0.05, default: 1.0, description: "Green channel of the global tint." },
    { key: "tintB", label: "Tint B", min: 0.2, max: 2.0, step: 0.05, default: 1.0, description: "Blue channel of the global tint." },

    { key: "textureScale", label: "Texture Scale", min: 0.05, max: 5.0, step: 0.05, default: 2.0, description: "Tiling size of the fixed surface texture." },
    { key: "textureMix", label: "Texture Mix", min: 0.0, max: 1.0, step: 0.05, default: 0.35, description: "Blend between procedural ground and pure texture." },
    { key: "textureOpacity", label: "Texture Opacity", min: 0.0, max: 1.0, step: 0.05, default: 1.0, description: "Opacity of the surface texture." },
    { key: "textureContrast", label: "Texture Contrast", min: 1.0, max: 2.0, step: 0.05, default: 1.2, description: "Contrast of the surface texture." },
    { key: "textureBrightness", label: "Texture Brightness", min: 0.1, max: 3.0, step: 0.05, default: 1.0, description: "Brightness of the surface texture before blending with the procedural ground." },
    { key: "textureSharpness", label: "Texture Sharpness", min: 0.0, max: 2.0, step: 0.05, default: 0.45, description: "Sharpening of the surface texture." },

    { key: "renderDistance", label: "Render Distance", min: 40.0, max: 15000.0, step: 10.0, default: 900.0, description: "Base terrain render distance. At higher altitude the composer expands this automatically." }
  ],

  heightAtWorld({ x, z, params }) {
    const baseHeight = params.baseHeight;
    const heightScale = params.heightScale;
    const featureScale = Math.max(0.0001, params.featureScale);
    const warp = params.warp;
    const heightWarp = params.heightWarp;
    const ridgeSharpness = Math.max(0.001, params.ridgeSharpness);

    const baseP = {
      x: x / featureScale,
      y: z / featureScale
    };

    function rot(ax, ay, angle) {
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      return {
        x: ax * c - ay * s,
        y: ax * s + ay * c
      };
    }

    function mix(a, b, t) {
      return a + (b - a) * t;
    }

    function warpCoords(ax, ay, warpAmount) {
      const broadX =
        Math.sin(ay * 0.0065 + ax * 0.0021) * 1.65 +
        Math.sin((ax + ay) * 0.0042 + 1.7) * 1.25;

      const broadY =
        Math.sin(ax * 0.0058 - ay * 0.0019 + 2.4) * 1.65 -
        Math.sin((ax - ay) * 0.0048 - 0.8) * 1.25;

      const midX =
        Math.sin(ay * 0.018) * 0.95 +
        Math.sin((ax + ay) * 0.012) * 0.75;

      const midY =
        Math.sin(ax * 0.016) * 0.95 -
        Math.sin((ax - ay) * 0.014) * 0.75;

      const localX =
        Math.sin(ay * 0.055) * 0.35 +
        Math.sin((ax + ay) * 0.023) * 0.30;

      const localY =
        Math.sin(ax * 0.048) * 0.35 -
        Math.sin((ax - ay) * 0.027) * 0.30;

      const wx = broadX + midX + localX;
      const wy = broadY + midY + localY;

      return {
        x: ax + wx * warpAmount * 1.55,
        y: ay + wy * warpAmount * 1.55
      };
    }

    function heightWarpValue(p, amount) {
      const broad =
        Math.sin(p.x * 0.0048 + p.y * 0.0026 + 0.7) * 1.20 +
        Math.sin(p.x * -0.0037 + p.y * 0.0054 - 1.9) * 0.95;

      const mid =
        Math.sin(p.x * 0.0105 + p.y * 0.0068 + 2.1) * 0.70 +
        Math.sin(p.x * -0.0082 + p.y * 0.0135 - 0.4) * 0.55;

      const local =
        Math.sin(p.x * 0.031 + p.y * 0.017) * 0.32 +
        Math.sin(p.x * -0.014 + p.y * 0.038) * 0.24;

      return (broad + mid + local) * amount;
    }

    function redBasis(ax, ay, scale) {
      const vx = ax * 0.18 * scale;
      const vy = ay * 0.18 * scale;
      const vz = (ax * 0.05 - ay * 0.04) * scale;

      const sx = Math.sin(vx / (0.9 + 0.3 * scale));
      const sy = Math.sin(vy / (1.2 + 0.2 * scale));
      const sz = Math.sin(vz / (1.5 + 0.1 * scale));

      return Math.abs(
        sx * 0.62 +
        sy * 0.81 +
        sz * 0.47
      );
    }

    function octave(basePoint, warpedPoint, freq, angle, scale, warpMix, power, amplitude) {
      const pb = rot(basePoint.x * freq, basePoint.y * freq, angle);
      const pw = rot(warpedPoint.x * freq, warpedPoint.y * freq, angle);

      const sx = mix(pb.x, pw.x, warpMix);
      const sy = mix(pb.y, pw.y, warpMix);

      return Math.pow(redBasis(sx, sy, scale), ridgeSharpness * power) * amplitude;
    }

    const warpedP = warpCoords(baseP.x, baseP.y, warp);

    let h = 0.0;

    h += octave(baseP, warpedP, 1.0, 0.0, 1.0, 1.00, 1.00, 2.40);
    h += octave(baseP, warpedP, 1.7, 0.65, 1.8, 0.42, 0.85, 1.20);
    h += octave(baseP, warpedP, 1.9, -0.85, 2.6, 0.18, 0.70, 0.55);

    h -= 1.35;
    h += heightWarpValue(baseP, heightWarp);

    return baseHeight + h * heightScale;
  },

  glsl: `
float terrainEnabled() {
  return 1.0;
}

vec2 rockyRot(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float rockyBasis(vec2 p, float scale) {
  vec3 v = vec3(
    p.x * 0.18 * scale,
    p.y * 0.18 * scale,
    (p.x * 0.05 - p.y * 0.04) * scale
  );

  vec3 div = vec3(
    0.9 + 0.3 * scale,
    1.2 + 0.2 * scale,
    1.5 + 0.1 * scale
  );

  vec3 s = sin(v / div);
  return abs(dot(s, vec3(0.62, 0.81, 0.47)));
}

vec2 rockyWarp(vec2 p, float warp) {
  vec2 broad = vec2(
    sin(p.y * 0.0065 + p.x * 0.0021) * 1.65 +
    sin((p.x + p.y) * 0.0042 + 1.7) * 1.25,

    sin(p.x * 0.0058 - p.y * 0.0019 + 2.4) * 1.65 -
    sin((p.x - p.y) * 0.0048 - 0.8) * 1.25
  );

  vec2 mid = vec2(
    sin(p.y * 0.018) * 0.95 +
    sin((p.x + p.y) * 0.012) * 0.75,

    sin(p.x * 0.016) * 0.95 -
    sin((p.x - p.y) * 0.014) * 0.75
  );

  vec2 local = vec2(
    sin(p.y * 0.055) * 0.35 +
    sin((p.x + p.y) * 0.023) * 0.30,

    sin(p.x * 0.048) * 0.35 -
    sin((p.x - p.y) * 0.027) * 0.30
  );

  vec2 w = broad + mid + local;

  return p + w * warp * 1.55;
}

float rockyHeightWarp(vec2 p, float heightWarp) {
  float broad =
    sin(p.x * 0.0048 + p.y * 0.0026 + 0.7) * 1.20 +
    sin(p.x * -0.0037 + p.y * 0.0054 - 1.9) * 0.95;

  float mid =
    sin(p.x * 0.0105 + p.y * 0.0068 + 2.1) * 0.70 +
    sin(p.x * -0.0082 + p.y * 0.0135 - 0.4) * 0.55;

  float local =
    sin(p.x * 0.031 + p.y * 0.017) * 0.32 +
    sin(p.x * -0.014 + p.y * 0.038) * 0.24;

  return (broad + mid + local) * heightWarp;
}

vec2 rockyOctaveDomain(
  vec2 baseP,
  vec2 warpedP,
  float freq,
  float angle,
  float warpMix
) {
  vec2 pb = rockyRot(baseP * freq, angle);
  vec2 pw = rockyRot(warpedP * freq, angle);
  return mix(pb, pw, warpMix);
}

float rockyHeightRaw(vec2 baseP, vec2 warpedP) {
  float ridgeSharpness = max(0.001, terrainParam(5));
  float h = 0.0;

  vec2 p0 = mix(baseP, warpedP, 1.0);
  float b0 = rockyBasis(p0, 1.0);
  h += pow(b0, ridgeSharpness) * 2.4;

  vec2 p1 = rockyOctaveDomain(baseP, warpedP, 1.7, 0.65, 0.42);
  float b1 = rockyBasis(p1, 1.8);
  h += pow(b1, ridgeSharpness * 0.85) * 1.2;

  vec2 p2 = rockyOctaveDomain(baseP, warpedP, 1.9, -0.85, 0.18);
  float b2 = rockyBasis(p2, 2.6);
  h += pow(b2, ridgeSharpness * 0.7) * 0.55;

  return h - 1.35;
}

float rockyViewLod(vec3 worldPos) {
  float d = distance(worldPos, uCamPos);

  const float ROCKY_ALBEDO_LOD_START = 180.0;
  const float ROCKY_ALBEDO_LOD_END = 900.0;

  return smoothstep(ROCKY_ALBEDO_LOD_START, ROCKY_ALBEDO_LOD_END, d);
}

float terrainHeight(vec2 xz, float time) {
  float baseHeight = terrainParam(0);
  float heightScale = terrainParam(1);
  float featureScale = max(0.0001, terrainParam(2));
  float warp = terrainParam(3);
  float heightWarp = terrainParam(4);

  vec2 baseP = xz / featureScale;
  vec2 warpedP = rockyWarp(baseP, warp);

  float h = rockyHeightRaw(baseP, warpedP);
  h += rockyHeightWarp(baseP, heightWarp);

  return baseHeight + h * heightScale;
}

float terrainRenderDistance() {
  return terrainParam(19);
}

vec3 applySaturation(vec3 col, float saturation) {
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luma), col, saturation);
}

vec3 applyHueShift(vec3 color, float angle) {
  vec3 k = normalize(vec3(1.0, 1.0, 1.0));
  float c = cos(angle);
  float s = sin(angle);
  return color * c + cross(k, color) * s + k * dot(k, color) * (1.0 - c);
}

vec3 applyContrast(vec3 col, float contrast) {
  return clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
}

vec3 sampleSurfaceTexture(vec2 uv, float sharpness) {
  vec3 c = texture2D(uSurfaceTex, uv).rgb;

  if (sharpness <= 0.001) {
    return c;
  }

  vec2 texel = vec2(0.0025);

  vec3 n = texture2D(uSurfaceTex, uv + vec2(0.0, texel.y)).rgb;
  vec3 s = texture2D(uSurfaceTex, uv - vec2(0.0, texel.y)).rgb;
  vec3 e = texture2D(uSurfaceTex, uv + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture2D(uSurfaceTex, uv - vec2(texel.x, 0.0)).rgb;

  vec3 blur = (n + s + e + w) * 0.25;
  vec3 sharpened = c + (c - blur) * sharpness;

  return clamp(sharpened, 0.0, 1.0);
}

vec3 rockyAlbedo(vec3 worldPos, vec3 normal) {
  float featureScale = max(0.0001, terrainParam(2));
  float colorContrast = terrainParam(6);
  float brightness = terrainParam(7);
  float saturation = terrainParam(8);
  float hue = terrainParam(9);

  vec3 tint = vec3(terrainParam(10), terrainParam(11), terrainParam(12));

  float textureScale = terrainParam(13);
  float textureMix = terrainParam(14);
  float textureOpacity = terrainParam(15);
  float textureContrast = terrainParam(16);
  float textureBrightness = terrainParam(17);
  float textureSharpness = terrainParam(18);

  float viewLod = rockyViewLod(worldPos);

  vec2 p = worldPos.xz / featureScale;
  float macro = rockyBasis(p * 0.22, 1.0);
  float mid = rockyBasis(rockyRot(p * 0.85, 0.45), 1.6);

  float fine = 0.0;

  if (viewLod < 0.98) {
    fine = rockyBasis(rockyRot(p * 1.8, -0.7), 2.4);
    fine *= 1.0 - viewLod;
  }

  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float heightTone = clamp(worldPos.y * 0.08 + 0.5, 0.0, 1.0);

  vec3 dark = vec3(0.18, 0.07, 0.05);
  vec3 midCol = vec3(0.42, 0.15, 0.09);
  vec3 light = vec3(0.80, 0.34, 0.14);

  float rockMix = clamp(
    macro * mix(0.58, 0.72, viewLod) +
    mid * mix(0.42, 0.28, viewLod) +
    fine * 0.10,
    0.0,
    1.0
  );

  vec3 col = mix(dark, midCol, rockMix);

  col = mix(
    col,
    light,
    clamp(max(normal.y, 0.0) * sqrt(max(normal.y, 0.0)) * 0.75 + heightTone * 0.25, 0.0, 1.0)
  );

  col += vec3(0.08, 0.03, 0.02) * slope * 0.65;

  col = applyContrast(col, colorContrast);
  col *= brightness;

  if (abs(hue) > 0.001) {
    col = applyHueShift(col, hue);
  }

  col *= tint;

  if (abs(saturation - 1.0) > 0.001) {
    col = applySaturation(col, saturation);
  }

  float texAmount = clamp(textureMix * textureOpacity, 0.0, 1.0);

  if (uHasSurfaceTex > 0.5 && texAmount > 0.001) {
    vec2 uv = worldPos.xz * (0.02 * textureScale);
    float lodTextureSharpness = textureSharpness * (1.0 - viewLod);

    vec3 texCol = sampleSurfaceTexture(uv, lodTextureSharpness);
    texCol = applyContrast(texCol, textureContrast);
    texCol *= textureBrightness;
    texCol = clamp(texCol, 0.0, 1.0);

    float lodTexAmount = texAmount * mix(1.0, 0.88, viewLod);
    col = mix(col, texCol, lodTexAmount);
  }

  return clamp(col, 0.0, 1.0);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  return rockyAlbedo(worldPos, normal);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  return vec3(0.0);
}
`,

};