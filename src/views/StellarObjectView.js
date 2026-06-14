import * as THREE from "three";
import { StarNestSpaceMaterial } from "../materials/StarNestSpaceMaterial.js";
import { BlackHoleMaterial } from "../materials/BlackHoleMaterial.js";
import {
  ensureStellarSettings,
  getDefaultStellarObjectId,
  resolveStellarObjectConfig
} from "../core/stellarObjects.js";

const BACKGROUND_RADIUS = 28000;
const ZOOM_SENSITIVITY = 0.00125;
const ZOOM_SMOOTHING_SPEED = 10.0;
const DRAG_SENSITIVITY = 0.0045;
const ROTATION_SMOOTHING_SPEED = 14.0;
const MAX_PITCH = Math.PI * 0.46;

export class StellarObjectView {
  constructor({ canvas, renderer, galaxyConfig, store }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.backgroundScene = new THREE.Scene();
    this.postScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 60000);
    this.camera.position.set(0, 0, 0.01);

    this.backgroundByShaderId = new Map();
    this.backgroundMaterial = this.createBackgroundMaterial("star-nest");
    this.activeSpaceShaderId = "star-nest";

    this.backgroundSphere = new THREE.Mesh(
      new THREE.SphereGeometry(BACKGROUND_RADIUS, 64, 40),
      this.backgroundMaterial
    );
    this.backgroundSphere.frustumCulled = false;
    this.backgroundSphere.scale.setScalar(-1);
    this.backgroundScene.add(this.backgroundSphere);

    this.backgroundTarget = new THREE.WebGLRenderTarget(8, 8, {
      depthBuffer: false,
      stencilBuffer: false,
      format: THREE.RGBAFormat
    });
    this.backgroundTarget.texture.wrapS = THREE.MirroredRepeatWrapping;
    this.backgroundTarget.texture.wrapT = THREE.MirroredRepeatWrapping;

