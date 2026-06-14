import * as THREE from "three";
import { TerrainSurfaceMaterial } from "../materials/TerrainSurfaceMaterial.js";
import { TerrainWeatherRenderer } from "./terrain/TerrainWeatherRenderer.js";
import {
  TERRAIN_SHADERS,
  createDefaultTerrainParams,
  createTerrainHeightSampler
} from "../materials/terrain/terrainRegistry.js";
import { HudOverlayMaterial } from "../materials/HudOverlayMaterial.js";
import { StarNestSpaceMaterial } from "../materials/StarNestSpaceMaterial.js";
import { TerrainSkyObjectRenderer } from "./terrain/TerrainSkyObjectRenderer.js";
import { TerrainLocalRingRenderer } from "./terrain/TerrainLocalRingRenderer.js";
import { TerrainInputController } from "../core/TerrainInputController.js";
import { TerrainFlightController } from "../core/TerrainFlightController.js";
import { TerrainCompassOverlay } from "../ui/TerrainCompassOverlay.js";
import {
  getSurfaceTexture,
  preloadSurfaceTexture
} from "./system/surfaceTextureCache.js";
import {
  normalizeAtmosphereConfig,
  normalizeDisplayConfig,
  normalizePlanetAtmosphereConfig,
  normalizeSkyShaderId,
  normalizeSkyShaderParams
} from "../core/configSchema.js";

export class TerrainView {
  constructor({ canvas, renderer, galaxyConfig, store }) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.scene = new THREE.Scene();

    this.terrainScene = new THREE.Scene();

    this.spaceScene = new THREE.Scene();
    this.spaceCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
    this.spaceCamera.position.set(0, 0, 0);
    this.spaceCamera.lookAt(0, 0, -1);
    this.spaceBackground = null;
    this.spaceBackgroundMaterial = null;
    this.spaceCameraBack = new THREE.Vector3();
    this.spaceCameraMatrix = new THREE.Matrix4();

    this.terrainTarget = new THREE.WebGLRenderTarget(8, 8, {
      depthBuffer: false,
      stencilBuffer: false,
      format: THREE.RGBAFormat
    });

    this.terrainDisplayMaterial = new THREE.MeshBasicMaterial({
      map: this.terrainTarget.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    this.terrainDisplayQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.terrainDisplayMaterial
    );

    this.terrainDisplayQuad.name = "Terrain Display Fullscreen Quad";
    this.terrainDisplayQuad.frustumCulled = false;
    this.terrainDisplayQuad.renderOrder = 0;
    this.scene.add(this.terrainDisplayQuad);

    this.camera = new THREE.Camera();
    this.camera.position.z = 1;

    this.activeSystemId = null;
    this.activePlanetId = null;
    this.activeTerrainShaderId = null;
    this.activeTextureId = null;
    this.activeSpaceShaderId = null;
    this.lastConfigRevision = -1;
    this.wasActive = false;
    this.lastTerrainResizeKey = "";
    this.performanceOverride = null;
    this.lastFlightProfileKey = "";
    this.activeLandingKey = "";
    this.lastAppliedRestoreKey = "";
    this.terrainHeightAtWorld = () => 0;
    this.lastFlightTelemetry = {
      ground: 0,
      heightAboveGround: 24,
      speed: 8,
      normalSpeed: 8,
      normalSpeedMax: 200,
      afterburnerBlend: 0
    };

    this.input = new TerrainInputController({ canvas: this.canvas });
    this.flight = new TerrainFlightController({ input: this.input });
    this.compassOverlay = new TerrainCompassOverlay();

    this.terrainCamera = this.flight.getCameraBasis();

    this.groundMaterial = new TerrainSurfaceMaterial({
      shaderId: this.getActivePlanet()?.visual?.terrainShaderId ?? "none",
      planetConfig: this.getActivePlanet() ?? undefined,
      surfaceTexture: this.getPlanetSurfaceTexture(this.getActivePlanet())
    });

    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.groundMaterial
    );

    this.quad.name = "Terrain Composer Fullscreen Quad";
    this.quad.frustumCulled = false;
    this.terrainScene.add(this.quad);

    this.skyObjectRenderer = new TerrainSkyObjectRenderer({ renderer: this.renderer });
    this.localRingRenderer = new TerrainLocalRingRenderer();
    this.weatherRenderer = new TerrainWeatherRenderer();

