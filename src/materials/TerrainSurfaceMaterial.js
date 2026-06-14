import * as THREE from "three";
import {
  TERRAIN_PARAM_FLOAT_COUNT,
  getTerrainShader,
  terrainParamsToFloatArray
} from "./terrain/terrainRegistry.js";
import { auroraLayerGlsl } from "./terrain/auroraLayer.js";

const WHITE_TEXTURE = createWhiteTexture();
const SPACE_PARAM_FLOAT_COUNT = 17;
const SKY_PARAM_FLOAT_COUNT = 9;
const CLOUD_PARAM_FLOAT_COUNT = 17;
const AURORA_PARAM_FLOAT_COUNT = 16;
const ATMOSPHERE_PARAM_FLOAT_COUNT = 9;
const FOG_PARAM_FLOAT_COUNT = 12;

const CLOUDS_GLSL = /* glsl */`

float cloudsEnabled() {
  return uCloudEnabled;
}

vec3 cloudHueToRgb(float h) {
  vec3 p = abs(fract(h + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}

vec3 cloudColorize(vec3 col, float hue, float saturation) {
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float h = fract(hue * 0.15915494 + 1.0);
  vec3 hueCol = cloudHueToRgb(h);

  vec3 tinted = hueCol * luma;
  vec3 result = mix(vec3(luma), tinted, saturation);
  result *= mix(vec3(1.0), col / max(vec3(luma), vec3(0.001)), 0.18);

  return clamp(result, 0.0, 1.0);
}

float cloudNoise3D(vec3 p) {
  const vec3 s = vec3(7.0, 157.0, 113.0);

  vec3 ip = floor(p);
  vec3 fp = fract(p);
  fp = fp * fp * (3.0 - 2.0 * fp);

  vec4 h = vec4(0.0, s.yz, s.y + s.z) + dot(ip, s);

  h = mix(
    fract(sin(h) * 43758.5453),
    fract(sin(h + s.x) * 43758.5453),
    fp.x
  );

  h.xy = mix(h.xz, h.yw, fp.y);

  return mix(h.x, h.y, fp.z);
}

vec3 cloudMotion(float time, float cloudSpeed) {
  float t = time * cloudSpeed;

  return vec3(
    sin(t * 0.32) * 7.5 + cos(t * 0.17) * 3.0,
    sin(t * 0.21 + 1.7) * 1.25,
    cos(t * 0.29 + 0.9) * 7.5 + sin(t * 0.13) * 3.0
  );
}

float cloudFbm(vec3 p, vec3 motion) {
  float res = 0.0;

  res += 0.55 * cloudNoise3D(p + motion);

  p = p * 2.03 + vec3(13.1, 7.7, 19.4);
  motion = motion.yzx * 0.63 + vec3(2.4, -1.7, 3.1);
  res += 0.275 * cloudNoise3D(p + motion);

  p = p * 2.03 + vec3(13.1, 7.7, 19.4);
  motion = motion.yzx * 0.63 + vec3(2.4, -1.7, 3.1);
  res += 0.1375 * cloudNoise3D(p + motion);

  return res * 1.038961;
}

float cloudLayerCenterY(float height) {
  const float CLOUD_BASE_Y = 24.0;
  const float CLOUD_HEIGHT_RANGE = 1800.0;

  float h = clamp(height, 0.0, 2.0) / 2.0;
  h = pow(h, 0.62);

  return CLOUD_BASE_Y + h * CLOUD_HEIGHT_RANGE;
}

float cloudLayerHalfThickness(float softness, float deckThickness) {
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);

  float baseThickness = mix(12.0, 34.0, s);

  // Deck Thickness controls actual vertical cloud depth.
  // 1.0 = normal
  // 4.0 = four times thicker layer
  // 8.0 = huge cloud wall / deep atmosphere layer
  float thickness = clamp(deckThickness, 0.25, 8.0);

  return baseThickness * thickness;
}

float cloudVerticalMask(float worldY, float centerY, float halfThickness, float softness) {
  float d = (worldY - centerY) / max(halfThickness, 0.0001);
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);

  // Thick slab, soft caps.
  // This does NOT increase density, only the vertical volume range.
  float body = exp(-d * d * mix(2.2, 0.85, s));
  float caps = 1.0 - smoothstep(0.84, 1.18, abs(d));

  return clamp(body * caps, 0.0, 1.0);
}

float cloudHeightOffset(
  vec3 samplePos,
  vec3 motion,
  float scale,
  float halfThickness,
  float heightVariation
) {
  float variation = clamp(heightVariation, 0.0, 1.0);

  if (variation <= 0.001) {
    return 0.0;
  }

  float freq = mix(0.045, 0.145, clamp(scale * 0.25, 0.0, 1.0));

  vec3 p = samplePos * freq * 0.095;
  p.xz = vec2(
    p.x * 0.753 - p.z * 0.658,
    p.x * 0.658 + p.z * 0.753
  );

  float n = cloudFbm(
    p + motion * 0.025 + vec3(-12.4, 8.8, 41.1),
    motion * 0.08
  );

  float centered = n * 2.0 - 1.0;

  // Keep it proportional to the actual cloud slab depth.
  return centered * halfThickness * mix(0.0, 2.4, variation);
}

float cloudBigPatchCoverage(
  vec3 samplePos,
  vec3 motion,
  float freq,
  float bigPatches
) {
  float big = clamp(bigPatches, 0.0, 1.0);

  if (big <= 0.001) {
    return 1.0;
  }

  // Very low frequency coverage mask.
  // It removes large regions without changing cloud density where clouds remain.
  vec3 p = samplePos * freq * 0.036;

  p.xz = vec2(
    p.x * 0.641 - p.z * 0.768,
    p.x * 0.768 + p.z * 0.641
  );

  p.xy = vec2(
    p.x * 0.917 + p.y * 0.399,
    -p.x * 0.399 + p.y * 0.917
  );

  float n1 = cloudFbm(
    p + motion * 0.020 + vec3(-74.1, 18.3, 51.6),
    motion * 0.040
  );

  // Secondary broad modulation breaks up the shapes so they are less round.
  vec3 p2 = samplePos * freq * 0.019;
  p2.xz = vec2(
    p2.x * 0.318 - p2.z * 0.948,
    p2.x * 0.948 + p2.z * 0.318
  );

  float n2 = cloudFbm(
    p2 - motion * 0.012 + vec3(112.0, -35.0, 9.0),
    motion * 0.025
  );

  float field = n1 * 0.74 + n2 * 0.26;

  float threshold = mix(0.02, 0.72, big);
  float softness = mix(0.42, 0.13, big);

  float coverage = smoothstep(
    threshold,
    threshold + softness,
    field
  );

  // Add irregular edge erosion at higher values.
  if (big > 0.35) {
    vec3 edgeP = samplePos * freq * 0.082 + vec3(8.0, -13.0, 21.0);
    float edge = cloudFbm(edgeP + motion * 0.025, motion * 0.045);
    float erosion = smoothstep(0.22, 0.78, edge);

    coverage *= mix(1.0, erosion, (big - 0.35) / 0.65);
  }

  return clamp(coverage, 0.0, 1.0);
}
    
float cloudMap(
  vec3 samplePos,
  float worldY,
  vec3 motion,
  float density,
  float scale,
  float centerY,
  float halfThickness,
  float softness,
  float patchiness,
  float bigPatches,
  float heightVariation
) {
  float freq = mix(0.045, 0.145, clamp(scale * 0.25, 0.0, 1.0));

  vec3 q = samplePos * freq;

  q.xz = vec2(q.x * 0.974 - q.z * 0.228, q.x * 0.228 + q.z * 0.974);
  q.xy = vec2(q.x * 0.994 + q.y * 0.110, -q.x * 0.110 + q.y * 0.994);

  float n = cloudFbm(q, motion);

  float localCenterY = centerY + cloudHeightOffset(
    samplePos,
    motion,
    scale,
    halfThickness,
    heightVariation
  );

  float vertical = cloudVerticalMask(worldY, localCenterY, halfThickness, softness);
  if (vertical <= 0.0001) {
    return 0.0;
  }

  float soft = mix(
    0.045,
    0.22,
    clamp((softness - 0.2) * 0.35714285, 0.0, 1.0)
  );

  // Density remains density only.
  // Thickness is handled only by halfThickness above.
  float field = n + (density - 1.0) * 0.26;
  float shape = smoothstep(
    0.46 - soft,
    0.72 + soft * 0.35,
    field
  );

  // Big Patches: very large, irregular clear regions.
  // Applied before regular patchiness so normal Patchiness can still add smaller gaps.
  shape *= cloudBigPatchCoverage(
    samplePos,
    motion,
    freq,
    bigPatches
  );

  // Patchiness creates free areas / holes in the cloud deck.
  // It is intentionally low-frequency and independent from density.
  float cloudPatchiness = clamp(patchiness, 0.0, 1.0);

  if (cloudPatchiness > 0.001) {
    vec3 patchP = samplePos * freq * 0.155;

    patchP.xz = vec2(
      patchP.x * 0.812 - patchP.z * 0.584,
      patchP.x * 0.584 + patchP.z * 0.812
    );

    float patchNoise = cloudFbm(
      patchP + motion * 0.045 + vec3(31.7, 4.2, -18.9),
      motion * 0.12
    );

    float holeThreshold = mix(0.06, 0.68, cloudPatchiness);
    float holeSoftness = mix(0.34, 0.16, cloudPatchiness);

    float coverage = smoothstep(
      holeThreshold,
      holeThreshold + holeSoftness,
      patchNoise
    );

    shape *= coverage;
  }

  return clamp(shape * vertical, 0.0, 1.0);
}

float cloudMapBlurred(
  vec3 samplePos,
  float worldY,
  vec3 motion,
  float density,
  float scale,
  float centerY,
  float halfThickness,
  float softness,
  float patchiness,
  float bigPatches,
  float heightVariation,
  float blurStrength
) {
  float blur = clamp(blurStrength, 0.0, 2.0);

  if (blur <= 0.001) {
    return cloudMap(
      samplePos,
      worldY,
      motion,
      density,
      scale,
      centerY,
      halfThickness,
      softness,
      patchiness,
      bigPatches,
      heightVariation
    );
  }

  float radius = mix(0.0, 1800.0, blur * 0.5) / max(scale, 0.25);

  vec3 ox = vec3(radius, 0.0, 0.0);
  vec3 oz = vec3(0.0, 0.0, radius);

  float center = cloudMap(
    samplePos,
    worldY,
    motion,
    density,
    scale,
    centerY,
    halfThickness,
    softness,
    patchiness,
    bigPatches,
    heightVariation
  );

  float sideA = cloudMap(
    samplePos + ox,
    worldY,
    motion,
    density,
    scale,
    centerY,
    halfThickness,
    softness,
    patchiness,
    bigPatches,
    heightVariation
  );

  float sideB = cloudMap(
    samplePos - oz,
    worldY,
    motion,
    density,
    scale,
    centerY,
    halfThickness,
    softness,
    patchiness,
    bigPatches,
    heightVariation
  );

  return clamp(center * 0.58 + sideA * 0.21 + sideB * 0.21, 0.0, 1.0);
}

vec3 cloudShade(float d, vec3 rd, float brightness) {
  float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  float light = clamp(d * 0.75 + up * 0.35, 0.0, 1.0);

  vec3 col = mix(vec3(0.42, 0.46, 0.54), vec3(0.92, 0.92, 0.88), light);
  return clamp(col * brightness, 0.0, 1.0);
}

vec4 rayCloudsFast(
  vec3 ro,
  vec3 rd,
  float time,
  float cloudSpeed,
  float density,
  float scale,
  float height,
  float brightness,
  float softness,
  float maxTraceDistance,
  float fadeDistance,
  float deckThickness,
  float patchiness,
  float bigPatches,
  float heightVariation,
  float blurStrength
) {
  vec4 sum = vec4(0.0);

  float centerY = cloudLayerCenterY(height);
  float halfThickness = cloudLayerHalfThickness(softness, deckThickness);

  float yMin = centerY - halfThickness;
  float yMax = centerY + halfThickness;

  float tEnter = 0.0;
  float tExit = -1.0;

  if (abs(rd.y) < 0.0005) {
    if (ro.y < yMin || ro.y > yMax) {
      return sum;
    }

    tEnter = 0.0;
    tExit = min(22000.0, maxTraceDistance);
  } else {
    float t0 = (yMin - ro.y) / rd.y;
    float t1 = (yMax - ro.y) / rd.y;

    tEnter = max(min(t0, t1), 0.0);
    tExit = max(t0, t1);

    if (tExit <= tEnter) {
      return sum;
    }

    tExit = min(tExit, min(24000.0, maxTraceDistance));
  }

  if (tExit - tEnter <= 0.001) {
    return sum;
  }

  const int STEPS = 22;

  vec3 motion = cloudMotion(time, cloudSpeed);
  float jitter = 0.37;

  // Prevent thicker clouds from becoming automatically denser just because
  // the ray travels through a deeper slab.
  float thicknessNorm = clamp(deckThickness, 0.25, 8.0);
  float thicknessAlphaCompensation = 1.0 / sqrt(thicknessNorm);

  for (int i = 0; i < STEPS; i++) {
    if (sum.a > 0.96) {
      break;
    }

    float fi = float(i);
    float sample01 = (fi + jitter) / float(STEPS);
    float eased = sample01 * sample01 * (3.0 - 2.0 * sample01);

    float t = mix(tEnter, tExit, eased);

    vec3 worldPos = ro + rd * t;
    vec3 samplePos = worldPos;

    float d = cloudMapBlurred(
      samplePos,
      worldPos.y,
      motion,
      density,
      scale,
      centerY,
      halfThickness,
      softness,
      patchiness,
      bigPatches,
      heightVariation,
      blurStrength
    );

    if (d <= 0.001) {
      continue;
    }

    float fadeDist = clamp(fadeDistance, 1.0, maxTraceDistance);
    float renderEnd = maxTraceDistance;
    float fadeStart = max(0.0, renderEnd - fadeDist);
    float farFade = 1.0 - smoothstep(fadeStart, renderEnd, t);

    float a = clamp(d * 0.14 * farFade * thicknessAlphaCompensation, 0.0, 0.22);

    vec3 col = cloudShade(d, rd, brightness);

    float remain = 1.0 - sum.a;
    sum.rgb += col * a * remain;
    sum.a += a * remain;
  }

  return clamp(sum, 0.0, 1.0);
}

vec4 applyCloudLayer(vec3 baseColor, vec3 rd, vec3 ro, vec2 fragCoord, float time, float maxTraceDistance) {
  fragCoord += vec2(0.0);

  if (cloudsEnabled() < 0.5) {
    return vec4(baseColor, 0.0);
  }

  float cloudSpeed = cloudParam(0);
  float density = cloudParam(1);
  float opacity = cloudParam(2);
  float scale = cloudParam(3);
  float height = cloudParam(4);
  float brightness = cloudParam(5);
  float softness = cloudParam(6);
  float hue = cloudParam(7);
  float saturation = cloudParam(8);
  float renderDistance = cloudParam(9);
  float fadeDistance = cloudParam(10);
  float deckThickness = cloudParam(11);
  float patchiness = cloudParam(12);
  float bigPatches = cloudParam(13);
  float heightVariation = cloudParam(14);
  float blurStrength = cloudParam(15);
  float contrast = max(0.0, cloudParam(16));

  if (opacity <= 0.001 || density <= 0.001) {
    return vec4(baseColor, 0.0);
  }

  vec3 viewDir = normalize(rd);

  vec4 clouds = rayCloudsFast(
    ro,
    viewDir,
    time,
    cloudSpeed,
    density,
    scale,
    height,
    brightness,
    softness,
    min(maxTraceDistance, renderDistance),
    fadeDistance,
    deckThickness,
    patchiness,
    bigPatches,
    heightVariation,
    blurStrength
  );

  if (clouds.a > 0.0001) {
    vec3 unpremul = clouds.rgb / max(clouds.a, 0.0001);

    if (abs(hue) > 0.001 || abs(saturation - 1.0) > 0.001) {
      unpremul = cloudColorize(unpremul, hue, saturation);
    }

    unpremul = clamp((unpremul - 0.5) * contrast + 0.5, 0.0, 1.0);
    clouds.rgb = unpremul * clouds.a;
  }

  clouds.rgb *= opacity;
  clouds.a = clamp(clouds.a * opacity, 0.0, 1.0);

  return vec4(baseColor * (1.0 - clouds.a) + clouds.rgb, clouds.a);
}
`;

