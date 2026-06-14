import * as THREE from "three";

const VERTEX_SHADER = /* glsl */`
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */`
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uCameraPosition;
uniform vec3 uCameraRight;
uniform vec3 uCameraUp;
uniform vec3 uCameraForward;
uniform vec4 uParamsA;
uniform vec4 uParamsB;
uniform vec4 uParamsC;
uniform vec4 uParamsD;
uniform float uCloudBaseHeight;

varying vec2 vUv;

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
  return uCloudBaseHeight + CLOUD_BASE_Y + h * CLOUD_HEIGHT_RANGE;
}

float cloudLayerHalfThickness(float softness, float deckThickness) {
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);
  float baseThickness = mix(12.0, 34.0, s);
  float thickness = clamp(deckThickness, 0.25, 8.0);
  return baseThickness * thickness;
}

float cloudVerticalMask(float worldY, float centerY, float halfThickness, float softness) {
  float d = (worldY - centerY) / max(halfThickness, 0.0001);
  float s = clamp((softness - 0.2) / 2.8, 0.0, 1.0);
  float body = exp(-d * d * mix(2.2, 0.85, s));
  float caps = 1.0 - smoothstep(0.84, 1.18, abs(d));
  return clamp(body * caps, 0.0, 1.0);
}

float cloudHeightOffset(vec3 samplePos, vec3 motion, float scale, float halfThickness, float heightVariation) {
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
  return centered * halfThickness * mix(0.0, 2.4, variation);
}

float cloudBigPatchCoverage(vec3 samplePos, vec3 motion, float freq, float bigPatches) {
  float big = clamp(bigPatches, 0.0, 1.0);
  if (big <= 0.001) {
    return 1.0;
  }
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
  float coverage = smoothstep(threshold, threshold + softness, field);
  if (big > 0.35) {
    vec3 edgeP = samplePos * freq * 0.082 + vec3(8.0, -13.0, 21.0);
    float edge = cloudFbm(edgeP + motion * 0.025, motion * 0.045);
    float erosion = smoothstep(0.22, 0.78, edge);
    coverage *= mix(1.0, erosion, (big - 0.35) / 0.65);
  }
  return clamp(coverage, 0.0, 1.0);
}

float cloudMap(vec3 samplePos, float worldY, vec3 motion, float density, float scale, float centerY, float halfThickness, float softness, float patchiness, float bigPatches, float heightVariation) {
  float freq = mix(0.045, 0.145, clamp(scale * 0.25, 0.0, 1.0));
  vec3 q = samplePos * freq;
  q.xz = vec2(q.x * 0.974 - q.z * 0.228, q.x * 0.228 + q.z * 0.974);
  q.xy = vec2(q.x * 0.994 + q.y * 0.110, -q.x * 0.110 + q.y * 0.994);
  float n = cloudFbm(q, motion);
  float localCenterY = centerY + cloudHeightOffset(samplePos, motion, scale, halfThickness, heightVariation);
  float vertical = cloudVerticalMask(worldY, localCenterY, halfThickness, softness);
  if (vertical <= 0.0001) {
    return 0.0;
  }
  float soft = mix(0.045, 0.22, clamp((softness - 0.2) * 0.35714285, 0.0, 1.0));
  float field = n + (density - 1.0) * 0.26;
  float shape = smoothstep(0.46 - soft, 0.72 + soft * 0.35, field);
  shape *= cloudBigPatchCoverage(samplePos, motion, freq, bigPatches);
  float patch = clamp(patchiness, 0.0, 1.0);
  if (patch > 0.001) {
    vec3 patchP = samplePos * freq * 0.155;
    patchP.xz = vec2(
      patchP.x * 0.812 - patchP.z * 0.584,
      patchP.x * 0.584 + patchP.z * 0.812
    );
    float patchNoise = cloudFbm(
      patchP + motion * 0.045 + vec3(31.7, 4.2, -18.9),
      motion * 0.12
    );
    float holeThreshold = mix(0.06, 0.68, patch);
    float holeSoftness = mix(0.34, 0.16, patch);
    float coverage = smoothstep(holeThreshold, holeThreshold + holeSoftness, patchNoise);
    shape *= coverage;
  }
  return clamp(shape * vertical, 0.0, 1.0);
}

vec3 cloudShade(float d, vec3 rd, vec3 sunDir, float brightness) {
  float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  float sunFacing = clamp(dot(rd, sunDir) * 0.5 + 0.5, 0.0, 1.0);
  float sunLift = clamp(sunDir.y * 0.5 + 0.5, 0.0, 1.0);
  float light = clamp(d * 0.75 + up * 0.35, 0.0, 1.0);
  vec3 night = vec3(0.18, 0.20, 0.26);
  vec3 base = mix(vec3(0.42, 0.46, 0.54), vec3(0.92, 0.92, 0.88), light);
  vec3 warm = max(uSunColor, vec3(0.85, 0.58, 0.34));
  vec3 col = mix(night, base, sunLift);
  col = mix(col, warm, pow(sunFacing, 5.0) * (0.18 + 0.45 * (1.0 - sunLift)));
  return clamp(col * brightness, 0.0, 1.0);
}

