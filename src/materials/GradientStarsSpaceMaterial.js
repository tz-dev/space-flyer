import * as THREE from "three";

export class GradientStarsSpaceMaterial extends THREE.ShaderMaterial {
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
            0.55, // horizonGlow
            1.2,  // zenith
            1.6,  // starIntensity
            110.0, // starDensity
            0.03 // drift
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
        uniform float uParams[5];
        uniform int uSkyMode;
        uniform float uSkyParams[9];

        varying vec3 vWorldDirection;

        float hash12(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float spaceParam(int index) {
          return uParams[index];
        }

        float skyParam(int index) {
          return uSkyParams[index];
        }

        float starLayer(vec2 uv, float density, float time, float drift) {
          vec2 p = uv * density + vec2(time * drift, -time * drift * 0.63);
          vec2 cell = floor(p);
          vec2 f = fract(p) - 0.5;

          float rnd = hash12(cell);
          float exists = step(0.965, rnd);

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

        float starField(vec3 rd, float density, float drift, float time) {
          vec3 p = normalize(rd);
          vec2 uvA = p.xz / (abs(p.y) + 0.85);
          vec2 uvB = p.xy / (abs(p.z) + 0.95);

          float starsA = starLayer(uvA, density, time, drift);
          float starsB = starLayer(uvB + 37.0, density * 0.58, time, drift * -0.7);

          return starsA + starsB * 0.65;
        }

        vec3 spaceColor(vec3 rd, vec3 ro, float time) {
          float horizonGlow = spaceParam(0);
          float zenith = spaceParam(1);
          float starIntensity = spaceParam(2);
          float starDensity = spaceParam(3);
          float drift = spaceParam(4);

          float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);

          vec3 horizonCol = vec3(0.09, 0.08, 0.16) * (0.6 + horizonGlow);
          vec3 zenithCol = vec3(0.004, 0.008, 0.03) * (0.4 + zenith * 0.5);
          vec3 col = mix(horizonCol, zenithCol, pow(up, max(0.25, zenith)));

          float horizonBand = pow(1.0 - abs(rd.y), 7.0);

          col += vec3(0.90, 0.35, 1.0) * horizonBand * horizonGlow * 0.18;
          col += vec3(0.10, 0.55, 0.95) * horizonBand * horizonGlow * 0.13;

          float stars = starField(rd, starDensity, drift, time);
          vec3 starColor = mix(
            vec3(0.65, 0.78, 1.0),
            vec3(1.0, 0.94, 0.82),
            hash12(rd.xy * 91.3)
          );

          col += starColor * stars * starIntensity;

          ro += vec3(0.0);

          return col;
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
            // TerrainView passes effective, sun-height-scaled values here.
            // On the shadow side density/horizon/skyBrightness are 0, regardless of Max sliders.
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
          vec3 color = spaceColor(rd, vec3(0.0), uTime);
          color = skyShaderColor(rd, vec3(0.0), uTime, color);

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