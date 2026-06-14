import * as THREE from "three";

const WHITE_TEXTURE = createWhiteTexture();

export class PlanetSurfaceMaterial extends THREE.ShaderMaterial {
  constructor({ shaderId = "none", planetConfig, surfaceTexture = null, materialMode = "surface" }) {
    super({
      uniforms: {
        uTime: { value: 0 },
        uShaderMode: { value: shaderIdToMode(shaderId) },
        uMaterialMode: { value: materialMode === "cloud-shell" ? 1 : 0 },
        uUseTexture: { value: surfaceTexture ? 1 : 0 },
        uBaseColor: { value: new THREE.Color(0.64, 0.68, 0.72) },
        uAccentColor: { value: new THREE.Color(0.9, 0.92, 1.0) },
        uLightDirection: { value: new THREE.Vector3(0.0, 0.0, 1.0) },
        uSurfaceTexture: { value: surfaceTexture ?? WHITE_TEXTURE },
        uParams: {
          value: new Float32Array([
            7.5,
            0.55,
            2.35,
            6.0,
            1.0,
            1.0,
            0.0,
            1.0,
            1.0,
            1.0,
            1.0,
            0.0
          ])
        },
        uTextureParams: {
          value: new THREE.Vector4(
            0.65, // mix
            1.0, // scale
            1.0, // brightness
            1.0 // contrast
          )
        },
        uTextureSharpness: { value: 0.0 },
        uSphereContrast: { value: 1.0 },
        uSphereHue: { value: 0.0 },
        uSphereSaturation: { value: 1.0 },
        uCloudParams: {
          value: new Float32Array([
            0.0, // enabled
            0.25, // speed
            1.0, // density
            0.55, // opacity
            1.0, // scale
            1.0, // brightness
            1.0, // softness
            0.0, // hue
            0.0, // saturation
            0.0, // patchiness
            0.0, // bigPatches
            1.035, // orbitHeight
            1.0, // orbitPatchinessScale
            0.0 // blurStrength
          ])
        },
        uMoonShadowCount: { value: 0 },
        uMoonShadows: { value: new Float32Array(50) },
        uRingShadowA: {
          value: new THREE.Vector4(
            0.0, // enabled
            1.35, // inner radius in planet radii
            2.35, // outer radius in planet radii
            0.0 // strength
          )
        },
        uRingShadowB: {
          value: new THREE.Vector4(
            0.0, // plane normal x, planet local
            0.0, // plane normal y, planet local
            1.0, // plane normal z, planet local
            0.18 // edge softness
          )
        },
        uRingShadowU: { value: new THREE.Vector3(1.0, 0.0, 0.0) },
        uRingShadowV: { value: new THREE.Vector3(0.0, 1.0, 0.0) },
        uBodyShadowFactor: { value: 0.0 },
        uSkyObjectDim: { value: 1.0 },
        uSkyObjectDayAmount: { value: -1.0 },
        uSkyObjectPhaseAmount: { value: 1.0 }
      },

      vertexShader: /* glsl */ `
        varying vec3 vLocalNormal;
        varying vec3 vLocalPosition;
        varying vec3 vViewNormal;
        varying vec2 vSphereUv;

        const float PI = 3.141592653589793;

        void main() {
          vec3 n = normalize(normal);

          vLocalNormal = n;
          vLocalPosition = position;
          vViewNormal = normalize(normalMatrix * normal);

          float longitude = atan(n.z, n.x);
          float latitude = asin(clamp(n.y, -1.0, 1.0));

          vSphereUv = vec2(
            longitude / (PI * 2.0) + 0.5,
            latitude / PI + 0.5
          );

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,

      fragmentShader: /* glsl */ `
        precision highp float;

        uniform float uTime;
        uniform float uShaderMode;
        uniform float uMaterialMode;
        uniform float uUseTexture;
        uniform vec3 uBaseColor;
        uniform vec3 uAccentColor;
        uniform vec3 uLightDirection;
        uniform sampler2D uSurfaceTexture;
        uniform float uParams[12];
        uniform vec4 uTextureParams;
        uniform float uTextureSharpness;
        uniform float uSphereContrast;
        uniform float uSphereHue;
        uniform float uSphereSaturation;
        uniform float uCloudParams[14];
        uniform int uMoonShadowCount;
        uniform float uMoonShadows[50];
        uniform vec4 uRingShadowA;
        uniform vec4 uRingShadowB;
        uniform vec3 uRingShadowU;
        uniform vec3 uRingShadowV;
        uniform float uBodyShadowFactor;
        uniform float uSkyObjectDim;
        uniform float uSkyObjectDayAmount;
        uniform float uSkyObjectPhaseAmount;

        varying vec3 vLocalNormal;
        varying vec3 vLocalPosition;
        varying vec3 vViewNormal;
        varying vec2 vSphereUv;

        float p(int index) {
          return uParams[index];
        }

        float textureMixAmount() {
          return clamp(uTextureParams.x, 0.0, 1.0);
        }

        float textureScale() {
          return max(0.001, uTextureParams.y);
        }

        float textureBrightness() {
          return max(0.0, uTextureParams.z);
        }

        float textureContrast() {
          return max(0.0, uTextureParams.w);
        }

        float hash21(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float hash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(
            mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          vec3 u = f * f * (3.0 - 2.0 * f);

          float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
          float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
          float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
          float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
          float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
          float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
          float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
          float n111 = hash31(i + vec3(1.0, 1.0, 1.0));

          float nx00 = mix(n000, n100, u.x);
          float nx10 = mix(n010, n110, u.x);
          float nx01 = mix(n001, n101, u.x);
          float nx11 = mix(n011, n111, u.x);

          float nxy0 = mix(nx00, nx10, u.y);
          float nxy1 = mix(nx01, nx11, u.y);

          return mix(nxy0, nxy1, u.z);
        }

        float fbm3(vec3 p) {
          float value = 0.0;
          float amplitude = 0.5;

          for (int i = 0; i < 5; i += 1) {
            value += noise3(p) * amplitude;
            p = p * 2.04 + vec3(17.1, 9.2, 4.7);
            amplitude *= 0.52;
          }

          return value;
        }

        float fbm2(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;

          for (int i = 0; i < 5; i += 1) {
            value += noise2(p) * amplitude;
            p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
            amplitude *= 0.55;
          }

          return value;
        }

        float voronoiEdge(vec2 p) {
          vec2 g = floor(p);
          vec2 f = fract(p);

          float d1 = 1000.0;
          float d2 = 1000.0;

          for (int y = -1; y <= 1; y += 1) {
            for (int x = -1; x <= 1; x += 1) {
              vec2 cell = vec2(float(x), float(y));

              vec2 h = vec2(
                hash21(g + cell + vec2(13.1, 7.7)),
                hash21(g + cell + vec2(41.3, 19.9))
              );

              vec2 r = cell + h - f;
              float d = dot(r, r);

              if (d < d1) {
                d2 = d1;
                d1 = d;
              } else if (d < d2) {
                d2 = d;
              }
            }
          }

          return max(sqrt(d2) - sqrt(d1), 0.0);
        }

        vec3 hueRotate(vec3 col, float hueShift) {
          float angle = hueShift;
          float s = sin(angle);
          float c = cos(angle);

          mat3 m = mat3(
            vec3(0.213 + c * 0.787 - s * 0.213, 0.213 - c * 0.213 + s * 0.143, 0.213 - c * 0.213 - s * 0.787),
            vec3(0.715 - c * 0.715 - s * 0.715, 0.715 + c * 0.285 + s * 0.140, 0.715 - c * 0.715 + s * 0.715),
            vec3(0.072 - c * 0.072 + s * 0.928, 0.072 - c * 0.072 - s * 0.283, 0.072 + c * 0.928 + s * 0.072)
          );

          return clamp(m * col, 0.0, 1.0);
        }

        vec3 applySaturationTint(vec3 col, float saturation, vec3 tint) {
          float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
          col = mix(vec3(luma), col, saturation);
          col *= tint;
          return clamp(col, 0.0, 1.0);
        }

        vec3 applyHueSaturationTint(vec3 col, float hueShift, float saturation, vec3 tint) {
          col = hueRotate(col, hueShift);
          return applySaturationTint(col, saturation, tint);
        }

        vec3 applyLookAdjust(vec3 color, float contrast, float brightness) {
          color = (color - 0.5) * contrast + 0.5;
          color *= brightness;
          return clamp(color, vec3(0.0), vec3(1.0));
        }

        vec3 adjustTextureColor(vec3 color) {
          color = (color - 0.5) * textureContrast() + 0.5;
          color *= textureBrightness();

          return clamp(color, vec3(0.0), vec3(1.0));
        }

        vec3 applySphereContrast(vec3 color) {
          float contrast = clamp(uSphereContrast, 0.2, 3.0);
          return clamp((color - 0.5) * contrast + 0.5, vec3(0.0), vec3(1.0));
        }

        vec3 sampleTextureAt(vec2 uv) {
          vec2 texUv = fract(uv);

          vec3 center = texture2D(uSurfaceTexture, texUv).rgb;

          vec2 pixel = max(fwidth(texUv), vec2(0.0007));

          vec3 neighborAverage =
            texture2D(uSurfaceTexture, fract(texUv + vec2(pixel.x, 0.0))).rgb +
            texture2D(uSurfaceTexture, fract(texUv - vec2(pixel.x, 0.0))).rgb +
            texture2D(uSurfaceTexture, fract(texUv + vec2(0.0, pixel.y))).rgb +
            texture2D(uSurfaceTexture, fract(texUv - vec2(0.0, pixel.y))).rgb;

          neighborAverage *= 0.25;

          float sharpness = clamp(uTextureSharpness, 0.0, 2.0);
          vec3 sharpened = center + (center - neighborAverage) * sharpness * 1.35;

          vec3 textureColor = mix(
            center,
            sharpened,
            smoothstep(0.0, 0.02, sharpness)
          );

          return adjustTextureColor(textureColor);
        }

        vec3 sampleTriplanarTexture(vec3 n) {
          vec3 normal = normalize(n);
          vec3 blend = abs(normal);

          blend = pow(blend, vec3(4.0));
          blend /= max(blend.x + blend.y + blend.z, 0.0001);

          float scale = textureScale();

          vec2 uvX = normal.zy * scale;
          vec2 uvY = normal.xz * scale;
          vec2 uvZ = normal.xy * scale;

          uvX.x *= sign(normal.x);
          uvY.x *= sign(normal.y);
          uvZ.x *= -sign(normal.z);

          vec3 xProjection = sampleTextureAt(uvX);
          vec3 yProjection = sampleTextureAt(uvY);
          vec3 zProjection = sampleTextureAt(uvZ);

          return
            xProjection * blend.x +
            yProjection * blend.y +
            zProjection * blend.z;
        }

        vec3 applySurfaceTexture(vec3 shaderColor, vec3 n) {
          if (uUseTexture < 0.5) {
            return shaderColor;
          }

          vec3 texColor = sampleTriplanarTexture(n);

          return mix(shaderColor, texColor, textureMixAmount());
        }

        vec3 plainSurface() {
          return uBaseColor;
        }

        vec3 rockySurface(vec3 n) {
          float featureScale = p(0);
          float ridgeAmount = p(1);
          float ridgeSharpness = p(2);
          float detailScale = p(3);
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          vec3 tint = vec3(p(8), p(9), p(10));

          vec3 pos = n * featureScale;

          float broad = fbm3(pos * 0.85);

          float ridgeNoise =
            fbm3(pos * 2.1 + vec3(0.0, 3.7, 1.4)) * 2.0 - 1.0;

          float ridges = 1.0 - abs(ridgeNoise);
          ridges = pow(max(ridges, 0.0), ridgeSharpness) * ridgeAmount;

          float detail = fbm3(pos * detailScale + vec3(2.0, 0.0, 5.0));

          vec3 darkRock = mix(uBaseColor * 0.48, vec3(0.33, 0.19, 0.14), 0.45);
          vec3 warmRock = mix(uBaseColor, vec3(0.72, 0.38, 0.22), 0.55);
          vec3 ridgeRock = mix(warmRock, uAccentColor, 0.18);

          vec3 color = mix(darkRock, warmRock, smoothstep(0.20, 0.78, broad));
          color = mix(color, ridgeRock, smoothstep(0.42, 0.92, ridges) * 0.32);
          color *= 0.78 + detail * 0.42;
          color = applyHueSaturationTint(color, hue, saturation, tint);

          return applyLookAdjust(color, colorContrast, brightness);
        }

        vec3 triplanarWeights(vec3 n, float sharpness) {
          vec3 weights = pow(abs(normalize(n)), vec3(sharpness));
          return weights / max(weights.x + weights.y + weights.z, 0.0001);
        }

        float triplanarVoronoiEdge(vec3 n, float scale) {
          vec3 weights = triplanarWeights(n, 4.0);

          vec2 uvX = n.zy * scale;
          vec2 uvY = n.xz * scale;
          vec2 uvZ = n.xy * scale;

          uvX.x *= sign(n.x);
          uvY.x *= sign(n.y);
          uvZ.x *= -sign(n.z);

          float edgeX = voronoiEdge(uvX);
          float edgeY = voronoiEdge(uvY);
          float edgeZ = voronoiEdge(uvZ);

          return edgeX * weights.x + edgeY * weights.y + edgeZ * weights.z;
        }

        float triplanarFbm2(vec3 n, float scale, float offset) {
          vec3 weights = triplanarWeights(n, 4.0);

          vec2 uvX = n.zy * scale + offset;
          vec2 uvY = n.xz * scale + offset * 1.37;
          vec2 uvZ = n.xy * scale + offset * 2.11;

          uvX.x *= sign(n.x);
          uvY.x *= sign(n.y);
          uvZ.x *= -sign(n.z);

          float noiseX = fbm2(uvX);
          float noiseY = fbm2(uvY);
          float noiseZ = fbm2(uvZ);

          return noiseX * weights.x + noiseY * weights.y + noiseZ * weights.z;
        }

        vec3 frozenLakeSurface(vec3 n, vec2 uv) {
          float crackScale = p(0);
          float crackThickness = p(1);
          float crackAlpha = p(2);
          float snowAmount = p(3);
          float snowScale = p(4);
          float iceBrightness = p(5);
          float fresnel = p(6);
          float surfaceNoise = p(7);
          float hue = p(8);

          vec3 surfacePosition = normalize(n);

          float iceNoise =
            fbm3(surfacePosition * (3.5 + crackScale * 1.35)) * 0.62 +
            triplanarFbm2(surfacePosition, 4.0 + crackScale * 0.85, 12.3) * 0.38;

          float edge = triplanarVoronoiEdge(
            surfacePosition,
            max(0.1, crackScale) * 4.2
          );

          float cracks =
            1.0 - smoothstep(crackThickness * 0.35, crackThickness, edge);

          cracks *= crackAlpha;

          float snowNoise =
            fbm3(surfacePosition * (2.0 + snowScale * 1.15) + vec3(4.7, 12.3, 8.1)) * 0.55 +
            triplanarFbm2(surfacePosition, 1.8 + snowScale * 0.95, 31.7) * 0.45;

          float latitudeSnow = smoothstep(0.58, 0.94, abs(surfacePosition.y));

          float snow = smoothstep(
            0.56,
            0.86,
            snowNoise + latitudeSnow * 0.55
          ) * snowAmount;

          vec3 deepIce = mix(
            vec3(0.03, 0.13, 0.22),
            uBaseColor * vec3(0.35, 0.75, 1.2),
            0.45
          );

          vec3 blueIce = mix(vec3(0.12, 0.55, 0.86), uAccentColor, 0.45);
          vec3 crackColor = vec3(0.50, 0.95, 1.0);
          vec3 snowColor = vec3(0.88, 0.96, 1.0);

          vec3 color = mix(deepIce, blueIce, smoothstep(0.22, 0.88, iceNoise));
          color = mix(color, crackColor, clamp(cracks, 0.0, 1.0));
          color = mix(color, snowColor, clamp(snow * 0.68, 0.0, 1.0));

          color *= iceBrightness;
          color += uAccentColor * surfaceNoise * fbm3(surfacePosition * 18.0) * 0.08;
          color += uAccentColor * fresnel * 0.08;
          color = hueRotate(color, hue);

          return clamp(color, vec3(0.0), vec3(1.0));
        }

        vec3 moonSurface(vec3 n) {
          float craterScale = p(0);
          float craterDepth = p(1);
          float fineCraters = p(2);
          float batteredness = p(3);
          float broadRises = p(4);
          float colorContrast = p(5);
          float brightness = p(6);
          float dustAmount = p(7);

          vec3 surfacePosition = normalize(n);

          float broad =
            fbm3(surfacePosition * (1.8 + broadRises * 3.5)) * 0.55 +
            fbm3(surfacePosition * 5.0 + vec3(7.1, 2.3, 5.9)) * 0.25;

          float craterCells = triplanarVoronoiEdge(
            surfacePosition,
            max(0.2, craterScale) * 3.2
          );

          float craterRims = 1.0 - smoothstep(0.018, 0.075, craterCells);
          float craterBasins = 1.0 - smoothstep(0.08, 0.22, craterCells);

          float fine =
            triplanarVoronoiEdge(
              surfacePosition + fbm3(surfacePosition * 9.0) * 0.02,
              max(0.3, craterScale) * (7.0 + fineCraters * 6.0)
            );

          float fineMarks = 1.0 - smoothstep(0.012, 0.045, fine);

          float dust =
            fbm3(surfacePosition * (9.0 + batteredness * 8.0) + vec3(2.7, 9.1, 4.4));

          vec3 shadowDust = mix(uBaseColor * 0.52, vec3(0.34, 0.33, 0.31), 0.45);
          vec3 midDust = mix(uBaseColor, vec3(0.62, 0.60, 0.56), 0.55);
          vec3 paleDust = mix(uAccentColor, vec3(0.86, 0.84, 0.78), 0.45);

          vec3 color = mix(shadowDust, midDust, smoothstep(0.15, 0.82, broad));
          color = mix(color, paleDust, smoothstep(0.55, 0.95, dust) * dustAmount);

          color *= 1.0 - craterBasins * craterDepth * 0.32;
          color += paleDust * craterRims * craterDepth * 0.22;
          color *= 1.0 - fineMarks * fineCraters * 0.10;

          color = applyLookAdjust(color, colorContrast, brightness);

          return color;
        }

        vec3 mountainSurface(vec3 n) {
          vec3 surfacePosition = normalize(n);

          float featureScale = max(0.5, p(0));
          float ridgeAmount = p(1);
          float ridgeSharpness = p(2);
          float detailScale = p(3);
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          vec3 tint = vec3(p(8), p(9), p(10));

          float broad = fbm3(surfacePosition * featureScale * 0.65);
          float ridged = 1.0 - abs(fbm3(surfacePosition * featureScale * 1.7 + vec3(5.1, 2.3, 8.4)) * 2.0 - 1.0);
          ridged = pow(max(ridged, 0.0), max(0.2, ridgeSharpness)) * ridgeAmount;
          float detail = fbm3(surfacePosition * detailScale + vec3(13.0, 4.0, 9.0));

          vec3 valley = mix(uBaseColor * 0.45, vec3(0.14, 0.15, 0.16), 0.55);
          vec3 rock = mix(uBaseColor * 0.82, vec3(0.48, 0.45, 0.40), 0.42);
          vec3 ridgeRock = mix(rock, uAccentColor, 0.20);

          vec3 color = mix(valley, rock, smoothstep(0.18, 0.82, broad + ridged * 0.22));
          color = mix(color, ridgeRock, smoothstep(0.62, 1.08, ridged) * 0.28);
          color *= 0.78 + detail * 0.36;
          color = applyHueSaturationTint(color, hue, saturation, tint);

          return applyLookAdjust(color, colorContrast, brightness);
        }


        vec3 efficientMountainsSurface(vec3 n) {
          vec3 surfacePosition = normalize(n);
          float featureScale = max(0.5, p(0));
          float heightAmount = p(1);
          float spacing = max(1.0, p(2));
          float snowStart = p(3);
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          vec3 tint = vec3(p(8), p(9), p(10));
          float slopeDarkening = clamp(p(11), 0.0, 1.0);

          float cells = triplanarVoronoiEdge(surfacePosition, featureScale * spacing);
          float peaks = 1.0 - smoothstep(0.015, 0.22, cells);
          float broad = fbm3(surfacePosition * featureScale * 0.62 + vec3(2.1, 8.4, 1.5));
          float height = clamp(peaks * 0.72 + broad * 0.38, 0.0, 1.0);
          float detail = fbm3(surfacePosition * featureScale * 4.0 + vec3(10.0, 3.0, 7.0));
          float snow = smoothstep(snowStart, 1.0, height + abs(surfacePosition.y) * 0.12);

          vec3 valley = mix(uBaseColor * 0.52, vec3(0.18, 0.22, 0.18), 0.40);
          vec3 rock = mix(uBaseColor * 0.92, vec3(0.42, 0.40, 0.36), 0.44);
          vec3 snowColor = mix(vec3(0.82, 0.86, 0.86), uAccentColor, 0.35);

          vec3 color = mix(valley, rock, smoothstep(0.18, 0.80, height));
          color = mix(color, snowColor, snow * 0.62);
          color *= 0.78 + detail * 0.38 - peaks * slopeDarkening * 0.16;
          color = applyHueSaturationTint(color, hue, saturation, tint);
          return applyLookAdjust(color, colorContrast, brightness);
        }

        vec3 biomeMountainsSurface(vec3 n) {
          vec3 surfacePosition = normalize(n);
          float featureScale = max(0.5, p(0));
          float heightAmount = p(1);
          float mountainAmount = p(2);
          float detailAmount = p(3);
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          float snowAmount = p(8);
          float grassAmount = p(9);
          float sandAmount = p(10);
          float waterLevel = p(11);

          float broad = fbm3(surfacePosition * featureScale * 0.75);
          float ridged = 1.0 - abs(fbm3(surfacePosition * featureScale * 1.9 + vec3(4.4, 2.0, 6.7)) * 2.0 - 1.0);
          float detail = fbm3(surfacePosition * featureScale * 5.4 + vec3(9.4, 2.1, 4.7));
          float height = clamp(broad * 0.58 + ridged * 0.42 * mountainAmount, 0.0, 1.0);
          float latitude = abs(surfacePosition.y);

          vec3 water = vec3(0.05, 0.20, 0.28);
          vec3 sand = mix(vec3(0.58, 0.43, 0.24), uBaseColor, 0.28);
          vec3 grass = mix(vec3(0.16, 0.38, 0.16), uBaseColor, 0.35);
          vec3 rock = mix(vec3(0.34, 0.33, 0.30), uBaseColor, 0.40);
          vec3 snow = mix(vec3(0.86, 0.88, 0.84), uAccentColor, 0.35);

          vec3 color = mix(sand, grass, smoothstep(0.16, 0.46, height + grassAmount * 0.045));
          color = mix(color, rock, smoothstep(0.48, 0.86, height * mountainAmount));
          color = mix(color, snow, smoothstep(0.66, 0.98, height + latitude * 0.18 + snowAmount * 0.035));
          color = mix(water, color, smoothstep(waterLevel - 0.10, waterLevel + 0.08, height));
          color *= 0.78 + detail * 0.28 * detailAmount;
          color = hueRotate(color, hue);
          color = applySaturationTint(color, saturation, vec3(1.0));
          return applyLookAdjust(color, colorContrast, brightness);
        }

        vec3 triwaveRidgesSurface(vec3 n) {
          vec3 surfacePosition = normalize(n);
          float featureScale = max(0.5, p(0));
          float ridgeAmount = p(1);
          float ridgePower = max(0.25, p(2));
          float spacing = max(0.5, p(3));
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          vec3 tint = vec3(p(8), p(9), p(10));
          float snowAmount = p(11);

          vec3 q = surfacePosition * featureScale * spacing;
          float waves =
            abs(sin(q.x + q.y * 0.45)) * 0.34 +
            abs(sin(q.y * 1.18 + q.z * 0.52)) * 0.33 +
            abs(sin(q.z * 0.92 + q.x * 0.60)) * 0.33;
          float ridges = pow(waves, ridgePower) * ridgeAmount;
          float broad = fbm3(surfacePosition * featureScale * 0.55 + vec3(3.7, 1.2, 8.8));
          float detail = fbm3(surfacePosition * featureScale * 5.0 + vec3(11.0, 4.0, 5.0));

          vec3 valley = mix(uBaseColor * 0.45, vec3(0.15, 0.16, 0.17), 0.35);
          vec3 ridge = mix(uBaseColor * 0.88, uAccentColor, 0.22);
          vec3 snow = mix(vec3(0.78, 0.82, 0.82), uAccentColor, 0.45);
          vec3 color = mix(valley, ridge, smoothstep(0.28, 0.88, ridges + broad * 0.25));
          color = mix(color, snow, smoothstep(0.78, 1.20, ridges + abs(surfacePosition.y) * 0.12) * snowAmount);
          color *= 0.76 + detail * 0.34;
          color = applyHueSaturationTint(color, hue, saturation, tint);
          return applyLookAdjust(color, colorContrast, brightness);
        }

        vec3 mountainRiversSurface(vec3 n) {
          vec3 surfacePosition = normalize(n);
          float featureScale = max(0.5, p(0));
          float heightAmount = p(1);
          float waterAmount = clamp(p(2), 0.0, 1.0);
          float snowLevel = p(3);
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          vec3 tint = vec3(p(8), p(9), p(10));
          float waterLevel = p(11);

          float broad = fbm3(surfacePosition * featureScale * 0.72 + vec3(3.0, 7.0, 1.0));
          float ridged = 1.0 - abs(fbm3(surfacePosition * featureScale * 2.1 + vec3(9.0, 5.0, 4.0)) * 2.0 - 1.0);
          float height = clamp(broad * 0.58 + ridged * 0.46, 0.0, 1.0);
          float rivers = triplanarVoronoiEdge(surfacePosition + fbm3(surfacePosition * 4.0) * 0.025, featureScale * 2.5);
          float riverMask = (1.0 - smoothstep(0.020, 0.070, rivers)) * waterAmount * (1.0 - smoothstep(waterLevel - 0.12, waterLevel + 0.18, height));
          float snowMask = smoothstep(snowLevel, 1.0, height + abs(surfacePosition.y) * 0.14);
          float detail = fbm3(surfacePosition * featureScale * 5.8 + vec3(11.0, 4.0, 5.0));

          vec3 valley = mix(vec3(0.12, 0.25, 0.14), uBaseColor, 0.28);
          vec3 rock = mix(vec3(0.37, 0.35, 0.30), uBaseColor, 0.38);
          vec3 snow = mix(vec3(0.82, 0.86, 0.84), uAccentColor, 0.35);
          vec3 water = vec3(0.06, 0.32, 0.55);
          vec3 color = mix(valley, rock, smoothstep(0.28, 0.82, height));
          color = mix(color, snow, snowMask * 0.62);
          color = mix(color, water, clamp(riverMask, 0.0, 0.88));
          color *= 0.80 + detail * 0.30;
          color = applyHueSaturationTint(color, hue, saturation, tint);
          return applyLookAdjust(color, colorContrast, brightness);
        }

        vec3 softDunesSurface(vec3 n) {
          vec3 surfacePosition = normalize(n);
          float featureScale = max(0.5, p(0));
          float heightAmount = p(1);
          float rippleStrength = p(2);
          float detailScale = p(3);
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          vec3 tint = vec3(p(8), p(9), p(10));
          float softness = p(11);

          float broad = fbm3(surfacePosition * featureScale * 0.45 + vec3(2.0, 6.0, 3.0));
          float ripples = 0.5 + 0.5 * sin((surfacePosition.x * 6.2 + surfacePosition.z * 4.7 + broad * 2.0) * detailScale);
          ripples = smoothstep(0.35, 0.95, ripples) * rippleStrength;
          vec3 darkSand = vec3(0.50, 0.34, 0.18);
          vec3 midSand = vec3(0.78, 0.57, 0.31);
          vec3 lightSand = vec3(0.94, 0.76, 0.46);
          vec3 color = mix(darkSand, midSand, smoothstep(0.10, 0.86, broad));
          color = mix(color, lightSand, ripples * 0.25 * softness);
          color = applyHueSaturationTint(color, hue, saturation, tint);
          return applyLookAdjust(color, colorContrast, brightness);
        }

        vec3 turbulentSeaSurface(vec3 n) {
          vec3 surfacePosition = normalize(n);
          float waveScale = max(0.5, p(0));
          float waveHeight = p(1);
          float waveSpeed = p(2);
          float foamAmount = p(3);
          float colorContrast = p(4);
          float brightness = p(5);
          float hue = p(6);
          float saturation = p(7);
          vec3 tint = vec3(p(8), p(9), p(10));
          float qualityDetail = p(11);

          float time = uTime * waveSpeed;
          vec3 q = surfacePosition * waveScale;
          float waveA = fbm3(q + vec3(time * 0.20, -time * 0.08, time * 0.05));
          float waveB = triplanarFbm2(surfacePosition, waveScale * 2.4, time * 0.36);
          float waveC = fbm3(q * 3.2 + vec3(-time * 0.11, time * 0.17, time * 0.09));
          float waves = waveA * 0.50 + waveB * 0.32 + waveC * 0.18;
          float foam = smoothstep(0.72 - waveHeight * 0.05, 0.98, waves + waveC * 0.18) * foamAmount;
          float glint = pow(max(0.0, dot(normalize(vViewNormal), normalize(uLightDirection))), 18.0) * 0.22;

          vec3 deep = vec3(0.015, 0.07, 0.16);
          vec3 mid = vec3(0.02, 0.22, 0.35);
          vec3 crest = vec3(0.12, 0.55, 0.70);
          vec3 foamColor = vec3(0.82, 0.94, 0.96);
          vec3 color = mix(deep, mid, smoothstep(0.12, 0.82, waves));
          color = mix(color, crest, smoothstep(0.58, 0.92, waves) * 0.35);
          color = mix(color, foamColor, clamp(foam, 0.0, 0.86));
          color += foamColor * glint * qualityDetail;
          color = applyHueSaturationTint(color, hue, saturation, tint);
          return applyLookAdjust(color, colorContrast, brightness);
        }

        vec3 volcanicSurface(vec3 n) {
          float lavaVeins = p(0);
          float lavaGlow = p(1);
          float lavaScale = p(2);
          float lavaSpeed = p(3);
          float emberAmount = p(4);
          float emberScale = p(5);
          float rockBrightness = p(6);
          float redHeat = p(7);
          float hue = p(8);

          vec3 surfacePosition = normalize(n);
          float time = uTime * lavaSpeed;

          float rockNoise =
            fbm3(surfacePosition * 4.2 + vec3(1.0, 3.0, 5.0)) * 0.55 +
            fbm3(surfacePosition * 11.0 + vec3(8.0, 2.0, 1.0)) * 0.25;

          float lavaFlow =
            fbm3(surfacePosition * lavaScale + vec3(time * 0.20, -time * 0.11, time * 0.07));

          float lavaRidges =
            triplanarFbm2(
              surfacePosition,
              max(0.2, lavaScale) * 2.3,
              20.0 + time * 0.18
            );

          float lavaPattern = lavaFlow * 0.62 + lavaRidges * 0.38;
          float lavaMask = smoothstep(lavaVeins, 1.0, lavaPattern);

          float emberNoise =
            fbm3(surfacePosition * emberScale * 4.0 + vec3(time * 0.9, 4.0, 7.0));

          float embers =
            smoothstep(0.82, 0.98, emberNoise) *
            emberAmount *
            (0.4 + lavaMask * 0.8);

          vec3 coldRock = mix(uBaseColor * 0.22, vec3(0.045, 0.038, 0.035), 0.70);
          vec3 warmRock = mix(uBaseColor * 0.45, vec3(0.24, 0.08, 0.045), 0.55);
          vec3 lavaCore = vec3(1.0, 0.82, 0.22);
          vec3 lavaOrange = vec3(1.0, 0.28, 0.045);

          vec3 rock = mix(coldRock, warmRock, smoothstep(0.18, 0.86, rockNoise));
          rock *= rockBrightness;
          rock += vec3(0.55, 0.08, 0.015) * redHeat * lavaPattern * 0.18;

          vec3 lava = mix(lavaOrange, lavaCore, smoothstep(0.72, 1.0, lavaPattern));
          lava *= 0.65 + lavaGlow * 0.38;

          vec3 color = mix(rock, lava, clamp(lavaMask, 0.0, 1.0));
          color += lavaCore * embers * lavaGlow * 0.18;
          color = hueRotate(color, hue);

          return clamp(color, vec3(0.0), vec3(1.0));
        }


        float cloudParam(int index) {
          return uCloudParams[index];
        }

        vec3 orbitCloudHueToRgb(float h) {
          vec3 q = abs(fract(h + vec3(0.0, 0.6666667, 0.3333333)) * 6.0 - 3.0);
          return clamp(q - 1.0, 0.0, 1.0);
        }

        vec3 orbitCloudTint(vec3 col, float hue, float saturation) {
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          float h = fract(hue * 0.15915494 + 1.0);
          vec3 hueCol = orbitCloudHueToRgb(h) * max(luma, 0.001);
          return mix(col, hueCol, clamp(saturation, 0.0, 2.5) * 0.35);
        }

        float orbitCloudPlaneMask(vec2 coord, float time) {
          float enabled = cloudParam(0);
          float speed = cloudParam(1);
          float density = max(0.0, cloudParam(2));
          float opacity = max(0.0, cloudParam(3));
          float cloudScale = max(0.05, cloudParam(4));
          float softness = max(0.20, cloudParam(6));
          float patchinessRaw = max(0.0, cloudParam(9) * cloudParam(12));
          float patchiness = 1.0 - exp(-patchinessRaw * 1.15);
          float bigPatches = clamp(cloudParam(10), 0.0, 1.0);

          if (enabled <= 0.001 || density <= 0.001 || opacity <= 0.001) {
            return 0.0;
          }

          vec2 q = coord * (0.0042 / cloudScale);
          float t = time * speed;

          float noiseA = noise2(q + vec2(t * 0.018, -t * 0.011));
          float noiseB = noise2(q * 2.27 + vec2(-t * 0.013, t * 0.019));
          float noiseC = noise2(q * 5.10 + vec2(t * 0.007, t * 0.004));

          float field = noiseA * 0.58 + noiseB * 0.30 + noiseC * 0.12;

          float broadGap = noise2(q * 0.38 + vec2(4.17, 1.93));
          float fineGap = noise2(q * 1.35 + vec2(8.71, 2.44));

          float fineGapLow = mix(0.74, 0.22, patchiness);
          float fineGapHigh = mix(0.96, 0.62, patchiness);
          float fineGapStrength = mix(0.16, 0.86, patchiness);
          field -= patchiness * smoothstep(fineGapLow, fineGapHigh, fineGap) * fineGapStrength;
          field -= bigPatches * smoothstep(0.34, 0.74, broadGap) * 0.38;

          float low = mix(0.72, 0.34, clamp(density, 0.0, 2.0) * 0.5);
          float high = low + mix(0.10, 0.34, clamp(softness / 3.0, 0.0, 1.0));

          float mask = smoothstep(low, high, field) * opacity;
          return clamp(mask, 0.0, 1.0);
        }

        float orbitCloudPlaneMaskBlurred(vec2 coord, float time) {
          float blur = clamp(cloudParam(13), 0.0, 2.0);

          if (blur <= 0.001) {
            return orbitCloudPlaneMask(coord, time);
          }

          float radius = mix(0.0, 42.0, blur * 0.5);

          vec2 ox = vec2(radius, 0.0);
          vec2 oy = vec2(0.0, radius);

          float c = 0.0;

          c += orbitCloudPlaneMask(coord, time) * 0.46;
          c += orbitCloudPlaneMask(coord + ox, time) * 0.17;
          c += orbitCloudPlaneMask(coord - ox, time) * 0.17;
          c += orbitCloudPlaneMask(coord + oy, time) * 0.10;
          c += orbitCloudPlaneMask(coord - oy, time) * 0.10;

          return clamp(c, 0.0, 1.0);
        }

        vec4 orbitCloudMaterialColor(vec3 sphereNormal, float time) {
          vec3 sn = normalize(sphereNormal);
          float scale = 1550.0;

          vec2 coordX = sn.zy * scale;
          vec2 coordY = sn.xz * scale;
          vec2 coordZ = sn.xy * scale;

          vec3 blend = pow(abs(sn), vec3(3.5));
          blend /= max(0.0001, blend.x + blend.y + blend.z);

          float cloudX = orbitCloudPlaneMaskBlurred(coordX, time);
          float cloudY = orbitCloudPlaneMaskBlurred(coordY, time);
          float cloudZ = orbitCloudPlaneMaskBlurred(coordZ, time);

          float cloudMask = cloudX * blend.x + cloudY * blend.y + cloudZ * blend.z;

          vec3 lightDir = normalize(uLightDirection);
          float lambert = max(0.0, dot(sn, lightDir));
          float rim = pow(1.0 - max(0.0, dot(normalize(vViewNormal), vec3(0.0, 0.0, 1.0))), 2.0);

          float brightness = max(0.2, cloudParam(5));
          float hue = cloudParam(7);
          float saturation = cloudParam(8);

          vec3 cloudCol = orbitCloudTint(vec3(0.86, 0.90, 0.94), hue, saturation);
          cloudCol *= brightness * (0.35 + lambert * 0.82 + rim * 0.18);

          float alpha = clamp(cloudMask * 1.15, 0.0, 0.82);
          return vec4(cloudCol, alpha);
        }

        float ringShadowFactor(vec3 n, vec3 lightDir) {
          float enabled = uRingShadowA.x;

          if (enabled < 0.5) {
            return 1.0;
          }

          vec3 planeNormal = normalize(uRingShadowB.xyz);
          vec3 rayDir = normalize(lightDir);
          float denom = dot(rayDir, planeNormal);

          if (abs(denom) < 0.015) {
            return 1.0;
          }

          float rayT = -dot(n, planeNormal) / denom;

          if (rayT <= 0.0) {
            return 1.0;
          }

          vec3 hit = n + rayDir * rayT;
          float ringRadius = length(vec2(
            dot(hit, normalize(uRingShadowU)),
            dot(hit, normalize(uRingShadowV))
          ));

          float inner = max(0.001, uRingShadowA.y);
          float outer = max(inner + 0.001, uRingShadowA.z);
          float width = max(0.0001, outer - inner);
          float softness = clamp(uRingShadowB.w, 0.005, 1.0) * width;

          float innerEdge = smoothstep(inner - softness, inner + softness, ringRadius);
          float outerEdge = 1.0 - smoothstep(outer - softness, outer + softness, ringRadius);
          float band = innerEdge * outerEdge;

          // Only the sun-facing hemisphere receives a visible cast shadow.
          float litMask = smoothstep(-0.10, 0.08, dot(n, rayDir));
          float strength = clamp(uRingShadowA.w, 0.0, 0.92);
          float shadow = band * litMask * strength;

          return clamp(1.0 - shadow, 0.08, 1.0);
        }

        float moonShadowFactor(vec3 n, vec3 lightDir) {
          lightDir += vec3(0.0);

          float shadow = 1.0;

          for (int i = 0; i < 10; i += 1) {
            if (i >= uMoonShadowCount) {
              break;
            }

            int baseIndex = i * 5;

            vec3 shadowCenter = normalize(vec3(
              uMoonShadows[baseIndex],
              uMoonShadows[baseIndex + 1],
              uMoonShadows[baseIndex + 2]
            ));

            float radius = max(0.0, uMoonShadows[baseIndex + 3]);
            float strength = clamp(uMoonShadows[baseIndex + 4], 0.0, 1.0);

            if (radius <= 0.0001 || strength <= 0.0001) {
              continue;
            }

            float d = length(n - shadowCenter);

            float core = 1.0 - smoothstep(radius * 0.45, radius * 0.82, d);
            float penumbra = 1.0 - smoothstep(radius * 0.82, radius * 2.35, d);
            float shade = clamp(core * 0.76 + penumbra * 0.30, 0.0, 0.94) * strength;

            shadow *= 1.0 - shade;
          }

          return clamp(shadow, 0.06, 1.0);
        }

        void main() {
          vec3 n = normalize(vLocalNormal);
          vec3 textureDirection = normalize(vLocalPosition);
          vec3 viewNormal = normalize(vViewNormal);

          if (uMaterialMode > 0.5) {
            vec3 lightDir = normalize(uLightDirection);
            vec4 cloud = orbitCloudMaterialColor(n, uTime);
            if (cloud.a <= 0.001) {
              discard;
            }
            float moonShadow = moonShadowFactor(n, lightDir);
            cloud.rgb *= mix(0.56, 1.0, moonShadow);
            cloud.a *= mix(0.74, 1.0, moonShadow);
            cloud.rgb *= clamp(uSkyObjectDim, 0.0, 1.0);
            gl_FragColor = cloud;
            return;
          }

          vec3 lightDir = normalize(uLightDirection);
          float lambert = max(0.0, dot(n, lightDir));
          float rim = pow(
            1.0 - max(0.0, dot(viewNormal, vec3(0.0, 0.0, 1.0))),
            2.2
          );

          vec3 color;

          if (uShaderMode < 0.5) {
            color = plainSurface();
          } else if (uShaderMode < 1.5) {
            color = rockySurface(n);
          } else if (uShaderMode < 2.5) {
            color = frozenLakeSurface(n, vSphereUv);
          } else if (uShaderMode < 3.5) {
            color = moonSurface(n);
          } else if (uShaderMode < 4.5) {
            color = volcanicSurface(n);
          } else if (uShaderMode < 5.5) {
            color = mountainSurface(n);
          } else if (uShaderMode < 6.5) {
            color = efficientMountainsSurface(n);
          } else if (uShaderMode < 7.5) {
            color = biomeMountainsSurface(n);
          } else if (uShaderMode < 8.5) {
            color = triwaveRidgesSurface(n);
          } else if (uShaderMode < 10.5) {
            color = softDunesSurface(n);
          } else if (uShaderMode < 11.5) {
            color = turbulentSeaSurface(n);
          } else {
            color = mountainSurface(n);
          }

          color = applySurfaceTexture(color, textureDirection);
          color = applySphereContrast(color);
          color = hueRotate(color, uSphereHue);
          color = applySaturationTint(color, clamp(uSphereSaturation, 0.0, 2.5), vec3(1.0));

          float moonShadow = moonShadowFactor(n, lightDir);
          float ringShadow = ringShadowFactor(n, lightDir);
          float bodyShadow = mix(1.0, 0.14, clamp(uBodyShadowFactor, 0.0, 1.0));

          if (uSkyObjectDayAmount > -0.5) {
            float dayAmount = clamp(uSkyObjectDayAmount, 0.0, 1.0);
            float phaseAmount = clamp(uSkyObjectPhaseAmount, 0.0, 1.0);
            float litSide = smoothstep(-0.18, 0.78, dot(n, lightDir));
            float ambientFill = mix(0.36, 0.22, dayAmount);
            float directFill = litSide * mix(1.00, 0.52, dayAmount);
            float visibility = clamp(uSkyObjectDim, 0.0, 1.0);
            vec3 hazeTint = mix(vec3(0.70, 0.78, 0.92), vec3(0.78, 0.86, 1.0), dayAmount);

            color *= (ambientFill + directFill) * moonShadow * ringShadow * bodyShadow;
            color += uAccentColor * rim * mix(0.11, 0.045, dayAmount) * bodyShadow;
            color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), dayAmount * 0.14);
            color = mix(color, hazeTint * max(0.12, phaseAmount) * 0.18, dayAmount * 0.12);
            color *= visibility;
          } else {
            color *= 0.18 + lambert * 1.02;
            color *= moonShadow * ringShadow * bodyShadow;
            color += uAccentColor * rim * 0.08 * bodyShadow;
            color *= clamp(uSkyObjectDim, 0.0, 1.0);
          }

          gl_FragColor = vec4(color, 1.0);
        }
      `
    });

    if (materialMode === "cloud-shell") {
      this.transparent = true;
      this.depthTest = true;
      this.depthWrite = false;
      this.side = THREE.DoubleSide;
    }

    this.setPlanetConfig(planetConfig ?? {}, shaderId);
    this.setSurfaceTexture(surfaceTexture);
  }

  setPlanetConfig(planetConfig, shaderId = planetConfig.visual?.terrainShaderId) {
    const visual = planetConfig.visual ?? {};
    const baseColor = visual.baseColor ?? [0.64, 0.68, 0.72];
    const accentColor = visual.accentColor ?? [0.9, 0.92, 1.0];

    this.uniforms.uShaderMode.value = shaderIdToMode(shaderId ?? "none");
    this.uniforms.uBaseColor.value.setRGB(baseColor[0], baseColor[1], baseColor[2]);
    this.uniforms.uAccentColor.value.setRGB(
      accentColor[0],
      accentColor[1],
      accentColor[2]
    );

    const params = visual.terrainParams ?? {};
    const orbitView = planetConfig.orbitView ?? visual.orbitView ?? {};

    const rawSphereFeatureScale = orbitView.featureScale;
    const rawSphereTextureScale = orbitView.textureScale;
    const rawSphereContrast = orbitView.contrast;
    const rawSphereHue = orbitView.hue ?? orbitView.sphereHue;
    const rawSphereSaturation = orbitView.saturation ?? orbitView.sphereSaturation;
    const sphereFeatureScale = rawSphereFeatureScale !== null && rawSphereFeatureScale !== undefined && Number.isFinite(Number(rawSphereFeatureScale))
      ? Number(rawSphereFeatureScale)
      : null;
    const sphereTextureScale = rawSphereTextureScale !== null && rawSphereTextureScale !== undefined && Number.isFinite(Number(rawSphereTextureScale))
      ? Number(rawSphereTextureScale)
      : null;
    const sphereContrast = rawSphereContrast !== null && rawSphereContrast !== undefined && Number.isFinite(Number(rawSphereContrast))
      ? Number(rawSphereContrast)
      : 1.0;
    const sphereHue = rawSphereHue !== null && rawSphereHue !== undefined && Number.isFinite(Number(rawSphereHue))
      ? Number(rawSphereHue)
      : 0.0;
    const sphereSaturation = rawSphereSaturation !== null && rawSphereSaturation !== undefined && Number.isFinite(Number(rawSphereSaturation))
      ? Number(rawSphereSaturation)
      : 1.0;

    this.uniforms.uSphereContrast.value = Math.max(0.2, Math.min(3.0, sphereContrast));
    this.uniforms.uSphereHue.value = Math.max(-3.14, Math.min(3.14, sphereHue));
    this.uniforms.uSphereSaturation.value = Math.max(0.0, Math.min(2.5, sphereSaturation));

    const values = this.uniforms.uParams.value;

    if (shaderId === "frozen-lake") {
      values[0] = sphereFeatureScale ?? params.crackScale ?? 0.60;
      values[1] = (params.crackThickness ?? 0.90) * 0.085;
      values[2] = params.crackAlpha ?? 0.80;
      values[3] = params.snowAmount ?? 0.85;
      values[4] = (params.snowScale ?? 0.42) * 8.5;
      values[5] = params.deepBrightness ?? params.iceBrightness ?? 1.0;
      values[6] = params.fresnel ?? 1.0;
      values[7] = params.surfaceNoise ?? 0.55;
      values[8] = params.hue ?? 0.0;
      values[9] = 1.0;
      values[10] = 1.0;
      values[11] = 0.0;
    } else if (shaderId === "moon") {
      values[0] = params.craterScale ?? 4.2;
      values[1] = params.craterDepth ?? 0.9;
      values[2] = params.fineCraters ?? 0.55;
      values[3] = params.batteredness ?? 1.0;
      values[4] = params.broadRises ?? 0.25;
      values[5] = params.colorContrast ?? 1.1;
      values[6] = params.brightness ?? 1.0;
      values[7] = params.dustAmount ?? 0.45;
    } else if (shaderId === "volcanic") {
      values[0] = params.lavaThreshold ?? params.lavaVeins ?? 0.58;
      values[1] = params.lavaGlow ?? 5.0;
      values[2] = sphereFeatureScale ?? params.lavaScale ?? 1.0;
      values[3] = params.lavaSpeed ?? 1.0;
      values[4] = params.emberAmount ?? 1.0;
      values[5] = (params.emberScale ?? 2.0) * 2.5;
      values[6] = params.rockBrightness ?? 0.75;
      values[7] = params.redHeat ?? 0.55;
      values[8] = params.hue ?? params.surfaceHue ?? 0.0;
      values[9] = 1.0;
      values[10] = 1.0;
      values[11] = 0.0;
    } else if (shaderId === "mountain") {
      const featureScale = sphereFeatureScale ?? params.featureScale ?? 180.0;
      values[0] = Math.max(0.5, Math.min(12.0, featureScale / 30.0));
      values[1] = Math.max(0.0, Math.min(2.0, (params.heightScale ?? 70.0) / 80.0));
      values[2] = Math.max(0.5, Math.min(5.0, 1.5 + (params.bumpStrength ?? 0.75) * 2.2));
      values[3] = Math.max(1.0, Math.min(16.0, (params.regionScale ?? 6.0) * 1.3));
      values[4] = params.rockContrast ?? 1.1;
      values[5] = Math.max(0.1, Math.min(2.5, 0.92 + (params.ambient ?? 0.16) * 0.5));
      values[6] = params.surfaceHue ?? params.hue ?? 0.0;
      values[7] = params.surfaceSaturation ?? params.saturation ?? 1.0;
      values[8] = params.tintR ?? 1.0;
      values[9] = params.tintG ?? 1.0;
      values[10] = params.tintB ?? 1.0;
      values[11] = 0.0;
    } else if (shaderId === "efficient-mountains") {
      const terrainScale = params.terrainScale ?? 0.04;
      const heightScale = params.heightScale ?? 8.5;
      values[0] = Math.max(5.0, Math.min(12.0, sphereFeatureScale ?? terrainScale * 72.0));
      values[1] = Math.max(0.0, Math.min(2.0, heightScale / 9.0));
      values[2] = Math.max(1.0, Math.min(4.5, params.spacing ?? 2.4));
      values[3] = params.snowStart ?? 0.56;
      values[4] = params.colorContrast ?? 1.0;
      values[5] = 1.0;
      values[6] = params.hue ?? 0.0;
      values[7] = params.saturation ?? 1.0;
      values[8] = params.tintR ?? 1.0;
      values[9] = params.tintG ?? 1.0;
      values[10] = params.tintB ?? 1.0;
      values[11] = params.slopeDarkening ?? 0.45;
    } else if (shaderId === "biome-mountains") {
      const terrainScale = params.terrainScale ?? 0.1;
      const heightScale = params.heightScale ?? 4.0;
      values[0] = Math.max(0.5, Math.min(12.0, sphereFeatureScale ?? terrainScale * 90.0));
      values[1] = Math.max(0.0, Math.min(2.0, heightScale / 5.0));
      values[2] = Math.max(0.0, Math.min(3.0, params.mountainAmount ?? 1.0));
      values[3] = Math.max(0.0, Math.min(3.0, params.detailAmount ?? 1.0));
      values[4] = params.colorContrast ?? 1.05;
      values[5] = 1.0;
      values[6] = params.hue ?? 0.0;
      values[7] = params.saturation ?? 1.0;
      values[8] = params.snowAmount ?? 4.0;
      values[9] = params.grassAmount ?? 5.0;
      values[10] = params.sandAmount ?? 1.0;
      values[11] = Math.max(0.0, Math.min(1.0, (params.waterLevel ?? 2.0) / 20.0));
    } else if (shaderId === "triwave-ridges") {
      const terrainScale = params.terrainScale ?? 0.05;
      const heightScale = params.heightScale ?? 22.0;
      values[0] = Math.max(0.25, Math.min(0.60, sphereFeatureScale ?? terrainScale * 90.0));
      values[1] = Math.max(0.0, Math.min(2.0, heightScale / 40.0));
      values[2] = params.ridgePower ?? 1.0;
      values[3] = params.spacing ?? 2.2;
      values[4] = params.colorContrast ?? 1.1;
      values[5] = 1.0;
      values[6] = params.hue ?? 0.0;
      values[7] = params.saturation ?? 1.0;
      values[8] = params.tintR ?? 1.0;
      values[9] = params.tintG ?? 1.0;
      values[10] = params.tintB ?? 1.0;
      values[11] = params.snowAmount ?? 0.45;
    } else if (shaderId === "soft-dunes") {
      const terrainScale = params.terrainScale ?? 0.06;
      const heightScale = params.heightScale ?? 20.0;
      values[0] = Math.max(0.25, Math.min(25.0, sphereFeatureScale ?? terrainScale * 70.0));
      values[1] = Math.max(0.0, Math.min(2.0, heightScale / 30.0));
      values[2] = params.rippleStrength ?? 0.8;
      values[3] = Math.max(1.0, Math.min(16.0, values[0] * 2.4));
      values[4] = params.colorContrast ?? 1.0;
      values[5] = 1.0;
      values[6] = params.hue ?? 0.0;
      values[7] = params.saturation ?? 1.0;
      values[8] = params.tintR ?? 1.0;
      values[9] = params.tintG ?? 1.0;
      values[10] = params.tintB ?? 1.0;
      values[11] = 1.0;
    } else if (shaderId === "turbulent-sea") {
      const waveHeight = params.waveHeight ?? 1.2;
      values[0] = Math.max(1.0, Math.min(12.0, sphereFeatureScale ?? 4.5));
      values[1] = Math.max(0.05, Math.min(20.0, waveHeight));
      values[2] = params.waveSpeed ?? 1.0;
      values[3] = params.foamAmount ?? 0.85;
      values[4] = params.colorContrast ?? 1.0;
      values[5] = params.brightness ?? 1.0;
      values[6] = params.hue ?? 0.0;
      values[7] = params.saturation ?? 1.0;
      values[8] = params.tintR ?? 1.0;
      values[9] = params.tintG ?? 1.0;
      values[10] = params.tintB ?? 1.0;
      values[11] = Math.max(0.5, Math.min(1.5, (params.quality ?? 5.0) / 5.0));
    } else if (shaderId === "rocky") {
      const featureScale = sphereFeatureScale ?? params.featureScale ?? 1.0;
      values[0] = Math.max(0.2, Math.min(15.0, featureScale));
      values[1] = Math.max(0.0, Math.min(2.2, params.heightScale ?? 1.0));
      values[2] = params.ridgeSharpness ?? 2.6;
      values[3] = Math.max(1.0, Math.min(16.0, (params.warp ?? 0.85) * 1.15 + 1.25));
      values[4] = params.colorContrast ?? 1.0;
      values[5] = params.brightness ?? 1.0;
      values[6] = params.hue ?? 0.0;
      values[7] = params.saturation ?? 1.0;
      values[8] = params.tintR ?? 1.0;
      values[9] = params.tintG ?? 1.0;
      values[10] = params.tintB ?? 1.0;
      values[11] = 0.0;
    } else {
      const featureScale = sphereFeatureScale ?? params.featureScale ?? 180.0;
      values[0] = Math.max(0.5, Math.min(12.0, featureScale / 24.0));
      values[1] = Math.max(0.0, Math.min(2.0, (params.heightScale ?? 70.0) / 80.0));
      values[2] = params.ridgeSharpness ?? 1.45;
      values[3] = Math.max(1.0, Math.min(16.0, (params.warp ?? 0.55) * 8.0 + 2.0));
      values[4] = params.colorContrast ?? 1.0;
      values[5] = params.brightness ?? 1.0;
      values[6] = params.hue ?? params.surfaceHue ?? 0.0;
      values[7] = params.saturation ?? params.surfaceSaturation ?? 1.0;
      values[8] = params.tintR ?? 1.0;
      values[9] = params.tintG ?? 1.0;
      values[10] = params.tintB ?? 1.0;
      values[11] = 0.0;
    }

    const textureParams = visual.surfaceTextureParams ?? {};

    this.uniforms.uTextureParams.value.set(
      textureParams.mix ?? 0.65,
      sphereTextureScale ?? textureParams.scale ?? 1.0,
      textureParams.brightness ?? 1.0,
      textureParams.contrast ?? 1.0
    );

    this.uniforms.uTextureSharpness.value = textureParams.sharpness ?? 0.0;
  }


  setCloudConfig(clouds = {}) {
    this.uniforms.uCloudParams.value.set([
      clouds.enabled ? 1 : 0,
      clouds.speed ?? 0.25,
      clouds.density ?? 1.0,
      Math.max(0.1, Math.min(0.7, Number(clouds.opacity ?? clouds.orbitOpacity ?? 0.55))),
      clouds.scale ?? 1.0,
      clouds.brightness ?? 1.0,
      clouds.softness ?? 1.0,
      clouds.hue ?? 0.0,
      clouds.saturation ?? 0.0,
      clouds.patchiness ?? 0.0,
      clouds.bigPatches ?? 0.0,
      Math.max(1.0, Math.min(1.125, Number(clouds.orbitHeight ?? 1.035))),
      clouds.orbitPatchinessScale ?? 1.0,
      clouds.blurStrength ?? 0.0
    ]);
  }

  setRingShadowConfig({
    enabled = false,
    innerRadius = 1.35,
    outerRadius = 2.35,
    strength = 0.0,
    softness = 0.18,
    normal = [0, 0, 1],
    axisU = [1, 0, 0],
    axisV = [0, 1, 0]
  } = {}) {
    this.uniforms.uRingShadowA.value.set(
      enabled ? 1.0 : 0.0,
      Math.max(0.001, Number(innerRadius) || 1.35),
      Math.max(Math.max(0.001, Number(innerRadius) || 1.35) + 0.001, Number(outerRadius) || 2.35),
      Math.max(0, Math.min(0.92, Number(strength) || 0))
    );

    this.uniforms.uRingShadowB.value.set(
      Number(normal[0] ?? 0),
      Number(normal[1] ?? 0),
      Number(normal[2] ?? 1),
      Math.max(0.005, Math.min(1.0, Number(softness) || 0.18))
    );

    this.uniforms.uRingShadowU.value.set(
      Number(axisU[0] ?? 1),
      Number(axisU[1] ?? 0),
      Number(axisU[2] ?? 0)
    ).normalize();

    this.uniforms.uRingShadowV.value.set(
      Number(axisV[0] ?? 0),
      Number(axisV[1] ?? 1),
      Number(axisV[2] ?? 0)
    ).normalize();
  }

  setMoonShadowConfig(moonShadows = []) {
    const values = this.uniforms.uMoonShadows.value;
    values.fill(0);

    const count = Math.min(10, Array.isArray(moonShadows) ? moonShadows.length : 0);
    this.uniforms.uMoonShadowCount.value = count;

    for (let index = 0; index < count; index += 1) {
      const shadow = moonShadows[index] ?? {};
      const direction = shadow.direction ?? [0, 0, 1];
      const base = index * 5;

      values[base] = direction[0] ?? 0;
      values[base + 1] = direction[1] ?? 0;
      values[base + 2] = direction[2] ?? 1;
      values[base + 3] = Math.max(0, Number(shadow.angularRadius ?? 0));
      values[base + 4] = Math.max(0, Math.min(1, Number(shadow.strength ?? 1)));
    }
  }

  setBodyShadowFactor(value = 0) {
    const shadow = Number(value);
    this.uniforms.uBodyShadowFactor.value = Number.isFinite(shadow)
      ? Math.max(0, Math.min(1, shadow))
      : 0;
  }

  setSurfaceTexture(texture) {
    this.uniforms.uSurfaceTexture.value = texture ?? WHITE_TEXTURE;
    this.uniforms.uUseTexture.value = texture ? 1 : 0;
  }

  setCameraPosition() {
    // Kept for API compatibility with TerrainSurfaceMaterial/SystemView warm updates.
  }
}

function shaderIdToMode(shaderId) {
  const modes = {
    "rocky": 1,
    "frozen-lake": 2,
    "moon": 3,
    "volcanic": 4,
    "mountain": 5,
    "efficient-mountains": 6,
    "biome-mountains": 7,
    "triwave-ridges": 8,
    "soft-dunes": 10,
    "turbulent-sea": 11
  };

  return modes[shaderId] ?? 0;
}

function createWhiteTexture() {
  const data = new Uint8Array([255, 255, 255, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);

  texture.needsUpdate = true;

  return texture;
}