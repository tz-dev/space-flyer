import * as THREE from "three";

export class FinalCompositeMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      depthWrite: false,
      depthTest: false,
      uniforms: {
        tScene: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uPixelation: { value: 1.0 },
        uBrightness: { value: 1.0 },
        uContrast: { value: 1.0 },
        uGamma: { value: 1.0 },
        uExposure: { value: 1.0 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;

        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;

        uniform sampler2D tScene;
        uniform vec2 uResolution;
        uniform float uPixelation;
        uniform float uBrightness;
        uniform float uContrast;
        uniform float uGamma;
        uniform float uExposure;

        varying vec2 vUv;

        void main() {
          float pixelation = max(1.0, uPixelation);
          vec2 sampleUv = vUv;

          if (pixelation > 1.01) {
            vec2 pixelGrid = max(vec2(1.0), floor(uResolution / pixelation));
            sampleUv = (floor(vUv * pixelGrid) + 0.5) / pixelGrid;
          }

          vec3 color = texture2D(tScene, sampleUv).rgb;

          color *= max(0.0, uExposure);
          color = (color - 0.5) * max(0.0, uContrast) + 0.5;
          color += uBrightness - 1.0;
          color = max(color, vec3(0.0));
          color = pow(color, vec3(1.0 / max(0.01, uGamma)));

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
  }
}
