import * as THREE from "three";
import { WarpTunnelMaterial } from "../materials/WarpTunnelMaterial.js";
import { StarMapView } from "../views/StarMapView.js";
import {
  SystemView,
  preloadSurfaceTextures
} from "../views/SystemView.js";
import { TerrainView } from "../views/TerrainView.js";
import { StellarObjectView } from "../views/StellarObjectView.js";
import { STELLAR_OBJECT_ORDER } from "../core/stellarObjects.js";
import { StarNestSpaceMaterial } from "../materials/StarNestSpaceMaterial.js";
import { SunMaterial } from "../materials/SunMaterial.js";
import { SunHaloMaterial } from "../materials/SunHaloMaterial.js";
import { PlanetSurfaceMaterial } from "../materials/PlanetSurfaceMaterial.js";
import { PlanetRingMaterial, createPlanetRingDiskGeometry } from "../materials/PlanetRingMaterial.js";
import { SpaceBackgroundMaterial } from "../materials/SpaceBackgroundMaterial.js";
import { TerrainGroundMaterial } from "../materials/TerrainGroundMaterial.js";
import { TerrainSurfaceMaterial } from "../materials/TerrainSurfaceMaterial.js";
import { TERRAIN_SHADERS } from "../materials/terrain/terrainRegistry.js";
import { FinalCompositeMaterial } from "../materials/FinalCompositeMaterial.js";
import { FpsCounter } from "../ui/FpsCounter.js";
import { normalizeDisplayConfig, normalizeRenderConfig } from "../core/configSchema.js";

