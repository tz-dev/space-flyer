import * as THREE from "three";

export class OrbitAuroraRibbonMaterial extends THREE.ShaderMaterial {
  constructor({ auroraConfig = {}, baseColor = null, accentColor = null, layerIndex = 0, layerCount = 2 } = {}) {
    super({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,

      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.34, 1.0, 0.72) },
        uCameraPosition: { value: new THREE.Vector3() },
        uParamsA: {
          value: new THREE.Vector4(
            1.0, // intensity
            1.0, // speed
            2.2, // wave frequency
            1.0 // trail
          )
        },
        uParamsB: {
          value: new THREE.Vector4(
            1.35, // glow
            1.0, // horizon fade
            0.0, // phase
            0.32 // fold amount
          )
        }
      },

      vertexShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec4 uParamsA;
        uniform vec4 uParamsB;

        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying float vAlong;
        varying float vAcross;

        void main() {
          vUv = uv;

          float intensity = max(uParamsA.x, 0.0);
          float speed = max(uParamsA.y, 0.0);
          float waveFrequency = max(uParamsA.z, 0.1);
          float trail = max(uParamsA.w, 0.1);
          float phase = uParamsB.z;
          float foldAmount = max(uParamsB.w, 0.0);

          vec3 p = position;
          float along = clamp(uv.y, 0.0, 1.0);
          float across = position.x;
          float t = uTime * (0.35 + speed * 0.65);

          float ribbonMask = sin(along * 3.14159265);
          float edgeRelax = 1.0 - smoothstep(0.22, 0.56, abs(across));
          float waveA = sin(along * (4.5 + waveFrequency * 0.8) + t * 1.2 + phase);
          float waveB = sin(along * (9.0 + waveFrequency * 1.4) - across * 3.8 - t * 1.7 + phase * 1.7);
          float sideSway = (waveA * 0.12 + waveB * 0.06) * (0.18 + 0.82 * along);
          float fold = sin(along * (6.0 + trail * 3.5) + across * 6.0 + t * 2.0 + phase) * foldAmount;
          float flutter = sin(along * 14.0 - across * 4.0 + t * 4.5 + phase * 0.6) * 0.028 * (0.15 + along * 0.85);

          p.x += sideSway + flutter;
          p.z += fold * edgeRelax * (0.10 + 0.90 * ribbonMask) * (0.50 + intensity * 0.18);
          p.x += sin(along * 7.5 + t * 1.6 + phase * 0.5) * 0.035 * edgeRelax * (0.25 + along * 0.75);

          vec4 worldPosition = modelMatrix * vec4(p, 1.0);
          vWorldPosition = worldPosition.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vAlong = along;
          vAcross = across;

          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        uniform vec3 uColor;
        uniform vec3 uCameraPosition;
        uniform vec4 uParamsA;
        uniform vec4 uParamsB;

        varying vec2 vUv;
        varying vec3 vWorldPosition;
        varying vec3 vWorldNormal;
        varying float vAlong;
        varying float vAcross;

        float saturate(float value) {
          return clamp(value, 0.0, 1.0);
        }

        void main() {
          float intensity = max(uParamsA.x, 0.0);
          float glow = max(uParamsB.x, 0.0);
          float horizonFade = max(uParamsB.y, 0.0);

          float centerBand = exp(-pow(abs(vUv.x - 0.5) / 0.24, 1.55));
          float sideBand = exp(-pow(abs(vUv.x - 0.5) / 0.40, 2.2));
          float lowerFade = smoothstep(0.00, 0.08, vUv.y);
          float upperFade = 1.0 - smoothstep(0.82, 1.0, vUv.y);
          float bodyMask = lowerFade * upperFade;

          float veil = 0.40 + 0.60 * sin(vAlong * 18.0 + vAcross * 5.0 + uParamsB.z);
          veil = mix(0.55, 1.0, saturate(veil));

          vec3 viewDir = normalize(uCameraPosition - vWorldPosition);
          float rim = pow(1.0 - abs(dot(normalize(vWorldNormal), viewDir)), 1.4);
          float viewFade = mix(0.72, 1.18, saturate(rim * (0.80 + horizonFade * 0.25)));

          float alpha = centerBand * bodyMask * veil;
          alpha += sideBand * bodyMask * 0.16 * (0.4 + rim * 0.6);
          alpha *= (0.18 + intensity * 0.22) * viewFade;
          alpha = saturate(alpha);

          vec3 edgeColor = mix(uColor, vec3(0.22, 0.95, 1.0), 0.28);
          vec3 coreColor = mix(edgeColor, vec3(0.95, 1.0, 0.98), saturate(centerBand * 0.55 + glow * 0.08));
          vec3 color = mix(edgeColor, coreColor, saturate(centerBand * 0.9));
          color *= (0.55 + 0.45 * vAlong) * (0.65 + glow * 0.20) * (0.50 + rim * 0.50);

          if (alpha <= 0.003) {
            discard;
          }

          gl_FragColor = vec4(color, alpha);
        }
      `
    });

    this.setAuroraConfig(auroraConfig, { baseColor, accentColor, layerIndex, layerCount });
  }

  setCameraPosition(cameraPosition) {
    if (!cameraPosition) {
      return;
    }

    this.uniforms.uCameraPosition.value.copy(cameraPosition);
  }

  setAuroraConfig(auroraConfig = {}, { baseColor = null, accentColor = null, layerIndex = 0, layerCount = 2 } = {}) {
    const intensity = Math.max(0.0, auroraConfig.intensity ?? 1.0);
    const speed = Math.max(0.0, auroraConfig.speed ?? 1.0);
    const bandScale = Math.max(20.0, auroraConfig.bandScale ?? 140.0);
    const trail = Math.max(0.1, auroraConfig.trail ?? 1.0);
    const glow = Math.max(0.0, auroraConfig.glow ?? 1.35);
    const horizonFade = Math.max(0.0, auroraConfig.horizonFade ?? 1.0);

    const waveFrequency = THREE.MathUtils.clamp(1.2 + (bandScale - 20.0) / 260.0, 1.2, 4.8);
    const foldAmount = THREE.MathUtils.clamp(0.20 + trail * 0.16 + layerIndex * 0.06, 0.18, 0.95);
    const phase = layerCount > 1
      ? (layerIndex / Math.max(layerCount, 1)) * Math.PI * 1.35
      : 0.0;

    this.uniforms.uParamsA.value.set(
      intensity,
      speed,
      waveFrequency,
      trail
    );

    this.uniforms.uParamsB.value.set(
      glow,
      horizonFade,
      phase,
      foldAmount
    );

    const base = Array.isArray(baseColor) ? baseColor : [0.20, 0.82, 0.46];
    const accent = Array.isArray(accentColor) ? accentColor : [0.34, 1.0, 0.72];

    const color = new THREE.Color().setRGB(
      THREE.MathUtils.clamp(base[0] * 0.18 + accent[0] * 0.28 + 0.18, 0.0, 1.0),
      THREE.MathUtils.clamp(base[1] * 0.12 + accent[1] * 0.42 + 0.58, 0.0, 1.0),
      THREE.MathUtils.clamp(base[2] * 0.16 + accent[2] * 0.38 + 0.26, 0.0, 1.0)
    );

    this.uniforms.uColor.value.copy(color);
  }
}
