import * as THREE from "three";

export class SunHaloMaterial extends THREE.ShaderMaterial {
  constructor({ starConfig }) {
    super({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,

      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1.0, 0.62, 0.28) },
        uStarA: {
          value: new THREE.Vector4(
            1.0, // haloBrightness
            1.0, // glow
            0.65, // corona
            0.35 // flare
          )
        },
        uStarB: {
          value: new THREE.Vector4(
            0.12, // coronaScale
            1.0, // coronaSpeed
            0.285, // diskRadius inside billboard uv space
            0.0
          )
        }
      },

      vertexShader: /* glsl */ `
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec3 uColor;
        uniform vec4 uStarA;
        uniform vec4 uStarB;

        varying vec2 vUv;

        float haloBrightness() {
          return max(0.0, uStarA.x);
        }

        float glowAmount() {
          return max(0.0, uStarA.y);
        }

        float coronaAmount() {
          return max(0.0, uStarA.z);
        }

        float flareAmount() {
          return max(0.0, uStarA.w);
        }

        float coronaScale() {
          return clamp(uStarB.x, 0.01, 0.5);
        }

        float sunSpeed() {
          return clamp(uStarB.y, 0.0, 4.0);
        }

        float diskRadius() {
          return max(0.02, uStarB.z);
        }

        float hash21(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);

          f = f * f * (3.0 - 2.0 * f);

          float a = hash21(i + vec2(0.0, 0.0));
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));

          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float coronaNorm() {
          return clamp((coronaScale() - 0.01) / 0.49, 0.0, 1.0);
        }

        float coronaTightness() {
          return mix(3.6, 1.25, coronaNorm());
        }

        float coronaExtent() {
          return mix(0.18, 0.82, coronaNorm());
        }

        float flareMask(vec2 q, float safeDiskRadius, float safeFlareRadius, float time) {
          float flare = flareAmount();

          if (flare <= 0.001) {
            return 0.0;
          }

          float d = length(q);
          float speed = max(0.15, sunSpeed());
          float tightness = coronaTightness();
          float extent = coronaExtent();
          float angle = atan(q.y, q.x);

          float rayNoiseA = noise2(q * 8.5 * tightness + time * 0.024 * speed);
          float rayNoiseB = noise2(q.yx * 13.0 * tightness + 3.7 + time * 0.019 * speed);
          float rayNoiseC = noise2(q * 19.0 * tightness - 8.1 + time * 0.015 * speed);

          float spokesA = pow(0.5 + 0.5 * sin(angle * 13.0 + time * 0.095 * speed + rayNoiseA * 2.5), 8.0);
          float spokesB = pow(0.5 + 0.5 * sin(angle * 21.0 - time * 0.070 * speed + rayNoiseB * 2.2), 9.0);
          float spokesC = pow(0.5 + 0.5 * sin(angle * 31.0 + time * 0.052 * speed + rayNoiseC * 2.0), 10.0);

          float radial = pow(max(0.0, 1.0 - d / (safeFlareRadius * (1.05 + extent))), 2.65);

          float horizontal =
            (1.0 - smoothstep(0.0, safeFlareRadius * 0.014, abs(q.y))) *
            (1.0 - smoothstep(safeDiskRadius * 1.08, safeFlareRadius * (1.30 + extent), abs(q.x)));

          float vertical =
            (1.0 - smoothstep(0.0, safeFlareRadius * 0.010, abs(q.x))) *
            (1.0 - smoothstep(safeDiskRadius * 1.08, safeFlareRadius * (0.80 + extent), abs(q.y)));

          float diskExclusion = smoothstep(safeDiskRadius * 1.04, safeDiskRadius * 1.32, d);
          float outerFade = 1.0 - smoothstep(safeFlareRadius * (0.60 + extent), safeFlareRadius * (1.35 + extent), d);

          float spokes = spokesA * 0.042 + spokesB * 0.032 + spokesC * 0.026;
          float cross = horizontal * 0.030 + vertical * 0.010;

          return flare * diskExclusion * outerFade * (spokes * radial + cross);
        }

        void main() {
          vec2 q = (vUv - 0.5) * 2.0;

          float safeDiskRadius = diskRadius();
          float d = length(q);
          float r = d / safeDiskRadius;

          vec3 haloColor = mix(uColor, vec3(1.0, 0.84, 0.52), 0.45);
          float emission = haloBrightness();

          float innerGlow =
            1.0 / max((d * d) / max(safeDiskRadius * safeDiskRadius * 12.5, 0.000001), 1.0);

          float innerGate =
            1.0 - smoothstep(safeDiskRadius * 0.10, safeDiskRadius * 1.75, d);

          float overlayMask = 1.0 - smoothstep(1.05, 1.65, r);

          vec3 glow =
            haloColor *
            innerGlow *
            innerGate *
            overlayMask *
            0.075 *
            glowAmount() *
            emission;

          float extent = coronaExtent();
          float safeFlareRadius = max(
            safeDiskRadius * 1.75,
            safeDiskRadius + mix(0.12, 0.72, coronaNorm())
          );

          vec2 dir = normalize(q + vec2(0.0001, 0.0002));

          float coronaNoise =
            noise2(dir * 3.3 * coronaTightness() + uTime * 0.030 * sunSpeed()) * 0.18 +
            noise2(q * 18.0 * coronaTightness() + uTime * 0.018 * sunSpeed() + 7.0) * 0.10;

          float outerGlow =
            1.0 / max(d / max(safeFlareRadius * (0.55 + extent), 0.000001), 1.0);

          float outerEnd =
            max(safeDiskRadius * 1.55, safeFlareRadius * (0.90 + extent));

          float outerGate =
            1.0 - smoothstep(safeDiskRadius * 1.02, outerEnd, d);

          vec3 corona =
            haloColor *
            outerGlow *
            outerGate *
            (0.012 + coronaNoise * 0.010) *
            coronaAmount() *
            emission;

          vec3 flares =
            haloColor *
            flareMask(q, safeDiskRadius, safeFlareRadius, uTime) *
            emission;

          vec3 color = glow + corona + flares;

          float outsidePlaneFade = 1.0 - smoothstep(0.92, 1.0, length(q));
          color *= outsidePlaneFade;

          float alpha = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0);

          if (alpha <= 0.001) {
            discard;
          }

          gl_FragColor = vec4(color, alpha);
        }
      `
    });

    this.setStarConfig(starConfig ?? {});
  }

  setStarConfig(starConfig) {
    const color = starConfig.color ?? [1.0, 0.62, 0.28];

    this.uniforms.uColor.value.setRGB(color[0], color[1], color[2]);

    this.uniforms.uStarA.value.set(
      starConfig.haloBrightness ?? 1.0,
      starConfig.glow ?? 1.0,
      starConfig.corona ?? 0.65,
      starConfig.flare ?? 0.35
    );

    this.uniforms.uStarB.value.set(
      starConfig.coronaScale ?? 0.12,
      starConfig.coronaSpeed ?? starConfig.speed ?? 1.0,
      0.285,
      0.0
    );
  }
}