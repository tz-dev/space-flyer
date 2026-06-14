import * as THREE from "three";
import { clamp } from "../core/math.js";
import { normalizeDisplayConfig } from "../core/configSchema.js";
import {
  areStarMapSectorsEqual,
  createStarMapGridLinePositions,
  createStarMapSectorBounds,
  createStarMapSectorLinePositions,
  getStarMapSectorForPosition,
  getStarMapSectorKey
} from "../core/starMapSectors.js";
import { SpaceBackgroundMaterial } from "../materials/SpaceBackgroundMaterial.js";
import { StarPointMaterial } from "../materials/StarPointMaterial.js";

const STAR_MAP_LIMITS = {
  minZoom: 0.3,
  maxZoom: 8.0,
  dragSensitivity: 0.006,
  wheelSensitivity: 0.0015,
  hoverRadiusPx: 9,
  selectRadiusPx: 14
};

const FOCUS_LERP_SPEED = 6.5;
const STAR_MAP_ROTATION_SMOOTHING_SPEED = 4.0;
const STAR_MAP_ZOOM_SMOOTHING_SPEED = 10.0;
const STAR_MAP_IDLE_ROTATION_SPEED = 0.035;
const STAR_MAP_IDLE_MOVE_DURATION = 1.15;
const STAR_MAP_IDLE_BLINK_DURATION = 0.75;
const STAR_MAP_IDLE_FOCUS_ZOOM = 2.05;
const STAR_MAP_IDLE_DEEP_ZOOM = 4.65;
const STAR_MAP_IDLE_ZOOM_SETTLE_SECONDS = 0.85;
const STAR_MAP_MANUAL_FOCUS_ZOOM = 2.05;
const TRAVEL_ZOOM_MULTIPLIER = 42;
const STAR_MAP_BACKGROUND_RADIUS = 12000;

export class StarMapView {
  constructor({ canvas, renderer, galaxyConfig, store }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 30000);
    this.camera.position.set(0, 0, 210);
    this.scene.add(this.camera);

    this.galaxyRoot = new THREE.Group();
    this.galaxyRoot.name = "Galaxy Pivot Root";
    this.scene.add(this.galaxyRoot);

    this.systemIdByIndex = [];
    this.systemById = new Map();

    this.pointer = {
      x: 0,
      y: 0,
      lastX: 0,
      lastY: 0,
      downX: 0,
      downY: 0,
      isDown: false,
      moved: false
    };

    this.ndcPointer = new THREE.Vector2();

    const initialStarMap = this.store.getState().starMap;
    this.smoothedYaw = initialStarMap.yaw ?? 0;
    this.smoothedPitch = initialStarMap.pitch ?? 0;
    this.smoothedZoom = initialStarMap.zoom ?? 1.0;
    this.lastInputAt = performance.now() * 0.001;
    this.cameraWorldQuaternion = new THREE.Quaternion();

    this.focusSystemPosition = new THREE.Vector3();
    this.targetFocusSystemPosition = new THREE.Vector3();
    this.rotatedFocusOffset = new THREE.Vector3();
    this.markerWorldPosition = new THREE.Vector3();
    this.markerLocalPosition = new THREE.Vector3();
    this.markerStartLocalPosition = new THREE.Vector3();
    this.markerTargetLocalPosition = new THREE.Vector3();
    this.markerProjectedPosition = new THREE.Vector3();

    this.pickWorldPosition = new THREE.Vector3();
    this.pickProjectedPosition = new THREE.Vector3();

    this.previousSelectedSystemId = null;
    this.lastMarkerScreenKey = "";

    this.sectorBounds = createStarMapSectorBounds(this.galaxyConfig.systems);
    this.lastHoverSectorKey = "";
    this.lastActiveSectorKey = "";
    this.lastVisitedRouteKey = "";
    this.lastConfigRevision = this.store.getState().configRevision ?? 0;

    this.idlePreview = {
      phase: "off",
      phaseStartedAt: 0,
      targetSystemId: null,
      markerInitialized: false,
      lastZoomValue: 0
    };

