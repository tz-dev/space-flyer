import * as THREE from "three";
import { clamp } from "../core/math.js";
import { normalizeDisplayConfig } from "../core/configSchema.js";
import { StarNestSpaceMaterial } from "../materials/StarNestSpaceMaterial.js";
import { SunMaterial } from "../materials/SunMaterial.js";
import { SunHaloMaterial } from "../materials/SunHaloMaterial.js";
import { PlanetSurfaceMaterial } from "../materials/PlanetSurfaceMaterial.js";
import { OrbitAuroraRibbonMaterial } from "../materials/OrbitAuroraRibbonMaterial.js";
import { GravityGridMaterial } from "../materials/GravityGridMaterial.js";
import { createMoonGeometry } from "./system/moonGeometry.js";
import { OrbitPathMaterial, createOrbitPathGeometry } from "../materials/OrbitPathMaterial.js";
import {
  PlanetRingMaterial,
  createPlanetRingDiskGeometry
} from "../materials/PlanetRingMaterial.js";

import {
  ENTRY_ZOOM_DURATION,
  ORBIT_VIEW,
  SYSTEM_VIEW_IDLE,
  SYSTEM_VIEW_LIMITS,
  SYSTEM_VIEW_SCALE
} from "./system/systemViewConstants.js";
import {
  getSurfaceTexture,
  preloadSurfaceTexture,
  preloadSurfaceTextures
} from "./system/surfaceTextureCache.js";

export { preloadSurfaceTexture, preloadSurfaceTextures } from "./system/surfaceTextureCache.js";

const HOVER_SECTOR_LONGITUDE_SEGMENTS = 24;
const HOVER_SECTOR_LATITUDE_SEGMENTS = 12;
const HOVER_SECTOR_RADIUS_OFFSET = 1.028;
const HOVER_SECTOR_POLAR_LATITUDE_ROWS = 1;
const MAX_PLANET_MOONS = 10;
const MAX_SYSTEM_PLANETS = 16;

// Higher = longer/softer fade-in and fade-out near transit begin/end.
// Good test range: 3.0–8.0
const MOON_SHADOW_FADE_MOON_RADIUS_FACTOR = 5.0;
const GRAVITY_GRID_MAX_BODIES = 32;
const SYSTEM_SPACE_BACKGROUND_RADIUS = 28000;
const SYSTEM_CAMERA_FAR = 60000;
const ZOOM_SMOOTHING_SPEED = 12.0;
const ORBIT_ZOOM_SMOOTHING_SPEED = 14.0;

export class SystemView {
  constructor({ canvas, renderer, galaxyConfig, store }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, SYSTEM_CAMERA_FAR);
    this.camera.position.set(0, 0, 240);
    this.scene.add(this.camera);

    this.cameraWorldQuaternion = new THREE.Quaternion();
    this.orbitRotation = new THREE.Quaternion();
    this.orbitRotationInitialized = false;
    this.lastOrbitInputAt = performance.now() * 0.001;
    this.lastSystemInputAt = performance.now() * 0.001;
    this.systemIdleYawOffset = 0;
    this.systemIdleAutoOrbit = false;
    this.systemIdleOrbitStartedAt = 0;
    this.systemIdleReturning = false;
    this.systemIdleLastTargetId = null;
    this.systemIdleOrbitTargetDistance = null;
    this.systemIdleOrbitZoomApplied = false;
    this.systemIdleRotationPausedUntil = performance.now() * 0.001;
    this.systemIdleMapRotationStartedAt = null;
    this.smoothedSystemZoom = this.store.getState().systemView.zoom ?? 0.24;
    this.smoothedSystemYaw = this.store.getState().systemView.yaw ?? 0;
    this.smoothedSystemPitch = this.store.getState().systemView.pitch ?? Math.PI * 0.5;
    this.smoothedOrbitDistance = null;
    this.tmpOrbitRight = new THREE.Vector3();
    this.tmpOrbitBack = new THREE.Vector3();
    this.tmpOrbitMatrix = new THREE.Matrix4();

    this.systemById = new Map();

    for (const system of this.galaxyConfig.systems) {
      this.systemById.set(system.id, system);
    }

    this.systemRoot = new THREE.Group();
    this.systemRoot.name = "System Root";
    this.scene.add(this.systemRoot);

    this.gravityGrid = null;
    this.gravityGridMaterial = null;
    this.createGravityGrid();

    this.background = null;
    this.backgroundMaterial = null;
    this.activeSpaceShaderId = null;
    this.backgroundByShaderId = new Map();

    preloadSurfaceTextures(this.renderer).catch((error) => {
      console.warn("Surface texture preload failed:", error);
    });

