import {
  MAX_SYSTEM_PLANETS,
  normalizePlanetConfig,
  normalizePlanetAtmosphereConfig,
  normalizePlanetOrbitViewConfig,
  normalizePlanetSurfaceTextureParams,
  normalizePlanetTerrainParams,
  normalizeRenderConfig,
  normalizeDisplayConfig,
  normalizeTerrainViewConfig,
  normalizeAtmosphereConfig,
  normalizeSkyShaderId,
  normalizeSkyShaderParams,
  normalizeRingConfig,
  normalizeSpaceShaderParams,
  normalizeStellarObjectViewConfig,
  normalizeSystemConfig,
  setSystemPlanetCount
} from "../core/configSchema.js";

import {
  GENERAL_RENDER_OPTIONS,
  INITIAL_COLLAPSED_SECTIONS,
  PLANET_SHADER_OPTIONS,
  PLANET_TEXTURE_OPTIONS,
  PLANET_TEXTURE_PARAMS,
  SPACE_SHADER_OPTIONS
} from "./system-panel/controlOptions.js";

export class SystemConfigPanel {
  constructor({ rootElement, galaxyConfig, store }) {
    this.rootElement = rootElement;
    this.galaxyConfig = galaxyConfig;
    this.store = store;

    this.element = document.createElement("aside");
    this.element.className = "system-config-panel";

    this.collapsedSections = new Set(INITIAL_COLLAPSED_SECTIONS);
    this.isPanelCollapsed = false;
    this.unsubscribe = null;
    this.lastRenderKey = "";

    this.handleClick = this.handleClick.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handlePointerBarrier = this.handlePointerBarrier.bind(this);
  }

  mount() {
    this.rootElement.appendChild(this.element);

    this.element.addEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.addEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.addEventListener("click", this.handleClick);
    this.element.addEventListener("input", this.handleInput);
    this.element.addEventListener("change", this.handleChange);

    this.unsubscribe = this.store.subscribe(() => {
      const nextRenderKey = this.createRenderKey();

      if (nextRenderKey !== this.lastRenderKey) {
        this.render();
      }
    });

    this.render();
  }

  destroy() {
    this.unsubscribe?.();

    this.element.removeEventListener("pointerdown", this.handlePointerBarrier, true);
    this.element.removeEventListener("pointerup", this.handlePointerBarrier, true);
    this.element.removeEventListener("click", this.handleClick);
    this.element.removeEventListener("input", this.handleInput);
    this.element.removeEventListener("change", this.handleChange);
    this.element.remove();
  }

