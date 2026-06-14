import * as THREE from "three";

export class TerrainGroundMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color(0x21364f) },
        uAccentColor: { value: new THREE.Color(0x6fb7ff) }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
          vUv = uv;
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3 uBaseColor;
        uniform vec3 uAccentColor;

        varying vec2 vUv;
        varying vec3 vWorldPosition;

        float gridLine(float value, float width) {
          float line = abs(fract(value - 0.5) - 0.5) / fwidth(value);
          return 1.0 - smoothstep(width, width + 1.0, line);
        }

        void main() {
          vec2 p = vWorldPosition.xz * 0.14;
          float grid = max(gridLine(p.x, 0.65), gridLine(p.y, 0.65));
          float pulse = 0.5 + 0.5 * sin(uTime * 1.5 + vWorldPosition.x * 0.12 + vWorldPosition.z * 0.08);
          float vignette = smoothstep(42.0, 2.0, length(vWorldPosition.xz));

          vec3 color = mix(uBaseColor, uAccentColor, grid * 0.65 + pulse * 0.12);
          color *= 0.35 + vignette * 0.95;

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
  }
}