const ATMOSPHERE_GLSL = /* glsl */`
float atmosphereEnabled() {
  return uAtmosphereEnabled;
}

vec3 atmosphereHueToRgb(float h) {
  vec3 p = abs(fract(h + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}

vec3 atmosphereColorize(vec3 col, float hue, float saturation) {
  float luma = dot(col, vec3(0.299, 0.587, 0.114));

  float h = fract(hue * 0.15915494 + 1.0);
  vec3 hueCol = atmosphereHueToRgb(h);

  vec3 tinted = hueCol * luma;
  vec3 result = mix(vec3(luma), tinted, saturation);

  result *= mix(vec3(1.0), col / max(vec3(luma), vec3(0.001)), 0.14);

  return clamp(result, 0.0, 1.0);
}

float atmosphereNoise3D(vec3 p) {
  const vec3 s = vec3(7.0, 157.0, 113.0);

  vec3 ip = floor(p);
  vec3 fp = fract(p);
  fp = fp * fp * (3.0 - 2.0 * fp);

  vec4 h = vec4(0.0, s.yz, s.y + s.z) + dot(ip, s);

  h = mix(
    fract(sin(h) * 43758.5453),
    fract(sin(h + s.x) * 43758.5453),
    fp.x
  );

  h.xy = mix(h.xz, h.yw, fp.y);

  return mix(h.x, h.y, fp.z);
}

vec3 atmosphereMotion(float time, float atmosphereSpeed) {
  float t = time * atmosphereSpeed;

  return vec3(
    sin(t * 0.24) * 5.0 + cos(t * 0.13) * 2.0,
    0.0,
    cos(t * 0.21 + 0.9) * 5.0 + sin(t * 0.11) * 2.0
  );
}

float atmosphereFbm(vec3 p, vec3 motion) {
  float res = 0.0;

  res += 0.55 * atmosphereNoise3D(p + motion);

  p = p * 2.03 + vec3(13.1, 7.7, 19.4);
  motion = motion.yzx * 0.63 + vec3(2.4, -1.7, 3.1);
  res += 0.275 * atmosphereNoise3D(p + motion);

  p = p * 2.03 + vec3(13.1, 7.7, 19.4);
  motion = motion.yzx * 0.63 + vec3(2.4, -1.7, 3.1);
  res += 0.1375 * atmosphereNoise3D(p + motion);

  return res * 1.038961;
}

float atmosphereLayerHeight(float height, float softness) {
  float h = clamp(height, 0.0, 1.0);
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);

  // Terrain-anchored atmospheric height above ground.
  const float ATMOSPHERE_MIN_HEIGHT = 1.5;
  const float ATMOSPHERE_MAX_HEIGHT = 2400.0;

  // More control in low/mid range, but still reaches high atmosphere.
  h = pow(h, 0.72);

  return mix(ATMOSPHERE_MIN_HEIGHT, ATMOSPHERE_MAX_HEIGHT, h) * mix(0.75, 1.65, s);
}

float atmosphereGroundMask(float heightAboveGround, float atmosphereHeight, float softness) {
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);

  float bottom = smoothstep(-0.8, 0.8, heightAboveGround);
  float top = 1.0 - smoothstep(atmosphereHeight * mix(0.55, 0.82, s), atmosphereHeight, heightAboveGround);

  float body = exp(-max(heightAboveGround, 0.0) / max(atmosphereHeight * mix(0.42, 0.72, s), 0.001));

  return clamp(bottom * top * body, 0.0, 1.0);
}

float atmosphereMap(
  vec3 worldPos,
  vec3 motion,
  float density,
  float scale,
  float height,
  float softness,
  float time
) {
  float terrainY = terrainHeight(worldPos.xz, time);
  float heightAboveGround = worldPos.y - terrainY;

  float atmosphereHeight = atmosphereLayerHeight(height, softness);
  float groundMask = atmosphereGroundMask(heightAboveGround, atmosphereHeight, softness);

  if (groundMask <= 0.0001) {
    return 0.0;
  }

  float freq = mix(0.025, 0.095, clamp(scale * 0.25, 0.0, 1.0));

  vec3 q = vec3(
    worldPos.x,
    heightAboveGround * 1.85,
    worldPos.z
  ) * freq;

  q.xz = vec2(q.x * 0.974 - q.z * 0.228, q.x * 0.228 + q.z * 0.974);
  q.xy = vec2(q.x * 0.994 + q.y * 0.110, -q.x * 0.110 + q.y * 0.994);

  float n = atmosphereFbm(q, motion);

  float soft = mix(
    0.08,
    0.30,
    clamp((softness - 0.2) * 0.35714285, 0.0, 1.0)
  );

  float field = n + (density - 1.0) * 0.36;
  float shape = smoothstep(0.40 - soft, 0.74 + soft * 0.25, field);

  return shape * groundMask;
}

vec3 atmosphereShade(float d, vec3 rd, float brightness) {
  float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  float light = clamp(d * 0.65 + up * 0.22, 0.0, 1.0);

  vec3 col = mix(vec3(0.38, 0.42, 0.48), vec3(0.82, 0.84, 0.82), light);
  return clamp(col * brightness, 0.0, 1.0);
}

vec4 rayAtmosphereFlowFast(
  vec3 ro,
  vec3 rd,
  float time,
  float atmosphereSpeed,
  float density,
  float scale,
  float height,
  float brightness,
  float softness,
  float maxTraceDistance
) {
  vec4 sum = vec4(0.0);

  float tMin = 0.5;
  float tMax = min(maxTraceDistance, 420.0);

  if (tMax <= tMin) {
    return sum;
  }

  const int STEPS = 18;

  vec3 motion = atmosphereMotion(time, atmosphereSpeed);
  float jitter = 0.37;

  float dt = (tMax - tMin) / float(STEPS);
  dt += 0.0;

  for (int i = 0; i < STEPS; i++) {
    if (sum.a > 0.92) {
      break;
    }

    float fi = float(i);
    float phase = (fi + jitter) / float(STEPS);

    // More samples near camera/terrain, fewer importance in far distance.
    float eased = phase * phase;
    float t = tMin + eased * (tMax - tMin);

    vec3 worldPos = ro + rd * t;

    float d = atmosphereMap(
      worldPos,
      motion,
      density,
      scale,
      height,
      softness,
      time
    );

    if (d <= 0.001) {
      continue;
    }

    float distFade = 1.0 / (1.0 + t * 0.006);
    float farFade = 1.0 - smoothstep(tMax * 0.78, tMax, t);

    float cameraAboveGround = ro.y - terrainHeight(ro.xz, time);
    float highCameraFade = 1.0 - smoothstep(80.0, 260.0, cameraAboveGround);

    float horizon = 1.0 - clamp(abs(rd.y), 0.0, 1.0);
    float horizonBoost = mix(0.85, 1.18, horizon);

    float a = clamp(
      d * 0.115 * distFade * farFade * horizonBoost * mix(0.45, 1.0, highCameraFade),
      0.0,
      0.18
    );

    vec3 col = atmosphereShade(d, rd, brightness);

    float remain = 1.0 - sum.a;
    sum.rgb += col * a * remain;
    sum.a += a * remain;
  }

  return clamp(sum, 0.0, 1.0);
}

vec4 applyAtmosphereLayer(vec3 baseColor, vec3 rd, vec3 ro, vec2 fragCoord, float time, float maxTraceDistance) {
  fragCoord += vec2(0.0);

  if (atmosphereEnabled() < 0.5) {
    return vec4(baseColor, 0.0);
  }

  float atmosphereSpeed = atmosphereParam(0);
  float density = atmosphereParam(1);
  float opacity = atmosphereParam(2);
  float scale = atmosphereParam(3);
  float height = atmosphereParam(4);
  float brightness = atmosphereParam(5);
  float softness = atmosphereParam(6);
  float hue = atmosphereParam(7);
  float saturation = atmosphereParam(8);

  if (opacity <= 0.001 || density <= 0.001) {
    return vec4(baseColor, 0.0);
  }

  vec3 viewDir = normalize(rd);

  vec4 atmosphereFlow = rayAtmosphereFlowFast(
    ro,
    viewDir,
    time,
    atmosphereSpeed,
    density,
    scale,
    height,
    brightness,
    softness,
    maxTraceDistance
  );

  if (abs(hue) > 0.001 || abs(saturation - 1.0) > 0.001) {
    atmosphereFlow.rgb = atmosphereColorize(atmosphereFlow.rgb, hue, saturation);
  }

  float alpha = clamp(atmosphereFlow.a * opacity, 0.0, 1.0);

  return vec4(mix(baseColor, atmosphereFlow.rgb, alpha), alpha);
}
`;