    this.hudScene = new THREE.Scene();
    this.hudMaterial = new HudOverlayMaterial();
    this.hudQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.hudMaterial
    );
    this.hudQuad.name = "Terrain HUD Fullscreen Quad";
    this.hudQuad.frustumCulled = false;
    this.hudQuad.renderOrder = 10;
    this.hudScene.add(this.hudQuad);



    this.updateMaterialConfig(true, 0);
  }

  getActiveSystem() {
    const { terrainView, systemView } = this.store.getState();
    const activeSystemId = terrainView.activeSystemId ?? systemView.activeSystemId;

    return this.galaxyConfig.systems.find(
      (candidate) => candidate.id === activeSystemId
    ) ?? null;
  }

  getActivePlanet() {
    const { terrainView, systemEditor } = this.store.getState();
    const activeSystem = this.getActiveSystem();

    if (!activeSystem) {
      return null;
    }

    const selectedPlanetId =
      terrainView.activePlanetId ??
      systemEditor.selectedPlanetIdBySystemId?.[activeSystem.id] ??
      null;

    return activeSystem.planets.find(
      (planet) => planet.id === selectedPlanetId
    ) ?? activeSystem.planets[0] ?? null;
  }

  getPlanetSurfaceTexture(planet) {
    const textureId = planet?.visual?.surfaceTextureId;

    if (!textureId || textureId === "none") {
      return null;
    }

    preloadSurfaceTexture(textureId, this.renderer).catch((error) => {
      console.warn(`Terrain surface texture preload failed for ${textureId}:`, error);
    });

    return getSurfaceTexture(textureId) ?? null;
  }

  createOrUpdateSpaceBackground(activeSystem, shaderId) {
    const nextShaderId = shaderId ?? activeSystem?.visual?.spaceShaderId ?? "star-nest";

    if (this.spaceBackground?.userData?.shaderId === nextShaderId) {
      this.updateSpaceBackgroundMaterial(activeSystem);
      return;
    }

    if (this.spaceBackground) {
      this.spaceScene.remove(this.spaceBackground);
      this.spaceBackground.geometry?.dispose?.();
      this.spaceBackground.material?.dispose?.();
      this.spaceBackground = null;
      this.spaceBackgroundMaterial = null;
    }

    const geometry = new THREE.SphereGeometry(900, 48, 32);
    const material = createTerrainSpaceMaterial(nextShaderId);

    this.spaceBackground = new THREE.Mesh(geometry, material);
    this.spaceBackground.name = `Terrain View Space Background: ${nextShaderId}`;
    this.spaceBackground.userData.shaderId = nextShaderId;
    this.spaceBackground.frustumCulled = false;
    this.spaceBackground.renderOrder = -10000;
    this.spaceBackground.scale.setScalar(-1);

    this.spaceBackgroundMaterial = material;
    this.spaceScene.add(this.spaceBackground);

    if (material.uniforms?.uResolution) {
      this.renderer.getDrawingBufferSize(material.uniforms.uResolution.value);
    }

    this.updateSpaceBackgroundMaterial(activeSystem);
  }

  getCurrentSunHeight01() {
    const sunDirection = this.getLandingContext()?.sunDirectionLocal ?? [0.46, 0.72, 0.38];
    const sunElevation = Array.isArray(sunDirection) ? Number(sunDirection[1]) : 0.72;

    return computeTerrainSunFactors(sunElevation).skyAtmosphereFactor;
  }

  createEffectiveSkyShaderConfig(skyShader = { shaderId: "none", params: {} }) {
    const shaderId = normalizeSkyShaderId(skyShader.shaderId ?? skyShader.skyShaderId);
    const params = skyShader.params ?? skyShader.skyShaderParams ?? {};

    if (shaderId !== "thin-atmosphere") {
      return { shaderId, params };
    }

    const sunHeight01 = this.getCurrentSunHeight01();

    // Non-linear daylight response:
    // 1.0 = old linear behavior
    // 0.6 = stronger atmosphere while the sun is still low
    // 0.5 = even brighter near horizon
    const thinAtmoFactor = Math.pow(sunHeight01, 0.45);

    return {
      shaderId,
      params: {
        ...params,
        density: (params.density ?? 0.55) * thinAtmoFactor,
        horizon: (params.horizon ?? 1.1) * thinAtmoFactor,
        skyBrightness: 1.5 * thinAtmoFactor,
        ambient: (params.ambient ?? 0.22) * thinAtmoFactor,
        lightIntensity: (params.lightIntensity ?? 1.0) * thinAtmoFactor
      }
    };
  }

  updateSpaceBackgroundMaterial(activeSystem) {
    if (!this.spaceBackgroundMaterial || !activeSystem) {
      return;
    }

    const shaderId = this.spaceBackground?.userData?.shaderId ?? activeSystem.visual?.spaceShaderId ?? "star-nest";
    const params = activeSystem.visual?.spaceShaderParams ?? {};
    const uniforms = this.spaceBackgroundMaterial.uniforms;

    if (!uniforms?.uParams) {
      return;
    }

    if (this.spaceBackgroundMaterial.setSkyConfig) {
      const planet = this.getActivePlanet();
      const skyShaderId = normalizeSkyShaderId(
        planet?.visual?.skyShaderId ??
          this.galaxyConfig.terrainView?.skyShaderId
      );
      const skyParams = normalizeSkyShaderParams(
        planet?.visual?.skyShaderParams ??
          this.galaxyConfig.terrainView?.skyShaderParams ??
          {},
        skyShaderId
      );

      this.spaceBackgroundMaterial.setSkyConfig(
        this.createEffectiveSkyShaderConfig({
          shaderId: skyShaderId,
          params: skyParams
        })
      );
    }

    uniforms.uParams.value.set(createStarNestParamArray(params));
  }

  updateSpaceBackground(elapsedTime) {
    if (!this.spaceBackgroundMaterial) {
      return;
    }

    if (this.spaceBackgroundMaterial.uniforms?.uTime) {
      this.spaceBackgroundMaterial.uniforms.uTime.value = elapsedTime;
    }

    if (this.terrainCamera?.right && this.terrainCamera?.up && this.terrainCamera?.forward) {
      this.spaceCameraBack
        .copy(this.terrainCamera.forward)
        .multiplyScalar(-1)
        .normalize();

      this.spaceCameraMatrix.makeBasis(
        this.terrainCamera.right,
        this.terrainCamera.up,
        this.spaceCameraBack
      );

      this.spaceCameraMatrix.setPosition(0, 0, 0);
      this.spaceCamera.matrixWorld.copy(this.spaceCameraMatrix);
      this.spaceCamera.matrixWorldInverse.copy(this.spaceCamera.matrixWorld).invert();
      this.spaceCamera.matrixAutoUpdate = false;
    }

    this.updateSpaceBackgroundMaterial(this.getActiveSystem());
  }

  updateMaterialConfig(force = false, elapsedTime = 0) {
    const state = this.store.getState();
    const activeSystem = this.getActiveSystem();
    const planet = this.getActivePlanet();

    if (!activeSystem || !planet) {
      return;
    }

    const previousSystemId = this.activeSystemId;
    const previousPlanetId = this.activePlanetId;
    const previousTerrainShaderId = this.activeTerrainShaderId;

    const terrainShaderId = planet.visual?.terrainShaderId ?? "none";
    const textureId = planet.visual?.surfaceTextureId ?? "none";
    const spaceShaderId = activeSystem.visual?.spaceShaderId ?? "star-nest";

    const landingKey = this.getLandingKey();
    const needsUpdate =
      force ||
      activeSystem.id !== this.activeSystemId ||
      planet.id !== this.activePlanetId ||
      terrainShaderId !== this.activeTerrainShaderId ||
      textureId !== this.activeTextureId ||
      spaceShaderId !== this.activeSpaceShaderId ||
      landingKey !== this.activeLandingKey ||
      state.configRevision !== this.lastConfigRevision;

    if (!needsUpdate) {
      return;
    }

    this.activeSystemId = activeSystem.id;
    this.activePlanetId = planet.id;
    this.activeTerrainShaderId = terrainShaderId;
    this.activeTextureId = textureId;
    this.activeSpaceShaderId = spaceShaderId;
    this.activeLandingKey = landingKey;
    this.lastConfigRevision = state.configRevision;

    this.groundMaterial.setPlanetConfig(this.createTerrainPlanetConfig(planet), terrainShaderId);
    this.groundMaterial.setSurfaceTexture(this.getPlanetSurfaceTexture(planet));
    this.groundMaterial.setSpaceConfig({
      shaderId: spaceShaderId,
      params: activeSystem.visual?.spaceShaderParams ?? {}
    });

    this.createOrUpdateSpaceBackground(activeSystem, spaceShaderId);

    const shouldResetFlight =
      force ||
      activeSystem.id !== previousSystemId ||
      planet.id !== previousPlanetId ||
      terrainShaderId !== previousTerrainShaderId ||
      landingKey !== this.lastFlightProfileKey;

    this.updateTerrainCamera(planet, {
      resetFlight: shouldResetFlight,
      elapsedTime
    });

    this.applyTerrainBookmarkRestore(elapsedTime);
  }

  updateTerrainCamera(planet, { resetFlight = false, elapsedTime = 0 } = {}) {
    const terrainShaderId = planet?.visual?.terrainShaderId ?? "none";
    const params = planet?.visual?.terrainParams ?? {};
    const heightScale = Number(params.heightScale ?? 1);
    const featureScale = Number(params.featureScale ?? 1);
    const previousHeightAtWorld = this.terrainHeightAtWorld;
    const previousGroundAtPosition = previousHeightAtWorld(
      this.flight.position.x,
      this.flight.position.z,
      elapsedTime
    );
    const previousHeightAboveGround = Math.max(
      0,
      this.flight.position.y - previousGroundAtPosition
    );

    this.terrainHeightAtWorld = createTerrainHeightSampler(terrainShaderId, params);

    const settings = this.getTerrainViewSettings();
    const minimumStartAltitude = settings.flight.clearance + 20.0;

    const startAltitude = Math.max(
      minimumStartAltitude,
      Math.min(420, Math.abs(heightScale) * 1.2 + Math.max(0, featureScale) * 0.04 + 180)
    );

    const distance = Math.max(160, Math.min(860, startAltitude * 2.55));
    const groundHeight = this.terrainHeightAtWorld(0, distance, elapsedTime);

    this.flight.setGroundProfile({ groundHeight, altitude: startAltitude });

    if (resetFlight) {
      this.lastFlightProfileKey = this.getLandingKey();
      this.flight.reset({
        groundHeight,
        altitude: startAltitude,
        distance,
        terrainHeightAtWorld: this.terrainHeightAtWorld,
        timeSeconds: elapsedTime
      });
    } else {
      const newGroundAtPosition = this.terrainHeightAtWorld(
        this.flight.position.x,
        this.flight.position.z,
        elapsedTime
      );
      const minimumSafeY = newGroundAtPosition + settings.flight.clearance + 0.25;

      // Terrain parameter edits, especially baseHeight, must move the ground,
      // not silently drag the camera with it. Only correct actual penetration.
      if (this.flight.position.y < minimumSafeY) {
        this.flight.position.y = minimumSafeY;
      }

      this.flight.groundHeight = newGroundAtPosition;
      this.flight.baseAltitude = startAltitude;
    }

    this.terrainCamera = this.flight.getCameraBasis();
  }


  applyTerrainBookmarkRestore(elapsedTime = 0) {
    const state = this.store.getState();
    const restorePose = state.terrainView?.restorePose;
    const restoreBookmarkId = state.terrainView?.restoreBookmarkId;

    if (!restorePose || !restoreBookmarkId) {
      return;
    }

    const restoreKey = `${restoreBookmarkId}:${state.terrainView.enteredAt ?? 0}`;

    if (restoreKey === this.lastAppliedRestoreKey) {
      return;
    }

    this.lastAppliedRestoreKey = restoreKey;

    const settings = this.getTerrainViewSettings();
    this.flight.setPose(restorePose, {
      terrainHeightAtWorld: this.terrainHeightAtWorld,
      clearance: settings.flight.clearance,
      elapsedTime
    });
    this.terrainCamera = this.flight.getCameraBasis();
  }

  createTerrainBookmarkSnapshot() {
    const state = this.store.getState();
    const activeSystem = this.getActiveSystem();
    const activePlanet = this.getActivePlanet();
    const landingContext = this.getLandingContext();

    if (state.activeView !== "terrain-view" || !activeSystem || !activePlanet || !landingContext) {
      return null;
    }

    return {
      systemId: activeSystem.id,
      systemName: activeSystem.name ?? activeSystem.id,
      planetId: activePlanet.id,
      planetName: activePlanet.name ?? activePlanet.id,
      landingContext: clonePlainObject(landingContext),
      pose: this.flight.getPose()
    };
  }

  onActivate() {
    this.wasActive = false;
  }

  onDeactivate() {
    this.wasActive = false;
    this.input.setEnabled(false);
    this.hudQuad.visible = false;
    this.weatherRenderer.update({ active: false });
    this.skyObjectRenderer.update({ active: false, settings: {}, system: null, landingContext: null });
    this.localRingRenderer.update({ active: false, planet: null, landingContext: null, terrainCamera: null, elapsedTime: 0 });
    this.compassOverlay.update({ active: false });
  }

  async warmupTerrainShaders({
    renderer = this.renderer,
    width = window.innerWidth,
    height = window.innerHeight,
    elapsedTime = 0
  } = {}) {
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    const previousClearColor = new THREE.Color();
    const gl = renderer.getContext?.();

    renderer.getClearColor(previousClearColor);

    this.updateTerrainTargetSize(width, height);

    const activeSystem = this.getActiveSystem() ?? this.galaxyConfig.systems?.[0] ?? null;
    const basePlanet = this.getActivePlanet() ?? activeSystem?.planets?.[0] ?? {
      id: "warmup-planet",
      name: "Warmup Planet",
      body: { radius: 1, axialTilt: 0, rotationSpeed: 0, rotationOffset: 0 },
      visual: {
        terrainShaderId: "none",
        terrainParams: {},
        surfaceTextureId: "none",
        baseColor: [0.64, 0.68, 0.72],
        accentColor: [0.9, 0.92, 1.0],
        atmosphere: { clouds: { enabled: false }, aurora: { enabled: false } },
        ring: { enabled: false }
      }
    };

    const cameraBasis = {
      position: new THREE.Vector3(0, 220, 560),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(0, -0.36, -0.93).normalize()
    };

    this.terrainCamera = cameraBasis;
    this.groundMaterial.setTime(elapsedTime);
    this.groundMaterial.setCameraBasis(cameraBasis);
    this.groundMaterial.setSurfaceTexture(null);
    this.groundMaterial.setLighting({
      sunDirection: [0.46, 0.72, 0.38],
      sunColor: [1.0, 0.72, 0.36],
      sunIntensity: 1.15,
      ambientIntensity: 0.19
    });
    this.groundMaterial.setSpaceConfig({
      shaderId: activeSystem?.visual?.spaceShaderId ?? "star-nest",
      params: activeSystem?.visual?.spaceShaderParams ?? {}
    });
    this.groundMaterial.setSkyConfig({
      shaderId: "thin-atmosphere",
      params: {
        density: 0.55,
        horizon: 1.1,
        spaceFade: 0.25
      }
    });
    this.groundMaterial.setAtmosphereConfig({
      clouds: {
        enabled: true,
        speed: 0.25,
        density: 1.0,
        opacity: 0.02,
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
      aurora: {
        enabled: false,
        params: {
          intensity: 1.0,
          speed: 1.0,
          bandScale: 140.0,
          height: 1200.0,
          spread: 1.35,
          trail: 1.0,
          glow: 1.35,
          horizonFade: 1.0
        }
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

    this.createOrUpdateSpaceBackground(activeSystem, activeSystem?.visual?.spaceShaderId ?? "star-nest");
    this.updateSpaceBackground(elapsedTime);

    renderer.setRenderTarget(this.terrainTarget);
    renderer.setClearColor(0x000000, 0.0);

    for (const shader of TERRAIN_SHADERS) {
      const warmupPlanet = {
        ...basePlanet,
        visual: {
          ...(basePlanet.visual ?? {}),
          terrainShaderId: shader.id,
          terrainParams: createDefaultTerrainParams(shader.id),
          surfaceTextureId: "none",
          baseColor: basePlanet.visual?.baseColor ?? [0.64, 0.68, 0.72],
          accentColor: basePlanet.visual?.accentColor ?? [0.9, 0.92, 1.0]
        }
      };

      this.groundMaterial.setPlanetConfig(warmupPlanet, shader.id);
      this.groundMaterial.setSurfaceTexture(null);
      renderer.compile(this.terrainScene, this.camera);

      for (let pass = 0; pass < 3; pass += 1) {
        renderer.clear(true, true, true);
        renderer.render(this.terrainScene, this.camera);
        gl?.flush?.();
      }

      gl?.finish?.();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    this.warmupTerrainSkyAndRing({
      renderer,
      activeSystem,
      basePlanet,
      cameraBasis,
      elapsedTime
    });

    renderer.setRenderTarget(previousTarget);
    renderer.autoClear = previousAutoClear;
    renderer.setClearColor(previousClearColor, previousClearAlpha);

    this.skyObjectRenderer.update({ active: false, settings: {}, system: null, landingContext: null });
    this.localRingRenderer.update({ active: false, planet: null, landingContext: null, terrainCamera: null, elapsedTime: 0 });
    this.updateMaterialConfig(true, elapsedTime);
  }

  warmupTerrainSkyAndRing({
    renderer,
    activeSystem,
    basePlanet,
    cameraBasis,
    elapsedTime
  }) {
    if (!activeSystem) {
      return;
    }

    const settings = this.getTerrainViewSettings();
    const planets = activeSystem.planets ?? [];
    const skyObjects = [
      {
        type: "star",
        id: "star",
        directionLocal: [0.2, 0.65, -0.72],
        angularRadius: 0.08,
        displayScale: settings.sky.sunDisplayScale ?? 1.0,
        color: activeSystem.star?.color ?? activeSystem.color ?? [1.0, 0.72, 0.36],
        distance: 1.0
      }
    ];

    for (const planet of planets) {
      if (skyObjects.length >= 5) {
        break;
      }

      if (planet.id === basePlanet.id) {
        continue;
      }

      skyObjects.push({
        type: "planet",
        id: planet.id,
        directionLocal: [0.35 - skyObjects.length * 0.16, 0.18, -0.92],
        angularRadius: 0.035,
        displayScale: settings.sky.planetDisplayScale ?? 1.0,
        color: planet.visual?.baseColor ?? [0.68, 0.74, 0.86],
        distance: 1.0
      });
    }

    const landingContext = {
      systemId: activeSystem.id,
      planetId: basePlanet.id,
      sectorId: "warmup",
      surfaceNormalLocal: [0, 1, 0],
      sunDirectionLocal: [0.2, 0.65, -0.72],
      skyObjects
    };

    this.skyObjectRenderer.update({
      active: true,
      settings: settings.sky,
      system: activeSystem,
      landingContext,
      terrainCamera: cameraBasis,
      elapsedTime
    });

    this.localRingRenderer.update({
      active: true,
      planet: basePlanet,
      landingContext,
      terrainCamera: cameraBasis,
      elapsedTime
    });

    renderer.compile(this.spaceScene, this.spaceCamera);
    renderer.compile(this.skyObjectRenderer.scene, this.skyObjectRenderer.camera);
    renderer.compile(this.localRingRenderer.scene, this.localRingRenderer.camera);
    renderer.compile(this.scene, this.camera);
    renderer.compile(this.hudScene, this.camera);

    renderer.clearDepth();
    renderer.render(this.spaceScene, this.spaceCamera);
    renderer.clearDepth();
    this.skyObjectRenderer.render(renderer);
    renderer.clearDepth();
    this.localRingRenderer.render(renderer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.clearDepth();
    renderer.render(this.hudScene, this.camera);
    renderer.getContext?.()?.finish?.();
  }

  prepareForReveal({
    renderer = this.renderer,
    renderTarget = null,
    elapsedTime = 0,
    width = window.innerWidth,
    height = window.innerHeight
  } = {}) {
    this.updateMaterialConfig(true, elapsedTime);
    this.updateTerrainTargetSize(width, height);

    this.terrainCamera = this.flight.getCameraBasis();

    this.groundMaterial.setTime(elapsedTime);
    this.groundMaterial.setCameraBasis(this.terrainCamera);
    this.updateSpaceBackground(elapsedTime);
    this.updateLandingLightingAndSky(elapsedTime);
    this.weatherRenderer.update({
      active: this.store.getState().activeView === "terrain-view",
      weather: this.getTerrainViewSettings().atmosphere.weather,
      terrainCamera: this.terrainCamera,
      elapsedTime,
      deltaTime: 0
    });
    this.updateHud(elapsedTime);
    this.updateCompassOverlay();

    renderer.compile(this.terrainScene, this.camera);
    renderer.compile(this.spaceScene, this.spaceCamera);
    renderer.compile(this.scene, this.camera);
    renderer.compile(this.hudScene, this.camera);

    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    const previousClearColor = new THREE.Color();

    renderer.getClearColor(previousClearColor);

    renderer.setRenderTarget(renderTarget ?? this.terrainTarget);
    renderer.setClearColor(0x000000, 0.0);
    renderer.clear(true, true, true);
    renderer.render(this.terrainScene, this.camera);

    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.setRenderTarget(previousTarget);

    renderer.autoClear = false;

    renderer.clearDepth();
    renderer.render(this.spaceScene, this.spaceCamera);

    renderer.clearDepth();
    this.skyObjectRenderer.render(renderer);

    renderer.clearDepth();
    this.localRingRenderer.render(renderer);

    renderer.clearDepth();
    renderer.render(this.scene, this.camera);

    renderer.clearDepth();
    renderer.render(this.hudScene, this.camera);

    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(previousTarget);
  }

  update({ deltaTime, elapsedTime }) {
    this.updateMaterialConfig(false, elapsedTime);
    this.applyTerrainBookmarkRestore(elapsedTime);
    this.updateTerrainTargetSize(this.getViewportWidth(), this.getViewportHeight());

    const state = this.store.getState();
    const active = state.activeView === "terrain-view";
    const bookmarkModeActive = Boolean(state.bookmarkMode?.active);
    const controlsActive = active && !bookmarkModeActive;

    if (controlsActive !== this.wasActive) {
      this.wasActive = controlsActive;
      this.input.setEnabled(controlsActive);
    }

    if (controlsActive) {
      const display = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
      this.input.setKeyBindings(display.keyBindings, { devToggleKey: display.devToggleKey });
      this.input.update(deltaTime);

      const settings = this.getTerrainViewSettings();

      this.lastFlightTelemetry = this.flight.update(deltaTime, elapsedTime, {
        groundHeight: this.flight.groundHeight,
        altitude: this.flight.baseAltitude,
        terrainHeightAtWorld: this.terrainHeightAtWorld,
        clearance: settings.flight.clearance,
        mouseSensitivity: settings.flight.mouseSensitivity,
        boostMultiplier: settings.flight.boostMultiplier,
        maxAltitude: settings.flight.maxAltitude,
        cushionMinRange: settings.flight.cushionMinRange,
        cushionClearanceFactor: settings.flight.cushionClearanceFactor,
        cushionBaseUpVelocity: settings.flight.cushionBaseUpVelocity,
        cushionSpeedFactor: settings.flight.cushionSpeedFactor,
        cushionApproach: settings.flight.cushionApproach,
        cushionDamping: settings.flight.cushionDamping,
        groundCatchupSmoothness: settings.flight.groundCatchupSmoothness
      });
    }

    this.terrainCamera = this.flight.getCameraBasis();

    this.groundMaterial.setTime(elapsedTime);
    this.groundMaterial.setCameraBasis(this.terrainCamera);
    this.updateSpaceBackground(elapsedTime);
    this.updateLandingLightingAndSky(elapsedTime);
    this.weatherRenderer.update({
      active,
      weather: this.getTerrainViewSettings().atmosphere.weather,
      terrainCamera: this.terrainCamera,
      elapsedTime,
      deltaTime
    });

    this.updateHud(elapsedTime);
    this.updateCompassOverlay();
  }

  getTerrainViewSettings() {
    const terrainView = this.galaxyConfig.terrainView ?? {};
    const activePlanet = this.getActivePlanet();
    const normalizedAtmosphere = normalizeAtmosphereConfig(terrainView.atmosphere ?? {});
    const globalClouds = normalizedAtmosphere.clouds;
    const planetAtmosphere = normalizePlanetAtmosphereConfig(
      activePlanet?.visual?.atmosphere ?? {}
    );
    const planetClouds = planetAtmosphere.clouds ?? {};
    const terrainRenderDistance = Math.min(
      this.getTerrainViewMaxRenderDistance(),
      getPlanetTerrainRenderDistance(activePlanet)
    );
    const fogLayer = syncTerrainFogLayer(planetAtmosphere.fog, terrainRenderDistance);
    const skyShaderId = normalizeSkyShaderId(
      activePlanet?.visual?.skyShaderId ?? terrainView.skyShaderId
    );

    return {
      hud: {
        enabled: terrainView.hud?.enabled ?? true,
        opacity: terrainView.hud?.opacity ?? 0.9,
        scale: terrainView.hud?.scale ?? 0.83
      },
      compass: {
        enabled: terrainView.compass?.enabled ?? true,
        opacity: terrainView.compass?.opacity ?? 0.95,
        sizePx: terrainView.compass?.sizePx ?? 240,
        bottomPx: terrainView.compass?.bottomPx ?? -10,
        translateYPx: terrainView.compass?.translateYPx ?? 0,
        centerYOffset: terrainView.compass?.centerYOffset ?? 0.5,
        scale: terrainView.compass?.scale ?? 75
      },
      skyShader: {
        shaderId: skyShaderId,
        params: normalizeSkyShaderParams(
          activePlanet?.visual?.skyShaderParams ?? terrainView.skyShaderParams ?? {},
          skyShaderId
        )
      },
      sky: {
        enabled: terrainView.sky?.enabled ?? true,
        sunIntensity: terrainView.sky?.sunIntensity ?? 1.15,
        nightAmbient: terrainView.sky?.nightAmbient ?? 0.045,
        dayAmbient: terrainView.sky?.dayAmbient ?? 0.19,
        sunMeshScale: terrainView.sky?.sunMeshScale ?? 1.0,
        sunHaloScale: terrainView.sky?.sunHaloScale ?? 3.2
      },
      atmosphere: {
        clouds: createTerrainCloudSettings({
          ...globalClouds,
          ...planetClouds,
          enabled: activePlanet?.visual?.atmosphere?.clouds?.enabled ?? planetClouds.enabled ?? globalClouds.enabled
        }, terrainRenderDistance),
        atmosphere: planetAtmosphere.atmosphere,
        aurora: planetAtmosphere.aurora,
        fog: fogLayer,
        weather: planetAtmosphere.weather
      },
      flight: {
        mouseSensitivity: terrainView.flight?.mouseSensitivity ?? 0.002,
        clearance: Math.max(150.0, terrainView.flight?.clearance ?? 150.0),
        boostMultiplier: terrainView.flight?.boostMultiplier ?? 2.0,
        maxAltitude: 5000.0,
        cushionMinRange: terrainView.flight?.cushionMinRange ?? 1.8,
        cushionClearanceFactor: terrainView.flight?.cushionClearanceFactor ?? 1.35,
        cushionBaseUpVelocity: terrainView.flight?.cushionBaseUpVelocity ?? 3.5,
        cushionSpeedFactor: terrainView.flight?.cushionSpeedFactor ?? 0.9,
        cushionApproach: terrainView.flight?.cushionApproach ?? 6.0,
        cushionDamping: terrainView.flight?.cushionDamping ?? 1.8,
        groundCatchupSmoothness: terrainView.flight?.groundCatchupSmoothness ?? 14.0
      }
    };
  }

  createTerrainPlanetConfig(planet) {
    const maxRenderDistance = this.getTerrainViewMaxRenderDistance();
    const terrainParams = planet?.visual?.terrainParams ?? {};
    const effectiveRenderDistance = Math.min(
      maxRenderDistance,
      getPlanetTerrainRenderDistance(planet)
    );

    return {
      ...(planet ?? {}),
      visual: {
        ...(planet?.visual ?? {}),
        terrainParams: {
          ...terrainParams,
          renderDistance: effectiveRenderDistance
        }
      }
    };
  }

  getTerrainViewMaxRenderDistance() {
    const value = Number(this.galaxyConfig.terrainView?.maxRenderDistance);
    return Number.isFinite(value)
      ? Math.max(5000, Math.min(15000, value))
      : 12000;
  }

  setTerrainPerformanceOverride(override) {
    const previousKey = this.performanceOverride
      ? `${this.performanceOverride.renderScale}:${this.performanceOverride.pixelation}`
      : "none";
    const nextKey = override
      ? `${override.renderScale}:${override.pixelation}`
      : "none";

    if (previousKey === nextKey) {
      return;
    }

    this.performanceOverride = override;
    this.lastTerrainResizeKey = "";
  }

  getTerrainRenderScale() {
    const adaptiveScale = Number(this.performanceOverride?.renderScale);

    if (Number.isFinite(adaptiveScale)) {
      return Math.min(1.5, Math.max(0.25, adaptiveScale));
    }

    const renderConfig = this.galaxyConfig.render ?? {};
    return Math.min(1.5, Math.max(0.35, renderConfig.renderScale ?? 1));
  }

  getTerrainPixelationScale() {
    const adaptivePixelation = Number(this.performanceOverride?.pixelation);
    const pixelation = Math.max(1, Number.isFinite(adaptivePixelation)
      ? adaptivePixelation
      : 1);

    return 1 / pixelation;
  }

  getActiveCloudBaseHeight() {
    const groundHeight = Number(this.flight?.groundHeight ?? this.lastFlightTelemetry?.ground ?? 0);

    if (Number.isFinite(groundHeight)) {
      return groundHeight;
    }

    const params = this.getActivePlanet()?.visual?.terrainParams ?? {};
    const baseHeight = Number(params.baseHeight ?? 0);

    return Number.isFinite(baseHeight) ? baseHeight : 0;
  }

  getViewportWidth() {
    return Math.max(1, this.canvas?.clientWidth || window.innerWidth || 1);
  }

  getViewportHeight() {
    return Math.max(1, this.canvas?.clientHeight || window.innerHeight || 1);
  }

  updateTerrainTargetSize(width, height) {
    const pixelRatio = this.renderer.getPixelRatio?.() ?? 1;
    const renderScale = this.getTerrainRenderScale();
    const pixelationScale = this.getTerrainPixelationScale();
    const effectiveRenderScale = Math.max(0.05, renderScale * pixelationScale);
    const resizeKey = `${width}:${height}:${pixelRatio}:${renderScale}:${pixelationScale}`;

    if (resizeKey === this.lastTerrainResizeKey) {
      return;
    }

    this.lastTerrainResizeKey = resizeKey;

    const terrainWidth = Math.max(1, Math.floor(width * pixelRatio * effectiveRenderScale));
    const terrainHeight = Math.max(1, Math.floor(height * pixelRatio * effectiveRenderScale));

    this.terrainTarget.setSize(terrainWidth, terrainHeight);

    // Terrain shader and its ray setup use the exact reduced target resolution.
    this.groundMaterial.setResolution(terrainWidth, terrainHeight, 1);
    this.terrainDisplayMaterial.map = this.terrainTarget.texture;
    this.terrainDisplayMaterial.needsUpdate = true;

    // Sky objects, local rings and HUD stay at full renderer resolution.
    this.skyObjectRenderer.setSize(width * pixelRatio, height * pixelRatio);
    this.localRingRenderer.setSize(width * pixelRatio, height * pixelRatio);
    this.weatherRenderer.setSize(width * pixelRatio, height * pixelRatio);
    this.hudMaterial.setResolution(width, height, pixelRatio);
  }

  getLandingContext() {
    return this.store.getState().terrainView.landingContext ?? null;
  }

  getLandingKey() {
    const state = this.store.getState();
    const context = state.terrainView.landingContext;
    const planetId = state.terrainView.activePlanetId ?? this.getActivePlanet()?.id ?? "none";

    if (!context) {
      return `${planetId}:${this.activeTerrainShaderId ?? "none"}:default`;
    }

    return `${context.systemId ?? "system"}:${context.planetId ?? planetId}:${context.sectorId ?? "sector"}:${context.entrySeed ?? 0}`;
  }

  updateLandingLightingAndSky(elapsedTime) {
    const settings = this.getTerrainViewSettings();
    const context = this.getLandingContext();
    const activeSystem = this.getActiveSystem();
    const active = this.store.getState().activeView === "terrain-view";
    const sunDirection = context?.sunDirectionLocal ?? [0.46, 0.72, 0.38];
    const sunColor = context?.skyObjects?.find((object) => object.type === "star")?.color ??
      activeSystem?.star?.color ??
      [1.0, 0.72, 0.36];
    const sunElevation = sunDirection[1] ?? 0.72;
    const sunFactors = computeTerrainSunFactors(sunElevation);
    const sunHeight01 = sunFactors.skyAtmosphereFactor;
    const ambientIntensity = settings.sky.nightAmbient +
      (settings.sky.dayAmbient - settings.sky.nightAmbient) * sunFactors.ambientDayFactor;

    this.groundMaterial.setLighting({
      sunDirection,
      sunHeight01,
      sunColor,
      sunIntensity: settings.sky.sunIntensity * sunFactors.directLightFactor,
      ambientIntensity
    });

    this.groundMaterial.setSkyConfig(this.createEffectiveSkyShaderConfig(settings.skyShader));

    this.localRingRenderer.update({
      active,
      planet: this.getActivePlanet(),
      landingContext: context,
      terrainCamera: this.terrainCamera,
      elapsedTime
    });

    this.skyObjectRenderer.update({
      active,
      settings: settings.sky,
      system: activeSystem,
      landingContext: context,
      terrainCamera: this.terrainCamera,
      elapsedTime
    });

    this.groundMaterial.setAtmosphereConfig(settings.atmosphere);
  }

  updateHud(elapsedTime) {
    const settings = this.getTerrainViewSettings();
    const state = this.store.getState();
    const active = state.activeView === "terrain-view" && !Boolean(state.bookmarkMode?.active && state.bookmarkMode?.mode === "ambient");

    this.hudQuad.visible = active && settings.hud.enabled && settings.hud.opacity > 0.001;

    if (!this.hudQuad.visible) {
      return;
    }

    const rollDegrees = ((this.flight.rollTotal * 180 / Math.PI) % 360 + 360) % 360;

    this.hudMaterial.updateHud({
      timeSeconds: elapsedTime,
      targetOffset: this.input.hudTarget,
      lagOffset: this.input.hudLagTarget,
      altitudeMeters: this.lastFlightTelemetry.heightAboveGround,
      cameraRotationDegrees: rollDegrees,
      altitudeTapeOffset: 0.12,
      rollRadians: this.flight.rollTotal,
      opacity: settings.hud.opacity,
      scale: settings.hud.scale
    });
  }

  updateCompassOverlay() {
    const settings = this.getTerrainViewSettings();
    const state = this.store.getState();
    const active = state.activeView === "terrain-view" && !Boolean(state.bookmarkMode?.active && state.bookmarkMode?.mode === "ambient");

    this.compassOverlay.update({
      active,
      settings: settings.compass,
      flight: this.flight,
      controls: this.input.controls,
      telemetry: this.lastFlightTelemetry
    });
  }

  resize(width, height) {
    this.updateTerrainTargetSize(width, height);

    this.spaceCamera.aspect = width / Math.max(1, height);
    this.spaceCamera.updateProjectionMatrix();

    if (this.spaceBackgroundMaterial) {
      this.renderer.getDrawingBufferSize(
        this.spaceBackgroundMaterial.uniforms.uResolution.value
      );
    }
  }

  render() {
    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;
    const previousClearAlpha = this.renderer.getClearAlpha();
    const previousClearColor = new THREE.Color();
    const previousViewport = new THREE.Vector4();
    this.renderer.getClearColor(previousClearColor);
    this.renderer.getViewport(previousViewport);

    this.renderer.setRenderTarget(this.terrainTarget);
    this.renderer.setViewport(0, 0, this.terrainTarget.width, this.terrainTarget.height);
    this.renderer.setClearColor(0x000000, 0.0);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.terrainScene, this.camera);

    this.renderer.setClearColor(previousClearColor, previousClearAlpha);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setViewport(previousViewport);

    this.renderer.autoClear = false;

    // Space background first. TerrainSurfaceMaterial outputs transparent sky,
    // so this explicit pass keeps the configured space shader visible.
    this.renderer.clearDepth();
    this.renderer.render(this.spaceScene, this.spaceCamera);

    // Real system sky: SunMaterial/SunHaloMaterial, other planets, other rings.
    // The transparent terrain quad is rendered afterwards and masks sky objects only where
    // terrain/cloud pixels are present.
    this.renderer.clearDepth();
    this.skyObjectRenderer.render(this.renderer);

    // Local planet ring also belongs behind terrain, but after sky objects so it can
    // visually pass in front of the sun.
    this.renderer.clearDepth();
    this.localRingRenderer.render(this.renderer);

    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);

    this.weatherRenderer.render(this.renderer);

    this.renderer.autoClear = previousAutoClear;
  }

  renderHudOverlay() {
    if (this.store.getState().activeView !== "terrain-view") {
      return;
    }

    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;

    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.hudScene, this.camera);

    this.renderer.autoClear = previousAutoClear;
    this.renderer.setRenderTarget(previousTarget);
  }

  destroy() {
    this.input.destroy();
    this.quad.geometry?.dispose?.();
    this.quad.material?.dispose?.();
    this.skyObjectRenderer?.destroy?.();
    this.localRingRenderer?.destroy?.();
    this.weatherRenderer?.destroy?.();

    if (this.spaceBackground) {
      this.spaceScene.remove(this.spaceBackground);
      this.spaceBackground.geometry?.dispose?.();
      this.spaceBackground.material?.dispose?.();
      this.spaceBackground = null;
      this.spaceBackgroundMaterial = null;
    }

    this.hudQuad.geometry?.dispose?.();
    this.hudQuad.material?.dispose?.();
    this.terrainTarget?.dispose?.();
    this.compassOverlay?.destroy?.();
    this.terrainDisplayQuad.geometry?.dispose?.();
    this.terrainDisplayQuad.material?.dispose?.();
    this.terrainScene?.clear?.();
    this.hudScene?.clear?.();
    this.scene?.clear?.();
  }
}



function getPlanetTerrainRenderDistance(planet) {
  const value = Number(planet?.visual?.terrainParams?.renderDistance);
  return Number.isFinite(value) ? Math.max(1000, Math.min(30000, value)) : 18000.0;
}

function syncTerrainFogLayer(fogLayer = {}, renderDistance = 18000.0) {
  const shaderId = fogLayer.shaderId ?? "none-fog";

  return {
    ...fogLayer,
    params: {
      ...(fogLayer.params ?? {}),
      height: shaderId === "fog-clouds" ? 0.01 : fogLayer.params?.height ?? 0.25,
      renderDistance,
      fadeDistance: renderDistance
    }
  };
}

function createTerrainCloudSettings(clouds = {}, renderDistance = 18000.0) {
  return {
    ...clouds,
    enabled: Boolean(clouds.enabled),
    density: clampNumber(clouds.density ?? 1.25, 0.0, 2.0),
    opacity: clampNumber(clouds.opacity ?? 0.72, 0.0, 1.0),
    brightness: clampNumber(clouds.brightness ?? 1.15, 0.2, 2.0),
    scale: clampNumber(clouds.scale ?? 0.12, 0.01, 0.25),
    height: Math.max(1.2, Number(clouds.height ?? 1.2)),
    blurStrength: Math.max(0.4, Number(clouds.blurStrength ?? 0.4)),
    deckThickness: clampNumber(clouds.deckThickness ?? 0.86, 0.75, 1.0),
    patchiness: clampNumber(clouds.patchiness ?? 0.0, 0.0, 1.0),
    bigPatches: clampNumber(clouds.bigPatches ?? 0.0, 0.0, 1.0),
    heightVariation: clampNumber(clouds.heightVariation ?? 0.0, 0.0, 1.0),
    renderDistance,
    fadeDistance: renderDistance
  };
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.max(min, Math.min(max, number));
}

function computeTerrainSunFactors(rawElevation) {
  const elevation = Number.isFinite(Number(rawElevation)) ? Number(rawElevation) : 0.72;

  return {
    // Drives sky haze and sun visibility. Twilight keeps some atmosphere,
    // but no longer restores full daylight when the sun is barely visible.
    skyAtmosphereFactor: smoothStep(-0.055, 0.18, elevation),
    // Drives direct terrain light. Kept stricter than skyAtmosphereFactor so
    // sunset sectors do not get full day lighting.
    directLightFactor: smoothStep(0.025, 0.32, elevation),
    // Drives ambient blend only. Night stays dark; twilight is intentionally
    // restrained and should not wash the terrain.
    ambientDayFactor: smoothStep(0.0, 0.42, elevation)
  };
}

function smoothStep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createTerrainSpaceMaterial() {
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
    params.horizonGlow ?? 0.55,
    params.horizonDepth ?? params.depth ?? 1.2,
    params.starCount ?? params.starIntensity ?? 1.6,
    params.starDensity ?? 110
  ];
}


function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
