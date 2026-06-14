import * as THREE from "three";

const DEFAULT_SNOW_COUNT = 8000;
const DEFAULT_HALF_WIDTH = 180;
const DEFAULT_HALF_HEIGHT = 110;
const DEFAULT_HALF_DEPTH = 240;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const SNOW_VERTEX_SHADER = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const WEATHER_FRAGMENT_SHADER = /* glsl */`
  precision highp float;

  uniform float uOpacity;
  uniform float uWeatherKind; // 0 = snow, 1 = rain
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - 0.5;
    float alpha = 0.0;

    if (uWeatherKind < 0.5) {
      float d = length(p);
      float core = 1.0 - smoothstep(0.10, 0.50, d);
      float sparkle = 1.0 - smoothstep(0.0, 0.50, abs(p.x) + abs(p.y) * 0.35);
      alpha = clamp(max(core, sparkle * 0.45), 0.0, 1.0);
    } else {
      float x = abs(p.x);
      float y = abs(p.y);

      float line = 1.0 - smoothstep(0.012, 0.070, x);
      float taper = 1.0 - smoothstep(0.28, 0.50, y);
      alpha = line * taper;
    }

    alpha *= uOpacity;

    if (alpha <= 0.004) {
      discard;
    }

    gl_FragColor = vec4(vec3(1.0), alpha);
  }
`;

const SCRATCH_POSITION = new THREE.Vector3();
const SCRATCH_RIGHT = new THREE.Vector3();
const SCRATCH_UP = new THREE.Vector3();
const SCRATCH_FORWARD = new THREE.Vector3();
const SCRATCH_BACK = new THREE.Vector3();
const SCRATCH_SCALE_RIGHT = new THREE.Vector3();
const SCRATCH_SCALE_UP = new THREE.Vector3();
const SCRATCH_SCALE_BACK = new THREE.Vector3();
const SCRATCH_MATRIX = new THREE.Matrix4();
const SCRATCH_CAMERA_MATRIX = new THREE.Matrix4();
const SCRATCH_DELTA = new THREE.Vector3();
const SCRATCH_FALL_DIRECTION = new THREE.Vector3();
const SCRATCH_STREAK_RIGHT = new THREE.Vector3();
const SCRATCH_STREAK_UP = new THREE.Vector3();

function seededRandomFactory(seed = 1337) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function wrapCoordinate(value, center, halfSize) {
  const min = center - halfSize;
  const max = center + halfSize;
  const span = halfSize * 2;
  let next = value;

  while (next < min) {
    next += span;
  }

  while (next > max) {
    next -= span;
  }

  return next;
}

function normalizeWeatherParams(weather = {}) {
  const params = weather.params ?? {};
  const isRain = weather.shaderId === "rain-3d";

  return {
    kind: isRain ? "rain" : "snow",
    count: Math.max(250, Math.min(DEFAULT_SNOW_COUNT, Math.floor(Number(params.count ?? (isRain ? 5500 : DEFAULT_SNOW_COUNT))))),
    fallSpeed: Math.max(0, Math.min(220, Number(params.fallSpeed ?? params.speed ?? (isRain ? 115 : 34)))),
    windX: Math.max(-120, Math.min(120, Number(params.windX ?? 0))),
    windZ: Math.max(-120, Math.min(120, Number(params.windZ ?? 0))),
    // Keep camera-volume and particle-size values fixed. User-editable bounds caused
    // broken soft resets and particle fields that were too close/outside the view.
    boxWidth: DEFAULT_HALF_WIDTH * 2,
    boxHeight: DEFAULT_HALF_HEIGHT * 2,
    boxDepth: DEFAULT_HALF_DEPTH * 2,
    sizeMin: isRain ? 0.045 : 0.18,
    sizeMax: isRain ? 0.085 : 0.72,
    lengthScale: isRain ? 18.0 : 1.0,
    opacity: Math.max(0, Math.min(1, Number(params.opacity ?? (isRain ? 0.36 : 0.72))))
  };
}

