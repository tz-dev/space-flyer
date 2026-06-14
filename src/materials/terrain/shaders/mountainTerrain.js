export const mountainTerrainShader = {
  id: "mountain",
  label: "Mountain",
  description: "Lightweight layered-noise mountain terrain inspired by the provided raymarched bump-plane shader. Minimal controls, fast Planet-Flyer adaptation.",

  params: [
    { key: "baseHeight", label: "Base Height", min: -2000.0, max: 350.0, step: 1.0, default: 0.0 },

    { key: "heightScale", label: "Height Scale", min: 10.0, max: 250.0, step: 0.5, default: 70.0 },
    { key: "featureScale", label: "Feature Scale", min: 200.0, max: 600.0, step: 0.5, default: 200.0 },
    { key: "bumpStrength", label: "Bump Strength", min: 0.1, max: 1.0, step: 0.01, default: 0.75 },

    { key: "regionScale", label: "Region Scale", min: 1.0, max: 24.0, step: 0.1, default: 6.0 },
    { key: "regionAmount", label: "Region Amount", min: 0.0, max: 2.0, step: 0.01, default: 0.45 },

    { key: "rockContrast", label: "Rock Contrast", min: 0.5, max: 1.0, step: 0.01, default: 1.0 },
    { key: "ambient", label: "Ambient", min: 0.02, max: 0.5, step: 0.01, default: 0.16 },
    { key: "distanceTint", label: "Distance Tint", min: 0.0, max: 1.0, step: 0.01, default: 0.22 },

    { key: "surfaceHue", label: "Surface Hue", min: -0.5, max: 0.5, step: 0.01, default: 0.0 },
    { key: "surfaceSaturation", label: "Surface Saturation", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "tintR", label: "Tint R", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "tintG", label: "Tint G", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },
    { key: "tintB", label: "Tint B", min: 0.0, max: 2.0, step: 0.01, default: 1.0 },

    { key: "textureMix", label: "Texture Mix", min: 0.0, max: 1.0, step: 0.01, default: 0.0 },
    { key: "textureScale", label: "Texture Scale", min: 0.05, max: 10.0, step: 0.01, default: 1.0 },
    { key: "textureSharpness", label: "Texture Sharpness", min: 0.0, max: 2.0, step: 0.01, default: 0.35 },
    { key: "textureBrightness", label: "Texture Brightness", min: 0.1, max: 3.0, step: 0.01, default: 1.0 },
    { key: "textureContrast", label: "Texture Contrast", min: 0.2, max: 3.0, step: 0.01, default: 1.15 },

    { key: "renderDistance", label: "Render Distance", min: 80.0, max: 15000.0, step: 20.0, default: 2200.0 },
    { key: "quality", label: "Quality", min: 0.0, max: 1.0, step: 0.01, default: 0.45 }
  ],

  heightAtWorld({ x, z, params }) {
    const baseHeight = Number(params.baseHeight ?? 0.0);
    const heightScale = Number(params.heightScale ?? 70.0);
    const featureScale = Math.max(0.0001, Number(params.featureScale ?? 180.0));
    const bumpStrength = Number(params.bumpStrength ?? 0.75);
    const regionScale = Math.max(0.001, Number(params.regionScale ?? 6.0));
    const regionAmount = Number(params.regionAmount ?? 0.45);
    const quality = Number(params.quality ?? 0.45);

    function fract(v) {
      return v - Math.floor(v);
    }

    function smoothstep(edge0, edge1, value) {
      const t = Math.max(
        0.0,
        Math.min(1.0, (value - edge0) / Math.max(edge1 - edge0, 0.00001))
      );

      return t * t * (3.0 - 2.0 * t);
    }

    function hash3(px, py, pz) {
      let x = fract(px * 0.3183099 + 0.1);
      let y = fract(py * 0.3183099 + 0.1);
      let z = fract(pz * 0.3183099 + 0.1);

      x *= 17.0;
      y *= 17.0;
      z *= 17.0;

      return fract(x * y * z * (x + y + z));
    }

    function noise3(px, py, pz) {
      const ix = Math.floor(px);
      const iy = Math.floor(py);
      const iz = Math.floor(pz);

      const fx = px - ix;
      const fy = py - iy;
      const fz = pz - iz;

      const ux = fx * fx * (3.0 - 2.0 * fx);
      const uy = fy * fy * (3.0 - 2.0 * fy);
      const uz = fz * fz * (3.0 - 2.0 * fz);

      function h(dx, dy, dz) {
        return hash3(ix + dx, iy + dy, iz + dz);
      }

      const x00 = h(0, 0, 0) * (1.0 - ux) + h(1, 0, 0) * ux;
      const x10 = h(0, 1, 0) * (1.0 - ux) + h(1, 1, 0) * ux;
      const x01 = h(0, 0, 1) * (1.0 - ux) + h(1, 0, 1) * ux;
      const x11 = h(0, 1, 1) * (1.0 - ux) + h(1, 1, 1) * ux;

      const y0 = x00 * (1.0 - uy) + x10 * uy;
      const y1 = x01 * (1.0 - uy) + x11 * uy;

      return y0 * (1.0 - uz) + y1 * uz;
    }

    function layeredNoise(px, py, pz, q) {
      const n0 = 0.70 * noise3(px, py, pz);
      const n1 = 0.20 * noise3(px * 4.0, py * 4.0, pz * 4.0);
      const n2 = 0.07 * noise3(px * 8.0, py * 8.0, pz * 8.0);

      if (q < 0.34) {
        return n0 + n1 + n2;
      }

      const n3 = 0.02 * noise3(px * 16.0, py * 16.0, pz * 16.0);

      if (q < 0.67) {
        return n0 + n1 + n2 + n3;
      }

      const n4 = 0.01 * noise3(px * 32.0, py * 32.0, pz * 32.0);
      return n0 + n1 + n2 + n3 + n4;
    }

    const px = x / featureScale;
    const pz = z / featureScale;

    const regionPx = x / Math.max(0.001, featureScale * regionScale);
    const regionPz = z / Math.max(0.001, featureScale * regionScale);

    const regionA = noise3(regionPx, 0.0, regionPz);
    const regionB = noise3(regionPx * 2.17 + 11.3, 0.0, regionPz * 2.17 - 7.8);

    const region = smoothstep(
      0.18,
      0.92,
      regionA * 0.72 + regionB * 0.28
    );

    const local = layeredNoise(px, 0.0, pz, quality);

    const localGain = 0.45 + region * 0.95 * regionAmount;
    const regionalLift = (region - 0.5) * 0.42 * regionAmount;

    const h = local * bumpStrength * localGain + regionalLift;

    return baseHeight + h * heightScale;
  },


  glsl: `
float terrainEnabled() {
  return 1.0;
}

float mountainQuality() {
  return clamp(terrainParam(20), 0.0, 1.0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(19), 80.0, 15000.0);
}

float mountainHash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float mountainNoise3(vec3 x) {
  vec3 p = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(
      mix(mountainHash3(p + vec3(0.0, 0.0, 0.0)), mountainHash3(p + vec3(1.0, 0.0, 0.0)), f.x),
      mix(mountainHash3(p + vec3(0.0, 1.0, 0.0)), mountainHash3(p + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(mountainHash3(p + vec3(0.0, 0.0, 1.0)), mountainHash3(p + vec3(1.0, 0.0, 1.0)), f.x),
      mix(mountainHash3(p + vec3(0.0, 1.0, 1.0)), mountainHash3(p + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float mountainLayeredNoise(vec3 x) {
  float q = mountainQuality();

  float n0 = 0.70 * mountainNoise3(x);
  float n1 = 0.20 * mountainNoise3(x * 4.0);
  float n2 = 0.07 * mountainNoise3(x * 8.0);

  if (q < 0.34) {
    return n0 + n1 + n2;
  }

  float n3 = 0.02 * mountainNoise3(x * 16.0);

  if (q < 0.67) {
    return n0 + n1 + n2 + n3;
  }

  float n4 = 0.01 * mountainNoise3(x * 32.0);
  return n0 + n1 + n2 + n3 + n4;
}

float mountainRegionMask(vec2 xz, float featureScale, float regionScale) {
  vec2 rp = xz / max(0.001, featureScale * regionScale);

  float regionA = mountainNoise3(vec3(rp.x, 0.0, rp.y));
  float regionB = mountainNoise3(vec3(rp.x * 2.17 + 11.3, 0.0, rp.y * 2.17 - 7.8));

  return smoothstep(0.18, 0.92, regionA * 0.72 + regionB * 0.28);
}

float mountainHeightField(vec2 xz) {
  float featureScale = max(0.0001, terrainParam(2));
  float bumpStrength = terrainParam(3);
  float regionScale = max(0.001, terrainParam(4));
  float regionAmount = terrainParam(5);

  vec3 p = vec3(xz.x / featureScale, 0.0, xz.y / featureScale);

  float region = mountainRegionMask(xz, featureScale, regionScale);
  float local = mountainLayeredNoise(p);

  float localGain = 0.45 + region * 0.95 * regionAmount;
  float regionalLift = (region - 0.5) * 0.42 * regionAmount;

  return local * bumpStrength * localGain + regionalLift;
}

float terrainHeight(vec2 xz, float time) {
  float baseHeight = terrainParam(0);
  float heightScale = terrainParam(1);

  time += 0.0;

  return baseHeight + mountainHeightField(xz) * heightScale;
}

vec3 mountainApplyContrast(vec3 col, float contrast) {
  return clamp((col - 0.5) * contrast + 0.5, 0.0, 1.0);
}

vec3 mountainHueRotate(vec3 col, float hueShift) {
  float angle = hueShift * 6.28318530718;
  float s = sin(angle);
  float c = cos(angle);

  mat3 m = mat3(
    vec3(0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787),
    vec3(0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715),
    vec3(0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072)
  );

  return clamp(m * col, 0.0, 1.0);
}

vec3 mountainApplySurfaceTint(vec3 col) {
  float hue = terrainParam(9);
  float saturation = terrainParam(10);
  vec3 tint = vec3(terrainParam(11), terrainParam(12), terrainParam(13));

  col = mountainHueRotate(col, hue);

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, saturation);

  col *= tint;

  return clamp(col, 0.0, 1.0);
}

vec3 mountainSampleSurfaceTexture(vec2 uv, float sharpness) {
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

float mountainViewLod(vec3 worldPos) {
  float d = distance(worldPos, uCamPos);
  return smoothstep(180.0, 1100.0, d);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  float heightScale = max(0.001, terrainParam(1));
  float rockContrast = terrainParam(6);
  float ambient = terrainParam(7);
  float distanceTint = terrainParam(8);
  float finalSaturation = terrainParam(10);

  float textureMix = clamp(terrainParam(14), 0.0, 1.0);
  float textureScale = terrainParam(15);
  float textureSharpness = terrainParam(16);
  float textureBrightness = terrainParam(17);
  float textureContrast = terrainParam(18);

  time += 0.0;

  vec3 lightDir = normalize(vec3(-1.0, 1.0, -3.0));

  float h = (worldPos.y - terrainParam(0)) / heightScale;
  float height01 = clamp(h * 0.9, 0.0, 1.0);

  float region = mountainRegionMask(
    worldPos.xz,
    max(0.0001, terrainParam(2)),
    max(0.001, terrainParam(4))
  );

  float macro = mountainNoise3(vec3(worldPos.x * 0.006, 0.0, worldPos.z * 0.006));
  float detail = mountainNoise3(vec3(worldPos.x * 0.025, 0.0, worldPos.z * 0.025));
  float slope = 1.0 - clamp(normal.y, 0.0, 1.0);

  vec3 darkRock = vec3(0.22, 0.22, 0.22);
  vec3 midRock = vec3(0.48, 0.47, 0.45);
  vec3 brightRock = vec3(0.72, 0.71, 0.68);
  vec3 basinRock = vec3(0.16, 0.17, 0.18);
  vec3 highlandRock = vec3(0.64, 0.62, 0.58);

  vec3 albedo = mix(darkRock, midRock, smoothstep(0.02, 0.40, height01 + macro * 0.15));
  albedo = mix(albedo, brightRock, smoothstep(0.35, 0.95, height01 + detail * 0.12));
  albedo = mix(albedo, basinRock, (1.0 - region) * 0.18);
  albedo = mix(albedo, highlandRock, region * 0.12);

  albedo *= 0.88 + detail * 0.22;
  albedo = mix(albedo, darkRock * 0.85, slope * 0.28);

  albedo = mountainApplyContrast(albedo, rockContrast);

  if (uHasSurfaceTex > 0.5 && textureMix > 0.001) {
    float viewLod = mountainViewLod(worldPos);
    vec2 uv = worldPos.xz * 0.02 * max(0.001, textureScale);

    vec3 texCol = mountainSampleSurfaceTexture(
      uv,
      textureSharpness * (1.0 - viewLod)
    );

    texCol = mountainApplyContrast(texCol, textureContrast);
    texCol *= textureBrightness;
    texCol = clamp(texCol, 0.0, 1.0);

    float lodTexMix = textureMix * mix(1.0, 0.88, viewLod);
    albedo = mix(albedo, albedo * texCol * 1.45, lodTexMix);
  }

  albedo = mountainApplySurfaceTint(albedo);

  float diffuse = max(dot(normal, lightDir), 0.0);
  float sky = max(normal.y, 0.0);

  vec3 sunColor = vec3(1.0, 0.97, 0.90);
  vec3 skyColor = vec3(0.34, 0.42, 0.55);

  vec3 col = albedo * ambient;
  col += albedo * sunColor * diffuse;
  col += skyColor * sky * 0.08;

  float fresnel = pow(1.0 - max(dot(normal, normalize(uCamPos - worldPos)), 0.0), 5.0);
  col += skyColor * fresnel * 0.05;

  float dist = length(worldPos - uCamPos);
  float haze = 1.0 - exp(-pow(dist / 3200.0, 1.35));
  vec3 hazeCol = vec3(0.30, 0.38, 0.48);

  col = mix(col, hazeCol, haze * distanceTint);

  float finalLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(finalLuma), col, finalSaturation);

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