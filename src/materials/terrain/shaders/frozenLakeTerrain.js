export const frozenLakeTerrainShader = {
  id: "frozen-lake",
  label: "Frozen Lake",
  description: "Flat frozen lake terrain inspired by TDM's Frozen Lake: deep ice, cyan cracks, bubbles and snow patches. Uses tex/noise.png as surface texture.",

  params: [
    { key: "baseHeight", label: "Base Height", min: -20.0, max: 20.0, step: 0.1, default: 0.0 },

    { key: "crackScale", label: "Crack Scale", min: 0.1, max: 1.0, step: 0.01, default: 0.60 },
    { key: "crackThickness", label: "Crack Thickness", min: 0.15, max: 2.0, step: 0.01, default: 0.90 },
    { key: "crackAlpha", label: "Crack Alpha", min: 0.0, max: 1.5, step: 0.01, default: 0.80 },
    { key: "snowAmount", label: "Snow Amount", min: 0.0, max: 2.0, step: 0.01, default: 0.85 },
    { key: "snowScale", label: "Snow Scale", min: 0.05, max: 1.0, step: 0.01, default: 0.42 },
    { key: "deepBrightness", label: "Ice Brightness", min: 0.2, max: 2.0, step: 0.01, default: 1.0 },
    { key: "fresnel", label: "Fresnel", min: 0.0, max: 2.5, step: 0.01, default: 1.0 },

    { key: "hue", label: "Ice Hue", min: -3.14, max: 3.14, step: 0.01, default: 0.0 },
    { key: "renderDistance", label: "Render Distance", min: 80.0, max: 15000.0, step: 20.0, default: 1600.0 },

    // Performance scaler.
    // 0 = cheap, 1 = full detail.
    { key: "quality", label: "Quality", min: 0.0, max: 1.0, step: 0.01, default: 0.45 }
  ],

  heightAtWorld({ params }) {
    return params.baseHeight;
  },

  glsl: `
/*
  Frozen Lake terrain material for Planet-Flyer.

  Inspired by:
  "Frozen Lake" by Alexander Alekseev aka TDM, 2019
  License: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported

  This module only ports the lake surface idea:
  no Shadertoy camera, no mountains, no sky, no clouds.
*/

float terrainEnabled() {
  return 1.0;
}

float terrainHeight(vec2 xz, float time) {
  xz += vec2(0.0);
  time += 0.0;

  return terrainParam(0);
}

float terrainRenderDistance() {
  return clamp(terrainParam(9), 80.0, 15000.0);
}

float frozenQuality() {
  return clamp(terrainParam(10), 0.0, 1.0);
}

vec3 frozenHueRotate(vec3 col, float hueShift) {
  float s = sin(hueShift);
  float c = cos(hueShift);

  mat3 m = mat3(
    vec3(0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787),
    vec3(0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715),
    vec3(0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072)
  );

  return clamp(m * col, 0.0, 2.5);
}

float frozenTri(float x) {
  return abs(fract(x) - 0.5) * 2.0;
}

float frozenHash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float frozenHash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float frozenTexNoise(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(frozenHash21(i + vec2(0.0, 0.0)), frozenHash21(i + vec2(1.0, 0.0)), u.x),
    mix(frozenHash21(i + vec2(0.0, 1.0)), frozenHash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float frozenNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = frozenHash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = frozenHash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = frozenHash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = frozenHash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = frozenHash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = frozenHash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = frozenHash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = frozenHash31(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);

  return mix(nxy0, nxy1, f.z);
}

float frozenFbm2(vec2 p) {
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

  float a = 0.5;
  float f = 0.0;
  float w = 0.0;

  for (int i = 0; i < 6; i++) {
    f += frozenTexNoise(p) * a;
    w += a;
    p = m * p + 17.13;
    a *= 0.55;
  }

  return f / max(w, 0.0001);
}

float frozenVoronoiEdge(vec2 p) {
  vec2 g = floor(p);
  vec2 f = fract(p);

  float d1 = 1000.0;
  float d2 = 1000.0;

  // Cheap F1/F2 cell edge approximation.
  // Much faster than the full Shadertoy-style edge loop.
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = vec2(float(x), float(y));

      vec2 h = vec2(
        frozenHash21(g + cell + vec2(13.1, 7.7)),
        frozenHash21(g + cell + vec2(41.3, 19.9))
      );

      vec2 r = cell + h - f;
      float d = dot(r, r);

      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }

  return max(sqrt(d2) - sqrt(d1), 0.0);
}

float frozenMapCracks1(vec3 p) {
  float scale = 0.10;

  p.x += sin(p.z * 0.20) * 2.0;
  p.x += frozenTri(p.z * 0.053) * 2.0;
  p.z += frozenTri(p.x * 0.103) * 2.0;

  return frozenVoronoiEdge(p.xz * scale) / scale * 0.90;
}

float frozenMapCracks2(vec3 p) {
  float scale = 0.25;

  p.x += frozenTri(p.z * 0.153) * 1.5;
  p.z += frozenTri(p.x * 0.203) * 1.5;

  return frozenVoronoiEdge(p.xz * scale) / scale * 0.90;
}

vec2 frozenTraceCracks1(vec3 ori, vec3 dir, out vec3 p) {
  float t = 0.0;
  float d = 0.0;
  float q = frozenQuality();

  for (int i = 0; i < 7; i++) {
    if (q < 0.35 && i >= 4) {
      break;
    }

    p = ori + dir * t;
    d = frozenMapCracks1(p);

    if (d < 0.001) {
      break;
    }

    t += d * 0.95;
  }

  return vec2(d, t);
}

vec2 frozenTraceCracks2(vec3 ori, vec3 dir, float s, out vec3 p) {
  float t = 0.0;
  float d = 0.0;
  float q = frozenQuality();

  for (int i = 0; i < 5; i++) {
    if (q < 0.55 && i >= 3) {
      break;
    }

    p = ori + dir * t;
    d = frozenMapCracks2(p * s);

    if (d < 0.001) {
      break;
    }

    t += d;
  }

  return vec2(d, t);
}

vec2 frozenTraceCracks3(vec3 ori, vec3 dir, out vec3 p) {
  float t = 0.0;
  float d = 0.0;

  for (int i = 0; i < 3; i++) {
    p = ori + dir * t;
    d = frozenMapCracks1(p * 0.7);

    if (d < 0.001) {
      break;
    }

    t += d;
  }

  return vec2(d, t);
}

vec2 frozenNormalCracks1(vec3 p) {
  float e = 0.005;
  float t = frozenMapCracks1(p);

  vec2 n;
  n.x = frozenMapCracks1(vec3(p.x + e, p.y, p.z)) - t;
  n.y = frozenMapCracks1(vec3(p.x, p.y, p.z + e)) - t;

  return normalize(n + 0.0001);
}

vec2 frozenNormalCracks2(vec3 p) {
  float e = 0.005;
  float t = frozenMapCracks2(p);

  vec2 n;
  n.x = frozenMapCracks2(vec3(p.x + e, p.y, p.z)) - t;
  n.y = frozenMapCracks2(vec3(p.x, p.y, p.z + e)) - t;

  return normalize(n + 0.0001);
}

float frozenSnowMask(vec2 p) {
  float snowScale = max(0.001, terrainParam(5));

  p *= snowScale;

  float f = frozenFbm2(p * 0.10);
  float crust = frozenFbm2(p * 0.47 + 11.4);
  float streak = frozenFbm2(vec2(p.x * 0.055, p.y * 0.34) + vec2(7.0, -2.0));

  f = mix(f, crust, 0.45);
  f = max(f, streak * 0.72);

  f = smoothstep(0.50, 0.69, f);
  f = pow(f, 0.32);

  return clamp(f * terrainParam(4), 0.0, 1.0);
}

float frozenBubbleLayer(vec3 p, float layerHeight, float amount) {
  vec3 bp = p;
  bp.y += layerHeight;

  float n = frozenNoise3(bp * vec3(13.0, 18.0, 13.0));
  float b = pow(n, 22.0);

  float cluster = smoothstep(0.42, 0.92, frozenFbm2(bp.xz * 0.18 + layerHeight));

  return b * cluster * amount;
}

vec3 frozenFakeReflection(vec3 viewDir, vec3 normal) {
  vec3 r = reflect(viewDir, normal);
  float up = clamp(r.y * 0.5 + 0.5, 0.0, 1.0);
  float horizon = pow(1.0 - up, 2.2);

  vec3 top = vec3(0.33, 0.58, 0.78);
  vec3 low = vec3(0.06, 0.10, 0.13);

  return mix(low, top, up) + vec3(0.08, 0.13, 0.16) * horizon;
}

vec3 frozenObjectColor(vec3 worldPos, vec3 composerNormal, float time) {
  time += 0.0;

  float crackScale = max(0.001, terrainParam(1));
  float crackThickness = max(0.001, terrainParam(2));
  float crackAlpha = terrainParam(3);
  float deepBrightness = terrainParam(6);
  float fresnelStrength = terrainParam(7);
  float surfaceNoise = 0.0;
  float hue = terrainParam(8);

  vec3 cam = uCamPos;
  vec3 viewDir = normalize(worldPos - cam);

  vec3 p = vec3(worldPos.x, 0.0, worldPos.z) * crackScale;

  float depth = length(worldPos - cam);
  float depthF = max(depth * 0.018, 1.0);

  float globalThickness = 0.6 + 0.8 * smoothstep(0.2, 0.8, frozenNoise3(p * 0.05));
  globalThickness *= crackThickness;

  vec2 surfNoise = vec2(
    frozenTexNoise(worldPos.xz * 0.037 + 3.1),
    frozenTexNoise(worldPos.xz * 0.041 - 9.7)
  ) * 2.0 - 1.0;

  vec3 iceNormal = vec3(
    surfNoise.x * 0.08 * surfaceNoise,
    1.0,
    surfNoise.y * 0.08 * surfaceNoise
  );

  iceNormal.xz += vec2(
    frozenTexNoise(worldPos.xz * 0.21 + 17.3),
    frozenTexNoise(worldPos.xz * 0.19 - 22.8)
  ) * 0.06 * surfaceNoise;

  iceNormal = normalize(mix(composerNormal, iceNormal, 0.82));

  vec3 iceDir = viewDir;
  iceDir.y = -abs(iceDir.y) - 0.04;
  iceDir = normalize(iceDir);

  vec3 cp;

  frozenTraceCracks1(p, iceDir, cp);
  vec2 cr1Normal = frozenNormalCracks1(cp);
  float crackDepth1 = abs(cp.y - p.y);
  crackDepth1 = pow(max(1.0 - crackDepth1 * 0.20 / globalThickness, 0.0), 5.0) * 0.60;
  crackDepth1 *= 0.5 + 0.5 * frozenNoise3(cp * vec3(0.7, 10.0, 0.7));
  crackDepth1 *= abs(cr1Normal.x) * 0.6 + 0.4;

  frozenTraceCracks2(p, iceDir, 1.0, cp);
  vec2 cr2Normal = frozenNormalCracks2(cp);
  float crackDepth2 = abs(cp.y - p.y);
  crackDepth2 = pow(max(1.0 - crackDepth2 * 0.40 / globalThickness, 0.0), 5.0) * 0.60;
  crackDepth2 *= 0.5 + 0.5 * smoothstep(0.2, 0.9, frozenNoise3(cp * vec3(12.0, 1.0, 12.0)));
  crackDepth2 *= 0.5 + 0.5 * frozenNoise3(cp * vec3(1.0, 20.0, 1.0));
  crackDepth2 *= abs(cr2Normal.x) * 0.6 + 0.4;

  frozenTraceCracks2(p, iceDir, 1.5, cp);
  float crackDepth3 = abs(cp.y - p.y);
  crackDepth3 = pow(max(1.0 - crackDepth3 * 3.0 / globalThickness, 0.0), 5.0) * 0.30;
  crackDepth3 *= 0.5 + 0.5 * smoothstep(0.3, 0.9, frozenNoise3(cp * vec3(17.0, 1.0, 17.0)));

  float q = frozenQuality();

  float crackDepth4 = 0.0;

  if (q > 0.55) {
    vec2 c4n = vec2(
      frozenTexNoise(p.xz * 30.0 + 2.0),
      frozenTexNoise(p.xz * 30.0 - 5.0)
    ) * 0.4;

    frozenTraceCracks3(p, iceDir + c4n.xxy, cp);
    crackDepth4 = abs(cp.y - p.y + 2.0);
    crackDepth4 = pow(max(1.0 - crackDepth4 * 0.20 / globalThickness, 0.0), 3.0) * 0.15;
    crackDepth4 *= 0.5 + 0.5 * frozenNoise3(cp * vec3(0.7, 10.0, 0.7));
  }

  vec3 deepColor = vec3(0.0, 0.12, 0.20) * deepBrightness;
  vec3 col = deepColor;

  vec3 crackColor = vec3(0.30, 0.95, 1.00) * 1.20;
  vec3 crackTop = vec3(1.60);

  float a = 0.4 + 0.6 * smoothstep(0.2, 0.8, frozenNoise3(p * 0.07));
  a *= crackAlpha;

  col = mix(col, mix(crackColor, crackTop, crackDepth4), crackDepth4 * a);
  col = mix(col, mix(crackColor, crackTop, crackDepth3), crackDepth3 * a);
  col = mix(col, mix(crackColor, crackTop, crackDepth2), crackDepth2 * a);
  col = mix(col, mix(crackColor, crackTop, crackDepth1), crackDepth1 * a);

  float fresnel = pow(max(1.0 - dot(-viewDir, iceNormal), 0.0), 5.0) * 0.9 + 0.1;
  fresnel = clamp(fresnel * fresnelStrength, 0.0, 1.0);

  vec3 reflection = frozenFakeReflection(viewDir, iceNormal);
  col = mix(col, reflection, fresnel * 0.58);

  float snow = frozenSnowMask(p.xz * 0.1) / depthF;
  vec3 snowColor = vec3(0.85, 0.98, 1.0);

  col = mix(col, snowColor, snow);

  float fine = frozenTexNoise(worldPos.xz * 0.65);
  col *= 0.88 + fine * 0.18 * surfaceNoise;

  col = frozenHueRotate(col, hue);

  return clamp(col, 0.0, 2.5);
}

vec3 terrainColor(vec3 worldPos, vec3 normal, float time) {
  return frozenObjectColor(worldPos, normal, time);
}

vec3 terrainEmission(vec3 worldPos, vec3 normal, float time) {
  worldPos += vec3(0.0);
  normal += vec3(0.0);
  time += 0.0;

  // Keep emission cheap. Crack brightness is already baked into terrainColor.
  return vec3(0.0);
}
`
};