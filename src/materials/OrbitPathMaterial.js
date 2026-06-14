import * as THREE from "three";

export class OrbitPathMaterial extends THREE.ShaderMaterial {
  constructor({ color = 0x79aaff, opacity = 0.34, density = 1.0 } = {}) {
    super({
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
        uDensity: { value: density },
        uSelectedGlow: { value: 0.0 }
      },
      vertexShader: /* glsl */ `
        precision highp float;

        varying vec2 vUv;
        varying float vCrossGlow;

        void main() {
          vUv = uv;

          float cross = abs(uv.y - 0.5) * 2.0;
          vCrossGlow = 1.0 - smoothstep(0.35, 1.0, cross);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uDensity;
        uniform float uSelectedGlow;

        varying vec2 vUv;
        varying float vCrossGlow;

        const float PI = 3.141592653589793;

        float gridLine(float value, float sharpness) {
          return exp(-sharpness * abs(sin(value * PI * 2.0)));
        }

        void main() {
          float along = vUv.x;
          float cross = abs(vUv.y - 0.5) * 2.0;

          float core = 1.0 - smoothstep(0.08, 0.72, cross);
          float softEdge = 1.0 - smoothstep(0.36, 1.0, cross);

          // Ruhiges, weiches Bahn-Band mit hellerem Basissignal.
          float band = core * 0.34 + softEdge * 0.25;
          float selectedGlow = clamp(uSelectedGlow, 0.0, 1.0);
          float outerGlow = softEdge * selectedGlow * 0.42;

          float alpha = band * uOpacity * (1.25 + selectedGlow * 0.55) + outerGlow * uOpacity;

          if (alpha <= 0.003) {
            discard;
          }

          vec3 gravityBlue = uColor;
          vec3 highlight = mix(uColor, vec3(0.88, 0.96, 1.0), 0.45);
          vec3 selectedTint = vec3(0.95, 0.82, 0.48);

          vec3 color = mix(gravityBlue, highlight, core * 0.35 + outerGlow * 0.20);
          color = mix(color, selectedTint, selectedGlow * (0.24 + outerGlow * 0.20));
          color *= 0.78 + core * 0.28 + selectedGlow * 0.18;

          gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.72));
        }
      `
    });
  }

  setTime(time) {
    this.uniforms.uTime.value = time;
  }

  setSelectedGlow(value = 0) {
    const glow = Number(value);
    this.uniforms.uSelectedGlow.value = Number.isFinite(glow)
      ? Math.max(0, Math.min(1, glow))
      : 0;
  }
}

export function createOrbitPathGeometry(
  radius,
  {
    segments = 256,
    tubeSegments = 10,
    radialWidth = 0.18,
    verticalHeight = 0.42
  } = {}
) {
  const safeRadius = Math.max(0.0001, Number(radius) || 1);
  const safeSegments = Math.max(16, Math.floor(segments));
  const safeTubeSegments = Math.max(4, Math.floor(tubeSegments));
  const safeRadialWidth = Math.max(0.001, Number(radialWidth) || 0.12);
  const safeVerticalHeight = Math.max(0.001, Number(verticalHeight) || 0.24);

  const vertexCount = safeSegments * safeTubeSegments;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];

  let vertexOffset = 0;
  let uvOffset = 0;

  for (let i = 0; i < safeSegments; i += 1) {
    const orbitU = i / safeSegments;
    const angle = orbitU * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    const centerX = cosA * safeRadius;
    const centerZ = sinA * safeRadius;

    for (let j = 0; j < safeTubeSegments; j += 1) {
      const tubeU = j / safeTubeSegments;
      const phi = tubeU * Math.PI * 2;
      const radial = Math.cos(phi) * safeRadialWidth;
      const vertical = Math.sin(phi) * safeVerticalHeight;

      positions[vertexOffset] = centerX + cosA * radial;
      positions[vertexOffset + 1] = vertical;
      positions[vertexOffset + 2] = centerZ + sinA * radial;
      vertexOffset += 3;

      uvs[uvOffset] = orbitU;
      uvs[uvOffset + 1] = tubeU;
      uvOffset += 2;
    }
  }

  for (let i = 0; i < safeSegments; i += 1) {
    const nextI = (i + 1) % safeSegments;

    for (let j = 0; j < safeTubeSegments; j += 1) {
      const nextJ = (j + 1) % safeTubeSegments;
      const a = i * safeTubeSegments + j;
      const b = nextI * safeTubeSegments + j;
      const c = nextI * safeTubeSegments + nextJ;
      const d = i * safeTubeSegments + nextJ;

      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  return geometry;
}
