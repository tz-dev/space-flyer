import * as THREE from "three";

export class SunMaterial extends THREE.ShaderMaterial {
  constructor({ shaderId = "fractal-sun", starConfig }) {
    super({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(1.0, 0.62, 0.28) },
        uStarA: {
          value: new THREE.Vector4(
            1.45, // surface brightness
            1.0, // soft inner glow on surface
            0.65, // reserved / legacy corona amount
            0.35 // reserved / legacy flare amount
          )
        },
        uStarB: {
          value: new THREE.Vector4(
            1.0, // surfaceScale
            0.12, // reserved / legacy coronaScale
            1.0, // surfaceAnimationSpeed
            shaderIdToMode(shaderId)
          )
        }
      },

      vertexShader: /* glsl */ `
        varying vec3 vViewNormal;
        varying vec3 vLocalNormal;
        varying vec2 vUv;

        void main() {
          vUv = uv;

          vLocalNormal = normalize(normal);
          vViewNormal = normalize(normalMatrix * normal);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec3 uColor;
        uniform vec4 uStarA;
        uniform vec4 uStarB;

        varying vec3 vViewNormal;
        varying vec3 vLocalNormal;
        varying vec2 vUv;

        float brightness() {
          return max(0.0, uStarA.x);
        }

        float glowAmount() {
          return max(0.0, uStarA.y);
        }

        float surfaceScale() {
          return clamp(uStarB.x, 0.05, 4.0);
        }

        float surfaceAnimationSpeed() {
          return clamp(uStarB.z, 0.0, 8.0);
        }

        float shaderMode() {
          return floor(uStarB.w + 0.5);
        }

        float hash31(vec3 p) {
          return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
        }

        float noise3(vec3 x) {
          vec3 p = floor(x);
          vec3 f = fract(x);

          f = f * f * (3.0 - 2.0 * f);

          float n000 = hash31(p + vec3(0.0, 0.0, 0.0));
          float n100 = hash31(p + vec3(1.0, 0.0, 0.0));
          float n010 = hash31(p + vec3(0.0, 1.0, 0.0));
          float n110 = hash31(p + vec3(1.0, 1.0, 0.0));
          float n001 = hash31(p + vec3(0.0, 0.0, 1.0));
          float n101 = hash31(p + vec3(1.0, 0.0, 1.0));
          float n011 = hash31(p + vec3(0.0, 1.0, 1.0));
          float n111 = hash31(p + vec3(1.0, 1.0, 1.0));

          float nx00 = mix(n000, n100, f.x);
          float nx10 = mix(n010, n110, f.x);
          float nx01 = mix(n001, n101, f.x);
          float nx11 = mix(n011, n111, f.x);

          float nxy0 = mix(nx00, nx10, f.y);
          float nxy1 = mix(nx01, nx11, f.y);

          return mix(nxy0, nxy1, f.z);
        }

        float fbm(vec3 p) {
          float acc = 0.0;
          float amp = 0.5;
          float freq = 1.0;

          for (int i = 0; i < 5; i += 1) {
            acc += noise3(p * freq) * amp;
            freq *= 2.03;
            amp *= 0.52;
          }

          return acc;
        }

        vec3 fractalSunColor(vec3 n, float time) {
          float scale = mix(5.5, 0.24, smoothstep(0.05, 4.0, surfaceScale()));
          float speed = surfaceAnimationSpeed();

          vec3 flow = n * scale;
          flow.x += time * 0.16 * speed;
          flow.y += sin(time * 0.11 * speed + n.z * 2.7) * 0.8;

          float cells = fbm(flow);
          float veins = fbm(flow * 2.4 + vec3(0.0, time * 0.08 * speed, 2.0));
          float heat = smoothstep(0.18, 0.95, cells * 0.72 + veins * 0.48);

          vec3 warm = mix(uColor, vec3(1.0, 0.76, 0.30), 0.38);
          vec3 hot = vec3(1.0, 0.92, 0.62);
          vec3 deep = mix(uColor * 0.65, vec3(0.70, 0.24, 0.04), 0.22);

          vec3 col = mix(deep, warm, smoothstep(0.12, 0.62, heat));
          col = mix(col, hot, smoothstep(0.58, 1.0, heat) * 0.78);

          return col;
        }

        vec3 agePlasmaColor(vec3 n, float time) {
          float speed = surfaceAnimationSpeed();
          float scale = surfaceScale();

          vec3 p = n * mix(1.8, 9.0, smoothstep(0.05, 4.0, scale));

          p += vec3(
            sin(time * 0.19 * speed + n.y * 4.0),
            cos(time * 0.15 * speed + n.z * 3.0),
            sin(time * 0.11 * speed + n.x * 5.0)
          );

          float a = fbm(p + time * 0.07 * speed);
          float b = fbm(p * 1.7 - time * 0.05 * speed + 4.0);
          float plasma = sin((a * 2.6 + b * 1.7 + n.y * 0.8) * 6.2831);
          plasma = plasma * 0.5 + 0.5;

          vec3 oldRed = mix(uColor * 0.55, vec3(0.85, 0.18, 0.05), 0.42);
          vec3 gold = vec3(1.0, 0.64, 0.18);
          vec3 whiteHot = vec3(1.0, 0.96, 0.74);

          vec3 col = mix(oldRed, gold, smoothstep(0.18, 0.7, plasma));
          col = mix(col, whiteHot, smoothstep(0.72, 1.0, plasma) * 0.7);

          return col;
        }

        void main() {
          vec3 viewNormal = normalize(vViewNormal);
          vec3 surfaceNormal = normalize(vLocalNormal);

          float rim = pow(
            1.0 - max(0.0, dot(viewNormal, vec3(0.0, 0.0, 1.0))),
            2.0
          );

          vec3 col;

          if (shaderMode() > 0.5) {
            col = agePlasmaColor(surfaceNormal, uTime);
          } else {
            col = fractalSunColor(surfaceNormal, uTime);
          }

          float softInnerGlow = glowAmount() * 0.08;
          float softRimGlow = rim * glowAmount() * 0.10;

          col *= brightness();
          col += uColor * softInnerGlow;
          col += mix(uColor, vec3(1.0, 0.86, 0.52), 0.45) * softRimGlow;

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.setStarConfig(starConfig ?? {}, shaderId);
  }

  setStarConfig(starConfig, shaderId = starConfig.shaderId) {
    const color = starConfig.color ?? [1.0, 0.62, 0.28];

    this.uniforms.uColor.value.setRGB(color[0], color[1], color[2]);

    this.uniforms.uStarA.value.set(
      starConfig.brightness ?? 1.45,
      starConfig.glow ?? 1.0,
      starConfig.corona ?? 0.65,
      starConfig.flare ?? 0.35
    );

    this.uniforms.uStarB.value.set(
      starConfig.surfaceScale ?? 1.0,
      starConfig.coronaScale ?? 0.12,
      starConfig.surfaceAnimationSpeed ?? starConfig.surfaceSpeed ?? 1.0,
      shaderIdToMode(shaderId ?? "fractal-sun")
    );
  }
}

function shaderIdToMode(shaderId) {
  if (shaderId === "age-plasma-sun") {
    return 1;
  }

  return 0;
}