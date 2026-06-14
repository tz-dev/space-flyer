// TerrainView aurora layer, ported from the older Planet-Flyer terrain composer.
// Kept as a single inline GLSL layer so it can share TerrainSurfaceMaterial ray setup,
// sky color, terrain occlusion distance and alpha output.

export const auroraLayerGlsl = /* glsl */`
mat2 auroraRot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float auroraTri(float x) {
  return clamp(abs(fract(x) - 0.5), 0.01, 0.49);
}

vec2 auroraTri2(vec2 p) {
  return vec2(
    auroraTri(p.x) + auroraTri(p.y),
    auroraTri(p.y + auroraTri(p.x))
  );
}

float auroraNoise2d(vec2 p, float spd) {
  float z = 1.8;
  float z2 = 2.5;
  float rz = 0.0;
  vec2 bp;

  p = auroraRot(p.x * 0.06) * p;
  bp = p;

  for (int i = 0; i < 4; i++) {
    vec2 dg = auroraTri2(bp * 1.85) * 0.75;
    dg = auroraRot(iTime * spd) * dg;
    p -= dg / z2;

    bp *= 1.3;
    z2 *= 0.45;
    z *= 0.42;
    p *= 1.21 + (rz - 1.0) * 0.02;

    rz += auroraTri(p.x + auroraTri(p.y)) * z;
    p = (-mat2(0.95534, 0.29552, -0.29552, 0.95534)) * p;
  }

  return clamp(1.0 / pow(rz * 29.0, 1.3), 0.0, 0.55);
}

float auroraHash21(vec2 n) {
  return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

vec3 auroraPalette(float t) {
  return sin(1.0 - vec3(2.15, -0.5, 1.2) + t) * 0.5 + 0.5;
}

float auroraVerticalMask(float y, float centerY, float halfThickness) {
  float d = (y - centerY) / max(halfThickness, 0.0001);
  float core = exp(-d * d * 1.35);
  float lowerFade = smoothstep(-1.45, -0.08, d);
  float upperFade = 1.0 - smoothstep(0.55, 2.25, d);
  return clamp(core * lowerFade * upperFade, 0.0, 1.0);
}

vec4 auroraSampleVolume(vec3 ro, vec3 rd, float maxTraceDistance) {
  float enabled = auroraParam(0);
  float intensity = max(0.0, auroraParam(1));
  float speed = max(0.0, auroraParam(2));
  float bandScale = max(1.0, auroraParam(3));
  float baseHeight = auroraParam(4);
  float spread = max(0.01, auroraParam(5));
  float trail = max(0.0, auroraParam(6));
  float glow = max(0.0, auroraParam(7));

  if (enabled < 0.5 || intensity <= 0.0 || glow <= 0.0 || maxTraceDistance <= 1.0) {
    return vec4(0.0);
  }

  rd = normalize(rd);

  float halfThickness = max(30.0, spread * 115.0);

  float verticalDistance = abs(ro.y - baseHeight);
  float farT = mix(
    560.0,
    1450.0,
    clamp(verticalDistance / max(halfThickness * 3.0, 1.0), 0.0, 1.0)
  );

  farT = min(farT, maxTraceDistance);

  if (farT <= 1.0) {
    return vec4(0.0);
  }

  vec2 auroraOriginXZ = ro.xz * 0.08;
  vec2 driftA = vec2(iTime * speed * 0.020, iTime * speed * 0.010);
  vec2 driftB = vec2(-iTime * speed * 0.035, iTime * speed * 0.015);

  float rayJitter = auroraHash21(gl_FragCoord.xy * 0.73);

  vec4 acc = vec4(0.0);
  const int SAMPLES = 28;

  for (int i = 0; i < SAMPLES; i++) {
    float fi = float(i);
    float sample01 = (fi + rayJitter) / float(SAMPLES);
    float eased = sample01 * sample01 * (3.0 - 2.0 * sample01);
    float t = mix(0.0, farT, eased);
    vec3 pos = ro + rd * t;

    float roughD = abs(pos.y - baseHeight) / halfThickness;
    if (roughD > 3.2) {
      continue;
    }

    vec2 p = (auroraOriginXZ + rd.xz * t) / bandScale;

    float n1 = auroraNoise2d(p + driftA, speed * 0.05);
    float n2 = auroraNoise2d(p * 2.1 + driftB, speed * 0.08);
    float n3 = clamp(n1 * 0.6 + n2 * 0.4, 0.0, 0.55);

    float columnWarp = (n1 - 0.24) * halfThickness * 0.95;
    float localCenterY = baseHeight + columnWarp;

    float vertical = auroraVerticalMask(pos.y, localCenterY, halfThickness);
    if (vertical <= 0.00001) {
      continue;
    }

    float bands = smoothstep(0.045, 0.38, n1);
    float filaments = mix(0.68, 1.45, n2);
    float body = mix(0.70, 1.18, n3);

    float density = vertical * bands * filaments * body;
    density *= mix(0.42, 1.55, clamp(trail, 0.0, 1.0));
    density *= intensity;

    float distanceFade = 1.0 / (1.0 + t * 0.0016);
    float alpha = clamp(density * distanceFade * 0.058, 0.0, 0.150);

    float colorT =
      0.25 + n1 * 0.90 + n2 * 0.35 +
      pos.x * 0.0015 + pos.z * 0.0007;

    vec3 sampleCol = auroraPalette(colorT);
    sampleCol *= alpha * glow * 1.08;

    float remain = 1.0 - acc.a;
    acc.rgb += sampleCol * remain;
    acc.a += alpha * remain;

    if (acc.a >= 0.96) {
      break;
    }
  }

  return acc;
}

vec4 applyAuroraLayer(vec3 baseCol, vec3 rd, vec3 ro, float maxTraceDistance) {
  float enabled = auroraParam(0);

  if (enabled < 0.5) {
    return vec4(baseCol, 0.0);
  }

  float horizonFade = clamp(auroraParam(8), 0.0, 2.0);
  vec4 aur = auroraSampleVolume(ro, rd, maxTraceDistance);

  float horizonAmount = pow(1.0 - abs(rd.y), 2.0);
  float sideViewFade = mix(1.0, 0.74, clamp(horizonAmount * horizonFade, 0.0, 1.0));

  aur.rgb *= sideViewFade;
  aur.a = clamp(aur.a * sideViewFade, 0.0, 1.0);

  vec3 layered = baseCol * (1.0 - aur.a * 0.64) + aur.rgb;
  return vec4(layered, aur.a);
}
`;
