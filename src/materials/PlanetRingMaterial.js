import * as THREE from "three";

export function createPlanetRingDiskGeometry({ segments = 192 } = {}) {
  const safeSegments = Math.max(12, Math.floor(segments));
  const positions = [0, 0, 0];
  const indices = [];

  for (let index = 0; index <= safeSegments; index += 1) {
    const angle = (index / safeSegments) * Math.PI * 2;

    positions.push(
      Math.cos(angle),
      Math.sin(angle),
      0
    );
  }

  for (let index = 1; index <= safeSegments; index += 1) {
    indices.push(0, index, index + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

export class PlanetRingMaterial extends THREE.ShaderMaterial {
  constructor({ ringConfig = {}, planetConfig = {} } = {}) {
    super({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,

      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0.86, 0.78, 0.62) },
        uLightDirection: { value: new THREE.Vector3(0.0, 1.0, 0.0) },
        uRingA: {
          value: new THREE.Vector4(
            1.35, // innerRadius
            2.35, // outerRadius
            1.25, // brightness
            0.85 // opacity
          )
        },
        uRingB: {
          value: new THREE.Vector4(
            0.12, // hue/tint
            1.15, // banding
            0.0,
            0.0
          )
        },
        uPlanetShadowA: {
          value: new THREE.Vector4(
            0.0, // planet center x
            0.0, // planet center y
            0.0, // planet center z
            1.0 // planet radius
          )
        },
        uPlanetShadowB: {
          value: new THREE.Vector2(
            0.55, // shadow strength
            0.32 // penumbra softness
          )
        }
      },

      vertexShader: /* glsl */ `
        varying vec2 vLocalPosition;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vLocalPosition = position.xy;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;

          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform vec3 uColor;
        uniform vec3 uLightDirection;
        uniform vec4 uRingA;
        uniform vec4 uRingB;
        uniform vec4 uPlanetShadowA;
        uniform vec2 uPlanetShadowB;

        varying vec2 vLocalPosition;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        float innerRadius() { return max(0.001, uRingA.x); }
        float outerRadius() { return max(innerRadius() + 0.001, uRingA.y); }
        float brightness() { return max(0.0, uRingA.z); }
        float opacity() { return clamp(uRingA.w, 0.0, 1.0); }
        float hueAmount() { return clamp(uRingB.x, -1.0, 1.0); }
        float bandingAmount() { return max(0.0, uRingB.y); }
        float shadowStrength() { return clamp(uPlanetShadowB.x, 0.0, 1.0); }
        float shadowSoftness() { return clamp(uPlanetShadowB.y, 0.02, 1.0); }

        float planetShadowMask(vec3 worldPos) {
          vec3 planetCenter = uPlanetShadowA.xyz;
          float planetRadius = max(0.0001, uPlanetShadowA.w);
          vec3 toSun = normalize(uLightDirection);
          vec3 shadowAxis = -toSun;
          vec3 fromPlanet = worldPos - planetCenter;

          float alongShadow = dot(fromPlanet, shadowAxis);

          if (alongShadow <= 0.0) {
            return 0.0;
          }

          vec3 closest = planetCenter + shadowAxis * alongShadow;
          float axisDistance = length(worldPos - closest);
          float penumbra = planetRadius * shadowSoftness();
          float core = 1.0 - smoothstep(
            planetRadius - penumbra,
            planetRadius + penumbra,
            axisDistance
          );
          float behindFade = smoothstep(0.0, planetRadius * 0.32, alongShadow);

          return clamp(core * behindFade, 0.0, 1.0);
        }

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
          float r = length(vLocalPosition);
          float inner = innerRadius();
          float outer = outerRadius();
          float t = clamp((r - inner) / max(outer - inner, 0.0001), 0.0, 1.0);

          float innerEdge = smoothstep(inner, inner + (outer - inner) * 0.045, r);
          float outerEdge = 1.0 - smoothstep(outer - (outer - inner) * 0.075, outer, r);
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

          float light = 0.35 + 0.65 * abs(dot(normalize(vWorldNormal), normalize(uLightDirection)));
          float shadow = planetShadowMask(vWorldPosition);
          vec3 color = coolTint * bands * brightness() * light;
          color *= mix(1.0, 1.0 - shadowStrength(), shadow);

          float alpha = opacity() * edgeMask * (0.22 + bands * 0.78);

          if (alpha <= 0.003) {
            discard;
          }

          gl_FragColor = vec4(color, alpha);
        }
      `
    });

    this.setRingConfig(ringConfig, planetConfig);
  }

  setPlanetShadow({ planetCenter = [0, 0, 0], planetRadius = 1, strength = 0.55, softness = 0.32 } = {}) {
    this.uniforms.uPlanetShadowA.value.set(
      planetCenter[0] ?? 0,
      planetCenter[1] ?? 0,
      planetCenter[2] ?? 0,
      Math.max(0.0001, planetRadius)
    );

    this.uniforms.uPlanetShadowB.value.set(
      Math.max(0, Math.min(1, strength)),
      Math.max(0.02, Math.min(1, softness))
    );
  }

  setRingConfig(ringConfig = {}, planetConfig = {}, renderedInnerRadius = null, renderedOuterRadius = null) {
    const baseColor = ringConfig.color ?? planetConfig.visual?.accentColor ?? planetConfig.visual?.baseColor ?? [0.86, 0.78, 0.62];

    this.uniforms.uColor.value.setRGB(
      baseColor[0] ?? 0.86,
      baseColor[1] ?? 0.78,
      baseColor[2] ?? 0.62
    );

    const innerRadius = Number.isFinite(renderedInnerRadius)
      ? renderedInnerRadius
      : ringConfig.innerRadius ?? 1.35;
    const outerRadius = Number.isFinite(renderedOuterRadius)
      ? renderedOuterRadius
      : ringConfig.outerRadius ?? 2.35;

    this.uniforms.uRingA.value.set(
      innerRadius,
      Math.max(innerRadius + 0.0001, outerRadius),
      ringConfig.brightness ?? 1.25,
      ringConfig.opacity ?? 0.85
    );

    this.uniforms.uRingB.value.set(
      ringConfig.hue ?? 0.12,
      ringConfig.banding ?? 1.15,
      0.0,
      0.0
    );
  }
}