export class TerrainWeatherRenderer {
  constructor({ count = DEFAULT_SNOW_COUNT } = {}) {
    this.count = Math.max(250, Math.min(DEFAULT_SNOW_COUNT, count));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 1200);
    this.camera.matrixAutoUpdate = false;

    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uOpacity: { value: 0.72 },
        uWeatherKind: { value: 0.0 }
      },
      vertexShader: SNOW_VERTEX_SHADER,
      fragmentShader: WEATHER_FRAGMENT_SHADER
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, DEFAULT_SNOW_COUNT);
    this.mesh.name = "Terrain 3D Weather Particles";
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.count = this.count;

    this.positions = new Float32Array(DEFAULT_SNOW_COUNT * 3);
    this.speeds = new Float32Array(DEFAULT_SNOW_COUNT);
    this.sizes = new Float32Array(DEFAULT_SNOW_COUNT);
    this.twinkles = new Float32Array(DEFAULT_SNOW_COUNT);

    this.lastCameraPosition = new THREE.Vector3();
    this.hasInitialized = false;
    this.lastActive = false;
    this.activeWeatherKind = null;

    this.scene.add(this.mesh);
  }

  seedParticles(center, params) {
    const random = seededRandomFactory(7331);
    const halfWidth = params.boxWidth * 0.5;
    const halfHeight = params.boxHeight * 0.5;
    const halfDepth = params.boxDepth * 0.5;
    const sizeMin = Math.min(params.sizeMin, params.sizeMax);
    const sizeMax = Math.max(params.sizeMin, params.sizeMax);

    for (let i = 0; i < DEFAULT_SNOW_COUNT; i += 1) {
      const p = i * 3;

      this.positions[p + 0] = center.x + (random() * 2 - 1) * halfWidth;
      this.positions[p + 1] = center.y + (random() * 2 - 1) * halfHeight;
      this.positions[p + 2] = center.z + (random() * 2 - 1) * halfDepth;

      this.speeds[i] = 0.55 + random() * 0.9;
      this.sizes[i] = sizeMin + random() * (sizeMax - sizeMin);
      this.twinkles[i] = random() * Math.PI * 2;
    }

    this.hasInitialized = true;
    this.lastCameraPosition.copy(center);
  }

  setSize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  updateCamera(terrainCamera) {
    SCRATCH_RIGHT.copy(terrainCamera.right).normalize();
    SCRATCH_UP.copy(terrainCamera.up).normalize();
    SCRATCH_FORWARD.copy(terrainCamera.forward).normalize();
    SCRATCH_BACK.copy(SCRATCH_FORWARD).multiplyScalar(-1).normalize();

    SCRATCH_CAMERA_MATRIX.makeBasis(SCRATCH_RIGHT, SCRATCH_UP, SCRATCH_BACK);
    SCRATCH_CAMERA_MATRIX.setPosition(terrainCamera.position);

    this.camera.matrixWorld.copy(SCRATCH_CAMERA_MATRIX);
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    this.camera.position.copy(terrainCamera.position);
  }

  update({ active, weather, terrainCamera, elapsedTime = 0, deltaTime = 0 } = {}) {
    const enabled = Boolean(
      active &&
      (weather?.shaderId === "snow-3d" || weather?.shaderId === "rain-3d") &&
      terrainCamera?.position
    );
    this.mesh.visible = enabled;

    if (!enabled) {
      this.hasInitialized = false;
      this.lastActive = false;
      this.activeWeatherKind = null;
      return;
    }

    const params = normalizeWeatherParams(weather);
    const center = terrainCamera.position;

    this.mesh.count = params.count;
    this.material.uniforms.uOpacity.value = params.opacity;
    this.material.uniforms.uWeatherKind.value = params.kind === "rain" ? 1.0 : 0.0;

    this.updateCamera(terrainCamera);

    const halfWidth = params.boxWidth * 0.5;
    const halfHeight = params.boxHeight * 0.5;
    const halfDepth = params.boxDepth * 0.5;
    const dt = Math.min(0.05, Math.max(0, deltaTime));

    const jumped = this.hasInitialized && SCRATCH_DELTA
      .copy(center)
      .sub(this.lastCameraPosition)
      .lengthSq() > Math.pow(Math.max(params.boxWidth, params.boxDepth), 2);

    const kindChanged = this.activeWeatherKind !== params.kind;

    if (!this.hasInitialized || jumped || kindChanged) {
      this.seedParticles(center, params);
      this.activeWeatherKind = params.kind;
    }

    const windX = params.windX * dt;
    const windZ = params.windZ * dt;

    SCRATCH_RIGHT.copy(terrainCamera.right).normalize();
    SCRATCH_UP.copy(terrainCamera.up).normalize();
    SCRATCH_FORWARD.copy(terrainCamera.forward).normalize();
    SCRATCH_BACK.copy(SCRATCH_FORWARD).multiplyScalar(-1).normalize();

    for (let i = 0; i < params.count; i += 1) {
      const p = i * 3;
      const fall = params.fallSpeed * this.speeds[i] * dt;

      this.positions[p + 0] += windX;
      this.positions[p + 1] -= fall;
      this.positions[p + 2] += windZ;

      this.positions[p + 0] = wrapCoordinate(this.positions[p + 0], center.x, halfWidth);
      this.positions[p + 1] = wrapCoordinate(this.positions[p + 1], center.y, halfHeight);
      this.positions[p + 2] = wrapCoordinate(this.positions[p + 2], center.z, halfDepth);

      const twinkle = params.kind === "rain"
        ? 1.0
        : 0.78 + 0.22 * Math.sin(elapsedTime * 2.2 + this.twinkles[i]);
      const size = this.sizes[i] * twinkle;

      SCRATCH_POSITION.set(
        this.positions[p + 0],
        this.positions[p + 1],
        this.positions[p + 2]
      );

      if (params.kind === "rain") {
        SCRATCH_FALL_DIRECTION.copy(WORLD_UP).multiplyScalar(-1);
        SCRATCH_STREAK_UP
          .copy(SCRATCH_FALL_DIRECTION)
          .addScaledVector(
            SCRATCH_FORWARD,
            -SCRATCH_FALL_DIRECTION.dot(SCRATCH_FORWARD)
          );

        if (SCRATCH_STREAK_UP.lengthSq() < 0.0001) {
          SCRATCH_STREAK_UP.copy(SCRATCH_UP).multiplyScalar(-1);
        }

        SCRATCH_STREAK_UP.normalize();
        SCRATCH_STREAK_RIGHT
          .crossVectors(SCRATCH_STREAK_UP, SCRATCH_FORWARD)
          .normalize();

        SCRATCH_SCALE_RIGHT.copy(SCRATCH_STREAK_RIGHT).multiplyScalar(size);
        SCRATCH_SCALE_UP.copy(SCRATCH_STREAK_UP).multiplyScalar(size * params.lengthScale);
        SCRATCH_SCALE_BACK.copy(SCRATCH_BACK).multiplyScalar(size);
      } else {
        SCRATCH_SCALE_RIGHT.copy(SCRATCH_RIGHT).multiplyScalar(size);
        SCRATCH_SCALE_UP.copy(SCRATCH_UP).multiplyScalar(size);
        SCRATCH_SCALE_BACK.copy(SCRATCH_BACK).multiplyScalar(size);
      }

      SCRATCH_MATRIX.makeBasis(SCRATCH_SCALE_RIGHT, SCRATCH_SCALE_UP, SCRATCH_SCALE_BACK);
      SCRATCH_MATRIX.setPosition(SCRATCH_POSITION);

      this.mesh.setMatrixAt(i, SCRATCH_MATRIX);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.lastCameraPosition.copy(center);
    this.lastActive = true;
  }

  render(renderer) {
    if (!this.mesh.visible) {
      return;
    }

    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