const FOG_GLSL = /* glsl */`
float fogEnabled() {
  return uFogEnabled;
}

vec3 fogHueToRgb(float h) {
  vec3 p = abs(fract(h + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
  return clamp(p - 1.0, 0.0, 1.0);
}

vec3 fogColorize(vec3 col, float hue, float saturation) {
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float h = fract(hue * 0.15915494 + 1.0);
  vec3 hueCol = fogHueToRgb(h);

  vec3 tinted = hueCol * luma;
  vec3 result = mix(vec3(luma), tinted, saturation);
  result *= mix(vec3(1.0), col / max(vec3(luma), vec3(0.001)), 0.18);

  return clamp(result, 0.0, 1.0);
}

float fogNoise3D(vec3 p) {
  const vec3 s = vec3(7.0, 157.0, 113.0);

  vec3 ip = floor(p);
  vec3 fp = fract(p);
  fp = fp * fp * (3.0 - 2.0 * fp);

  vec4 h = vec4(0.0, s.yz, s.y + s.z) + dot(ip, s);

  h = mix(
    fract(sin(h) * 43758.5453),
    fract(sin(h + s.x) * 43758.5453),
    fp.x
  );

  h.xy = mix(h.xz, h.yw, fp.y);

  return mix(h.x, h.y, fp.z);
}

vec3 fogMotion(float time, float fogSpeed) {
  float t = time * fogSpeed;

  return vec3(
    sin(t * 0.32) * 7.5 + cos(t * 0.17) * 3.0,
    sin(t * 0.21 + 1.7) * 1.25,
    cos(t * 0.29 + 0.9) * 7.5 + sin(t * 0.13) * 3.0
  );
}

float fogFbm(vec3 p, vec3 motion) {
  float res = 0.0;

  res += 0.55 * fogNoise3D(p + motion);

  p = p * 2.03 + vec3(13.1, 7.7, 19.4);
  motion = motion.yzx * 0.63 + vec3(2.4, -1.7, 3.1);
  res += 0.275 * fogNoise3D(p + motion);

  p = p * 2.03 + vec3(13.1, 7.7, 19.4);
  motion = motion.yzx * 0.63 + vec3(2.4, -1.7, 3.1);
  res += 0.1375 * fogNoise3D(p + motion);

  return res * 1.038961;
}

float fogLayerCenterY(float height) {
  const float FOG_BASE_Y = 24.0;
  const float FOG_HEIGHT_RANGE = 1800.0;
  const float FOG_LOW_RANGE = 260.0;

  float h = clamp(height, -2.0, 2.0);

  if (h < 0.0) {
    return FOG_BASE_Y + h * FOG_LOW_RANGE;
  }

  h = pow(h / 2.0, 0.62);

  return FOG_BASE_Y + h * FOG_HEIGHT_RANGE;
}

float fogLayerHalfThickness(float softness, float deckThickness) {
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);

  float baseThickness = mix(12.0, 34.0, s);

  // Deck Thickness controls actual vertical cloud/fog depth.
  // 1.0 = normal
  // 4.0 = four times thicker layer
  // 8.0 = huge cloud wall / deep view-fog layer
  float thickness = clamp(deckThickness, 0.25, 8.0);

  return baseThickness * thickness;
}

float fogVerticalMask(float worldY, float centerY, float halfThickness, float softness) {
  float d = (worldY - centerY) / max(halfThickness, 0.0001);
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);

  // Thick slab, soft caps.
  // This does NOT increase density, only the vertical volume range.
  float body = exp(-d * d * mix(2.2, 0.85, s));
  float caps = 1.0 - smoothstep(0.84, 1.18, abs(d));

  return clamp(body * caps, 0.0, 1.0);
}

float fogMap(
  vec3 samplePos,
  float worldY,
  vec3 motion,
  float density,
  float scale,
  float centerY,
  float halfThickness,
  float softness
) {
  float scale01 = clamp((scale - 0.01) / 0.49, 0.0, 1.0);
  float freq = mix(0.004, 0.080, pow(scale01, 0.72));

  vec3 q = samplePos * freq;

  q.xz = vec2(q.x * 0.974 - q.z * 0.228, q.x * 0.228 + q.z * 0.974);
  q.xy = vec2(q.x * 0.994 + q.y * 0.110, -q.x * 0.110 + q.y * 0.994);

  float n = fogFbm(q, motion);

  float vertical = fogVerticalMask(worldY, centerY, halfThickness, softness);
  if (vertical <= 0.0001) {
    return 0.0;
  }

  float soft = mix(
    0.045,
    0.22,
    clamp((softness - 0.2) * 0.35714285, 0.0, 1.0)
  );

  // Density remains density only.
  // Thickness is handled only by halfThickness above.
  float field = n + (density - 1.0) * 0.26;
  float shape = smoothstep(
    0.46 - soft,
    0.72 + soft * 0.35,
    field
  );

  return clamp(shape * vertical, 0.0, 1.0);
}

vec3 fogShade(float d, vec3 rd, float brightness) {
  float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  float light = clamp(d * 0.75 + up * 0.35, 0.0, 1.0);

  vec3 col = mix(vec3(0.42, 0.46, 0.54), vec3(0.92, 0.92, 0.88), light);
  return clamp(col * brightness, 0.0, 1.0);
}

vec4 rayFogCloudsFast(
  vec3 ro,
  vec3 rd,
  float time,
  float fogSpeed,
  float density,
  float scale,
  float height,
  float brightness,
  float softness,
  float maxTraceDistance,
  float fadeDistance,
  float deckThickness
) {
  vec4 sum = vec4(0.0);

  float centerY = fogLayerCenterY(height);
  float halfThickness = fogLayerHalfThickness(softness, deckThickness);

  float yMin = centerY - halfThickness;
  float yMax = centerY + halfThickness;

  float tEnter = 0.0;
  float tExit = -1.0;

  if (abs(rd.y) < 0.0005) {
    if (ro.y < yMin || ro.y > yMax) {
      return sum;
    }

    tEnter = 0.0;
    tExit = min(22000.0, maxTraceDistance);
  } else {
    float t0 = (yMin - ro.y) / rd.y;
    float t1 = (yMax - ro.y) / rd.y;

    tEnter = max(min(t0, t1), 0.0);
    tExit = max(t0, t1);

    if (tExit <= tEnter) {
      return sum;
    }

    tExit = min(tExit, min(24000.0, maxTraceDistance));
  }

  if (tExit - tEnter <= 0.001) {
    return sum;
  }

  const int STEPS = 22;

  vec3 motion = fogMotion(time, fogSpeed);
  float jitter = 0.37;

  // Prevent thicker fog from becoming automatically denser just because
  // the ray travels through a deeper slab.
  float thicknessNorm = clamp(deckThickness, 0.25, 8.0);
  float thicknessAlphaCompensation = 1.0 / sqrt(thicknessNorm);

  for (int i = 0; i < STEPS; i++) {
    if (sum.a > 0.96) {
      break;
    }

    float fi = float(i);
    float sample01 = (fi + jitter) / float(STEPS);
    float eased = sample01 * sample01 * (3.0 - 2.0 * sample01);

    float t = mix(tEnter, tExit, eased);

    vec3 worldPos = ro + rd * t;
    vec3 samplePos = worldPos;

    float d = fogMap(
      samplePos,
      worldPos.y,
      motion,
      density,
      scale,
      centerY,
      halfThickness,
      softness
    );

    if (d <= 0.001) {
      continue;
    }

    float fadeDist = clamp(fadeDistance, 1.0, maxTraceDistance);
    float renderEnd = maxTraceDistance;
    float fadeStart = max(0.0, renderEnd - fadeDist);
    float farFade = 1.0 - smoothstep(fadeStart, renderEnd, t);

    float a = clamp(d * 0.14 * farFade * thicknessAlphaCompensation, 0.0, 0.22);

    vec3 col = fogShade(d, rd, brightness);

    float remain = 1.0 - sum.a;
    sum.rgb += col * a * remain;
    sum.a += a * remain;
  }

  return clamp(sum, 0.0, 1.0);
}

vec4 applyFogLayer(vec3 baseColor, vec3 rd, vec3 ro, vec2 fragCoord, float time, float maxTraceDistance) {
  fragCoord += vec2(0.0);

  if (fogEnabled() < 0.5) {
    return vec4(baseColor, 0.0);
  }

  float fogSpeed = fogParam(0);
  float density = fogParam(1);
  float opacity = fogParam(2);
  float scale = fogParam(3);
  float height = fogParam(4);
  float brightness = fogParam(5);
  float softness = fogParam(6);
  float hue = fogParam(7);
  float saturation = fogParam(8);
  float renderDistance = fogParam(9);
  float fadeDistance = fogParam(10);
  float deckThickness = fogParam(11);

  if (opacity <= 0.001 || density <= 0.001) {
    return vec4(baseColor, 0.0);
  }

  vec3 viewDir = normalize(rd);

  vec4 fogClouds = rayFogCloudsFast(
    ro,
    viewDir,
    time,
    fogSpeed,
    density,
    scale,
    height,
    brightness,
    softness,
    min(maxTraceDistance, renderDistance),
    fadeDistance,
    deckThickness
  );

  if (fogClouds.a > 0.0001 && (abs(hue) > 0.001 || abs(saturation - 1.0) > 0.001)) {
    vec3 unpremul = fogClouds.rgb / max(fogClouds.a, 0.0001);
    unpremul = fogColorize(unpremul, hue, saturation);
    fogClouds.rgb = unpremul * fogClouds.a;
  }

  fogClouds.rgb *= opacity;
  fogClouds.a = clamp(fogClouds.a * opacity, 0.0, 1.0);

  return vec4(baseColor * (1.0 - fogClouds.a) + fogClouds.rgb, fogClouds.a);
}
`;

