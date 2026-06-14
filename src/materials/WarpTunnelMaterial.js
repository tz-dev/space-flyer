import * as THREE from "three";

export class WarpTunnelMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.NormalBlending,

      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uOpacity: { value: 0 }
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

        uniform float uTime;
        uniform vec2 uResolution;
        uniform float uOpacity;

        varying vec2 vUv;

        void mainImage(out vec4 fragColor, in vec2 fragCoord) {
          vec2 uv = (fragCoord - 0.5 * uResolution.xy) / uResolution.y;
          float t = uTime;

          vec3 ro = vec3(1.05, 0.0, 0.0);
          vec3 lookat = vec3(0.5, 0.0, 1.0);
          float zoom = 0.8;

          vec3 up_changes = vec3(cos(t * 0.1), sin(t * 0.1), 0.0);

          vec3 f = normalize(lookat - ro);
          vec3 r = normalize(cross(up_changes, f));
          vec3 u = cross(f, r);
          vec3 c = ro + f * zoom;
          vec3 i = c + uv.x * r + uv.y * u;
          vec3 rd = normalize(i - ro);

          float dS = 0.0;
          float dO = 0.0;
          vec3 p = vec3(0.0);

          float radius_major = 1.0;
          float radius_minor = 0.07;

          for (int stepIndex = 0; stepIndex < 100; stepIndex += 1) {
            p = ro + rd * dO;

            dS = -(
              length(vec2(length(p.xz) - radius_major, p.y)) -
              radius_minor
            );

            if (dS < 0.0001) {
              break;
            }

            dO += dS;
          }

          float base_coat = 0.0;
          vec3 highlights = vec3(0.0);
          vec3 col = vec3(0.0);

          if (dS < 0.001) {
            float x = atan(p.x, p.z);
            float y = atan(length(p.xz) - 1.0, p.y);

            float y_bands = smoothstep(0.1, 1.0, sin(-y * 250.0));
            float x_noisy = x + sin(y * 20.0) * 0.01 + sin(y * 50.5) * 0.01;
            float x_bands = sin(x_noisy * 20.0 + -t * 12.0) * 5.0;

            float x_adaptiv =
              x * pow(mix(uResolution.x, uResolution.y, 0.5) / 5000.0 + 0.8, 1.3);

            float anti_moire = smoothstep(1.7, 0.7, x_adaptiv);
            y_bands = mix(y_bands, 0.7, anti_moire);

            base_coat +=
              (1.2 - smoothstep(-5.0, -3.0, x_bands) + 0.5) *
              y_bands *
              0.8;

            highlights +=
              (sin(y * 5.0 - t * 2.1 - x * 5.0) * 0.5 + 0.5) +
              (sin(y * 1.0 + t * 3.5 - x * 5.0) * 0.5 + 0.5);

            highlights =
              (1.0 - x_bands) *
              y_bands *
              3.0 *
              smoothstep(0.2, 3.0, highlights) *
              0.05;
          }

          base_coat = mix(base_coat, 0.0, 0.6) + 0.05;

          col = vec3(base_coat * 0.5, base_coat * 0.6, base_coat) + highlights;

          vec2 uv2 = fragCoord.xy / uResolution.xy;
          uv2 *= 1.0 - uv2.yx;

          float vig = uv2.x * uv2.y * 25.0;
          vig = 0.2 + pow(vig, 0.8) * 0.8;

          col *= vig;

          fragColor = vec4(col, 1.0);
        }

        void main() {
          vec2 fragCoord = vUv * uResolution;
          vec4 color;

          mainImage(color, fragCoord);

          color.rgb *= uOpacity;
          color.a = uOpacity;

          gl_FragColor = color;
        }
      `
    });
  }
}