  handlePointerBarrier(event) {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  createRenderKey() {
    const state = this.store.getState();
    const activeSystemId = state.systemView?.activeSystemId ?? "";
    const selectedPlanetId = this.store.getSystemEditorSelectedPlanetId?.(activeSystemId) ?? "";
    const display = normalizeDisplayConfig(this.galaxyConfig.display ?? {});

    return JSON.stringify({
      activeView: state.activeView,
      configRevision: state.configRevision,
      activeSystemId,
      selectedPlanetId,
      devModeEnabled: display.devModeEnabled,
      collapsed: this.isPanelCollapsed
    });
  }

  handleClick(event) {
    const actionButton = event.target.closest("[data-config-action]");

    if (actionButton) {
      const action = actionButton.dataset.configAction;

      if (action === "toggle-config-panel") {
        this.isPanelCollapsed = !this.isPanelCollapsed;
        this.render();
        return;
      }

      if (action === "export-system-json") {
        this.exportSelectedSystemJson();
        return;
      }

      if (action === "import-system-json") {
        const fileInput = this.element.querySelector(
          "[data-config-file-input='system-json']"
        );

        fileInput?.click();
        return;
      }
    }

    const sectionButton = event.target.closest("[data-config-section]");

    if (!sectionButton) {
      return;
    }

    const sectionId = sectionButton.dataset.configSection;

    if (this.collapsedSections.has(sectionId)) {
      this.collapsedSections.delete(sectionId);
    } else {
      this.collapsedSections.add(sectionId);
    }

    this.render();
  }

  handleInput(event) {
    this.applyControlChange(event.target);
  }

  handleChange(event) {
    const control = event.target;

    if (control.dataset.configFileInput === "system-json") {
      this.importSelectedSystemJson(control);
      return;
    }

    this.applyControlChange(control);
  }

  exportSelectedSystemJson() {
    const previousPanelScrollTop = this.element.scrollTop;
    const system = this.getSelectedSystem();

    if (!system) {
      return;
    }

    const exportData = {
      version: 1,
      type: "space-flyer-system-config",
      exportedAt: new Date().toISOString(),
      render: cloneJson(normalizeRenderConfig(this.galaxyConfig.render ?? {})),
      display: cloneJson(normalizeDisplayConfig(this.galaxyConfig.display ?? {})),
      terrainView: cloneJson(normalizeTerrainViewConfig(this.galaxyConfig.terrainView ?? {})),
      stellarObjectView: cloneJson(normalizeStellarObjectViewConfig(this.galaxyConfig.stellarObjectView ?? {})),
      system: cloneJson(system)
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const filename = `${sanitizeFilename(system.name || system.id)}.system.json`;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  async importSelectedSystemJson(fileInput) {
    const system = this.getSelectedSystem();
    const file = fileInput.files?.[0];

    fileInput.value = "";

    if (!system || !file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const importedSystemInput = parsed.system ?? parsed;
      const normalizedImportedSystem = normalizeSystemConfig({
        ...system,
        ...importedSystemInput,
        id: system.id,
        seed: system.seed,
        position: system.position,
        color: system.color,
        size: system.size,
        discovered: system.discovered
      });

      Object.assign(system, {
        name: normalizedImportedSystem.name,
        visual: normalizedImportedSystem.visual,
        star: normalizedImportedSystem.star,
        planets: normalizedImportedSystem.planets,
        summary: {
          ...system.summary,
          ...normalizedImportedSystem.summary,
          planetCount: getVisiblePlanetCount(normalizedImportedSystem)
        }
      });

      if (parsed.render) {
        this.galaxyConfig.render = normalizeRenderConfig(parsed.render);
      }

      if (parsed.display) {
        this.galaxyConfig.display = normalizeDisplayConfig(parsed.display);
      }

      if (parsed.terrainView) {
        this.galaxyConfig.terrainView = normalizeTerrainViewConfig(parsed.terrainView);
      }

      if (parsed.stellarObjectView) {
        this.galaxyConfig.stellarObjectView = normalizeStellarObjectViewConfig(parsed.stellarObjectView);
      }

      this.store.notifyConfigChanged();
    } catch (error) {
      console.error("System config import failed:", error);
      window.alert("System JSON konnte nicht importiert werden.");
    }
  }

  applyControlChange(control) {
    if (!control.dataset.field) {
      return;
    }

    const system = this.getSelectedSystem();

    if (!system) {
      return;
    }

    const field = control.dataset.field;
    const selectedPlanet = this.getSelectedPlanet(system);

    if (field === "runtime.systemView.systemSpeed") {
      const value = Math.max(-10, Math.min(10, readNumber(control, 1)));

      this.store.setSystemViewState({
        systemSpeed: value
      });

      return;
    }

    if (field === "runtime.systemView.gravityGridEnabled") {
      this.store.setSystemViewState({
        gravityGridEnabled: Boolean(control.checked)
      });

      return;
    }

    if (field === "runtime.systemView.gravityGridScale") {
      const value = Math.max(0.25, Math.min(4, readNumber(control, 1)));

      this.store.setSystemViewState({
        gravityGridScale: value
      });

      return;
    }

    if (field === "runtime.systemView.gravityGridWeight") {
      const value = Math.max(0, Math.min(4, readNumber(control, 1)));

      this.store.setSystemViewState({
        gravityGridWeight: value
      });

      return;
    }

    if (field.startsWith("render.")) {
      const paramKey = field.replace("render.", "");

      this.galaxyConfig.render ??= normalizeRenderConfig({});
      this.galaxyConfig.render[paramKey] = readNumber(
        control,
        this.galaxyConfig.render[paramKey] ?? 1
      );
      this.galaxyConfig.render = normalizeRenderConfig(this.galaxyConfig.render);

      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.skyShaderId") {
      if (!selectedPlanet) {
        return;
      }

      selectedPlanet.visual ??= {};
      const nextSkyShaderId = control instanceof HTMLInputElement && control.type === "checkbox"
        ? control.checked ? "thin-atmosphere" : "none"
        : control.value;
      selectedPlanet.visual.skyShaderId = normalizeSkyShaderId(nextSkyShaderId);
      selectedPlanet.visual.skyShaderParams = normalizeSkyShaderParams(
        selectedPlanet.visual.skyShaderParams ?? {},
        selectedPlanet.visual.skyShaderId
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.skyShaderParams.")) {
      if (!selectedPlanet) {
        return;
      }

      const paramKey = field.replace("planet.visual.skyShaderParams.", "");

      selectedPlanet.visual ??= {};
      selectedPlanet.visual.skyShaderId = normalizeSkyShaderId(
        selectedPlanet.visual.skyShaderId
      );
      selectedPlanet.visual.skyShaderParams = normalizeSkyShaderParams({
        ...(selectedPlanet.visual.skyShaderParams ?? {}),
        [paramKey]: readNumber(
          control,
          selectedPlanet.visual.skyShaderParams?.[paramKey] ?? 0
        )
      }, selectedPlanet.visual.skyShaderId);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.atmosphere.aurora.enabled") {
      if (!selectedPlanet) {
        return;
      }

      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        aurora: {
          ...(selectedPlanet.visual.atmosphere?.aurora ?? {}),
          enabled: Boolean(control.checked)
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.atmosphere.aurora.params.")) {
      if (!selectedPlanet) {
        return;
      }

      const paramKey = field.replace("planet.visual.atmosphere.aurora.params.", "");

      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        aurora: {
          ...(selectedPlanet.visual.atmosphere?.aurora ?? {}),
          params: {
            ...(selectedPlanet.visual.atmosphere?.aurora?.params ?? {}),
            [paramKey]: readNumber(
              control,
              selectedPlanet.visual.atmosphere?.aurora?.params?.[paramKey] ?? 0
            )
          }
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.atmosphere.atmosphere.shaderId") {
      const nextShaderId = control instanceof HTMLInputElement && control.type === "checkbox"
        ? control.checked ? "atmosphere-flow" : "none-atmosphere"
        : control.value;
      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        atmosphere: {
          ...(selectedPlanet.visual.atmosphere?.atmosphere ?? {}),
          shaderId: nextShaderId
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.atmosphere.atmosphere.params.")) {
      const paramKey = field.replace("planet.visual.atmosphere.atmosphere.params.", "");

      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        atmosphere: {
          ...(selectedPlanet.visual.atmosphere?.atmosphere ?? {}),
          params: {
            ...(selectedPlanet.visual.atmosphere?.atmosphere?.params ?? {}),
            [paramKey]: readNumber(
              control,
              selectedPlanet.visual.atmosphere?.atmosphere?.params?.[paramKey] ?? 0
            )
          }
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.atmosphere.weather.shaderId") {
      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        weather: {
          ...(selectedPlanet.visual.atmosphere?.weather ?? {}),
          shaderId: control.value,
          params: {}
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.atmosphere.weather.params.")) {
      const paramKey = field.replace("planet.visual.atmosphere.weather.params.", "");

      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        weather: {
          ...(selectedPlanet.visual.atmosphere?.weather ?? {}),
          params: {
            ...(selectedPlanet.visual.atmosphere?.weather?.params ?? {}),
            [paramKey]: readNumber(
              control,
              selectedPlanet.visual.atmosphere?.weather?.params?.[paramKey] ?? 0
            )
          }
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.atmosphere.fog.shaderId") {
      const nextShaderId = control instanceof HTMLInputElement && control.type === "checkbox"
        ? control.checked ? "fog-clouds" : "none-fog"
        : control.value;
      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        fog: {
          ...(selectedPlanet.visual.atmosphere?.fog ?? {}),
          shaderId: nextShaderId
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.atmosphere.fog.params.")) {
      const paramKey = field.replace("planet.visual.atmosphere.fog.params.", "");

      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        fog: {
          ...(selectedPlanet.visual.atmosphere?.fog ?? {}),
          params: {
            ...(selectedPlanet.visual.atmosphere?.fog?.params ?? {}),
            [paramKey]: readNumber(
              control,
              selectedPlanet.visual.atmosphere?.fog?.params?.[paramKey] ?? 0
            )
          }
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "terrainView.atmosphere.clouds.tint") {
      this.galaxyConfig.terrainView ??= {};
      this.galaxyConfig.terrainView.atmosphere = normalizeAtmosphereConfig({
        ...(this.galaxyConfig.terrainView.atmosphere ?? {}),
        clouds: {
          ...(this.galaxyConfig.terrainView.atmosphere?.clouds ?? {}),
          tint: hexToColorArray(control.value)
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("terrainView.atmosphere.clouds.")) {
      const paramKey = field.replace("terrainView.atmosphere.clouds.", "");

      this.galaxyConfig.terrainView ??= {};
      this.galaxyConfig.terrainView.atmosphere = normalizeAtmosphereConfig({
        ...(this.galaxyConfig.terrainView.atmosphere ?? {}),
        clouds: {
          ...(this.galaxyConfig.terrainView.atmosphere?.clouds ?? {}),
          [paramKey]: readNumber(
            control,
            this.galaxyConfig.terrainView.atmosphere?.clouds?.[paramKey] ?? 0
          )
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "system.name") {
      system.name = control.value.trim() || system.id;
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "visual.spaceShaderId") {
      system.visual.spaceShaderId = control.value;
      system.visual.spaceShaderParams = normalizeSpaceShaderParams(
        control.value,
        system.visual.spaceShaderParams
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("visual.spaceShaderParams.")) {
      const paramKey = field.replace("visual.spaceShaderParams.", "");

      system.visual.spaceShaderParams ??= {};
      system.visual.spaceShaderParams[paramKey] = readNumber(
        control,
        system.visual.spaceShaderParams[paramKey] ?? 0
      );

      system.visual.spaceShaderParams = normalizeSpaceShaderParams(
        system.visual.spaceShaderId,
        system.visual.spaceShaderParams
      );

      this.store.notifyConfigChanged();
      return;
    }

    if (field === "visual.sunShaderId") {
      system.visual.sunShaderId = control.value;
      system.star.shaderId = control.value;
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.radius") {
      system.star.radius = readNumber(control, system.star.radius);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.brightness") {
      system.star.brightness = readNumber(control, system.star.brightness);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.haloBrightness") {
      system.star.haloBrightness = readNumber(
        control,
        system.star.haloBrightness
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.glow") {
      system.star.glow = readNumber(control, system.star.glow);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.corona") {
      system.star.corona = readNumber(control, system.star.corona);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.flare") {
      system.star.flare = readNumber(control, system.star.flare);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.surfaceScale") {
      system.star.surfaceScale = readNumber(control, system.star.surfaceScale);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.coronaScale") {
      system.star.coronaScale = readNumber(control, system.star.coronaScale);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.surfaceAnimationSpeed") {
      system.star.surfaceAnimationSpeed = readNumber(
        control,
        system.star.surfaceAnimationSpeed
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.sphereRotationSpeed") {
      system.star.sphereRotationSpeed = readNumber(
        control,
        system.star.sphereRotationSpeed
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.coronaSpeed") {
      system.star.coronaSpeed = readNumber(control, system.star.coronaSpeed);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "star.color") {
      system.star.color = hexToColorArray(control.value);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "selectedPlanetId") {
      const planetId = control.value;
      this.store.setSystemEditorSelectedPlanetId(system.id, planetId);

      const state = this.store.getState();
      const isActiveSystem =
        state.activeView === "system-view" &&
        state.systemView.activeSystemId === system.id;

      if (isActiveSystem && planetId) {
        this.store.selectSystemBody(planetId);

        if (state.systemView.mode === "orbit") {
          this.store.enterOrbitView(planetId);
        }
      }

      return;
    }

    if (field === "planetCount") {
      setSystemPlanetCount(system, Number(control.value));
      this.store.notifyConfigChanged();
      return;
    }

    if (!selectedPlanet) {
      return;
    }

    if (field === "planet.name") {
      selectedPlanet.name = control.value.trim() || selectedPlanet.id;
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.terrainShaderId") {
      const nextShaderId = control.value;

      selectedPlanet.visual.terrainShaderId = nextShaderId;

      // Shader switches must start from the target shader defaults.
      // Reusing previous terrainParams can leak same-key values such as
      // featureScale/textureScale/crackScale into the new shader. That was
      // why switching via "none" appeared to fix the override state.
      selectedPlanet.visual.terrainParams = normalizePlanetTerrainParams(
        nextShaderId,
        {}
      );

      selectedPlanet.orbitView = {
        featureScale: null,
        textureScale: null,
        contrast: null,
        hue: 0.0,
        saturation: 1.0
      };

      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.terrainParams.")) {
      const paramKey = field.replace("planet.visual.terrainParams.", "");

      selectedPlanet.visual.terrainParams ??= {};
      selectedPlanet.visual.terrainParams[paramKey] = readNumber(
        control,
        selectedPlanet.visual.terrainParams[paramKey] ?? 0
      );

      selectedPlanet.visual.terrainParams = normalizePlanetTerrainParams(
        selectedPlanet.visual.terrainShaderId,
        selectedPlanet.visual.terrainParams
      );

      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.orbitView.")) {
      const paramKey = field.replace("planet.orbitView.", "");

      selectedPlanet.orbitView ??= {
        featureScale: null,
        textureScale: null,
        contrast: null,
        hue: 0.0,
        saturation: 1.0
      };

      selectedPlanet.orbitView[paramKey] = readNumber(
        control,
        selectedPlanet.orbitView[paramKey] ?? 0
      );

      selectedPlanet.orbitView = normalizePlanetOrbitViewConfig(
        selectedPlanet.orbitView,
        selectedPlanet.visual.terrainShaderId,
        selectedPlanet.visual.terrainParams
      );

      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.surfaceTextureId") {
      selectedPlanet.visual.surfaceTextureId = control.value;
      selectedPlanet.visual.surfaceTextureParams = normalizePlanetSurfaceTextureParams(
        selectedPlanet.visual.surfaceTextureParams
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.surfaceTextureParams.")) {
      const paramKey = field.replace("planet.visual.surfaceTextureParams.", "");

      selectedPlanet.visual.surfaceTextureParams ??= {};
      selectedPlanet.visual.surfaceTextureParams[paramKey] = readNumber(
        control,
        selectedPlanet.visual.surfaceTextureParams[paramKey] ?? 0
      );

      selectedPlanet.visual.surfaceTextureParams =
        normalizePlanetSurfaceTextureParams(
          selectedPlanet.visual.surfaceTextureParams
        );

      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.orbit.radius") {
      selectedPlanet.orbit.radius = readNumber(
        control,
        selectedPlanet.orbit.radius
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.orbit.inclination") {
      selectedPlanet.orbit.inclination = readNumber(
        control,
        selectedPlanet.orbit.inclination
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.orbit.speed") {
      selectedPlanet.orbit.speed = readNumber(
        control,
        selectedPlanet.orbit.speed
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.body.radius") {
      selectedPlanet.body.radius = readNumber(
        control,
        selectedPlanet.body.radius
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.body.axialTilt") {
      selectedPlanet.body.axialTilt = readNumber(
        control,
        selectedPlanet.body.axialTilt
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.body.rotationSpeed") {
      selectedPlanet.body.rotationSpeed = readNumber(
        control,
        selectedPlanet.body.rotationSpeed
      );
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.moons.count") {
      selectedPlanet.moons = {
        ...(selectedPlanet.moons ?? {}),
        count: clampInteger(readNumber(control, selectedPlanet.moons?.count ?? 0), 0, 10)
      };
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.moons.radiusScale") {
      selectedPlanet.moons = {
        ...(selectedPlanet.moons ?? {}),
        radiusScale: Math.max(0.35, Math.min(3.0, readNumber(control, selectedPlanet.moons?.radiusScale ?? 1)))
      };
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.moons.sizeScale") {
      selectedPlanet.moons = {
        ...(selectedPlanet.moons ?? {}),
        sizeScale: Math.max(0.25, Math.min(3.0, readNumber(control, selectedPlanet.moons?.sizeScale ?? 1)))
      };
      this.store.notifyConfigChanged();
      return;
    }


    if (field === "planet.visual.showGrid") {
      selectedPlanet.visual.showGrid = Boolean(control.checked);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.showInclinationIndicators") {
      selectedPlanet.visual.showInclinationIndicators = Boolean(control.checked);
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.atmosphere.clouds.enabled") {
      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        clouds: {
          ...(selectedPlanet.visual.atmosphere?.clouds ?? {}),
          enabled: Boolean(control.checked)
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.atmosphere.clouds.")) {
      const paramKey = field.replace("planet.visual.atmosphere.clouds.", "");

      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig({
        ...(selectedPlanet.visual.atmosphere ?? {}),
        clouds: {
          ...(selectedPlanet.visual.atmosphere?.clouds ?? {}),
          [paramKey]: readNumber(
            control,
            selectedPlanet.visual.atmosphere?.clouds?.[paramKey] ?? 0
          )
        }
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.ring.enabled") {
      selectedPlanet.visual.ring = normalizeRingConfig({
        ...(selectedPlanet.visual.ring ?? {}),
        enabled: Boolean(control.checked)
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field === "planet.visual.ring.color") {
      selectedPlanet.visual.ring = normalizeRingConfig({
        ...(selectedPlanet.visual.ring ?? {}),
        color: hexToColorArray(control.value)
      });
      this.store.notifyConfigChanged();
      return;
    }

    if (field.startsWith("planet.visual.ring.")) {
      const paramKey = field.replace("planet.visual.ring.", "");

      selectedPlanet.visual.ring = normalizeRingConfig({
        ...(selectedPlanet.visual.ring ?? {}),
        [paramKey]: readNumber(
          control,
          selectedPlanet.visual.ring?.[paramKey] ?? 0
        )
      });

      this.store.notifyConfigChanged();
    }
  }

  render() {
    const previousPanelScrollTop = this.element?.scrollTop ?? 0;

    this.lastRenderKey = this.createRenderKey();
    this.galaxyConfig.display = normalizeDisplayConfig(this.galaxyConfig.display ?? {});
    const state = this.store.getState();
    const isHidden = !this.galaxyConfig.display.devModeEnabled || state.activeView === "stellar-object-view";
    this.element.classList.toggle("is-hidden", isHidden);
    this.element.classList.toggle("is-collapsed", this.isPanelCollapsed);

    if (isHidden) {
      this.element.innerHTML = "";
      return;
    }

    if (this.isPanelCollapsed) {
      this.element.innerHTML = renderConfigPanelHeader({ collapsed: true });
      return;
    }

    const system = this.getSelectedSystem();

    if (!system) {
      this.element.innerHTML = `
        ${renderConfigPanelHeader({ collapsed: false })}
        <p class="config-muted">No system selected.</p>
      `;

      return;
    }

    if (!Array.isArray(system.planets) || system.planets.length === 0) {
      system.planets = [normalizePlanetConfig({}, 0)];
    }

    while (system.planets.length < MAX_SYSTEM_PLANETS) {
      system.planets.push(normalizePlanetConfig({}, system.planets.length));
    }

    system.planets = system.planets
      .slice(0, MAX_SYSTEM_PLANETS)
      .map((planet, index) => normalizePlanetConfig(planet, index));

    system.summary ??= {};
    system.summary.planetCount = getVisiblePlanetCount(system);

    system.visual.spaceShaderParams = normalizeSpaceShaderParams(
      system.visual.spaceShaderId,
      system.visual.spaceShaderParams
    );

    this.galaxyConfig.render = normalizeRenderConfig(this.galaxyConfig.render);
    this.galaxyConfig.terrainView ??= {};
    this.galaxyConfig.terrainView.atmosphere = {
      clouds: normalizeAtmosphereConfig(this.galaxyConfig.terrainView.atmosphere ?? {}).clouds
    };

    const selectedPlanet = this.getSelectedPlanet(system);

    if (selectedPlanet) {
      selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig(
        selectedPlanet.visual.atmosphere ?? {}
      );
    }
    const selectedPlanetId = selectedPlanet?.id ?? "";

    const systemState = this.store.getState().systemView ?? {};
    const systemSpeed = Math.max(
      -10,
      Math.min(10, Number(systemState.systemSpeed ?? 1))
    );
    const gravityGridEnabled = Boolean(systemState.gravityGridEnabled);
    const gravityGridScale = Number.isFinite(Number(systemState.gravityGridScale))
      ? Number(systemState.gravityGridScale)
      : 1;
    const gravityGridWeight = Number.isFinite(Number(systemState.gravityGridWeight))
      ? Number(systemState.gravityGridWeight)
      : 1;

    const configBody = `
      <div class="config-row config-row-wide">
        <button
          class="panel-button"
          type="button"
          data-config-action="export-system-json"
        >
          Export System JSON
        </button>
      </div>

      <div class="config-row config-row-wide">
        <button
          class="panel-button"
          type="button"
          data-config-action="import-system-json"
        >
          Import System JSON
        </button>

        <input
          data-config-file-input="system-json"
          type="file"
          accept="application/json,.json"
          hidden
        />
      </div>
    `;

    const generalBody = renderGeneralControls(this.galaxyConfig.render);

    const systemBody = `
      <div class="config-row">
        <label for="systemConfigSystemId">System ID</label>
        <input
          id="systemConfigSystemId"
          type="text"
          value="${escapeHtml(system.id)}"
          readonly
        />
      </div>

      <div class="config-row">
        <label for="systemConfigSystemName">Name</label>
        <input
          id="systemConfigSystemName"
          data-field="system.name"
          type="text"
          spellcheck="false"
          value="${escapeHtml(system.name)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigPlanetCount">Planet Count</label>
        <input
          id="systemConfigPlanetCount"
          data-field="planetCount"
          type="range"
          min="1"
          max="${MAX_SYSTEM_PLANETS}"
          step="1"
          value="${getVisiblePlanetCount(system)}"
        />
        <span>${getVisiblePlanetCount(system)}</span>
      </div>

      <div class="config-row">
        <label for="systemConfigSystemSpeed">System Speed</label>
        <input
          id="systemConfigSystemSpeed"
          data-field="runtime.systemView.systemSpeed"
          type="range"
          min="-10"
          max="10"
          step="0.1"
          value="${formatNumber(systemSpeed, 1)}"
        />
        <input
          class="config-number-input"
          data-field="runtime.systemView.systemSpeed"
          type="number"
          min="-10"
          max="10"
          step="0.1"
          value="${formatNumber(systemSpeed, 1)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigGravityGridEnabled">Gravity Grid</label>
        <input
          id="systemConfigGravityGridEnabled"
          data-field="runtime.systemView.gravityGridEnabled"
          type="checkbox"
          ${gravityGridEnabled ? "checked" : ""}
        />
        <span>${gravityGridEnabled ? "On" : "Off"}</span>
      </div>

      <div class="config-row">
        <label for="systemConfigGravityGridScale">Grid Scale</label>
        <input
          id="systemConfigGravityGridScale"
          data-field="runtime.systemView.gravityGridScale"
          type="range"
          min="0.25"
          max="4"
          step="0.05"
          value="${formatNumber(gravityGridScale, 2)}"
        />
        <input
          class="config-number-input"
          data-field="runtime.systemView.gravityGridScale"
          type="number"
          min="0.25"
          max="4"
          step="0.05"
          value="${formatNumber(gravityGridScale, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigGravityGridWeight">Gravity Weight</label>
        <input
          id="systemConfigGravityGridWeight"
          data-field="runtime.systemView.gravityGridWeight"
          type="range"
          min="0"
          max="4"
          step="0.05"
          value="${formatNumber(gravityGridWeight, 2)}"
        />
        <input
          class="config-number-input"
          data-field="runtime.systemView.gravityGridWeight"
          type="number"
          min="0"
          max="4"
          step="0.05"
          value="${formatNumber(gravityGridWeight, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigPlanetSelect">Selected Planet</label>
        <select
          id="systemConfigPlanetSelect"
          data-field="selectedPlanetId"
        >
          ${getActivePlanets(system)
            .map(({ planet, index }) => {
              const selected = planet.id === selectedPlanetId ? "selected" : "";

              return `
                <option value="${escapeHtml(planet.id)}" ${selected}>
                  ${index + 1}: ${escapeHtml(planet.name)}
                </option>
              `;
            })
            .join("")}
        </select>
      </div>
    `;

    system.visual.sunShaderId = "fractal-sun";

    const starBody = `
      <div class="config-row">
        <label for="systemConfigStarRadius">Size</label>
        <input
          id="systemConfigStarRadius"
          data-field="star.radius"
          type="range"
          min="0.002"
          max="0.12"
          step="0.001"
          value="${formatNumber(system.star.radius, 3)}"
        />
        <input
          class="config-number-input"
          data-field="star.radius"
          type="number"
          min="0.002"
          max="0.12"
          step="0.001"
          value="${formatNumber(system.star.radius, 3)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarBrightness">Brightness</label>
        <input
          id="systemConfigStarBrightness"
          data-field="star.brightness"
          type="range"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.brightness, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.brightness"
          type="number"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.brightness, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarHaloBrightness">Halo Brightness</label>
        <input
          id="systemConfigStarHaloBrightness"
          data-field="star.haloBrightness"
          type="range"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.haloBrightness, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.haloBrightness"
          type="number"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.haloBrightness, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarGlow">Glow</label>
        <input
          id="systemConfigStarGlow"
          data-field="star.glow"
          type="range"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.glow, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.glow"
          type="number"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.glow, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarCorona">Corona</label>
        <input
          id="systemConfigStarCorona"
          data-field="star.corona"
          type="range"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.corona, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.corona"
          type="number"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.corona, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarFlare">Flare</label>
        <input
          id="systemConfigStarFlare"
          data-field="star.flare"
          type="range"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.flare, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.flare"
          type="number"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.flare, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarSurfaceScale">Surface Scale</label>
        <input
          id="systemConfigStarSurfaceScale"
          data-field="star.surfaceScale"
          type="range"
          min="0.05"
          max="4"
          step="0.01"
          value="${formatNumber(system.star.surfaceScale, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.surfaceScale"
          type="number"
          min="0.05"
          max="4"
          step="0.01"
          value="${formatNumber(system.star.surfaceScale, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarCoronaScale">Corona Scale</label>
        <input
          id="systemConfigStarCoronaScale"
          data-field="star.coronaScale"
          type="range"
          min="0.01"
          max="0.5"
          step="0.01"
          value="${formatNumber(system.star.coronaScale, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.coronaScale"
          type="number"
          min="0.01"
          max="0.5"
          step="0.01"
          value="${formatNumber(system.star.coronaScale, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarSurfaceAnimationSpeed">Surface Animation</label>
        <input
          id="systemConfigStarSurfaceAnimationSpeed"
          data-field="star.surfaceAnimationSpeed"
          type="range"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.surfaceAnimationSpeed, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.surfaceAnimationSpeed"
          type="number"
          min="0"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.surfaceAnimationSpeed, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarSphereRotationSpeed">Sphere Rotation</label>
        <input
          id="systemConfigStarSphereRotationSpeed"
          data-field="star.sphereRotationSpeed"
          type="range"
          min="-8"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.sphereRotationSpeed, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.sphereRotationSpeed"
          type="number"
          min="-8"
          max="8"
          step="0.01"
          value="${formatNumber(system.star.sphereRotationSpeed, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarCoronaSpeed">Corona Speed</label>
        <input
          id="systemConfigStarCoronaSpeed"
          data-field="star.coronaSpeed"
          type="range"
          min="0"
          max="12"
          step="0.01"
          value="${formatNumber(system.star.coronaSpeed, 2)}"
        />
        <input
          class="config-number-input"
          data-field="star.coronaSpeed"
          type="number"
          min="0"
          max="12"
          step="0.01"
          value="${formatNumber(system.star.coronaSpeed, 2)}"
        />
      </div>

      <div class="config-row">
        <label for="systemConfigStarColor">Color</label>
        <input
          id="systemConfigStarColor"
          data-field="star.color"
          type="color"
          value="${colorArrayToHex(system.star.color)}"
        />
        <span>${colorArrayToHex(system.star.color)}</span>
      </div>
    `;

    const selectedPlanetBody = renderSelectedPlanetControls(selectedPlanet);
    const planetRingsBody = renderPlanetRingControls(selectedPlanet);
    const atmosphereBody = renderAtmosphereControls(
      this.galaxyConfig.terrainView.atmosphere,
      selectedPlanet,
      this.collapsedSections
    );
    const skyBody = renderSkyShaderControls(selectedPlanet, this.store);
    const terrainShaderBody = renderTerrainShaderControls(selectedPlanet);

    system.visual.spaceShaderId = "star-nest";
    const spaceBody = `
      <div class="config-row">
        <label>Space Shader</label>
        <span class="config-readonly-value">Star Nest / Gradient Mix</span>
      </div>

      ${renderSpaceShaderParams(system.visual)}
    `;

    this.element.innerHTML = `
      ${renderConfigPanelHeader({ collapsed: false })}

      ${renderConfigSection({
        id: "config",
        title: "CONFIG",
        body: configBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "general",
        title: "GENERAL",
        body: generalBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "system",
        title: "SYSTEM",
        body: systemBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "star",
        title: "STAR",
        body: starBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "selected-planet",
        title: "SELECTED PLANET",
        body: selectedPlanetBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "planet-rings",
        title: "PLANET RINGS",
        body: planetRingsBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "sky-shader",
        title: "SKY",
        body: skyBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "atmosphere",
        title: "ATMOSPHERE / CLOUDS / FOG",
        body: atmosphereBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "terrain-shader",
        title: "TERRAIN SHADER",
        body: terrainShaderBody,
        collapsedSections: this.collapsedSections
      })}

      ${renderConfigSection({
        id: "space",
        title: "SPACE",
        body: spaceBody,
        collapsedSections: this.collapsedSections
      })}
    `;

    this.element.scrollTop = previousPanelScrollTop;
  }

  getSelectedSystem() {
    const state = this.store.getState();

    const selectedSystemId =
      state.activeView === "system-view"
        ? state.systemView.activeSystemId
        : state.starMap.selectedSystemId;

    return (
      this.galaxyConfig.systems.find((system) => system.id === selectedSystemId) ??
      null
    );
  }

  getSelectedPlanet(system) {
    const activePlanets = getActivePlanets(system);

    if (activePlanets.length === 0) {
      return null;
    }

    const selectedPlanetId = this.store.getSystemEditorSelectedPlanetId(system.id);
    const selectedPlanet = activePlanets.find(
      ({ planet }) => planet.id === selectedPlanetId
    )?.planet;

    if (selectedPlanet) {
      return selectedPlanet;
    }

    return activePlanets[0]?.planet ?? null;
  }
}

function getVisiblePlanetCount(system) {
  const rawCount = system?.summary?.planetCount;

  if (rawCount !== null && rawCount !== undefined && rawCount !== "") {
    const configuredCount = Number(rawCount);

    if (Number.isFinite(configuredCount)) {
      return clampInteger(configuredCount, 1, MAX_SYSTEM_PLANETS);
    }
  }

  const sourcePlanetCount = Array.isArray(system?.planets)
    ? system.planets.filter(Boolean).length
    : 0;

  if (sourcePlanetCount > 0 && sourcePlanetCount < MAX_SYSTEM_PLANETS) {
    return clampInteger(sourcePlanetCount, 1, MAX_SYSTEM_PLANETS);
  }

  // Pool-normalized systems always have MAX_SYSTEM_PLANETS config slots.
  // If no explicit count exists yet, keep the historical/default visible count.
  return Math.min(4, MAX_SYSTEM_PLANETS);
}

function getActivePlanets(system) {
  const planets = Array.isArray(system?.planets) ? system.planets : [];
  const visibleCount = getVisiblePlanetCount(system);

  return planets
    .slice(0, visibleCount)
    .map((planet, index) => ({ planet, index }));
}

function renderConfigSection({ id, title, body, collapsedSections }) {
  const isCollapsed = collapsedSections.has(id);
  const collapsedClass = isCollapsed ? " is-collapsed" : "";
  const expandedText = isCollapsed ? "false" : "true";
  const indicator = isCollapsed ? "▸" : "▾";

  return `
    <section class="config-section${collapsedClass}">
      <button
        class="config-section-title"
        type="button"
        data-config-section="${escapeHtml(id)}"
        aria-expanded="${expandedText}"
      >
        <span>${escapeHtml(title)}</span>
        <span class="config-section-indicator">${indicator}</span>
      </button>

      <div class="config-section-body">
        ${body}
      </div>
    </section>
  `;
}

function renderGeneralControls(renderConfig) {
  return GENERAL_RENDER_OPTIONS.map((param) => {
    const value = renderConfig?.[param.key] ?? 1;
    const inputId = `general_${param.key}`;

    return `
      <div class="config-row">
        <label for="${escapeHtml(inputId)}">${escapeHtml(param.label)}</label>
        <input
          id="${escapeHtml(inputId)}"
          data-field="render.${escapeHtml(param.key)}"
          type="range"
          min="${param.min}"
          max="${param.max}"
          step="${param.step}"
          value="${formatNumber(value, param.digits)}"
        />
        <input
          class="config-number-input"
          data-field="render.${escapeHtml(param.key)}"
          type="number"
          min="${param.min}"
          max="${param.max}"
          step="${param.step}"
          value="${formatNumber(value, param.digits)}"
        />
      </div>
    `;
  }).join("");
}

const SKY_SHADER_OPTIONS = [
  { id: "none", label: "Off" },
  { id: "thin-atmosphere", label: "On" }
];

const SKY_SHADER_PARAMS = {
  "thin-atmosphere": [
    { key: "density", label: "Density Max", min: 0, max: 2, step: 0.01, digits: 2 },
    { key: "horizon", label: "Horizon Max", min: 0, max: 3, step: 0.01, digits: 2 },
    { key: "spaceFade", label: "Space Fade", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "skyBrightnessInfo", label: "Sky Brightness", readonly: "Auto: sun height, 0.00–1.50" },
    { key: "ambient", label: "Ambient Max", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "lightIntensity", label: "Light Intensity Max", min: 0, max: 3, step: 0.05, digits: 2 },
    { key: "shadowStrength", label: "Shadow Strength", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "shadowDistance", label: "Shadow Distance", min: 5, max: 300, step: 5, digits: 0 },
    { key: "shadowSteps", label: "Shadow Steps", min: 0, max: 48, step: 1, digits: 0 }
  ]
};

const ATMOSPHERE_SHADER_OPTIONS = [
  { id: "none-atmosphere", label: "None" },
  { id: "atmosphere-flow", label: "Atmosphere Flow" }
];

const ATMOSPHERE_FLOW_PARAMS = [
  { key: "speed", label: "Atmosphere Speed", min: -2, max: 2, step: 0.01, digits: 2 },
  { key: "density", label: "Atmosphere Density", min: 0, max: 2, step: 0.01, digits: 2 },
  { key: "opacity", label: "Atmosphere Opacity", min: 0, max: 1, step: 0.01, digits: 2 },
  { key: "scale", label: "Atmosphere Scale", min: 0.2, max: 4, step: 0.01, digits: 2 },
  { key: "height", label: "Atmosphere Height", min: 0, max: 2, step: 0.01, digits: 2 },
  { key: "brightness", label: "Atmosphere Brightness", min: 0.2, max: 2, step: 0.01, digits: 2 },
  { key: "softness", label: "Atmosphere Softness", min: 0.2, max: 3, step: 0.01, digits: 2 },
  { key: "hue", label: "Atmosphere Hue", min: -3.14, max: 3.14, step: 0.01, digits: 2 },
  { key: "saturation", label: "Atmosphere Saturation", min: 0, max: 2.5, step: 0.01, digits: 2 }
];

const FOG_SHADER_OPTIONS = [
  { id: "none-fog", label: "None" },
  { id: "fog-clouds", label: "Noise Fog" }
];

const FOG_CLOUDS_PARAMS = [
  { key: "speed", label: "Fog Speed", min: -2, max: 2, step: 0.01, digits: 2 },
  { key: "density", label: "Fog Density", min: 0, max: 2, step: 0.01, digits: 2 },
  { key: "opacity", label: "Fog Opacity", min: 0, max: 1, step: 0.01, digits: 2 },
  { key: "scale", label: "Fog Scale", min: 0.0, max: 0.25, step: 0.005, digits: 3 },
  { key: "height", label: "Fog Height", readonly: "Auto: 0.01 when Noise Fog is on" },
  { key: "brightness", label: "Fog Brightness", min: 0.2, max: 2, step: 0.01, digits: 2 },
  { key: "softness", label: "Fog Softness", min: 0.2, max: 3, step: 0.01, digits: 2 },
  { key: "hue", label: "Fog Hue", min: -3.14, max: 3.14, step: 0.01, digits: 2 },
  { key: "saturation", label: "Fog Saturation", min: 0, max: 2.5, step: 0.01, digits: 2 },
  { key: "renderDistance", label: "Fog Render Dist", readonly: "Auto: Terrain Render Distance" },
  { key: "fadeDistance", label: "Fog Fade Dist", readonly: "Auto: Terrain Render Distance" },
  { key: "deckThickness", label: "Fog Deck Thickness", min: 0.25, max: 8, step: 0.05, digits: 2 }
];


function renderSkyShaderControls(planet, store) {
  if (!planet) {
    return `<p class="config-muted">No planet selected.</p>`;
  }

  planet.visual ??= {};
  planet.visual.skyShaderId = normalizeSkyShaderId(planet.visual.skyShaderId);
  planet.visual.skyShaderParams = normalizeSkyShaderParams(
    planet.visual.skyShaderParams ?? {},
    planet.visual.skyShaderId
  );

  const enabled = planet.visual.skyShaderId === "thin-atmosphere";
  const params = planet.visual.skyShaderParams;
  const paramList = SKY_SHADER_PARAMS["thin-atmosphere"] ?? [];

  return `
    <div class="config-row">
      <label for="systemConfigSkyShaderEnabled">Sky</label>
      <input
        id="systemConfigSkyShaderEnabled"
        data-field="planet.visual.skyShaderId"
        type="checkbox"
        ${enabled ? "checked" : ""}
      />
      <span>${enabled ? "On" : "Off"}</span>
    </div>

    ${enabled
      ? paramList.map((param) => renderLayerParamControl(params, param, "planet.visual.skyShaderParams", "skyShader")).join("")
      : `<p class="config-muted">Sky shader disabled for this planet. Space background is shown unchanged.</p>`}

    ${enabled ? renderThinAtmosphereEffectiveValues(params, store) : ""}
  `;
}


function renderThinAtmosphereEffectiveValues(params, store) {
  const sunHeight01 = getCurrentSunHeight01(store);

  const densityMax = Number(params.density ?? 0.55);
  const horizonMax = Number(params.horizon ?? 1.1);
  const ambientMax = Number(params.ambient ?? 0.22);
  const lightIntensityMax = Number(params.lightIntensity ?? 1.0);

  const thinAtmoFactor = Math.pow(sunHeight01, 0.45);

  const densityEffective = densityMax * thinAtmoFactor;
  const horizonEffective = horizonMax * thinAtmoFactor;
  const skyBrightnessEffective = 1.5 * thinAtmoFactor;
  const ambientEffective = ambientMax * thinAtmoFactor;
  const lightIntensityEffective = lightIntensityMax * thinAtmoFactor;

  const rows = [
    ["Sun Height", sunHeight01],
    ["Thin Atmo Factor", thinAtmoFactor],
    ["Density Effective", densityEffective],
    ["Horizon Effective", horizonEffective],
    ["Sky Brightness Effective", skyBrightnessEffective],
    ["Ambient Effective", ambientEffective],
    ["Light Intensity Effective", lightIntensityEffective]
  ];

  return `
    <div class="config-subsection">
      <p class="config-muted config-inline-note">
        Effective Thin Atmosphere values are calculated from current sun height.
      </p>

      ${rows.map(([label, value]) => renderReadonlyValue(label, value)).join("")}
    </div>
  `;
}

function getCurrentSunHeight01(store) {
  const state = store?.getState?.() ?? {};
  const sunDirection = state.terrainView?.landingContext?.sunDirectionLocal ?? [0.46, 0.72, 0.38];
  const y = Array.isArray(sunDirection) ? Number(sunDirection[1]) : 0.72;

  if (!Number.isFinite(y)) {
    return 0.72;
  }

  return Math.max(0, Math.min(1, y));
}

function renderReadonlyValue(label, value) {
  const safeValue = Number.isFinite(value) ? value : 0;

  return `
    <div class="config-row">
      <label>${escapeHtml(label)}</label>
      <span class="config-readonly-value">${safeValue.toFixed(2)}</span>
    </div>
  `;
}


const WEATHER_SHADER_OPTIONS = [
  { id: "none-weather", label: "None" },
  { id: "snow-3d", label: "Snow 3D" },
  { id: "rain-3d", label: "Rain 3D" }
];

const WEATHER_LAYER_PARAMS = [
  { key: "count", label: "Particle Count", min: 250, max: 8000, step: 250, digits: 0 },
  { key: "fallSpeed", label: "Fall Speed", min: 0, max: 220, step: 1, digits: 0 },
  { key: "windX", label: "Wind X", min: -120, max: 120, step: 1, digits: 0 },
  { key: "windZ", label: "Wind Z", min: -120, max: 120, step: 1, digits: 0 },
  { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01, digits: 2 }
];

const AURORA_LAYER_PARAMS = [
  { key: "intensity", label: "Aurora Intensity", min: 0, max: 3, step: 0.01, digits: 2 },
  { key: "speed", label: "Aurora Speed", min: 0, max: 3, step: 0.01, digits: 2 },
  { key: "bandScale", label: "Aurora Band Scale", min: 20, max: 800, step: 1, digits: 0 },
  { key: "height", label: "Aurora Height", min: 1000, max: 3000, step: 1, digits: 0 },
  { key: "spread", label: "Aurora Spread", min: 0.1, max: 6, step: 0.01, digits: 2 },
  { key: "trail", label: "Aurora Trail", min: 0.2, max: 3, step: 0.01, digits: 2 },
  { key: "glow", label: "Aurora Glow", min: 0, max: 4, step: 0.01, digits: 2 },
  { key: "horizonFade", label: "Aurora Horizon Fade", min: 0, max: 2, step: 0.01, digits: 2 }
];

function renderAtmosphereControls(atmosphere, selectedPlanet, collapsedSections) {
  const normalized = normalizeAtmosphereConfig(atmosphere ?? {});
  const clouds = normalized.clouds;

  if (selectedPlanet) {
    selectedPlanet.visual.atmosphere = normalizePlanetAtmosphereConfig(
      selectedPlanet.visual?.atmosphere ?? {}
    );
  }

  const planetAtmosphere = selectedPlanet?.visual?.atmosphere ?? normalizePlanetAtmosphereConfig({});
  const atmosphereLayer = planetAtmosphere.atmosphere;
  const auroraLayer = planetAtmosphere.aurora;
  const fogLayer = planetAtmosphere.fog;
  const weatherLayer = planetAtmosphere.weather;

  const params = [
    { key: "speed", label: "Cloud Speed", min: -2, max: 2, step: 0.01, digits: 2 },
    { key: "density", label: "Cloud Density", min: 0, max: 2, step: 0.01, digits: 2 },
    { key: "opacity", label: "Cloud Opacity", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "scale", label: "Cloud Scale", min: 0.01, max: 0.25, step: 0.01, digits: 2 },
    { key: "height", label: "Cloud Height", min: 1.2, max: 2, step: 0.01, digits: 2 },
    { key: "brightness", label: "Cloud Brightness", min: 0.2, max: 2, step: 0.01, digits: 2 },
    { key: "contrast", label: "Cloud Contrast", min: 0, max: 3, step: 0.01, digits: 2 },
    { key: "softness", label: "Cloud Softness", min: 0.2, max: 3, step: 0.01, digits: 2 },
    { key: "blurStrength", label: "Cloud Blur Strength", min: 0.4, max: 2, step: 0.01, digits: 2 },
    { key: "hue", label: "Cloud Hue", min: -3.14, max: 3.14, step: 0.01, digits: 2 },
    { key: "saturation", label: "Cloud Saturation", min: 0, max: 2.5, step: 0.01, digits: 2 },
    { key: "renderDistance", label: "Cloud Render Dist", readonly: "Auto: Terrain Render Distance" },
    { key: "fadeDistance", label: "Cloud Fade Dist", readonly: "Auto: Terrain Render Distance" },
    { key: "deckThickness", label: "Cloud Deck Thickness", min: 0.75, max: 1, step: 0.01, digits: 2 },
    { key: "patchiness", label: "Patchiness", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "bigPatches", label: "Big Patches", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "heightVariation", label: "Height Variation", min: 0, max: 1, step: 0.01, digits: 2 }
  ];

  const cloudsEnabled = selectedPlanet?.visual?.atmosphere?.clouds?.enabled ?? false;
  const cloudsBody = `
    ${selectedPlanet ? `
      <div class="config-row">
        <label for="systemConfigPlanetCloudsEnabled">Clouds</label>
        <input
          id="systemConfigPlanetCloudsEnabled"
          data-field="planet.visual.atmosphere.clouds.enabled"
          type="checkbox"
          ${cloudsEnabled ? "checked" : ""}
        />
        <span>${cloudsEnabled ? "On" : "Off"}</span>
      </div>
    ` : `<p class="config-muted">Select a planet to enable or disable clouds.</p>`}

    ${params.map((param) => renderCloudParamControl(clouds, param)).join("")}
  `;

  const orbitCloudsBody = renderPlanetOrbitCloudControls(selectedPlanet);
  const auroraBody = renderAuroraLayerControls(auroraLayer, selectedPlanet);
  const atmosphereBody = renderAtmosphereLayerControls(atmosphereLayer, selectedPlanet);
  const weatherBody = renderWeatherLayerControls(weatherLayer, selectedPlanet);
  const fogBody = renderFogLayerControls(fogLayer, selectedPlanet);

  return `
    <p class="config-muted config-inline-note">
      Clouds On/Off, Aurora, Atmosphere, Weather and Fog affect only the selected planet. Every planet can have its own Clouds, Aurora, Atmosphere Flow, Weather, Fog and Rings settings.
    </p>

    ${renderConfigSection({
      id: "atmosphere-clouds",
      title: "CLOUDS",
      body: cloudsBody,
      collapsedSections
    })}

    ${renderConfigSection({
      id: "atmosphere-orbit-clouds",
      title: "ORBIT CLOUDS",
      body: orbitCloudsBody,
      collapsedSections
    })}

    ${renderConfigSection({
      id: "atmosphere-aurora",
      title: "AURORA",
      body: auroraBody,
      collapsedSections
    })}

    ${renderConfigSection({
      id: "atmosphere-flow",
      title: "ATMOSPHERE",
      body: atmosphereBody,
      collapsedSections
    })}

    ${renderConfigSection({
      id: "atmosphere-weather",
      title: "WEATHER",
      body: weatherBody,
      collapsedSections
    })}

    ${renderConfigSection({
      id: "atmosphere-fog",
      title: "FOG",
      body: fogBody,
      collapsedSections
    })}
  `;
}

function renderAuroraLayerControls(layer, planet) {
  if (!planet) {
    return `<p class="config-muted">Select a planet to configure aurora.</p>`;
  }

  const enabled = Boolean(layer?.enabled ?? false);
  const params = layer?.params ?? {};

  return `
    <p class="config-muted config-inline-note">
      Aurora is configured for ${escapeHtml(planet.name)} and renders in Terrain View between sky haze and clouds.
    </p>

    <div class="config-row">
      <label for="systemConfigPlanetAuroraEnabled">Aurora</label>
      <input
        id="systemConfigPlanetAuroraEnabled"
        data-field="planet.visual.atmosphere.aurora.enabled"
        type="checkbox"
        ${enabled ? "checked" : ""}
      />
      <span>${enabled ? "On" : "Off"}</span>
    </div>

    ${enabled
      ? AURORA_LAYER_PARAMS.map((param) => renderLayerParamControl(params, param, "planet.visual.atmosphere.aurora.params", "auroraLayer")).join("")
      : `<p class="config-muted">Aurora layer disabled for this planet.</p>`}
  `;
}

function renderAtmosphereLayerControls(layer, planet) {
  if (!planet) {
    return `<p class="config-muted">Select a planet to configure atmosphere.</p>`;
  }

  const shaderId = layer.shaderId ?? "none-atmosphere";
  const enabled = shaderId === "atmosphere-flow";
  const params = layer.params ?? {};

  return `
    <p class="config-muted config-inline-note">
      Atmosphere Flow is configured for ${escapeHtml(planet.name)}. Every planet has its own Atmosphere settings.
    </p>

    <div class="config-row">
      <label for="systemConfigAtmosphereEnabled">Atmosphere Flow</label>
      <input
        id="systemConfigAtmosphereEnabled"
        data-field="planet.visual.atmosphere.atmosphere.shaderId"
        type="checkbox"
        ${enabled ? "checked" : ""}
      />
      <span>${enabled ? "On" : "Off"}</span>
    </div>

    ${enabled
      ? ATMOSPHERE_FLOW_PARAMS.map((param) => renderLayerParamControl(params, param, "planet.visual.atmosphere.atmosphere.params", "atmosphereFlow")).join("")
      : `<p class="config-muted">Atmosphere Flow disabled for this planet.</p>`}
  `;
}

function renderWeatherLayerControls(layer, planet) {
  if (!planet) {
    return `<p class="config-muted">Select a planet to configure weather.</p>`;
  }

  const shaderId = layer.shaderId ?? "none-weather";
  const params = layer.params ?? {};

  return `
    <p class="config-muted config-inline-note">
      Weather is configured for ${escapeHtml(planet.name)}. Snow/Rain 3D use fixed camera-volume defaults; only count, motion and opacity are exposed to avoid broken particle bounds.
    </p>

    <div class="config-row">
      <label for="systemConfigWeatherShader">Weather Shader</label>
      <select
        id="systemConfigWeatherShader"
        data-field="planet.visual.atmosphere.weather.shaderId"
      >
        ${renderOptions(WEATHER_SHADER_OPTIONS, shaderId)}
      </select>
    </div>

    ${shaderId === "snow-3d" || shaderId === "rain-3d"
      ? WEATHER_LAYER_PARAMS.map((param) => renderLayerParamControl(params, param, "planet.visual.atmosphere.weather.params", "weatherLayer")).join("")
      : `<p class="config-muted">Weather layer disabled for this planet.</p>`}
  `;
}

function renderFogLayerControls(layer, planet) {
  if (!planet) {
    return `<p class="config-muted">Select a planet to configure fog.</p>`;
  }

  const shaderId = layer.shaderId ?? "none-fog";
  const enabled = shaderId === "fog-clouds";
  const params = layer.params ?? {};

  return `
    <p class="config-muted config-inline-note">
      Fog is configured for ${escapeHtml(planet.name)}. Every planet has its own Fog settings.
    </p>

    <div class="config-row">
      <label for="systemConfigFogEnabled">Noise Fog</label>
      <input
        id="systemConfigFogEnabled"
        data-field="planet.visual.atmosphere.fog.shaderId"
        type="checkbox"
        ${enabled ? "checked" : ""}
      />
      <span>${enabled ? "On" : "Off"}</span>
    </div>

    ${enabled
      ? FOG_CLOUDS_PARAMS.map((param) => renderLayerParamControl(params, param, "planet.visual.atmosphere.fog.params", "fogClouds")).join("")
      : `<p class="config-muted">Noise Fog disabled for this planet.</p>`}
  `;
}

function renderLayerParamControl(values, param, fieldPrefix, inputPrefix) {

  if (param.readonly) {
    return `
      <div class="config-row">
        <label>${escapeHtml(param.label)}</label>
        <span class="config-readonly-value">${escapeHtml(param.readonly)}</span>
      </div>
    `;
  }

  const value = values[param.key] ?? 0;
  const inputId = `${inputPrefix}_${param.key}`;

  return `
    <div class="config-row">
      <label for="${escapeHtml(inputId)}">${escapeHtml(param.label)}</label>
      <input
        id="${escapeHtml(inputId)}"
        data-field="${escapeHtml(fieldPrefix)}.${escapeHtml(param.key)}"
        type="range"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, param.digits)}"
      />
      <input
        class="config-number-input"
        data-field="${escapeHtml(fieldPrefix)}.${escapeHtml(param.key)}"
        type="number"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, param.digits)}"
      />
    </div>
  `;
}

function renderPlanetOrbitCloudControls(planet) {
  if (!planet) {
    return `<p class="config-muted">No planet selected.</p>`;
  }

  planet.visual.atmosphere = normalizePlanetAtmosphereConfig(planet.visual.atmosphere ?? {});
  const clouds = planet.visual.atmosphere.clouds;
  const params = [
    { key: "density", label: "Orbit Cloud Density", min: 0, max: 2, step: 0.01, digits: 2 },
    { key: "orbitOpacity", label: "Orbit Cloud Opacity", min: 0.1, max: 0.7, step: 0.01, digits: 2 },
    { key: "scale", label: "Orbit Cloud Scale", min: 0.01, max: 0.25, step: 0.01, digits: 2 },
    { key: "patchiness", label: "Orbit Patchiness", min: 0, max: 1, step: 0.01, digits: 2 },
    { key: "orbitHeight", label: "Orbit Height", min: 1.0, max: 1.125, step: 0.001, digits: 3 },
    { key: "orbitPatchinessScale", label: "Orbit Patchiness Scale", min: 0, max: 10, step: 0.01, digits: 2 }
  ];

  return `
    <p class="config-muted config-inline-note">
      ${escapeHtml(planet.name)} uses the Clouds On/Off switch above. Speed, brightness, softness, hue, saturation, blur and big patches are shared globally. Density, orbit opacity, scale, patchiness, height and patchiness scale are tuned per selected planet.
    </p>

    ${params.map((param) => renderPlanetOrbitCloudParamControl(clouds, param)).join("")}
  `;
}

function renderPlanetOrbitCloudParamControl(clouds, param) {
  const value = clouds[param.key] ?? 0;
  const inputId = `planetOrbitCloud_${param.key}`;

  return `
    <div class="config-row">
      <label for="${escapeHtml(inputId)}">${escapeHtml(param.label)}</label>
      <input
        id="${escapeHtml(inputId)}"
        data-field="planet.visual.atmosphere.clouds.${escapeHtml(param.key)}"
        type="range"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, param.digits)}"
      />
      <input
        class="config-number-input"
        data-field="planet.visual.atmosphere.clouds.${escapeHtml(param.key)}"
        type="number"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, param.digits)}"
      />
    </div>
  `;
}

function renderCloudParamControl(clouds, param) {
  if (param.readonly) {
    return `
      <div class="config-row">
        <label>${escapeHtml(param.label)}</label>
        <span class="config-readonly-value">${escapeHtml(param.readonly)}</span>
      </div>
    `;
  }

  const value = clouds[param.key] ?? 0;
  const inputId = `atmosphereCloud_${param.key}`;

  return `
    <div class="config-row">
      <label for="${escapeHtml(inputId)}">${escapeHtml(param.label)}</label>
      <input
        id="${escapeHtml(inputId)}"
        data-field="terrainView.atmosphere.clouds.${escapeHtml(param.key)}"
        type="range"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, param.digits)}"
      />
      <input
        class="config-number-input"
        data-field="terrainView.atmosphere.clouds.${escapeHtml(param.key)}"
        type="number"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, param.digits)}"
      />
    </div>
  `;
}

function renderTerrainShaderControls(planet) {
  if (!planet) {
    return `<p class="config-muted">No planet selected.</p>`;
  }

  const shaderId = planet.visual.terrainShaderId ?? "none";
  const shader = PLANET_SHADER_OPTIONS.find((option) => option.id === shaderId);
  const shaderLabel = shader?.label ?? shaderId;
  const params = renderTerrainShaderParams(planet);

  return `
    <p class="config-muted config-inline-note">
      Active terrain shader: <strong>${escapeHtml(shaderLabel)}</strong>. This shader is used by both the System/Orbit sphere and the Terrain surface.
    </p>

    ${params || `<p class="config-muted">No exposed params for this terrain shader.</p>`}
  `;
}

function renderSpaceShaderParams(visual) {
  const shader = SPACE_SHADER_OPTIONS.find(
    (option) => option.id === visual.spaceShaderId
  );

  if (!shader || shader.params.length === 0) {
    return `
      <p class="config-muted">
        No exposed params for this shader yet.
      </p>
    `;
  }

  return shader.params
    .map((param) => {
      const value = visual.spaceShaderParams?.[param.key] ?? 0;

      return `
        <div class="config-row">
          <label for="spaceParam_${escapeHtml(param.key)}">${escapeHtml(param.label)}</label>
          <input
            id="spaceParam_${escapeHtml(param.key)}"
            data-field="visual.spaceShaderParams.${escapeHtml(param.key)}"
            type="range"
            min="${param.min}"
            max="${param.max}"
            step="${param.step}"
            value="${formatNumber(value, param.digits)}"
          />
          <input
            class="config-number-input"
            data-field="visual.spaceShaderParams.${escapeHtml(param.key)}"
            type="number"
            min="${param.min}"
            max="${param.max}"
            step="${param.step}"
            value="${formatNumber(value, param.digits)}"
          />
        </div>
      `;
    })
    .join("");
}

function renderTerrainShaderParams(planet) {
  const shaderId = planet.visual.terrainShaderId ?? "none";
  const shader = PLANET_SHADER_OPTIONS.find((option) => option.id === shaderId);

  if (!shader || shader.params.length === 0) {
    return "";
  }

  planet.visual.terrainParams = normalizePlanetTerrainParams(
    shaderId,
    planet.visual.terrainParams
  );

  return renderShaderParamRows({
    params: shader.params,
    values: planet.visual.terrainParams,
    fieldPrefix: "planet.visual.terrainParams",
    inputPrefix: "terrainShaderParam"
  });
}

function renderShaderParamRows({ params, values, fieldPrefix, inputPrefix }) {
  return params
    .map((param) => {
      const value = values?.[param.key] ?? 0;
      const inputId = `${inputPrefix}_${param.key}`;

      return `
        <div class="config-row">
          <label for="${escapeHtml(inputId)}">${escapeHtml(param.label)}</label>
          <input
            id="${escapeHtml(inputId)}"
            data-field="${escapeHtml(fieldPrefix)}.${escapeHtml(param.key)}"
            type="range"
            min="${param.min}"
            max="${param.max}"
            step="${param.step}"
            value="${formatNumber(value, param.digits)}"
          />
          <input
            class="config-number-input"
            data-field="${escapeHtml(fieldPrefix)}.${escapeHtml(param.key)}"
            type="number"
            min="${param.min}"
            max="${param.max}"
            step="${param.step}"
            value="${formatNumber(value, param.digits)}"
          />
        </div>
      `;
    })
    .join("");
}


function renderPlanetTextureParams(planet) {
  const textureId = planet.visual.surfaceTextureId ?? "none";

  if (textureId === "none") {
    return "";
  }

  planet.visual.surfaceTextureParams = normalizePlanetSurfaceTextureParams(
    planet.visual.surfaceTextureParams
  );

  return PLANET_TEXTURE_PARAMS.map((param) => {
    const value = planet.visual.surfaceTextureParams?.[param.key] ?? 0;

    return `
      <div class="config-row">
        <label for="planetTextureParam_${escapeHtml(param.key)}">${escapeHtml(param.label)}</label>
        <input
          id="planetTextureParam_${escapeHtml(param.key)}"
          data-field="planet.visual.surfaceTextureParams.${escapeHtml(param.key)}"
          type="range"
          min="${param.min}"
          max="${param.max}"
          step="${param.step}"
          value="${formatNumber(value, param.digits)}"
        />
        <input
          class="config-number-input"
          data-field="planet.visual.surfaceTextureParams.${escapeHtml(param.key)}"
          type="number"
          min="${param.min}"
          max="${param.max}"
          step="${param.step}"
          value="${formatNumber(value, param.digits)}"
        />
      </div>
    `;
  }).join("");
}

function renderPlanetScaleOverrideControls(planet) {
  const shaderId = planet.visual.terrainShaderId ?? "none";
  const shader = PLANET_SHADER_OPTIONS.find((option) => option.id === shaderId);

  if (!shader || shader.params.length === 0) {
    return "";
  }

  const featureParam = getSphereFeatureParam(shaderId, shader);
  const textureParam = shader.params.find((param) => param.key === "textureScale") ?? null;

  const rows = [];
  const orbitView = planet.orbitView ?? {};
  const terrainParams = planet.visual.terrainParams ?? {};

  if (featureParam) {
    const value = orbitView.featureScale ?? getSphereFeatureDefaultValue(shaderId, terrainParams, featureParam);
    const label = featureParam.key === "crackScale"
      ? "Sphere Feature Scale / Crack Scale"
      : "Sphere Feature Scale";

    rows.push(renderPlanetScaleOverrideRow({
      id: "systemConfigSphereFeatureScale",
      field: "planet.orbitView.featureScale",
      label,
      param: getSphereFeatureOverrideParam(shaderId, featureParam),
      value
    }));
  }

  if (textureParam) {
    const value = orbitView.textureScale ?? terrainParams.textureScale ?? textureParam.default ?? 1;

    rows.push(renderPlanetScaleOverrideRow({
      id: "systemConfigSphereTextureScale",
      field: "planet.orbitView.textureScale",
      label: "Sphere Texture Scale",
      param: textureParam,
      value
    }));
  }

  rows.push(renderPlanetScaleOverrideRow({
    id: "systemConfigSphereContrast",
    field: "planet.orbitView.contrast",
    label: "Sphere Contrast",
    param: {
      key: "contrast",
      label: "Sphere Contrast",
      min: 0.2,
      max: 3.0,
      step: 0.01,
      default: 1.0,
      digits: 2
    },
    value: orbitView.contrast ?? 1.0
  }));

  rows.push(renderPlanetScaleOverrideRow({
    id: "systemConfigSphereHue",
    field: "planet.orbitView.hue",
    label: "Sphere Hue",
    param: {
      key: "hue",
      label: "Sphere Hue",
      min: -3.14,
      max: 3.14,
      step: 0.01,
      default: 0.0,
      digits: 2
    },
    value: orbitView.hue ?? 0.0
  }));

  rows.push(renderPlanetScaleOverrideRow({
    id: "systemConfigSphereSaturation",
    field: "planet.orbitView.saturation",
    label: "Sphere Saturation",
    param: {
      key: "saturation",
      label: "Sphere Saturation",
      min: 0.0,
      max: 2.5,
      step: 0.01,
      default: 1.0,
      digits: 2
    },
    value: orbitView.saturation ?? 1.0
  }));

  if (rows.length === 0) {
    return "";
  }

  return `
    <p class="config-muted config-inline-note">
      Sphere overrides only affect the System/Orbit sphere and sky planets. Terrain Shader scale sliders remain unchanged for the surface view.
    </p>
    ${rows.join("")}
  `;
}


function getSphereFeatureParam(shaderId, shader) {
  const directParam = shader.params.find((param) => param.key === "featureScale") ??
    shader.params.find((param) => param.key === "crackScale") ??
    null;

  if (directParam) {
    return directParam;
  }

  if ([
    "efficient-mountains",
    "biome-mountains",
    "triwave-ridges",
    "soft-dunes"
  ].includes(shaderId)) {
    return shader.params.find((param) => param.key === "terrainScale") ?? null;
  }

  if (shaderId === "turbulent-sea") {
    return {
      key: "sphereFeatureScale",
      label: "Sphere Feature Scale",
      min: 1.0,
      max: 12.0,
      step: 0.05,
      default: 4.5,
      digits: 2
    };
  }

  return null;
}

function getSphereFeatureDefaultValue(shaderId, terrainParams, param) {
  if (shaderId === "efficient-mountains") {
    return Math.max(5.0, Math.min(12.0, (terrainParams.terrainScale ?? param.default ?? 0.04) * 72.0));
  }

  if (shaderId === "biome-mountains") {
    return Math.max(0.5, Math.min(12.0, (terrainParams.terrainScale ?? param.default ?? 0.1) * 90.0));
  }

  if (shaderId === "triwave-ridges") {
    return Math.max(0.25, Math.min(0.60, (terrainParams.terrainScale ?? param.default ?? 0.05) * 90.0));
  }

  if (shaderId === "soft-dunes") {
    return Math.max(0.25, Math.min(25.0, (terrainParams.terrainScale ?? param.default ?? 0.06) * 70.0));
  }

  if (shaderId === "turbulent-sea") {
    return 4.5;
  }

  return terrainParams[param.key] ?? param.default ?? 1;
}

function getSphereFeatureOverrideParam(shaderId, param) {
  if (shaderId === "frozen-lake") {
    return {
      ...param,
      min: 0.1,
      max: 10.0,
      step: 0.01,
      digits: 2
    };
  }

  if (shaderId === "mountain") {
    return {
      ...param,
      min: 0.5,
      max: 350.0,
      step: 0.5,
      digits: 1
    };
  }

  if (shaderId === "rocky") {
    return {
      ...param,
      min: 0.2,
      max: 15.0,
      step: 0.05,
      digits: 2
    };
  }

  if (shaderId === "volcanic") {
    return {
      ...param,
      min: 0.2,
      max: 50.0,
      step: 0.05,
      digits: 2
    };
  }

  if (shaderId === "efficient-mountains") {
    return {
      ...param,
      min: 5.0,
      max: 12.0,
      step: 0.05,
      digits: 2
    };
  }

  if (shaderId === "triwave-ridges") {
    return {
      ...param,
      min: 0.25,
      max: 0.60,
      step: 0.01,
      digits: 2
    };
  }

  if (shaderId === "soft-dunes") {
    return {
      ...param,
      min: 0.25,
      max: 25.0,
      step: 0.05,
      digits: 2
    };
  }

  if ([
    "biome-mountains"
  ].includes(shaderId)) {
    return {
      ...param,
      min: 0.5,
      max: 12.0,
      step: 0.05,
      digits: 2
    };
  }

  if (shaderId === "turbulent-sea") {
    return {
      ...param,
      min: 1.0,
      max: 12.0,
      step: 0.05,
      digits: 2
    };
  }

  return param;
}

function renderPlanetScaleOverrideRow({ id, field, label, param, value }) {
  const digits = param.digits ?? inferDigitsFromStep(param.step);

  return `
    <div class="config-row">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <input
        id="${escapeHtml(id)}"
        data-field="${escapeHtml(field)}"
        type="range"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, digits)}"
      />
      <input
        class="config-number-input"
        data-field="${escapeHtml(field)}"
        type="number"
        min="${param.min}"
        max="${param.max}"
        step="${param.step}"
        value="${formatNumber(value, digits)}"
      />
    </div>
  `;
}

function renderSelectedPlanetControls(planet) {
  if (!planet) {
    return `<p class="config-muted">No planet selected.</p>`;
  }

  const surfaceTextureControls = `
    <div class="config-row">
      <label for="systemConfigSurfaceTexture">Surface Texture</label>
      <select
        id="systemConfigSurfaceTexture"
        data-field="planet.visual.surfaceTextureId"
      >
        ${renderOptions(
          PLANET_TEXTURE_OPTIONS,
          planet.visual.surfaceTextureId ?? "none"
        )}
      </select>
    </div>

    ${renderPlanetTextureParams(planet)}`;

  return `
    <div class="config-row">
      <label for="systemConfigPlanetName">Name</label>
      <input
        id="systemConfigPlanetName"
        data-field="planet.name"
        type="text"
        spellcheck="false"
        value="${escapeHtml(planet.name)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigTerrainShader">Terrain Shader</label>
      <select
        id="systemConfigTerrainShader"
        data-field="planet.visual.terrainShaderId"
      >
        ${renderOptions(
          PLANET_SHADER_OPTIONS,
          planet.visual.terrainShaderId ?? "none"
        )}
      </select>
    </div>

    ${renderPlanetScaleOverrideControls(planet)}

    ${surfaceTextureControls}

    <div class="config-row">
      <label for="systemConfigOrbitRadius">Orbit Radius</label>
      <input
        id="systemConfigOrbitRadius"
        data-field="planet.orbit.radius"
        type="range"
        min="0.02"
        max="7.5"
        step="0.001"
        value="${formatNumber(planet.orbit.radius, 3)}"
      />
      <input
        class="config-number-input"
        data-field="planet.orbit.radius"
        type="number"
        min="0.02"
        max="7.5"
        step="0.001"
        value="${formatNumber(planet.orbit.radius, 3)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigOrbitInclination">Orbit Inclination</label>
      <input
        id="systemConfigOrbitInclination"
        data-field="planet.orbit.inclination"
        type="range"
        min="-1.57"
        max="1.57"
        step="0.01"
        value="${formatNumber(planet.orbit.inclination, 2)}"
      />
      <input
        class="config-number-input"
        data-field="planet.orbit.inclination"
        type="number"
        min="-1.57"
        max="1.57"
        step="0.01"
        value="${formatNumber(planet.orbit.inclination, 2)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigOrbitSpeed">Orbit Speed</label>
      <input
        id="systemConfigOrbitSpeed"
        data-field="planet.orbit.speed"
        type="range"
        min="-0.25"
        max="0.25"
        step="0.001"
        value="${formatNumber(planet.orbit.speed, 3)}"
      />
      <input
        class="config-number-input"
        data-field="planet.orbit.speed"
        type="number"
        min="-0.25"
        max="0.25"
        step="0.001"
        value="${formatNumber(planet.orbit.speed, 3)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigPlanetRadius">Planet Radius</label>
      <input
        id="systemConfigPlanetRadius"
        data-field="planet.body.radius"
        type="range"
        min="0.001"
        max="0.1"
        step="0.0001"
        value="${formatNumber(planet.body.radius, 4)}"
      />
      <input
        class="config-number-input"
        data-field="planet.body.radius"
        type="number"
        min="0.001"
        max="0.1"
        step="0.0001"
        value="${formatNumber(planet.body.radius, 4)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigPlanetAxialTilt">Planet Inclination</label>
      <input
        id="systemConfigPlanetAxialTilt"
        data-field="planet.body.axialTilt"
        type="range"
        min="-1.57"
        max="1.57"
        step="0.01"
        value="${formatNumber(planet.body.axialTilt, 2)}"
      />
      <input
        class="config-number-input"
        data-field="planet.body.axialTilt"
        type="number"
        min="-1.57"
        max="1.57"
        step="0.01"
        value="${formatNumber(planet.body.axialTilt, 2)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigPlanetRotationSpeed">Rotation Speed</label>
      <input
        id="systemConfigPlanetRotationSpeed"
        data-field="planet.body.rotationSpeed"
        type="range"
        min="-5"
        max="5"
        step="0.001"
        value="${formatNumber(planet.body.rotationSpeed, 3)}"
      />
      <input
        class="config-number-input"
        data-field="planet.body.rotationSpeed"
        type="number"
        min="-5"
        max="5"
        step="0.001"
        value="${formatNumber(planet.body.rotationSpeed, 3)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigMoonCount">Moons</label>
      <input
        id="systemConfigMoonCount"
        data-field="planet.moons.count"
        type="range"
        min="0"
        max="10"
        step="1"
        value="${clampInteger(planet.moons?.count ?? 0, 0, 10)}"
      />
      <input
        class="config-number-input"
        data-field="planet.moons.count"
        type="number"
        min="0"
        max="10"
        step="1"
        value="${clampInteger(planet.moons?.count ?? 0, 0, 10)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigMoonRadiusScale">Moon Radius</label>
      <input
        id="systemConfigMoonRadiusScale"
        data-field="planet.moons.radiusScale"
        type="range"
        min="0.35"
        max="3"
        step="0.01"
        value="${formatNumber(planet.moons?.radiusScale ?? 1, 2)}"
      />
      <input
        class="config-number-input"
        data-field="planet.moons.radiusScale"
        type="number"
        min="0.35"
        max="3"
        step="0.01"
        value="${formatNumber(planet.moons?.radiusScale ?? 1, 2)}"
      />
    </div>

    <div class="config-row">
      <label for="systemConfigMoonSizeScale">Moon Size Scale</label>
      <input
        id="systemConfigMoonSizeScale"
        data-field="planet.moons.sizeScale"
        type="range"
        min="0.25"
        max="3"
        step="0.01"
        value="${formatNumber(planet.moons?.sizeScale ?? 1, 2)}"
      />
      <input
        class="config-number-input"
        data-field="planet.moons.sizeScale"
        type="number"
        min="0.25"
        max="3"
        step="0.01"
        value="${formatNumber(planet.moons?.sizeScale ?? 1, 2)}"
      />
    </div>


    <div class="config-row">
      <label for="systemConfigPlanetGrid">Grid</label>
      <input
        id="systemConfigPlanetGrid"
        data-field="planet.visual.showGrid"
        type="checkbox"
        ${planet.visual.showGrid ? "checked" : ""}
      />
      <span>${planet.visual.showGrid ? "On" : "Off"}</span>
    </div>

    <div class="config-row">
      <label for="systemConfigPlanetInclinationIndicators">Inclination</label>
      <input
        id="systemConfigPlanetInclinationIndicators"
        data-field="planet.visual.showInclinationIndicators"
        type="checkbox"
        ${planet.visual.showInclinationIndicators ? "checked" : ""}
      />
      <span>${planet.visual.showInclinationIndicators ? "On" : "Off"}</span>
    </div>
  `;
}


function renderPlanetRingControls(planet) {
  if (!planet) {
    return `<p class="config-muted">No planet selected.</p>`;
  }

  planet.visual.ring = normalizeRingConfig(planet.visual.ring ?? {});

  const ring = planet.visual.ring;

  return `
    <div class="config-row">
      <label for="systemConfigPlanetRingEnabled">Enabled</label>
      <input
        id="systemConfigPlanetRingEnabled"
        data-field="planet.visual.ring.enabled"
        type="checkbox"
        ${ring.enabled ? "checked" : ""}
      />
      <span>${ring.enabled ? "On" : "Off"}</span>
    </div>

    <div class="config-row">
      <label for="systemConfigPlanetRingColor">Color</label>
      <input
        id="systemConfigPlanetRingColor"
        data-field="planet.visual.ring.color"
        type="color"
        value="${colorArrayToHex(ring.color)}"
      />
      <span>${colorArrayToHex(ring.color)}</span>
    </div>

    ${renderRingNumberControl({
      key: "innerRadius",
      label: "Inner Radius",
      value: ring.innerRadius,
      min: 1.01,
      max: 8.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "outerRadius",
      label: "Outer Radius",
      value: ring.outerRadius,
      min: 1.02,
      max: 12.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "apparentSize",
      label: "Apparent Size",
      value: ring.apparentSize,
      min: 0.1,
      max: 8.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "systemScale",
      label: "System Scale",
      value: ring.systemScale,
      min: 0.1,
      max: 8.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "brightness",
      label: "Brightness",
      value: ring.brightness,
      min: 0.0,
      max: 8.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "opacity",
      label: "Opacity",
      value: ring.opacity,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "shadowStrength",
      label: "Shadow Strength",
      value: ring.shadowStrength,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "shadowSoftness",
      label: "Shadow Softness",
      value: ring.shadowSoftness,
      min: 0.01,
      max: 1.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "hue",
      label: "Hue",
      value: ring.hue,
      min: -1.0,
      max: 1.0,
      step: 0.01,
      digits: 2
    })}

    ${renderRingNumberControl({
      key: "banding",
      label: "Banding",
      value: ring.banding,
      min: 0.0,
      max: 4.0,
      step: 0.01,
      digits: 2
    })}
  `;
}

function renderRingNumberControl({ key, label, value, min, max, step, digits }) {
  const inputId = `planetRing_${key}`;

  return `
    <div class="config-row">
      <label for="${escapeHtml(inputId)}">${escapeHtml(label)}</label>
      <input
        id="${escapeHtml(inputId)}"
        data-field="planet.visual.ring.${escapeHtml(key)}"
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${formatNumber(value, digits)}"
      />
      <input
        class="config-number-input"
        data-field="planet.visual.ring.${escapeHtml(key)}"
        type="number"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${formatNumber(value, digits)}"
      />
    </div>
  `;
}

function renderConfigPanelHeader({ collapsed }) {
  return `
    <div class="system-config-panel-header">
      <h1>System Config</h1>
      <button
        class="system-config-collapse-button"
        type="button"
        data-config-action="toggle-config-panel"
        aria-expanded="${collapsed ? "false" : "true"}"
        aria-label="${collapsed ? "Expand system config" : "Collapse system config"}"
        title="${collapsed ? "Expand" : "Collapse"}"
      >${collapsed ? "+" : "–"}</button>
    </div>
  `;
}

function renderOptions(options, selectedId) {
  return options
    .map((option) => {
      const selected = option.id === selectedId ? "selected" : "";

      return `
        <option value="${escapeHtml(option.id)}" ${selected}>
          ${escapeHtml(option.label)}
        </option>
      `;
    })
    .join("");
}

function readNumber(control, fallback) {
  const value = Number(control.value);

  if (!Number.isFinite(value)) {
    return fallback;
  }

  const min = Number(control.min);
  const max = Number(control.max);

  if (Number.isFinite(min) && value < min) {
    return min;
  }

  if (Number.isFinite(max) && value > max) {
    return max;
  }

  return value;
}

function clampInteger(value, min, max) {
  const number = Math.round(Number(value));

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}

function inferDigitsFromStep(step) {
  const number = Number(step);

  if (!Number.isFinite(number)) {
    return 2;
  }

  if (number >= 1) {
    return 0;
  }

  if (number >= 0.1) {
    return 1;
  }

  if (number >= 0.01) {
    return 2;
  }

  if (number >= 0.001) {
    return 3;
  }

  return 4;
}

function formatNumber(value, digits) {
  return Number(value).toFixed(digits);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function colorArrayToHex(color) {
  const r = colorChannelToHex(color?.[0] ?? 1);
  const g = colorChannelToHex(color?.[1] ?? 0.62);
  const b = colorChannelToHex(color?.[2] ?? 0.28);

  return `#${r}${g}${b}`;
}

function hexToColorArray(value) {
  const hex = String(value).replace("#", "");

  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return [1.0, 0.62, 0.28];
  }

  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  ];
}

function colorChannelToHex(value) {
  const channel = Math.round(Math.min(1, Math.max(0, Number(value))) * 255);
  return channel.toString(16).padStart(2, "0");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeFilename(value) {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "system";
}