export class TerrainSurfaceMaterial extends THREE.ShaderMaterial {
  constructor({ shaderId = "none", planetConfig, surfaceTexture = null } = {}) {
    const safeShaderId = shaderId ?? "none";

    super({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      uniforms: createUniforms(surfaceTexture),
      vertexShader: createVertexShader(),
      fragmentShader: createFragmentShader(safeShaderId)
    });

    this.activeShaderId = safeShaderId;
    this.setPlanetConfig(planetConfig ?? {}, safeShaderId);
    this.setSurfaceTexture(surfaceTexture);
  }

  setPlanetConfig(planetConfig, shaderId = planetConfig.visual?.terrainShaderId) {
    const nextShaderId = shaderId ?? "none";

    if (nextShaderId !== this.activeShaderId) {
      this.activeShaderId = nextShaderId;
      this.fragmentShader = createFragmentShader(nextShaderId);
      this.needsUpdate = true;
    }

    const visual = planetConfig.visual ?? {};
    const baseColor = visual.baseColor ?? [0.64, 0.68, 0.72];
    const accentColor = visual.accentColor ?? [0.9, 0.92, 1.0];

    this.uniforms.uBaseColor.value.setRGB(baseColor[0], baseColor[1], baseColor[2]);
    this.uniforms.uAccentColor.value.setRGB(accentColor[0], accentColor[1], accentColor[2]);
    this.uniforms.uTerrainParams.value.set(
      terrainParamsToFloatArray(nextShaderId, visual.terrainParams ?? {})
    );
  }