    this.moonRockTexture = new THREE.TextureLoader().load(
      "/tex/rock02.jpg",
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(1.45, 1.45);
        texture.needsUpdate = true;
      },
      undefined,
      (error) => {
        console.warn("Moon rock texture failed to load: /tex/rock02.jpg", error);
      }
    );

    this.moonRockTexture.wrapS = THREE.RepeatWrapping;
    this.moonRockTexture.wrapT = THREE.RepeatWrapping;
    this.moonRockTexture.repeat.set(1.45, 1.45);

    this.moonRockTexture.colorSpace = THREE.SRGBColorSpace;

    this.spaceRotationEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this.spaceRotationMatrix4 = new THREE.Matrix4();
    this.spaceRotationMatrix3 = new THREE.Matrix3();

    this.pointer = {
      lastX: 0,
      lastY: 0,
      downX: 0,
      downY: 0,
      button: null,
      isDown: false,
      moved: false
    };

    this.raycaster = new THREE.Raycaster();
    this.ndcPointer = new THREE.Vector2();
    this.pickObjects = [];
    this.pickObjectByUuid = new Map();

    this.selectionMarker = null;
    this.selectionMarkerWorldPosition = new THREE.Vector3();

    this.orbitTransition = {
      active: false,
      targetId: null,
      startedAt: 0,
      fromPosition: new THREE.Vector3(),
      fromTarget: new THREE.Vector3(),
      fromQuaternion: new THREE.Quaternion()
    };

    this.orbitReturnTransition = {
      active: false,
      startedAt: 0,
      duration: 1.05,
      fromPosition: new THREE.Vector3(),
      fromTarget: new THREE.Vector3()
    };

    this.tmpVectorA = new THREE.Vector3();
    this.tmpVectorB = new THREE.Vector3();
    this.tmpVectorC = new THREE.Vector3();
    this.tmpQuaternion = new THREE.Quaternion();
    this.tmpLightDirection = new THREE.Vector3();
    this.tmpPlanetWorldPosition = new THREE.Vector3();
    this.tmpPlanetWorldQuaternion = new THREE.Quaternion();
    this.lastOrbitReturnRequestId = 0;
    this.tmpOrbitEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this.tmpOrbitUp = new THREE.Vector3();
    this.tmpSectorLocalPoint = new THREE.Vector3();
    this.tmpSectorWorldPoint = new THREE.Vector3();

    this.hoverSectorMesh = null;
    this.hoverSectorMaterial = null;
    this.lastHoverSectorKey = null;

    this.planetEntries = [];
    this.planetEntryById = new Map();
    this.lastConfigRevision = -1;
    this.lastActiveSystemId = null;
    this.lastStructureSignature = null;
    this.systemSimulationTime = 0;
    this.lastSimulationSystemId = null;

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handleContextMenu = this.handleContextMenu.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleGlobalKeyDown = this.handleGlobalKeyDown.bind(this);
    this.handleExternalSystemInput = this.handleExternalSystemInput.bind(this);

    this.createSelectionMarker();
    this.createHoverSectorOverlay();
    this.createOrUpdateBackground();
    this.rebuildSystemObjects();
    this.bindInput();
  }

  createSelectionMarker() {
    const geometry = new THREE.RingGeometry(1.0, 1.12, 64);

    const material = new THREE.MeshBasicMaterial({
      color: 0xffd37a,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.selectionMarker = new THREE.Mesh(geometry, material);
    this.selectionMarker.name = "System Selection Marker";
    this.selectionMarker.visible = false;
    this.selectionMarker.renderOrder = 20;

    this.scene.add(this.selectionMarker);
  }

  createHoverSectorOverlay() {
    this.hoverSectorMaterial = new THREE.MeshBasicMaterial({
      color: 0x74d7ff,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });

    this.hoverSectorMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.hoverSectorMaterial
    );

    this.hoverSectorMesh.name = "Orbit Hover Grid Sector";
    this.hoverSectorMesh.visible = false;
    this.hoverSectorMesh.renderOrder = 18;

  }

  createGravityGrid() {
    const geometry = new THREE.PlaneGeometry(2, 2, 180, 180);
    const material = new GravityGridMaterial();

    this.gravityGrid = new THREE.Mesh(geometry, material);
    this.gravityGrid.name = "System Gravity Grid";
    this.gravityGrid.frustumCulled = false;
    this.gravityGrid.renderOrder = -20;
    this.gravityGrid.visible = false;

    this.gravityGridMaterial = material;
    this.scene.add(this.gravityGrid);
  }

  createOrUpdateBackground() {
    const activeSystem = this.getActiveSystem();
    const shaderId = activeSystem?.visual?.spaceShaderId ?? "star-nest";

    if (this.background && this.activeSpaceShaderId === shaderId) {
      return;
    }

    for (const background of this.backgroundByShaderId.values()) {
      background.visible = false;
    }

    let background = this.backgroundByShaderId.get(shaderId);

    if (!background) {
      const geometry = new THREE.SphereGeometry(SYSTEM_SPACE_BACKGROUND_RADIUS, 64, 40);
      const material = createSpaceMaterial(shaderId);

      background = new THREE.Mesh(geometry, material);
      background.name = `System View Space Background: ${shaderId}`;
      background.frustumCulled = false;
      background.renderOrder = -10000;
      background.scale.setScalar(-1);

      this.backgroundByShaderId.set(shaderId, background);
      this.scene.add(background);

      this.renderer.getDrawingBufferSize(
        material.uniforms.uResolution.value
      );
    }

    background.visible = true;
    this.background = background;
    this.backgroundMaterial = background.material;
    this.activeSpaceShaderId = shaderId;
  }

  onActivate() {
    const now = performance.now() * 0.001;

    this.lastSystemInputAt = now;
    this.lastOrbitInputAt = now;
    this.systemIdleYawOffset = 0;
    this.systemIdleAutoOrbit = false;
    this.systemIdleReturning = false;
    this.systemIdleMapRotationStartedAt = null;
    this.systemIdleOrbitStartedAt = 0;
    this.systemIdleOrbitTargetDistance = null;
    this.systemIdleOrbitZoomApplied = false;
    this.systemIdleRotationPausedUntil = now;
    this.systemIdleMapRotationStartedAt = null;
  }

  bindInput() {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("contextmenu", this.handleContextMenu);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    window.addEventListener("keydown", this.handleGlobalKeyDown);
    window.addEventListener("space-flyer-system-input", this.handleExternalSystemInput);
  }

  handlePointerDown(event) {
    if (this.store.getState().activeView !== "system-view" || isOptionsMenuOpen()) {
      return;
    }

    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    if (this.store.getState().transition.type !== "idle") {
      return;
    }

    event.preventDefault();
    this.markViewInputActivity();

    this.canvas.setPointerCapture?.(event.pointerId);

    this.pointer.isDown = true;
    this.pointer.moved = false;
    this.pointer.button = event.button;
    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    this.pointer.downX = event.clientX;
    this.pointer.downY = event.clientY;

    this.store.setSystemViewState({
      pointerDown: true
    });
  }

  handlePointerMove(event) {
    if (this.store.getState().activeView !== "system-view" || isOptionsMenuOpen()) {
      return;
    }

    if (!this.pointer.isDown) {
      this.updateOrbitSectorHoverFromPointer(event.clientX, event.clientY);
      return;
    }

    this.markViewInputActivity();

    const deltaX = event.clientX - this.pointer.lastX;
    const deltaY = event.clientY - this.pointer.lastY;

    const dragDistance = Math.hypot(
      event.clientX - this.pointer.downX,
      event.clientY - this.pointer.downY
    );

    if (dragDistance > SYSTEM_VIEW_LIMITS.clickMoveThresholdPx) {
      this.pointer.moved = true;
    }

    const { systemView } = this.store.getState();
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});

    if (systemView.mode === "orbit") {
      this.rotateOrbitCamera(deltaX, deltaY);
    } else {
      this.store.setSystemViewState({
        yaw: systemView.yaw + deltaX * SYSTEM_VIEW_LIMITS.dragSensitivity,
        pitch: systemView.pitch + deltaY * SYSTEM_VIEW_LIMITS.dragSensitivity
      });
    }

    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;

    this.updateOrbitSectorHoverFromPointer(event.clientX, event.clientY);
  }

  handlePointerUp(event) {
    if (!this.pointer.isDown) {
      return;
    }

    const wasLeftClick =
      this.pointer.button === 0 &&
      !this.pointer.moved;

    this.pointer.isDown = false;
    this.pointer.button = null;

    this.store.setSystemViewState({
      pointerDown: false
    });

    if (wasLeftClick) {
      this.selectBodyFromPointer(event.clientX, event.clientY);
    }
  }

  handleContextMenu(event) {
    event.preventDefault();
  }

  handleWheel(event) {
    if (this.store.getState().activeView !== "system-view" || isOptionsMenuOpen()) {
      return;
    }

    event.preventDefault();

    if (this.store.getState().transition.type !== "idle") {
      return;
    }

    this.markViewInputActivity();

    const { systemView } = this.store.getState();
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});

    if (systemView.mode === "orbit") {
      const bodyInfo = this.getBodyInfo(systemView.orbitTargetId);
      const currentDistance = Number.isFinite(systemView.orbitDistance)
        ? systemView.orbitDistance
        : getOrbitDefaultDistance(bodyInfo);

      const orbitScrollSpeed = clamp(Number(displayConfig.orbitScrollSpeed ?? 1), 0.1, 4);
      const zoomFactor = Math.exp(event.deltaY * ORBIT_VIEW.wheelSensitivity * orbitScrollSpeed);
      const nextDistance = clamp(
        currentDistance * zoomFactor,
        getOrbitMinDistance(bodyInfo),
        getOrbitMaxDistance(bodyInfo)
      );

      this.orbitTransition.active = false;

      this.store.setSystemViewState({
        orbitDistance: nextDistance
      });

      return;
    }

    const nextZoom = clamp(
      systemView.zoom * Math.exp(-event.deltaY * SYSTEM_VIEW_LIMITS.wheelSensitivity * clamp(Number(displayConfig.systemMapScrollSpeed ?? 1), 0.1, 4)),
      SYSTEM_VIEW_LIMITS.minZoom,
      SYSTEM_VIEW_LIMITS.maxZoom
    );

    this.store.setSystemViewState({
      zoom: nextZoom
    });
  }

  handleGlobalKeyDown(event) {
    const state = this.store.getState();

    if (state.activeView !== "system-view") {
      return;
    }

    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      event.target?.isContentEditable
    ) {
      return;
    }

    if (event.code === "Escape" || isOptionsMenuOpen()) {
      return;
    }

    this.markViewInputActivity();
  }

  handleExternalSystemInput() {
    this.markViewInputActivity();
  }

  markViewInputActivity() {
    const state = this.store.getState();
    const now = performance.now() * 0.001;

    if (state.activeView !== "system-view") {
      return;
    }

    this.systemIdleAutoOrbit = false;
    this.systemIdleReturning = false;
    this.systemIdleMapRotationStartedAt = null;
    this.systemIdleRotationPausedUntil = now;

    if (state.systemView.mode === "orbit") {
      this.lastOrbitInputAt = now;
      return;
    }

    this.lastSystemInputAt = now;

    if (Math.abs(this.systemIdleYawOffset) > 0.000001) {
      const mergedYaw = state.systemView.yaw + this.systemIdleYawOffset;
      this.systemIdleYawOffset = 0;
      this.store.setSystemViewState({
        yaw: mergedYaw
      });
    }
  }

  rebuildSystemObjects() {
    this.disposeSystemObjects();

    const activeSystem = this.getActiveSystem();

    if (!activeSystem) {
      return;
    }

    this.createSystemStar(activeSystem);
    this.createPlanets(activeSystem);

    this.lastConfigRevision = this.store.getState().configRevision;
    this.lastActiveSystemId = activeSystem.id;
    this.lastStructureSignature = getSystemStructureSignature(activeSystem);
  }

  disposeSystemObjects() {
    for (const child of [...this.systemRoot.children]) {
      child.traverse((object) => {
        object.geometry?.dispose?.();

        if (Array.isArray(object.material)) {
          for (const material of object.material) {
            material.dispose?.();
          }

          return;
        }

        object.material?.dispose?.();
      });

      this.systemRoot.remove(child);
    }

    if (this.starHalo) {
      this.scene.remove(this.starHalo);
      this.starHalo.geometry?.dispose?.();
      this.starHalo.material?.dispose?.();
    }

    this.planetEntries = [];
    this.planetEntryById.clear();
    this.pickObjects = [];
    this.pickObjectByUuid.clear();
    this.star = null;
    this.starHalo = null;
    this.starBaseRadius = null;
    this.starHaloBaseRadius = null;
  }

  createSystemStar(system) {
    const starRadius = Math.max(
      2.5,
      system.star.radius * SYSTEM_VIEW_SCALE.starRadius
    );

    const geometry = new THREE.SphereGeometry(starRadius, 96, 48);
    const material = new SunMaterial({
      shaderId: system.star.shaderId,
      starConfig: system.star
    });

    this.star = new THREE.Mesh(geometry, material);
    this.star.name = `System Star: ${system.star.shaderId}`;
    this.starBaseRadius = starRadius;

    this.systemRoot.add(this.star);
    this.registerPickObject(this.star, {
      id: "star",
      type: "star"
    });

    const haloGeometry = new THREE.PlaneGeometry(
      starRadius * 7.2,
      starRadius * 7.2
    );

    const haloMaterial = new SunHaloMaterial({
      starConfig: system.star
    });

    this.starHalo = new THREE.Mesh(haloGeometry, haloMaterial);
    this.starHalo.name = "System Star Halo";
    this.starHalo.position.set(0, 0, 0);
    this.starHalo.renderOrder = -20;
    this.starHaloBaseRadius = starRadius;

    this.scene.add(this.starHalo);
  }

  createPlanets(system) {
    this.ensureActivePlanetEntries(system);
  }

  ensureActivePlanetEntries(system) {
    const visibleCount = getVisiblePlanetCount(system);

    for (let index = 0; index < visibleCount; index += 1) {
      const planet = system.planets?.[index];

      if (!planet) {
        continue;
      }

      this.ensurePlanetEntry(system, planet, index);
    }
  }

  ensurePlanetEntry(system, planet, index) {
    // Renderer slots are keyed by orbit slot index, not by planet id.
    // This lets an existing SystemView pool be rebound to another system without
    // disposing/recreating all planet materials at system entry.
    const existingEntry = this.planetEntries[index] ?? null;

    if (existingEntry) {
      existingEntry.index = index;
      existingEntry.planet = planet;
      return existingEntry;
    }

    const entry = this.createPlanetEntry(planet, index);

    this.planetEntries[index] = entry;

    return entry;
  }

  createPlanetEntry(planet, index) {
    const orbitGroup = new THREE.Group();
    orbitGroup.name = `${planet.name} Orbit Group`;
    orbitGroup.rotation.x = planet.orbit.inclination;

    const bodyGroup = new THREE.Group();
    bodyGroup.name = `${planet.name} Body Group`;

    const orbitRadius = planet.orbit.radius * SYSTEM_VIEW_SCALE.orbitRadius;
    const planetRadius = Math.max(
      SYSTEM_VIEW_SCALE.minPlanetRadius,
      planet.body.radius * SYSTEM_VIEW_SCALE.planetRadius
    );

    const orbitLine = this.createOrbitLine(orbitRadius, { type: "planet" });
    orbitGroup.add(orbitLine);

    const planetMesh = this.createPlanetMesh(planet, planetRadius);
    this.registerPickObject(planetMesh, {
      id: planet.id,
      type: "planet"
    });

    const cloudMesh = this.createPlanetCloudMesh(planet, planetRadius);
    const auroraGroup = this.createPlanetAuroraGroup(planet, planetRadius);
    const gridMesh = this.createPlanetGridMesh(planet, planetRadius);
    const inclinationIndicatorMesh = this.createPlanetInclinationIndicatorMesh(planet, planetRadius);
    const equatorMarkerMesh = this.createPlanetEquatorMarkerMesh(planet, planetRadius);
    const ringMesh = this.createPlanetRingMesh(planet, planetRadius);
    const moonEntries = this.createPlanetMoons(planet, planetRadius);

    bodyGroup.add(planetMesh);
    bodyGroup.add(cloudMesh);

    if (auroraGroup) {
      bodyGroup.add(auroraGroup);
    }

    if (gridMesh) {
      bodyGroup.add(gridMesh);
    }

    if (inclinationIndicatorMesh) {
      bodyGroup.add(inclinationIndicatorMesh);
    }

    if (equatorMarkerMesh) {
      bodyGroup.add(equatorMarkerMesh);
    }

    if (ringMesh) {
      bodyGroup.add(ringMesh);
    }

    for (const moonEntry of moonEntries) {
      bodyGroup.add(moonEntry.orbitGroup);
    }

    orbitGroup.add(bodyGroup);
    this.systemRoot.add(orbitGroup);

    return {
      index,
      active: true,
      planet,
      orbitGroup,
      bodyGroup,
      orbitLine,
      planetMesh,
      cloudMesh,
      auroraGroup,
      gridMesh,
      inclinationIndicatorMesh,
      equatorMarkerMesh,
      ringMesh,
      moonEntries,
      orbitRadius,
      planetRadius
    };
  }

  createOrbitLine(radius, { type = "planet" } = {}) {
    const safeRadius = Math.max(0.0001, Number(radius) || 1);
    const isMoon = type === "moon";

    // Constant world-space orbit-band thickness.
    // Do not derive this from orbit radius, otherwise far orbits become fat.
    const radialWidth = isMoon ? 0.045 : 0.105;
    const verticalHeight = isMoon ? 0.105 : 0.245;

    const geometry = createOrbitPathGeometry(safeRadius, {
      segments: SYSTEM_VIEW_SCALE.orbitSegments,
      tubeSegments: 10,
      radialWidth,
      verticalHeight
    });

    const material = new OrbitPathMaterial({
      color: isMoon ? 0x6fbfff : 0x5fa3ff,
      opacity: isMoon ? 0.34 : 0.28,
      density: isMoon ? 0.72 : 1.0
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = isMoon ? "Moon Orbit Path" : "Planet Orbit Path";
    mesh.renderOrder = isMoon ? 3 : 2;
    mesh.frustumCulled = false;
    mesh.userData.orbitPathRadius = safeRadius;
    mesh.userData.orbitPathType = type;
    mesh.userData.baseOpacity = isMoon ? 0.34 : 0.28;

    return mesh;
  }

  updateOrbitLineGeometry(orbitLine, radius, { type = "planet" } = {}) {
    if (!orbitLine) {
      return;
    }

    const safeRadius = Math.max(0.0001, Number(radius) || 1);
    const previousRadius = Number(orbitLine.userData.orbitPathRadius ?? 0);

    if (Math.abs(previousRadius - safeRadius) < 0.01) {
      return;
    }

    const isMoon = type === "moon";
    const radialWidth = isMoon ? 0.045 : 0.105;
    const verticalHeight = isMoon ? 0.105 : 0.245;

    const nextGeometry = createOrbitPathGeometry(safeRadius, {
      segments: SYSTEM_VIEW_SCALE.orbitSegments,
      tubeSegments: 10,
      radialWidth,
      verticalHeight
    });

    orbitLine.geometry?.dispose?.();
    orbitLine.geometry = nextGeometry;
    orbitLine.userData.orbitPathRadius = safeRadius;
    orbitLine.userData.orbitPathType = type;
    orbitLine.scale.setScalar(1);
  }

  createPlanetMesh(planet, radius) {
    const geometry = new THREE.SphereGeometry(radius, 64, 32);
    const terrainShaderId = planet.visual.terrainShaderId ?? "none";

    const material = new PlanetSurfaceMaterial({
      shaderId: terrainShaderId,
      planetConfig: planet,
      surfaceTexture: this.getSurfaceTexture(planet.visual.surfaceTextureId)
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = planet.name;
    mesh.rotation.z = planet.body.axialTilt;

    return mesh;
  }

  createPlanetCloudMesh(planet, radius) {
    const geometry = new THREE.SphereGeometry(radius, 64, 32);
    const material = new PlanetSurfaceMaterial({
      shaderId: planet.visual.terrainShaderId ?? "none",
      planetConfig: planet,
      surfaceTexture: null,
      materialMode: "cloud-shell"
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${planet.name} Cloud Shell`;
    mesh.rotation.z = planet.body.axialTilt;
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.visible = Boolean(planet.visual?.atmosphere?.clouds?.enabled);

    return mesh;
  }

  createPlanetAuroraGroup(planet, radius) {
    const group = new THREE.Group();
    group.name = `${planet.name} Orbit Aurora`;
    group.visible = Boolean(planet.visual?.atmosphere?.aurora?.enabled);
    group.renderOrder = 6;

    const ribbonMeshes = [];

    for (const poleSign of [1, -1]) {
      const poleAnchor = new THREE.Group();
      poleAnchor.name = poleSign > 0 ? `${planet.name} North Aurora Pole` : `${planet.name} South Aurora Pole`;
      poleAnchor.position.y = poleSign * radius * 1.02;

      if (poleSign < 0) {
        poleAnchor.rotation.z = Math.PI;
      }

      for (let layerIndex = 0; layerIndex < 2; layerIndex += 1) {
        const ribbon = this.createAuroraRibbonMesh(planet, radius, poleSign, layerIndex, 2);
        poleAnchor.add(ribbon);
        ribbonMeshes.push(ribbon);
      }

      group.add(poleAnchor);
    }

    group.userData.ribbonMeshes = ribbonMeshes;
    return group;
  }

  createAuroraRibbonMesh(planet, radius, poleSign = 1, layerIndex = 0, layerCount = 2) {
    const geometry = new THREE.PlaneGeometry(1, 1, 14, 40);
    geometry.translate(0, 0.5, 0);

    const material = new OrbitAuroraRibbonMaterial({
      auroraConfig: this.getOrbitAuroraConfig(planet),
      baseColor: planet.visual?.baseColor,
      accentColor: planet.visual?.accentColor,
      layerIndex,
      layerCount
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${planet.name} Aurora Ribbon ${poleSign > 0 ? "North" : "South"} ${layerIndex + 1}`;
    mesh.userData.poleSign = poleSign;
    mesh.userData.layerIndex = layerIndex;
    mesh.userData.layerCount = layerCount;
    mesh.userData.baseRadius = radius;
    mesh.rotation.y = layerIndex * Math.PI * 0.5 + (poleSign > 0 ? 0.0 : Math.PI * 0.25);
    mesh.renderOrder = 6 + layerIndex;
    mesh.frustumCulled = false;

    return mesh;
  }

  updatePlanetAuroraGroup(auroraGroup, planet, baseRadius, planetScale, bodyRotationY, elapsedTime) {
    if (!auroraGroup) {
      return;
    }

    const aurora = this.getOrbitAuroraConfig(planet);
    auroraGroup.visible = Boolean(aurora.enabled);
    auroraGroup.rotation.y = bodyRotationY;
    auroraGroup.rotation.z = planet.body.axialTilt;
    auroraGroup.scale.setScalar(planetScale);

    const ribbonMeshes = auroraGroup.userData.ribbonMeshes ?? [];
    const spreadNorm = clamp((aurora.spread - 0.1) / 5.9, 0.0, 1.0);
    const heightNorm = clamp((aurora.height - 100.0) / 900.0, 0.0, 1.0);
    const orbitAuroraHeightFactor = 1.0 / 3.0;
    const baseWidth = baseRadius * (0.22 + spreadNorm * 0.42);
    const baseHeight = baseRadius * (0.80 + heightNorm * 2.10) * orbitAuroraHeightFactor;
    const baseDepth = baseWidth * 0.24;

    for (const ribbon of ribbonMeshes) {
      const layerIndex = ribbon.userData.layerIndex ?? 0;
      const widthScale = layerIndex === 0 ? 1.0 : 0.76;
      const heightScale = layerIndex === 0 ? 1.0 : 0.88;
      const depthScale = layerIndex === 0 ? 1.0 : 0.72;

      ribbon.scale.set(
        baseWidth * widthScale,
        baseHeight * heightScale,
        baseDepth * depthScale
      );
      ribbon.rotation.y = layerIndex * Math.PI * 0.5 + (ribbon.userData.poleSign > 0 ? 0.0 : Math.PI * 0.25);

      if (ribbon.material instanceof OrbitAuroraRibbonMaterial) {
        ribbon.material.uniforms.uTime.value = elapsedTime;
        ribbon.material.setCameraPosition(this.camera.position);
        ribbon.material.setAuroraConfig(aurora, {
          baseColor: planet.visual?.baseColor,
          accentColor: planet.visual?.accentColor,
          layerIndex,
          layerCount: ribbon.userData.layerCount ?? 2
        });
      }
    }
  }

  createPlanetGridMesh(planet, radius) {
    const geometry = new THREE.SphereGeometry(radius * 1.012, 24, 12);

    const material = new THREE.MeshBasicMaterial({
      color: 0xd8ecff,
      transparent: true,
      opacity: 0.22,
      wireframe: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${planet.name} Grid`;
    mesh.rotation.z = planet.body.axialTilt;
    mesh.visible = Boolean(planet.visual.showGrid);

    return mesh;
  }


  createPlanetEquatorMarkerMesh(planet, radius) {
    const markerRadius = radius * 1.02;
    const tubeRadius = Math.max(radius * 0.0065, 0.0009);

    const geometry = new THREE.TorusGeometry(
      markerRadius,
      tubeRadius,
      6,
      192
    );

    const material = new THREE.MeshBasicMaterial({
      color: 0xffd37a,
      transparent: true,
      opacity: 0.88,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${planet.name} Equator Marker`;

    // TorusGeometry liegt standardmäßig in der XY-Ebene.
    // Für den Planet-Equator brauchen wir XZ.
    mesh.rotation.x = Math.PI * 0.5;
    mesh.rotation.z = planet.body.axialTilt;

    mesh.visible = false;
    mesh.renderOrder = 10;

    return mesh;
  }

  async warmupOrbitCloudShells({ renderer, renderTarget } = {}) {
    if (!renderer || !renderTarget) {
      return;
    }

    const previousRenderTarget = renderer.getRenderTarget();
    const previousVisibleByUuid = new Map();

    this.update({
      deltaTime: 0,
      elapsedTime: 0
    });

    for (const entry of this.planetEntries) {
      const { cloudMesh, planet } = entry;

      if (!cloudMesh) {
        continue;
      }

      previousVisibleByUuid.set(cloudMesh.uuid, cloudMesh.visible);
      cloudMesh.visible = true;

      if (cloudMesh.material instanceof PlanetSurfaceMaterial) {
        cloudMesh.material.setPlanetConfig(
          planet,
          planet.visual?.terrainShaderId ?? "none"
        );
        cloudMesh.material.setCloudConfig({
          ...this.getOrbitCloudConfig(planet),
          enabled: true,
          opacity: Math.max(this.getOrbitCloudConfig(planet).opacity ?? 0.55, 0.55),
          density: Math.max(this.getOrbitCloudConfig(planet).density ?? 1.0, 1.0)
        });
        cloudMesh.material.needsUpdate = true;
      }
    }

    if (renderer.compileAsync) {
      await renderer.compileAsync(this.scene, this.camera);
    } else {
      renderer.compile(this.scene, this.camera);
    }

    renderer.setRenderTarget(renderTarget);
    renderer.clear();
    this.render();
    renderer.setRenderTarget(previousRenderTarget);

    for (const entry of this.planetEntries) {
      const { cloudMesh, planet } = entry;

      if (!cloudMesh) {
        continue;
      }

      cloudMesh.visible = previousVisibleByUuid.get(cloudMesh.uuid) ?? false;

      if (cloudMesh.material instanceof PlanetSurfaceMaterial) {
        cloudMesh.material.setCloudConfig(this.getOrbitCloudConfig(planet));
        cloudMesh.material.needsUpdate = false;
      }
    }
  }

  getOrbitAuroraConfig(planet) {
    const auroraLayer = planet.visual?.atmosphere?.aurora ?? {};

    return {
      // Only the on/off state still comes from the planet config.
      // Orbit-view aurora uses fixed visual tuning and ignores TerrainView values.
      enabled: Boolean(auroraLayer.enabled),
      intensity: 1.75,
      speed: 0.5,
      bandScale: 800.0,
      height: 650.0,
      spread: 5.31,
      trail: 0.2,
      glow: 2.75,
      horizonFade: 2.0
    };
  }

  getOrbitCloudConfig(planet) {
    const globalClouds = this.galaxyConfig.terrainView?.atmosphere?.clouds ?? {};
    const orbitClouds = planet.visual?.atmosphere?.clouds ?? {};

    return {
      enabled: Boolean(orbitClouds.enabled),
      speed: globalClouds.speed ?? 0.25,
      density: orbitClouds.density ?? 1.0,
      opacity: clamp(Number(orbitClouds.orbitOpacity ?? orbitClouds.opacity ?? 0.55), 0.1, 0.7),
      scale: orbitClouds.scale ?? 1.0,
      brightness: globalClouds.brightness ?? 1.0,
      softness: globalClouds.softness ?? 1.0,
      blurStrength: globalClouds.blurStrength ?? 0.0,
      hue: globalClouds.hue ?? 0.0,
      saturation: globalClouds.saturation ?? 0.0,
      patchiness: orbitClouds.patchiness ?? 0.0,
      bigPatches: globalClouds.bigPatches ?? 0.0,
      orbitHeight: clamp(Number(orbitClouds.orbitHeight ?? 1.035), 1.0, 1.125),
      orbitPatchinessScale: orbitClouds.orbitPatchinessScale ?? 1.0
    };
  }

  createPlanetMoons(planet, planetRadius, requestedCount = getMoonCount(planet)) {
    const specs = createMoonSpecs(planet, planetRadius, requestedCount);

    return specs.map((spec) => this.createMoonEntry(planet, spec));
  }

  createMoonEntry(planet, spec) {
    const orbitGroup = new THREE.Group();
    orbitGroup.name = `${spec.name} Orbit Group`;

    const orbitLine = this.createOrbitLine(spec.orbitRadius, { type: "moon" });
    const moonMesh = this.createMoonMesh(spec);
    moonMesh.position.set(spec.orbitRadius, 0, 0);

    orbitGroup.add(orbitLine);
    orbitGroup.add(moonMesh);

    this.registerPickObject(moonMesh, {
      id: spec.id,
      type: "moon",
      planetId: planet.id,
      moonIndex: spec.index
    });

    return {
      spec,
      orbitGroup,
      orbitLine,
      moonMesh,
      baseRadius: spec.radius
    };
  }

  ensureMoonEntries(entry, planet, requestedCount) {
    const targetCount = Math.max(0, Math.min(MAX_PLANET_MOONS, Math.round(Number(requestedCount) || 0)));
    const moonEntries = entry.moonEntries ?? [];
    const specs = createMoonSpecs(planet, entry.planetRadius, Math.max(targetCount, moonEntries.length));

    // Existing moon meshes are retained and rebound to the currently active
    // planet config. This avoids material churn when switching systems while
    // still keeping ids/colors/crater params correct for picking and rendering.
    for (let index = 0; index < Math.min(moonEntries.length, specs.length); index += 1) {
      moonEntries[index].spec = specs[index];
    }

    if (moonEntries.length >= targetCount) {
      entry.moonEntries = moonEntries;
      return;
    }

    for (let index = moonEntries.length; index < targetCount; index += 1) {
      const moonEntry = this.createMoonEntry(planet, specs[index]);
      moonEntries.push(moonEntry);
      entry.bodyGroup.add(moonEntry.orbitGroup);
    }

    entry.moonEntries = moonEntries;
  }

  createMoonSurfaceConfig(spec) {
    return {
      visual: {
        terrainShaderId: "moon",
        terrainParams: {
          craterScale: spec.craterScale,
          craterDepth: spec.craterDepth,
          fineCraters: spec.fineCraters,
          batteredness: spec.batteredness,
          broadRises: spec.broadRises,
          colorContrast: spec.colorContrast,
          brightness: spec.brightness,
          dustAmount: spec.dustAmount
        },
        baseColor: spec.baseColor,
        accentColor: spec.accentColor,
        surfaceTextureParams: {
          // Strong default so the moon texture remains visible in orbit view.
          mix: 0.95,
          scale: 2.0,
          brightness: 2.25,
          contrast: 1.00,
          sharpness: 0.75
        }
      },
      orbitView: {}
    };
  }

  createMoonMesh(spec) {
    const geometry = createMoonGeometry(spec.radius, spec.seed ?? spec.id ?? spec.name ?? 1);
    const material = new PlanetSurfaceMaterial({
      shaderId: "moon",
      planetConfig: this.createMoonSurfaceConfig(spec),
      surfaceTexture: this.moonRockTexture
    });

    material.setSurfaceTexture(this.moonRockTexture);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = spec.name;
    mesh.rotation.set(spec.rotation.x, spec.rotation.y, spec.rotation.z);
    mesh.renderOrder = 2;

    return mesh;
  }

  createPlanetInclinationIndicatorMesh(planet, radius) {
    const group = new THREE.Group();
    group.name = `${planet.name} Inclination Indicators`;
    group.visible = Boolean(planet.visual.showInclinationIndicators);
    group.renderOrder = 8;

    const length = radius * 3.15;
    const headLength = radius * 0.42;
    const headWidth = radius * 0.22;

    const referenceDirection = new THREE.Vector3(0, 1, 0);
    const axisDirection = new THREE.Vector3(0, 1, 0)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), planet.body?.axialTilt ?? 0)
      .normalize();

    const referenceArrow = new THREE.ArrowHelper(
      referenceDirection,
      referenceDirection.clone().multiplyScalar(length * -0.5),
      length,
      0x7fdcff,
      headLength,
      headWidth
    );

    referenceArrow.name = "Reference Up Arrow";

    const axisArrow = new THREE.ArrowHelper(
      axisDirection,
      axisDirection.clone().multiplyScalar(length * -0.5),
      length,
      0xfff2a8,
      headLength,
      headWidth
    );

    axisArrow.name = "Planet Pole Axis Arrow";

    for (const arrow of [referenceArrow, axisArrow]) {
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = 0.78;
      arrow.line.material.depthTest = false;
      arrow.line.material.depthWrite = false;

      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = 0.92;
      arrow.cone.material.depthTest = false;
      arrow.cone.material.depthWrite = false;

      arrow.renderOrder = 8;
      group.add(arrow);
    }

    group.userData.referenceArrow = referenceArrow;
    group.userData.axisArrow = axisArrow;
    group.userData.baseLength = length;
    group.userData.headLength = headLength;
    group.userData.headWidth = headWidth;

    return group;
  }

  updatePlanetInclinationIndicatorMesh(mesh, planet) {
    if (!mesh) {
      return;
    }

    const length = mesh.userData.baseLength ?? 1;
    const headLength = mesh.userData.headLength ?? length * 0.12;
    const headWidth = mesh.userData.headWidth ?? length * 0.07;

    const referenceArrow = mesh.userData.referenceArrow;
    const axisArrow = mesh.userData.axisArrow;

    const referenceDirection = new THREE.Vector3(0, 1, 0);
    const axisDirection = new THREE.Vector3(0, 1, 0)
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), planet.body?.axialTilt ?? 0)
      .normalize();

    if (referenceArrow) {
      referenceArrow.setDirection(referenceDirection);
      referenceArrow.setLength(length, headLength, headWidth);
      referenceArrow.position.copy(referenceDirection).multiplyScalar(length * -0.5);
    }

    if (axisArrow) {
      axisArrow.setDirection(axisDirection);
      axisArrow.setLength(length, headLength, headWidth);
      axisArrow.position.copy(axisDirection).multiplyScalar(length * -0.5);
    }

    mesh.name = `${planet.name} Inclination Indicators`;
  }

  createPlanetRingMesh(planet, radius) {
    const ring = planet.visual?.ring;

    if (!ring?.enabled) {
      return null;
    }

    const group = new THREE.Group();
    group.name = `${planet.name} Ring`;

    const geometry = createPlanetRingDiskGeometry({ segments: 224 });
    const material = new PlanetRingMaterial({
      ringConfig: ring,
      planetConfig: planet
    });

    material.depthTest = true;
    material.depthWrite = false;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${planet.name} Ring Disc`;
    mesh.renderOrder = 30;
    group.add(mesh);

    group.userData.ringDisc = mesh;
    group.userData.ringOuterRadius = 1;
    this.updatePlanetRingTransform(group, planet, radius);

    return group;
  }

  ensurePlanetRingMesh(entry, planet, radius) {
    const ring = planet.visual?.ring;

    if (!ring?.enabled) {
      if (entry.ringMesh) {
        entry.ringMesh.visible = false;
      }

      return;
    }

    if (!entry.ringMesh) {
      entry.ringMesh = this.createPlanetRingMesh(planet, radius);

      if (entry.ringMesh) {
        entry.bodyGroup.add(entry.ringMesh);
      }

      return;
    }

    this.updatePlanetRingTransform(entry.ringMesh, planet, radius);
  }

  updatePlanetRingTransform(ringMesh, planet, radius) {
    const ring = planet.visual?.ring ?? {};

    ringMesh.visible = Boolean(ring.enabled);

    if (!ringMesh.visible) {
      return;
    }

    const { innerRadius, outerRadius } = getRenderedRingRadii(planet, radius);
    const innerRatio = clamp(innerRadius / Math.max(outerRadius, 0.0001), 0.001, 0.999);

    ringMesh.userData.ringInnerRadius = innerRadius;
    ringMesh.userData.ringOuterRadius = outerRadius;
    ringMesh.scale.setScalar(outerRadius * (ring.apparentSize ?? 1.0));
    // Ring plane is locked to the planet equator:
    // default ring disc normal +Z -> planet axis +Y, then apply axial tilt.
    ringMesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 1, 0)
        .applyAxisAngle(new THREE.Vector3(0, 0, 1), planet.body?.axialTilt ?? 0)
        .normalize()
    );

    const ringDisc = ringMesh.userData.ringDisc;

    if (ringDisc?.material instanceof PlanetRingMaterial) {
      ringDisc.material.setRingConfig(
        ring,
        planet,
        innerRatio,
        1.0
      );
    }
  }

  registerPickObject(object, info) {
    object.userData.pickInfo = info;
    this.pickObjects.push(object);
    this.pickObjectByUuid.set(object.uuid, info);
  }

  selectBodyFromPointer(clientX, clientY) {
    const { systemView } = this.store.getState();
    const hit = this.pickBodyFromPointer(clientX, clientY);

    if (systemView.mode === "orbit" && systemView.orbitTargetId !== "star") {
      const orbitTargetInfo = this.getBodyInfo(systemView.orbitTargetId);

      if (hit && hit.id !== systemView.orbitTargetId) {
        if (hit.type === "planet") {
          this.store.setSystemEditorSelectedPlanetId(systemView.activeSystemId, hit.id);
        }

        this.orbitReturnTransition.active = false;
        this.store.selectSystemBody(hit.id);
        this.lastOrbitInputAt = performance.now() * 0.001;
        this.orbitTransition.targetId = null;
        this.orbitRotationInitialized = false;
        this.store.enterOrbitView(hit.id);
        return;
      }

      if (hit && hit.id === systemView.orbitTargetId) {
        if (orbitTargetInfo.type !== "planet") {
          return;
        }

        const sectorHit = this.pickOrbitSectorFromPointer(clientX, clientY);

        if (sectorHit) {
          const landingContext = this.createLandingContextFromSector(sectorHit);
          this.store.beginTerrainLanding(landingContext);
          return;
        }
      }

      this.beginOrbitReturnTransition();
      return;
    }

    if (!hit) {
      if (systemView.mode === "orbit" && systemView.orbitTargetId === "star") {
        this.beginOrbitReturnTransition();
        return;
      }

      this.store.deselectSystemBody();
      return;
    }

    if (hit.type === "planet") {
      this.store.setSystemEditorSelectedPlanetId(systemView.activeSystemId, hit.id);
    }

    if (hit.id === systemView.selectedBodyId) {
      return;
    }

    this.orbitReturnTransition.active = false;
    this.store.selectSystemBody(hit.id);
    this.lastOrbitInputAt = performance.now() * 0.001;
    this.orbitTransition.targetId = null;
    this.orbitRotationInitialized = false;
    this.store.enterOrbitView(hit.id);
  }

  pickBodyFromPointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.ndcPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndcPointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.ndcPointer, this.camera);

    const intersections = this.raycaster.intersectObjects(this.pickObjects, false);

    if (intersections.length === 0) {
      return null;
    }

    for (const intersection of intersections) {
      const info = this.pickObjectByUuid.get(intersection.object.uuid) ?? null;

      if (info) {
        return info;
      }
    }

    return null;
  }

  updateOrbitSectorOverlayVisibility() {
    const { activeView, systemView } = this.store.getState();

    if (
      activeView !== "system-view" ||
      systemView.mode !== "orbit" ||
      !systemView.orbitTargetId ||
      systemView.orbitTargetId === "star"
    ) {
      this.hideOrbitSectorHover();
    }
  }

  updateOrbitSectorHoverFromPointer(clientX, clientY) {
    const state = this.store.getState();
    const { systemView } = state;

    if (
      state.activeView !== "system-view" ||
      systemView.mode !== "orbit" ||
      !systemView.orbitTargetId ||
      systemView.orbitTargetId === "star"
    ) {
      this.hideOrbitSectorHover();
      return;
    }

    const entry = this.getPlanetEntryById(systemView.orbitTargetId);

    if (!entry?.planetMesh) {
      this.hideOrbitSectorHover();
      return;
    }

    const rect = this.canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      this.hideOrbitSectorHover();
      return;
    }

    this.ndcPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndcPointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.ndcPointer, this.camera);

    const intersections = this.raycaster.intersectObject(entry.planetMesh, false);

    if (intersections.length === 0) {
      this.hideOrbitSectorHover();
      return;
    }

    const localPoint = this.tmpSectorLocalPoint
      .copy(intersections[0].point);

    entry.planetMesh.worldToLocal(localPoint);

    if (localPoint.lengthSq() < 0.0001) {
      this.hideOrbitSectorHover();
      return;
    }

    const normal = localPoint.normalize();
    const longitude = Math.atan2(normal.z, normal.x);
    const latitude = Math.asin(clamp(normal.y, -1, 1));

    const longitudeStep = (Math.PI * 2) / HOVER_SECTOR_LONGITUDE_SEGMENTS;
    const latitudeStep = Math.PI / HOVER_SECTOR_LATITUDE_SEGMENTS;

    const longitudeIndex = Math.floor(
      (longitude + Math.PI) / longitudeStep
    );

    const latitudeIndex = Math.floor(
      (latitude + Math.PI * 0.5) / latitudeStep
    );

    const clampedLongitudeIndex = clamp(
      longitudeIndex,
      0,
      HOVER_SECTOR_LONGITUDE_SEGMENTS - 1
    );

    const clampedLatitudeIndex = clamp(
      latitudeIndex,
      0,
      HOVER_SECTOR_LATITUDE_SEGMENTS - 1
    );

    const isSouthPoleSector =
      clampedLatitudeIndex < HOVER_SECTOR_POLAR_LATITUDE_ROWS;

    const isNorthPoleSector =
      clampedLatitudeIndex >=
      HOVER_SECTOR_LATITUDE_SEGMENTS - HOVER_SECTOR_POLAR_LATITUDE_ROWS;

    const sectorLongitudeIndex =
      isSouthPoleSector || isNorthPoleSector
        ? 0
        : clampedLongitudeIndex;

    const sectorKey = `${entry.planet.id}:${sectorLongitudeIndex}:${clampedLatitudeIndex}`;

    if (sectorKey !== this.lastHoverSectorKey || !this.hoverSectorMesh.visible) {
      this.lastHoverSectorKey = sectorKey;

      this.setOrbitSectorHoverGeometry({
        entry,
        longitudeIndex: sectorLongitudeIndex,
        latitudeIndex: clampedLatitudeIndex,
        longitudeStep,
        latitudeStep,
        isPolarSector: isSouthPoleSector || isNorthPoleSector
      });
    }

    this.attachOrbitSectorHoverToPlanet(entry);
  }

  setOrbitSectorHoverGeometry({
    entry,
    longitudeIndex,
    latitudeIndex,
    longitudeStep,
    latitudeStep,
    isPolarSector = false
  }) {
    const longitudeMin = isPolarSector
      ? -Math.PI
      : -Math.PI + longitudeIndex * longitudeStep;

    const longitudeMax = isPolarSector
      ? Math.PI
      : longitudeMin + longitudeStep;
    const latitudeMin = -Math.PI * 0.5 + latitudeIndex * latitudeStep;
    const latitudeMax = latitudeMin + latitudeStep;

    const longitudeSubdivisions = isPolarSector
      ? HOVER_SECTOR_LONGITUDE_SEGMENTS * 2
      : 6;

    const latitudeSubdivisions = 4;
    const positions = [];
    const indices = [];
    const radius = entry.planetRadius * HOVER_SECTOR_RADIUS_OFFSET;

    for (let y = 0; y <= latitudeSubdivisions; y += 1) {
      const latitude = THREE.MathUtils.lerp(
        latitudeMin,
        latitudeMax,
        y / latitudeSubdivisions
      );

      const cosLatitude = Math.cos(latitude);

      for (let x = 0; x <= longitudeSubdivisions; x += 1) {
        const longitude = THREE.MathUtils.lerp(
          longitudeMin,
          longitudeMax,
          x / longitudeSubdivisions
        );

        positions.push(
          Math.cos(longitude) * cosLatitude * radius,
          Math.sin(latitude) * radius,
          Math.sin(longitude) * cosLatitude * radius
        );
      }
    }

    const rowSize = longitudeSubdivisions + 1;

    for (let y = 0; y < latitudeSubdivisions; y += 1) {
      for (let x = 0; x < longitudeSubdivisions; x += 1) {
        const a = y * rowSize + x;
        const b = a + 1;
        const c = a + rowSize;
        const d = c + 1;

        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    this.hoverSectorMesh.geometry.dispose();
    this.hoverSectorMesh.geometry = geometry;

    this.attachOrbitSectorHoverToPlanet(entry);
  }

  attachOrbitSectorHoverToPlanet(entry) {
    if (!this.hoverSectorMesh || !entry?.planetMesh) {
      return;
    }

    if (this.hoverSectorMesh.parent !== entry.planetMesh) {
      this.hoverSectorMesh.removeFromParent();
      entry.planetMesh.add(this.hoverSectorMesh);
    }

    this.hoverSectorMesh.position.set(0, 0, 0);
    this.hoverSectorMesh.rotation.set(0, 0, 0);
    this.hoverSectorMesh.quaternion.identity();
    this.hoverSectorMesh.scale.setScalar(1);
    this.hoverSectorMesh.visible = true;
  }

  hideOrbitSectorHover() {
    if (this.hoverSectorMesh) {
      this.hoverSectorMesh.visible = false;
      this.hoverSectorMesh.removeFromParent();
    }

    this.lastHoverSectorKey = null;
  }

  pickOrbitSectorFromPointer(clientX, clientY) {
    const state = this.store.getState();
    const { systemView } = state;

    if (
      state.activeView !== "system-view" ||
      systemView.mode !== "orbit" ||
      !systemView.orbitTargetId ||
      systemView.orbitTargetId === "star"
    ) {
      return null;
    }

    const entry = this.getPlanetEntryById(systemView.orbitTargetId);

    if (!entry?.planetMesh) {
      return null;
    }

    const rect = this.canvas.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.ndcPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndcPointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.ndcPointer, this.camera);

    const intersections = this.raycaster.intersectObject(entry.planetMesh, false);

    if (intersections.length === 0) {
      return null;
    }

    const localPoint = intersections[0].point.clone();
    entry.planetMesh.worldToLocal(localPoint);

    if (localPoint.lengthSq() < 0.0001) {
      return null;
    }

    const normal = localPoint.normalize();
    const longitude = Math.atan2(normal.z, normal.x);
    const latitude = Math.asin(clamp(normal.y, -1, 1));
    const longitudeStep = (Math.PI * 2) / HOVER_SECTOR_LONGITUDE_SEGMENTS;
    const latitudeStep = Math.PI / HOVER_SECTOR_LATITUDE_SEGMENTS;
    const longitudeIndex = clamp(
      Math.floor((longitude + Math.PI) / longitudeStep),
      0,
      HOVER_SECTOR_LONGITUDE_SEGMENTS - 1
    );
    const latitudeIndex = clamp(
      Math.floor((latitude + Math.PI * 0.5) / latitudeStep),
      0,
      HOVER_SECTOR_LATITUDE_SEGMENTS - 1
    );
    const isSouthPoleSector = latitudeIndex < HOVER_SECTOR_POLAR_LATITUDE_ROWS;
    const isNorthPoleSector = latitudeIndex >=
      HOVER_SECTOR_LATITUDE_SEGMENTS - HOVER_SECTOR_POLAR_LATITUDE_ROWS;
    const sectorLongitudeIndex = isSouthPoleSector || isNorthPoleSector
      ? 0
      : longitudeIndex;

    return {
      entry,
      normal,
      longitude,
      latitude,
      longitudeIndex: sectorLongitudeIndex,
      latitudeIndex,
      sectorId: `${entry.planet.id}:${sectorLongitudeIndex}:${latitudeIndex}`
    };
  }

  createLandingContextFromSector(sectorHit) {
    const activeSystem = this.getActiveSystem();
    const skySettings = this.getTerrainSkySettings();
    const { entry, normal } = sectorHit;

    this.systemRoot.updateMatrixWorld(true);
    entry.bodyGroup.updateMatrixWorld(true);
    entry.planetMesh.updateMatrixWorld(true);

    const planetWorldPosition = new THREE.Vector3();
    const planetWorldQuaternion = new THREE.Quaternion();
    const starWorldPosition = new THREE.Vector3(0, 0, 0);
    const surfaceUpWorld = normal.clone().applyQuaternion(
      entry.planetMesh.getWorldQuaternion(planetWorldQuaternion)
    ).normalize();

    entry.bodyGroup.getWorldPosition(planetWorldPosition);

    const planetAxisWorld = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(planetWorldQuaternion)
      .normalize();

    let surfaceEastWorld = new THREE.Vector3()
      .crossVectors(planetAxisWorld, surfaceUpWorld);

    if (surfaceEastWorld.lengthSq() < 0.0001) {
      surfaceEastWorld = new THREE.Vector3(1, 0, 0).cross(surfaceUpWorld);
    }

    if (surfaceEastWorld.lengthSq() < 0.0001) {
      surfaceEastWorld.set(0, 0, 1).cross(surfaceUpWorld);
    }

    surfaceEastWorld.normalize();

    const surfaceNorthWorld = new THREE.Vector3()
      .crossVectors(surfaceUpWorld, surfaceEastWorld)
      .normalize();

    const sunWorldVector = starWorldPosition.clone().sub(planetWorldPosition);
    const sunDistance = Math.max(0.0001, sunWorldVector.length());
    const sunDirectionWorld = sunWorldVector.clone().normalize();
    const rawSunDirectionLocal = worldDirectionToSurfaceLocal(
      sunDirectionWorld,
      surfaceEastWorld,
      surfaceUpWorld,
      surfaceNorthWorld
    );
    const sunProfile = createSectorSunProfile(rawSunDirectionLocal, sectorHit);
    const sunDirectionLocal = sunProfile.directionLocal;
    const sunElevation = sunProfile.elevation;
    const starRadius = activeSystem
      ? Math.max(2.5, activeSystem.star.radius * SYSTEM_VIEW_SCALE.starRadius)
      : this.starBaseRadius ?? 2.5;
    const sunAngularRadius = clampAngularRadius(
      Math.asin(clamp(starRadius / sunDistance, 0.0, 0.98)),
      skySettings.minSunAngularRadius,
      skySettings.maxSunAngularRadius
    );
    const sunColor = activeSystem?.star?.color ?? activeSystem?.color ?? [1.0, 0.72, 0.36];
    const skyObjects = [
      {
        type: "star",
        id: "star",
        directionLocal: sunDirectionLocal,
        angularRadius: sunAngularRadius,
        displayScale: skySettings.sunDisplayScale,
        color: sunColor,
        distance: sunDistance
      }
    ];

    for (const moonEntry of entry.moonEntries ?? []) {
      if (skyObjects.length >= 12) {
        break;
      }

      if (!moonEntry.orbitGroup.visible || !moonEntry.moonMesh.visible) {
        continue;
      }

      moonEntry.moonMesh.updateMatrixWorld(true);

      const moonPosition = new THREE.Vector3();
      moonEntry.moonMesh.getWorldPosition(moonPosition);

      const objectVector = moonPosition.sub(planetWorldPosition);
      const distance = objectVector.length();

      if (distance <= 0.0001) {
        continue;
      }

      const directionWorld = objectVector.clone().normalize();
      const directionLocal = worldDirectionToSurfaceLocal(
        directionWorld,
        surfaceEastWorld,
        surfaceUpWorld,
        surfaceNorthWorld
      );
      const moonScale = new THREE.Vector3();
      moonEntry.moonMesh.getWorldScale(moonScale);
      const bodyRadius = moonEntry.baseRadius * Math.max(moonScale.x, moonScale.y, moonScale.z);
      const angularRadius = clampAngularRadius(
        Math.asin(clamp(bodyRadius / distance, 0.0, 0.98)),
        skySettings.minPlanetAngularRadius,
        skySettings.maxPlanetAngularRadius
      );

      skyObjects.push({
        type: "moon",
        id: moonEntry.spec.id,
        planetId: entry.planet.id,
        moonIndex: moonEntry.spec.index,
        directionLocal,
        angularRadius,
        displayScale: skySettings.planetDisplayScale,
        color: moonEntry.spec.baseColor,
        distance,
        spec: {
          craterScale: moonEntry.spec.craterScale,
          craterDepth: moonEntry.spec.craterDepth,
          fineCraters: moonEntry.spec.fineCraters,
          batteredness: moonEntry.spec.batteredness,
          broadRises: moonEntry.spec.broadRises,
          colorContrast: moonEntry.spec.colorContrast,
          brightness: moonEntry.spec.brightness,
          dustAmount: moonEntry.spec.dustAmount,
          baseColor: moonEntry.spec.baseColor,
          accentColor: moonEntry.spec.accentColor,
          rotation: moonEntry.spec.rotation
        }
      });
    }

    for (const otherEntry of this.planetEntries) {
      if (!otherEntry.active || !otherEntry.orbitGroup.visible) {
        continue;
      }

      if (otherEntry.planet.id === entry.planet.id) {
        continue;
      }

      otherEntry.bodyGroup.updateMatrixWorld(true);

      const otherPosition = new THREE.Vector3();
      otherEntry.bodyGroup.getWorldPosition(otherPosition);
      const otherWorldPosition = otherPosition.clone();

      const objectVector = otherPosition.sub(planetWorldPosition);
      const distance = objectVector.length();

      if (distance <= 0.0001) {
        continue;
      }

      const directionWorld = objectVector.clone().normalize();
      const directionLocal = worldDirectionToSurfaceLocal(
        directionWorld,
        surfaceEastWorld,
        surfaceUpWorld,
        surfaceNorthWorld
      );
      const bodyRadius = Math.max(
        SYSTEM_VIEW_SCALE.minPlanetRadius,
        otherEntry.planet.body.radius * SYSTEM_VIEW_SCALE.planetRadius
      );
      const angularRadius = clampAngularRadius(
        Math.asin(clamp(bodyRadius / distance, 0.0, 0.98)),
        skySettings.minPlanetAngularRadius,
        skySettings.maxPlanetAngularRadius
      );
      const color = otherEntry.planet.visual?.baseColor ?? [0.68, 0.74, 0.86];

      otherEntry.planetMesh.updateMatrixWorld(true);
      otherEntry.ringMesh?.updateMatrixWorld(true);

      const otherPlanetQuaternion = otherEntry.planetMesh.getWorldQuaternion(
        new THREE.Quaternion()
      );

      const planetAxisWorld = new THREE.Vector3(0, 1, 0)
        .applyQuaternion(otherPlanetQuaternion)
        .normalize();

      let ringNormalLocal = null;
      let ringAxisULocal = null;
      let ringAxisVLocal = null;

      if (otherEntry.ringMesh?.visible) {
        const ringWorldQuaternion = otherEntry.ringMesh.getWorldQuaternion(
          new THREE.Quaternion()
        );

        const ringNormalWorld = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(ringWorldQuaternion)
          .normalize();

        const ringAxisUWorld = new THREE.Vector3(1, 0, 0)
          .applyQuaternion(ringWorldQuaternion)
          .normalize();

        const ringAxisVWorld = new THREE.Vector3(0, 1, 0)
          .applyQuaternion(ringWorldQuaternion)
          .normalize();

        ringNormalLocal = worldDirectionToSurfaceLocal(
          ringNormalWorld,
          surfaceEastWorld,
          surfaceUpWorld,
          surfaceNorthWorld
        );

        ringAxisULocal = worldDirectionToSurfaceLocal(
          ringAxisUWorld,
          surfaceEastWorld,
          surfaceUpWorld,
          surfaceNorthWorld
        );

        ringAxisVLocal = worldDirectionToSurfaceLocal(
          ringAxisVWorld,
          surfaceEastWorld,
          surfaceUpWorld,
          surfaceNorthWorld
        );
      }

      const lightDirectionLocal = worldDirectionToSurfaceLocal(
        starWorldPosition.clone().sub(otherWorldPosition).normalize(),
        surfaceEastWorld,
        surfaceUpWorld,
        surfaceNorthWorld
      );

      skyObjects.push({
        type: "planet",
        id: otherEntry.planet.id,
        directionLocal,
        angularRadius,
        displayScale: skySettings.planetDisplayScale,
        color,
        distance,
        lightDirectionLocal,
        planetAxisLocal: worldDirectionToSurfaceLocal(
          planetAxisWorld,
          surfaceEastWorld,
          surfaceUpWorld,
          surfaceNorthWorld
        ),
        ringNormalLocal,
        ringAxisULocal,
        ringAxisVLocal
      });

      if (skyObjects.length >= 12) {
        break;
      }
    }

    return {
      systemId: activeSystem?.id ?? this.store.getState().systemView.activeSystemId,
      planetId: entry.planet.id,
      sectorId: sectorHit.sectorId,
      landingLongitude: sectorHit.longitude,
      landingLatitude: sectorHit.latitude,
      surfaceNormalLocal: normal.toArray(),
      surfaceEastWorld: surfaceEastWorld.toArray(),
      surfaceUpWorld: surfaceUpWorld.toArray(),
      surfaceNorthWorld: surfaceNorthWorld.toArray(),
      sunDirectionLocal,
      sunElevation,
      sunProfile,
      lightPhase: sunProfile.phase,
      skyObjects,
      skySettings,
      entrySeed: hashLandingSeed(entry.planet.id, sectorHit.sectorId)
    };
  }

  getTerrainSkySettings() {
    const sky = this.galaxyConfig.terrainView?.sky ?? {};

    return {
      enabled: sky.enabled ?? true,
      sunDisplayScale: sky.sunDisplayScale ?? 1.0,
      planetDisplayScale: sky.planetDisplayScale ?? 1.0,
      minSunAngularRadius: sky.minSunAngularRadius ?? 0.012,
      maxSunAngularRadius: sky.maxSunAngularRadius ?? 0.42,
      minPlanetAngularRadius: sky.minPlanetAngularRadius ?? 0.003,
      maxPlanetAngularRadius: sky.maxPlanetAngularRadius ?? 0.12,
      sunIntensity: sky.sunIntensity ?? 1.15,
      nightAmbient: sky.nightAmbient ?? 0.045,
      dayAmbient: sky.dayAmbient ?? 0.19
    };
  }

  getSurfaceTexture(textureId) {
    if (!textureId || textureId === "none") {
      return null;
    }

    preloadSurfaceTexture(textureId, this.renderer).catch((error) => {
      console.warn(`Surface texture preload failed for ${textureId}:`, error);
    });

    return getSurfaceTexture(textureId) ?? null;
  }

  getActiveSystem() {
    const { activeSystemId } = this.store.getState().systemView;
    return this.systemById.get(activeSystemId) ?? null;
  }

  update({ elapsedTime, deltaTime = 0 }) {
    this.rebuildIfConfigChanged();

    const systemView = this.store.getState().systemView;
    const { yaw, pitch } = systemView;

    if (
      systemView.mode === "orbit" &&
      systemView.orbitReturnRequestId !== this.lastOrbitReturnRequestId
    ) {
      this.lastOrbitReturnRequestId = systemView.orbitReturnRequestId;
      this.beginOrbitReturnTransition();
      return;
    }

    this.lastOrbitReturnRequestId = systemView.orbitReturnRequestId;
    this.updateSystemRandomOrbitIdle();

    const systemIdlePitchOffset = this.updateSystemIdleMotion(deltaTime, elapsedTime);

    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const targetYaw = yaw + this.systemIdleYawOffset;
    const targetPitch = pitch + systemIdlePitchOffset;

    if (displayConfig.systemMapRotationInertia) {
      const rotationAlpha = 1 - Math.exp(-8.0 * Math.max(0, deltaTime));
      this.smoothedSystemYaw += (targetYaw - this.smoothedSystemYaw) * rotationAlpha;
      this.smoothedSystemPitch += (targetPitch - this.smoothedSystemPitch) * rotationAlpha;
    } else {
      this.smoothedSystemYaw = targetYaw;
      this.smoothedSystemPitch = targetPitch;
    }

    this.systemRoot.rotation.order = "YXZ";
    this.systemRoot.rotation.y = this.smoothedSystemYaw;
    this.systemRoot.rotation.x = this.smoothedSystemPitch;

    const orbitalTime = this.updateSystemSimulationTime(deltaTime);

    this.updatePlanets(orbitalTime, elapsedTime);
    this.updateGravityGrid(elapsedTime);
    this.updateCamera(elapsedTime, deltaTime);
    this.updateOrbitSectorOverlayVisibility();
    this.updateSpaceRotation(this.smoothedSystemYaw, this.smoothedSystemPitch);
    this.updateStar(elapsedTime);
    this.updateSelectionMarker();
    this.updateBackground(elapsedTime);
  }

  updateSystemSimulationTime(deltaTime = 0) {
    const activeSystem = this.getActiveSystem();
    const activeSystemId = activeSystem?.id ?? null;

    if (activeSystemId !== this.lastSimulationSystemId) {
      this.lastSimulationSystemId = activeSystemId;
      this.systemSimulationTime = 0;
    }

    const systemSpeed = getSystemSpeedMultiplier(this.store.getState());
    const safeDeltaTime = Number.isFinite(deltaTime)
      ? Math.max(0, Math.min(deltaTime, 0.1))
      : 0;

    this.systemSimulationTime += safeDeltaTime * systemSpeed;

    return this.systemSimulationTime;
  }

  updateSystemIdleMotion(deltaTime, elapsedTime) {
    const state = this.store.getState();
    const { systemView, transition } = state;
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});

    if (
      !displayConfig.idleCamsEnabled ||
      state.activeView !== "system-view" ||
      systemView.mode !== "system" ||
      isOptionsMenuOpen() ||
      transition.type !== "idle" ||
      systemView.pointerDown ||
      this.orbitReturnTransition.active ||
      this.orbitTransition.active
    ) {
      this.systemIdleYawOffset = 0;
      return 0;
    }

    const now = performance.now() * 0.001;
    const idleStartSeconds = getIdleStartSeconds(displayConfig);

    if (this.systemIdleMapRotationStartedAt === null) {
      if (now < this.systemIdleRotationPausedUntil || now - this.lastSystemInputAt < idleStartSeconds) {
        return 0;
      }

      this.systemIdleMapRotationStartedAt = now;
    }

    this.systemIdleYawOffset += SYSTEM_VIEW_IDLE.yawSpeed * Math.min(deltaTime, 0.05);

    return Math.sin(elapsedTime * SYSTEM_VIEW_IDLE.pitchSpeed) * SYSTEM_VIEW_IDLE.pitchAmplitude;
  }

  updateSystemRandomOrbitIdle() {
    const state = this.store.getState();
    const { systemView, transition } = state;
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const now = performance.now() * 0.001;

    if (
      !displayConfig.idleCamsEnabled ||
      !displayConfig.systemMapIdleAutoOrbit ||
      state.activeView !== "system-view" ||
      isOptionsMenuOpen() ||
      transition.type !== "idle" ||
      systemView.pointerDown ||
      this.orbitTransition.active ||
      this.orbitReturnTransition.active
    ) {
      if (!displayConfig.idleCamsEnabled) {
        this.systemIdleAutoOrbit = false;
        this.systemIdleReturning = false;
        this.systemIdleMapRotationStartedAt = null;
      }
      return;
    }

    if (systemView.mode === "system") {
      if (this.systemIdleReturning) {
        this.systemIdleReturning = false;
        this.systemIdleAutoOrbit = false;
        this.systemIdleMapRotationStartedAt = now;
        return;
      }

      const idleStartSeconds = getIdleStartSeconds(displayConfig);
      const idleDurationSeconds = getIdleDurationSeconds(displayConfig);

      if (this.systemIdleMapRotationStartedAt === null) {
        if (now - this.lastSystemInputAt < idleStartSeconds) {
          return;
        }

        this.systemIdleMapRotationStartedAt = now;
        return;
      }

      if (now - this.systemIdleMapRotationStartedAt < idleDurationSeconds) {
        return;
      }

      const targetId = this.pickRandomIdleOrbitTarget(systemView.activeSystemId);

      if (!targetId) {
        return;
      }

      const targetInfo = this.getBodyInfo(targetId);
      const targetDefaultDistance = getOrbitDefaultDistance(targetInfo);
      const startDistance = clamp(
        targetDefaultDistance * 3.6,
        getOrbitMinDistance(targetInfo),
        getOrbitMaxDistance(targetInfo)
      );

      this.systemIdleAutoOrbit = true;
      this.systemIdleOrbitStartedAt = now;
      this.systemIdleLastTargetId = targetId;
      this.systemIdleOrbitTargetDistance = targetDefaultDistance;
      this.systemIdleOrbitZoomApplied = false;
      this.systemIdleMapRotationStartedAt = null;
      this.store.enterOrbitView(targetId);
      this.store.setSystemViewState({
        orbitDistance: startDistance
      });
      return;
    }

    if (!this.systemIdleAutoOrbit || systemView.mode !== "orbit") {
      return;
    }

    if (
      !this.systemIdleOrbitZoomApplied &&
      Number.isFinite(this.systemIdleOrbitTargetDistance) &&
      now - this.systemIdleOrbitStartedAt >= ORBIT_VIEW.transitionDuration * 0.82
    ) {
      this.systemIdleOrbitZoomApplied = true;
      this.store.setSystemViewState({
        orbitDistance: this.systemIdleOrbitTargetDistance
      });
    }

    if (now - this.systemIdleOrbitStartedAt < getIdleDurationSeconds(displayConfig)) {
      return;
    }

    this.systemIdleReturning = true;
    this.systemIdleAutoOrbit = false;
    this.systemIdleOrbitTargetDistance = null;
    this.systemIdleOrbitZoomApplied = false;
    this.store.requestOrbitReturn();
  }

  pickRandomIdleOrbitTarget(systemId) {
    const system = this.systemById.get(systemId) ?? this.getActiveSystem();
    const visibleCount = getVisiblePlanetCount(system);
    const planets = (system?.planets ?? [])
      .slice(0, visibleCount)
      .filter((planet) => planet?.id && this.planetEntryById.has(planet.id));

    const targets = [];

    for (const planet of planets) {
      targets.push(planet.id);

      const entry = this.getPlanetEntryById(planet.id);

      for (const moonEntry of entry?.moonEntries ?? []) {
        if (moonEntry?.spec?.id && moonEntry.orbitGroup?.visible && moonEntry.moonMesh?.visible) {
          targets.push(moonEntry.spec.id);
        }
      }
    }

    if (targets.length === 0) {
      return null;
    }

    const candidates = targets.filter((targetId) => targetId !== this.systemIdleLastTargetId);
    const source = candidates.length > 0 ? candidates : targets;
    const index = Math.floor(Math.random() * source.length);
    return source[index] ?? null;
  }

  beginOrbitReturnTransition() {
    this.orbitTransition.active = false;
    this.orbitTransition.targetId = null;

    this.orbitReturnTransition.active = true;
    this.orbitReturnTransition.startedAt = performance.now() * 0.001;

    if (!this.systemIdleReturning) {
      this.lastSystemInputAt = this.orbitReturnTransition.startedAt;
      this.systemIdleRotationPausedUntil = this.orbitReturnTransition.startedAt;
      this.systemIdleMapRotationStartedAt = null;
    }

    this.orbitReturnTransition.fromPosition.copy(this.camera.position);
    this.orbitReturnTransition.fromTarget.copy(this.getCurrentCameraLookTarget());

    this.store.exitOrbitView();

    this.store.setSystemViewState({
      yaw: 0,
      pitch: Math.PI * 0.5,
      zoom: 0.24
    });
  }

  updateCamera(elapsedTime, deltaTime = 0) {
    const state = this.store.getState();
    const { systemView, transition } = state;

    if (systemView.mode === "orbit") {
      this.systemIdleYawOffset = 0;
      this.updateOrbitIdleRotation(deltaTime);
      this.updateOrbitCamera(elapsedTime, deltaTime);
      return;
    }

    this.orbitTransition.active = false;
    this.orbitTransition.targetId = null;

    if (this.camera.near !== 0.1 || this.camera.far !== SYSTEM_CAMERA_FAR) {
      this.camera.near = 0.1;
      this.camera.far = SYSTEM_CAMERA_FAR;
      this.camera.updateProjectionMatrix();
    }

    this.camera.up.set(0, 1, 0);

    const currentTime = performance.now() * 0.001;
    const { enteredAt, zoom } = systemView;

    const entryProgress = Math.min(
      1,
      (currentTime - enteredAt) / ENTRY_ZOOM_DURATION
    );

    const easedEntryProgress = easeOutCubic(entryProgress);
    let baseCameraDistance = 380 + (90 - 380) * easedEntryProgress;

    if (transition.type === "system-to-star-map" && !transition.revealed) {
      const elapsed = currentTime - transition.startedAt;
      const zoomOutProgress = smoothstep(0.0, 0.55, elapsed);
      baseCameraDistance *= 1 + zoomOutProgress * 2.8;
    }

    const zoomAlpha = 1 - Math.exp(-ZOOM_SMOOTHING_SPEED * Math.max(0, deltaTime));
    this.smoothedSystemZoom += (zoom - this.smoothedSystemZoom) * zoomAlpha;
    const displayedZoom = clamp(
      this.smoothedSystemZoom,
      SYSTEM_VIEW_LIMITS.minZoom,
      SYSTEM_VIEW_LIMITS.maxZoom
    );

    const cameraDistance = baseCameraDistance / displayedZoom;

    const targetPosition = this.tmpVectorA.set(0, 0, cameraDistance);
    const targetLookAt = this.tmpVectorB.set(0, 0, 0);

    if (this.orbitReturnTransition.active) {
      const progress = Math.min(
        1,
        (currentTime - this.orbitReturnTransition.startedAt) /
          this.orbitReturnTransition.duration
      );

      const easedProgress = easeInOutCubic(progress);

      const cameraPosition = this.tmpVectorC
        .copy(this.orbitReturnTransition.fromPosition)
        .lerp(targetPosition, easedProgress);

      const lookTarget = this.selectionMarkerWorldPosition
        .copy(this.orbitReturnTransition.fromTarget)
        .lerp(targetLookAt, easedProgress);

      this.camera.position.copy(cameraPosition);
      this.camera.lookAt(lookTarget);

      if (progress >= 1) {
        this.orbitReturnTransition.active = false;
      }

      this.camera.updateMatrixWorld(true);
      return;
    }

    this.camera.position.copy(targetPosition);
    this.camera.lookAt(targetLookAt);
    this.camera.updateMatrixWorld(true);
  }

  updateOrbitIdleRotation(deltaTime) {
    const state = this.store.getState();
    const { systemView, transition } = state;

    if (
      state.activeView !== "system-view" ||
      systemView.mode !== "orbit" ||
      !systemView.orbitTargetId ||
      transition.type !== "idle" ||
      isOptionsMenuOpen() ||
      systemView.pointerDown ||
      this.orbitTransition.active ||
      this.orbitReturnTransition.active ||
      !this.orbitRotationInitialized
    ) {
      return;
    }

    const now = performance.now() * 0.001;

    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});

    if (!displayConfig.idleCamsEnabled || !displayConfig.orbitIdleCamera || now - this.lastOrbitInputAt < getIdleStartSeconds(displayConfig)) {
      return;
    }

    const yawAngle = ORBIT_VIEW.idleYawSpeed * Math.min(deltaTime, 0.05);
    const up = this.tmpOrbitUp
      .set(0, 1, 0)
      .applyQuaternion(this.orbitRotation)
      .normalize();

    const yawRotation = this.tmpQuaternion
      .setFromAxisAngle(up, yawAngle);

    this.orbitRotation.premultiply(yawRotation).normalize();
  }

  rotateOrbitCamera(deltaX, deltaY) {
    if (!this.orbitRotationInitialized) {
      return;
    }

    this.orbitTransition.active = false;

    const yawAngle = -deltaX * ORBIT_VIEW.dragSensitivity;
    const pitchAngle = -deltaY * ORBIT_VIEW.dragSensitivity;

    const right = this.tmpOrbitRight
      .set(1, 0, 0)
      .applyQuaternion(this.orbitRotation)
      .normalize();

    const up = this.tmpOrbitUp
      .set(0, 1, 0)
      .applyQuaternion(this.orbitRotation)
      .normalize();

    const yawRotation = this.tmpQuaternion
      .setFromAxisAngle(up, yawAngle);

    this.orbitRotation.premultiply(yawRotation).normalize();

    const nextRight = right
      .set(1, 0, 0)
      .applyQuaternion(this.orbitRotation)
      .normalize();

    const pitchRotation = this.tmpQuaternion
      .setFromAxisAngle(nextRight, pitchAngle);

    this.orbitRotation.premultiply(pitchRotation).normalize();
  }

  getPlanetEntryById(bodyId) {
    const entry = this.planetEntryById.get(bodyId) ?? null;
    return entry?.active ? entry : null;
  }

  getMoonEntryById(bodyId) {
    for (const planetEntry of this.planetEntries) {
      if (!planetEntry.active || !planetEntry.orbitGroup.visible) {
        continue;
      }

      const moonEntry = (planetEntry.moonEntries ?? []).find(
        (candidate) => candidate.spec.id === bodyId && candidate.orbitGroup.visible
      );

      if (moonEntry) {
        return { planetEntry, moonEntry };
      }
    }

    return null;
  }

  getOrbitPlaneNormal(bodyInfo, target = new THREE.Vector3()) {
    if (bodyInfo.type === "moon") {
      const moonInfo = this.getMoonEntryById(bodyInfo.id);

      if (moonInfo?.moonEntry?.orbitGroup) {
        moonInfo.moonEntry.orbitGroup.updateMatrixWorld(true);

        return target
          .set(0, 1, 0)
          .applyQuaternion(moonInfo.moonEntry.orbitGroup.getWorldQuaternion(this.tmpQuaternion))
          .normalize();
      }
    }

    if (bodyInfo.type === "planet") {
      const entry = this.getPlanetEntryById(bodyInfo.id);

      if (entry?.orbitGroup) {
        entry.orbitGroup.updateMatrixWorld(true);

        return target
          .set(0, 1, 0)
          .applyQuaternion(entry.orbitGroup.getWorldQuaternion(this.tmpQuaternion))
          .normalize();
      }
    }

    this.systemRoot.updateMatrixWorld(true);

    return target
      .set(0, 1, 0)
      .applyQuaternion(this.systemRoot.getWorldQuaternion(this.tmpQuaternion))
      .normalize();
  }

  buildOrbitRotationFromBasis(right, up, back) {
    this.tmpOrbitMatrix.makeBasis(right, up, back);
    this.orbitRotation.setFromRotationMatrix(this.tmpOrbitMatrix).normalize();
    this.orbitRotationInitialized = true;
  }

  updateOrbitCamera(elapsedTime = 0, deltaTime = 0) {
    this.systemRoot.updateMatrixWorld(true);
    this.scene.updateMatrixWorld(true);

    const { systemView } = this.store.getState();
    const bodyInfo = this.getBodyInfo(systemView.orbitTargetId);

    if (!bodyInfo.object) {
      this.camera.lookAt(0, 0, 0);
      this.camera.updateMatrixWorld(true);
      return;
    }

    let orbitDistance = Number.isFinite(systemView.orbitDistance)
      ? systemView.orbitDistance
      : getOrbitDefaultDistance(bodyInfo);

    if (
      this.orbitTransition.targetId !== systemView.orbitTargetId ||
      !this.orbitRotationInitialized
    ) {
      const initializedOrbit = this.initializeOrbitCamera(bodyInfo);
      orbitDistance = initializedOrbit.distance;
      this.smoothedOrbitDistance = orbitDistance;
    }

    const safeOrbitDistance = clamp(
      orbitDistance,
      getOrbitMinDistance(bodyInfo),
      getOrbitMaxDistance(bodyInfo)
    );

    if (safeOrbitDistance !== systemView.orbitDistance) {
      this.store.setSystemViewState({
        orbitDistance: safeOrbitDistance
      });
    }

    const targetPosition = bodyInfo.position;
    const cameraBack = this.tmpOrbitBack
      .set(0, 0, 1)
      .applyQuaternion(this.orbitRotation)
      .normalize();

    if (this.orbitTransition.active) {
      this.smoothedOrbitDistance = safeOrbitDistance;
    } else {
      if (!Number.isFinite(this.smoothedOrbitDistance)) {
        this.smoothedOrbitDistance = safeOrbitDistance;
      }

      const orbitZoomAlpha = 1 - Math.exp(
        -ORBIT_ZOOM_SMOOTHING_SPEED * Math.max(0, deltaTime)
      );
      this.smoothedOrbitDistance +=
        (safeOrbitDistance - this.smoothedOrbitDistance) * orbitZoomAlpha;
    }

    const displayedOrbitDistance = this.orbitTransition.active
      ? safeOrbitDistance
      : this.smoothedOrbitDistance;

    const desiredPosition = this.tmpVectorB
      .copy(targetPosition)
      .addScaledVector(cameraBack, displayedOrbitDistance);

    this.camera.near = 0.05;
    this.camera.far = SYSTEM_CAMERA_FAR;
    this.camera.updateProjectionMatrix();

    if (this.orbitTransition.active) {
      const now = performance.now() * 0.001;
      const progress = Math.min(
        1,
        (now - this.orbitTransition.startedAt) / ORBIT_VIEW.transitionDuration
      );

      const easedProgress = easeInOutCubic(progress);
      const cameraPosition = this.tmpVectorC
        .copy(this.orbitTransition.fromPosition)
        .lerp(desiredPosition, easedProgress);

      this.camera.position.copy(cameraPosition);
      this.camera.quaternion.slerpQuaternions(
        this.orbitTransition.fromQuaternion,
        this.orbitRotation,
        easedProgress
      );

      if (progress >= 1) {
        this.orbitTransition.active = false;
        this.camera.position.copy(desiredPosition);
        this.camera.quaternion.copy(this.orbitRotation);
      }
    } else {
      this.camera.position.copy(desiredPosition);
      this.camera.quaternion.copy(this.orbitRotation);
    }

    this.camera.updateMatrixWorld(true);
  }

  initializeOrbitCamera(bodyInfo) {
    const preferredDistanceMultiplier =
      bodyInfo.type === "star"
        ? ORBIT_VIEW.starDistanceMultiplier
        : ORBIT_VIEW.planetDistanceMultiplier;

    const defaultDistance = clamp(
      bodyInfo.radius * preferredDistanceMultiplier,
      getOrbitMinDistance(bodyInfo),
      getOrbitMaxDistance(bodyInfo)
    );

    const stateDistance = this.store.getState().systemView.orbitDistance;
    const distance = this.systemIdleAutoOrbit &&
      this.systemIdleLastTargetId === bodyInfo.id &&
      Number.isFinite(stateDistance)
      ? clamp(stateDistance, getOrbitMinDistance(bodyInfo), getOrbitMaxDistance(bodyInfo))
      : defaultDistance;

    this.orbitTransition.active = true;
    this.orbitTransition.targetId = bodyInfo.id;
    this.orbitTransition.startedAt = performance.now() * 0.001;
    this.orbitTransition.fromPosition.copy(this.camera.position);
    this.orbitTransition.fromTarget.copy(this.getCurrentCameraLookTarget());
    this.orbitTransition.fromQuaternion.copy(this.camera.quaternion);

    if (bodyInfo.type === "planet" || bodyInfo.type === "moon") {
      const sunPosition = this.tmpVectorB.set(0, 0, 0);
      const orbitNormal = this.getOrbitPlaneNormal(bodyInfo, this.tmpOrbitUp);

      const cameraBack = this.tmpOrbitBack
        .copy(bodyInfo.position)
        .sub(sunPosition);

      cameraBack.addScaledVector(
        orbitNormal,
        -cameraBack.dot(orbitNormal)
      );

      if (cameraBack.lengthSq() < 0.0001) {
        cameraBack.set(0, 0, 1);
      }

      cameraBack.normalize();

      const screenRight = this.tmpOrbitRight
        .copy(orbitNormal)
        .cross(cameraBack);

      if (screenRight.lengthSq() < 0.0001) {
        screenRight.set(1, 0, 0);
      }

      screenRight.normalize();

      const screenUp = this.tmpVectorA
        .copy(cameraBack)
        .cross(screenRight);

      if (screenUp.lengthSq() < 0.0001) {
        screenUp.copy(orbitNormal);
      }

      screenUp.normalize();

      this.buildOrbitRotationFromBasis(
        screenRight,
        screenUp,
        cameraBack
      );
    } else {
      const cameraBack = this.tmpOrbitBack
        .copy(this.camera.position)
        .sub(bodyInfo.position);

      if (cameraBack.lengthSq() < 0.0001) {
        cameraBack.set(0, 0.22, 1);
      }

      cameraBack.normalize();

      const screenRight = this.tmpOrbitRight
        .set(0, 1, 0)
        .cross(cameraBack);

      if (screenRight.lengthSq() < 0.0001) {
        screenRight.set(1, 0, 0);
      }

      screenRight.normalize();

      const screenUp = this.tmpVectorA
        .copy(cameraBack)
        .cross(screenRight)
        .normalize();

      this.buildOrbitRotationFromBasis(
        screenRight,
        screenUp,
        cameraBack
      );
    }

    const directionFromTarget = this.tmpVectorA
      .set(0, 0, 1)
      .applyQuaternion(this.orbitRotation)
      .normalize();

    const yaw = Math.atan2(directionFromTarget.x, directionFromTarget.z);
    const pitch = Math.asin(clamp(directionFromTarget.y, -1, 1));

    this.store.setSystemViewState({
      orbitYaw: yaw,
      orbitPitch: pitch,
      orbitDistance: distance
    });

    return {
      yaw,
      pitch,
      distance
    };
  }

  getCurrentCameraLookTarget() {
    return this.tmpVectorC
      .copy(this.camera.position)
      .addScaledVector(this.camera.getWorldDirection(this.tmpVectorA), 90);
  }

  updateSpaceRotation(yaw, pitch) {
    if (!this.backgroundMaterial?.uniforms?.uRotation) {
      return;
    }

    this.spaceRotationEuler.set(pitch, yaw, 0, "YXZ");
    this.spaceRotationMatrix4.makeRotationFromEuler(this.spaceRotationEuler);
    this.spaceRotationMatrix3.setFromMatrix4(this.spaceRotationMatrix4);

    this.backgroundMaterial.uniforms.uRotation.value.copy(
      this.spaceRotationMatrix3
    );
  }

  rebuildIfConfigChanged() {
    const state = this.store.getState();
    const activeSystem = this.getActiveSystem();

    if (!activeSystem) {
      return;
    }

    const shaderChanged =
      activeSystem.visual.spaceShaderId !== this.activeSpaceShaderId;

    if (shaderChanged) {
      this.createOrUpdateBackground();
    }

    const nextStructureSignature = getSystemStructureSignature(activeSystem);
    const structureChanged =
      nextStructureSignature !== this.lastStructureSignature;

    if (structureChanged) {
      this.rebuildSystemObjects();
      this.lastStructureSignature = nextStructureSignature;
      return;
    }

    this.lastActiveSystemId = activeSystem.id;
    this.lastConfigRevision = state.configRevision;
  }

  updateGravityGrid(elapsedTime = 0) {
    if (!this.gravityGrid || !this.gravityGridMaterial) {
      return;
    }

    const state = this.store.getState();
    const enabled = Boolean(state.systemView?.gravityGridEnabled);

    this.gravityGrid.visible =
      enabled &&
      state.activeView === "system-view" &&
      state.transition.type === "idle";

    if (!this.gravityGrid.visible) {
      return;
    }

    const activeSystem = this.getActiveSystem();
    const gridHalfSize = this.getGravityGridHalfSize(activeSystem);
    const bodies = this.collectGravityGridBodies(activeSystem);

    this.gravityGrid.rotation.copy(this.systemRoot.rotation);
    this.gravityGrid.position.copy(this.systemRoot.position);
    this.gravityGrid.updateMatrixWorld(true);

    this.gravityGridMaterial.uniforms.uTime.value = elapsedTime;
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    this.gravityGridMaterial.uniforms.uColor.value.set(displayConfig.mapColor ?? "#7ec8ff");
    const gridScale = Math.max(0.25, Math.min(8, Number(state.systemView?.gravityGridScale ?? 3)));
    const gridOpacity = Math.max(0, Math.min(1, Number(state.systemView?.gravityGridOpacity ?? 0.64)));
    const gravityWeight = Math.max(0, Math.min(4, Number(state.systemView?.gravityGridWeight ?? 0.15)));

    this.gravityGridMaterial.setGridConfig({
      halfSize: gridHalfSize,
      density: 0.030 * gridScale,
      strength: gravityWeight,
      drop: 15.0,
      opacity: gridOpacity
    });
    this.gravityGridMaterial.setBodies(bodies);
  }

  getGravityGridHalfSize(system) {
    const visibleCount = getVisiblePlanetCount(system);
    const activePlanets = (system?.planets ?? []).slice(0, visibleCount);
    const maxOrbitRadius = Math.max(
      90,
      ...(activePlanets.map((planet) =>
        Math.max(1, planet.orbit.radius * SYSTEM_VIEW_SCALE.orbitRadius)
      ))
    );

    // Orbit Radius can now reach 7.5.
    // 7.5 * 220 = 1650, so the old 900 cap clipped/faded the outer grid.
    return Math.min(5200, maxOrbitRadius * 1.65 + 720);
  }

  collectGravityGridBodies(system) {
    const bodies = [];

    const starRadius = system
      ? Math.max(2.5, system.star.radius * SYSTEM_VIEW_SCALE.starRadius)
      : this.starBaseRadius ?? 2.5;

    bodies.push({
      x: 0,
      z: 0,
      radius: starRadius * 1.25,
      mass: Math.max(6.0, starRadius * 2.2)
    });

    for (const entry of this.planetEntries) {
      if (bodies.length >= GRAVITY_GRID_MAX_BODIES) {
        break;
      }

      if (!entry.active || !entry.orbitGroup.visible) {
        continue;
      }

      // Gravity Grid lives in the logical system plane.
      // Do not use world-projected positions here, because orbit inclination
      // would collapse the x/z projection periodically toward the star.
      const planetGridX = entry.bodyGroup.position.x;
      const planetGridZ = entry.bodyGroup.position.z;

      const currentPlanetRadius = Math.max(
        SYSTEM_VIEW_SCALE.minPlanetRadius,
        entry.planet.body.radius * SYSTEM_VIEW_SCALE.planetRadius
      );

      bodies.push({
        x: planetGridX,
        z: planetGridZ,
        radius: currentPlanetRadius,
        mass: Math.max(0.35, currentPlanetRadius * 1.25)
      });

      const activeMoonCount = getMoonCount(entry.planet);

      for (const moonEntry of entry.moonEntries ?? []) {
        if (bodies.length >= GRAVITY_GRID_MAX_BODIES || moonEntry.spec.index >= activeMoonCount) {
          break;
        }

        if (!moonEntry.moonMesh.visible) {
          continue;
        }

        const moonOrbitRadius = Math.max(0, Number(moonEntry.moonMesh.position.x) || 0);
        const moonOrbitAngle = moonEntry.orbitGroup.rotation.y ?? 0;

        const moonGridX = planetGridX + Math.cos(moonOrbitAngle) * moonOrbitRadius;
        const moonGridZ = planetGridZ + Math.sin(moonOrbitAngle) * moonOrbitRadius;

        const moonRadius = Math.max(
          0.08,
          (moonEntry.baseRadius ?? moonEntry.spec.radius) * Math.max(
            moonEntry.moonMesh.scale.x,
            moonEntry.moonMesh.scale.y,
            moonEntry.moonMesh.scale.z
          )
        );

        bodies.push({
          x: moonGridX,
          z: moonGridZ,
          radius: moonRadius,
          mass: Math.max(0.05, moonRadius * 0.75)
        });
      }
    }

    return bodies;
  }

  updateStar(elapsedTime) {
    const activeSystem = this.getActiveSystem();

    if (this.star) {
      const sphereRotationSpeed = activeSystem?.star?.sphereRotationSpeed ?? 0;
      const currentStarRadius = activeSystem
        ? Math.max(2.5, activeSystem.star.radius * SYSTEM_VIEW_SCALE.starRadius)
        : this.starBaseRadius ?? 1;

      const starScale =
        currentStarRadius / Math.max(this.starBaseRadius ?? currentStarRadius, 0.0001);

      this.star.name = activeSystem
        ? `System Star: ${activeSystem.star.shaderId}`
        : this.star.name;

      this.star.rotation.y = elapsedTime * 0.18 * sphereRotationSpeed;
      this.star.scale.setScalar(starScale);

      if (this.star.material instanceof SunMaterial && activeSystem) {
        this.star.material.uniforms.uTime.value = elapsedTime;
        this.star.material.setStarConfig(
          activeSystem.star,
          activeSystem.star.shaderId
        );
      }
    }

    if (this.starHalo && activeSystem) {
      const currentStarRadius = Math.max(
        2.5,
        activeSystem.star.radius * SYSTEM_VIEW_SCALE.starRadius
      );

      const haloScale =
        currentStarRadius /
        Math.max(this.starHaloBaseRadius ?? currentStarRadius, 0.0001);

      this.starHalo.scale.setScalar(haloScale);
      this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
      this.starHalo.quaternion.copy(this.cameraWorldQuaternion);

      if (this.starHalo.material instanceof SunHaloMaterial) {
        this.starHalo.material.uniforms.uTime.value = elapsedTime;
        this.starHalo.material.setStarConfig(activeSystem.star);
      }
    }
  }

  updatePlanets(orbitalTime, elapsedTime = orbitalTime) {
    const activeSystem = this.getActiveSystem();

    if (!activeSystem) {
      return;
    }

    this.ensureActivePlanetEntries(activeSystem);

    // Rebuild the id -> entry map from the currently bound active system only.
    // Old system planet ids must not keep resolving after a system switch.
    this.planetEntryById.clear();

    const systemState = this.store.getState().systemView;
    const selectedBodyId = systemState.selectedBodyId ?? systemState.orbitTargetId ?? null;
    const visiblePlanetCount = getVisiblePlanetCount(activeSystem);

    for (let index = 0; index < this.planetEntries.length; index += 1) {
      const entry = this.planetEntries[index];
      const planet = activeSystem.planets[entry.index];
      const isActive = Boolean(planet) && entry.index < visiblePlanetCount;

      entry.active = isActive;
      entry.orbitGroup.visible = isActive;

      if (!isActive) {
        if (entry.planetMesh) {
          this.pickObjectByUuid.delete(entry.planetMesh.uuid);
        }

        for (const moonEntry of entry.moonEntries ?? []) {
          moonEntry.orbitGroup.visible = false;
          this.pickObjectByUuid.delete(moonEntry.moonMesh.uuid);
        }

        continue;
      }

      this.ensureMoonEntries(entry, planet, getMoonCount(planet));

      const {
        orbitGroup,
        bodyGroup,
        orbitLine,
        planetMesh,
        cloudMesh,
        auroraGroup,
        gridMesh,
        inclinationIndicatorMesh,
        equatorMarkerMesh,
        ringMesh,
        moonEntries,
        orbitRadius: baseOrbitRadius,
        planetRadius: basePlanetRadius
      } = entry;

      entry.planet = planet;
      this.planetEntryById.set(planet.id, entry);
      this.pickObjectByUuid.set(planetMesh.uuid, {
        id: planet.id,
        type: "planet"
      });

      const currentOrbitRadius =
        planet.orbit.radius * SYSTEM_VIEW_SCALE.orbitRadius;

      const orbitAngle = planet.orbit.angle + orbitalTime * planet.orbit.speed;

      orbitGroup.name = `${planet.name} Orbit Group`;
      orbitGroup.rotation.x = planet.orbit.inclination;

      if (orbitLine) {
        this.updateOrbitLineGeometry(orbitLine, currentOrbitRadius, {
          type: "planet"
        });

        const selectedMoonBelongsToPlanet = moonEntries.some((moonEntry) =>
          moonEntry.spec?.id === selectedBodyId &&
          moonEntry.spec.index < getMoonCount(planet)
        );
        const selectedOrbitGlow = planet.id === selectedBodyId || selectedMoonBelongsToPlanet
          ? 1.0
          : 0.0;

        const orbitLinesEnabled = Boolean(systemState.orbitLinesEnabled ?? true);
        const orbitLineVisibility = clamp(Number(systemState.orbitLineVisibility ?? 1), 0, 2);
        orbitLine.visible = orbitLinesEnabled && currentOrbitRadius > 0.0001;
        if (orbitLine.material?.uniforms?.uColor) {
          const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
          orbitLine.material.uniforms.uColor.value.set(displayConfig.mapColor ?? "#7ec8ff");
        }
        if (orbitLine.material?.uniforms?.uOpacity) {
          const baseOpacity = Number(orbitLine.userData.baseOpacity ?? 0.28);
          orbitLine.material.uniforms.uOpacity.value = baseOpacity * orbitLineVisibility;
        }
        orbitLine.material?.setTime?.(elapsedTime);
        orbitLine.material?.setSelectedGlow?.(selectedOrbitGlow);
      }

      bodyGroup.name = `${planet.name} Body Group`;
      bodyGroup.position.set(
        Math.cos(orbitAngle) * currentOrbitRadius,
        0,
        Math.sin(orbitAngle) * currentOrbitRadius
      );

      const currentPlanetRadius = Math.max(
        SYSTEM_VIEW_SCALE.minPlanetRadius,
        planet.body.radius * SYSTEM_VIEW_SCALE.planetRadius
      );

      const planetScale =
        currentPlanetRadius / Math.max(basePlanetRadius, 0.0001);

      const bodyRotationY =
        planet.body.rotationOffset + orbitalTime * planet.body.rotationSpeed;

      planetMesh.name = planet.name;
      planetMesh.rotation.y = bodyRotationY;
      planetMesh.rotation.z = planet.body.axialTilt;
      planetMesh.scale.setScalar(planetScale);

      if (planetMesh.material instanceof PlanetSurfaceMaterial) {
        planetMesh.material.uniforms.uTime.value = elapsedTime;
        planetMesh.material.setPlanetConfig(
          planet,
          planet.visual.terrainShaderId ?? "none"
        );
        planetMesh.material.setSurfaceTexture(
          this.getSurfaceTexture(planet.visual.surfaceTextureId)
        );
        this.updatePlanetLightDirection(planetMesh);
        planetMesh.material.setCameraPosition?.(this.camera.position);
      }

      if (cloudMesh) {
        const clouds = this.getOrbitCloudConfig(planet);
        const orbitHeight = clouds.orbitHeight ?? 1.035;

        cloudMesh.name = `${planet.name} Cloud Shell`;
        cloudMesh.visible = Boolean(clouds.enabled);
        cloudMesh.rotation.y = bodyRotationY;
        cloudMesh.rotation.z = planet.body.axialTilt;
        cloudMesh.scale.setScalar(planetScale * orbitHeight);

        if (cloudMesh.material instanceof PlanetSurfaceMaterial) {
          cloudMesh.material.uniforms.uTime.value = elapsedTime;
          cloudMesh.material.setPlanetConfig(
            planet,
            planet.visual.terrainShaderId ?? "none"
          );
          cloudMesh.material.setCloudConfig(clouds);
          this.updatePlanetLightDirection(cloudMesh);
          cloudMesh.material.setCameraPosition?.(this.camera.position);
        }
      }

      if (auroraGroup) {
        auroraGroup.name = `${planet.name} Orbit Aurora`;
        this.updatePlanetAuroraGroup(
          auroraGroup,
          planet,
          basePlanetRadius,
          planetScale,
          bodyRotationY,
          elapsedTime
        );
      }

      if (gridMesh) {
        gridMesh.name = `${planet.name} Grid`;
        gridMesh.visible = Boolean(systemState.planetGridEnabled ?? false);
        gridMesh.rotation.y = bodyRotationY;
        gridMesh.rotation.z = planet.body.axialTilt;
        gridMesh.scale.setScalar(planetScale);
      }

      if (inclinationIndicatorMesh) {
        this.updatePlanetInclinationIndicatorMesh(inclinationIndicatorMesh, planet);
        inclinationIndicatorMesh.visible = Boolean(systemState.inclinationMarkersEnabled ?? false);
        inclinationIndicatorMesh.scale.setScalar(planetScale);
      }

      if (equatorMarkerMesh) {
        equatorMarkerMesh.name = `${planet.name} Equator Marker`;
        equatorMarkerMesh.visible = Boolean(systemState.equatorMarkersEnabled ?? false);

        // Equator marker is a sibling of planetMesh inside bodyGroup.
        // It should follow orbit position + axial tilt, but not planet self-rotation.
        equatorMarkerMesh.rotation.x = Math.PI * 0.5;
        equatorMarkerMesh.rotation.y = 0;
        equatorMarkerMesh.rotation.z = planet.body.axialTilt;

        equatorMarkerMesh.scale.setScalar(planetScale);
      }

      this.ensurePlanetRingMesh(entry, planet, currentPlanetRadius);

      if (entry.ringMesh) {
        entry.ringMesh.name = `${planet.name} Ring`;

        const ringDisc = entry.ringMesh.userData.ringDisc;

        if (ringDisc?.material instanceof PlanetRingMaterial) {
          entry.bodyGroup.updateWorldMatrix(true, false);
          entry.bodyGroup.getWorldPosition(this.tmpPlanetWorldPosition);

          this.tmpLightDirection
            .set(0, 0, 0)
            .sub(this.tmpPlanetWorldPosition)
            .normalize();

          ringDisc.material.uniforms.uTime.value = elapsedTime;
          ringDisc.material.uniforms.uLightDirection.value
            .copy(this.tmpLightDirection)
            .normalize();

          ringDisc.material.setPlanetShadow({
            planetCenter: this.tmpPlanetWorldPosition.toArray(),
            planetRadius: currentPlanetRadius,
            strength: 0.58,
            softness: 0.34
          });
        }
      }

      this.updatePlanetRingShadowOnSurface(entry, planet, currentPlanetRadius);

      this.updatePlanetMoons(entry, planet, orbitalTime, elapsedTime, currentPlanetRadius);
      this.updatePlanetMoonShadows(entry, currentPlanetRadius);
    }
  }

  updatePlanetRingShadowOnSurface(entry, planet, currentPlanetRadius) {
    const material = entry.planetMesh?.material;

    if (!(material instanceof PlanetSurfaceMaterial)) {
      return;
    }

    const ring = planet.visual?.ring ?? {};

    if (!ring.enabled || !entry.ringMesh?.visible || currentPlanetRadius <= 0.0001) {
      material.setRingShadowConfig({ enabled: false });
      return;
    }

    const { innerRadius, outerRadius } = getRenderedRingRadii(planet, currentPlanetRadius);
    const apparentSize = ring.apparentSize ?? 1.0;
    const innerPlanetRadius = (innerRadius * apparentSize) / Math.max(currentPlanetRadius, 0.0001);
    const outerPlanetRadius = (outerRadius * apparentSize) / Math.max(currentPlanetRadius, 0.0001);

    // Ring transform lives in the bodyGroup space. The planet shader works in
    // planetMesh-local space, so convert the ring plane/basis into that space.
    const planetLocalInverse = this.tmpQuaternion
      .copy(entry.planetMesh.quaternion)
      .invert();

    const ringQuaternion = entry.ringMesh.quaternion;

    const ringNormal = this.tmpVectorA
      .set(0, 0, 1)
      .applyQuaternion(ringQuaternion)
      .applyQuaternion(planetLocalInverse)
      .normalize();

    const ringAxisU = this.tmpVectorB
      .set(1, 0, 0)
      .applyQuaternion(ringQuaternion)
      .applyQuaternion(planetLocalInverse)
      .normalize();

    const ringAxisV = this.tmpVectorC
      .set(0, 1, 0)
      .applyQuaternion(ringQuaternion)
      .applyQuaternion(planetLocalInverse)
      .normalize();

    material.setRingShadowConfig({
      enabled: true,
      innerRadius: innerPlanetRadius,
      outerRadius: outerPlanetRadius,
      strength: ring.shadowStrength ?? 0.46,
      softness: ring.shadowSoftness ?? 0.18,
      normal: ringNormal.toArray(),
      axisU: ringAxisU.toArray(),
      axisV: ringAxisV.toArray()
    });
  }

  updatePlanetMoons(entry, planet, orbitalTime, elapsedTime, currentPlanetRadius) {
    const moonEntries = entry.moonEntries ?? [];
    const activeMoonCount = getMoonCount(planet);
    const rotationDirection = getPlanetRotationDirection(planet);
    const systemState = this.store.getState().systemView;
    const selectedBodyId = systemState.selectedBodyId ?? systemState.orbitTargetId ?? null;

    for (const moonEntry of moonEntries) {
      const spec = moonEntry.spec;
      const isActive = spec.index < activeMoonCount;

      moonEntry.orbitGroup.visible = isActive;

      if (!isActive) {
        this.pickObjectByUuid.delete(moonEntry.moonMesh.uuid);
        continue;
      }

      const orbitScale = currentPlanetRadius / Math.max(entry.planetRadius, 0.0001);
      const orbitSpeed = Math.abs(spec.speed) * rotationDirection;
      const spinSpeed = Math.abs(spec.rotationSpeed) * rotationDirection;
      const orbitAngle = spec.angle + orbitalTime * orbitSpeed;

      moonEntry.orbitGroup.name = `${spec.name} Orbit Group`;
      moonEntry.orbitGroup.rotation.set(
        spec.inclinationX,
        orbitAngle,
        spec.inclinationZ,
        "YXZ"
      );

      moonEntry.moonMesh.name = spec.name;
      const moonOrbitScale = orbitScale * getMoonRadiusScale(planet);

      const currentMoonOrbitRadius = spec.orbitRadius * moonOrbitScale;

      if (moonEntry.orbitLine) {
        this.updateOrbitLineGeometry(moonEntry.orbitLine, currentMoonOrbitRadius, {
          type: "moon"
        });

        const moonLinesEnabled = Boolean(systemState.moonLinesEnabled ?? true);
        const orbitLineVisibility = clamp(Number(systemState.orbitLineVisibility ?? 1), 0, 2);
        moonEntry.orbitLine.visible = moonLinesEnabled && currentMoonOrbitRadius > 0.0001;
        if (moonEntry.orbitLine.material?.uniforms?.uColor) {
          const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
          moonEntry.orbitLine.material.uniforms.uColor.value.set(displayConfig.mapColor ?? "#7ec8ff");
        }
        if (moonEntry.orbitLine.material?.uniforms?.uOpacity) {
          const baseOpacity = Number(moonEntry.orbitLine.userData.baseOpacity ?? 0.34);
          moonEntry.orbitLine.material.uniforms.uOpacity.value = baseOpacity * orbitLineVisibility;
        }
        moonEntry.orbitLine.material?.setTime?.(elapsedTime);
        moonEntry.orbitLine.material?.setSelectedGlow?.(spec.id === selectedBodyId ? 1.0 : 0.0);
      }

      moonEntry.moonMesh.position.set(
        currentMoonOrbitRadius,
        0,
        0
      );
      moonEntry.moonMesh.rotation.x = spec.rotation.x + orbitalTime * spinSpeed * 0.31;
      moonEntry.moonMesh.rotation.y = spec.rotation.y + orbitalTime * spinSpeed;
      moonEntry.moonMesh.rotation.z = spec.rotation.z + orbitalTime * spinSpeed * 0.17;

      const moonVisualScale = orbitScale * getMoonSizeScale(planet);
      const moonGeometryRadiusScale = spec.radius / Math.max(moonEntry.baseRadius ?? spec.radius, 0.0001);
      moonEntry.moonMesh.scale.set(
        moonVisualScale * moonGeometryRadiusScale * (spec.stretchX ?? 1.0),
        moonVisualScale * moonGeometryRadiusScale * (spec.stretchY ?? 1.0),
        moonVisualScale * moonGeometryRadiusScale * (spec.stretchZ ?? 1.0)
      );

      if (moonEntry.moonMesh.material instanceof PlanetSurfaceMaterial) {
        moonEntry.moonMesh.material.uniforms.uTime.value = elapsedTime;
        moonEntry.moonMesh.material.setPlanetConfig(
          this.createMoonSurfaceConfig(spec),
          "moon"
        );
        moonEntry.moonMesh.material.setSurfaceTexture(this.moonRockTexture);
        this.updatePlanetLightDirection(moonEntry.moonMesh);
        moonEntry.moonMesh.material.setBodyShadowFactor?.(
          this.calculatePlanetShadowOnMoon(entry, moonEntry, currentPlanetRadius)
        );
        moonEntry.moonMesh.material.setCameraPosition?.(this.camera.position);
      }

      this.pickObjectByUuid.set(moonEntry.moonMesh.uuid, {
        id: spec.id,
        type: "moon",
        planetId: planet.id,
        moonIndex: spec.index
      });
    }
  }

  calculatePlanetShadowOnMoon(entry, moonEntry, currentPlanetRadius) {
    if (!entry?.bodyGroup || !moonEntry?.moonMesh) {
      return 0.0;
    }

    entry.bodyGroup.updateWorldMatrix(true, false);
    moonEntry.moonMesh.updateWorldMatrix(true, false);

    const planetWorldPosition = this.tmpVectorA;
    const moonWorldPosition = this.tmpVectorB;

    entry.bodyGroup.getWorldPosition(planetWorldPosition);
    moonEntry.moonMesh.getWorldPosition(moonWorldPosition);

    const toStar = this.tmpVectorC
      .set(0, 0, 0)
      .sub(moonWorldPosition)
      .normalize();

    const toPlanet = planetWorldPosition.clone().sub(moonWorldPosition);
    const parallelDistance = toPlanet.dot(toStar);

    // The planet must be between moon and star.
    if (parallelDistance <= 0.0) {
      return 0.0;
    }

    const perpendicularMiss = toPlanet
      .addScaledVector(toStar, -parallelDistance)
      .length();

    const moonRadius = (moonEntry.baseRadius ?? moonEntry.spec.radius) * Math.max(
      moonEntry.moonMesh.scale.x,
      moonEntry.moonMesh.scale.y,
      moonEntry.moonMesh.scale.z
    );

    const softOuter = currentPlanetRadius + moonRadius * 0.85;
    const hardInner = currentPlanetRadius * 0.72;
    const alignment = 1.0 - smoothstep(hardInner, softOuter, perpendicularMiss);

    if (alignment <= 0.0001) {
      return 0.0;
    }

    const distanceFade = 1.0 - smoothstep(
      currentPlanetRadius * 12.0,
      currentPlanetRadius * 34.0,
      parallelDistance
    );

    return clamp(alignment * (0.55 + distanceFade * 0.45), 0.0, 0.92);
  }

  updatePlanetMoonShadows(entry, currentPlanetRadius) {
    if (!(entry.planetMesh?.material instanceof PlanetSurfaceMaterial)) {
      return;
    }

    const moonShadows = [];

    entry.bodyGroup.updateWorldMatrix(true, false);
    entry.planetMesh.updateWorldMatrix(true, false);

    const planetWorldPosition = this.tmpPlanetWorldPosition;
    const inversePlanetQuaternion = this.tmpPlanetWorldQuaternion;

    entry.bodyGroup.getWorldPosition(planetWorldPosition);
    entry.planetMesh.getWorldQuaternion(inversePlanetQuaternion).invert();

    // Local light direction: planet center -> star/sun.
    const lightDirectionLocal = this.tmpVectorB
      .set(0, 0, 0)
      .sub(planetWorldPosition)
      .normalize()
      .applyQuaternion(inversePlanetQuaternion)
      .normalize();

    for (const moonEntry of entry.moonEntries ?? []) {
      if (!moonEntry.orbitGroup.visible || !moonEntry.moonMesh.visible) {
        continue;
      }

      moonEntry.moonMesh.updateWorldMatrix(true, false);
      moonEntry.moonMesh.getWorldPosition(this.tmpVectorA);

      const moonOffsetLocal = this.tmpVectorA
        .sub(planetWorldPosition)
        .applyQuaternion(inversePlanetQuaternion);

      const moonDistance = moonOffsetLocal.length();

      if (moonDistance <= 0.0001) {
        continue;
      }

      const moonRadius = (moonEntry.baseRadius ?? moonEntry.spec.radius) * Math.max(
        moonEntry.moonMesh.scale.x,
        moonEntry.moonMesh.scale.y,
        moonEntry.moonMesh.scale.z
      );

      // Moon must be on the sun-facing side of the planet.
      const parallelDistance = moonOffsetLocal.dot(lightDirectionLocal);

      if (parallelDistance <= 0.0) {
        continue;
      }

      // Perpendicular offset from the sun ray through the planet center.
      const perpendicularOffset = this.tmpVectorC
        .copy(moonOffsetLocal)
        .addScaledVector(lightDirectionLocal, -parallelDistance);

      const missDistance = perpendicularOffset.length();

      // If the moon's projected disc misses the planetary disc, no shadow.
      const transitLimit = currentPlanetRadius + moonRadius * 2.5;

      if (missDistance > transitLimit) {
        continue;
      }

      // Project the moon onto the visible sun-facing planetary hemisphere.
      const clampedMissDistance = Math.min(
        missDistance,
        currentPlanetRadius * 0.985
      );

      const centerAlongLight = Math.sqrt(
        Math.max(
          currentPlanetRadius * currentPlanetRadius -
            clampedMissDistance * clampedMissDistance,
          0.0
        )
      );

      const shadowCenterLocal = perpendicularOffset
        .clone()
        .setLength(clampedMissDistance)
        .addScaledVector(lightDirectionLocal, centerAlongLight)
        .normalize();

      const fadeBand = Math.max(
        moonRadius * MOON_SHADOW_FADE_MOON_RADIUS_FACTOR,
        currentPlanetRadius * 0.035
      );

      const shadowStrength = 1.0 - smoothstep(
        Math.max(0.0, transitLimit - fadeBand),
        transitLimit,
        missDistance
      );

      const angularRadius = clamp(
        (moonRadius / Math.max(parallelDistance, 0.0001)) *
          currentPlanetRadius *
          2.15,
        0.0,
        0.48
      );

      if (angularRadius <= 0.0001 || shadowStrength <= 0.0001) {
        continue;
      }

      moonShadows.push({
        direction: shadowCenterLocal.toArray(),
        angularRadius,
        strength: shadowStrength
      });
    }

    entry.planetMesh.material.setMoonShadowConfig(moonShadows);

    if (entry.cloudMesh?.material instanceof PlanetSurfaceMaterial) {
      entry.cloudMesh.material.setMoonShadowConfig(moonShadows);
    }
  }

  updatePlanetLightDirection(planetMesh) {
    planetMesh.updateWorldMatrix(true, false);
    planetMesh.getWorldPosition(this.tmpPlanetWorldPosition);

    this.tmpLightDirection
      .set(0, 0, 0)
      .sub(this.tmpPlanetWorldPosition)
      .normalize();

    planetMesh.getWorldQuaternion(this.tmpPlanetWorldQuaternion).invert();
    this.tmpLightDirection.applyQuaternion(this.tmpPlanetWorldQuaternion).normalize();

    planetMesh.material.uniforms.uLightDirection.value.copy(this.tmpLightDirection);
  }

  getBodyInfo(bodyId) {
    const emptyInfo = {
      id: bodyId,
      type: null,
      object: null,
      radius: 1,
      position: new THREE.Vector3()
    };

    if (!bodyId) {
      return emptyInfo;
    }

    if (bodyId === "star") {
      const position = new THREE.Vector3();

      this.systemRoot.updateMatrixWorld(true);

      if (this.star) {
        this.star.updateMatrixWorld(true);
        this.star.getWorldPosition(position);
      }

      const activeSystem = this.getActiveSystem();
      const radius = activeSystem
        ? Math.max(2.5, activeSystem.star.radius * SYSTEM_VIEW_SCALE.starRadius)
        : this.starBaseRadius ?? 2.5;

      return {
        id: "star",
        type: "star",
        object: this.star,
        radius,
        position
      };
    }

    const moonInfo = this.getMoonEntryById(bodyId);

    if (moonInfo?.moonEntry?.moonMesh) {
      this.systemRoot.updateMatrixWorld(true);
      moonInfo.moonEntry.moonMesh.updateMatrixWorld(true);

      const position = new THREE.Vector3();
      moonInfo.moonEntry.moonMesh.getWorldPosition(position);

      const radius = Math.max(
        0.08,
        (moonInfo.moonEntry.baseRadius ?? moonInfo.moonEntry.spec.radius) * Math.max(
          moonInfo.moonEntry.moonMesh.scale.x,
          moonInfo.moonEntry.moonMesh.scale.y,
          moonInfo.moonEntry.moonMesh.scale.z
        )
      );

      return {
        id: bodyId,
        type: "moon",
        object: moonInfo.moonEntry.moonMesh,
        radius,
        position,
        planetId: moonInfo.planetEntry.planet.id
      };
    }

    const entry = this.getPlanetEntryById(bodyId);

    if (!entry?.planetMesh || !entry?.bodyGroup) {
      return emptyInfo;
    }

    this.systemRoot.updateMatrixWorld(true);
    entry.bodyGroup.updateMatrixWorld(true);
    entry.planetMesh.updateMatrixWorld(true);

    const planet = entry.planet;
    const position = new THREE.Vector3();

    entry.bodyGroup.getWorldPosition(position);

    const radius = Math.max(
      SYSTEM_VIEW_SCALE.minPlanetRadius,
      planet.body.radius * SYSTEM_VIEW_SCALE.planetRadius
    );

    return {
      id: bodyId,
      type: "planet",
      object: entry.planetMesh,
      radius,
      position
    };
  }

  updateSelectionMarker() {
    if (!this.selectionMarker) {
      return;
    }

    const { selectedBodyId } = this.store.getState().systemView;
    const bodyInfo = this.getBodyInfo(selectedBodyId);

    if (!bodyInfo.object) {
      this.selectionMarker.visible = false;
      return;
    }

    this.selectionMarker.visible = true;
    this.selectionMarker.position.copy(bodyInfo.position);
    this.selectionMarker.quaternion.copy(
      this.camera.getWorldQuaternion(this.tmpQuaternion)
    );

    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});

    if (this.selectionMarker.material?.color) {
      this.selectionMarker.material.color.set(displayConfig.markerColor ?? "#ffd37a");
    }

    if (this.selectionMarker.material) {
      this.selectionMarker.material.opacity = clamp(Number(displayConfig.markerOpacity ?? 0.82), 0, 1);
    }

    const glow = clamp(Number(displayConfig.markerGlow ?? 1), 0, 3);
    const scale = bodyInfo.radius * (bodyInfo.type === "star" ? 1.35 : bodyInfo.type === "moon" ? 2.35 : 1.75);
    this.selectionMarker.scale.setScalar(
      Math.max(scale, bodyInfo.type === "moon" ? 0.65 : 2.2) * (1 + glow * 0.16)
    );
  }

  updateBackground(elapsedTime) {
    if (!this.backgroundMaterial) {
      return;
    }

    const activeSystem = this.getActiveSystem();
    const shaderId = activeSystem?.visual?.spaceShaderId ?? "star-nest";
    const params = activeSystem?.visual?.spaceShaderParams ?? {};

    this.backgroundMaterial.uniforms.uTime.value = elapsedTime;

    this.backgroundMaterial.uniforms.uParams.value.set(createStarNestParamArray(params));
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    if (this.backgroundMaterial) {
      this.renderer.getDrawingBufferSize(
        this.backgroundMaterial.uniforms.uResolution.value
      );
    }
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("contextmenu", this.handleContextMenu);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    window.removeEventListener("keydown", this.handleGlobalKeyDown);
    window.removeEventListener("space-flyer-system-input", this.handleExternalSystemInput);

    this.moonRockTexture?.dispose?.();
    this.moonRockTexture = null;

    if (this.gravityGrid) {
      this.scene.remove(this.gravityGrid);
      this.gravityGrid.geometry?.dispose?.();
      this.gravityGrid.material?.dispose?.();
      this.gravityGrid = null;
      this.gravityGridMaterial = null;
    }

    for (const background of this.backgroundByShaderId.values()) {
      background.geometry?.dispose?.();
      background.material?.dispose?.();
    }

    this.backgroundByShaderId.clear();
    this.background = null;
    this.backgroundMaterial = null;

    if (this.selectionMarker) {
      this.scene.remove(this.selectionMarker);
      this.selectionMarker.geometry?.dispose?.();
      this.selectionMarker.material?.dispose?.();
      this.selectionMarker = null;
    }

    if (this.hoverSectorMesh) {
      this.hoverSectorMesh.removeFromParent();
      this.hoverSectorMesh.geometry?.dispose?.();
      this.hoverSectorMesh.material?.dispose?.();
      this.hoverSectorMesh = null;
      this.hoverSectorMaterial = null;
    }

    this.disposeSystemObjects();

    this.scene.traverse((object) => {
      object.geometry?.dispose?.();

      if (Array.isArray(object.material)) {
        for (const material of object.material) {
          material.dispose?.();
        }

        return;
      }

      object.material?.dispose?.();
    });

    this.scene.clear();
  }
}



const SECTOR_SUN_PROFILES = {
  day: { elevation: 0.68, variation: 0.16, min: 0.38, max: 0.92 },
  morning: { elevation: 0.085, variation: 0.055, min: 0.018, max: 0.165 },
  evening: { elevation: 0.075, variation: 0.050, min: 0.012, max: 0.150 },
  night: { elevation: -0.20, variation: 0.10, min: -0.38, max: -0.055 }
};

function createSectorSunProfile(rawDirectionLocal, sectorHit) {
  const rawElevation = Number(rawDirectionLocal?.[1] ?? 0);
  const phase = getLightPhase(rawDirectionLocal);
  const profile = SECTOR_SUN_PROFILES[phase] ?? SECTOR_SUN_PROFILES.day;
  const seed = hashLandingSeed(sectorHit.entry?.planet?.id ?? "planet", sectorHit.sectorId ?? "sector");
  const variationNoise = hashUnit(seed, 17) * 2.0 - 1.0;
  const targetElevation = clamp(
    profile.elevation + variationNoise * profile.variation,
    profile.min,
    profile.max
  );
  const directionLocal = normalizeLocalSunDirection(rawDirectionLocal, targetElevation, phase);

  return {
    phase,
    rawElevation,
    elevation: directionLocal[1],
    targetElevation,
    variation: profile.variation,
    directionLocal
  };
}

function normalizeLocalSunDirection(rawDirectionLocal, targetElevation, phase) {
  const y = clamp(targetElevation, -0.98, 0.98);
  let x = Number(rawDirectionLocal?.[0] ?? 0);
  let z = Number(rawDirectionLocal?.[2] ?? 0);
  let horizontalLength = Math.hypot(x, z);

  if (horizontalLength < 0.0001) {
    x = phase === "evening" || phase === "night" ? -1 : 1;
    z = 0;
    horizontalLength = 1;
  }

  const horizontalScale = Math.sqrt(Math.max(0, 1 - y * y)) / horizontalLength;

  return [
    x * horizontalScale,
    y,
    z * horizontalScale
  ];
}

function hashUnit(seed, salt = 0) {
  let value = (Number(seed) >>> 0) ^ Math.imul(Number(salt) >>> 0, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

function worldDirectionToSurfaceLocal(directionWorld, eastWorld, upWorld, northWorld) {
  return [
    directionWorld.dot(eastWorld),
    directionWorld.dot(upWorld),
    directionWorld.dot(northWorld)
  ];
}

function clampAngularRadius(value, minValue, maxValue) {
  return clamp(value, minValue, maxValue);
}

function getLightPhase(sunDirectionLocal) {
  const elevation = sunDirectionLocal[1] ?? 0;

  if (elevation > 0.35) {
    return "day";
  }

  if (elevation < -0.12) {
    return "night";
  }

  return (sunDirectionLocal[0] ?? 0) >= 0 ? "morning" : "evening";
}

function getSystemSpeedMultiplier(state) {
  const value = Number(state?.systemView?.systemSpeed ?? 1);

  if (!Number.isFinite(value)) {
    return 1;
  }

  return clamp(value, -10, 10);
}

function getPlanetRotationDirection(planet) {
  const rotationSpeed = Number(planet?.body?.rotationSpeed ?? 0);
  return Number.isFinite(rotationSpeed) && rotationSpeed < 0 ? -1 : 1;
}

function getMoonRadiusScale(planet) {
  const value = Number(planet?.moons?.radiusScale ?? 1);

  return Number.isFinite(value) ? clamp(value, 0.35, 3.0) : 1;
}

function getMoonSizeScale(planet) {
  const value = Number(planet?.moons?.sizeScale ?? 1);

  return Number.isFinite(value) ? clamp(value, 0.25, 3.0) : 1;
}

function getMoonCount(planet) {
  if (Array.isArray(planet?.moons)) {
    return Math.max(0, Math.min(10, planet.moons.length));
  }

  const count = Number(planet?.moons?.count ?? 0);
  return Number.isFinite(count) ? Math.max(0, Math.min(10, Math.round(count))) : 0;
}

function createMoonSpecs(planet, planetRadius, requestedCount = getMoonCount(planet)) {
  const count = Math.max(0, Math.min(MAX_PLANET_MOONS, Math.round(Number(requestedCount) || 0)));
  const seed = hashString(`${planet.id}:${planet.name}:moons`);
  const specs = [];
  const rotationDirection = getPlanetRotationDirection(planet);

  for (let index = 0; index < count; index += 1) {
    const moonSeed = hashString(`${planet.id}:moon:${index}`);
    const grey = seededRange(seed, index * 19 + 4, 0.36, 0.62);
    const warm = seededRange(seed, index * 19 + 5, -0.035, 0.045);
    const radiusFactor = seededRange(seed, index * 19 + 1, 0.075, 0.18);

    // Deterministic size variation per moon.
    // Keep this moderate so moons gain variety without becoming planet-like chunks.
    const sizeRandom = seededRange(seed, index * 19 + 23, 0.72, 1.28);
    const moonRadius = Math.max(0.14, planetRadius * radiusFactor * sizeRandom);

    // Mild non-uniform visual deformation. The logical radius stays stable; picking,
    // shadows and camera focus use the largest axis scale below.
    const stretchX = seededRange(seed, index * 19 + 24, 0.90, 1.13);
    const stretchY = seededRange(seed, index * 19 + 25, 0.88, 1.10);
    const stretchZ = seededRange(seed, index * 19 + 26, 0.91, 1.14);
    const stretchMax = Math.max(stretchX, stretchY, stretchZ);

    const orbitRadius = planetRadius * (
      2.35 +
      index * 0.72 +
      seededRange(seed, index * 19 + 2, 0.0, 0.42)
    );
    const speed = rotationDirection * seededRange(seed, index * 19 + 6, 0.11, 0.24) / Math.pow(index + 1, 0.42);

    specs.push({
      id: `${planet.id}:moon-${index + 1}`,
      name: `${planet.name}_M${String(index + 1).padStart(2, "0")}`,
      index,
      seed: moonSeed,
      radius: moonRadius,
      stretchX,
      stretchY,
      stretchZ,
      stretchMax,
      orbitRadius,
      angle: seededRange(seed, index * 19 + 7, 0, Math.PI * 2),
      speed,
      inclinationX: seededRange(seed, index * 19 + 8, -0.16, 0.16),
      inclinationZ: seededRange(seed, index * 19 + 9, -0.11, 0.11),
      rotationSpeed: rotationDirection * seededRange(seed, index * 19 + 10, 0.22, 0.7),
      rotation: new THREE.Vector3(
        seededRange(seed, index * 19 + 11, 0, Math.PI * 2),
        seededRange(seed, index * 19 + 12, 0, Math.PI * 2),
        seededRange(seed, index * 19 + 13, 0, Math.PI * 2)
      ),
      craterScale: seededRange(seed, index * 19 + 14, 2.4, 6.5),
      craterDepth: seededRange(seed, index * 19 + 15, 0.45, 1.05),
      fineCraters: seededRange(seed, index * 19 + 16, 0.25, 0.9),
      batteredness: seededRange(seed, index * 19 + 17, 0.55, 1.4),
      broadRises: seededRange(seed, index * 19 + 18, 0.05, 0.55),
      colorContrast: seededRange(seed, index * 19 + 20, 0.9, 1.25),
      brightness: seededRange(seed, index * 19 + 21, 0.74, 1.08),
      dustAmount: seededRange(seed, index * 19 + 22, 0.25, 0.75),
      baseColor: [grey + warm, grey, grey - warm],
      accentColor: [Math.min(1, grey + 0.24), Math.min(1, grey + 0.23), Math.min(1, grey + 0.21)]
    });
  }

  return specs;
}

function hashLandingSeed(planetId, sectorId) {
  const source = `${planetId}:${sectorId}`;
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSpaceMaterial() {
  return new StarNestSpaceMaterial();
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


function getRenderedRingRadii(planet, radius) {
  const ring = planet.visual?.ring ?? {};
  const scale = Math.max(0.0001, ring.systemScale ?? 1.0);
  const innerRadius = radius * Math.max(1.01, ring.innerRadius ?? 1.35) * scale;
  const outerRadius = Math.max(
    innerRadius + radius * 0.05,
    radius * Math.max(1.02, ring.outerRadius ?? 2.35) * scale
  );

  return { innerRadius, outerRadius };
}

function isOptionsMenuOpen() {
  return document.body.classList.contains("is-options-menu-open");
}

function getVisiblePlanetCount(system) {
  const rawCount = system?.summary?.planetCount;

  if (rawCount !== null && rawCount !== undefined && rawCount !== "") {
    const configuredCount = Number(rawCount);

    if (Number.isFinite(configuredCount)) {
      return Math.max(1, Math.min(MAX_SYSTEM_PLANETS, Math.round(configuredCount)));
    }
  }

  const sourcePlanetCount = Array.isArray(system?.planets)
    ? system.planets.filter(Boolean).length
    : 0;

  if (sourcePlanetCount > 0 && sourcePlanetCount < MAX_SYSTEM_PLANETS) {
    return Math.max(1, Math.min(MAX_SYSTEM_PLANETS, Math.round(sourcePlanetCount)));
  }

  // Pool-normalized systems always have MAX_SYSTEM_PLANETS config slots.
  // If no explicit count exists yet, keep the historical/default visible count.
  return Math.min(4, MAX_SYSTEM_PLANETS);
}

function getSystemStructureSignature(system) {
  // Persistent renderer pool: a different active system should rebind the
  // existing slots instead of triggering dispose + rebuild. Count changes and
  // planet ids therefore do not belong in the structure signature anymore.
  // Hard rebuilds are reserved for actual renderer-topology changes.
  return `system-pool-v2:${MAX_SYSTEM_PLANETS}:${MAX_PLANET_MOONS}`;
}

function getOrbitSafeRadius(bodyInfo) {
  const radius = Number(bodyInfo?.radius);
  return Number.isFinite(radius) && radius > 0 ? radius : 1;
}

function getOrbitMinDistance(bodyInfo) {
  const radius = getOrbitSafeRadius(bodyInfo);

  return Math.max(
    radius * ORBIT_VIEW.minDistanceMultiplier,
    radius + ORBIT_VIEW.minDistancePadding
  );
}

function getOrbitMaxDistance(bodyInfo) {
  const radius = getOrbitSafeRadius(bodyInfo);
  const minDistance = getOrbitMinDistance(bodyInfo);

  return Math.min(
    ORBIT_VIEW.absoluteMaxDistance,
    Math.max(
      minDistance * 1.5,
      radius * ORBIT_VIEW.maxDistanceMultiplier
    )
  );
}

function getOrbitDefaultDistance(bodyInfo) {
  const radius = getOrbitSafeRadius(bodyInfo);
  const multiplier = bodyInfo?.type === "star"
    ? ORBIT_VIEW.starDistanceMultiplier
    : ORBIT_VIEW.planetDistanceMultiplier;

  return clamp(
    radius * multiplier,
    getOrbitMinDistance(bodyInfo),
    getOrbitMaxDistance(bodyInfo)
  );
}

function orbitDirectionFromAngles(
  yaw,
  pitch,
  target = new THREE.Vector3(),
  euler = new THREE.Euler(0, 0, 0, "YXZ")
) {
  euler.set(pitch, yaw, 0, "YXZ");

  return target
    .set(0, 0, 1)
    .applyEuler(euler)
    .normalize();
}

function orbitUpFromAngles(
  yaw,
  pitch,
  target = new THREE.Vector3(),
  euler = new THREE.Euler(0, 0, 0, "YXZ")
) {
  euler.set(pitch, yaw, 0, "YXZ");

  return target
    .set(0, 1, 0)
    .applyEuler(euler)
    .normalize();
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed, salt) {
  let value = (seed + Math.imul(salt + 1, 374761393)) >>> 0;

  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;

  return ((value >>> 0) % 100000) / 100000;
}

function seededRange(seed, salt, min, max) {
  return min + (max - min) * seededRandom(seed, salt);
}

function smoothstep(edge0, edge1, value) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value) {
  if (value < 0.5) {
    return 4 * value * value * value;
  }

  return 1 - Math.pow(-2 * value + 2, 3) * 0.5;
}

function getIdleStartSeconds(displayConfig) {
  return Math.max(1, Number(displayConfig.idleStartSeconds ?? displayConfig.idleDelaySeconds ?? 5));
}

function getIdleDurationSeconds(displayConfig) {
  return Math.max(1, Number(displayConfig.idleDurationSeconds ?? displayConfig.idleDelaySeconds ?? 5));
}
