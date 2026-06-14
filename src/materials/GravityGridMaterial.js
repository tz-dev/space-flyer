import * as THREE from "three";

const MAX_GRAVITY_BODIES = 32;

export class GravityGridMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBodyCount: { value: 0 },
        uBodies: { value: new Float32Array(MAX_GRAVITY_BODIES * 4) },
        uGridHalfSize: { value: 260.0 },
        uGridDensity: { value: 0.030 },
        uGridStrength: { value: 1.0 },
        uGridDrop: { value: 14.0 },
        uOpacity: { value: 0.62 },
        uColor: { value: new THREE.Color(0.38, 0.64, 1.0) }
      },
      vertexShader: /* glsl */ `
        precision highp float;

        const int MAX_GRAVITY_BODIES = 32;

        uniform float uTime;
        uniform int uBodyCount;
        uniform float uBodies[128];
        uniform float uGridHalfSize;
        uniform float uGridStrength;
        uniform float uGridDrop;

        varying vec2 vGridCoord;
        varying float vGravityField;
        varying float vBodyProximity;
        varying float vRadialFade;

        float bodyFalloff(vec2 p, vec2 c, float radius, float mass) {
          vec2 delta = p - c;
          float d2 = dot(delta, delta);
          float safeRadius = max(radius, 0.1);
          float softened = d2 + safeRadius * safeRadius * 2.4;

          return mass * safeRadius * safeRadius / softened;
        }

        void main() {
          vec2 coord = position.xy * uGridHalfSize;
          float field = 0.0;
          float proximity = 0.0;

          for (int i = 0; i < MAX_GRAVITY_BODIES; i += 1) {
            if (i >= uBodyCount) {
              break;
            }

            int baseIndex = i * 4;
            vec2 bodyPosition = vec2(uBodies[baseIndex], uBodies[baseIndex + 1]);
            float bodyRadius = max(0.08, uBodies[baseIndex + 2]);
            float bodyMass = max(0.0, uBodies[baseIndex + 3]);
            float contribution = bodyFalloff(coord, bodyPosition, bodyRadius, bodyMass);

            field += contribution;

            float d = length(coord - bodyPosition);
            proximity += 1.0 - smoothstep(bodyRadius * 2.0, bodyRadius * 9.0, d);
          }

          float radial = length(coord) / max(uGridHalfSize, 0.0001);
          float radialFade = 1.0 - smoothstep(0.88, 1.0, radial);
          float drop = -uGridDrop * uGridStrength * field;

          vec3 displaced = vec3(
            coord.x,
            drop,
            coord.y
          );

          vGridCoord = coord;
          vGravityField = field;
          vBodyProximity = clamp(proximity, 0.0, 1.0);
          vRadialFade = radialFade;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform float uGridDensity;
        uniform float uOpacity;
        uniform vec3 uColor;

        varying vec2 vGridCoord;
        varying float vGravityField;
        varying float vBodyProximity;
        varying float vRadialFade;

        const float PI = 3.141592653589793;

        float gridLine(float value, float sharpness) {
          return exp(-sharpness * abs(sin(value * PI * 2.0)));
        }

        void main() {
          float density = max(0.002, uGridDensity);
          vec2 coord = vGridCoord * density;

          float majorX = gridLine(coord.x, 19.0);
          float majorY = gridLine(coord.y, 19.0);
          float minorX = gridLine(coord.x * 0.25, 9.0);
          float minorY = gridLine(coord.y * 0.25, 9.0);

          float lines = max(max(majorX, majorY), max(minorX, minorY) * 0.45);
          float glow = clamp(vGravityField * 0.62, 0.0, 1.35);
          float bodyGlow = clamp(vBodyProximity * 0.55, 0.0, 1.0);

          float alpha = lines * (0.30 + glow * 0.48 + bodyGlow * 0.22);
          alpha *= vRadialFade * uOpacity;

          if (alpha <= 0.004) {
            discard;
          }

          vec3 col = uColor;
          col = mix(col, vec3(0.75, 0.88, 1.0), clamp(glow * 0.55 + bodyGlow * 0.35, 0.0, 1.0));
          col *= 0.45 + lines * 0.75 + glow * 0.38;

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
        }
      `
    });
  }

  setGridConfig({ halfSize, density, strength, drop, opacity } = {}) {
    if (Number.isFinite(Number(halfSize))) {
      this.uniforms.uGridHalfSize.value = Math.max(20, Number(halfSize));
    }

    if (Number.isFinite(Number(density))) {
      this.uniforms.uGridDensity.value = Math.max(0.002, Number(density));
    }

    if (Number.isFinite(Number(strength))) {
      this.uniforms.uGridStrength.value = Math.max(0, Number(strength));
    }

    if (Number.isFinite(Number(drop))) {
      this.uniforms.uGridDrop.value = Math.max(0, Number(drop));
    }

    if (Number.isFinite(Number(opacity))) {
      this.uniforms.uOpacity.value = Math.max(0, Math.min(1, Number(opacity)));
    }
  }

  setBodies(bodies = []) {
    const values = this.uniforms.uBodies.value;
    values.fill(0);

    const count = Math.min(MAX_GRAVITY_BODIES, Array.isArray(bodies) ? bodies.length : 0);
    this.uniforms.uBodyCount.value = count;

    for (let index = 0; index < count; index += 1) {
      const body = bodies[index] ?? {};
      const base = index * 4;

      values[base] = Number(body.x) || 0;
      values[base + 1] = Number(body.z) || 0;
      values[base + 2] = Math.max(0.08, Number(body.radius) || 1);
      values[base + 3] = Math.max(0, Number(body.mass) || 0);
    }
  }
}