  setSurfaceTexture(texture) {
    this.uniforms.uSurfaceTex.value = texture ?? WHITE_TEXTURE;
    this.uniforms.uHasSurfaceTex.value = texture ? 1 : 0;
  }

  setSpaceConfig(spaceConfig = {}) {
    const params = spaceConfig.params ?? {};

    this.uniforms.uSpaceMode.value = 1;
    this.uniforms.uSpaceParams.value.set([
      params.iterations ?? 13,
      params.volSteps ?? 12,
      params.zoom ?? 1.0,
      params.tile ?? 0.16,
      params.speed ?? 0.0,
      params.brightness ?? 0.0002,
      params.darkMatter ?? 0.84,
      params.distFading ?? 0.76,
      params.saturation ?? 0.98,
      params.stepSize ?? 0.1,
      params.drift ?? 0.03,
      params.starNestAmount ?? 1.0,
      params.gradientAmount ?? 0.0,
      params.horizonGlow ?? 0.55,
      params.horizonDepth ?? params.depth ?? 1.2,
      params.starCount ?? params.starIntensity ?? 1.6,
      params.starDensity ?? 110
    ]);
  }


  setSkyConfig(skyConfig = {}) {
    const shaderId = skyConfig.shaderId ?? skyConfig.skyShaderId ?? "none";
    const params = skyConfig.params ?? skyConfig.skyShaderParams ?? {};

    this.uniforms.uSkyMode.value = shaderId === "void"
      ? 1
      : shaderId === "thin-atmosphere"
        ? 2
        : 0;

    if (shaderId === "thin-atmosphere") {
      // TerrainView passes EFFECTIVE values here.
      // Do not multiply by sun height again and do not restore Max values here.
      this.uniforms.uSkyParams.value.set([
        params.density ?? 0.0,
        params.horizon ?? 0.0,
        params.spaceFade ?? 0.25,
        params.skyBrightness ?? 0.0,
        params.ambient ?? 0.0,
        params.lightIntensity ?? 0.0,
        params.shadowStrength ?? 0.35,
        params.shadowDistance ?? 90.0,
        params.shadowSteps ?? 18.0
      ]);
      return;
    }

    this.uniforms.uSkyParams.value.set([
      shaderId === "void" ? params.ambient ?? 0.04 : 0.0,
      params.horizon ?? 0.25,
      params.spaceFade ?? 0.25,
      params.skyBrightness ?? 0.0,
      params.ambient ?? 0.0,
      params.lightIntensity ?? 0.0,
      params.shadowStrength ?? 0.35,
      params.shadowDistance ?? 90.0,
      params.shadowSteps ?? 18.0
    ]);
  }

  setAtmosphereConfig(atmosphereConfig = {}) {
    const clouds = atmosphereConfig.clouds ?? {};
    const aurora = atmosphereConfig.aurora ?? {};
    const auroraParams = aurora.params ?? aurora;
    const atmosphereLayer = atmosphereConfig.atmosphere ?? {};
    const atmosphereParams = atmosphereLayer.params ?? atmosphereLayer;
    const fogLayer = atmosphereConfig.fog ?? {};
    const fogParams = fogLayer.params ?? fogLayer;

    this.uniforms.uCloudEnabled.value = clouds.enabled ? 1 : 0;
    this.uniforms.uCloudParams.value.set([
      clouds.speed ?? 0.25,
      clouds.density ?? 1.0,
      clouds.opacity ?? 0.55,
      clouds.scale ?? 1.0,
      clouds.height ?? 0.25,
      clouds.brightness ?? 1.0,
      clouds.softness ?? 1.0,
      clouds.hue ?? 0.0,
      clouds.saturation ?? 0.0,
      clouds.renderDistance ?? 18000.0,
      clouds.fadeDistance ?? 4500.0,
      clouds.deckThickness ?? 1.0,
      clouds.patchiness ?? 0.0,
      clouds.bigPatches ?? 0.0,
      clouds.heightVariation ?? 0.0,
      clouds.blurStrength ?? 0.0,
      clouds.contrast ?? 1.0
    ]);

    this.uniforms.uAuroraParams.value.set([
      aurora.enabled ? 1 : 0,
      auroraParams.intensity ?? 1.0,
      auroraParams.speed ?? 1.0,
      auroraParams.bandScale ?? 140.0,
      auroraParams.height ?? 1200.0,
      auroraParams.spread ?? 1.35,
      auroraParams.trail ?? 1.0,
      auroraParams.glow ?? 1.35,
      auroraParams.horizonFade ?? 1.0,
      0, 0, 0, 0, 0, 0, 0
    ]);

    this.uniforms.uAtmosphereEnabled.value = atmosphereLayer.shaderId === "atmosphere-flow" ? 1 : 0;
    this.uniforms.uAtmosphereParams.value.set([
      atmosphereParams.speed ?? 0.18,
      atmosphereParams.density ?? 0.9,
      atmosphereParams.opacity ?? 0.32,
      atmosphereParams.scale ?? 1.0,
      atmosphereParams.height ?? 0.25,
      atmosphereParams.brightness ?? 0.92,
      atmosphereParams.softness ?? 1.35,
      atmosphereParams.hue ?? 0.0,
      atmosphereParams.saturation ?? 0.65
    ]);

    this.uniforms.uFogEnabled.value = fogLayer.shaderId === "fog-clouds" ? 1 : 0;
    this.uniforms.uFogParams.value.set([
      fogParams.speed ?? 0.25,
      fogParams.density ?? 1.0,
      fogParams.opacity ?? 0.55,
      fogParams.scale ?? 0.10,
      fogParams.height ?? 0.25,
      fogParams.brightness ?? 1.0,
      fogParams.softness ?? 1.0,
      fogParams.hue ?? 0.0,
      fogParams.saturation ?? 1.0,
      fogParams.renderDistance ?? 18000.0,
      fogParams.fadeDistance ?? 4500.0,
      fogParams.deckThickness ?? 1.0
    ]);
  }

