import * as THREE from "three";
import { TerrainLocalRingMaterial } from "../../materials/TerrainLocalRingMaterial.js";

const SCRATCH_SURFACE_UP = new THREE.Vector3();
const SCRATCH_PLANET_AXIS = new THREE.Vector3(0, 1, 0);
const SCRATCH_EAST = new THREE.Vector3();
const SCRATCH_NORTH = new THREE.Vector3();
const SCRATCH_RING_NORMAL = new THREE.Vector3();
const SCRATCH_EULER = new THREE.Euler(0, 0, 0, "YXZ");

export class TerrainLocalRingRenderer {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.material = new TerrainLocalRingMaterial();
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.material
    );

    this.quad.name = "Terrain Local Planet Ring Overlay";
    this.quad.frustumCulled = false;
    this.quad.renderOrder = 4;
    this.quad.visible = false;
    this.scene.add(this.quad);
  }

  setSize(width, height) {
    this.material.setSize(width, height);
  }

  update({ active, planet, landingContext, terrainCamera, elapsedTime }) {
    const ring = planet?.visual?.ring;
    const enabled = Boolean(
      active &&
      landingContext &&
      ring?.enabled &&
      (ring.opacity ?? 0.85) > 0.001
    );

    this.quad.visible = enabled;

    if (!enabled) {
      return;
    }

    const ringNormalLocal = getRingNormalInSurfaceLocal({
      ringConfig: ring,
      surfaceNormalLocal: landingContext.surfaceNormalLocal
    });

    this.material.uniforms.uTime.value = elapsedTime;
    this.material.setCameraBasis(terrainCamera);
    this.material.setRingConfig({
      ringConfig: ring,
      planetConfig: planet,
      ringNormalLocal,
      sunDirectionLocal: landingContext.sunDirectionLocal
    });
  }

  render(renderer) {
    if (!this.quad.visible) {
      return;
    }

    renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.quad.geometry?.dispose?.();
    this.quad.material?.dispose?.();
    this.scene.clear();
  }
}

function getRingNormalInSurfaceLocal({ ringConfig = {}, surfaceNormalLocal = [0, 1, 0] } = {}) {
  SCRATCH_SURFACE_UP.set(
    surfaceNormalLocal[0] ?? 0,
    surfaceNormalLocal[1] ?? 1,
    surfaceNormalLocal[2] ?? 0
  );

  if (SCRATCH_SURFACE_UP.lengthSq() < 0.0001) {
    SCRATCH_SURFACE_UP.set(0, 1, 0);
  }

  SCRATCH_SURFACE_UP.normalize();
  SCRATCH_EAST.crossVectors(SCRATCH_PLANET_AXIS, SCRATCH_SURFACE_UP);

  if (SCRATCH_EAST.lengthSq() < 0.0001) {
    SCRATCH_EAST.set(1, 0, 0).cross(SCRATCH_SURFACE_UP);
  }

  if (SCRATCH_EAST.lengthSq() < 0.0001) {
    SCRATCH_EAST.set(0, 0, 1).cross(SCRATCH_SURFACE_UP);
  }

  SCRATCH_EAST.normalize();
  SCRATCH_NORTH.crossVectors(SCRATCH_SURFACE_UP, SCRATCH_EAST).normalize();

  SCRATCH_RING_NORMAL.set(0, 0, 1);
  SCRATCH_EULER.set(
    -Math.PI * 0.5 + (ringConfig.tilt ?? 0),
    ringConfig.yaw ?? 0,
    ringConfig.roll ?? 0,
    "YXZ"
  );
  SCRATCH_RING_NORMAL.applyEuler(SCRATCH_EULER).normalize();

  return [
    SCRATCH_RING_NORMAL.dot(SCRATCH_EAST),
    SCRATCH_RING_NORMAL.dot(SCRATCH_SURFACE_UP),
    SCRATCH_RING_NORMAL.dot(SCRATCH_NORTH)
  ];
}
