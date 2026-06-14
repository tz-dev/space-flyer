import * as THREE from "three";

const WEATHER_FRAGMENT_SHADER = /* glsl */`
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform float uIntensity;
uniform float uLayerCount;
uniform float uDepth;
uniform float uWidth;
uniform float uSpeed;
uniform float uBrightness;
uniform float uForwardTravel;
uniform float uForwardStrength;
uniform vec2 uViewOffset;
uniform vec2 uFallDirection;

#define MAX_SNOW_LAYERS 96

void main() {
  const mat3 p = mat3(
    13.323122, 23.5112, 21.71123,
    21.1212, 28.7312, 11.9312,
    21.8112, 14.7212, 61.3934
  );

  vec2 fragCoord = gl_FragCoord.xy;
  vec2 centered = (fragCoord - 0.5 * iResolution.xy) / max(iResolution.x, 1.0);
  vec2 uv = centered;

  vec3 acc = vec3(0.0);
  float dof = 5.0 * sin(iTime * 0.1);
  float layers = clamp(uLayerCount, 1.0, float(MAX_SNOW_LAYERS));

  for (int i = 0; i < MAX_SNOW_LAYERS; i += 1) {
    float fi = float(i);

    if (fi >= layers) {
      break;
    }

    float layerDepth = 1.0 + fi * uDepth;

    // fi 0 = near layer, fi high = far layer.
    float layerT = fi / max(1.0, layers - 1.0);
    float nearResponse = pow(1.0 - layerT, 1.75);
    float farResponse = 0.08 + nearResponse * 0.92;

    float cycleFade = 1.0;

    vec2 q = (uv + uViewOffset * farResponse) * layerDepth;

    // World-down projected into screen space.
    q += normalize(uFallDirection + vec2(0.00001))
      * uSpeed
      * iTime
      / (1.0 + fi * uDepth * 0.03);

    // Disabled for now: this couples vertical fall into lateral drift
    // and creates direction-dependent artifacts.
    // q.x += q.y * (uWidth * mod(fi * 7.238917, 1.0) - uWidth * 0.5);

    vec3 n = vec3(floor(q), 31.189 + fi);
    vec3 m = floor(n) * 0.00001 + fract(n);
    vec3 mp = (31415.9 + m) / fract(p * m);
    vec3 r = fract(mp);

    vec2 s = abs(mod(q, 1.0) - 0.5 + 0.9 * r.xy - 0.45);
    s += 0.01 * abs(2.0 * fract(10.0 * q.yx) - 1.0);

    float d = 0.6 * max(s.x - s.y, s.x + s.y) + max(s.x, s.y) - 0.01;
    float edge = 0.005 + 0.05 * min(0.5 * abs(fi - 5.0 - dof), 1.0);
    float flake =
      smoothstep(edge, -edge, d) *
      (r.x / (1.0 + 0.02 * fi * uDepth)) *
      mix(0.45, 1.0, cycleFade);

    acc += vec3(flake);
  }

  vec3 color = acc * uBrightness * uIntensity;
  float alpha = clamp(max(max(color.r, color.g), color.b), 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}
`;

export class TerrainWeatherMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        iResolution: { value: new THREE.Vector2(1, 1) },
        iTime: { value: 0 },
        uIntensity: { value: 0 },
        uLayerCount: { value: 50 },
        uDepth: { value: 0.5 },
        uWidth: { value: 0.3 },
        uSpeed: { value: 0.6 },
        uBrightness: { value: 1.0 },
        uForwardTravel: { value: 0.0 },
        uForwardStrength: { value: 0.35 },
        uViewOffset: { value: new THREE.Vector2(0, 0) },
        uFallDirection: { value: new THREE.Vector2(0, 1) }
      },
      vertexShader: /* glsl */`
        void main() {
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: WEATHER_FRAGMENT_SHADER
    });
  }

  setResolution(width, height, pixelRatio = 1) {
    this.uniforms.iResolution.value.set(
      Math.max(1, width * pixelRatio),
      Math.max(1, height * pixelRatio)
    );
  }

  setTime(timeSeconds) {
    this.uniforms.iTime.value = timeSeconds;
  }

  setWeatherConfig(weatherConfig = {}) {
    const shaderId = weatherConfig.shaderId ?? "none-weather";
    const params = weatherConfig.params ?? {};
    const enabled = shaderId === "snow";

    this.visible = enabled;
    this.uniforms.uIntensity.value = enabled ? (params.intensity ?? 1.0) : 0.0;
    this.uniforms.uLayerCount.value = params.layers ?? 50;
    this.uniforms.uDepth.value = params.depth ?? 0.5;
    this.uniforms.uWidth.value = params.width ?? 0.3;
    this.uniforms.uSpeed.value = params.speed ?? 0.6;
    this.uniforms.uBrightness.value = params.brightness ?? 1.0;
    this.uniforms.uForwardStrength.value = params.forwardFactor ?? 0.35;
  }

  setForwardMotion({ travel = 0, strength = 0 } = {}) {
    this.uniforms.uForwardTravel.value = Math.max(0, travel);
    this.uniforms.uForwardStrength.value = Math.max(0, strength);
  }

  setViewOffset(x = 0, y = 0) {
    this.uniforms.uViewOffset.value.set(x, y);
  }

  setFallDirection(x = 0, y = 1) {
    const length = Math.hypot(x, y);

    if (length <= 0.0001) {
      this.uniforms.uFallDirection.value.set(0, 1);
      return;
    }

    this.uniforms.uFallDirection.value.set(x / length, y / length);
  }
}