  setCameraBasis({ position, right, up, forward }) {
    this.uniforms.uCamPos.value.copy(position);
    this.uniforms.uCamRight.value.copy(right);
    this.uniforms.uCamUp.value.copy(up);
    this.uniforms.uCamForward.value.copy(forward);
  }

  setLighting({
    sunDirection,
    sunHeight01 = null,
    sunColor,
    sunIntensity = 1,
    ambientIntensity = 0.18
  } = {}) {
    const direction = sunDirection ?? [0.46, 0.72, 0.38];
    const color = sunColor ?? [1.08, 0.95, 0.78];

    this.uniforms.uSunDirection.value.set(direction[0], direction[1], direction[2]).normalize();

    const fallbackSunHeight = Math.max(0, Math.min(1, this.uniforms.uSunDirection.value.y));
    const nextSunHeight = Number.isFinite(Number(sunHeight01))
      ? Math.max(0, Math.min(1, Number(sunHeight01)))
      : fallbackSunHeight;

    this.uniforms.uSunHeight01.value = nextSunHeight;
    this.uniforms.uSunColor.value.setRGB(color[0], color[1], color[2]);
    this.uniforms.uSunIntensity.value = sunIntensity;
    this.uniforms.uAmbientIntensity.value = ambientIntensity;
  }

  setResolution(width, height, pixelRatio = 1) {
    this.uniforms.iResolution.value.set(
      Math.max(1, width * pixelRatio),
      Math.max(1, height * pixelRatio),
      pixelRatio
    );
  }

  setTime(elapsedTime) {
    this.uniforms.iTime.value = elapsedTime;
  }
}

function createUniforms(surfaceTexture) {
  return {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector3(1, 1, 1) },
    uCamPos: { value: new THREE.Vector3(0, 22, 58) },
    uCamRight: { value: new THREE.Vector3(1, 0, 0) },
    uCamUp: { value: new THREE.Vector3(0, 1, 0) },
    uCamForward: { value: new THREE.Vector3(0, -0.36, -0.93).normalize() },
    uBaseColor: { value: new THREE.Color(0.64, 0.68, 0.72) },
    uAccentColor: { value: new THREE.Color(0.9, 0.92, 1.0) },
    uSurfaceTex: { value: surfaceTexture ?? WHITE_TEXTURE },
    uHasSurfaceTex: { value: surfaceTexture ? 1 : 0 },
    uTerrainParams: { value: new Float32Array(TERRAIN_PARAM_FLOAT_COUNT) },
    uSpaceMode: { value: 0 },
    uSpaceParams: { value: new Float32Array(SPACE_PARAM_FLOAT_COUNT) },
    uSkyMode: { value: 0 },
    uSkyParams: { value: new Float32Array(SKY_PARAM_FLOAT_COUNT) },
    uSunDirection: { value: new THREE.Vector3(0.46, 0.72, 0.38).normalize() },
    uSunHeight01: { value: 0.72 },
    uSunColor: { value: new THREE.Color(1.08, 0.95, 0.78) },
    uSunIntensity: { value: 1.0 },
    uAmbientIntensity: { value: 0.18 },
    uCloudEnabled: { value: 0 },
    uCloudParams: { value: new Float32Array(CLOUD_PARAM_FLOAT_COUNT) },
    uAuroraParams: { value: new Float32Array(AURORA_PARAM_FLOAT_COUNT) },
    uAtmosphereEnabled: { value: 0 },
    uAtmosphereParams: { value: new Float32Array(ATMOSPHERE_PARAM_FLOAT_COUNT) },
    uFogEnabled: { value: 0 },
    uFogParams: { value: new Float32Array(FOG_PARAM_FLOAT_COUNT) }
  };
}

