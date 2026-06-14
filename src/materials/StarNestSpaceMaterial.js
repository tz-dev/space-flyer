import * as THREE from "three";

export class StarNestSpaceMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,

      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uRotation: { value: new THREE.Matrix3() },
        uParams: {
          value: new Float32Array([
            13,      // iterations
            12,      // volSteps
            1.0,     // zoom
            0.16,    // tile
            0.0,     // speed
            0.0002,  // brightness
            0.84,    // darkMatter
            0.76,    // distFading
            0.98,    // saturation
            0.1,     // stepSize
            0.03,    // drift
            1.0,     // starNestAmount
            0.0,     // gradientAmount
            0.55,    // horizonGlow
            1.2,     // horizonDepth
            1.6,     // starCount
            110.0    // starDensity
          ])
        },
        uSkyMode: { value: 0 },
        uSkyParams: { value: new Float32Array(9) }
      },

      vertexShader: /* glsl */ `
        varying vec3 vWorldDirection;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldDirection = normalize(worldPosition.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec2 uResolution;
        uniform mat3 uRotation;
        uniform float uParams[17];
        uniform int uSkyMode;
        uniform float uSkyParams[9];

        varying vec3 vWorldDirection;

        float spaceParam(int index) {
          return uParams[index];
        }

        float skyParam(int index) {
          return uSkyParams[index];
        }

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float starLayer(vec2 uv, float density, float count, float time, float drift) {
          vec2 p = uv * density + vec2(time * drift, -time * drift * 0.63);
          vec2 cell = floor(p);
          vec2 f = fract(p) - 0.5;

          float rnd = hash12(cell);
          float threshold = mix(0.992, 0.935, clamp(count, 0.0, 2.0) * 0.5);
          float exists = step(threshold, rnd);

          vec2 starOffset = vec2(
            hash12(cell + vec2(13.7, 91.1)),
            hash12(cell + vec2(41.2, 17.4))
          ) - 0.5;

          vec2 d = f - starOffset;
          float dist = length(d);
          float core = 1.0 - smoothstep(0.000, 0.035, dist);
          float glow = 1.0 - smoothstep(0.020, 0.110, dist);
          float twinkle = 0.72 + 0.28 * sin(time * 3.0 + rnd * 80.0);

          return exists * (core * 1.4 + glow * 0.28) * twinkle;
        }

        float starField(vec3 rd, float density, float count, float drift, float time) {
          vec3 p = normalize(rd);
          vec2 uvA = p.xz / (abs(p.y) + 0.85);
          vec2 uvB = p.xy / (abs(p.z) + 0.95);

          float starsA = starLayer(uvA, density, count, time, drift);
          float starsB = starLayer(uvB + 37.0, density * 0.58, count, time, drift * -0.7);

          return starsA + starsB * 0.65;
        }

        vec3 gradientStarsSpace(vec3 rd, vec3 ro, float time) {
          float horizonGlow = spaceParam(13);
          float horizonDepth = spaceParam(14);
          float starCount = spaceParam(15);
          float starDensity = spaceParam(16);
          float drift = spaceParam(10);

          float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
          vec3 horizonCol = vec3(0.09, 0.08, 0.16) * (0.6 + horizonGlow);
          vec3 zenithCol = vec3(0.004, 0.008, 0.03) * (0.4 + horizonDepth * 0.5);
          vec3 col = mix(horizonCol, zenithCol, pow(up, max(0.25, horizonDepth)));

          float horizonBand = pow(1.0 - abs(rd.y), 7.0);
          col += vec3(0.90, 0.35, 1.0) * horizonBand * horizonGlow * 0.18;
          col += vec3(0.10, 0.55, 0.95) * horizonBand * horizonGlow * 0.13;

          float stars = starField(rd, starDensity, starCount, drift, time);
          vec3 starColor = mix(
            vec3(0.65, 0.78, 1.0),
            vec3(1.0, 0.94, 0.82),
            hash12(rd.xy * 91.3)
          );

          ro += vec3(0.0);

          return col + starColor * stars * starCount;
        }

        vec3 starNest1(vec3 rd, vec3 ro, float timeSeconds) {
          vec3 dir = normalize(rd);
          dir.xy *= spaceParam(2);

          float time = timeSeconds * spaceParam(4) + 0.25;

          vec3 from = vec3(1.0, 0.5, 0.5);
          from += vec3(
            time * 2.0,
            time,
            -2.0 + ro.z * 0.0005 * spaceParam(10)
          );

          from.xy += ro.xz * 0.0003 * spaceParam(10);

          float s = 0.1;
          float fade = 1.0;
          vec3 v = vec3(0.0);

          float iterations = spaceParam(0);
          float volSteps = spaceParam(1);
          float tile = spaceParam(3);
          float brightness = spaceParam(5);
          float darkMatter = spaceParam(6);
          float distFading = spaceParam(7);
          float saturation = spaceParam(8);
          float stepSize = spaceParam(9);

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
          return v * 0.01;
        }
        vec3 starNestSky(vec3 rd, vec3 ro, float timeSeconds) {
          float starNestAmount = spaceParam(11);
          float gradientAmount = spaceParam(12);
          vec3 color = vec3(0.0);

          if (starNestAmount > 0.001) {
            color += starNest1(rd, ro, timeSeconds) * starNestAmount;
          }

          if (gradientAmount > 0.001) {
            color += gradientStarsSpace(rd, ro, timeSeconds) * gradientAmount;
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
            float density = skyParam(0);
            float horizon = skyParam(1);
            float spaceFade = skyParam(2);
            float skyBrightness = skyParam(3);

            if (density <= 0.0001 || horizon <= 0.0001 || skyBrightness <= 0.0001) {
              ro += vec3(0.0);
              time += 0.0;
              return behind;
            }

            float horizonMask = pow(1.0 - abs(rd.y), 3.0);
            float upperMask = smoothstep(-0.2, 0.9, rd.y);

            vec3 hazeLow = vec3(0.23, 0.17, 0.34) * horizonMask * horizon;
            vec3 hazeHigh = vec3(0.035, 0.055, 0.12) * upperMask * density;
            vec3 haze = (hazeLow + hazeHigh) * density * skyBrightness;

            vec3 dimmedBehind = mix(behind, behind * (1.0 - spaceFade), horizonMask * density);

            ro += vec3(0.0);
            time += 0.0;

            return dimmedBehind + haze;
          }

          rd += vec3(0.0);
          ro += vec3(0.0);
          time += 0.0;

          return behind;
        }

        void main() {
          vec3 rd = normalize(uRotation * vWorldDirection);
          vec3 color = starNestSky(rd, vec3(0.0), uTime);
          color = skyShaderColor(rd, vec3(0.0), uTime, color);
          color = clamp(color, vec3(0.0), vec3(1.0));
          color = pow(color, vec3(0.92));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
  }

  setSkyConfig(skyConfig = {}) {
    const shaderId = skyConfig.shaderId ?? skyConfig.skyShaderId ?? "none";
    const params = skyConfig.params ?? skyConfig.skyShaderParams ?? {};

    this.uniforms.uSkyMode.value = shaderId === "void"
      ? 1
      : shaderId === "thin-atmosphere"
        ? 2
        : 0;

    this.uniforms.uSkyParams.value.set([
      shaderId === "void" ? params.ambient ?? 0.04 : params.density ?? 0.0,
      params.horizon ?? (shaderId === "thin-atmosphere" ? 0.0 : 0.25),
      params.spaceFade ?? 0.25,
      params.skyBrightness ?? 0.0,
      params.ambient ?? 0.0,
      params.lightIntensity ?? 0.0,
      params.shadowStrength ?? 0.35,
      params.shadowDistance ?? 90.0,
      params.shadowSteps ?? 18.0
    ]);
  }
}