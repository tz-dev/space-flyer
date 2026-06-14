import * as THREE from "three";
import { TerrainCloudMaterial } from "../../materials/TerrainCloudMaterial.js";

export class TerrainCloudRenderer {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.camera.position.z = 1;
    this.material = new TerrainCloudMaterial();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.name = "Terrain Atmosphere Clouds Fullscreen Quad";
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.visible = false;
  }

  setSize(width, height) {
    this.material.setSize(width, height);
  }

  update({ active, settings, sunDirection, sunColor, terrainCamera, terrainBaseHeight = 0, elapsedTime }) {
    this.visible = Boolean(
      active &&
      settings?.enabled &&
      (settings?.opacity ?? 0.72) > 0.001 &&
      (settings?.density ?? 1.0) > 0.001
    );

    this.quad.visible = this.visible;

    if (!this.visible) {
      return;
    }

    this.material.updateClouds({
      elapsedTime,
      sunDirection,
      sunColor,
      terrainCamera,
      terrainBaseHeight,
      settings
    });
  }

  render(renderer) {
    if (!this.visible || !this.quad.visible) {
      return;
    }

    const previousAutoClear = renderer.autoClear;

    this.material.transparent = true;
    this.material.depthTest = false;
    this.material.depthWrite = false;

    renderer.autoClear = false;
    renderer.render(this.scene, this.camera);
    renderer.autoClear = previousAutoClear;
  }

  destroy() {
    this.quad.geometry?.dispose?.();
    this.quad.material?.dispose?.();
    this.scene.clear();
  }
}