function createVertexShader() {
  return /* glsl */`
    void main() {
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;
}

function createFragmentShader(shaderId) {
  const terrainShader = getTerrainShader(shaderId);

  return /* glsl */`
    precision highp float;

    uniform float iTime;
    uniform vec3 iResolution;
    uniform vec3 uCamPos;
    uniform vec3 uCamRight;
    uniform vec3 uCamUp;
    uniform vec3 uCamForward;
    uniform vec3 uBaseColor;
    uniform vec3 uAccentColor;
    uniform sampler2D uSurfaceTex;
    uniform float uHasSurfaceTex;
    uniform float uTerrainParams[${TERRAIN_PARAM_FLOAT_COUNT}];
    uniform int uSpaceMode;
    uniform float uSpaceParams[${SPACE_PARAM_FLOAT_COUNT}];
    uniform int uSkyMode;
    uniform float uSkyParams[${SKY_PARAM_FLOAT_COUNT}];
    uniform vec3 uSunDirection;
    uniform float uSunHeight01;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    uniform float uAmbientIntensity;
    uniform float uCloudEnabled;
    uniform float uCloudParams[${CLOUD_PARAM_FLOAT_COUNT}];
    uniform float uAuroraParams[${AURORA_PARAM_FLOAT_COUNT}];
    uniform float uAtmosphereEnabled;
    uniform float uAtmosphereParams[${ATMOSPHERE_PARAM_FLOAT_COUNT}];
    uniform float uFogEnabled;
    uniform float uFogParams[${FOG_PARAM_FLOAT_COUNT}];

    const int MAX_MARCH_STEPS = 520;
    const float FALLBACK_MAX_DIST = 8000.0;
    const float TERRAIN_ABSOLUTE_MAX_DIST = 140000.0;
    const float MIN_HIT_EPS = 0.015;

    float terrainParam(int index) {
      return uTerrainParams[index];
    }

    float spaceParam(int index) {
      return uSpaceParams[index];
    }

    float skyParam(int index) {
      return uSkyParams[index];
    }

    float cloudParam(int index) {
      return uCloudParams[index];
    }

    float auroraParam(int index) {
      return uAuroraParams[index];
    }

    float atmosphereParam(int index) {
      return uAtmosphereParams[index];
    }

    float fogParam(int index) {
      return uFogParams[index];
    }

    float saturate(float x) {
      return clamp(x, 0.0, 1.0);
    }

    float skySunHeight01() {
      // Shared local sun-height scalar.
      // This must match the value shown in the UI effective rows.
      return clamp(uSunHeight01, 0.0, 1.0);
    }

    vec3 tonemap(vec3 c) {
      return c / (1.0 + c);
    }

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise2(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
        mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float starLayer(vec2 uv, float density, float time, float drift) {
      vec2 p = uv * density + vec2(time * drift, -time * drift * 0.63);
      vec2 cell = floor(p);
      vec2 f = fract(p) - 0.5;
      float rnd = hash12(cell);
      float threshold = mix(0.992, 0.935, clamp(spaceParam(15), 0.0, 2.0) * 0.5);
      float exists = step(threshold, rnd);
      vec2 starOffset = vec2(
        hash12(cell + vec2(13.7, 91.1)),
        hash12(cell + vec2(41.2, 17.4))
      ) - 0.5;
      float dist = length(f - starOffset);
      float core = 1.0 - smoothstep(0.000, 0.035, dist);
      float glow = 1.0 - smoothstep(0.020, 0.110, dist);
      float twinkle = 0.72 + 0.28 * sin(time * 3.0 + rnd * 80.0);
      return exists * (core * 1.4 + glow * 0.28) * twinkle;
    }

    float starField(vec3 rd, float density, float drift, float time) {
      vec3 p = normalize(rd);
      vec2 uvA = p.xz / (abs(p.y) + 0.85);
      vec2 uvB = p.xy / (abs(p.z) + 0.95);
      return starLayer(uvA, density, time, drift) +
        starLayer(uvB + 37.0, density * 0.58, time, drift * -0.7) * 0.65;
    }

    vec3 gradientStarsSpace(vec3 rd, vec3 ro, float time) {
      float horizonGlow = spaceParam(13);
      float zenith = spaceParam(14);
      float starCount = spaceParam(15);
      float starDensity = spaceParam(16);
      float drift = spaceParam(10);
      float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 horizonCol = vec3(0.09, 0.08, 0.16) * (0.6 + horizonGlow);
      vec3 zenithCol = vec3(0.004, 0.008, 0.03) * (0.4 + zenith * 0.5);
      vec3 col = mix(horizonCol, zenithCol, pow(up, max(0.25, zenith)));
      float horizonBand = pow(1.0 - abs(rd.y), 7.0);
      col += vec3(0.90, 0.35, 1.0) * horizonBand * horizonGlow * 0.18;
      col += vec3(0.10, 0.55, 0.95) * horizonBand * horizonGlow * 0.13;
      float stars = starField(rd, starDensity, drift, time);
      vec3 starColor = mix(vec3(0.65, 0.78, 1.0), vec3(1.0, 0.94, 0.82), hash12(rd.xy * 91.3));
      ro += vec3(0.0);
      return col + starColor * stars * starCount;
    }

    vec3 starNestSpace(vec3 rd, vec3 ro, float time) {
      vec3 dir = normalize(rd);
      dir.xy *= spaceParam(2);

      float iterations = spaceParam(0);
      float volSteps = spaceParam(1);
      float tile = spaceParam(3);
      float brightness = spaceParam(5);
      float darkMatter = spaceParam(6);
      float distFading = spaceParam(7);
      float saturation = spaceParam(8);
      float stepSize = spaceParam(9);

      float s = 0.1;
      float fade = 1.0;
      vec3 v = vec3(0.0);

      float localTime = time * spaceParam(4) + 0.25;
      vec3 from = vec3(1.0, 0.5, 0.5);
      from += vec3(
        localTime * 2.0,
        localTime,
        -2.0 + ro.z * 0.0005 * spaceParam(10)
      );
      from.xy += ro.xz * 0.0003 * spaceParam(10);

      for (int r = 0; r < 20; r += 1) {
        if (float(r) >= volSteps) {
          break;
        }

        vec3 p = from + s * dir * 0.5;
        p = abs(vec3(tile) - mod(p, vec3(tile * 2.0)));

        float pa = 0.0;
        float a = 0.0;

        for (int i = 0; i < 17; i += 1) {
          if (float(i) >= iterations) {
            break;
          }

          p = abs(p) / dot(p, p) - 0.53;
          a += abs(length(p) - pa);
          pa = length(p);
        }

        float dm = max(0.0, darkMatter - a * a * 0.001);
        a *= a * a;

        if (r > 6) {
          fade *= 1.0 - dm;
        }

        v += vec3(fade);
        v += vec3(s, s * s, s * s * s * s) * a * brightness * fade;
        fade *= distFading;
        s += stepSize;
      }

      v = mix(vec3(length(v)), v, saturation);
      return clamp(v * 0.01, vec3(0.0), vec3(1.0));
    }

    vec3 spaceColor(vec3 rd, vec3 ro, float time) {
      float starNestAmount = spaceParam(11);
      float gradientAmount = spaceParam(12);
      vec3 color = vec3(0.0);

      if (starNestAmount > 0.001) {
        color += starNestSpace(rd, ro, time) * starNestAmount;
      }

      if (gradientAmount > 0.001) {
        color += gradientStarsSpace(rd, ro, time) * gradientAmount;
      }

      return color;
    }

    vec3 skyShaderColor(vec3 rd, vec3 ro, float time, vec3 behind) {
      if (uSkyMode == 1) {
        float ambient = skyParam(0);
        float horizon = skyParam(1);
        float horizonMask = pow(1.0 - abs(rd.y), 6.0);
        vec3 haze = vec3(ambient) + vec3(0.04, 0.02, 0.08) * horizonMask * horizon;
        ro += vec3(0.0);
        time += 0.0;
        return behind + haze;
      }

      if (uSkyMode == 2) {
        // These are EFFECTIVE values:
        // density = Density Max * sunHeight01
        // horizon = Horizon Max * sunHeight01
        // skyBrightness = 1.5 * sunHeight01
        float densityEffective = skyParam(0);
        float horizonEffective = skyParam(1);
        float skyBrightnessEffective = skyParam(3);

        // Absolute cut:
        // if effective values are zero, Thin Atmosphere contributes exactly nothing.
        if (
          densityEffective <= 0.0001 ||
          horizonEffective <= 0.0001 ||
          skyBrightnessEffective <= 0.0001
        ) {
          ro += vec3(0.0);
          time += 0.0;
          return behind;
        }

        float spaceFade = skyParam(2);
        float horizonMask = pow(1.0 - abs(rd.y), 3.0);
        float upperMask = smoothstep(-0.2, 0.9, rd.y);

        vec3 hazeLow = vec3(0.23, 0.17, 0.34) * horizonMask * horizonEffective;
        vec3 hazeHigh = vec3(0.035, 0.055, 0.12) * upperMask * densityEffective;
        vec3 haze = (hazeLow + hazeHigh) * densityEffective * skyBrightnessEffective;

        vec3 dimmedBehind = mix(
          behind,
          behind * (1.0 - spaceFade),
          horizonMask * densityEffective
        );

        ro += vec3(0.0);
        time += 0.0;
        return dimmedBehind + haze;
      }

      rd += vec3(0.0);
      ro += vec3(0.0);
      time += 0.0;
      return behind;
    }

    vec3 skyLightDirection() {
      return normalize(uSunDirection);
    }

    vec3 skyLightColor() {
      float lightIntensity = uSkyMode == 2 ? skyParam(5) : 1.0;

      return uSunColor * max(0.0, uSunIntensity) * max(0.0, lightIntensity);
    }

    float skyAmbient() {
      if (uSkyMode == 2) {
        return max(0.0, skyParam(4));
      }

      return max(0.0, uAmbientIntensity);
    }

    float skyShadowStrength() {
      if (uSkyMode == 2) {
        return clamp(skyParam(6), 0.0, 1.0);
      }

      return 0.38;
    }

    float skyShadowSteps() {
      if (uSkyMode == 2) {
        return clamp(skyParam(8), 0.0, 48.0);
      }

      return 24.0;
    }

    float skyShadowDistance() {
      if (uSkyMode == 2) {
        return max(0.0, skyParam(7));
      }

      return 70.0;
    }

${CLOUDS_GLSL}

${terrainShader.glsl}

${auroraLayerGlsl}

${ATMOSPHERE_GLSL}

${FOG_GLSL}

    float sceneTerrainHeight(vec2 xz) {
      return terrainHeight(xz, iTime);
    }

    float terrainDistance(vec3 p) {
      return p.y - sceneTerrainHeight(p.xz);
    }

    float sceneAltitudeAboveTerrain() {
      float groundY = sceneTerrainHeight(uCamPos.xz);
      return max(0.0, uCamPos.y - groundY);
    }

    float sceneRenderDistance() {
      float baseDistance = terrainRenderDistance();
      if (baseDistance <= 0.0) {
        baseDistance = FALLBACK_MAX_DIST;
      }
      return clamp(baseDistance, 20.0, TERRAIN_ABSOLUTE_MAX_DIST);
    }

    float terrainTraceTravelStep(float t) {
      float step = 0.28;
      step += smoothstep(30.0, 320.0, t) * 2.0;
      step += smoothstep(260.0, 1500.0, t) * 5.2;
      step += smoothstep(1300.0, 5200.0, t) * 12.0;
      step += smoothstep(4800.0, 14500.0, t) * 27.0;
      step += smoothstep(12500.0, 44000.0, t) * 62.0;
      step += smoothstep(38000.0, 105000.0, t) * 130.0;
      return step;
    }

    bool traceTerrain(vec3 ro, vec3 rd, out float tHit, out vec3 hitPos) {
      tHit = 0.0;
      hitPos = ro;
      float maxDist = sceneRenderDistance();
      float previousT = 0.0;
      float previousH = terrainDistance(ro);

      if (previousH <= 0.0) {
        tHit = 0.0;
        hitPos = ro;
        return true;
      }

      for (int i = 0; i < MAX_MARCH_STEPS; i++) {
        hitPos = ro + rd * tHit;
        float h = terrainDistance(hitPos);
        float absH = abs(h);
        float eps = MIN_HIT_EPS * max(1.0, tHit * 0.020);

        if (absH < eps || h <= 0.0 || previousH * h < 0.0) {
          float lo = previousT;
          float hi = tHit;
          for (int j = 0; j < 11; j++) {
            float mid = 0.5 * (lo + hi);
            vec3 midPos = ro + rd * mid;
            float midH = terrainDistance(midPos);
            if (midH > 0.0) {
              lo = mid;
            } else {
              hi = mid;
            }
          }
          tHit = hi;
          hitPos = ro + rd * tHit;
          return true;
        }

        previousT = tHit;
        previousH = h;
        float downAmount = max(-rd.y, 0.0);
        float absY = abs(rd.y);
        float verticalLimiter = max(absY, 0.16);
        float terrainStep = absH / verticalLimiter * 0.26;
        float travelStep = terrainTraceTravelStep(tHit);
        float nearSurface = 1.0 - smoothstep(10.0, 120.0, absH);
        float fastStep = max(min(terrainStep, 360.0), travelStep);
        float stableStep = min(terrainStep, travelStep * 0.55);
        float stepSize = mix(fastStep, stableStep, nearSurface);

        if (downAmount > 0.28 && h > 280.0) {
          float verticalStep = h / max(downAmount, 0.28) * 0.30;
          stepSize = max(stepSize, clamp(verticalStep, 6.0, 760.0));
        }

        float shallow = 1.0 - smoothstep(0.035, 0.22, absY);
        float maxStep = mix(900.0, 145.0, shallow);
        maxStep = mix(maxStep, 48.0, nearSurface);
        stepSize = clamp(stepSize, 0.025, maxStep);
        tHit += stepSize;

        if (tHit > maxDist) {
          break;
        }
      }

      return false;
    }

    vec3 terrainNormal(vec3 p) {
      float e = 0.24;
      float hL = sceneTerrainHeight(p.xz - vec2(e, 0.0));
      float hR = sceneTerrainHeight(p.xz + vec2(e, 0.0));
      float hD = sceneTerrainHeight(p.xz - vec2(0.0, e));
      float hU = sceneTerrainHeight(p.xz + vec2(0.0, e));
      return normalize(vec3(hL - hR, 2.0 * e, hD - hU));
    }

    float terrainShadow(vec3 origin, vec3 lightDir) {
      float strength = skyShadowStrength();
      float steps = skyShadowSteps();

      if (strength <= 0.001 || steps <= 0.5) {
        return 1.0;
      }

      float maxT = skyShadowDistance();
      float t = 0.35;
      float shadow = 1.0;

      for (int i = 0; i < 48; i++) {
        if (float(i) >= steps) {
          break;
        }
        vec3 p = origin + lightDir * t;
        float h = terrainDistance(p);
        if (h < 0.015) {
          return 1.0 - strength;
        }
        shadow = min(shadow, clamp(h * 10.0 / max(t, 0.001), 0.0, 1.0));
        t += clamp(h * 0.65, 0.08, 8.0);
        if (t > maxT) {
          break;
        }
      }

      return mix(1.0 - strength, 1.0, clamp(shadow, 0.0, 1.0));
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution.xy) / max(1.0, iResolution.y);
      vec3 ro = uCamPos;
      vec3 rd = normalize(uCamForward + uCamRight * uv.x + uCamUp * uv.y);

      vec3 rawSky = spaceColor(rd, ro, iTime);
      vec3 col = rawSky;
      float outAlpha = 0.0;
      const float TERRAIN_EFFECT_MAX_DIST = 30000.0;
      float volumeMaxT = TERRAIN_EFFECT_MAX_DIST;

      float tHit;
      vec3 hitPos;

      if (terrainEnabled() > 0.5 && traceTerrain(ro, rd, tHit, hitPos)) {
        volumeMaxT = min(volumeMaxT, tHit + 12.0);
        vec3 n = terrainNormal(hitPos);
        vec3 lightDir = skyLightDirection();
        vec3 lightColor = skyLightColor();
        float ambient = skyAmbient();

        vec3 albedo = terrainColor(hitPos, n, iTime);
        vec3 emission = terrainEmission(hitPos, n, iTime);

        float shadow = terrainShadow(hitPos + n * 0.25, lightDir);
        float diff = max(dot(n, lightDir), 0.0) * shadow;
        float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

        vec3 ambientCol = vec3(ambient, ambient, ambient * 1.22);
        vec3 lit = albedo * (ambientCol + diff * lightColor);
        lit += albedo * rim * 0.08;
        lit += emission;

        float maxDist = sceneRenderDistance();
        float fog = 1.0 - exp(-tHit * 0.00085);
        fog = clamp(fog, 0.0, 0.34);
        float distanceFade = smoothstep(maxDist * 0.90, maxDist, tHit);
        float horizonMask = pow(1.0 - abs(rd.y), 4.0);
        vec3 fogSky = mix(vec3(0.025, 0.030, 0.055), vec3(0.18, 0.15, 0.28), horizonMask);
        vec3 foggedTerrain = mix(lit, fogSky, fog);
        col = mix(foggedTerrain, rawSky, distanceFade);
        outAlpha = 1.0;
      }

      // Sky shader haze is applied after terrain composition so it can sit
      // visually over terrain, while clouds, atmosphere flow and fog remain
      // layered above it.
      col = skyShaderColor(rd, ro, iTime, col);

      // Atmosphere flow is a broad base layer. Keep it below aurora/clouds
      // so clouds remain visually on top instead of being washed over by flow.
      vec4 atmosphereLayer = applyAtmosphereLayer(col, rd, ro, gl_FragCoord.xy, iTime, volumeMaxT);
      col = atmosphereLayer.rgb;
      outAlpha = max(outAlpha, atmosphereLayer.a);

      vec4 auroraLayer = applyAuroraLayer(col, rd, ro, volumeMaxT);
      float auroraHorizonAmount = pow(1.0 - abs(rd.y), 2.0);
      float auroraTerrainFade = mix(1.0, 0.36, step(0.5, outAlpha));
      float auroraHorizonFade = mix(1.0, 0.82, auroraHorizonAmount);
      float auroraBlend = auroraTerrainFade * auroraHorizonFade;

      col = mix(col, auroraLayer.rgb, auroraBlend);
      outAlpha = max(outAlpha, auroraLayer.a * auroraBlend);

      vec4 clouded = applyCloudLayer(col, rd, ro, gl_FragCoord.xy, iTime, volumeMaxT);
      col = clouded.rgb;
      outAlpha = max(outAlpha, clouded.a);

      vec4 fogLayer = applyFogLayer(col, rd, ro, gl_FragCoord.xy, iTime, volumeMaxT);
      col = fogLayer.rgb;
      outAlpha = max(outAlpha, fogLayer.a);

      col = tonemap(col * 1.15);
      col = pow(clamp(col, 0.0, 1.0), vec3(0.94));
      gl_FragColor = vec4(clamp(col, vec3(0.0), vec3(1.0)), clamp(outAlpha, 0.0, 1.0));
    }
  `;
}

function createWhiteTexture() {
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}