export class AppRenderer {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.clock = new THREE.Clock();
    this.fpsFrames = 0;
    this.fpsTimer = performance.now();


    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });

    this.renderer.domElement.classList.add("game-canvas");
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.autoClear = false;

    this.viewportWidth = window.innerWidth;
    this.viewportHeight = window.innerHeight;
    this.lastCanvasSizeKey = "";

    this.rootElement.appendChild(this.renderer.domElement);

    this.fpsCounter = new FpsCounter({
      rootElement: this.rootElement
    });

    this.bookmarkModeTransition = null;
    this.bookmarkLeaveButton = this.createBookmarkModeLeaveButton();
    this.bookmarkLeaveButtonVisible = false;
    this.bookmarkLeaveButtonTimeout = null;

    this.activeViewName = this.store.getState().activeView;

    this.transitionScene = new THREE.Scene();
    this.transitionCamera = new THREE.Camera();
    this.transitionMaterial = new WarpTunnelMaterial();

    this.transitionQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.transitionMaterial
    );

    this.transitionQuad.frustumCulled = false;
    this.transitionScene.add(this.transitionQuad);

    this.fadeScene = new THREE.Scene();
    this.fadeCamera = new THREE.Camera();
    this.fadeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false
    });

    this.fadeQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.fadeMaterial
    );

    this.fadeQuad.frustumCulled = false;
    this.fadeScene.add(this.fadeQuad);

    this.warmupTarget = new THREE.WebGLRenderTarget(8, 8, {
      depthBuffer: true,
      stencilBuffer: false
    });

    this.sceneTarget = new THREE.WebGLRenderTarget(8, 8, {
      depthBuffer: true,
      stencilBuffer: false
    });

    this.finalScene = new THREE.Scene();
    this.finalCamera = new THREE.Camera();
    this.finalCompositeMaterial = new FinalCompositeMaterial();
    this.finalCompositeMaterial.uniforms.tScene.value = this.sceneTarget.texture;

    this.finalQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.finalCompositeMaterial
    );

    this.finalQuad.frustumCulled = false;
    this.finalScene.add(this.finalQuad);

    this.lastRenderSettingsKey = "";
    this.adaptiveTerrain = {
      renderScale: 1.0,
      pixelation: 1.0,
      frameCounter: 0,
      stepTimer: 0,
      smoothedFps: 0,
      hasFpsSample: false,
      configKey: "",
      active: false
    };

    this.views = {
      "star-map": new StarMapView({
        canvas: this.renderer.domElement,
        renderer: this.renderer,
        galaxyConfig: this.galaxyConfig,
        store: this.store
      }),

      "system-view": new SystemView({
        canvas: this.renderer.domElement,
        renderer: this.renderer,
        galaxyConfig: this.galaxyConfig,
        store: this.store
      }),

      "terrain-view": new TerrainView({
        canvas: this.renderer.domElement,
        renderer: this.renderer,
        galaxyConfig: this.galaxyConfig,
        store: this.store
      }),

      "stellar-object-view": new StellarObjectView({
        canvas: this.renderer.domElement,
        renderer: this.renderer,
        galaxyConfig: this.galaxyConfig,
        store: this.store
      })
    };

    this.activeView = this.views[this.activeViewName];

    this.handleResize = this.handleResize.bind(this);
    this.handleGlobalKeyDown = this.handleGlobalKeyDown.bind(this);
    this.handleBookmarkModeActivity = this.handleBookmarkModeActivity.bind(this);
    this.handleBookmarkModeLeaveClick = this.handleBookmarkModeLeaveClick.bind(this);
    this.tick = this.tick.bind(this);

    this.unsubscribe = this.store.subscribe((state) => {
      if (state.activeView !== this.activeViewName) {
        this.switchView(state.activeView);
      }
    });

    this.bookmarkLeaveButton.addEventListener("click", this.handleBookmarkModeLeaveClick);
    window.addEventListener("resize", this.handleResize);
    window.addEventListener("keydown", this.handleGlobalKeyDown);
    window.addEventListener("keydown", this.handleBookmarkModeActivity, true);
    window.addEventListener("pointermove", this.handleBookmarkModeActivity, true);
    window.addEventListener("pointerdown", this.handleBookmarkModeActivity, true);
    this.handleResize();
  }

  async warmup({ onProgress } = {}) {
    const steps = createWarmupSteps(this);
    const total = steps.length;

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];

      onProgress?.({
        label: step.label,
        current: index,
        total
      });

      await nextFrame();
      await step.run();
    }

    onProgress?.({
      label: "Ready.",
      current: total,
      total
    });

    await nextFrame();
  }

  start() {
    this.clock.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  stop() {
    this.renderer.setAnimationLoop(null);
  }

  switchView(viewName) {
    this.activeView?.onDeactivate?.();

    this.activeViewName = viewName;
    this.activeView = this.views[viewName];

    this.handleResize();
    this.activeView?.onActivate?.();
  }

  tick() {
    const now = performance.now();
    const deltaTime = this.clock.getDelta();
    const elapsedTime = this.clock.elapsedTime;

    this.updateAdaptiveTerrainPerformance(deltaTime);
    this.applyRenderSettings();

    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.clear();

    this.activeView.update({
      deltaTime,
      elapsedTime
    });

    this.activeView.render();

    this.updateTransitionOverlay();
    this.updateBookmarkMode(deltaTime);

    if (this.transitionMaterial.uniforms.uOpacity.value > 0.001) {
      this.renderer.render(this.transitionScene, this.transitionCamera);
    }

    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.finalScene, this.finalCamera);

    if (this.fadeMaterial.opacity > 0.001) {
      this.renderer.render(this.fadeScene, this.fadeCamera);
    }

    this.activeView.renderHudOverlay?.();

    this.updateFpsCounter(now);
  }

  applyRenderSettings() {
    const renderConfig = this.galaxyConfig.render ?? {};
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    this.galaxyConfig.display = displayConfig;

    this.updateCanvasViewport();
    this.fpsCounter.setVisible(displayConfig.showFps);

    this.finalCompositeMaterial.uniforms.uPixelation.value = this.getEffectiveFinalPixelation(renderConfig);
    this.finalCompositeMaterial.uniforms.uBrightness.value = renderConfig.brightness ?? 1;
    this.finalCompositeMaterial.uniforms.uContrast.value = renderConfig.contrast ?? 1;
    this.finalCompositeMaterial.uniforms.uGamma.value = renderConfig.gamma ?? 1;
    this.finalCompositeMaterial.uniforms.uExposure.value = renderConfig.exposure ?? 1;

    const key = `${this.viewportWidth}:${this.viewportHeight}:${window.devicePixelRatio ?? 1}:${this.getEffectiveFinalPixelation(renderConfig)}`;

    if (key !== this.lastRenderSettingsKey) {
      this.lastRenderSettingsKey = key;
      this.updateSceneTargetSize();
    }
  }

  updateAdaptiveTerrainPerformance(deltaTime) {
    const renderConfig = normalizeRenderConfig(this.galaxyConfig.render ?? {});
    this.galaxyConfig.render = renderConfig;

    const config = renderConfig.adaptiveTerrain ?? {};
    const terrainView = this.views?.["terrain-view"];
    const active = this.activeViewName === "terrain-view" && config.enabled;
    const configKey = [
      config.enabled,
      config.targetFps,
      config.updateEveryFrames,
      config.renderScaleMin,
      config.renderScaleMax,
      config.pixelationEnabled,
      config.pixelationMin,
      config.pixelationMax
    ].join(":");

    if (!active) {
      this.adaptiveTerrain.active = false;
      this.adaptiveTerrain.frameCounter = 0;
      this.adaptiveTerrain.stepTimer = 0;
      this.adaptiveTerrain.smoothedFps = 0;
      this.adaptiveTerrain.hasFpsSample = false;
      this.adaptiveTerrain.renderScale = config.renderScaleMax ?? 1.0;
      this.adaptiveTerrain.pixelation = config.pixelationMin ?? 1.0;
      terrainView?.setTerrainPerformanceOverride?.(null);
      return;
    }

    if (!this.adaptiveTerrain.active || this.adaptiveTerrain.configKey !== configKey) {
      this.adaptiveTerrain.active = true;
      this.adaptiveTerrain.configKey = configKey;
      this.adaptiveTerrain.frameCounter = 0;
      this.adaptiveTerrain.stepTimer = 0;
      this.adaptiveTerrain.smoothedFps = 0;
      this.adaptiveTerrain.hasFpsSample = false;
      this.adaptiveTerrain.renderScale = config.renderScaleMax ?? 1.0;
      this.adaptiveTerrain.pixelation = config.pixelationMin ?? 1.0;
    }

    const safeDeltaTime = Number.isFinite(deltaTime)
      ? Math.max(0.00001, Math.min(deltaTime, 0.5))
      : 1 / 60;
    const frameFps = clamp(1.0 / safeDeltaTime, 1.0, 360.0);

    if (!this.adaptiveTerrain.hasFpsSample) {
      this.adaptiveTerrain.smoothedFps = frameFps;
      this.adaptiveTerrain.hasFpsSample = true;
    } else {
      this.adaptiveTerrain.smoothedFps = mixNumber(
        this.adaptiveTerrain.smoothedFps,
        frameFps,
        0.35
      );
    }

    this.adaptiveTerrain.frameCounter += 1;
    this.adaptiveTerrain.stepTimer += safeDeltaTime;

    const updateEveryFrames = Math.max(1, Math.round(config.updateEveryFrames ?? 5));
    const targetFps = Math.max(15, Math.min(240, Number(config.targetFps ?? 45)));
    const severeDeficit = this.adaptiveTerrain.smoothedFps < targetFps * 0.62;
    const frameDue = this.adaptiveTerrain.frameCounter >= updateEveryFrames;
    const timeDue = this.adaptiveTerrain.stepTimer >= (severeDeficit ? 0.12 : 0.22);

    if (frameDue || timeDue || (severeDeficit && this.adaptiveTerrain.frameCounter >= 1)) {
      this.adaptiveTerrain.frameCounter = 0;
      this.adaptiveTerrain.stepTimer = 0;
      this.stepAdaptiveTerrainQuality(config);
    }

    terrainView?.setTerrainPerformanceOverride?.({
      renderScale: this.adaptiveTerrain.renderScale,
      pixelation: this.adaptiveTerrain.pixelation
    });
  }

  stepAdaptiveTerrainQuality(config) {
    const targetFps = clamp(Number(config.targetFps ?? 45), 15, 240);
    const fps = clamp(this.adaptiveTerrain.smoothedFps || targetFps, 1, 360);
    const scaleMin = Math.min(config.renderScaleMin ?? 0.45, config.renderScaleMax ?? 1.0);
    const scaleMax = Math.max(config.renderScaleMin ?? 0.45, config.renderScaleMax ?? 1.0);
    const pixelMin = Math.min(config.pixelationMin ?? 1.0, config.pixelationMax ?? 3.0);
    const pixelMax = Math.max(config.pixelationMin ?? 1.0, config.pixelationMax ?? 3.0);
    const lowerBound = targetFps - 2.0;
    const upperBound = targetFps + 10.0;

    if (fps < lowerBound) {
      const ratio = clamp(fps / Math.max(1.0, targetFps), 0.06, 0.98);

      if (this.adaptiveTerrain.renderScale > scaleMin + 0.001) {
        const nextScale = this.adaptiveTerrain.renderScale * Math.sqrt(ratio) * 0.98;
        this.adaptiveTerrain.renderScale = clamp(nextScale, scaleMin, scaleMax);
        return;
      }

      if (config.pixelationEnabled && this.adaptiveTerrain.pixelation < pixelMax - 0.001) {
        const boost = clamp(Math.sqrt(targetFps / Math.max(1.0, fps)), 1.08, 1.85);
        this.adaptiveTerrain.pixelation = clamp(
          this.adaptiveTerrain.pixelation * boost,
          pixelMin,
          pixelMax
        );
      }

      return;
    }

    if (fps <= upperBound) {
      return;
    }

    if (config.pixelationEnabled && this.adaptiveTerrain.pixelation > pixelMin + 0.001) {
      this.adaptiveTerrain.pixelation = clamp(
        mixNumber(this.adaptiveTerrain.pixelation, pixelMin, 0.18),
        pixelMin,
        pixelMax
      );

      if (this.adaptiveTerrain.pixelation <= pixelMin + 0.015) {
        this.adaptiveTerrain.pixelation = pixelMin;
      }

      return;
    }

    if (this.adaptiveTerrain.renderScale < scaleMax - 0.001) {
      this.adaptiveTerrain.renderScale = clamp(
        mixNumber(this.adaptiveTerrain.renderScale, scaleMax, 0.10),
        scaleMin,
        scaleMax
      );

      if (this.adaptiveTerrain.renderScale >= scaleMax - 0.005) {
        this.adaptiveTerrain.renderScale = scaleMax;
      }
    }
  }

  getEffectiveFinalPixelation(renderConfig = this.galaxyConfig.render ?? {}) {
    if (this.activeViewName !== "terrain-view") {
      return 1.0;
    }

    if (this.adaptiveTerrain.active) {
      return this.adaptiveTerrain.pixelation;
    }

    return 1.0;
  }

  updateSceneTargetSize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.viewportWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.viewportHeight * pixelRatio));

    this.sceneTarget.setSize(width, height);
    this.finalCompositeMaterial.uniforms.uResolution.value.set(width, height);
  }

  updateCanvasViewport(force = false) {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = this.getCanvasViewportSize();
    const key = `${viewport.width}:${viewport.height}:${pixelRatio}`;

    if (!force && key === this.lastCanvasSizeKey) {
      return;
    }

    this.lastCanvasSizeKey = key;
    this.viewportWidth = viewport.width;
    this.viewportHeight = viewport.height;

    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(viewport.width, viewport.height, true);
    this.updateSceneTargetSize();

    for (const view of Object.values(this.views)) {
      view.resize(viewport.width, viewport.height);
    }

    this.renderer.getDrawingBufferSize(
      this.transitionMaterial.uniforms.uResolution.value
    );

    this.fpsCounter.resize();
  }

  getCanvasViewportSize() {
    const displayConfig = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const availableWidth = Math.max(1, window.innerWidth);
    const availableHeight = Math.max(1, window.innerHeight);
    const canvasSizeScale = this.activeViewName === "terrain-view"
      ? clamp(Number(displayConfig.canvasSizeScale ?? 1.0), 0.35, 1.0)
      : 1.0;

    return {
      width: Math.max(1, Math.floor(availableWidth * canvasSizeScale)),
      height: Math.max(1, Math.floor(availableHeight * canvasSizeScale))
    };
  }

  updateFpsCounter(now) {
    this.fpsFrames += 1;

    if (now - this.fpsTimer >= 500) {
      const fps = this.fpsFrames * 1000 / (now - this.fpsTimer);
      this.fpsFrames = 0;
      this.fpsTimer = now;

      this.fpsCounter.push(fps);
    }

    this.fpsCounter.draw(now);
  }

  updateTransitionOverlay() {
    const { transition } = this.store.getState();

    this.transitionMaterial.uniforms.uOpacity.value = 0;
    this.fadeMaterial.opacity = 0;

    if (transition.type === "idle") {
      return;
    }

    const now = performance.now() * 0.001;
    const elapsed = now - transition.startedAt;

    if (transition.type === "star-map-to-system") {
      this.updateWarpTravelTransition(transition, elapsed);
      return;
    }

    if (transition.type === "star-map-return-to-system") {
      this.updateSimpleSystemTravelTransition(transition, elapsed);
      return;
    }

    if (transition.type === "system-to-star-map") {
      this.updateReturnToStarMapTransition(transition, elapsed);
      return;
    }

    if (transition.type === "system-to-terrain") {
      this.updateTerrainLandingTransition(transition, elapsed);
      return;
    }

    if (transition.type === "terrain-to-system") {
      this.updateTerrainReturnTransition(transition, elapsed);
      return;
    }

    if (transition.type === "stellar-object-to-star-map") {
      this.updateStellarObjectStarMapReturnTransition(transition, elapsed);
    }
  }

  updateWarpTravelTransition(transition, elapsed) {
    const fadeInStart = 0.25;
    const fadeInEnd = 0.75;
    const revealAt = 1.15;
    const fadeOutStart = 1.25;
    const fadeOutEnd = 2.15;

    if (elapsed >= revealAt && !transition.revealed) {
      this.store.revealSystemTravel();
    }

    const fadeIn = smoothstep(fadeInStart, fadeInEnd, elapsed);
    const fadeOut = transition.revealed
      ? 1 - smoothstep(fadeOutStart, fadeOutEnd, elapsed)
      : 1;

    this.transitionMaterial.uniforms.uTime.value = elapsed;
    this.transitionMaterial.uniforms.uOpacity.value = fadeIn * fadeOut;

    if (transition.revealed && elapsed >= fadeOutEnd) {
      this.transitionMaterial.uniforms.uOpacity.value = 0;
      this.store.completeSystemTravel();
    }
  }

  updateSimpleSystemTravelTransition(transition, elapsed) {
    const fadeInEnd = 0.55;
    const revealAt = 0.62;
    const fadeOutStart = 0.68;
    const fadeOutEnd = transition.duration || 1.55;

    if (elapsed >= revealAt && !transition.revealed) {
      this.store.revealSystemTravel();
    }

    const fadeIn = smoothstep(0.0, fadeInEnd, elapsed);
    const fadeOut = transition.revealed
      ? 1 - smoothstep(fadeOutStart, fadeOutEnd, elapsed)
      : 1;

    this.fadeMaterial.opacity = fadeIn * fadeOut;

    if (transition.revealed && elapsed >= fadeOutEnd) {
      this.fadeMaterial.opacity = 0;
      this.store.completeSystemTravel();
    }
  }

  prepareTerrainViewForReveal() {
    const terrainView = this.views["terrain-view"];

    if (!terrainView?.prepareForReveal) {
      return;
    }

    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;
    const previousClearAlpha = this.renderer.getClearAlpha();
    const previousClearColor = new THREE.Color();

    this.renderer.getClearColor(previousClearColor);

    terrainView.prepareForReveal({
      renderer: this.renderer,
      renderTarget: null,
      elapsedTime: this.clock.elapsedTime,
      width: this.viewportWidth,
      height: this.viewportHeight
    });

    this.renderer.setRenderTarget(previousTarget);
    this.renderer.autoClear = previousAutoClear;
    this.renderer.setClearColor(previousClearColor, previousClearAlpha);
  }

  updateTerrainLandingTransition(transition, elapsed) {
    const fadeInEnd = 0.85;
    const revealAt = 0.92;
    const fadeOutStart = 0.98;
    const fadeOutEnd = transition.duration || 1.75;

    if (elapsed >= revealAt && !transition.revealed) {
      this.store.revealTerrainLanding();
    }

    const fadeIn = smoothstep(0.0, fadeInEnd, elapsed);
    const fadeOut = transition.revealed
      ? 1 - smoothstep(fadeOutStart, fadeOutEnd, elapsed)
      : 1;

    this.fadeMaterial.opacity = fadeIn * fadeOut;

    if (transition.revealed && elapsed >= fadeOutEnd) {
      this.fadeMaterial.opacity = 0;
      this.store.completeSystemTravel();
    }
  }

  updateTerrainReturnTransition(transition, elapsed) {
    const fadeInEnd = 0.38;
    const revealAt = 0.45;
    const fadeOutStart = 0.5;
    const fadeOutEnd = transition.duration || 1.15;

    if (elapsed >= revealAt && !transition.revealed) {
      this.store.revealSystemReturn();
    }

    const fadeIn = smoothstep(0.0, fadeInEnd, elapsed);
    const fadeOut = transition.revealed
      ? 1 - smoothstep(fadeOutStart, fadeOutEnd, elapsed)
      : 1;

    this.fadeMaterial.opacity = fadeIn * fadeOut;

    if (transition.revealed && elapsed >= fadeOutEnd) {
      this.fadeMaterial.opacity = 0;
      this.store.completeSystemTravel();
    }
  }


  updateStellarObjectStarMapReturnTransition(transition, elapsed) {
    const fadeInEnd = 0.42;
    const revealAt = 0.50;
    const fadeOutStart = 0.58;
    const fadeOutEnd = transition.duration || 1.35;

    if (elapsed >= revealAt && !transition.revealed) {
      this.store.revealStellarObjectStarMapReturn();
    }

    const fadeIn = smoothstep(0.0, fadeInEnd, elapsed);
    const fadeOut = transition.revealed
      ? 1 - smoothstep(fadeOutStart, fadeOutEnd, elapsed)
      : 1;

    this.fadeMaterial.opacity = fadeIn * fadeOut;

    if (transition.revealed && elapsed >= fadeOutEnd) {
      this.fadeMaterial.opacity = 0;
      this.store.completeSystemTravel();
    }
  }

  updateReturnToStarMapTransition(transition, elapsed) {
    const fadeInEnd = 0.55;
    const revealAt = 0.62;
    const fadeOutStart = 0.68;
    const fadeOutEnd = transition.duration || 1.55;

    if (elapsed >= revealAt && !transition.revealed) {
      this.store.revealStarMapReturn();
    }

    const fadeIn = smoothstep(0.0, fadeInEnd, elapsed);
    const fadeOut = transition.revealed
      ? 1 - smoothstep(fadeOutStart, fadeOutEnd, elapsed)
      : 1;

    this.fadeMaterial.opacity = fadeIn * fadeOut;

    if (transition.revealed && elapsed >= fadeOutEnd) {
      this.fadeMaterial.opacity = 0;
      this.store.completeSystemTravel();
    }
  }


  createBookmarkModeLeaveButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "bookmark-mode-leave-button";
    button.textContent = "Leave Bookmark Mode";
    button.setAttribute("aria-label", "Leave bookmark mode");
    this.rootElement.appendChild(button);

    return button;
  }

  handleBookmarkModeLeaveClick(event) {
    event.preventDefault();
    event.stopPropagation();
    this.store.stopBookmarkMode?.();
  }

  handleBookmarkModeActivity(event) {
    const state = this.store.getState();

    if (!state.bookmarkMode?.active) {
      return;
    }

    if (event.type === "keydown" && event.code === "Escape") {
      return;
    }

    this.showBookmarkModeLeaveButton();
  }

  showBookmarkModeLeaveButton() {
    if (!this.bookmarkLeaveButton) {
      return;
    }

    this.bookmarkLeaveButtonVisible = true;
    this.bookmarkLeaveButton.classList.add("is-visible");
    clearTimeout(this.bookmarkLeaveButtonTimeout);

    this.bookmarkLeaveButtonTimeout = setTimeout(() => {
      this.bookmarkLeaveButtonVisible = false;
      this.bookmarkLeaveButton.classList.remove("is-visible");
    }, 2800);
  }

  hideBookmarkModeLeaveButton() {
    clearTimeout(this.bookmarkLeaveButtonTimeout);
    this.bookmarkLeaveButtonTimeout = null;
    this.bookmarkLeaveButtonVisible = false;
    this.bookmarkLeaveButton?.classList.remove("is-visible");
  }

  updateBookmarkMode(deltaTime) {
    const state = this.store.getState();
    const bookmarkMode = state.bookmarkMode ?? {};
    const active = Boolean(bookmarkMode.active);
    const ambient = Boolean(active && bookmarkMode.mode === "ambient");

    document.body.classList.toggle("is-bookmark-mode", active);
    document.body.classList.toggle("is-ambient-bookmark-mode", ambient);
    document.body.classList.toggle("is-cinematic-ui-hidden", ambient);

    if (!active) {
      this.bookmarkModeTransition = null;
      this.hideBookmarkModeLeaveButton();
      return;
    }

    const bookmarks = this.getTerrainBookmarkTourList(state);

    if (bookmarks.length === 0) {
      this.store.stopBookmarkMode?.();
      return;
    }

    if (bookmarkMode.mode === "star-lab") {
      this.updateStarLabBookmarkMode(state, bookmarkMode, bookmarks);
      return;
    }

    this.updateAmbientBookmarkMode(state, bookmarkMode, bookmarks);
  }

  updateAmbientBookmarkMode(state, bookmarkMode, bookmarks) {
    if (state.activeView !== "terrain-view" || !state.terrainView?.restoreBookmarkId) {
      const index = this.normalizeBookmarkTourIndex(bookmarkMode.currentIndex, bookmarks.length);
      this.store.enterTerrainBookmark?.(bookmarks[index].id, { forceZeroSpeed: true });
      return;
    }

    const now = performance.now() * 0.001;
    const dwellSeconds = clamp(Number(bookmarkMode.dwellSeconds ?? 18), 5, 120);
    const stepStartedAt = Number(bookmarkMode.stepStartedAt ?? bookmarkMode.startedAt ?? now);

    if (!bookmarkMode.paused && !this.bookmarkModeTransition && bookmarks.length > 1 && now - stepStartedAt >= dwellSeconds) {
      this.bookmarkModeTransition = {
        startedAt: now,
        duration: 2.4,
        revealed: false,
        direction: 1
      };
    }

    this.updateBookmarkModeTransition(now);
  }

  updateStarLabBookmarkMode(state, bookmarkMode, bookmarks) {
    if (bookmarkMode.paused) {
      return;
    }

    if (state.transition?.type && state.transition.type !== "idle") {
      return;
    }

    const now = performance.now() * 0.001;
    const index = this.normalizeBookmarkTourIndex(bookmarkMode.currentIndex, bookmarks.length);
    const bookmark = bookmarks[index];
    const phase = bookmarkMode.phase || "star-map-focus";
    const phaseStartedAt = Number(bookmarkMode.phaseStartedAt ?? bookmarkMode.stepStartedAt ?? bookmarkMode.startedAt ?? now);
    const phaseElapsed = now - phaseStartedAt;
    const terrainDwellSeconds = clamp(Number(bookmarkMode.dwellSeconds ?? 18), 5, 120);

    if (!bookmark?.id) {
      this.store.advanceStarLabBookmarkMode?.(1);
      return;
    }

    if (phase === "star-map-focus") {
      if (state.activeView !== "star-map") {
        this.store.advanceStarLabBookmarkMode?.(0);
        return;
      }

      if (phaseElapsed >= 2.2) {
        this.store.beginSystemTravel?.(bookmark.systemId, { useWarp: true });
        this.store.setBookmarkModePhase?.("warp-to-system", { resetStep: false });
      }
      return;
    }

    if (phase === "warp-to-system") {
      if (state.activeView === "system-view" && state.systemView?.activeSystemId === bookmark.systemId) {
        this.store.setBookmarkModePhase?.("system-dwell");
      }
      return;
    }

    if (phase === "system-dwell") {
      if (state.activeView !== "system-view") {
        return;
      }

      if (phaseElapsed >= 3.0) {
        this.store.enterOrbitView?.(bookmark.planetId);
        this.store.setBookmarkModePhase?.("orbit-dwell");
      }
      return;
    }

    if (phase === "orbit-dwell") {
      if (state.activeView !== "system-view" || state.systemView?.mode !== "orbit") {
        return;
      }

      if (phaseElapsed >= 3.0) {
        this.store.beginTerrainBookmarkLanding?.(bookmark.id, { forceZeroSpeed: true });
        this.store.setBookmarkModePhase?.("terrain-transition", { resetStep: false });
      }
      return;
    }

    if (phase === "terrain-transition") {
      if (state.activeView === "terrain-view" && state.terrainView?.restoreBookmarkId === bookmark.id) {
        this.store.setBookmarkModePhase?.("terrain-dwell");
      }
      return;
    }

    if (phase === "terrain-dwell") {
      if (state.activeView !== "terrain-view") {
        return;
      }

      if (phaseElapsed >= terrainDwellSeconds) {
        this.store.returnToSystemView?.();
        this.store.setBookmarkModePhase?.("terrain-return", { resetStep: false });
      }
      return;
    }

    if (phase === "terrain-return") {
      if (state.activeView === "system-view" && state.systemView?.mode === "orbit") {
        this.store.setBookmarkModePhase?.("orbit-exit-dwell");
      }
      return;
    }

    if (phase === "orbit-exit-dwell") {
      if (phaseElapsed >= 1.4) {
        this.store.requestOrbitReturn?.();
        this.store.setBookmarkModePhase?.("system-exit-dwell");
      }
      return;
    }

    if (phase === "system-exit-dwell") {
      if (state.activeView !== "system-view") {
        return;
      }

      if (state.systemView?.mode === "system" && phaseElapsed >= 1.8) {
        this.store.beginStarMapReturn?.();
        this.store.setBookmarkModePhase?.("star-map-return", { resetStep: false });
      }
      return;
    }

    if (phase === "star-map-return") {
      if (state.activeView === "star-map") {
        this.store.advanceStarLabBookmarkMode?.(1);
      }
      return;
    }

    this.store.setBookmarkModePhase?.("star-map-focus");
  }

  getTerrainBookmarkTourList(state = this.store.getState()) {
    return Array.isArray(state.starLog?.terrainBookmarks)
      ? state.starLog.terrainBookmarks.filter((bookmark) => bookmark?.id && bookmark?.landingContext && bookmark?.pose)
      : [];
  }

  normalizeBookmarkTourIndex(index, length) {
    if (length <= 0) {
      return 0;
    }

    return ((Math.trunc(Number(index) || 0) % length) + length) % length;
  }

  updateBookmarkModeTransition(now) {
    const transition = this.bookmarkModeTransition;

    if (!transition) {
      return;
    }

    const elapsed = now - transition.startedAt;
    const duration = Math.max(0.1, transition.duration ?? 2.4);
    const revealAt = duration * 0.50;
    const fadeInEnd = duration * 0.42;
    const fadeOutStart = duration * 0.55;

    if (elapsed >= revealAt && !transition.revealed) {
      transition.revealed = true;
      this.store.advanceAmbientBookmarkMode?.(transition.direction ?? 1);
    }

    const fadeIn = smoothstep(0.0, fadeInEnd, elapsed);
    const fadeOut = transition.revealed
      ? 1.0 - smoothstep(fadeOutStart, duration, elapsed)
      : 1.0;

    this.fadeMaterial.opacity = Math.max(this.fadeMaterial.opacity, fadeIn * fadeOut);

    if (elapsed >= duration) {
      this.fadeMaterial.opacity = 0;
      this.bookmarkModeTransition = null;
    }
  }

  handleGlobalKeyDown(event) {
    const state = this.store.getState();

    if (state.bookmarkMode?.active) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      if (event.code === "Escape") {
        this.store.stopBookmarkMode?.();
      } else {
        this.showBookmarkModeLeaveButton();
      }

      return;
    }

    const isStellarCycleKey = event.code === "NumpadEnter" ||
      event.code === "NumpadAdd" ||
      event.code === "NumpadSubtract";

    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement ||
      event.target?.isContentEditable
    ) {
      const allowStellarRangeCycle =
        state.activeView === "stellar-object-view" &&
        isStellarCycleKey &&
        event.target instanceof HTMLInputElement &&
        event.target.type === "range";

      if (!allowStellarRangeCycle) {
        return;
      }

      event.target.blur();
    }

    if (event.code === "NumpadEnter") {
      if (state.transition.type === "idle") {
        event.preventDefault();
        const currentObjectId = state.stellarObjectView.activeObjectId ?? STELLAR_OBJECT_ORDER[0];
        this.store.toggleStellarObjectView(currentObjectId);
      }
      return;
    }

    if (event.code === "NumpadAdd" || event.code === "NumpadSubtract") {
      if (state.activeView === "stellar-object-view" && state.transition.type === "idle") {
        event.preventDefault();
        const direction = event.code === "NumpadAdd" ? 1 : -1;
        const currentObjectId = state.stellarObjectView.activeObjectId ?? STELLAR_OBJECT_ORDER[0];
        const currentIndex = Math.max(0, STELLAR_OBJECT_ORDER.indexOf(currentObjectId));
        const nextIndex = (currentIndex + direction + STELLAR_OBJECT_ORDER.length) % STELLAR_OBJECT_ORDER.length;
        this.store.enterStellarObjectView(STELLAR_OBJECT_ORDER[nextIndex]);
      }
      return;
    }

    const display = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const modeBackKey = display.keyBindings?.modeBack ?? "Tab";

    if (event.code !== modeBackKey) {
      return;
    }

    if (state.transition.type !== "idle") {
      return;
    }

    if (state.activeView === "terrain-view") {
      event.preventDefault();
      this.store.returnToSystemView();
      return;
    }

    if (state.activeView === "stellar-object-view") {
      event.preventDefault();
      this.store.beginStellarObjectStarMapReturn();
      return;
    }

    if (state.activeView !== "system-view") {
      return;
    }

    event.preventDefault();

    if (state.systemView.mode === "orbit") {
      this.store.requestOrbitReturn();
      return;
    }

    this.store.beginStarMapReturn();
  }

  handleResize() {
    this.updateCanvasViewport(true);
  }

  destroy() {
    this.stop();
    this.unsubscribe?.();

    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("keydown", this.handleGlobalKeyDown);
    window.removeEventListener("keydown", this.handleBookmarkModeActivity, true);
    window.removeEventListener("pointermove", this.handleBookmarkModeActivity, true);
    window.removeEventListener("pointerdown", this.handleBookmarkModeActivity, true);
    this.bookmarkLeaveButton?.removeEventListener("click", this.handleBookmarkModeLeaveClick);
    this.bookmarkLeaveButton?.remove();
    document.body.classList.remove("is-bookmark-mode", "is-ambient-bookmark-mode", "is-cinematic-ui-hidden");

    for (const view of Object.values(this.views)) {
      view.destroy?.();
    }

    this.transitionQuad.geometry.dispose();
    this.transitionMaterial.dispose();
    this.fadeQuad.geometry.dispose();
    this.fadeMaterial.dispose();
    this.finalQuad.geometry.dispose();
    this.finalCompositeMaterial.dispose();
    this.sceneTarget.dispose();
    this.warmupTarget.dispose();
    this.fpsCounter.destroy();

    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mixNumber(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function createWarmupSteps(appRenderer) {
  return [
    {
      label: "Loading textures...",
      run: () => preloadSurfaceTextures(appRenderer.renderer)
    },
    {
      label: "Computing Star Map shaders...",
      run: () => warmupView(appRenderer, appRenderer.views["star-map"])
    },
    {
      label: "Computing System View shaders...",
      run: () => warmupView(appRenderer, appRenderer.views["system-view"])
    },
    {
      label: "Computing space shaders...",
      run: () =>
        warmupMaterials(appRenderer, [
          new StarNestSpaceMaterial(),
          new SpaceBackgroundMaterial()
        ])
    },
    {
      label: "Computing star shaders...",
      run: () =>
        warmupMaterials(appRenderer, [
          new SunMaterial({ shaderId: "fractal-sun", starConfig: {} }),
          new SunHaloMaterial({ starConfig: {} })
        ])
    },
    {
      label: "Computing planet shaders...",
      run: () =>
        warmupMaterials(appRenderer, [
          ...TERRAIN_SHADERS.map((shader) =>
            new PlanetSurfaceMaterial({ shaderId: shader.id, planetConfig: {} })
          ),
          new PlanetSurfaceMaterial({ shaderId: "moon", planetConfig: {} })
        ])
    },
    {
      label: "Computing ring shaders...",
      run: () =>
        warmupMaterials(appRenderer, [
          new PlanetRingMaterial({ ringConfig: {}, planetConfig: {} })
        ])
    },
    {
      label: "Computing orbit cloud shells...",
      run: () => warmupSystemOrbitCloudShells(appRenderer)
    },
    {
      label: "Computing Terrain View shaders...",
      run: () => warmupTerrainView(appRenderer)
    },
    {
      label: "Computing transition shaders...",
      run: () =>
        warmupMaterials(appRenderer, [
          new WarpTunnelMaterial(),
          new TerrainGroundMaterial(),
          new FinalCompositeMaterial()
        ])
    },
    {
      label: "Preparing renderer...",
      run: () => warmupView(appRenderer, appRenderer.views["system-view"])
    }
  ];
}

async function warmupTerrainView(appRenderer) {
  const view = appRenderer.views["terrain-view"];

  if (view?.warmupTerrainShaders) {
    await view.warmupTerrainShaders({
      renderer: appRenderer.renderer,
      width: appRenderer.viewportWidth,
      height: appRenderer.viewportHeight,
      elapsedTime: appRenderer.clock.elapsedTime
    });
    return;
  }

  await warmupTerrainSurfaceShaders(appRenderer);
}

async function warmupTerrainSurfaceShaders(appRenderer) {
  const renderer = appRenderer.renderer;
  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  const previousClearAlpha = renderer.getClearAlpha();
  const previousClearColor = new THREE.Color();

  renderer.getClearColor(previousClearColor);

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  camera.position.z = 1;

  const geometry = new THREE.PlaneGeometry(2, 2);

  const target = new THREE.WebGLRenderTarget(128, 128, {
    depthBuffer: false,
    stencilBuffer: false,
    format: THREE.RGBAFormat
  });

  for (const shader of TERRAIN_SHADERS) {
    const material = new TerrainSurfaceMaterial({
      shaderId: shader.id,
      planetConfig: {
        visual: {
          terrainShaderId: shader.id,
          terrainParams: {},
          baseColor: [0.64, 0.68, 0.72],
          accentColor: [0.9, 0.92, 1.0]
        }
      }
    });

    material.setResolution(128, 128, 1);
    material.setTime(appRenderer.clock.elapsedTime);
    material.setCameraBasis({
      position: new THREE.Vector3(0, 180, 420),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(0, -0.32, -0.95).normalize()
    });
    material.setLighting({
      sunDirection: [0.46, 0.72, 0.38],
      sunColor: [1.0, 0.72, 0.36],
      sunIntensity: 1.15,
      ambientIntensity: 0.19
    });
    material.setSpaceConfig({
      shaderId: "star-nest",
      params: {}
    });
    material.setAtmosphereConfig({
      clouds: {
        enabled: false,
        speed: 0.25,
        density: 1.0,
        opacity: 0.0,
        scale: 1.0,
        height: 0.05,
        brightness: 1.0,
        softness: 1.0,
        hue: 0.0,
        saturation: 0.0,
        renderDistance: 18000.0,
        fadeDistance: 4500.0,
        deckThickness: 2.0,
        patchiness: 0.0,
        bigPatches: 0.0,
        heightVariation: 0.0,
        blurStrength: 0.0
      },
      atmosphere: {
        shaderId: "atmosphere-flow",
        params: {
          speed: 0.18,
          density: 0.9,
          opacity: 0.04,
          scale: 1.0,
          height: 0.25,
          brightness: 0.92,
          softness: 1.35,
          hue: 0.0,
          saturation: 0.65
        }
      },
      fog: {
        shaderId: "fog-clouds",
        params: {
          speed: 0.25,
          density: 1.0,
          opacity: 0.03,
          scale: 0.10,
          height: 0.25,
          brightness: 1.0,
          softness: 1.0,
          hue: 0.0,
          saturation: 1.0,
          renderDistance: 18000.0,
          fadeDistance: 4500.0,
          deckThickness: 1.0
        }
      }
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);

    if (renderer.compileAsync) {
      await renderer.compileAsync(scene, camera);
    } else {
      renderer.compile(scene, camera);
    }

    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0.0);
    renderer.clear(true, true, true);

    // Render twice. Some drivers finish shader specialization only after first real draw.
    renderer.render(scene, camera);
    renderer.render(scene, camera);

    scene.remove(mesh);
    material.dispose();
  }

  geometry.dispose();
  target.dispose();
  scene.clear();

  renderer.setRenderTarget(previousTarget);
  renderer.autoClear = previousAutoClear;
  renderer.setClearColor(previousClearColor, previousClearAlpha);
}

async function warmupSystemOrbitCloudShells(appRenderer) {
  const view = appRenderer.views["system-view"];

  if (view?.warmupOrbitCloudShells) {
    await view.warmupOrbitCloudShells({
      renderer: appRenderer.renderer,
      renderTarget: appRenderer.warmupTarget
    });
    return;
  }

  await warmupView(appRenderer, view);
}

async function warmupView(appRenderer, view) {
  const renderer = appRenderer.renderer;
  const previousRenderTarget = renderer.getRenderTarget();

  view.update({
    deltaTime: 0,
    elapsedTime: appRenderer.clock.elapsedTime
  });

  if (renderer.compileAsync) {
    await renderer.compileAsync(view.scene, view.camera);
  } else {
    renderer.compile(view.scene, view.camera);
  }

  renderer.setRenderTarget(appRenderer.warmupTarget);
  renderer.clear();
  view.render();
  renderer.setRenderTarget(previousRenderTarget);
}

async function warmupMaterials(appRenderer, materials) {
  const renderer = appRenderer.renderer;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);

  camera.position.set(0, 0, 8);

  const meshes = materials.map((material, index) => {
    const geometry = createWarmupGeometry(material);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.x = (index - materials.length * 0.5) * 0.3;
    scene.add(mesh);

    return mesh;
  });

  if (renderer.compileAsync) {
    await renderer.compileAsync(scene, camera);
  } else {
    renderer.compile(scene, camera);
  }

  const previousRenderTarget = renderer.getRenderTarget();

  renderer.setRenderTarget(appRenderer.warmupTarget);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(previousRenderTarget);

  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose?.();
  }

  scene.clear();
}

function createWarmupGeometry(material) {
  if (material instanceof PlanetRingMaterial) {
    return createPlanetRingDiskGeometry({ segments: 64 });
  }

  if (
    material instanceof WarpTunnelMaterial ||
    material instanceof FinalCompositeMaterial ||
    material instanceof TerrainSurfaceMaterial
  ) {
    return new THREE.PlaneGeometry(2, 2);
  }

  if (
    material instanceof StarNestSpaceMaterial ||
    material instanceof SpaceBackgroundMaterial
  ) {
    return new THREE.SphereGeometry(1, 16, 8);
  }

  return new THREE.SphereGeometry(1, 24, 12);
}

function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function getResolutionPresetSize(preset) {
  if (preset === "1440p") {
    return { width: 2560, height: 1440 };
  }

  if (preset === "1080p") {
    return { width: 1920, height: 1080 };
  }

  if (preset === "720p") {
    return { width: 1280, height: 720 };
  }

  return null;
}

function smoothstep(edge0, edge1, value) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}
