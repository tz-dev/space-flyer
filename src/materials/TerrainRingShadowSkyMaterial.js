import * as THREE from "three";

export class TerrainRingShadowSkyMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NormalBlending,

      uniforms: {
        uCameraRight: { value: new THREE.Vector3(1, 0, 0) },
        uCameraUp: { value: new THREE.Vector3(0, 1, 0) },
        uCameraForward: { value: new THREE.Vector3(0, 0, -1) },
        uRingNormalLocal: { value: new THREE.Vector3(0, 1, 0) },
        uSunDirectionLocal: { value: new THREE.Vector3(0.4, 0.7, -0.4) },
        uParams: {
          value: new THREE.Vector4(
            0.0, // enabled
            0.85, // strength
            0.12, // width
            0.28 // softness
          )
        },
        uShadowShape: {
          value: new THREE.Vector4(
            0.08, // innerCutoff
            0.03, // cutoffSoftness
            0.05, // sunAngularRadius
            0.0 // reserved
          )
        },
        uCameraParams: {
          value: new THREE.Vector2(
            1.0, // aspect
            Math.tan(THREE.MathUtils.degToRad(60) * 0.5) // tanHalfFov
          )
        }
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

        uniform vec3 uCameraRight;
        uniform vec3 uCameraUp;
        uniform vec3 uCameraForward;
        uniform vec3 uRingNormalLocal;
        uniform vec3 uSunDirectionLocal;
        uniform vec4 uParams;
        uniform vec4 uShadowShape;
        uniform vec2 uCameraParams;

        varying vec2 vUv;

        void main() {
          if (uParams.x < 0.5) {
            discard;
          }

          vec2 ndc = vUv * 2.0 - 1.0;
          ndc.x *= uCameraParams.x * uCameraParams.y;
          ndc.y *= uCameraParams.y;

          vec3 skyDir = normalize(
            uCameraRight * ndc.x +
            uCameraUp * ndc.y +
            uCameraForward
          );

          vec3 ringNormal = normalize(uRingNormalLocal);
          vec3 sunDir = normalize(uSunDirectionLocal);

          // Band in der Ringebene.
          float bandDistance = abs(dot(skyDir, ringNormal));

          float width = max(0.001, uParams.z);
          float softness = max(0.001, uParams.w);
          float band = 1.0 - smoothstep(width, width + softness, bandDistance);

          // Richtung des Schattenstreifens: von der Sonne weg, projiziert in die Ringebene.
          vec3 shadowForward = -(sunDir - ringNormal * dot(sunDir, ringNormal));
          float shadowForwardLength = length(shadowForward);

          if (shadowForwardLength < 0.0001) {
            discard;
          }

          shadowForward /= shadowForwardLength;

          // Nur "weg von der Sonne".
          float forward = dot(skyDir, shadowForward);
          float forwardGate = smoothstep(0.06, 0.35, forward);

          // Abstand vom Sonnenzentrum auf der Himmelskugel.
          float sunSeparation = acos(clamp(dot(skyDir, sunDir), -1.0, 1.0));

          // Erst nach dem inneren Ringende sichtbar machen.
          float innerCutoff = max(uShadowShape.x, uShadowShape.z * 1.02);
          float cutoffSoftness = max(0.001, uShadowShape.y);
          float startGate = smoothstep(
            innerCutoff,
            innerCutoff + cutoffSoftness,
            sunSeparation
          );

          float alpha = band * max(uParams.y, 0.75) * forwardGate * startGate;

          if (alpha <= 0.002) {
            discard;
          }

          gl_FragColor = vec4(vec3(0.0), clamp(alpha, 0.0, 0.85));
        }
      `
    });
  }

  setCameraBasis(terrainCamera, aspect) {
    if (!terrainCamera?.right || !terrainCamera?.up || !terrainCamera?.forward) {
      return;
    }

    this.uniforms.uCameraRight.value.copy(terrainCamera.right).normalize();
    this.uniforms.uCameraUp.value.copy(terrainCamera.up).normalize();
    this.uniforms.uCameraForward.value.copy(terrainCamera.forward).normalize();
    this.uniforms.uCameraParams.value.x = Math.max(0.0001, aspect);
  }

  setShadowConfig({
    enabled,
    ringNormalLocal,
    sunDirectionLocal,
    ringConfig,
    sunAngularRadius
  } = {}) {
    this.uniforms.uParams.value.x = enabled ? 1.0 : 0.0;

    if (ringNormalLocal) {
      this.uniforms.uRingNormalLocal.value.fromArray(ringNormalLocal).normalize();
    }

    if (sunDirectionLocal) {
      this.uniforms.uSunDirectionLocal.value.fromArray(sunDirectionLocal).normalize();
    }

    const skyShadow = ringConfig?.skyShadow ?? {};

    this.uniforms.uParams.value.y = Number(skyShadow.strength ?? 0.34);
    this.uniforms.uParams.value.z = Number(skyShadow.width ?? 0.045);
    this.uniforms.uParams.value.w = Number(skyShadow.softness ?? 0.18);

    const apparentSize = Number(ringConfig?.apparentSize ?? 1.0);
    const systemScale = Number(ringConfig?.systemScale ?? 1.0);
    const innerRadius = Number(ringConfig?.innerRadius ?? 1.35);
    const baseSunAngularRadius = Math.max(0.01, Number(sunAngularRadius ?? 0.05));

    // Günstige visuelle Annäherung:
    // Schatten beginnt erst nach Sonnenradius + innerem Ringende.
    const innerCutoff =
      baseSunAngularRadius *
      Math.max(1.05, innerRadius * apparentSize * systemScale * 0.65);

    const cutoffSoftness = Math.max(0.015, innerCutoff * 0.28);

    this.uniforms.uShadowShape.value.x = innerCutoff;
    this.uniforms.uShadowShape.value.y = cutoffSoftness;
    this.uniforms.uShadowShape.value.z = baseSunAngularRadius;
  }
}