    this.createBackground();
    this.createSystemPoints();
    this.createSectorGrid();
    this.createVisitedRouteLine();
    this.createMarkers();
    this.bindInput();
  }


  syncGalaxyGeometryIfNeeded() {
    const configRevision = this.store.getState().configRevision ?? 0;

    if (configRevision === this.lastConfigRevision) {
      return;
    }

    this.lastConfigRevision = configRevision;
    this.rebuildGalaxyGeometry();
  }

  rebuildGalaxyGeometry() {
    if (this.systemPoints) {
      this.galaxyRoot.remove(this.systemPoints);
      this.systemPoints.geometry?.dispose?.();
      this.systemPoints.material?.dispose?.();
    }

    this.systemIdByIndex = [];
    this.systemById = new Map();
    this.sectorBounds = createStarMapSectorBounds(this.galaxyConfig.systems);
    this.createSystemPoints();

    if (this.sectorBaseGrid) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(createStarMapGridLinePositions(this.sectorBounds), 3)
      );
      this.sectorBaseGrid.geometry?.dispose?.();
      this.sectorBaseGrid.geometry = geometry;
    }

    if (this.sectorHoverGrid) {
      this.sectorHoverGrid.geometry?.dispose?.();
      this.sectorHoverGrid.geometry = new THREE.BufferGeometry();
      this.sectorHoverGrid.visible = false;
    }

    if (this.sectorActiveGrid) {
      this.sectorActiveGrid.geometry?.dispose?.();
      this.sectorActiveGrid.geometry = new THREE.BufferGeometry();
      this.sectorActiveGrid.visible = false;
    }

    this.lastHoverSectorKey = "";
    this.lastActiveSectorKey = "";
    this.lastVisitedRouteKey = "";
    this.targetFocusSystemPosition.set(0, 0, 0);
  }

  createBackground() {
    const geometry = new THREE.SphereGeometry(STAR_MAP_BACKGROUND_RADIUS, 64, 40);
    const material = new SpaceBackgroundMaterial();

    const background = new THREE.Mesh(geometry, material);
    background.name = "Space Background";
    background.frustumCulled = false;
    background.scale.setScalar(-1);

    this.backgroundMaterial = material;
    this.scene.add(background);
  }

  createSystemPoints() {
    const positions = [];
    const colors = [];
    const sizes = [];

    for (const system of this.galaxyConfig.systems) {
      positions.push(...system.position);
      colors.push(...system.color);
      sizes.push(system.size);

      this.systemIdByIndex.push(system.id);
      this.systemById.set(system.id, system);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(colors, 3)
    );

    geometry.setAttribute(
      "aSize",
      new THREE.Float32BufferAttribute(sizes, 1)
    );

    const material = new StarPointMaterial();

    this.systemPoints = new THREE.Points(geometry, material);
    this.systemPoints.name = "Galaxy Systems";

    this.galaxyRoot.add(this.systemPoints);
  }

  createSectorGrid() {
    const baseGeometry = new THREE.BufferGeometry();
    baseGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(createStarMapGridLinePositions(this.sectorBounds), 3)
    );

    this.sectorBaseGrid = new THREE.LineSegments(
      baseGeometry,
      new THREE.LineBasicMaterial({
        color: 0x7ec8ff,
        transparent: true,
        opacity: 0.10,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.sectorBaseGrid.name = "Star Map Sector Grid";

    this.sectorHoverGrid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x9ec8ff,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.sectorHoverGrid.name = "Star Map Hover Sector";
    this.sectorHoverGrid.visible = false;

    this.sectorActiveGrid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0xffd37a,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.sectorActiveGrid.name = "Star Map Active Sector";
    this.sectorActiveGrid.visible = false;

    this.galaxyRoot.add(this.sectorBaseGrid);
    this.galaxyRoot.add(this.sectorHoverGrid);
    this.galaxyRoot.add(this.sectorActiveGrid);
  }

  createVisitedRouteLine() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));

    const material = new THREE.LineBasicMaterial({
      color: 0xffd37a,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });

    this.visitedRouteLine = new THREE.Line(geometry, material);
    this.visitedRouteLine.name = "Visited System Route Lines";
    this.visitedRouteLine.visible = false;
    this.galaxyRoot.add(this.visitedRouteLine);
  }

  createMarkers() {
    const hoverGeometry = new THREE.RingGeometry(1.42, 1.58, 64);
    const selectGeometry = new THREE.RingGeometry(1.72, 1.9, 80);

    this.hoverMarker = new THREE.Mesh(
      hoverGeometry,
      new THREE.MeshBasicMaterial({
        color: 0x9ec8ff,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );

    this.selectionMarker = new THREE.Mesh(
      selectGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffd37a,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      })
    );

    this.hoverMarker.visible = false;
    this.selectionMarker.visible = false;

    this.scene.add(this.hoverMarker);
    this.scene.add(this.selectionMarker);
  }

  bindInput() {
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("keydown", this.handleKeyDown);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  destroy() {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointermove", this.handlePointerMove);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("keydown", this.handleKeyDown);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);

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

  handlePointerDown(event) {
    if (this.store.getState().activeView !== "star-map" || isOptionsMenuOpen()) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    if (this.store.getState().transition.type !== "idle") {
      return;
    }

    this.canvas.setPointerCapture?.(event.pointerId);
    this.cancelIdlePreview();
    this.markInputActivity();

    this.pointer.isDown = true;
    this.pointer.moved = false;

    this.pointer.lastX = event.clientX;
    this.pointer.lastY = event.clientY;
    this.pointer.downX = event.clientX;
    this.pointer.downY = event.clientY;

    this.store.setStarMapState({
      yaw: this.smoothedYaw,
      pitch: this.smoothedPitch,
      pointerDown: true
    });
  }

  handlePointerMove(event) {
    if (this.store.getState().activeView !== "star-map" || isOptionsMenuOpen()) {
      return;
    }

    if (!this.pointer.isDown && event.target !== this.canvas) {
      return;
    }

    this.pointer.x = event.clientX;
    this.pointer.y = event.clientY;

    if (this.pointer.isDown) {
      const deltaX = event.clientX - this.pointer.lastX;
      const deltaY = event.clientY - this.pointer.lastY;

      const dragDistance = Math.hypot(
        event.clientX - this.pointer.downX,
        event.clientY - this.pointer.downY
      );

      if (dragDistance > 3) {
        this.pointer.moved = true;
      }

      this.markInputActivity();

      const { starMap } = this.store.getState();

      this.store.setStarMapState({
        yaw: starMap.yaw + deltaX * STAR_MAP_LIMITS.dragSensitivity,
        pitch: starMap.pitch + deltaY * STAR_MAP_LIMITS.dragSensitivity,
        selectionSource: starMap.selectionSource === "idle" ? null : starMap.selectionSource,
        infoVisible: starMap.selectionSource === "idle" ? false : starMap.infoVisible
      });

      this.pointer.lastX = event.clientX;
      this.pointer.lastY = event.clientY;

      return;
    }

    // Mouse move alone must not exit an active idle preview,
    // but it should count as activity before idle starts.
    if (this.idlePreview.phase === "off") {
      this.markInputActivity();
    }

    this.updateHoverFromPointer(event.clientX, event.clientY);
  }

  handlePointerUp(event) {
    if (!this.pointer.isDown) {
      return;
    }

    this.pointer.isDown = false;

    this.store.setStarMapState({
      pointerDown: false
    });

    if (!this.pointer.moved) {
      const selectedSystemId = this.pickSystemFromPointer(
        event.clientX,
        event.clientY,
        STAR_MAP_LIMITS.selectRadiusPx
      );

      if (selectedSystemId) {
        this.markInputActivity();
        this.store.setStarMapState({
          hoveredSystemId: selectedSystemId,
          selectedSystemId,
          selectionSource: "manual",
          infoVisible: true,
          zoom: STAR_MAP_MANUAL_FOCUS_ZOOM
        });
      } else {
        this.markInputActivity();
        this.store.setStarMapState({
          hoveredSystemId: null,
          selectedSystemId: null,
          selectionSource: null,
          infoVisible: false,
          yaw: 0,
          pitch: 0,
          zoom: 1
        });
      }
    }

    this.updateHoverFromPointer(event.clientX, event.clientY);
  }

  handlePointerLeave() {
    if (!this.pointer.isDown) {
      this.store.setStarMapState({
        hoveredSystemId: null
      });
    }
  }

  handleWheel(event) {
    if (this.store.getState().activeView !== "star-map" || isOptionsMenuOpen()) {
      return;
    }

    event.preventDefault();
    this.cancelIdlePreview();
    this.markInputActivity();

    if (this.store.getState().transition.type !== "idle") {
      return;
    }

    const { starMap } = this.store.getState();
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const scrollSpeed = clamp(Number(displayConfig.starMapScrollSpeed ?? 1), 0.1, 4);

    const nextZoom = clamp(
      starMap.zoom * Math.exp(-event.deltaY * STAR_MAP_LIMITS.wheelSensitivity * scrollSpeed),
      STAR_MAP_LIMITS.minZoom,
      STAR_MAP_LIMITS.maxZoom
    );

    this.store.setStarMapState({
      zoom: nextZoom,
      selectionSource: starMap.selectionSource === "idle" ? null : starMap.selectionSource,
      infoVisible: starMap.selectionSource === "idle" ? false : starMap.infoVisible
    });
  }

  handleKeyDown(event) {
    if (this.store.getState().activeView !== "star-map") {
      return;
    }

    if (isEditableTarget(event.target)) {
      return;
    }

    if (event.code === "Escape" || isOptionsMenuOpen()) {
      return;
    }

    this.cancelIdlePreview();
    this.markInputActivity();
  }

  markInputActivity() {
    this.lastInputAt = performance.now() * 0.001;
  }

  cancelIdlePreview() {
    if (this.idlePreview.phase === "off") {
      return;
    }

    this.resetIdlePreviewState();

    const { starMap } = this.store.getState();

    if (starMap.selectionSource === "idle") {
      this.store.setStarMapState({
        selectedSystemId: null,
        selectionSource: null,
        infoVisible: false,
        yaw: 0,
        pitch: 0,
        zoom: 1
      });
    }
  }

  resetIdlePreviewState() {
    this.idlePreview.phase = "off";
    this.idlePreview.targetSystemId = null;
    this.idlePreview.markerInitialized = false;
    this.idlePreview.lastZoomValue = 0;
  }

  updateHoverFromPointer(clientX, clientY) {
    const hoveredSystemId = this.pickSystemFromPointer(
      clientX,
      clientY,
      STAR_MAP_LIMITS.hoverRadiusPx
    );

    if (hoveredSystemId !== this.store.getState().starMap.hoveredSystemId) {
      this.store.setStarMapState({
        hoveredSystemId
      });
    }
  }

  pickSystemFromPointer(clientX, clientY, radiusPx) {
    const rect = this.canvas.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const radiusSq = radiusPx * radiusPx;

    const positionAttribute = this.systemPoints.geometry.getAttribute("position");

    this.galaxyRoot.updateWorldMatrix(true, true);
    this.systemPoints.updateWorldMatrix(true, false);

    let bestSystemId = null;
    let bestScore = Infinity;

    for (let index = 0; index < positionAttribute.count; index += 1) {
      this.pickWorldPosition
        .fromBufferAttribute(positionAttribute, index)
        .applyMatrix4(this.systemPoints.matrixWorld);

      this.pickProjectedPosition.copy(this.pickWorldPosition).project(this.camera);

      if (
        this.pickProjectedPosition.z < -1 ||
        this.pickProjectedPosition.z > 1
      ) {
        continue;
      }

      const screenX = (this.pickProjectedPosition.x * 0.5 + 0.5) * rect.width;
      const screenY = (-this.pickProjectedPosition.y * 0.5 + 0.5) * rect.height;

      const deltaX = screenX - pointerX;
      const deltaY = screenY - pointerY;
      const distanceSq = deltaX * deltaX + deltaY * deltaY;

      if (distanceSq > radiusSq) {
        continue;
      }

      const depthBias = this.pickProjectedPosition.z * 0.001;
      const score = distanceSq + depthBias;

      if (score < bestScore) {
        bestScore = score;
        bestSystemId = this.systemIdByIndex[index] ?? null;
      }
    }

    return bestSystemId;
  }

  update({ deltaTime, elapsedTime }) {
    this.syncGalaxyGeometryIfNeeded();
    this.updateIdlePreview(deltaTime);

    const { starMap } = this.store.getState();

    this.updateFocusTarget(starMap.selectedSystemId);

    const focusLerpAlpha = 1 - Math.exp(-FOCUS_LERP_SPEED * deltaTime);
    this.focusSystemPosition.lerp(this.targetFocusSystemPosition, focusLerpAlpha);

    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const nowSeconds = performance.now() * 0.001;
    const isIdleCameraActive =
      displayConfig.idleCamsEnabled &&
      this.store.getState().activeView === "star-map" &&
      this.store.getState().transition.type === "idle" &&
      !this.pointer.isDown &&
      nowSeconds - this.lastInputAt >= getIdleStartSeconds(displayConfig) &&
      this.idlePreview.phase !== "moving";

    if (isIdleCameraActive) {
      this.smoothedYaw += STAR_MAP_IDLE_ROTATION_SPEED * deltaTime;
    } else if (displayConfig.starMapRotationInertia) {
      const rotationAlpha = 1 - Math.exp(STAR_MAP_ROTATION_SMOOTHING_SPEED * -Math.max(0, deltaTime));
      this.smoothedYaw += (starMap.yaw - this.smoothedYaw) * rotationAlpha;
      this.smoothedPitch += (starMap.pitch - this.smoothedPitch) * rotationAlpha;
    } else {
      this.smoothedYaw = starMap.yaw;
      this.smoothedPitch = starMap.pitch;
    }

    this.galaxyRoot.rotation.order = "YXZ";
    this.galaxyRoot.rotation.y = this.smoothedYaw;
    this.galaxyRoot.rotation.x = this.smoothedPitch;

    this.rotatedFocusOffset
      .copy(this.focusSystemPosition)
      .applyEuler(this.galaxyRoot.rotation);

    this.galaxyRoot.position.copy(this.rotatedFocusOffset).multiplyScalar(-1);

    const zoomAlpha = 1 - Math.exp(-STAR_MAP_ZOOM_SMOOTHING_SPEED * Math.max(0, deltaTime));
    this.smoothedZoom += (starMap.zoom - this.smoothedZoom) * zoomAlpha;

    const transitionZoom = this.getTravelZoomMultiplier();
    const zoomDistance = 210 / (this.smoothedZoom * transitionZoom);

    this.camera.position.set(0, 0, zoomDistance);

    if (this.backgroundMaterial) {
      const now = new Date();
      const secondsOfDay =
        now.getHours() * 3600 +
        now.getMinutes() * 60 +
        now.getSeconds() +
        now.getMilliseconds() * 0.001;

      const resolution = this.backgroundMaterial.uniforms.uResolution.value;

      this.backgroundMaterial.uniforms.uTime.value = elapsedTime;
      this.backgroundMaterial.uniforms.uMouse.value.set(
        resolution.x * (0.5 + this.smoothedYaw / 3.0),
        resolution.y * (0.5 + (this.smoothedPitch + 2.0) / 3.0),
        1.0,
        0.0
      );
      this.backgroundMaterial.uniforms.uDate.value.set(
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
        secondsOfDay
      );
    }

    this.updateSectorGrid(starMap);
    this.updateVisitedRouteLine();

    this.updateMarker(this.hoverMarker, starMap.hoveredSystemId, 1.0, { isSelection: false });
    this.updateMarker(this.selectionMarker, starMap.selectedSystemId, 1.18, { isSelection: true });

    this.camera.getWorldQuaternion(this.cameraWorldQuaternion);
    this.hoverMarker.quaternion.copy(this.cameraWorldQuaternion);
    this.selectionMarker.quaternion.copy(this.cameraWorldQuaternion);

    this.updateMarkerScreenState();
  }

  updateIdlePreview() {
    const state = this.store.getState();
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const now = performance.now() * 0.001;

    if (state.activeView !== "star-map" || state.transition.type !== "idle") {
      this.resetIdlePreviewState();
      return;
    }

    if (
      !displayConfig.idleCamsEnabled ||
      isOptionsMenuOpen() ||
      this.pointer.isDown
    ) {
      if (!displayConfig.idleCamsEnabled && state.starMap.selectionSource === "idle") {
        this.cancelIdlePreview();
      }
      return;
    }

    if (this.idlePreview.phase === "off") {
      if (
        !displayConfig.starMapIdleAutoSelect ||
        state.starMap.selectedSystemId ||
        now - this.lastInputAt < getIdleStartSeconds(displayConfig)
      ) {
        return;
      }

      this.beginIdleBlink(this.pickRandomSystemId(null), { jump: true });
      return;
    }

    if (this.idlePreview.phase === "blinking") {
      if (now - this.idlePreview.phaseStartedAt >= STAR_MAP_IDLE_BLINK_DURATION) {
        this.idlePreview.phase = "showing";
        this.idlePreview.phaseStartedAt = now;
        this.store.setStarMapState({
          selectedSystemId: this.idlePreview.targetSystemId,
          selectionSource: "idle",
          infoVisible: true,
          zoom: STAR_MAP_IDLE_FOCUS_ZOOM
        });
        this.idlePreview.lastZoomValue = STAR_MAP_IDLE_FOCUS_ZOOM;
      }
      return;
    }

    if (this.idlePreview.phase === "showing") {
      const elapsed = now - this.idlePreview.phaseStartedAt;
      const idleDurationSeconds = getIdleDurationSeconds(displayConfig);
      const zoomElapsed = Math.max(0, elapsed - STAR_MAP_IDLE_ZOOM_SETTLE_SECONDS);
      const zoomDuration = Math.max(0.001, idleDurationSeconds - STAR_MAP_IDLE_ZOOM_SETTLE_SECONDS);
      const zoomProgress = clamp(zoomElapsed / zoomDuration, 0, 1);
      const nextZoom = STAR_MAP_IDLE_FOCUS_ZOOM +
        (STAR_MAP_IDLE_DEEP_ZOOM - STAR_MAP_IDLE_FOCUS_ZOOM) * smoothstep(0, 1, zoomProgress);

      if (Math.abs(nextZoom - this.idlePreview.lastZoomValue) > 0.006) {
        this.idlePreview.lastZoomValue = nextZoom;
        this.store.setStarMapState({
          zoom: nextZoom
        });
      }

      if (elapsed < idleDurationSeconds) {
        return;
      }

      const nextTargetId = this.pickRandomSystemId(this.idlePreview.targetSystemId);
      this.beginIdleMove(nextTargetId);
      return;
    }

    if (this.idlePreview.phase === "moving") {
      const progress = clamp(
        (now - this.idlePreview.phaseStartedAt) / STAR_MAP_IDLE_MOVE_DURATION,
        0,
        1
      );
      const eased = easeInOutCubic(progress);
      this.markerLocalPosition
        .copy(this.markerStartLocalPosition)
        .lerp(this.markerTargetLocalPosition, eased);

      if (progress >= 1) {
        this.beginIdleBlink(this.idlePreview.targetSystemId, { jump: false });
      }
    }
  }

  beginIdleBlink(systemId, { jump = false } = {}) {
    if (!systemId) {
      return;
    }

    const system = this.systemById.get(systemId);

    if (!system) {
      return;
    }

    if (jump || !this.idlePreview.markerInitialized) {
      this.markerLocalPosition.fromArray(system.position);
      this.idlePreview.markerInitialized = true;
    }

    this.idlePreview.phase = "blinking";
    this.idlePreview.phaseStartedAt = performance.now() * 0.001;
    this.idlePreview.targetSystemId = systemId;
    this.idlePreview.lastZoomValue = STAR_MAP_IDLE_FOCUS_ZOOM;

    this.store.setStarMapState({
      selectedSystemId: systemId,
      selectionSource: "idle",
      infoVisible: false,
      hoveredSystemId: null
    });
  }

  beginIdleMove(nextTargetId) {
    const nextSystem = this.systemById.get(nextTargetId);

    if (!nextSystem) {
      return;
    }

    this.idlePreview.phase = "moving";
    this.idlePreview.phaseStartedAt = performance.now() * 0.001;
    this.idlePreview.targetSystemId = nextTargetId;
    this.markerStartLocalPosition.copy(this.markerLocalPosition);
    this.markerTargetLocalPosition.fromArray(nextSystem.position);

    this.store.setStarMapState({
      selectedSystemId: null,
      selectionSource: "idle",
      infoVisible: false,
      hoveredSystemId: null,
      yaw: 0,
      pitch: 0,
      zoom: 1
    });
    this.idlePreview.lastZoomValue = 1;
  }

  pickRandomSystemId(excludeSystemId) {
    const systems = this.galaxyConfig.systems.filter((system) => system?.id && system.id !== excludeSystemId);

    if (systems.length === 0) {
      return excludeSystemId ?? null;
    }

    const index = Math.floor(Math.random() * systems.length);
    return systems[index]?.id ?? null;
  }

  getTravelZoomMultiplier() {
    const { transition } = this.store.getState();

    if (
      transition.type !== "star-map-to-system" &&
      transition.type !== "star-map-return-to-system" &&
      transition.type !== "system-to-star-map"
    ) {
      return 1;
    }

    const now = performance.now() * 0.001;
    const elapsed = now - transition.startedAt;

    if (transition.type === "system-to-star-map") {
      if (!transition.revealed) {
        return 1 + TRAVEL_ZOOM_MULTIPLIER;
      }

      const zoomOutProgress = smoothstep(0.62, transition.duration || 1.55, elapsed);
      return 1 + (1 - zoomOutProgress) * TRAVEL_ZOOM_MULTIPLIER;
    }

    const zoomInDuration =
      transition.type === "star-map-return-to-system" ? 0.62 : 0.7;

    const zoomInProgress = smoothstep(0.0, zoomInDuration, elapsed);

    return 1 + zoomInProgress * TRAVEL_ZOOM_MULTIPLIER;
  }

  updateFocusTarget(selectedSystemId) {
    if (selectedSystemId === this.previousSelectedSystemId) {
      return;
    }

    this.previousSelectedSystemId = selectedSystemId;

    const selectedSystem = this.systemById.get(selectedSystemId);

    if (!selectedSystem) {
      this.targetFocusSystemPosition.set(0, 0, 0);
      return;
    }

    this.targetFocusSystemPosition.fromArray(selectedSystem.position);
  }

  updateMarker(marker, systemId, scale, { isSelection = false } = {}) {
    let system = this.systemById.get(systemId);
    let useCustomMarkerPosition = false;

    const state = this.store.getState();

    if (
      isSelection &&
      state.starMap.selectionSource === "idle" &&
      this.idlePreview.phase === "moving"
    ) {
      system = this.systemById.get(this.idlePreview.targetSystemId);
      useCustomMarkerPosition = true;
    }

    if (!system) {
      marker.visible = false;
      return;
    }

    marker.visible = true;

    if (useCustomMarkerPosition) {
      this.markerWorldPosition
        .copy(this.markerLocalPosition)
        .applyEuler(this.galaxyRoot.rotation)
        .add(this.galaxyRoot.position);
    } else {
      this.markerWorldPosition
        .fromArray(system.position)
        .applyEuler(this.galaxyRoot.rotation)
        .add(this.galaxyRoot.position);

      if (isSelection) {
        this.markerLocalPosition.fromArray(system.position);
        this.idlePreview.markerInitialized = true;
      }
    }

    marker.position.copy(this.markerWorldPosition);

    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    let markerScale = Math.max(1.25, system.size * 2.15) * scale;

    if (isSelection) {
      const glow = clamp(Number(displayConfig.markerGlow ?? 1), 0, 3);
      markerScale *= 1 + glow * 0.16;

      if (marker.material?.color) {
        marker.material.color.set(displayConfig.markerColor ?? "#ffd37a");
      }

      marker.material.opacity = this.getSelectionMarkerFlash() * clamp(
        Number(displayConfig.markerOpacity ?? 0.82),
        0,
        1
      );
    }

    marker.scale.setScalar(markerScale);
  }

  getSelectionMarkerFlash() {
    if (
      this.store.getState().starMap.selectionSource !== "idle" ||
      this.idlePreview.phase !== "blinking"
    ) {
      return 1.0;
    }

    const elapsed = performance.now() * 0.001 - this.idlePreview.phaseStartedAt;
    const flash = Math.sin(elapsed / STAR_MAP_IDLE_BLINK_DURATION * Math.PI * 6.0);
    return flash > 0 ? 1.0 : 0.16;
  }

  updateSectorGrid(starMap) {
    const hoverSystem = this.systemById.get(starMap.hoveredSystemId);
    const activeSystem = this.systemById.get(starMap.selectedSystemId);
    const hoverSector = hoverSystem
      ? getStarMapSectorForPosition(hoverSystem.position, this.sectorBounds)
      : null;
    const activeSector = activeSystem
      ? getStarMapSectorForPosition(activeSystem.position, this.sectorBounds)
      : null;

    const activeKey = getStarMapSectorKey(activeSector);
    const hoverKey = areStarMapSectorsEqual(hoverSector, activeSector)
      ? ""
      : getStarMapSectorKey(hoverSector);

    if (activeKey !== this.lastActiveSectorKey) {
      this.lastActiveSectorKey = activeKey;
      updateLineSegmentsForSector(this.sectorActiveGrid, this.sectorBounds, activeSector);
    }

    if (hoverKey !== this.lastHoverSectorKey) {
      this.lastHoverSectorKey = hoverKey;
      updateLineSegmentsForSector(this.sectorHoverGrid, this.sectorBounds, hoverKey ? hoverSector : null);
    }

    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const sectorVisible = Boolean(displayConfig.sectorGridEnabled ?? true);
    const baseColor = displayConfig.mapColor ?? "#7ec8ff";

    if (this.sectorBaseGrid?.material) {
      this.sectorBaseGrid.visible = sectorVisible;
      this.sectorBaseGrid.material.color.set(baseColor);
      this.sectorBaseGrid.material.opacity = clamp(Number(displayConfig.sectorGridOpacity ?? 0.10), 0, 0.6);
    }

    if (this.sectorHoverGrid?.material) {
      this.sectorHoverGrid.visible = sectorVisible && Boolean(hoverKey);
      this.sectorHoverGrid.material.color.set(baseColor);
      this.sectorHoverGrid.material.opacity = clamp(Number(displayConfig.sectorHoverStrength ?? 0.28), 0, 1.0);
    }

    if (this.sectorActiveGrid?.material?.color) {
      const flash = this.getSelectionMarkerFlash();
      const isIdleBlink = stateIsIdleBlinking(this.store.getState(), this.idlePreview);
      this.sectorActiveGrid.visible = sectorVisible && Boolean(activeKey);
      this.sectorActiveGrid.material.color.set(displayConfig.markerColor ?? baseColor);
      this.sectorActiveGrid.material.opacity = clamp(
        Number(displayConfig.sectorActiveStrength ?? 0.62),
        0,
        1.5
      ) * (isIdleBlink ? flash : 1);
    }
  }

  updateVisitedRouteLine() {
    if (!this.visitedRouteLine) {
      return;
    }

    const state = this.store.getState();
    const starLog = state.starLog ?? {};
    const visitedIds = Array.isArray(starLog.visitedSystemIds)
      ? starLog.visitedSystemIds
      : [];
    const showRoute = Boolean(starLog.showVisitedConnections);
    const routeKey = `${showRoute ? 1 : 0}:${visitedIds.join(",")}`;

    if (routeKey !== this.lastVisitedRouteKey) {
      this.lastVisitedRouteKey = routeKey;
      const positions = [];

      if (showRoute && visitedIds.length >= 2) {
        for (const systemId of visitedIds) {
          const system = this.systemById.get(systemId);

          if (!system?.position) {
            continue;
          }

          positions.push(...system.position);
        }
      }

      this.visitedRouteLine.geometry.dispose();
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3)
      );
      this.visitedRouteLine.geometry = geometry;
      this.visitedRouteLine.visible = showRoute && positions.length >= 6;
    }

    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});

    if (this.visitedRouteLine.material?.color) {
      this.visitedRouteLine.material.color.set(displayConfig.markerColor ?? "#ffd37a");
      this.visitedRouteLine.material.opacity = clamp(
        Number(displayConfig.markerOpacity ?? 0.82) * 0.52,
        0.12,
        0.72
      );
    }
  }

  updateMarkerScreenState() {
    const visible = this.selectionMarker.visible;
    let screenX = 0;
    let screenY = 0;

    if (visible) {
      const rect = this.canvas.getBoundingClientRect();
      this.markerProjectedPosition.copy(this.selectionMarker.position).project(this.camera);
      screenX = rect.left + (this.markerProjectedPosition.x * 0.5 + 0.5) * rect.width;
      screenY = rect.top + (-this.markerProjectedPosition.y * 0.5 + 0.5) * rect.height;
    }

    const key = `${visible ? 1 : 0}:${Math.round(screenX / 2)}:${Math.round(screenY / 2)}`;

    if (key === this.lastMarkerScreenKey) {
      return;
    }

    this.lastMarkerScreenKey = key;
    this.store.setStarMapState({
      markerScreenX: screenX,
      markerScreenY: screenY,
      markerScreenVisible: visible
    });
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

    if (this.systemPoints?.material?.uniforms?.uPixelRatio) {
      this.systemPoints.material.uniforms.uPixelRatio.value = Math.min(
        window.devicePixelRatio,
        2
      );
    }
  }
}

function updateLineSegmentsForSector(lineSegments, bounds, sector) {
  if (!lineSegments) {
    return;
  }

  const positions = createStarMapSectorLinePositions(bounds, sector);
  lineSegments.visible = positions.length > 0;
  lineSegments.geometry.dispose();
  lineSegments.geometry = new THREE.BufferGeometry();

  if (positions.length > 0) {
    lineSegments.geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
  }
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}


function stateIsIdleBlinking(state, idlePreview) {
  return (
    state?.starMap?.selectionSource === "idle" &&
    idlePreview?.phase === "blinking"
  );
}

function isEditableTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  );
}


function isOptionsMenuOpen() {
  return document.body.classList.contains("is-options-menu-open");
}

function getIdleStartSeconds(displayConfig) {
  return Math.max(1, Number(displayConfig.idleStartSeconds ?? displayConfig.idleDelaySeconds ?? 5));
}

function getIdleDurationSeconds(displayConfig) {
  return Math.max(1, Number(displayConfig.idleDurationSeconds ?? displayConfig.idleDelaySeconds ?? 5));
}