    this.postCamera = new THREE.Camera();
    this.blackHoleMaterial = new BlackHoleMaterial();
    this.blackHoleMaterial.uniforms.tBackground.value = this.backgroundTarget.texture;
    this.noiseRgbTexture = loadStellarObjectTexture("/tex/noise_rgb.png");
    this.noiseRawTexture = loadStellarObjectTexture("/tex/noise_raw.png");
    this.blackHoleMaterial.uniforms.tNoiseRgb.value = this.noiseRgbTexture;
    this.blackHoleMaterial.uniforms.tNoiseRaw.value = this.noiseRawTexture;

    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.blackHoleMaterial
    );
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);

    this.rotationEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this.rotationMatrix4 = new THREE.Matrix4();
    this.rotationMatrix3 = new THREE.Matrix3();

    this.zoom = 1;
    this.targetZoom = 1;
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;
    this.pointer = {
      isDown: false,
      lastX: 0,
      lastY: 0
    };
    this.lastObjectId = null;
    this.departureStartedAt = 0;

    this.backButton = document.createElement("button");
    this.backButton.type = "button";
    this.backButton.className = "stellar-object-back-button";
    this.backButton.textContent = "Back to Star Map";
    this.backButton.setAttribute("aria-label", "Back to Star Map");
    this.backButton.addEventListener("click", () => this.handleBackButtonClick());
    (this.canvas.parentElement ?? document.body).appendChild(this.backButton);

    this.handleWheel = this.handleWheel.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);

    this.bindInput();
    ensureStellarSettings(this.galaxyConfig);
  }

  bindInput() {
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
  }

  onActivate() {
    this.applyBackgroundConfig();
    this.applyActiveObjectDefaults();
    this.departureStartedAt = 0;
    this.updateBackButtonVisibility();
  }

  onDeactivate() {
    this.pointer.isDown = false;
    this.backButton.classList.remove("is-visible", "is-leaving");
  }

  resize(width, height) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    this.camera.aspect = safeWidth / safeHeight;
    this.camera.updateProjectionMatrix();
    this.backgroundTarget.setSize(safeWidth, safeHeight);

    for (const material of this.backgroundByShaderId.values()) {
      material.uniforms.uResolution.value.set(safeWidth, safeHeight);
    }

    this.blackHoleMaterial.uniforms.uResolution.value.set(safeWidth, safeHeight);
  }

  update({ elapsedTime, deltaTime = 0 }) {
    const state = this.store.getState();
    const objectId = state.stellarObjectView.activeObjectId ?? getDefaultStellarObjectId();
    const config = this.getObjectConfig(objectId);

    this.updateBackButtonVisibility();

    if (state.transition.type === "stellar-object-to-star-map" && !state.transition.revealed) {
      this.targetZoom = Math.max(this.targetZoom, config.maxZoom ?? 1.6);
    }

    if (objectId !== this.lastObjectId) {
      this.applyActiveObjectDefaults();
    }

    const smoothingDelta = Math.max(0, Math.min(deltaTime, 0.05));
    const zoomAlpha = 1 - Math.exp(-ZOOM_SMOOTHING_SPEED * smoothingDelta);
    this.zoom += (this.targetZoom - this.zoom) * zoomAlpha;
    const rotationAlpha = 1 - Math.exp(-ROTATION_SMOOTHING_SPEED * smoothingDelta);
    this.yaw += (this.targetYaw - this.yaw) * rotationAlpha;
    this.pitch += (this.targetPitch - this.pitch) * rotationAlpha;

    this.applyBackgroundConfig();

    const drift = config.backgroundDrift ?? 0.01;
    this.rotationEuler.y = elapsedTime * drift;
    this.rotationEuler.x = Math.sin(elapsedTime * 0.07) * drift * 0.6;
    this.rotationEuler.z = Math.sin(elapsedTime * 0.05) * drift * 0.35;
    this.rotationMatrix4.makeRotationFromEuler(this.rotationEuler);
    this.rotationMatrix3.setFromMatrix4(this.rotationMatrix4);

    this.backgroundMaterial.uniforms.uTime.value = elapsedTime;
    this.backgroundMaterial.uniforms.uRotation.value.copy(this.rotationMatrix3);

    this.blackHoleMaterial.uniforms.uTime.value = elapsedTime;
    this.blackHoleMaterial.uniforms.uObjectMode.value = config.mode;
    this.blackHoleMaterial.uniforms.uLensStrength.value = config.lensStrength;
    this.blackHoleMaterial.uniforms.uEventHorizonRadius.value = config.eventHorizonRadius;
    this.blackHoleMaterial.uniforms.uDiskRadius.value = config.diskRadius;
    this.blackHoleMaterial.uniforms.uDiskThickness.value = config.diskThickness;
    this.blackHoleMaterial.uniforms.uDiskTilt.value = config.diskTilt;
    this.blackHoleMaterial.uniforms.uGlowStrength.value = config.glowStrength;
    this.blackHoleMaterial.uniforms.uViewScale.value = this.zoom;
    this.blackHoleMaterial.uniforms.uViewAngles.value.set(this.yaw, this.pitch);
    this.blackHoleMaterial.uniforms.uColorHue.value = config.hue ?? 0;
    this.blackHoleMaterial.uniforms.uColorSaturation.value = config.saturation ?? 1;
    this.blackHoleMaterial.uniforms.uColorRgb.value.set(
      config.red ?? 1,
      config.green ?? 1,
      config.blue ?? 1
    );
    this.blackHoleMaterial.uniforms.uObjectExposure.value = config.exposure ?? 1;
    this.blackHoleMaterial.uniforms.uObjectGamma.value = config.gamma ?? 1;
    this.blackHoleMaterial.uniforms.uParamA.value = config.paramA ?? 0;
    this.blackHoleMaterial.uniforms.uParamB.value = config.paramB ?? 0;
    this.blackHoleMaterial.uniforms.uParamC.value = config.paramC ?? 0;
    this.blackHoleMaterial.uniforms.uParamD.value = config.paramD ?? 0;
    this.blackHoleMaterial.uniforms.uParamE.value = config.paramE ?? 0;
    this.blackHoleMaterial.uniforms.uParamF.value = config.paramF ?? 0;
  }

  render() {
    const previousTarget = this.renderer.getRenderTarget();

    this.renderer.setRenderTarget(this.backgroundTarget);
    this.renderer.clear();
    this.renderer.render(this.backgroundScene, this.camera);

    this.renderer.setRenderTarget(previousTarget);
    this.renderer.render(this.postScene, this.postCamera);
  }

  renderHudOverlay() {}

  handleWheel(event) {
    if (this.store.getState().activeView !== "stellar-object-view") {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();

    const config = this.getActiveObjectConfig();
    const factor = Math.exp(-event.deltaY * ZOOM_SENSITIVITY);
    this.targetZoom = clamp(
      this.targetZoom * factor,
      config.minZoom ?? 0.45,
      config.maxZoom ?? 1.6
    );
  }

  handlePointerDown(event) {
    if (this.store.getState().activeView !== "stellar-object-view") {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    const config = this.getActiveObjectConfig();

    if (!config.supportsRotation) {
      return;
    }

    this.pointer.isDown = true;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    this.canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  handlePointerMove(event) {
    if (!this.pointer.isDown || this.store.getState().activeView !== "stellar-object-view") {
      return;
    }

    const config = this.getActiveObjectConfig();

    if (!config.supportsRotation) {
      return;
    }

    const dx = event.clientX - this.pointer.lastX;
    const dy = event.clientY - this.pointer.lastY;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;

    this.targetYaw += dx * DRAG_SENSITIVITY;
    this.targetPitch = clamp(this.targetPitch + dy * DRAG_SENSITIVITY, -MAX_PITCH, MAX_PITCH);
    event.preventDefault();
  }

  handlePointerUp() {
    this.pointer.isDown = false;
  }

  handleContextMenu(event) {
    if (this.store.getState().activeView === "stellar-object-view") {
      event.preventDefault();
    }
  }


  handleBackButtonClick() {
    const state = this.store.getState();

    if (state.activeView !== "stellar-object-view" || state.transition.type !== "idle") {
      return;
    }

    this.departureStartedAt = performance.now() * 0.001;
    this.backButton.classList.add("is-leaving");
    this.targetZoom = Math.max(this.targetZoom, this.getActiveObjectConfig().maxZoom ?? 1.6);
    this.store.beginStellarObjectStarMapReturn();
  }

  updateBackButtonVisibility() {
    const state = this.store.getState();
    const shouldShow = state.activeView === "stellar-object-view" &&
      (state.stellarObjectView.returnView === "star-map" || state.stellarObjectView.activeSignalId);

    this.backButton.classList.toggle("is-visible", Boolean(shouldShow));

    if (state.transition.type !== "stellar-object-to-star-map") {
      this.backButton.classList.remove("is-leaving");
    }
  }

  destroy() {
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);

    this.backgroundSphere.geometry.dispose();
    for (const material of this.backgroundByShaderId.values()) {
      material.dispose();
    }
    this.backgroundTarget.dispose();
    this.noiseRgbTexture?.dispose?.();
    this.noiseRawTexture?.dispose?.();
    this.quad.geometry.dispose();
    this.blackHoleMaterial.dispose();
    this.backButton.remove();
  }

  applyActiveObjectDefaults() {
    const objectId = this.store.getState().stellarObjectView.activeObjectId ?? getDefaultStellarObjectId();
    const config = this.getObjectConfig(objectId);
    const defaultZoom = clamp(
      config.defaultZoom ?? 1.0,
      config.minZoom ?? 0.45,
      config.maxZoom ?? 1.6
    );

    this.targetZoom = defaultZoom;
    this.zoom = defaultZoom;
    this.targetYaw = config.supportsRotation ? this.targetYaw : 0;
    this.targetPitch = config.supportsRotation ? this.targetPitch : 0;
    this.yaw = this.targetYaw;
    this.pitch = this.targetPitch;
    this.lastObjectId = objectId;
  }

  applyBackgroundConfig() {
    const settings = ensureStellarSettings(this.galaxyConfig);
    const activeSignal = this.getActiveStellarSignal();
    const systemId = this.store.getState().systemView.activeSystemId;
    const system = this.galaxyConfig.systems.find((candidate) => candidate.id === systemId) ?? null;
    const visualSource = activeSignal?.visual ?? system?.visual ?? {};
    const skyConfig = visualSource.sky ?? {};
    const shaderId = settings.spaceShaderId ?? "star-nest";

    this.setBackgroundShader(shaderId);
    this.backgroundMaterial.setSkyConfig(skyConfig);

    const spaceParams = visualSource.spaceShaderParams ?? {};
    this.backgroundMaterial.uniforms.uParams.value.set(createStarNestParamArray(spaceParams));
  }

  setBackgroundShader() {
    const normalizedShaderId = "star-nest";

    if (this.activeSpaceShaderId === normalizedShaderId && this.backgroundMaterial) {
      return;
    }

    const material = this.createBackgroundMaterial(normalizedShaderId);
    this.backgroundSphere.material = material;
    this.backgroundMaterial = material;
    this.activeSpaceShaderId = normalizedShaderId;

    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    material.uniforms.uResolution.value.copy(size);
  }

  createBackgroundMaterial() {
    const normalizedShaderId = "star-nest";
    const existing = this.backgroundByShaderId.get(normalizedShaderId);

    if (existing) {
      return existing;
    }

    const material = new StarNestSpaceMaterial();

    this.backgroundByShaderId.set(normalizedShaderId, material);
    return material;
  }

  getActiveObjectConfig() {
    const objectId = this.store.getState().stellarObjectView.activeObjectId ?? getDefaultStellarObjectId();
    return this.getObjectConfig(objectId);
  }

  getObjectConfig(objectId) {
    const settings = ensureStellarSettings(this.galaxyConfig);
    const activeSignal = this.getActiveStellarSignal(objectId);
    return resolveStellarObjectConfig(
      settings,
      objectId,
      activeSignal?.stellarObject?.objectParams ?? null
    );
  }

  getActiveStellarSignal(objectId = null) {
    const state = this.store.getState();
    const signalId = state.stellarObjectView.activeSignalId;

    if (!signalId) {
      return null;
    }

    const signal = this.galaxyConfig.systems.find((candidate) => candidate.id === signalId) ?? null;

    if (!signal || signal.kind !== "stellar-object") {
      return null;
    }

    if (objectId && signal.stellarObject?.objectId !== objectId) {
      return null;
    }

    return signal;
  }
}


function createStarNestParamArray(params = {}) {
  return [
    params.iterations ?? 13,
    params.volSteps ?? 12,
    params.zoom ?? 1.0,
    params.tile ?? 0.16,
    params.speed ?? 0.0,
    params.brightness ?? 0.0002,
    params.darkMatter ?? 0.84,
    params.distFading ?? 0.76,
    params.saturation ?? 0.98,
    params.stepSize ?? 0.1,
    params.drift ?? 0.03,
    params.starNestAmount ?? 1.0,
    params.gradientAmount ?? 0.0,
    0.0, // horizonGlow is TerrainView-only
    1.0, // horizonDepth is TerrainView-only
    params.starCount ?? params.starIntensity ?? 1.6,
    params.starDensity ?? 110
  ];
}

function loadStellarObjectTexture(path) {
  const texture = new THREE.TextureLoader().load(
    path,
    (loadedTexture) => {
      loadedTexture.wrapS = THREE.RepeatWrapping;
      loadedTexture.wrapT = THREE.RepeatWrapping;
      loadedTexture.needsUpdate = true;
    },
    undefined,
    (error) => {
      console.warn(`Stellar object texture failed to load: ${path}`, error);
    }
  );

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  if ("colorSpace" in texture) {
    texture.colorSpace = THREE.NoColorSpace;
  }

  return texture;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isEditableTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  );
}