vec4 rayCloudsFast(vec3 ro, vec3 rd, float time, float cloudSpeed, float density, float scale, float height, float brightness, float softness, float maxTraceDistance, float fadeDistance, float deckThickness, float patchiness, float bigPatches, float heightVariation, vec3 sunDir) {
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
  float jitter = fract(sin(dot(vUv * uResolution.xy, vec2(12.9898, 78.233))) * 43758.5453);
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
    float d = cloudMap(worldPos, worldPos.y, motion, density, scale, centerY, halfThickness, softness, patchiness, bigPatches, heightVariation);
    if (d <= 0.001) {
      continue;
    }
    float fadeDist = clamp(fadeDistance, 1.0, maxTraceDistance);
    float renderEnd = maxTraceDistance;
    float fadeStart = max(0.0, renderEnd - fadeDist);
    float farFade = 1.0 - smoothstep(fadeStart, renderEnd, t);
    float a = clamp(d * 0.14 * farFade * thicknessAlphaCompensation, 0.0, 0.22);
    vec3 col = cloudShade(d, rd, sunDir, brightness);
    float remain = 1.0 - sum.a;
    sum.rgb += col * a * remain;
    sum.a += a * remain;
  }

  return clamp(sum, 0.0, 1.0);
}

void main() {
  vec2 p = vUv - 0.5;
  p.x *= uResolution.x / max(uResolution.y, 1.0);

  vec3 rd = normalize(
    uCameraRight * p.x +
    uCameraUp * p.y +
    uCameraForward * 1.15
  );

  float cloudSpeed = uParamsA.x;
  float density = uParamsA.y;
  float opacity = uParamsA.z;
  float scale = uParamsA.w;
  float height = uParamsB.x;
  float brightness = uParamsB.y;
  float softness = uParamsB.z;
  float hue = uParamsB.w;
  float saturation = uParamsC.x;
  float renderDistance = uParamsC.y;
  float fadeDistance = uParamsC.z;
  float deckThickness = uParamsC.w;
  float patchiness = uParamsD.x;
  float bigPatches = uParamsD.y;
  float heightVariation = uParamsD.z;

  if (opacity <= 0.001 || density <= 0.001) {
    discard;
  }

  vec3 ro = uCameraPosition;
  vec3 sunDir = normalize(uSunDirection);

  vec4 clouds = rayCloudsFast(
    ro,
    rd,
    uTime,
    cloudSpeed,
    density,
    scale,
    height,
    brightness,
    softness,
    renderDistance,
    fadeDistance,
    deckThickness,
    patchiness,
    bigPatches,
    heightVariation,
    sunDir
  );

  if (clouds.a <= 0.001) {
    discard;
  }

  vec3 cloudColor = clouds.rgb / max(clouds.a, 0.0001);
  if (abs(hue) > 0.001 || abs(saturation - 1.0) > 0.001) {
    cloudColor = cloudColorize(cloudColor, hue, saturation);
  }

  float alpha = clamp(clouds.a * opacity, 0.0, 0.97);
  gl_FragColor = vec4(cloudColor, alpha);
}
`;

export class TerrainCloudMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uSunDirection: { value: new THREE.Vector3(0.46, 0.72, 0.38).normalize() },
        uSunColor: { value: new THREE.Color(1.0, 0.72, 0.36) },
        uCameraPosition: { value: new THREE.Vector3(0, 24, 0) },
        uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
        uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
        uCameraForward: { value: new THREE.Vector3(0, 0, -1) },
        uParamsA: { value: new THREE.Vector4(0.25, 1.0, 0.55, 1.0) },
        uParamsB: { value: new THREE.Vector4(0.25, 1.0, 1.0, 0.0) },
        uParamsC: { value: new THREE.Vector4(1.0, 18000.0, 4500.0, 1.0) },
        uParamsD: { value: new THREE.Vector4(0.0, 0.0, 0.0, 0.0) },
        uCloudBaseHeight: { value: 0 }
      }
    });
  }

  setSize(width, height) {
    this.uniforms.uResolution.value.set(Math.max(1, width), Math.max(1, height));
  }

  updateClouds({ elapsedTime = 0, sunDirection, sunColor, terrainCamera, terrainBaseHeight = 0, settings = {} }) {
    this.uniforms.uTime.value = elapsedTime;
    this.uniforms.uCloudBaseHeight.value = Number.isFinite(terrainBaseHeight) ? terrainBaseHeight : 0;

    if (Array.isArray(sunDirection)) {
      this.uniforms.uSunDirection.value.set(
        Number(sunDirection[0] ?? 0),
        Number(sunDirection[1] ?? 1),
        Number(sunDirection[2] ?? 0)
      ).normalize();
    }

    if (Array.isArray(sunColor)) {
      this.uniforms.uSunColor.value.setRGB(
        Number(sunColor[0] ?? 1),
        Number(sunColor[1] ?? 1),
        Number(sunColor[2] ?? 1)
      );
    }

    if (terrainCamera?.position) {
      this.uniforms.uCameraPosition.value.copy(terrainCamera.position);
    }

    if (terrainCamera?.right && terrainCamera?.up && terrainCamera?.forward) {
      this.uniforms.uCameraRight.value.copy(terrainCamera.right).normalize();
      this.uniforms.uCameraUp.value.copy(terrainCamera.up).normalize();
      this.uniforms.uCameraForward.value.copy(terrainCamera.forward).normalize();
    }

    this.uniforms.uParamsA.value.set(
      settings.speed ?? 0.25,
      settings.density ?? 1.0,
      settings.opacity ?? 0.55,
      settings.scale ?? 1.0
    );

    this.uniforms.uParamsB.value.set(
      settings.height ?? 0.25,
      settings.brightness ?? 1.0,
      settings.softness ?? 1.0,
      settings.hue ?? 0.0
    );

    this.uniforms.uParamsC.value.set(
      settings.saturation ?? 0.0,
      settings.renderDistance ?? 18000.0,
      settings.fadeDistance ?? 4500.0,
      settings.deckThickness ?? 1.0
    );

    this.uniforms.uParamsD.value.set(
      settings.patchiness ?? 0.0,
      settings.bigPatches ?? 0.0,
      settings.heightVariation ?? 0.0,
      0.0
    );
  }
}
