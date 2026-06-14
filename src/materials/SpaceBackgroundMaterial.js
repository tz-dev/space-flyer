import * as THREE from "three";

export class SpaceBackgroundMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,

      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector4(0, 0, 1, 0) },
        uDate: { value: new THREE.Vector4(2026, 1, 1, 0) },
        uRotation: { value: new THREE.Matrix3() }
      },

      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;

          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        uniform vec2 uResolution;
        uniform float uTime;
        uniform vec4 uMouse;
        uniform vec4 uDate;
        uniform mat3 uRotation;

        varying vec3 vWorldPosition;

        float hash(const in float n) {
          return fract(sin(n) * 4378.5453);
        }

        float pnoise(in vec3 o) {
          vec3 p = floor(o);
          vec3 fr = fract(o);

          float n = p.x + p.y * 57.0 + p.z * 1009.0;

          float a = hash(n + 0.0);
          float b = hash(n + 1.0);
          float c = hash(n + 57.0);
          float d = hash(n + 58.0);

          float e = hash(n + 0.0 + 1009.0);
          float f = hash(n + 1.0 + 1009.0);
          float g = hash(n + 57.0 + 1009.0);
          float h = hash(n + 58.0 + 1009.0);

          vec3 fr2 = fr * fr;
          vec3 fr3 = fr2 * fr;
          vec3 t = 3.0 * fr2 - 2.0 * fr3;

          float u = t.x;
          float v = t.y;
          float w = t.z;

          float res1 = a + (b - a) * u + (c - a) * v + (a - b + d - c) * u * v;
          float res2 = e + (f - e) * u + (g - e) * v + (e - f + h - g) * u * v;

          return res1 * (1.0 - w) + res2 * w;
        }

        const mat3 m = mat3(
           0.00,  0.80,  0.60,
          -0.80,  0.36, -0.48,
          -0.60, -0.48,  0.64
        );

        float SmoothNoise(vec3 p) {
          float f;
          f  = 0.5000 * pnoise(p); p = m * p * 2.02;
          f += 0.2500 * pnoise(p);

          return f * (1.0 / (0.5000 + 0.2500));
        }

        mat2 rot2D(float a) {
          return mat2(cos(a), sin(a), -sin(a), cos(a));
        }

        vec3 getNebula(in vec3 from, in vec3 dir, float level, float power) {
          from += vec3(0.0);

          vec3 color = vec3(0.0);
          float nebula = pow(SmoothNoise(dir + 3.0), 12.0);

          if (nebula > 0.0) {
            vec3 pos = (dir.xyz + dir.xzy + dir.zyx) / 3.0;
            pos += vec3(0.0);

            vec3 randc = vec3(SmoothNoise(dir.xyz * 10.0 * level));
            color = nebula * randc;
          }

          return pow(color * 2.25, vec3(power));
        }

        vec3 getStars(in vec3 from, in vec3 dir, float power) {
          from += vec3(0.0);

          vec3 color = vec3(pow(SmoothNoise(dir * 320.0), 16.0));
          return pow(color * 2.25, vec3(power));
        }

        void mainImage(out vec4 fragColor, in vec2 fragCoord) {
          vec2 uv = fragCoord.xy / uResolution.xy;

          uv = uv * 2.0 - 1.0;
          uv.y *= uResolution.y / uResolution.x;
          uv.y -= 0.03;

          vec2 mouse = (uMouse.xy / uResolution.xy - 0.5) * 3.0;
          mouse.y -= 2.0;

          if (uMouse.z < 1.0) {
            mouse = vec2(0.0, -2.0);
          }

          vec3 dir = normalize(vec3(uv, 0.8));

          mat2 camrot1 = rot2D(mouse.y);
          mat2 camrot2 = rot2D(mouse.x);

          dir.yz *= camrot1;
          dir.xy *= camrot2;
          dir = normalize(uRotation * dir);

          vec3 from = vec3(0.0);

          vec3 color =
            clamp(getNebula(from, dir, 1.0, 0.5) * 1.5, 0.0, 1.0) *
            vec3(0.0, 0.0, 1.0);

          vec3 color2 =
            clamp(getNebula(from, dir, 2.0, 0.5) * 1.5, 0.0, 1.0) *
            vec3(0.0, 1.0, 1.0);

          vec3 color3 =
            clamp(getNebula(from, -dir, 2.0, 0.5) * 0.9, 0.0, 1.0) *
            vec3(1.0, 0.0, 0.0);

          vec3 color4 =
            clamp(getNebula(from, -dir, 3.0, 0.5) * 0.7, 0.0, 1.0) *
            vec3(1.0, 1.0, 0.0);

          vec3 color5 =
            clamp(getNebula(from, dir.yxz + dir.yzx, 1.5, 0.5) * 0.9, 0.0, 1.0) *
            vec3(0.0, 1.0, 0.0);

          vec3 color6 =
            clamp(getNebula(from, dir.yxz + dir.yzx, 2.5, 0.5) * 0.7, 0.0, 1.0) *
            vec3(0.333, 0.333, 0.333);

          vec3 colorStars = clamp(getStars(from, dir, 0.9), 0.0, 1.0);

          color = color + color2 + color3 + color4 + color5 + color6 + colorStars;
          color = clamp(color, vec3(0.0), vec3(1.0));
          color = pow(color, vec3(1.2));

          fragColor = vec4(color, 1.0);
        }

        void main() {
          vec4 color;
          mainImage(color, gl_FragCoord.xy);
          gl_FragColor = color;
        }
      `
    });
  }
}