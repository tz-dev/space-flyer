import * as THREE from "three";

export class StarPointMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,

      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uBaseSize: { value: 11.0 }
      },

      vertexShader: /* glsl */ `
        attribute float aSize;

        uniform float uPixelRatio;
        uniform float uBaseSize;

        varying vec3 vColor;

        void main() {
          vColor = color;

          vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);

          gl_Position = projectionMatrix * modelViewPosition;

          float distanceScale = 250.0 / max(1.0, -modelViewPosition.z);
          gl_PointSize = aSize * uBaseSize * distanceScale * uPixelRatio;
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        varying vec3 vColor;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);

          float core = smoothstep(0.22, 0.0, d);
          float glow = smoothstep(0.5, 0.0, d) * 0.42;

          float alpha = core + glow;

          if (alpha <= 0.01) {
            discard;
          }

          vec3 color = vColor * (core * 1.8 + glow);

          gl_FragColor = vec4(color, alpha);
        }
      `
    });
  }
}