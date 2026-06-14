import * as THREE from "three";

export class BlackHoleMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      depthWrite: false,
      depthTest: false,
      transparent: false,
      uniforms: {
        tBackground: { value: null },
        tNoiseRgb: { value: null },
        tNoiseRaw: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uObjectMode: { value: 0 },
        uLensStrength: { value: 1.0 },
        uEventHorizonRadius: { value: 0.105 },
        uDiskRadius: { value: 0.335 },
        uDiskThickness: { value: 0.12 },
        uDiskTilt: { value: 0.34 },
        uGlowStrength: { value: 1.0 },
        uViewScale: { value: 1.0 },
        uViewAngles: { value: new THREE.Vector2(0, 0) },
        uColorHue: { value: 0.0 },
        uColorSaturation: { value: 1.0 },
        uColorRgb: { value: new THREE.Vector3(1, 1, 1) },
        uObjectExposure: { value: 1.0 },
        uObjectGamma: { value: 1.0 },
        uParamA: { value: 0.0 },
        uParamB: { value: 0.0 },
        uParamC: { value: 0.0 },
        uParamD: { value: 0.0 },
        uParamE: { value: 0.0 },
        uParamF: { value: 0.0 }
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        uniform sampler2D tBackground;
        uniform sampler2D tNoiseRgb;
        uniform sampler2D tNoiseRaw;
        uniform vec2 uResolution;
        uniform float uTime;
        uniform int uObjectMode;
        uniform float uLensStrength;
        uniform float uEventHorizonRadius;
        uniform float uDiskRadius;
        uniform float uDiskThickness;
        uniform float uDiskTilt;
        uniform float uGlowStrength;
        uniform float uViewScale;
        uniform vec2 uViewAngles;
        uniform float uColorHue;
        uniform float uColorSaturation;
        uniform vec3 uColorRgb;
        uniform float uObjectExposure;
        uniform float uObjectGamma;
        uniform float uParamA;
        uniform float uParamB;
        uniform float uParamC;
        uniform float uParamD;
        uniform float uParamE;
        uniform float uParamF;

        varying vec2 vUv;

        const float PI = 3.14159265359;
        const float BH_STEPS = 12.0;
        const float BH_SIZE = 0.2;

        float hash(float x) {
          return fract(sin(x) * 152754.742);
        }

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float hash(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }

        vec2 random2(vec2 st) {
          st = vec2(dot(st, vec2(127.1, 311.7)), dot(st, vec2(269.5, 183.3)));
          return -1.0 + 2.0 * fract(sin(st) * 43758.5453123 * 0.3897);
        }

        float valueNoise(vec2 p, float f) {
          vec2 ip = floor(p * f);
          vec2 fp = fract(p * f);
          fp = fp * fp * (3.0 - 2.0 * fp);

          float bl = hash(ip + vec2(0.0, 0.0));
          float br = hash(ip + vec2(1.0, 0.0));
          float tl = hash(ip + vec2(0.0, 1.0));
          float tr = hash(ip + vec2(1.0, 1.0));
          float b = mix(bl, br, fp.x);
          float t = mix(tl, tr, fp.x);
          return mix(b, t, fp.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);

          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));

          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float gradientNoise2(vec2 st) {
          vec2 i = floor(st);
          vec2 f = fract(st);
          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(
            mix(
              dot(random2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
              dot(random2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)),
              u.x
            ),
            mix(
              dot(random2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
              dot(random2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)),
              u.x
            ),
            u.y
          );
        }

        float fbm2(vec2 x) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));

          for (int i = 0; i < 5; i += 1) {
            v += a * gradientNoise2(x);
            x = rot * x * 2.0 + vec2(100.0);
            a *= 0.5;
          }

          return v;
        }

        vec3 random3(vec3 p) {
          return -1.0 + 2.0 * fract(sin(vec3(
            dot(p, vec3(127.1, 311.7, 74.7)),
            dot(p, vec3(269.5, 183.3, 246.1)),
            dot(p, vec3(113.5, 271.9, 124.6))
          )) * 43758.5453123);
        }

        float gradNoise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);

          float n000 = dot(random3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0));
          float n100 = dot(random3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0));
          float n010 = dot(random3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0));
          float n110 = dot(random3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0));
          float n001 = dot(random3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0));
          float n101 = dot(random3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0));
          float n011 = dot(random3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0));
          float n111 = dot(random3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0));

          float nx00 = mix(n000, n100, u.x);
          float nx10 = mix(n010, n110, u.x);
          float nx01 = mix(n001, n101, u.x);
          float nx11 = mix(n011, n111, u.x);
          float nxy0 = mix(nx00, nx10, u.y);
          float nxy1 = mix(nx01, nx11, u.y);
          return mix(nxy0, nxy1, u.z);
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);

          float n000 = hash(i + vec3(0.0, 0.0, 0.0));
          float n100 = hash(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash(i + vec3(1.0, 1.0, 1.0));

          float nx00 = mix(n000, n100, u.x);
          float nx10 = mix(n010, n110, u.x);
          float nx01 = mix(n001, n101, u.x);
          float nx11 = mix(n011, n111, u.x);
          float nxy0 = mix(nx00, nx10, u.y);
          float nxy1 = mix(nx01, nx11, u.y);
          return mix(nxy0, nxy1, u.z);
        }

        float snoise(vec3 uv, float res) {
          uv *= res;
          vec3 i = floor(mod(uv, res));
          vec3 f = fract(uv);
          f = f * f * (3.0 - 2.0 * f);

          float n000 = hash(i + vec3(0.0, 0.0, 0.0));
          float n100 = hash(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash(i + vec3(1.0, 1.0, 1.0));

          float nx00 = mix(n000, n100, f.x);
          float nx10 = mix(n010, n110, f.x);
          float nx01 = mix(n001, n101, f.x);
          float nx11 = mix(n011, n111, f.x);
          float nxy0 = mix(nx00, nx10, f.y);
          float nxy1 = mix(nx01, nx11, f.y);

          return mix(nxy0, nxy1, f.z) * 2.0 - 1.0;
        }

        mat2 rotation2d(float angle) {
          float s = sin(angle);
          float c = cos(angle);
          return mat2(c, -s, s, c);
        }

        vec3 rotateY(vec3 p, float t) {
          float c = cos(t);
          float s = sin(t);
          return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * p;
        }

        vec3 rotateXObject(vec3 p, float t) {
          float c = cos(t);
          float s = sin(t);
          return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
        }

        void rotateBH(inout vec3 vector, vec2 angle) {
          vector.yz = cos(angle.y) * vector.yz + sin(angle.y) * vec2(-1.0, 1.0) * vector.zy;
          vector.xz = cos(angle.x) * vector.xz + sin(angle.x) * vec2(-1.0, 1.0) * vector.zx;
        }

        vec2 mirrorWrapUv(vec2 uv) {
          vec2 wrapped = abs(fract(uv * 0.5) * 2.0 - 1.0);
          return clamp(wrapped, vec2(0.001), vec2(0.999));
        }

        vec3 sampleBackground(vec2 uv) {
          vec2 safeUv = clamp(uv, vec2(0.001), vec2(0.999));
          return texture2D(tBackground, safeUv).rgb;
        }

        vec2 rayToBackgroundUv(vec3 ray) {
          float z = max(ray.z, 0.055);
          float backgroundScale = max(uParamF, 0.05);
          return vec2(
            0.5 + ray.x / (z * backgroundScale),
            0.5 + ((ray.y / z) * (uResolution.x / max(uResolution.y, 1.0))) / backgroundScale
          );
        }

        vec3 sampleBackgroundRay(vec3 ray) {
          return texture2D(tBackground, mirrorWrapUv(rayToBackgroundUv(ray))).rgb;
        }

        float gaussianRing(float radius, float center, float width) {
          float x = (radius - center) / max(width, 0.0001);
          return exp(-x * x);
        }

        vec3 acesTonemap(vec3 color) {
          mat3 m1 = mat3(
            0.59719, 0.07600, 0.02840,
            0.35458, 0.90834, 0.13383,
            0.04823, 0.01566, 0.83777
          );
          mat3 m2 = mat3(
            1.60475, -0.10208, -0.00327,
            -0.53108, 1.10813, -0.07276,
            -0.07367, -0.00605, 1.07602
          );
          vec3 v = m1 * color;
          vec3 a = v * (v + 0.0245786) - 0.000090537;
          vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
          return pow(clamp(m2 * (a / b), 0.0, 1.0), vec3(1.0 / 2.2));
        }

        vec3 hueShift(vec3 color, float hue) {
          float angle = hue * 6.28318530718;
          float s = sin(angle);
          float c = cos(angle);
          mat3 m = mat3(
            vec3(0.299, 0.587, 0.114),
            vec3(0.299, 0.587, 0.114),
            vec3(0.299, 0.587, 0.114)
          ) + mat3(
            vec3(0.701, -0.587, -0.114),
            vec3(-0.299, 0.413, -0.114),
            vec3(-0.300, -0.588, 0.886)
          ) * c + mat3(
            vec3(0.168, 0.330, -0.497),
            vec3(-0.328, 0.035, 0.292),
            vec3(1.250, -1.050, -0.203)
          ) * s;
          return clamp(color * m, vec3(0.0), vec3(10.0));
        }

        vec3 applyObjectColorControls(vec3 color) {
          color = max(color, vec3(0.0));
          color = hueShift(color, uColorHue);
          float luma = dot(color, vec3(0.299, 0.587, 0.114));
          color = mix(vec3(luma), color, max(uColorSaturation, 0.0));
          color *= max(uColorRgb, vec3(0.0));
          return color;
        }

        vec3 applyExposureGamma(vec3 color) {
          color *= max(uObjectExposure, 0.0);
          color = pow(max(color, vec3(0.0)), vec3(1.0 / max(uObjectGamma, 0.05)));
          return color;
        }

        vec3 isolateObjectColorControls(vec3 backgroundColor, vec3 compositeColor) {
          vec3 delta = compositeColor - backgroundColor;
          vec3 positiveDelta = max(delta, vec3(0.0));
          vec3 negativeDelta = min(delta, vec3(0.0));
          return backgroundColor + negativeDelta + applyObjectColorControls(positiveDelta);
        }

        vec4 raymarchDisk(vec3 ray, vec3 zeroPos, float size, float diskOuterRadius, float diskInnerRadius) {
          vec3 position = zeroPos;
          float lengthPos = max(length(position.xz), 0.0001);
          float dist = min(1.0, lengthPos * (1.0 / size) * 0.5) * size * 0.4 * (1.0 / BH_STEPS) / max(abs(ray.y), 0.0001);

          position += dist * BH_STEPS * ray * 0.5;

          vec2 deltaPos;
          deltaPos.x = -zeroPos.z * 0.01 + zeroPos.x;
          deltaPos.y = zeroPos.x * 0.01 + zeroPos.z;
          deltaPos = normalize(deltaPos - zeroPos.xz + vec2(0.0001));

          float parallel = dot(ray.xz, deltaPos);
          parallel /= sqrt(lengthPos);
          parallel *= 0.5;
          float redShift = parallel + 0.3;
          redShift *= redShift;
          redShift = clamp(redShift, 0.0, 1.0);

          float disMix = clamp((lengthPos - size * 2.0) * (1.0 / size) * 0.24, 0.0, 1.0);
          vec3 insideCol = mix(vec3(1.0, 0.8, 0.0), vec3(0.5, 0.13, 0.02) * 0.2, disMix);
          insideCol *= mix(vec3(0.4, 0.2, 0.1), vec3(1.6, 2.4, 4.0), redShift);
          insideCol *= 1.25;
          redShift += 0.12;
          redShift *= redShift;

          vec4 o = vec4(0.0);

          for (int stepIndex = 0; stepIndex < 12; stepIndex += 1) {
            float i = float(stepIndex);
            position -= dist * ray;

            float intensity = clamp(1.0 - abs((i - 0.8) * (1.0 / BH_STEPS) * 2.0), 0.0, 1.0);
            float lp = max(length(position.xz), 0.0001);
            float distMult = 1.0;
            distMult *= clamp((lp - diskInnerRadius) / max(size * 0.35, 0.0001), 0.0, 1.0);
            distMult *= clamp((diskOuterRadius - lp) / max(size * 2.0, 0.0001), 0.0, 1.0);
            distMult *= distMult;

            float u = lp + uTime * size * 0.3 + intensity * size * 0.2;
            float rot = mod(uTime * 1.0, 8192.0);
            vec2 xy;
            xy.x = -position.z * sin(rot) + position.x * cos(rot);
            xy.y = position.x * sin(rot) + position.z * cos(rot);

            float x = abs(xy.x / max(abs(xy.y), 0.0001));
            float angle = 0.02 * atan(x);
            float diskNoise = valueNoise(vec2(angle, u * (1.0 / size) * 0.05), 70.0);
            diskNoise = diskNoise * 0.66 + 0.33 * valueNoise(vec2(angle, u * (1.0 / size) * 0.05), 140.0);

            float extraWidth = diskNoise * (1.0 - clamp(i * (1.0 / BH_STEPS) * 2.0 - 1.0, 0.0, 1.0));
            float alpha = clamp(diskNoise * (intensity + extraWidth) * ((1.0 / size) * 10.0 + 0.01) * dist * distMult, 0.0, 1.0);

            vec3 col = 2.0 * mix(vec3(0.3, 0.2, 0.15) * insideCol, insideCol, min(1.0, intensity * 2.0));
            o = clamp(vec4(col * alpha + o.rgb * (1.0 - alpha), o.a * (1.0 - alpha) + alpha), vec4(0.0), vec4(1.0));

            lp *= 1.0 / size;
            o.rgb += redShift * (intensity + 0.5) * (1.0 / BH_STEPS) * 100.0 * distMult / max(lp * lp, 0.0001);
          }

          o.rgb = clamp(o.rgb - 0.005, 0.0, 1.0);
          return o;
        }

        vec3 blackHoleColor(vec2 fragCoord) {
          vec2 center = 0.5 * uResolution.xy;
          float viewZoom = clamp(uViewScale, 0.62, 1.5);
          vec2 baseUv = fragCoord / uResolution;
          vec3 baseBackground = sampleBackground(baseUv);
          vec2 localFrag = center + (fragCoord - center) / viewZoom;
          vec2 fragCoordRot;
          fragCoordRot.x = localFrag.x * 0.985 + localFrag.y * 0.174;
          fragCoordRot.y = localFrag.y * 0.985 - localFrag.x * 0.174;
          fragCoordRot += vec2(0.06, 0.12) * uResolution.xy;

          vec3 ray = normalize(vec3((fragCoordRot - center) / uResolution.x, 1.0));
          vec3 originalRay = ray;
          vec3 pos = vec3(0.0, 0.05, -5.0);
          vec2 angle = vec2(0.1, 3.34);
          float dist = length(pos);
          rotateBH(pos, angle);
          angle.xy -= min(0.3 / dist, PI) * vec2(1.0, 0.5);
          rotateBH(ray, angle);
          rotateBH(originalRay, angle);

          float size = clamp(uParamB > 0.0 ? uParamB : BH_SIZE, 0.04, 0.24);
          float diskOuterRadius = size * (2.0 + clamp(uParamC, 0.0, 1.0) * 16.0);
          float diskInnerRadius = size * 0.72;
          float diskHalfThickness = size * 0.035;
          float tiltFrequency = max(uParamD, 0.0);
          float diskTilt = sin(uTime * tiltFrequency * 6.2831853) * 0.34;
          diskTilt += sin(uTime * tiltFrequency * 2.3999632 + 1.7) * 0.08;
          pos = rotateXObject(pos, diskTilt);
          ray = rotateXObject(ray, diskTilt);
          originalRay = rotateXObject(originalRay, diskTilt);
          vec4 col = vec4(0.0);
          vec4 glow = vec4(0.0);
          vec4 outCol = vec4(100.0);

          for (int disks = 0; disks < 20; disks += 1) {
            for (int h = 0; h < 6; h += 1) {
              float dotpos = dot(pos, pos);
              float invDist = inversesqrt(max(dotpos, 0.000001));
              float centDist = dotpos * invDist;
              float stepDist = 0.92 * abs(pos.y / max(abs(ray.y), 0.0001));
              float farLimit = centDist * 0.5;
              float closeLimit = centDist * 0.1 + 0.05 * centDist * centDist * (1.0 / size);
              stepDist = min(stepDist, min(farLimit, closeLimit));

              float invDistSqr = invDist * invDist;
              float bendForce = stepDist * invDistSqr * size * 0.625 * max(uLensStrength, 0.0);
              ray = normalize(ray - (bendForce * invDist) * pos);
              pos += stepDist * ray;

              glow += vec4(1.0, 1.1, 1.0, 1.0) * (0.01 * stepDist * invDistSqr * invDistSqr * clamp(centDist * 2.0 - 1.2, 0.0, 1.0));
            }

            float dist2 = length(pos);

            if (dist2 < size * 0.18) {
              outCol = vec4(col.rgb * col.a + glow.rgb * (1.0 - col.a), 1.0);
              break;
            } else if (dist2 > size * 1000.0) {
              vec3 lensedBg = pow(sampleBackgroundRay(ray), vec3(1.18));
              float bendAmount = clamp(length(ray - originalRay) * 6.0 * max(uLensStrength, 0.0), 0.0, 1.0);
              vec3 bg = mix(baseBackground, lensedBg, 0.42 + bendAmount * 0.48);
              outCol = vec4(col.rgb * col.a + bg * (1.0 - col.a) + glow.rgb * (1.0 - col.a), 1.0);
              break;
            }

            if (abs(pos.y) <= diskHalfThickness) {
              vec4 diskCol = raymarchDisk(ray, pos, size, diskOuterRadius, diskInnerRadius);
              pos.y = 0.0;
              pos += abs(diskHalfThickness / max(abs(ray.y), 0.0001)) * ray;
              col = vec4(diskCol.rgb * (1.0 - col.a) + col.rgb, col.a + diskCol.a * (1.0 - col.a));
            }
          }

          if (outCol.r > 99.0) {
            outCol = vec4(col.rgb + glow.rgb * (col.a + glow.a) + baseBackground * (1.0 - col.a), 1.0);
          }

          vec3 color = outCol.rgb;
          color *= 0.78 + uGlowStrength * 0.42;
          color = pow(max(color, vec3(0.0)), vec3(0.6));
          return color;
        }

        vec3 neutronStarColor(vec2 p, vec3 backgroundColor) {
          float zoom = (3.25 + uParamA * 8.5) / clamp(uViewScale, 0.35, 2.1);
          vec2 uv = p / max(uResolution.x / max(uResolution.y, 1.0), 0.001);
          uv *= zoom;
          float dist = length(uv);
          float angle = atan(uv.y, uv.x);
          float c = fbm2(vec2(cos(angle + uTime), sin(angle + dist)) / 2.0) * 2.0;
          float f = (1.0 - sqrt(max(1.0 - dist, 0.0001))) / max(dist, 0.0001);

          vec2 nuv = uv * rotation2d(uTime * 0.95);
          vec3 neutronColor = vec3(0.76, 0.94, 1.0);
          vec3 col = vec3(0.0);

          float coreRadius = 0.075 + uParamA * 0.72;
          float core = 1.0 - smoothstep(coreRadius, coreRadius * 1.17, dist);
          col += neutronColor * core * 1.25;
          col += max((fbm2(nuv * f * (140.0 + uParamE * 220.0)) * 2.0 + 0.5) * (1.0 - smoothstep(coreRadius, coreRadius * 1.14, dist)) * neutronColor, 0.0);

          float flare = smoothstep(0.92 - uParamD * 0.45, c, dist) * smoothstep(coreRadius * 0.9, coreRadius * 1.4, dist);
          col += vec3(0.86, 0.96, 1.0) * flare * (0.55 + uParamD * 3.6);

          float beamWidth = 0.006 + uParamC * 0.048;
          float fineLine = beamWidth / (abs(uv.y) + 0.0025);
          fineLine *= (1.0 - smoothstep(-1.0, 1.6, dist)) * smoothstep(0.75, 8.0, zoom);
          col += vec3(0.92, 0.98, 1.0) * fineLine;

          float leftTail = exp(-abs(uv.y) * (4.0 + uParamC * 12.0)) * (1.0 - smoothstep(0.08, 1.25 + uParamD, dist)) * (1.0 - smoothstep(-0.95, -0.05, uv.x));
          float rightTail = exp(-abs(uv.y) * (6.0 + uParamC * 16.0)) * (1.0 - smoothstep(0.1, 1.0 + uParamD * 0.8, dist)) * smoothstep(0.05, 0.85, uv.x) * (0.25 + uParamD * 0.8);
          col += vec3(0.65, 0.86, 1.0) * (leftTail * 1.8 + rightTail);

          float glow = (1.0 - smoothstep(0.0, 1.15, dist / (3.0 + uParamB * 2.0))) * smoothstep(coreRadius, coreRadius * 1.25, dist);
          col += vec3(0.45, 0.70, 1.0) * glow * 0.5;

          float objectMask = clamp(core + flare * 0.7 + glow * 0.35 + fineLine * 0.015, 0.0, 1.0);
          vec3 objectColor = col * uGlowStrength;
          return mix(backgroundColor, objectColor, objectMask) + objectColor * (1.0 - objectMask) * 0.28;
        }

        float phaseCS(float mu, float g) {
          float g2 = g * g;
          return (3.0 * (1.0 - g2) * (1.0 + mu * mu)) / (2.0 * (2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
        }

        bool raycastSphere(vec3 ro, vec3 rd, out vec3 p0, out vec3 p1, vec3 center, float r) {
          float b = 2.0 * dot(rd, ro - center);
          float c = dot(ro - center, ro - center) - r * r;
          float d = b * b - 4.0 * c;
          if (d < 0.0) {
            return false;
          }
          float root = sqrt(d);
          float t0 = (-b - root) * 0.5;
          float t1 = (-b + root) * 0.5;
          p0 = ro + rd * t0;
          p1 = ro + rd * t1;
          return true;
        }

        float spiralNoiseC(vec3 p) {
          float n = 0.0;
          float iter = 1.0;
          const float nudge = 0.739513;
          const float normalizer = 0.804737854;
          for (int i = 0; i < 6; i += 1) {
            n += -abs(sin(p.y * iter) + cos(p.x * iter)) / iter;
            p.xy += vec2(p.y, -p.x) * nudge;
            p.xy *= normalizer;
            p.xz += vec2(p.z, -p.x) * nudge;
            p.xz *= normalizer;
            iter *= 1.733733;
          }
          return n;
        }



        float spiralNoise3D(vec3 p) {
          float n = 0.0;
          float iter = 1.0;
          const float nudge = 0.739513;
          const float normalizer = 0.804737854;
          for (int i = 0; i < 5; i += 1) {
            n += (sin(p.y * iter) + cos(p.x * iter)) / iter;
            p.xz += vec2(p.z, -p.x) * nudge;
            p.xz *= normalizer;
            iter *= 1.33733;
          }
          return n;
        }

        float sampleVolume(vec3 pos) {
          float rr = length(pos);
          float scale = 0.55 + uParamB * 2.4;
          float edgeFade = 1.0 - smoothstep(0.70, 0.98, rr);
          float density = exp(-rr * (0.65 + uParamC * 1.8)) * (2.5 + uParamA * 8.5) * edgeFade * edgeFade;
          if (density <= 0.0) {
            return density;
          }
          density += spiralNoiseC(512.0 + pos * (4.0 + scale * 8.0)) * (0.25 + uParamC * 1.25);
          pos = rotateY(pos, pos.y * spiralNoiseC(pos * (2.0 + scale * 3.0)) * (0.8 + uParamC * 2.2) + uTime * (0.015 + abs(uParamD) * 0.09));
          density += spiralNoiseC(200.0 + pos * (1.8 + scale * 3.2)) * (0.55 + uParamA * 1.7);
          density *= edgeFade * (0.35 + edgeFade * 0.65);
          density *= rr * (0.4 + uParamA);
          return max(0.0, density);
        }

        vec4 raymarchNebula(vec3 pos, vec3 dir, float ds, int steps) {
          vec4 result = vec4(0.0, 0.0, 0.0, 1.0);
          for (int i = 0; i < 96; i += 1) {
            if (i >= steps) {
              break;
            }

            float density = sampleVolume(pos);
            if (density > 0.0) {
              vec3 lightVector = -pos;
              float atten = 0.2 / max(dot(lightVector, lightVector), 0.0001);
              vec3 ext = max(vec3(0.000001), vec3(0.9, 0.7, 0.5) * density + vec3(0.6 * density));
              vec3 trans = exp(-ext * ds);
              vec3 lightDir = normalize(lightVector);
              float mu = dot(lightDir, dir);
              float phaseValue = phaseCS(mu, 0.2);
              vec3 lum = vec3(0.22, 0.11, 0.02) + vec3(1.0) * phaseValue * vec3(0.1, 0.3, 0.5) * (0.25 + uParamE * 1.6) * density * atten;
              vec3 integral = (lum - lum * trans) / ext;
              result.rgb += integral * result.a;
              result.a *= dot(trans, vec3(0.3333333));
              if (result.a <= 0.1) {
                return result;
              }
            }

            pos += dir * ds;
          }
          return result;
        }

        vec3 nebulaColor(vec2 p, vec3 backgroundColor) {
          float scale = (0.42 + uParamB * 0.78) / clamp(uViewScale, 0.30, 1.8);
          vec2 uv = vUv;
          float ar = uResolution.x / max(uResolution.y, 1.0);
          float d = ar / tan(radians(45.0 * 0.5));
          vec3 rayOrigin = vec3(0.0, 0.0, -6.8);
          vec3 rayDir = normalize(vec3((-1.0 + 2.0 * uv) * vec2(ar, 1.0) * scale, d));
          float t = uTime * 0.075;
          rayDir = rotateY(rayDir, t);
          rayOrigin = rotateY(rayOrigin, t);

          vec3 p0;
          vec3 p1;
          vec3 color = backgroundColor;
          if (raycastSphere(rayOrigin, rayDir, p0, p1, vec3(0.0), 1.0)) {
            p0 = dot(rayOrigin, rayOrigin) < dot(p0, p0) ? rayOrigin : p0;
            float jitter = hash(floor(vUv * uResolution.xy)) * 0.10;
            p0 -= rayDir * jitter;
            float travel = length(p1 - p0);
            int steps = int(travel / 0.055) + 1;
            float stepSize = 0.035 + uParamC * 0.055;
            vec4 integral = raymarchNebula(p0, rayDir, stepSize, steps);
            vec3 nebula = vec3(integral.r * 0.6, integral.g * 1.25, integral.b * 1.85) * (0.45 + uParamA * 1.65);
            color = color + nebula * clamp(1.0 - integral.a, 0.0, 1.0);
          }
          return color;
        }

        vec3 quasarColor(vec2 p, vec3 backgroundColor) {
          float viewZoom = clamp(uViewScale, 0.38, 1.9);
          vec2 q = p / max(viewZoom, 0.001) * 1.52;
          vec2 uv = vUv;

          float jetTilt = 0.43 + uParamE;
          float fpBase = length(pow(abs(rotation2d(jetTilt) * q) * vec2(2.2 + uParamC * 3.8, 0.75 + uParamC * 0.7), vec2(0.5))) + 0.05;
          float fp = pow((0.20 + uParamB * 1.25) / fpBase, 1.35 + uParamA * 0.65);

          vec4 o = vec4(0.0);
          vec2 fcoord = vUv * uResolution;
          for (int idx = 0; idx < 17; idx += 1) {
            float i = -float(idx) * 0.06;
            float t = -uTime * 0.01;
            float d = fract(i - 3.0 * t);
            vec4 c = vec4((fcoord - uResolution * 0.5) / uResolution.y * d, i, 0.0) * 28.0;
            c.xz = rotation2d(uTime * 0.35) * c.zx;
            for (int j = 0; j < 24; j += 1) {
              c.xzyw = abs(c / max(dot(c, c), 0.0001) - vec4(7.0 - 0.2 * sin(t), 6.3, 0.7, 1.0 - cos(t / 0.8)) / 7.0);
            }
            float dd = d - 1.0;
            o -= c * c.yzww * d * dd * dd / vec4(3.0, 4.0, 1.0, 1.0);
          }

          vec2 diskP = q * mat2(1.0, -0.1 - uParamE * 0.16, 0.0, 0.8 + uParamD * 2.2);
          float safeLength = max(length(diskP), 0.055);
          vec3 pos = normalize(vec3(rotation2d(-0.4 / safeLength) * diskP, 0.25));
          pos.z -= uTime * 0.5;
          vec3 npos = 2.0 * pos;

          float f = 0.0;
          f += 0.5000 * noise3(npos * (o.xyz + 0.25)); npos *= 2.0;
          f += 0.2500 * noise3(npos * (o.xyz + 0.25)); npos *= 2.0;
          f += 0.1250 * noise3(npos * (o.xyz + 0.25)); npos *= 2.0;
          f += 0.0625 * noise3(npos * (o.xyz + 0.25));

          vec2 vignetteUv = uv * (1.0 - uv) * 4.0;
          float vignette = pow(max(vignetteUv.x * vignetteUv.y, 0.0), 0.72);
          float fr = (0.18 + uParamB * 1.4) / safeLength;
          float core = smoothstep(-0.4, 2.0, f * f) * fr * fr * (0.45 + uParamD * 2.3) + fp * (0.08 + uParamA * 0.55);
          float nearAmount = smoothstep(0.62, 1.45, viewZoom);

          vec3 storm = acesTonemap(pow(max(core * core, 0.0) * vec3(0.0, 0.08, 0.58) * vignette * max(o.xyz, vec3(0.04)), vec3(0.45)) * 4.2);
          float fineMist = pow(max(noise3(vec3(q * 72.0 + o.xy * 0.015, uTime * 0.18)), 0.0), 9.0) * nearAmount * 0.36;
          float glow = exp(-safeLength * (0.75 + (1.0 - nearAmount) * 1.9 + uParamC * 1.2)) * (0.10 + nearAmount * 0.9 + uParamD * 1.15);
          vec3 objectColor = storm * (0.35 + uParamA * 1.8 + nearAmount * 1.1) + vec3(0.0, 0.45, 0.78) * glow + vec3(0.02, 0.9, 1.45) * fineMist * (0.5 + uParamC * 1.8);
          float objectMask = clamp(length(objectColor) * 0.55, 0.0, 1.0);
          return mix(backgroundColor, objectColor, objectMask) + objectColor * 0.28;
        }

        vec3 pulsarColor(vec2 p, vec3 backgroundColor) {
          float viewZoom = clamp(uViewScale, 0.48, 1.9);
          float aspect = uResolution.x / max(uResolution.y, 1.0);
          vec2 uv = vUv;
          vec2 q = (-0.5 + uv) * vec2(aspect, 1.0) / max(viewZoom, 0.001);

          float pulseFrequency = max(uParamB, 0.0);
          float pulsePhase = uTime * pulseFrequency * 6.2831853 + uParamF * 6.2831853;
          float brightness = max((cos(pulsePhase) * 0.18 + sin(pulsePhase * 1.37) * 0.16) * (0.25 + uParamA * 1.5), 0.04);
          float radius = 0.08 + uParamC * 0.68 + brightness * 0.2;
          float invRadius = 1.0 / radius;
          vec3 blueGreen = vec3(0.2, 0.65, 0.5);
          vec3 blueViolet = vec3(0.1, 0.25, 0.81);
          float time = uTime * 0.1;

          float fade = pow(length(2.0 * q), 0.5);
          float fVal1 = 1.0 - fade;
          float fVal2 = 1.0 - fade;
          float angle = atan(q.x, q.y) / 6.2832;
          float dist = length(q);
          vec3 coord = vec3(angle, dist, time * 0.1);
          float n1 = abs(snoise(coord + vec3(0.0, -time * (0.35 + brightness * 0.001 + uParamE * 0.08), time * 0.015), 10.0 + uParamE * 28.0));
          float n2 = abs(snoise(coord + vec3(0.0, -time * (0.15 + brightness * 0.001), time * 0.015), 22.0 + uParamE * 80.0));

          for (int i = 1; i <= 7; i += 1) {
            float power = pow(2.0, float(i + 1));
            fVal1 += (0.5 / power) * snoise(coord + vec3(0.0, -time, time * 0.2), power * 10.0 * (n1 + 1.0));
            fVal2 += (0.5 / power) * snoise(coord + vec3(0.0, -time, time * 0.2), power * 25.0 * (n2 + 1.0));
          }

          float corona = pow(fVal1 * max(1.1 - fade, 0.0), 2.0) * 50.0;
          corona += pow(fVal2 * max(1.1 - fade, 0.0), 2.0) * 50.0;
          corona *= 1.2 - n1;

          vec2 sp = (-1.0 + 2.0 * uv) * vec2(aspect, 1.0) / max(viewZoom, 0.001);
          sp *= (2.0 - brightness);
          float rr = dot(sp, sp);
          float lens = (1.0 - sqrt(abs(1.0 - rr))) / max(rr, 0.0001) + brightness * 0.5;
          vec3 starSphere = vec3(0.0);

          if (dist < radius) {
            corona *= pow(dist * invRadius, 24.0);
            vec2 sphereUv = sp * lens + vec2(time, 0.0);
            float tex1 = noise2(sphereUv * 7.5 + vec2(time, 0.0));
            float tex2 = noise2(sphereUv * 28.0 - vec2(0.0, time * 0.7));
            float tex = mix(tex1, tex2, 0.45);
            float uOff = tex * brightness * PI + time;
            vec2 starUV = sphereUv + vec2(uOff, 0.0);
            starSphere = vec3(0.18, 0.78, 1.0) * (0.35 + noise2(starUV * 18.0) * 0.75);
          }

          float starGlow = min(max(1.0 - dist * (1.0 - brightness), 0.0), 1.0);
          float beamWidth = 2.0 + uParamD * 30.0;
          float beam = exp(-abs(q.y) * beamWidth) * (1.0 - smoothstep(radius, 1.5 + uParamE, dist)) * (0.18 + uParamA * 1.4);
          vec3 object = vec3(lens * (0.75 + brightness * 0.3) * blueGreen) + starSphere + corona * blueGreen * 0.018 + starGlow * blueViolet * 0.42 + vec3(0.25, 0.75, 1.2) * beam * 0.55;
          object *= uGlowStrength;
          float coreMask = smoothstep(radius * 1.18, radius * 0.78, dist);
          float glowMask = clamp(starGlow * 0.22 + beam * 0.18, 0.0, 0.85);
          return mix(backgroundColor, object, clamp(coreMask + glowMask, 0.0, 1.0)) + object * (1.0 - coreMask) * 0.16;
        }


        vec3 rotateViewDirection(vec3 v) {
          float cy = cos(uViewAngles.x);
          float sy = sin(uViewAngles.x);
          float cp = cos(uViewAngles.y);
          float sp = sin(uViewAngles.y);
          v.xz = mat2(cy, -sy, sy, cy) * v.xz;
          v.yz = mat2(cp, -sp, sp, cp) * v.yz;
          return v;
        }

        float remnantAutoDrift() {
          float frequency = max(uParamE, 0.0);
          float maxDrift = max(uParamD, 0.0);
          return sin(uTime * frequency * 6.2831853) * maxDrift;
        }

        float remnantDensity(vec3 pos) {
          float drift = remnantAutoDrift();
          pos += vec3(0.17, -0.09, 0.43) * drift;
          float r = length(pos);
          float shellRadius = 0.35 + uParamB * 1.65;
          float shell = exp(-abs(r - shellRadius) * (3.0 + uParamC * 12.0));
          float knots = abs(spiralNoiseC(pos * (0.85 + uParamC * 2.4) + vec3(0.0, 0.0, drift * 4.0)));
          float fine = noise3(pos * (4.0 + uParamC * 16.0) + drift * 2.5);
          float cavity = smoothstep(shellRadius * 0.18, shellRadius * 0.92, r) * (1.0 - smoothstep(shellRadius * 1.55, shellRadius * 2.55, r));
          return max(0.0, shell * (0.2 + uParamA * 0.8 + knots * (0.25 + uParamC * 1.1) + fine * 0.42) * cavity);
        }

        vec3 supernovaRemnantColor(vec2 p, vec3 backgroundColor) {
          float aspect = uResolution.x / max(uResolution.y, 1.0);
          float scale = 1.05 / clamp(uViewScale, 0.30, 1.7);
          vec3 ro = vec3(0.0, 0.0, -4.6);
          vec3 rd = normalize(vec3(p * scale, 1.25));

          float rot = remnantAutoDrift() * 0.65;
          ro = rotateY(ro, rot);
          rd = rotateY(rd, rot);

          vec3 color = backgroundColor;
          vec3 sum = vec3(0.0);
          float alpha = 0.0;
          float t = 1.2;

          for (int i = 0; i < 64; i += 1) {
            vec3 pos = ro + rd * t;
            float d = remnantDensity(pos);
            float r = length(pos);
            vec3 edgeColor = mix(vec3(0.03, 0.18, 0.34), vec3(0.0, 0.95, 0.78), smoothstep(0.45, 1.55, r));
            vec3 hot = vec3(1.0, 0.36 + 0.16 * sin(uTime * 0.7), 0.22);
            vec3 local = mix(hot, edgeColor, smoothstep(0.45, 1.1, r));
            float a = clamp(d * (0.012 + uParamA * 0.045), 0.0, 0.12) * (1.0 - alpha);
            sum += local * a * (1.0 + 0.55 * d);
            alpha += a;
            if (alpha > 0.94 || t > 8.0) {
              break;
            }
            t += 0.055 + (1.0 - d) * 0.035;
          }

          float core = exp(-dot(p, p) * 42.0) * uParamF * 1.8;
          sum += vec3(1.0, 0.48, 0.32) * core;
          vec3 objectColor = sum * uGlowStrength;
          return mix(color, objectColor, clamp(alpha + core * 0.8, 0.0, 1.0)) + objectColor * 0.25;
        }

        float rockFbm(vec3 p) {
          float value = 0.0;
          float amp = 0.52;
          for (int i = 0; i < 6; i += 1) {
            value += noise3(p) * amp;
            p = p * 2.03 + vec3(13.7, 4.3, 8.1);
            amp *= 0.52;
          }
          return value;
        }

        float rockSdf(vec3 p) {
          float r = length(p);
          float roughness = 0.55 + max(uParamC, 0.0) * 1.25;
          float n = rockFbm(p * 3.0 * roughness) * (0.12 + max(uParamA, 0.0) * 0.12) + rockFbm(p * 8.0 * roughness) * 0.08;
          return r - (0.62 + max(uParamB, 0.0) * 0.95 + n);
        }

        vec3 rockNormal(vec3 p) {
          vec2 e = vec2(0.0025, 0.0);
          return normalize(vec3(
            rockSdf(p + e.xyy) - rockSdf(p - e.xyy),
            rockSdf(p + e.yxy) - rockSdf(p - e.yxy),
            rockSdf(p + e.yyx) - rockSdf(p - e.yyx)
          ));
        }

        vec3 spaceRockColor(vec2 p, vec3 backgroundColor) {
          float scale = 1.1 / clamp(uViewScale, 0.45, 2.1);
          vec3 ro = vec3(0.0, 0.0, -3.15);
          vec3 rd = normalize(vec3(p * scale, 1.2));
          ro = rotateViewDirection(ro);
          rd = rotateViewDirection(rd);
          ro = rotateY(ro, uTime * (0.06 + uParamD * 0.28));
          rd = rotateY(rd, uTime * (0.06 + uParamD * 0.28));

          float t = 0.0;
          float hit = -1.0;
          float maxRockSteps = mix(24.0, 72.0, clamp(uParamF, 0.0, 1.0));
          for (int i = 0; i < 72; i += 1) {
            if (float(i) >= maxRockSteps) {
              break;
            }
            vec3 pos = ro + rd * t;
            float d = rockSdf(pos - vec3(0.0, 0.0, 0.0));
            if (d < 0.003) {
              hit = t;
              break;
            }
            if (t > 7.0) {
              break;
            }
            t += max(d * 0.55, 0.012);
          }

          if (hit < 0.0) {
            return backgroundColor;
          }

          vec3 pos = ro + rd * hit;
          vec3 n = rockNormal(pos);
          vec3 lightDir = normalize(vec3(-0.55, 0.45, -0.72));
          float diff = max(dot(n, -lightDir), 0.0);
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.2);
          float grain = rockFbm(pos * 12.0);
          vec3 base = mix(vec3(0.24, 0.22, 0.20), vec3(0.58, 0.51, 0.43), grain);
          vec3 objectColor = base * (0.18 + diff * 1.35) + vec3(0.45, 0.62, 0.85) * rim * (0.15 + uParamE * 0.45);
          return mix(backgroundColor, objectColor * uGlowStrength, 0.98);
        }

        float dustyNebulaDensity(vec3 p) {
          float base = p.y + 4.5;
          base -= spiralNoiseC(p.xyz * (0.85 + uParamB)) * (0.45 + uParamC);
          base += spiralNoiseC(p.zxy * (0.4123 + uParamB * 0.3) + 100.0) * (1.6 + uParamC * 4.0);
          float r = length(p);
          float softBoundary = 1.0 - smoothstep(2.2, 4.7, r);
          float irregularEdge = smoothstep(0.02, 0.75, abs(spiralNoiseC(p * 0.55 + 31.7)));
          float falloff = softBoundary * (0.35 + irregularEdge * 0.65);
          return max(0.0, abs(base * 0.26) * falloff);
        }

        vec3 dustyNebulaColor(vec2 p, vec3 backgroundColor) {
          float scale = 0.86 / clamp(uViewScale, 0.30, 1.8);
          vec3 ro = vec3(0.0, 0.0, -5.2);
          vec3 rd = normalize(vec3(p * scale, 1.1));
          ro = rotateViewDirection(ro);
          rd = rotateViewDirection(rd);
          ro = rotateY(ro, 3.2 + uTime * (0.025 + uParamD * 0.05));
          rd = rotateY(rd, 3.2 + uTime * (0.025 + uParamD * 0.05));

          vec3 sum = vec3(0.0);
          float alpha = 0.0;
          float t = 1.0;
          for (int i = 0; i < 64; i += 1) {
            vec3 pos = ro + rd * t;
            float r = length(pos);
            if (r > 4.7 && t > 5.2) {
              break;
            }
            float d = dustyNebulaDensity(pos * 0.65);
            vec3 warm = vec3(1.0, 0.72, 0.42);
            vec3 cool = vec3(0.48, 0.72, 0.82);
            vec3 local = mix(warm, cool, smoothstep(0.4, 2.2, r));
            local += vec3(0.55, 0.72, 1.0) * uParamE * exp(-r * 1.7);
            float light = 0.04 / max(dot(pos, pos), 0.05);
            float densityGate = smoothstep(0.045, 0.28, d);
            float a = clamp(d * densityGate * 0.022, 0.0, 0.075) * (1.0 - alpha);
            sum += local * (a * (0.45 + d) + light * 0.02);
            alpha += a;
            if (alpha > 0.92 || t > 9.0) {
              break;
            }
            t += 0.06;
          }
          vec3 objectColor = sum * 1.55 * uGlowStrength;
          float visibleDensity = smoothstep(0.015, 0.42, alpha);
          return backgroundColor + objectColor * (0.35 + visibleDensity * 0.85);
        }

        vec3 rotateX3(vec3 v, float a) {
          float c = cos(a);
          float s = sin(a);
          return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z);
        }

        vec3 rotateZ3(vec3 v, float a) {
          float c = cos(a);
          float s = sin(a);
          return vec3(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
        }

        float ringSdf(vec3 p) {
          float d = 1024.0;
          float t = uTime * (0.20 + abs(uParamD) * 0.9) + 2.0;
          for (int i = 0; i < 9; i += 1) {
            p = rotateZ3(p, t * 0.05);
            p = rotateY(p, t * 0.10);
            p = rotateX3(p, t * 0.075);
            float fi = float(i);
            float radius = fi * (0.10 + uParamB * 0.32) + 0.38;
            float tube = abs(length(p.xz) - radius) - (0.010 + uParamC * 0.035);
            float plane = abs(p.y) - (0.018 + uParamC * 0.075);
            d = min(d, max(tube, plane));
          }
          return d;
        }

        vec3 rotatingRingsColor(vec2 p, vec3 backgroundColor) {
          float scale = 1.18 / clamp(uViewScale, 0.36, 2.0);
          vec3 ro = vec3(0.0, 0.0, -3.0);
          vec3 rd = normalize(vec3(p * scale, 1.05));
          ro = rotateViewDirection(ro);
          rd = rotateViewDirection(rd);

          float travel = 0.0;
          float hit = -1.0;
          for (int i = 0; i < 72; i += 1) {
            vec3 pos = ro + rd * travel;
            float d = ringSdf(pos);
            if (d < 0.0025) {
              hit = travel;
              break;
            }
            if (travel > 8.0) {
              break;
            }
            travel += max(d * 0.65, 0.01);
          }

          vec3 flare = vec3(0.45, 0.62, 1.0) * pow(max(dot(rd, normalize(-ro)) * 0.5 + 0.5, 0.0), 18.0) * (0.45 + uParamE);
          if (hit < 0.0) {
            return backgroundColor + flare * 0.45;
          }

          vec3 pos = ro + rd * hit;
          vec3 normal = normalize(vec3(
            ringSdf(pos + vec3(0.003, 0.0, 0.0)) - ringSdf(pos - vec3(0.003, 0.0, 0.0)),
            ringSdf(pos + vec3(0.0, 0.003, 0.0)) - ringSdf(pos - vec3(0.0, 0.003, 0.0)),
            ringSdf(pos + vec3(0.0, 0.0, 0.003)) - ringSdf(pos - vec3(0.0, 0.0, 0.003))
          ));
          float diff = max(dot(normal, normalize(-pos)), 0.0);
          float rim = pow(1.0 - max(dot(normal, -rd), 0.0), 3.0);
          vec3 objectColor = vec3(0.44, 0.49, 0.55) * (0.18 + diff * 0.85) + vec3(0.65, 0.82, 1.0) * (rim * 0.8);
          objectColor += flare * 0.8;
          return mix(backgroundColor, objectColor * uGlowStrength, 0.96);
        }


        float cbsField(vec3 p, float s, int iterations) {
          float strength = 10.0;
          float accum = s;
          float prev = 0.0;
          float tw = 0.0;

          for (int j = 0; j < 32; j += 1) {
            if (j >= iterations) {
              break;
            }

            float mag = max(dot(p, p), 0.001);
            p = abs(p) / mag + vec3(-0.5, -0.4, -1.5);
            float w = exp(-float(j) / 7.0);
            accum += w * exp(-strength * abs(mag - prev));
            tw += w;
            prev = mag;
          }

          return max(0.0, 4.0 * accum / max(tw, 0.001) - 0.4);
        }

        float galaxyStarField(vec3 coord, float density) {
          vec2 v = round(coord.xy * density * max(uResolution.x, uResolution.y));
          float a = fract(cos(v.x * 8.3e-3 + v.y) * 4.7e5);
          float b = fract(sin(v.x * 0.3e-3 + v.y) * 8.1e5);
          float c = mix(a, b, 0.5);
          return exp((c - 1.0) * 40.0);
        }

        vec3 fractalGalaxyColor(vec2 p, vec3 backgroundColor) {
          float layerScale = 2.4 + uParamB * 4.0;
          float density = 1.0 + uParamC * 8.0;
          float parallax = uParamD;
          vec2 uv = p * (2.2 / clamp(uViewScale, 0.35, 1.8)) + vec2(0.5);
          vec3 color = vec3(0.0);
          vec3 anim = vec3(sin(uTime / 64.0), uTime / 15.0, sin(uTime / 256.0));

          vec3 layer0 = vec3(uv / (layerScale + sin(uTime * 0.02) * 0.2), 0.0) + (0.18 + 0.12 * parallax) * anim;
          vec3 layer1 = vec3(uv / (layerScale * 0.75 + sin(uTime * 0.03) * 0.2), 0.0) + (0.14 + 0.10 * parallax) * anim;
          vec3 sky0 = abs(fract(layer0 / 5.0) * 5.0 - 2.5);
          vec3 sky1 = abs(fract(layer1 / 4.0) * 4.0 - 2.0);

          float f0 = 0.5 + 0.3 * sin(0.1 + uTime / 11.0);
          float f1 = 0.5 + 0.3 * sin(0.2 + uTime / 17.0);
          float f2 = 0.5 + 0.3 * sin(0.3 + uTime / 23.0);
          float f3 = 0.5 + 0.3 * sin(0.4 + uTime / 29.0);
          float f4 = 0.5 + 0.3 * sin(0.5 + uTime / 31.0);
          float f5 = 0.5 + 0.3 * sin(0.6 + uTime / 41.0);

          color += galaxyStarField(layer0, density) * vec3(0.9, 0.95, 1.0);
          color += galaxyStarField(layer1, density * 0.85) * vec3(1.0, 0.84, 0.72);

          float t = cbsField(sky0, f3, 18);
          float tt = t * t;
          color += vec3(2.2 * f0 * t * tt, 1.6 * f2 * tt, f4 * t);

          t = cbsField(sky1, f3, 26);
          tt = t * t;
          color += vec3(2.5 * f1 * t * tt, 1.2 * f3 * tt, f5 * t);

          color *= 0.23 * uGlowStrength;
          color += vec3(1.0, 0.72, 0.42) * exp(-dot(p, p) * 9.0) * uParamE;
          float mask = clamp(length(color) * 0.55, 0.0, 0.96);
          return mix(backgroundColor, color, mask) + color * 0.32;
        }

        float sdBox3(vec3 p, vec3 b) {
          vec3 q = abs(p) - b;
          return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
        }

        float anomalySdf(vec3 p) {
          float scale = 0.72 + uParamB * 1.8;
          p /= scale;
          p = rotateViewDirection(p);
          p.xy = rotation2d(uTime * (0.04 + abs(uParamD) * 0.2)) * p.xy;
          p.xz = rotation2d(0.8 + uTime * 0.035) * p.xz;

          float d = sdBox3(p, vec3(0.92));
          float s = 1.0;
          float cutWidth = 0.08 + uParamC * 0.30;

          for (int i = 0; i < 4; i += 1) {
            vec3 a = mod(p * s, 2.0) - 1.0;
            vec3 r = abs(1.0 - 3.0 * abs(a));
            float hole = min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - cutWidth;
            d = max(d, -hole / s);
            s *= 3.0;
          }

          return d * scale;
        }

        vec3 anomalyNormal(vec3 p) {
          vec2 e = vec2(0.0025, 0.0);
          return normalize(vec3(
            anomalySdf(p + e.xyy) - anomalySdf(p - e.xyy),
            anomalySdf(p + e.yxy) - anomalySdf(p - e.yxy),
            anomalySdf(p + e.yyx) - anomalySdf(p - e.yyx)
          ));
        }

        vec3 mengerAnomalyColor(vec2 p, vec3 backgroundColor) {
          float scale = 1.08 / clamp(uViewScale, 0.35, 1.8);
          vec3 ro = vec3(2.4, 1.7, -5.4);
          vec3 rd = normalize(vec3(p * scale, 1.65));
          ro = rotateViewDirection(ro);
          rd = rotateViewDirection(rd);

          float travel = 0.0;
          float hit = -1.0;
          for (int i = 0; i < 86; i += 1) {
            vec3 pos = ro + rd * travel;
            float d = anomalySdf(pos);
            if (d < 0.0025) {
              hit = travel;
              break;
            }
            if (travel > 9.0) {
              break;
            }
            travel += max(d * 0.68, 0.01);
          }

          vec3 glowCol = vec3(2.2, 1.25, 0.62) * exp(-dot(p, p) * (2.0 + uParamE * 7.0)) * uParamE;

          if (hit < 0.0) {
            return backgroundColor + glowCol * 0.35;
          }

          vec3 pos = ro + rd * hit;
          vec3 n = anomalyNormal(pos);
          vec3 lightDir = normalize(vec3(-0.58, 0.66, -0.48));
          float diff = max(dot(n, lightDir), 0.0);
          float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
          float cavities = noise3(pos * 12.0 + uTime * 0.08);
          vec3 base = mix(vec3(0.10, 0.12, 0.17), vec3(0.56, 0.48, 0.38), cavities);
          vec3 objectColor = base * (0.18 + diff * 1.25) + vec3(1.0, 0.74, 0.42) * rim * (0.4 + uParamA * 0.4) + glowCol;
          return mix(backgroundColor, objectColor * uGlowStrength, 0.96);
        }

        float trifidDensity(vec3 p) {
          float n = p.y + 4.5;
          n -= spiralNoiseC(p.xyz * (0.75 + uParamB)) * (0.55 + uParamC * 1.4);
          n += spiralNoiseC(p.zxy * (0.50 + uParamB * 0.25) + 10.0) * (2.0 + uParamC * 4.0);
          n -= spiralNoise3D(p * (0.8 + uParamB * 0.6)) * (0.4 + uParamC);
          float falloff = 1.0 - smoothstep(2.1, 5.0, length(p));
          return max(0.0, abs(n * 0.24) * falloff);
        }

        vec3 trifidNebulaColor(vec2 p, vec3 backgroundColor) {
          float scale = 0.82 / clamp(uViewScale, 0.30, 1.8);
          vec3 ro = vec3(0.0, 0.0, -5.4);
          vec3 rd = normalize(vec3(p * scale, 1.1));
          ro = rotateViewDirection(ro);
          rd = rotateViewDirection(rd);
          ro = rotateY(ro, 3.2 + uTime * (0.025 + uParamD * 0.06));
          rd = rotateY(rd, 3.2 + uTime * (0.025 + uParamD * 0.06));

          vec3 sum = vec3(0.0);
          float alpha = 0.0;
          float t = 1.0;
          for (int i = 0; i < 70; i += 1) {
            vec3 pos = ro + rd * t;
            float r = length(pos);
            if (r > 3.4 && t > 3.5) {
              break;
            }

            float d = trifidDensity(pos * 0.62);
            float lane = smoothstep(0.02, 0.25, abs(sin(atan(pos.y, pos.x) * 3.0 + r * 1.4))) * (0.35 + uParamC);
            vec3 purple = vec3(0.58, 0.22, 0.78);
            vec3 cyan = vec3(0.38, 0.72, 0.68);
            vec3 local = mix(purple, cyan, smoothstep(0.35, 2.2, r));
            local *= 0.55 + lane;
            local += vec3(0.95, 0.72, 0.95) * exp(-r * 1.6) * (0.35 + uParamE * 1.2);

            float a = clamp(d * 0.018 * uGlowStrength, 0.0, 0.085) * (1.0 - alpha);
            sum += local * a * (0.55 + d);
            alpha += a;
            if (alpha > 0.93 || t > 9.0) {
              break;
            }
            t += 0.055;
          }

          vec3 objectColor = sum * (1.05 + uParamE * 1.45);
          float visibleDensity = smoothstep(0.015, 0.42, alpha);
          return backgroundColor + objectColor * (0.35 + visibleDensity * 0.85);
        }

        void main() {
          float aspect = max(uResolution.x / max(uResolution.y, 1.0), 0.001);
          vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
          vec3 backgroundColor = sampleBackground(vUv);
          vec3 color = backgroundColor;

          if (uObjectMode == 0) {
            color = blackHoleColor(vUv * uResolution);
          } else if (uObjectMode == 1) {
            color = neutronStarColor(p, backgroundColor);
          } else if (uObjectMode == 2) {
            color = nebulaColor(p, backgroundColor);
          } else if (uObjectMode == 3) {
            color = quasarColor(p, backgroundColor);
          } else if (uObjectMode == 4) {
            color = pulsarColor(p, backgroundColor);
          } else if (uObjectMode == 5) {
            color = supernovaRemnantColor(p, backgroundColor);
          } else if (uObjectMode == 6) {
            color = spaceRockColor(p, backgroundColor);
          } else if (uObjectMode == 7) {
            color = dustyNebulaColor(p, backgroundColor);
          } else if (uObjectMode == 8) {
            color = backgroundColor;
          }

          color = isolateObjectColorControls(backgroundColor, color);
          color = applyExposureGamma(color);
          color = clamp(color, vec3(0.0), vec3(1.0));
          color = pow(color, vec3(0.92));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
  }
}
