export const volcanicTerrainShader = {
  id: "volcanic",
  label: "Volcanic",
  description: "Dark obsidian terrain with animated lava veins and ember glow, driven by tex/noise_sw.png.",

  preferredSurfaceTextureId: "noise-sw",

  params: [
    { key: "baseHeight", label: "Base Height", min: -30.0, max: 30.0, step: 0.1, default: 0.0, description: "Vertical offset of the volcanic surface." },
    { key: "heightScale", label: "Height Scale", min: 0.5, max: 5.0, step: 0.05, default: 1.4, description: "Overall terrain height multiplier." },
    { key: "featureScale", label: "Feature Scale", min: 1.0, max: 10.0, step: 0.05, default: 1.7, description: "Size of terrain features." },
    { key: "terrainScale", label: "Terrain Scale", min: 15.0, max: 150.0, step: 1.0, default: 65.0, description: "Internal heightfield scale." },
    { key: "terrainFreq", label: "Terrain Freq", min: 0.001, max: 0.002, step: 0.0001, default: 0.0014, description: "Base frequency of volcanic terrain noise." },
    { key: "ridgeSharpness", label: "Sharpness", min: 0.05, max: 1.5, step: 0.01, default: 0.35, description: "Sharpness of volcanic ridges and plateaus." },
    { key: "terrainOffset", label: "Offset", min: 0.1, max: 1.0, step: 0.01, default: 0.65, description: "Cuts lower terrain into lava basin regions." },

    { key: "lavaLevel", label: "Lava Level", min: -20.0, max: 20.0, step: 0.1, default: 4.0, description: "Height level where lava becomes visible." },
    { key: "lavaGlow", label: "Lava Glow", min: 1.0, max: 15.0, step: 0.05, default: 5.0, description: "Emission strength of lava." },
    { key: "lavaThreshold", label: "Lava Veins", min: 0.15, max: 0.95, step: 0.01, default: 0.58, description: "Lower values create more lava veins." },
    { key: "lavaScale", label: "Lava Scale", min: 0.1, max: 10.0, step: 0.05, default: 1.0, description: "Scale of lava flow patterns." },
    { key: "lavaSpeed", label: "Lava Speed", min: 0.0, max: 4.0, step: 0.01, default: 1.0, description: "Animation speed of flowing lava." },

    { key: "emberAmount", label: "Embers", min: 0.0, max: 2.0, step: 0.05, default: 1.0, description: "Small hot speckle emission on the surface." },
    { key: "emberScale", label: "Ember Scale", min: 0.25, max: 2.0, step: 0.05, default: 2.0, description: "Density of ember speckles." },

    { key: "rockBrightness", label: "Rock Bright", min: 0.2, max: 1.0, step: 0.05, default: 0.75, description: "Brightness of obsidian rock." },
    { key: "rockContrast", label: "Rock Contrast", min: 0.25, max: 1.5, step: 0.05, default: 1.15, description: "Contrast of rock texture." },
    { key: "redHeat", label: "Red Heat", min: 0.0, max: 2.0, step: 0.05, default: 0.55, description: "Subtle red-orange hot rock tint near lava." },
    { key: "hue", label: "Surface Hue", min: -3.14, max: 3.14, step: 0.01, default: 0.0, description: "Hue shift of rock and lava colors." },

    { key: "textureScale", label: "Texture Scale", min: 0.2, max: 12.0, step: 0.05, default: 2.4, description: "Scale of tex/noise_sw.png detail." },
    { key: "textureMix", label: "Texture Mix", min: 0.0, max: 1.0, step: 0.05, default: 0.65, description: "How strongly the surface texture affects rock and lava." },

    { key: "renderDistance", label: "Render Distance", min: 80.0, max: 15000.0, step: 10.0, default: 760.0, description: "Maximum distance up to which terrain is rendered." },

    { key: "warp", label: "Warp XZ", min: 0.0, max: 10.0, step: 0.05, default: 0.0, description: "Large-scale sideways deformation of the volcanic terrain." },
    { key: "heightWarp", label: "Height Warp", min: 0.0, max: 200.0, step: 0.1, default: 0.0, description: "Large-scale height modulation of the volcanic terrain." }
  ],

  heightAtWorld({ x, z, params }) {
    const baseHeight = params.baseHeight;
    const heightScale = params.heightScale;
    const featureScale = Math.max(0.0001, params.featureScale);
    const terrainScale = params.terrainScale;
    const terrainFreq = params.terrainFreq;
    const ridgeSharpness = Math.max(0.001, params.ridgeSharpness);
    const terrainOffset = params.terrainOffset;
    const warp = Math.max(0, Number(params.warp ?? 0.0));
    const heightWarp = Math.max(0, Number(params.heightWarp ?? 0.0));

    function hash(ax, ay) {
      const s = Math.sin(ax * 12.9898 + ay * 78.233) * 43758.5453;
      return s - Math.floor(s);
    }

    function smoothNoise(ax, ay) {
      const ix = Math.floor(ax);
      const iy = Math.floor(ay);
      const fx = ax - ix;
      const fy = ay - iy;
      const ux = fx * fx * (3.0 - 2.0 * fx);
      const uy = fy * fy * (3.0 - 2.0 * fy);
      const a = hash(ix, iy);
      const b = hash(ix + 1, iy);
      const c = hash(ix, iy + 1);
      const d = hash(ix + 1, iy + 1);
      return a + (b - a) * ux + (c + (d - c) * ux - a - (b - a) * ux) * uy;
    }

    function warpCoords(ax, ay, amount) {
      if (amount <= 0.0001) {
        return { x: ax, y: ay };
      }

      const pX = ax * 0.0009;
      const pY = ay * 0.0009;
      const wx = smoothNoise(pX + 17.1, pY - 8.4) * 2.0 - 1.0;
      const wy = smoothNoise(pX - 23.7, pY + 31.6) * 2.0 - 1.0;

      return {
        x: ax + wx * amount * 18.0,
        y: ay + wy * amount * 18.0
      };
    }

    function heightWarpValue(ax, ay, amount) {
      if (amount <= 0.0001) {
        return 0.0;
      }

      const pX = ax * 0.0012;
      const pY = ay * 0.0012;
      const broad =
        (smoothNoise(pX + 11.7, pY - 4.1) * 2.0 - 1.0) * 0.62 +
        (smoothNoise(pX * 2.2 - 8.8, pY * 2.2 + 19.3) * 2.0 - 1.0) * 0.38;

      return broad * amount * 0.12;
    }

    const warped = warpCoords(x, z, warp);
    const px = warped.x / featureScale;
    const pz = warped.y / featureScale;

    // JS-seitig: 6 statt 8 Oktaven (heightAtWorld läuft auf CPU, jede Ersparnis zählt)
    let noiseVal = 0.0;
    let amplitude = 1.0;
    let freq = terrainFreq;

    for (let i = 0; i < 6; i++) {
      noiseVal += amplitude * smoothNoise(px * freq, pz * freq);
      amplitude *= 0.5;
      freq *= 2.0;
    }

    noiseVal -= terrainOffset;
    noiseVal = Math.min(1.5, Math.max(0.0, noiseVal));
    noiseVal = Math.pow(ridgeSharpness, noiseVal);
    noiseVal = 1.0 - noiseVal;

    return baseHeight + noiseVal * terrainScale * heightScale + heightWarpValue(x, z, heightWarp);
  },

  glsl: `
float terrainEnabled() {
  return 1.0;
}

// ─── Hash & Noise ───────────────────────────────────────────────────────────

float volcanicHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float volcanicNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(volcanicHash12(i),             volcanicHash12(i + vec2(1.0, 0.0)), u.x),
    mix(volcanicHash12(i + vec2(0.0, 1.0)), volcanicHash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

mat2 volcanicRot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec2 volcanicWarpXZ(vec2 xz, float warp) {
  if (warp <= 0.001) {
    return xz;
  }

  vec2 p = xz * 0.0009;
  vec2 w = vec2(
    volcanicNoise(p + vec2(17.1, -8.4)),
    volcanicNoise(p + vec2(-23.7, 31.6))
  ) * 2.0 - 1.0;

  return xz + w * warp * 18.0;
}

float volcanicHeightWarp(vec2 xz, float heightWarp) {
  if (heightWarp <= 0.001) {
    return 0.0;
  }

  vec2 p = xz * 0.0012;
  float broad =
    (volcanicNoise(p + vec2(11.7, -4.1)) * 2.0 - 1.0) * 0.62 +
    (volcanicNoise(p * 2.2 + vec2(-8.8, 19.3)) * 2.0 - 1.0) * 0.38;

  return broad * heightWarp * 0.12;
}

// ─── Terrain ────────────────────────────────────────────────────────────────

float volcanicTerrainField(vec2 xz) {
  float featureScale   = max(0.0001, terrainParam(2));
  float terrainScale   = terrainParam(3);
  float terrainFreq    = terrainParam(4);
  float ridgeSharpness = max(0.001, terrainParam(5));
  float terrainOffset  = terrainParam(6);
  float warp = clamp(terrainParam(21), 0.0, 10.0);

  vec2 warpedXz = volcanicWarpXZ(xz, warp);
  vec2 p = warpedXz / featureScale;

  float noiseVal  = 0.0;
  float amplitude = 1.0;
  float freq      = terrainFreq;

  // OPT: 6 Oktaven statt 8 — die letzten 2 tragen <3 % zur sichtbaren
  //      Höhe bei, kosten aber 25 % der Loop-Zeit.
  // OPT: Domain-Warp nur in den ersten 3 (groben) Oktaven anwenden.
  //      In den feinen Oktaven ist der Warp sub-pixel und damit unsichtbar.
  for (int i = 0; i < 6; i++) {
    vec2 q = p * freq;
    if (i < 3) {
      q += vec2(
        sin(p.y * 0.018 + float(i) * 1.7),
        cos(p.x * 0.021 - float(i) * 1.3)
      ) * 0.65;
    }
    noiseVal  += amplitude * volcanicNoise(q);
    amplitude *= 0.5;
    freq      *= 2.0;
  }

  noiseVal -= terrainOffset;
  noiseVal  = clamp(noiseVal, 0.0, 1.5);
  noiseVal  = pow(ridgeSharpness, noiseVal);
  noiseVal  = 1.0 - noiseVal;

  float broad =
    sin(p.x *  0.018 + p.y * 0.010) * 0.55 +
    sin(p.x * -0.013 + p.y * 0.026) * 0.45;

  return noiseVal * terrainScale + broad * terrainScale * 0.055;
}

float terrainHeight(vec2 xz, float time) {
  time += 0.0;
  float baseHeight  = terrainParam(0);
  float heightScale = terrainParam(1);
  float heightWarp = clamp(terrainParam(22), 0.0, 200.0);
  return baseHeight + volcanicTerrainField(xz) * heightScale + volcanicHeightWarp(xz, heightWarp);
}

float terrainRenderDistance() {
  return terrainParam(20);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

vec3 volcanicApplyContrast(vec3 col, float contrast) {
  return clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
}

float volcanicTextureNoise(vec2 p) {
  float procedural = volcanicNoise(p);
  float textureScale = max(0.001, terrainParam(18));
  float textureMix = clamp(terrainParam(19), 0.0, 1.0);

  if (uHasSurfaceTex < 0.5 || textureMix <= 0.001) {
    return procedural;
  }

  float tex = texture2D(uSurfaceTex, p * 0.02 * textureScale).r;
  return mix(procedural, tex, textureMix);
}

// OPT: Asymmetrische Finite-Difference — 2 statt 4 Noise-Calls pro Gradient.
//      Größeres Epsilon (0.35) kompensiert den leichten Präzisionsverlust;
//      der Lava-Warp-Effekt bleibt visuell identisch.
vec2 volcanicGrad(vec2 p) {
  const float ep = 0.35;
  float c  = volcanicNoise(p);
  float gx = volcanicNoise(vec2(p.x + ep, p.y)) - c;
  float gy = volcanicNoise(vec2(p.x, p.y + ep)) - c;
  return vec2(gx, gy);
}

// OPT: 3 statt 4 FBM-Iterationen.
//      Die 4. Iteration addiert hochfrequentes Detail, das durch die
//      Lava-Threshold-Smoothstep ohnehin weggeblurred wird.
//      Ersparnis: ~25 % der gesamten FBM-Kosten.
float volcanicFlowFBM(vec2 p, float time) {
  float z  = 2.0;
  float rz = 0.0;
  vec2 bp  = p;

  for (int i = 1; i < 4; i++) {
    float fi = float(i);
    p  += time * 0.012;
    bp += time * 0.00014;

    vec2 gr = volcanicGrad(fi * p * 1.35 + time * 0.12);
    gr *= volcanicRot(time * 1.7 - (0.045 * p.x + 0.027 * p.y) * 32.0);
    p += gr * 0.42;

    float n = volcanicNoise(p);
    rz += (sin(n * 7.0) * 0.5 + 0.5) / z;

    p   = mix(bp, p, 0.74);
    z  *= 1.55;
    p  *= 2.65;
    bp *= 1.45;
  }
  return rz;
}

vec3 volcanicHueRotate(vec3 col, float hueShift) {
  float ss = sin(hueShift);
  float cc = cos(hueShift);
  mat3 m = mat3(
    vec3(0.213 + cc * 0.787 - ss * 0.213, 0.213 - cc * 0.213 + ss * 0.143, 0.213 - cc * 0.213 - ss * 0.787),
    vec3(0.715 - cc * 0.715 - ss * 0.715, 0.715 + cc * 0.285 + ss * 0.140, 0.715 - cc * 0.715 + ss * 0.715),
    vec3(0.072 - cc * 0.072 + ss * 0.928, 0.072 - cc * 0.072 - ss * 0.283, 0.072 + cc * 0.928 + ss * 0.072)
  );
  return clamp(m * col, 0.0, 8.0);
}

vec3 volcanicBlackbody(float t) {
  t *= 2200.0;
  float u = (0.860117757 + 1.54118254e-4 * t + 1.28641212e-7 * t * t)
           / (1.0 + 8.42420235e-4 * t + 7.08145163e-7 * t * t);
  float v = (0.317398726 + 4.22806245e-5 * t + 4.20481691e-8 * t * t)
           / (1.0 - 2.89741816e-5 * t + 1.61456053e-7 * t * t);
  float x = 3.0 * u / (2.0 * u - 8.0 * v + 4.0);
  float y = 2.0 * v / (2.0 * u - 8.0 * v + 4.0);
  float z = 1.0 - x - y;
  float Y = 1.0;
  float X = Y / max(y, 0.0001) * x;
  float Z = Y / max(y, 0.0001) * z;
  mat3 XYZtoRGB = mat3(
     3.2404542, -1.5371385, -0.4985314,
    -0.9692660,  1.8760108,  0.0415560,
     0.0556434, -0.2040259,  1.0572252
  );
  return max(vec3(0.0), (vec3(X, Y, Z) * XYZtoRGB) * pow(t * 0.0004, 4.0));
}

// ─── Animated lava mask / flow ──────────────────────────────────────────────
//
// This is the expensive animated lava path.
// Keep it out of terrainColor(); terrainColor uses volcanicCheapHeatMask()
// so volcanicFlowFBM() only runs for terrainEmission().
  	
float volcanicLavaMaskAndFlow(vec3 worldPos, vec3 normal, float time,
                               out float outFlow, out vec3 outLavaCol) {
  float lavaLevel     = terrainParam(7);
  float lavaThreshold = terrainParam(9);
  float lavaScale     = max(0.001, terrainParam(10));
  float lavaSpeed     = terrainParam(11);

  float lowMask   = 1.0 - smoothstep(lavaLevel, lavaLevel + 16.0, worldPos.y);
  float slope     = 1.0 - clamp(normal.y, 0.0, 1.0);
  float slopeMask = smoothstep(0.10, 0.82, slope);

  vec2 p = worldPos.xz * 0.005 * lavaScale;
  float flow = volcanicFlowFBM(p, time * 0.1 * lavaSpeed);
  outFlow = flow;

  float veins = smoothstep(lavaThreshold, 1.0, flow);

  float cracksA = volcanicNoise(worldPos.xz * 0.022 * lavaScale);
  float cracksB = volcanicNoise(worldPos.xz * 0.061 * lavaScale + vec2(17.3, 4.9));
  float cracks = smoothstep(0.68, 1.0, cracksA * 0.65 + cracksB * 0.45);

  float mask = clamp(max(veins * lowMask, cracks * slopeMask * 0.75), 0.0, 1.0);

  vec3 lavaCol = volcanicBlackbody(clamp(flow, 0.0, 1.0));
  outLavaCol = max(lavaCol, vec3(1.0, 0.28, 0.035));

  return mask;
}

float volcanicEmberMask(vec3 worldPos, float time) {
  float emberScale = max(0.001, terrainParam(13));
  vec2 p = worldPos.xz * 0.035 * emberScale;

  float n1 = volcanicNoise(p + vec2(time * 0.18, -time * 0.50));
  float n2 = volcanicNoise(p * 2.7 + vec2(-time * 0.21, time * 0.36));

  return smoothstep(0.86, 1.0, n1 * 0.65 + n2 * 0.55);
}

float volcanicCheapHeatMask(vec3 worldPos, vec3 normal) {
  float lavaLevel = terrainParam(7);
  float lavaScale = max(0.001, terrainParam(10));

  float lowMask = 1.0 - smoothstep(lavaLevel, lavaLevel + 16.0, worldPos.y);

  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);
  float slopeMask = smoothstep(0.10, 0.82, slope);

  float cracksA = volcanicNoise(worldPos.xz * 0.022 * lavaScale);
  float cracksB = volcanicNoise(worldPos.xz * 0.061 * lavaScale + vec2(17.3, 4.9));
  float cracks = smoothstep(0.68, 1.0, cracksA * 0.65 + cracksB * 0.45);

  return clamp(max(lowMask * 0.65, cracks * slopeMask), 0.0, 1.0);
}

// ─── terrainColor & terrainEmission ────────────────────────────────────────

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  time += 0.0;

  float rockBrightness = terrainParam(14);
  float rockContrast = terrainParam(15);
  float redHeat = terrainParam(16);
  float hue = terrainParam(17);
  float lavaScale = max(0.001, terrainParam(10));

  float tex =
    volcanicNoise(worldPos.xz * 0.46 * lavaScale) * 0.55 +
    volcanicNoise(worldPos.xz * 1.12 * lavaScale + vec2(9.2, -4.7)) * 0.30 +
    volcanicNoise(worldPos.xz * 2.40 * lavaScale + vec2(-3.1, 13.4)) * 0.15;

  float macro = volcanicNoise(worldPos.xz * 0.012);
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);

  vec3 obsidianDark = vec3(0.025, 0.024, 0.022);
  vec3 obsidianMid = vec3(0.105, 0.095, 0.085);
  vec3 ash = vec3(0.20, 0.17, 0.135);

  vec3 rock = mix(obsidianDark, obsidianMid, tex);
  rock = mix(rock, ash, macro * 0.22 + slope * 0.18);
  rock = volcanicApplyContrast(rock, rockContrast);
  rock *= rockBrightness;

  float lavaMask = volcanicCheapHeatMask(worldPos, normal);
  vec3 heatTint = vec3(0.75, 0.16, 0.025) * lavaMask * redHeat;

  rock += heatTint;

  rock = volcanicHueRotate(rock, hue);

  return clamp(rock, 0.0, 1.0);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  float lavaGlow = terrainParam(8);
  float emberAmount = terrainParam(12);

  float flow;
  vec3 lavaCol;
  float lavaMask = volcanicLavaMaskAndFlow(worldPos, normal, time, flow, lavaCol);

  float pulse = 0.82 + 0.18 * sin(time * 2.5 + flow * 12.0);
  vec3 lava = lavaCol * lavaMask * lavaGlow * pulse;

  float ember = volcanicEmberMask(worldPos, time) * emberAmount;
  vec3 embers = vec3(1.0, 0.32, 0.035) * ember * (0.25 + lavaMask * 0.55);

  float hue = terrainParam(17);
  return volcanicHueRotate(lava + embers, hue);
}
`
};