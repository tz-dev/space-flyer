import * as THREE from "three";

export class TerrainLocalRingMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uAspectTanFov: { value: new THREE.Vector2(1, Math.tan(THREE.MathUtils.degToRad(60) * 0.5)) },
        uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
        uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
        uCameraForward: { value: new THREE.Vector3(0, 0, -1) },
        uRingNormal: { value: new THREE.Vector3(0, 1, 0) },
        uSunDirection: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
        uColor: { value: new THREE.Color(0.86, 0.78, 0.62) },
        uRingA: { value: new THREE.Vector4(1.35, 2.35, 1.25, 0.85) },
        // x = hue, y = banding, z = terrain sky distance, w = reserved
        uRingB: { value: new THREE.Vector4(0.12, 1.15, 28.0, 0.0) }
      },
      vertexShader: /* glsl */ `
        varying vec2 vNdc;

        void main() {
          vNdc = position.xy;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec2 uAspectTanFov;
        uniform vec3 uCameraRight;
        uniform vec3 uCameraUp;
        uniform vec3 uCameraForward;
        uniform vec3 uRingNormal;
        uniform vec3 uSunDirection;
        uniform vec3 uColor;
        uniform vec4 uRingA;
        uniform vec4 uRingB;

        varying vec2 vNdc;

        float innerRadius() { return max(1.001, uRingA.x); }
        float outerRadius() { return max(innerRadius() + 0.001, uRingA.y); }
        float brightness() { return max(0.0, uRingA.z); }
        float opacity() { return clamp(uRingA.w, 0.0, 1.0); }
        float hueAmount() { return clamp(uRingB.x, -1.0, 1.0); }
        float bandingAmount() { return max(0.0, uRingB.y); }
        float terrainSkyDistance() { return max(4.0, uRingB.z); }

        float hash11(float p) {
          return fract(sin(p * 127.1) * 43758.5453123);
        }

        float noise1(float x) {
          float i = floor(x);
          float f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(hash11(i), hash11(i + 1.0), f);
        }

        void main() {
          vec2 ndc = vNdc;
          vec3 ray = normalize(
            uCameraForward +
            uCameraRight * ndc.x * uAspectTanFov.x * uAspectTanFov.y +
            uCameraUp * ndc.y * uAspectTanFov.y
          );

          // Terrain-local Y is the local surface-up axis. This overlay has no
          // terrain depth mask, so keep the ring above the terrain horizon.
          float skyFade = smoothstep(0.12, 0.26, ray.y);
          if (skyFade <= 0.001) {
            discard;
          }

          vec3 ringNormal = normalize(uRingNormal);

          // Keep the old local sky-plane projection.
          // This preserves the "partial ring in the sky" behavior.
          // apparentSize only soft-scales the projected radius instead of
          // moving the whole ring plane into the camera view.
          float terrainProjectionScale = terrainSkyDistance();

          vec3 viewer = vec3(0.0, 1.0, 0.0);
          float denom = dot(ringNormal, ray);

          if (abs(denom) < 0.0007) {
            discard;
          }

          float hitT = -dot(ringNormal, viewer) / denom;

          if (hitT <= 0.0) {
            discard;
          }

          vec3 hitPoint = viewer + ray * hitT;
          vec3 ringPlanePoint = hitPoint - ringNormal * dot(hitPoint, ringNormal);

          float r = length(ringPlanePoint) / max(terrainProjectionScale, 0.0001);

          float inner = innerRadius();
          float outer = outerRadius();

          if (r < inner || r > outer) {
            discard;
          }

          float t = clamp((r - inner) / max(outer - inner, 0.0001), 0.0, 1.0);
          float innerEdge = smoothstep(inner, inner + (outer - inner) * 0.04, r);
          float outerEdge = 1.0 - smoothstep(outer - (outer - inner) * 0.08, outer, r);
          float edgeMask = innerEdge * outerEdge;

          float broadBands =
            0.50 +
            0.23 * sin(t * 42.0 + hueAmount() * 5.0) +
            0.14 * sin(t * 117.0 + 2.1) +
            0.08 * sin(t * 271.0 - 1.4);

          float fine = noise1(t * 180.0 + hueAmount() * 31.0) * 0.18;
          float gaps = 1.0;
          gaps *= 1.0 - 0.78 * (1.0 - smoothstep(0.010, 0.030, abs(t - 0.37)));
          gaps *= 1.0 - 0.52 * (1.0 - smoothstep(0.008, 0.026, abs(t - 0.63)));
          gaps *= 1.0 - 0.36 * (1.0 - smoothstep(0.006, 0.018, abs(t - 0.78)));

          float bands = clamp((broadBands + fine) * gaps, 0.0, 1.0);
          bands = mix(0.72, bands, clamp(bandingAmount(), 0.0, 3.0) / 3.0);

          vec3 warmTint = mix(uColor, vec3(1.0, 0.78, 0.46), max(0.0, hueAmount()) * 0.45);
          vec3 coolTint = mix(warmTint, vec3(0.62, 0.72, 0.92), max(0.0, -hueAmount()) * 0.45);

          float ringLight = 0.32 + 0.68 * abs(dot(ringNormal, normalize(uSunDirection)));
          float viewFade = smoothstep(0.0, 0.18, abs(denom));
          float distanceFade = 1.0 - smoothstep(18.0, 52.0, hitT);

          vec3 color = coolTint * bands * brightness() * ringLight;
          float alpha = opacity() * edgeMask * skyFade * viewFade * distanceFade * (0.22 + bands * 0.78);

          if (alpha <= 0.003) {
            discard;
          }

          gl_FragColor = vec4(color, alpha);
        }
      `
    });
  }

  setSize(width, height) {
    const aspect = Math.max(0.0001, width / Math.max(1, height));
    this.uniforms.uAspectTanFov.value.set(
      aspect,
      Math.tan(THREE.MathUtils.degToRad(60) * 0.5)
    );
  }

  setCameraBasis(terrainCamera) {
    if (!terrainCamera?.right || !terrainCamera?.up || !terrainCamera?.forward) {
      return;
    }

    this.uniforms.uCameraRight.value.copy(terrainCamera.right).normalize();
    this.uniforms.uCameraUp.value.copy(terrainCamera.up).normalize();
    this.uniforms.uCameraForward.value.copy(terrainCamera.forward).normalize();
  }

  setRingConfig({ ringConfig = {}, planetConfig = {}, ringNormalLocal = [0, 1, 0], sunDirectionLocal = [0.4, 0.7, 0.3] } = {}) {
    const baseColor = ringConfig.color ?? planetConfig.visual?.accentColor ?? planetConfig.visual?.baseColor ?? [0.86, 0.78, 0.62];
    const surfaceScale = ringConfig.surfaceScale ?? 1.0;
    const innerRadius = Math.max(1.001, (ringConfig.innerRadius ?? 1.35) * surfaceScale);
    const outerRadius = Math.max(innerRadius + 0.001, (ringConfig.outerRadius ?? 2.35) * surfaceScale);

    this.uniforms.uColor.value.setRGB(
      baseColor[0] ?? 0.86,
      baseColor[1] ?? 0.78,
      baseColor[2] ?? 0.62
    );

    this.uniforms.uRingNormal.value.set(
      ringNormalLocal[0] ?? 0,
      ringNormalLocal[1] ?? 1,
      ringNormalLocal[2] ?? 0
    ).normalize();

    this.uniforms.uSunDirection.value.set(
      sunDirectionLocal[0] ?? 0.4,
      sunDirectionLocal[1] ?? 0.7,
      sunDirectionLocal[2] ?? 0.3
    ).normalize();

    this.uniforms.uRingA.value.set(
      innerRadius,
      outerRadius,
      ringConfig.brightness ?? 1.25,
      ringConfig.opacity ?? 0.85
    );

    const apparentSize = Math.max(0.1, ringConfig.apparentSize ?? 1.0);

    // Mild TerrainView-only projection scaling.
    // Do not move the ring plane into the sky; that creates a huge full ring.
    // Higher apparentSize makes the projected ring feel slightly farther/larger,
    // but preserves the partial-sky-ring behavior.
    const terrainProjectionScale = 0.85 + apparentSize * 0.55;

    this.uniforms.uRingB.value.set(
      ringConfig.hue ?? 0.12,
      ringConfig.banding ?? 1.15,
      terrainProjectionScale,
      0.0
    );
  }
}
