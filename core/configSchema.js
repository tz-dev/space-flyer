import {
  getTerrainShader,
  isTerrainShaderId,
  normalizeTerrainParams
} from "../materials/terrain/terrainRegistry.js";
import {
  STELLAR_CATEGORIES,
  generateStellarName,
  hashInt
} from "../generation/nameGenerator.js";
import {
  STELLAR_OBJECT_ORDER,
  getDefaultStellarObjectId,
  normalizeStellarObjectViewConfig
} from "./stellarObjects.js";

export { normalizeStellarObjectViewConfig } from "./stellarObjects.js";

export const MAX_SYSTEM_PLANETS = 16;

export const DEFAULT_KEY_BINDINGS = Object.freeze({
  forward: "KeyW",
  brake: "KeyS",
  strafeLeft: "KeyA",
  strafeRight: "KeyD",
  rollLeft: "KeyQ",
  rollRight: "KeyE",
  up: "Space",
  down: "KeyC",
  modeBack: "Tab"
});

const RESERVED_CONTROL_KEYS = new Set([
  "Escape",
  "KeyR",
  "KeyX",
  "ShiftLeft",
  "ShiftRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight"
]);

export function normalizeKeyCode(value, fallback = "") {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (/^Key[A-Z]$/i.test(trimmed)) {
    return `Key${trimmed.slice(-1).toUpperCase()}`;
  }

  if (/^Digit\d$/i.test(trimmed)) {
    return `Digit${trimmed.slice(-1)}`;
  }

  if (/^Numpad\d$/i.test(trimmed)) {
    return `Numpad${trimmed.slice(-1)}`;
  }

  if (/^F\d{1,2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (trimmed.length === 1 && /[a-z]/i.test(trimmed)) {
    return `Key${trimmed.toUpperCase()}`;
  }

  if (trimmed.length === 1 && /\d/.test(trimmed)) {
    return `Digit${trimmed}`;
  }

  const named = {
    esc: "Escape",
    escape: "Escape",
    tab: "Tab",
    space: "Space",
    spacebar: "Space",
    shift: "ShiftLeft",
    shiftleft: "ShiftLeft",
    shiftright: "ShiftRight",
    ctrl: "ControlLeft",
    control: "ControlLeft",
    alt: "AltLeft",
    enter: "Enter",
    return: "Enter",
    backspace: "Backspace",
    delete: "Delete",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight"
  };

  return named[lower] ?? trimmed;
}

export function normalizeKeyBindings(input = {}, { devToggleKey = "F2" } = {}) {
  const result = {};
  const used = new Set([
    ...RESERVED_CONTROL_KEYS,
    normalizeKeyCode(devToggleKey, "F2")
  ]);

  for (const [action, defaultCode] of Object.entries(DEFAULT_KEY_BINDINGS)) {
    const requestedCode = normalizeKeyCode(input?.[action], defaultCode);
    const candidate = !used.has(requestedCode) ? requestedCode : defaultCode;
    result[action] = used.has(candidate) ? defaultCode : candidate;
    used.add(result[action]);
  }

  return result;
}

export function normalizeGalaxyConfig(input) {
  const systems = Array.isArray(input.systems)
    ? input.systems.map(normalizeSystemConfig)
    : [];

  return {
    version: input.version ?? 1,
    type: input.type ?? "planet-flyer-galaxy",
    id: input.id ?? "unnamed-galaxy",
    name: input.name ?? "Unnamed Galaxy",

    space: {
      shaderId: normalizeSpaceShaderId(input.space?.shaderId),
      params: normalizeSpaceShaderParams(
        input.space?.shaderId,
        input.space?.params ?? {}
      )
    },

    render: normalizeRenderConfig(input.render ?? input.general ?? {}),
    display: normalizeDisplayConfig(input.display ?? input.options?.display ?? {}),
    terrainView: normalizeTerrainViewConfig(input.terrainView ?? {}),
    stellarObjectView: normalizeStellarObjectViewConfig(input.stellarObjectView ?? {}),

    systems
  };
}

export function normalizeRenderConfig(input = {}) {
  return {
    renderScale: normalizeNumber(
      input.renderScale ?? input.scale ?? input.renderScaling,
      1.0,
      0.35,
      1.5
    ),
    pixelation: normalizeNumber(input.pixelation, 1.0, 1.0, 12.0),
    brightness: normalizeNumber(input.brightness, 1.0, 0.0, 2.0),
    contrast: normalizeNumber(input.contrast, 1.0, 0.0, 2.5),
    gamma: normalizeNumber(input.gamma, 1.0, 0.5, 2.5),
    exposure: normalizeNumber(input.exposure, 1.0, 0.1, 4.0),
    adaptiveTerrain: normalizeAdaptiveTerrainConfig(input.adaptiveTerrain ?? input.terrainAdaptive ?? {})
  };
}

function normalizeAdaptiveTerrainConfig(input = {}) {
  const renderScaleMin = normalizeNumber(input.renderScaleMin ?? input.scaleMin, 0.45, 0.25, 1.5);
  const renderScaleMax = normalizeNumber(input.renderScaleMax ?? input.scaleMax, 1.0, 0.25, 1.5);
  const pixelationMin = normalizeNumber(input.pixelationMin, 1.0, 1.0, 12.0);
  const pixelationMax = normalizeNumber(input.pixelationMax, 3.0, 1.0, 12.0);

  return {
    enabled: Boolean(input.enabled ?? false),
    targetFps: normalizeNumber(input.targetFps ?? input.minFps, 45, 15, 240),
    updateEveryFrames: normalizeInteger(input.updateEveryFrames ?? input.updateFrames, 5, 1, 60),
    renderScaleMin: Math.min(renderScaleMin, renderScaleMax),
    renderScaleMax: Math.max(renderScaleMin, renderScaleMax),
    pixelationEnabled: Boolean(input.pixelationEnabled ?? input.usePixelation ?? true),
    pixelationMin: Math.min(pixelationMin, pixelationMax),
    pixelationMax: Math.max(pixelationMin, pixelationMax)
  };
}


export function normalizeDisplayConfig(input = {}) {
  return {
    resolutionPreset: normalizeResolutionPreset(
      input.resolutionPreset ?? input.resolution ?? input.canvasResolution
    ),
    canvasSizeScale: normalizeNumber(
      input.canvasSizeScale ?? input.canvasScale ?? input.canvasSize ?? input.viewportScale,
      1.0,
      0.35,
      1.0
    ),
    devModeEnabled: Boolean(input.devModeEnabled ?? input.devMode ?? false),
    showFps: Boolean(input.showFps ?? input.fps ?? true),
    idleCamsEnabled: Boolean(input.idleCamsEnabled ?? input.idleCams ?? true),
    idleStartSeconds: normalizeNumber(
      input.idleStartSeconds ?? input.idleStart ?? input.startToIdleSeconds ?? input.idleDelaySeconds ?? input.idleDelay ?? input.idleSeconds,
      5.0,
      1.0,
      60.0
    ),
    idleDurationSeconds: normalizeNumber(
      input.idleDurationSeconds ?? input.idleDuration ?? input.idleTimeSeconds ?? input.idleDelaySeconds ?? input.idleDelay ?? input.idleSeconds,
      5.0,
      1.0,
      60.0
    ),
    idleDelaySeconds: normalizeNumber(
      input.idleDelaySeconds ?? input.idleDelay ?? input.idleSeconds ?? input.idleStartSeconds ?? input.startToIdleSeconds,
      5.0,
      1.0,
      60.0
    ),
    markerColor: normalizeColorHex(input.markerColor ?? input.selectionMarkerColor, "#ffd37a"),
    markerOpacity: normalizeNumber(input.markerOpacity ?? input.selectionMarkerOpacity, 0.82, 0.0, 1.0),
    markerGlow: normalizeNumber(input.markerGlow ?? input.selectionMarkerGlow, 1.0, 0.0, 3.0),
    uiColor: normalizeColorHex(input.uiColor ?? input.baseUiColor ?? input.panelColor, "#7ec8ff"),
    panelOpacity: normalizeNumber(input.panelOpacity ?? input.panelTransparency, 0.76, 0.2, 1.0),
    mapColor: normalizeColorHex(input.mapColor ?? input.baseMapColor ?? input.gridColor, "#7ec8ff"),
    sectorGridEnabled: Boolean(input.sectorGridEnabled ?? true),
    sectorGridOpacity: normalizeNumber(input.sectorGridOpacity, 0.10, 0.0, 0.6),
    sectorHoverStrength: normalizeNumber(input.sectorHoverStrength, 0.28, 0.0, 1.0),
    sectorActiveStrength: normalizeNumber(input.sectorActiveStrength, 0.62, 0.0, 1.5),
    starMapScrollSpeed: normalizeNumber(input.starMapScrollSpeed, 1.0, 0.1, 4.0),
    systemMapScrollSpeed: normalizeNumber(input.systemMapScrollSpeed, 1.0, 0.1, 4.0),
    orbitScrollSpeed: normalizeNumber(input.orbitScrollSpeed, 1.0, 0.1, 4.0),
    starMapRotationInertia: Boolean(input.starMapRotationInertia ?? true),
    systemMapRotationInertia: Boolean(input.systemMapRotationInertia ?? true),
    starMapIdleAutoSelect: Boolean(input.starMapIdleAutoSelect ?? true),
    systemMapIdleAutoOrbit: Boolean(input.systemMapIdleAutoOrbit ?? true),
    orbitIdleCamera: Boolean(input.orbitIdleCamera ?? true),
    devToggleKey: createNormalizedDevToggleKey(input),
    keyBindings: normalizeKeyBindings(input.keyBindings ?? input.controls ?? {}, {
      devToggleKey: createNormalizedDevToggleKey(input)
    })
  };
}

function createNormalizedDevToggleKey(input = {}) {
  const key = normalizeKeyCode(input.devToggleKey, "F2");
  const defaultControlKeys = new Set(Object.values(DEFAULT_KEY_BINDINGS));

  return RESERVED_CONTROL_KEYS.has(key) || defaultControlKeys.has(key) ? "F2" : key;
}


function normalizeColorHex(value, fallback = "#ffffff") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }

  return fallback;
}

function normalizeResolutionPreset(value) {
  if (
    value === "max" ||
    value === "1440p" ||
    value === "1080p" ||
    value === "720p"
  ) {
    return value;
  }

  return "max";
}


export function normalizeTerrainViewConfig(input = {}) {
  return {
    maxRenderDistance: normalizeNumber(input.maxRenderDistance ?? input.renderDistance ?? input.maxTerrainRenderDistance, 12000.0, 5000.0, 15000.0),
    hud: {
      enabled: Boolean(input.hud?.enabled ?? true),
      opacity: normalizeNumber(input.hud?.opacity, 0.9, 0.0, 1.0),
      scale: normalizeNumber(input.hud?.scale, 0.83, 0.5, 1.8)
    },
    compass: {
      enabled: Boolean(input.compass?.enabled ?? true),
      opacity: normalizeNumber(input.compass?.opacity, 0.95, 0.0, 1.0),
      sizePx: normalizeNumber(input.compass?.sizePx, 240, 120, 520),
      bottomPx: normalizeNumber(input.compass?.bottomPx, -10, -240, 420),
      translateYPx: normalizeNumber(input.compass?.translateYPx, 0, -240, 240),
      centerYOffset: normalizeNumber(input.compass?.centerYOffset, 0.5, 0.2, 0.85),
      scale: normalizeNumber(input.compass?.scale, 75, 30, 180),
      eclipticRadius: normalizeNumber(input.compass?.eclipticRadius, 1.0, 0.1, 4.0),
      labelScale: normalizeNumber(input.compass?.labelScale, 1.04, 0.5, 2.0),
      speedRadiusScale: normalizeNumber(input.compass?.speedRadiusScale, 1.04, 0.5, 2.0),
      controlRadiusScale: normalizeNumber(input.compass?.controlRadiusScale, 1.15, 0.5, 2.0),
      speedLineWidth: normalizeNumber(input.compass?.speedLineWidth, 5, 1, 20),
      auxLineWidth: normalizeNumber(input.compass?.auxLineWidth, 4, 1, 20),
      controlGapRadians: normalizeNumber(input.compass?.controlGapRadians, 0.12, 0.0, 0.75),
      glowBlur: normalizeNumber(input.compass?.glowBlur, 10, 0, 40)
    },
    skyShaderId: normalizeSkyShaderId(input.skyShaderId ?? input.skyShader?.shaderId),
    skyShaderParams: normalizeSkyShaderParams(input.skyShaderParams ?? input.skyShader?.params ?? {}, input.skyShaderId ?? input.skyShader?.shaderId),
    sky: {
      enabled: Boolean(input.sky?.enabled ?? true),
      sunDisplayScale: normalizeNumber(input.sky?.sunDisplayScale, 1.0, 0.05, 12.0),
      planetDisplayScale: normalizeNumber(input.sky?.planetDisplayScale, 1.0, 0.05, 24.0),
      minSunAngularRadius: normalizeNumber(input.sky?.minSunAngularRadius, 0.012, 0.001, 0.25),
      maxSunAngularRadius: normalizeNumber(input.sky?.maxSunAngularRadius, 0.42, 0.01, 1.2),
      minPlanetAngularRadius: normalizeNumber(input.sky?.minPlanetAngularRadius, 0.003, 0.001, 0.2),
      maxPlanetAngularRadius: normalizeNumber(input.sky?.maxPlanetAngularRadius, 0.12, 0.003, 0.8),
      sunMeshScale: normalizeNumber(input.sky?.sunMeshScale, 1.0, 0.05, 8.0),
      sunHaloScale: normalizeNumber(input.sky?.sunHaloScale, 3.2, 1.0, 12.0),
      sunIntensity: normalizeNumber(input.sky?.sunIntensity, 1.15, 0.0, 8.0),
      nightAmbient: normalizeNumber(input.sky?.nightAmbient, 0.045, 0.0, 0.5),
      dayAmbient: normalizeNumber(input.sky?.dayAmbient, 0.19, 0.0, 1.0)
    },
    atmosphere: {
      ...normalizeAtmosphereConfig(input.atmosphere ?? input.clouds ?? {})
    },
    flight: {
      mouseSensitivity: normalizeNumber(input.flight?.mouseSensitivity, 0.002, 0.0005, 0.005),
      speed: normalizeNumber(input.flight?.speed, 8.0, 0.0, 200.0),
      clearance: normalizeNumber(input.flight?.clearance, 150.0, 150.0, 300.0),
      boostMultiplier: normalizeNumber(input.flight?.boostMultiplier, 2.0, 1.0, 5.0),
      maxAltitude: normalizeNumber(input.flight?.maxAltitude, 5000.0, 5000.0, 5000.0),
      cushionMinRange: normalizeNumber(input.flight?.cushionMinRange, 1.8, 0.0, 25.0),
      cushionClearanceFactor: normalizeNumber(input.flight?.cushionClearanceFactor, 1.35, 0.1, 5.0),
      cushionBaseUpVelocity: normalizeNumber(input.flight?.cushionBaseUpVelocity, 3.5, 0.0, 80.0),
      cushionSpeedFactor: normalizeNumber(input.flight?.cushionSpeedFactor, 0.9, 0.0, 5.0),
      cushionApproach: normalizeNumber(input.flight?.cushionApproach, 6.0, 0.1, 50.0),
      cushionDamping: normalizeNumber(input.flight?.cushionDamping, 1.8, 0.0, 20.0),
      groundCatchupSmoothness: normalizeNumber(input.flight?.groundCatchupSmoothness, 14.0, 0.1, 80.0)
    }
  };
}

export function normalizeSkyShaderId(input) {
  return input === "thin-atmosphere" ? "thin-atmosphere" : "none";
}

export function normalizeSkyShaderParams(input = {}, shaderId = "none") {
  const safeShaderId = normalizeSkyShaderId(shaderId);

  if (safeShaderId === "thin-atmosphere") {
    return {
      density: normalizeNumber(input.density, 0.55, 0.0, 2.0),
      horizon: normalizeNumber(input.horizon, 1.1, 0.0, 3.0),
      spaceFade: normalizeNumber(input.spaceFade, 0.25, 0.0, 1.0),
      skyBrightness: normalizeNumber(input.skyBrightness, 1.5, 0.0, 1.5),
      ambient: normalizeNumber(input.ambient, 0.22, 0.0, 1.0),
      lightIntensity: normalizeNumber(input.lightIntensity, 1.0, 0.0, 3.0),
      shadowStrength: normalizeNumber(input.shadowStrength, 0.35, 0.0, 1.0),
      shadowDistance: normalizeNumber(input.shadowDistance, 90.0, 5.0, 300.0),
      shadowSteps: normalizeNumber(input.shadowSteps, 18.0, 0.0, 48.0)
    };
  }

  return {};
}

export function normalizeAtmosphereConfig(input = {}) {
  const clouds = input.clouds ?? input;
  const cloudRenderDistance = normalizeNumber(
    clouds.renderDistance ?? clouds.fadeDistance,
    18000.0,
    1000.0,
    30000.0
  );

  return {
    clouds: {
      enabled: Boolean(clouds.enabled ?? false),
      speed: normalizeNumber(clouds.speed, 0.25, -2.0, 2.0),
      density: normalizeNumber(clouds.density, 1.25, 0.0, 2.0),
      opacity: normalizeNumber(clouds.opacity, 0.72, 0.0, 1.0),
      scale: normalizeNumber(clouds.scale, 0.12, 0.01, 0.25),
      height: normalizeNumber(clouds.height, 1.2, 1.2, 2.0),
      brightness: normalizeNumber(clouds.brightness, 1.0, 0.2, 2.0),
      contrast: normalizeNumber(clouds.contrast, 1.0, 0.0, 3.0),
      softness: normalizeNumber(clouds.softness, 1.0, 0.2, 3.0),
      blurStrength: normalizeNumber(clouds.blurStrength, 0.4, 0.4, 2.0),
      hue: normalizeNumber(clouds.hue, 0.0, -3.14, 3.14),
      saturation: normalizeNumber(clouds.saturation, 0.0, 0.0, 2.5),
      renderDistance: cloudRenderDistance,
      fadeDistance: cloudRenderDistance,
      deckThickness: normalizeNumber(clouds.deckThickness, 0.86, 0.75, 1.0),
      patchiness: normalizeNumber(clouds.patchiness, 0.0, 0.0, 1.0),
      bigPatches: normalizeNumber(clouds.bigPatches, 0.0, 0.0, 1.0),
      heightVariation: normalizeNumber(clouds.heightVariation, 0.0, 0.0, 1.0)
    },
    aurora: normalizeAuroraLayerConfig(
      input.aurora ??
      input.auroraLayer ??
      {
        enabled: input.auroraEnabled,
        params: {
          intensity: input.auroraIntensity,
          speed: input.auroraSpeed,
          bandScale: input.auroraBandScale,
          height: input.auroraHeight,
          spread: input.auroraSpread,
          trail: input.auroraTrail,
          glow: input.auroraGlow,
          horizonFade: input.auroraHorizonFade
        }
      }
    ),
    atmosphere: normalizeAtmosphereLayerConfig(
      input.atmosphere ??
      input.atmosphereLayer ??
      {
        shaderId: input.atmosphereShaderId,
        params: input.atmosphereParams
      }
    ),
    fog: normalizeFogLayerConfig(
      input.fog ??
      {
        shaderId: input.fogShaderId,
        params: input.fogParams
      }
    ),
    weather: normalizeWeatherLayerConfig(
      input.weather ??
      input.weatherLayer ??
      {
        shaderId: input.weatherShaderId,
        params: input.weatherParams
      }
    )
  };
}

export function normalizeAuroraLayerConfig(input = {}) {
  const params = input.params ?? input;

  return {
    enabled: Boolean(input.enabled ?? params.enabled ?? false),
    params: {
      intensity: 3.0,
      speed: 1.0,
      bandScale: 165.0,
      height: normalizeNumber(params.height, 1900.0, 1800.0, 2000.0),
      spread: 2.0,
      trail: 2.6,
      glow: normalizeNumber(params.glow, 3.4, 3.0, 4.0),
      horizonFade: normalizeNumber(params.horizonFade, 1.08, 1.0, 1.15)
    }
  };
}

export function normalizeAtmosphereLayerConfig(input = {}) {
  const shaderId = input.enabled === false
    ? "none-atmosphere"
    : input.shaderId === "atmosphere-flow" || input.enabled === true
      ? "atmosphere-flow"
      : "none-atmosphere";
  const params = input.params ?? input;

  return {
    shaderId,
    params: {
      speed: normalizeNumber(params.speed, 0.18, -2.0, 2.0),
      density: normalizeNumber(params.density, 0.9, 0.0, 2.0),
      opacity: normalizeNumber(params.opacity, 0.32, 0.0, 1.0),
      scale: normalizeNumber(params.scale, 1.0, 0.2, 4.0),
      height: normalizeNumber(params.height, 0.25, 0.0, 2.0),
      brightness: normalizeNumber(params.brightness, 0.92, 0.2, 2.0),
      softness: normalizeNumber(params.softness, 1.35, 0.2, 3.0),
      hue: normalizeNumber(params.hue, 0.0, -3.14, 3.14),
      saturation: normalizeNumber(params.saturation, 0.65, 0.0, 2.5)
    }
  };
}

export function normalizeWeatherLayerConfig(input = {}) {
  // Legacy screen-space "snow" is intentionally mapped to the new 3D snow
  // renderer. The old overlay shader is no longer part of TerrainView.
  const shaderId =
    input.shaderId === "snow" ? "snow-3d" :
    input.shaderId === "snow-3d" || input.shaderId === "rain-3d" ? input.shaderId :
    "none-weather";
  const params = input.params ?? input;

  return {
    shaderId,
    params: {
      count: normalizeInteger(params.count, shaderId === "rain-3d" ? 5500 : 8000, 250, 8000),
      fallSpeed: normalizeNumber(
        params.fallSpeed ?? params.speed,
        shaderId === "rain-3d" ? 115.0 : 34.0,
        0.0,
        220.0
      ),
      windX: normalizeNumber(params.windX, 0.0, -120.0, 120.0),
      windZ: normalizeNumber(params.windZ, 0.0, -120.0, 120.0),
      opacity: normalizeNumber(params.opacity, shaderId === "rain-3d" ? 0.36 : 0.72, 0.0, 1.0)
    }
  };
}

export function normalizeFogLayerConfig(input = {}) {
  const shaderId = input.enabled === false
    ? "none-fog"
    : input.shaderId === "fog-clouds" || input.enabled === true
      ? "fog-clouds"
      : "none-fog";
  const params = input.params ?? input;
  const fogRenderDistance = normalizeNumber(
    params.renderDistance ?? params.fadeDistance,
    18000.0,
    1000.0,
    30000.0
  );

  return {
    shaderId,
    params: {
      speed: normalizeNumber(params.speed, 0.25, -2.0, 2.0),
      density: normalizeNumber(params.density, 1.0, 0.0, 2.0),
      opacity: normalizeNumber(params.opacity, 0.55, 0.0, 1.0),
      scale: normalizeNumber(params.scale, 0.10, 0.0, 0.25),
      height: shaderId === "fog-clouds" ? 0.01 : normalizeNumber(params.height, 0.25, -2.0, 2.0),
      brightness: normalizeNumber(params.brightness, 1.0, 0.2, 2.0),
      softness: normalizeNumber(params.softness, 1.0, 0.2, 3.0),
      hue: normalizeNumber(params.hue, 0.0, -3.14, 3.14),
      saturation: normalizeNumber(params.saturation, 1.0, 0.0, 2.5),
      renderDistance: fogRenderDistance,
      fadeDistance: fogRenderDistance,
      deckThickness: normalizeNumber(params.deckThickness, 1.0, 0.25, 8.0)
    }
  };
}

export function normalizePlanetAtmosphereConfig(input = {}) {
  const clouds = input.clouds ?? input;

  return {
    clouds: {
      enabled: Boolean(clouds.enabled ?? false),
      speed: normalizeNumber(clouds.speed, 0.25, -2.0, 2.0),
      density: normalizeNumber(clouds.density, 1.0, 0.0, 2.0),
      opacity: normalizeNumber(clouds.opacity, 0.55, 0.0, 1.0),
      scale: normalizeNumber(clouds.scale, 0.12, 0.01, 0.25),
      height: normalizeNumber(clouds.height, 1.2, 1.2, 2.0),
      brightness: normalizeNumber(clouds.brightness, 1.0, 0.2, 2.0),
      contrast: normalizeNumber(clouds.contrast, 1.0, 0.0, 3.0),
      softness: normalizeNumber(clouds.softness, 1.0, 0.2, 3.0),
      blurStrength: normalizeNumber(clouds.blurStrength, 0.4, 0.4, 2.0),
      hue: normalizeNumber(clouds.hue, 0.0, -3.14, 3.14),
      saturation: normalizeNumber(clouds.saturation, 0.0, 0.0, 2.5),
      patchiness: normalizeNumber(clouds.patchiness, 0.0, 0.0, 1.0),
      bigPatches: normalizeNumber(clouds.bigPatches, 0.0, 0.0, 1.0),
      renderDistance: normalizeNumber(clouds.renderDistance ?? clouds.fadeDistance, 18000.0, 1000.0, 30000.0),
      fadeDistance: normalizeNumber(clouds.fadeDistance ?? clouds.renderDistance, 18000.0, 1000.0, 30000.0),
      deckThickness: normalizeNumber(clouds.deckThickness, 0.86, 0.75, 1.0),
      heightVariation: normalizeNumber(clouds.heightVariation, 0.0, 0.0, 1.0),
      orbitHeight: normalizeNumber(clouds.orbitHeight, 1.035, 1.0, 1.125),
      orbitOpacity: normalizeNumber(clouds.orbitOpacity ?? clouds.orbitCloudOpacity ?? clouds.opacity, 0.55, 0.1, 0.7),
      orbitPatchinessScale: normalizeNumber(clouds.orbitPatchinessScale, 1.0, 0.0, 10.0)
    },
    aurora: normalizeAuroraLayerConfig(
      input.aurora ??
      input.auroraLayer ??
      {
        enabled: input.auroraEnabled,
        params: {
          intensity: input.auroraIntensity,
          speed: input.auroraSpeed,
          bandScale: input.auroraBandScale,
          height: input.auroraHeight,
          spread: input.auroraSpread,
          trail: input.auroraTrail,
          glow: input.auroraGlow,
          horizonFade: input.auroraHorizonFade
        }
      }
    ),
    atmosphere: normalizeAtmosphereLayerConfig(
      input.atmosphere ??
      input.atmosphereLayer ??
      {
        shaderId: input.atmosphereShaderId,
        params: input.atmosphereParams
      }
    ),
    fog: normalizeFogLayerConfig(
      input.fog ??
      {
        shaderId: input.fogShaderId,
        params: input.fogParams
      }
    ),
    weather: normalizeWeatherLayerConfig(
      input.weather ??
      input.weatherLayer ??
      {
        shaderId: input.weatherShaderId,
        params: input.weatherParams
      }
    )
  };
}

function syncPlanetAtmosphereWithTerrain(atmosphere, terrainParams = {}, terrainShaderId = "none") {
  const renderDistance = normalizeNumber(terrainParams.renderDistance, 18000.0, 1000.0, 30000.0);
  const fog = atmosphere.fog ?? normalizeFogLayerConfig({});
  const clouds = atmosphere.clouds ?? normalizePlanetAtmosphereConfig({}).clouds;
  const atmosphereLayer = atmosphere.atmosphere ?? normalizeAtmosphereLayerConfig({});
  const isWaterWorld = terrainShaderId === "turbulent-sea" || terrainShaderId === "lagoon-mountains";

  return {
    ...atmosphere,
    clouds: {
      ...clouds,
      enabled: isWaterWorld ? true : clouds.enabled,
      density: isWaterWorld ? Math.max(1.35, clouds.density ?? 1.35) : clouds.density,
      opacity: isWaterWorld ? Math.max(0.76, clouds.opacity ?? 0.76) : clouds.opacity,
      orbitOpacity: normalizeNumber(clouds.orbitOpacity ?? clouds.opacity, 0.55, 0.1, 0.7),
      brightness: isWaterWorld ? Math.max(1.18, clouds.brightness ?? 1.18) : clouds.brightness,
      scale: normalizeNumber(clouds.scale, 0.12, 0.01, 0.25),
      height: Math.max(1.2, clouds.height ?? 1.2),
      blurStrength: Math.max(0.4, clouds.blurStrength ?? 0.4),
      deckThickness: normalizeNumber(clouds.deckThickness, 0.86, 0.75, 1.0),
      orbitHeight: normalizeNumber(clouds.orbitHeight, 1.035, 1.0, 1.125),
      renderDistance,
      fadeDistance: renderDistance
    },
    atmosphere: isWaterWorld
      ? {
          ...atmosphereLayer,
          shaderId: "atmosphere-flow",
          params: {
            ...(atmosphereLayer.params ?? {}),
            height: 2.0
          }
        }
      : atmosphereLayer,
    fog: {
      ...fog,
      params: {
        ...(fog.params ?? {}),
        height: fog.shaderId === "fog-clouds" ? 0.01 : fog.params?.height ?? 0.25,
        renderDistance,
        fadeDistance: renderDistance
      }
    }
  };
}


export function normalizeSystemConfig(input) {
  const discovered = Boolean(input.discovered);
  const seed = input.seed ?? 1;
  const kind = normalizeStarMapSignalKind(input.kind ?? input.signalKind ?? input.type);
  const isStellarObjectSignal = kind === "stellar-object";
  const normalizedStar = normalizeStarConfig(input.star);
  const fallbackGeneratedName = generateStellarName(STELLAR_CATEGORIES.STAR, seed);
  const systemName = input.name ?? normalizedStar.name ?? fallbackGeneratedName ?? input.id;
  normalizedStar.name ??= systemName;

  const planets = isStellarObjectSignal
    ? []
    : normalizePlanetList(input.planets, {
        parentStarName: normalizedStar.name,
        systemSeed: seed
      });
  const fallbackPlanetCount = isStellarObjectSignal
    ? 0
    : Array.isArray(input.planets)
      ? Math.min(input.planets.length, MAX_SYSTEM_PLANETS)
      : Math.min(planets.length, MAX_SYSTEM_PLANETS);
  const explicitPlanetCount = getExplicitPlanetCount(input);
  const planetCount = isStellarObjectSignal
    ? 0
    : normalizeInteger(
        explicitPlanetCount ?? fallbackPlanetCount,
        fallbackPlanetCount,
        1,
        MAX_SYSTEM_PLANETS
      );
  const stellarObject = isStellarObjectSignal
    ? normalizeStarMapStellarObjectConfig(input.stellarObject ?? input.object ?? {})
    : null;

  return {
    id: input.id,
    kind,
    name: systemName,
    seed,
    position: normalizeVector3(input.position, [0, 0, 0]),
    color: normalizeColor(input.color, [1, 0.72, 0.36]),
    size: input.size ?? 1,
    discovered,

    summary: {
      planetCount,
      starType: isStellarObjectSignal
        ? input.summary?.starType ?? "stellar object"
        : discovered ? input.summary?.starType ?? "unknown" : "unknown"
    },

    visual: normalizeSystemVisual(input.visual),
    star: normalizedStar,
    planets,
    stellarObject
  };
}

function normalizeStarMapSignalKind(input) {
  return input === "stellar-object" || input === "stellarObject" || input === "object"
    ? "stellar-object"
    : "system";
}

function normalizeStarMapStellarObjectConfig(input = {}) {
  const objectId = STELLAR_OBJECT_ORDER.includes(input.objectId ?? input.id ?? input.type)
    ? input.objectId ?? input.id ?? input.type
    : getDefaultStellarObjectId();
  const params = input.objectParams ?? input.params ?? {};
  const objectParams = {};

  if (params && typeof params === "object") {
    for (const [key, value] of Object.entries(params)) {
      const numericValue = Number(value);

      if (Number.isFinite(numericValue)) {
        objectParams[key] = numericValue;
      }
    }
  }

  return {
    objectId,
    objectParams
  };
}


function getExplicitPlanetCount(input = {}) {
  const rawCount = input.summary?.planetCount ?? input.planetCount;

  if (rawCount === null || rawCount === undefined || rawCount === "") {
    return null;
  }

  const count = Number(rawCount);
  return Number.isFinite(count) ? count : null;
}

export function normalizeSystemVisual(input = {}) {
  const rawSpaceShaderId = input.spaceShaderId ?? "star-nest";
  const spaceShaderId = normalizeSpaceShaderId(rawSpaceShaderId);

  return {
    spaceShaderId,
    spaceShaderParams: normalizeSpaceShaderParams(
      rawSpaceShaderId,
      input.spaceShaderParams ?? input.spaceParams ?? {}
    ),
    sunShaderId: normalizeSunShaderId(input.sunShaderId)
  };
}

export function normalizeSpaceShaderId(input) {
  if (input === "star-nest" || input === "star-nest-2" || input === "gradient-stars") {
    return "star-nest";
  }

  return "star-nest";
}

export function normalizeSunShaderId(input) {
  if (input === "age-plasma-sun") {
    return "fractal-sun";
  }

  return input === "fractal-sun" ? "fractal-sun" : "fractal-sun";
}

export function normalizeSpaceShaderParams(shaderId, input = {}) {
  const isGradientLegacy = shaderId === "gradient-stars";

  return {
    iterations: normalizeInteger(input.iterations, 13, 1, 17),
    volSteps: normalizeInteger(input.volSteps, 12, 1, 20),
    zoom: normalizeNumber(input.zoom, 1.0, 0.1, 2.5),
    tile: normalizeNumber(input.tile, 0.16, 0.1, 2.5),
    speed: normalizeNumber(input.speed, 0.0, -0.2, 0.2),
    brightness: normalizeNumber(input.brightness, 0.0002, 0, 0.02),
    darkMatter: normalizeNumber(input.darkMatter, 0.84, 0, 1),
    distFading: normalizeNumber(input.distFading, 0.76, 0.1, 1),
    saturation: normalizeNumber(input.saturation, 0.98, 0, 2),
    stepSize: normalizeNumber(input.stepSize, 0.1, 0.01, 0.5),
    drift: normalizeNumber(input.drift, isGradientLegacy ? 0.03 : 0.03, -1, 2),
    starNestAmount: normalizeNumber(input.starNestAmount, isGradientLegacy ? 0.0 : 1.0, 0, 2),
    gradientAmount: normalizeNumber(input.gradientAmount, isGradientLegacy ? 1.0 : 0.0, 0, 2),
    horizonGlow: normalizeNumber(input.horizonGlow, 0.55, 0, 3),
    horizonDepth: normalizeNumber(input.horizonDepth ?? input.depth, 1.2, 0.1, 4),
    starCount: normalizeNumber(input.starCount ?? input.starIntensity, 1.6, 0, 2),
    starDensity: normalizeNumber(input.starDensity, 110, 10, 320)
  };
}

export function normalizeStarConfig(input = {}) {
  const legacySpeed = input.speed ?? input.surfaceSpeed ?? 1.0;

  return {
    name: input.name ?? null,
    shaderId: input.shaderId ?? "fractal-sun",
    radius: normalizeNumber(input.radius, 0.02, 0.002, 0.2),
    color: normalizeColor(input.color, [1.0, 0.62, 0.28]),
    brightness: normalizeNumber(input.brightness, 1.45, 0, 8),
    haloBrightness: normalizeNumber(input.haloBrightness, 1.0, 0, 8),
    glow: normalizeNumber(input.glow, 1.0, 0, 8),
    corona: normalizeNumber(input.corona, 0.65, 0, 8),
    flare: normalizeNumber(input.flare, 0.35, 0, 8),
    surfaceScale: normalizeNumber(input.surfaceScale, 1.0, 0.05, 4),
    coronaScale: normalizeNumber(input.coronaScale, 0.12, 0.01, 0.5),
    surfaceAnimationSpeed: normalizeNumber(
      input.surfaceAnimationSpeed ?? legacySpeed,
      1.0,
      0,
      8
    ),
    sphereRotationSpeed: normalizeNumber(
      input.sphereRotationSpeed ?? 0,
      0,
      -8,
      8
    ),
    coronaSpeed: normalizeNumber(input.coronaSpeed ?? legacySpeed, 1.0, 0, 12)
  };
}

export function normalizePlanetList(input, options = {}) {
  const planets = Array.isArray(input) ? [...input] : createDefaultPlanets(4);

  for (let index = planets.length; index < MAX_SYSTEM_PLANETS; index += 1) {
    planets.push({});
  }

  return applyGeneratedPlanetNames(
    planets
      .slice(0, MAX_SYSTEM_PLANETS)
      .map((planet, index) => normalizePlanetConfig(planet, index)),
    options
  );
}

export function normalizeMoonConfig(input = {}) {
  if (typeof input === "number") {
    return {
      count: normalizeInteger(input, 0, 0, 10),
      radiusScale: 1,
      sizeScale: 1
    };
  }

  if (Array.isArray(input)) {
    return {
      count: normalizeInteger(input.length, 0, 0, 10),
      radiusScale: 1,
      sizeScale: 1
    };
  }

  return {
    count: normalizeInteger(input.count ?? input.moonCount ?? 0, 0, 0, 10),
    radiusScale: normalizeNumber(input.radiusScale, 1, 0.35, 3.0),
    sizeScale: normalizeNumber(input.sizeScale, 1, 0.25, 3.0)
  };
}

export function normalizePlanetConfig(input = {}, index = 0) {
  const defaultOrbitRadius = 0.11 + index * 0.09;
  const legacyShaderId = input.visual?.terrainShaderId ??
    input.terrainShaderId ??
    input.visual?.planetShaderId ??
    input.planetShaderId ??
    "rocky";
  const terrainShaderId = normalizePlanetTerrainShaderId(legacyShaderId);
  const normalizedSurfaceTextureId = normalizePlanetSurfaceTextureId(
    input.visual?.surfaceTextureId ?? input.surfaceTextureId ?? "none"
  );
  const normalizedTerrainParams = enforceTerrainTextureMixFloor(
    terrainShaderId,
    normalizePlanetTerrainParams(
      terrainShaderId,
      input.visual?.terrainParams ?? input.terrainParams ?? input.visual?.planetShaderParams ?? input.planetShaderParams ?? {}
    ),
    normalizedSurfaceTextureId
  );
  const normalizedAtmosphere = syncPlanetAtmosphereWithTerrain(
    normalizePlanetAtmosphereConfig(
      input.visual?.atmosphere ?? input.atmosphere ?? input.visual?.clouds ?? input.clouds ?? {}
    ),
    normalizedTerrainParams,
    terrainShaderId
  );

  const legacySkyShaderId =
    input.visual?.skyShaderId ??
    input.skyShaderId ??
    input.visual?.skyShader?.shaderId ??
    input.skyShader?.shaderId ??
    "none";

  const skyShaderId = normalizeSkyShaderId(legacySkyShaderId);
  const skyShaderParams = normalizeSkyShaderParams(
    input.visual?.skyShaderParams ??
      input.skyShaderParams ??
      input.visual?.skyShader?.params ??
      input.skyShader?.params ??
      {},
    skyShaderId
  );

  return {
    id: input.id ?? `planet-${index + 1}`,
    name: input.name ?? `Planet ${index + 1}`,

    orbit: {
      radius: normalizeNumber(
        input.orbit?.radius ?? input.orbitRadius,
        defaultOrbitRadius,
        0.02,
        16.0
      ),
      angle: normalizeNumber(
        input.orbit?.angle ?? input.orbitAngle,
        index * 0.9,
        -Math.PI * 2,
        Math.PI * 2
      ),
      speed: normalizeNumber(
        input.orbit?.speed ?? input.orbitSpeed,
        0.01,
        -0.25,
        0.25
      ),
      inclination: normalizeNumber(
        input.orbit?.inclination ?? input.orbitInclination,
        0,
        -Math.PI * 0.5,
        Math.PI * 0.5
      )
    },

    body: {
      radius: normalizeNumber(
        input.body?.radius ?? input.radius,
        0.005,
        0.001,
        0.1
      ),
      axialTilt: normalizeNumber(
        input.body?.axialTilt ?? input.axialTilt,
        0,
        -Math.PI * 0.5,
        Math.PI * 0.5
      ),
      rotationSpeed: normalizeNumber(
        input.body?.rotationSpeed ?? input.rotationSpeed,
        0.08,
        -5,
        5
      ),
      rotationOffset: normalizeNumber(
        input.body?.rotationOffset ?? input.rotationOffset,
        0,
        -Math.PI * 2,
        Math.PI * 2
      )
    },

    visual: {
      showGrid: Boolean(input.visual?.showGrid ?? true),
      showInclinationIndicators: Boolean(input.visual?.showInclinationIndicators ?? false),
      skyShaderId,
      skyShaderParams,
      terrainShaderId,
      terrainParams: normalizedTerrainParams,
      surfaceTextureId: normalizedSurfaceTextureId,
      surfaceTextureParams: normalizePlanetSurfaceTextureParams(
        input.visual?.surfaceTextureParams ?? input.surfaceTextureParams ?? {}
      ),
      baseColor: normalizeColor(
        input.visual?.baseColor ?? input.systemVisual?.baseColor,
        [0.64, 0.68, 0.72]
      ),
      accentColor: normalizeColor(
        input.visual?.accentColor ?? input.systemVisual?.accentColor,
        [0.9, 0.92, 1.0]
      ),
      ring: normalizeRingConfig({
        ...(input.systemVisual?.ringParams ?? {}),
        ...(input.ringParams ?? {}),
        ...(input.visual?.ringParams ?? {}),
        ...(input.visual?.ring ?? {}),
        enabled: input.visual?.ring?.enabled ??
          input.visual?.ringEnabled ??
          input.ringEnabled ??
          input.systemVisual?.ringEnabled ??
          input.visual?.ringParams?.enabled ??
          input.ringParams?.enabled ??
          input.systemVisual?.ringParams?.enabled
      }),
      atmosphere: normalizedAtmosphere
    },

    orbitView: normalizePlanetOrbitViewConfig(
      input.orbitView ?? input.visual?.orbitView ?? {},
      terrainShaderId,
      normalizedTerrainParams
    ),

    moons: normalizeMoonConfig(input.moons ?? input.moonConfig ?? input.moonCount ?? {})
  };
}


function applyGeneratedPlanetNames(planets, options = {}) {
  const parentStarName = options.parentStarName;

  if (!parentStarName) {
    return planets;
  }

  const systemSeed = options.systemSeed ?? 1;

  return planets.map((planet, index) => {
    if (!isDefaultPlanetName(planet.name, index)) {
      return planet;
    }

    return {
      ...planet,
      name: generateStellarName(
        STELLAR_CATEGORIES.PLANET,
        hashInt(systemSeed, 200 + index),
        {
          parentStarName,
          planetIndex: index
        }
      )
    };
  });
}

function isDefaultPlanetName(name, index) {
  return !name || name === `Planet ${index + 1}`;
}

export function createDefaultPlanets(count) {
  const planets = [];

  for (let index = 0; index < count; index += 1) {
    planets.push({
      id: `planet-${index + 1}`,
      name: `Planet ${index + 1}`,
      orbit: {
        radius: 0.11 + index * 0.09,
        angle: index * 0.85,
        speed: 0.025 + index * 0.006,
        inclination: index * 0.025
      },
      body: {
        radius: 0.005 + index * 0.0007,
        axialTilt: index * 0.06,
        rotationSpeed: 0.08 + index * 0.03,
        rotationOffset: 0
      },
      visual: {
        showGrid: true,
        showInclinationIndicators: false,
        skyShaderId: "none",
        skyShaderParams: {},
        terrainShaderId: "rocky",
        terrainParams: normalizePlanetTerrainParams("rocky", {}),
        surfaceTextureId: "none",
        surfaceTextureParams: {
          mix: 0.65,
          scale: 1.0,
          brightness: 1.0,
          contrast: 1.0,
          sharpness: 0.0
        },
        baseColor: [0.64, 0.68, 0.72],
        accentColor: [0.9, 0.92, 1.0],
        ring: normalizeRingConfig(),
        atmosphere: normalizePlanetAtmosphereConfig({})
      },
      moons: normalizeMoonConfig({}),
      orbitView: {
        featureScale: null,
        textureScale: null,
        contrast: null,
        hue: 0.0,
        saturation: 1.0
      }
    });
  }

  return planets;
}

export function setSystemPlanetCount(system, count) {
  const nextCount = normalizeInteger(count, 1, 1, MAX_SYSTEM_PLANETS);
  const previousCount = normalizeInteger(
    system?.summary?.planetCount,
    1,
    1,
    MAX_SYSTEM_PLANETS
  );
  const currentPlanets = Array.isArray(system.planets) ? [...system.planets] : [];

  for (let index = currentPlanets.length; index < MAX_SYSTEM_PLANETS; index += 1) {
    currentPlanets.push(normalizePlanetConfig({}, index));
  }

  system.planets = applyGeneratedPlanetNames(
    currentPlanets
      .slice(0, MAX_SYSTEM_PLANETS)
      .map((planet, index) => normalizePlanetConfig(planet, index)),
    {
      parentStarName: system.star?.name ?? system.name ?? system.id,
      systemSeed: system.seed ?? 1
    }
  );

  if (nextCount > previousCount) {
    for (let index = previousCount; index < nextCount; index += 1) {
      const planet = system.planets[index];

      if (!planet) {
        continue;
      }

      planet.orbit ??= {};
      planet.orbit.angle = randomOrbitAngle();
      planet.body ??= {};
      planet.body.rotationOffset = randomOrbitAngle();
    }
  }

  system.summary ??= {};
  system.summary.planetCount = nextCount;
}

export function normalizePlanetTerrainParams(shaderId, input = {}) {
  return normalizeTerrainParams(shaderId, input, normalizeNumber);
}

function enforceTerrainTextureMixFloor(shaderId, terrainParams = {}, surfaceTextureId = "none") {
  if (surfaceTextureId === "none" || !Object.prototype.hasOwnProperty.call(terrainParams, "textureMix")) {
    return terrainParams;
  }

  const shader = getTerrainShader(shaderId);
  const textureMixParam = shader.params.find((param) => param.key === "textureMix");
  const maxTextureMix = Number.isFinite(Number(textureMixParam?.max))
    ? Number(textureMixParam.max)
    : 1.0;
  const minTextureMix = Math.min(0.65, maxTextureMix);

  return {
    ...terrainParams,
    textureMix: normalizeNumber(terrainParams.textureMix, minTextureMix, minTextureMix, maxTextureMix)
  };
}

export function normalizePlanetOrbitViewConfig(input = {}, shaderId = "none", terrainParams = {}) {
  const shader = getTerrainShader(shaderId);
  const featureRange = getOrbitFeatureScaleRange(shaderId, shader);
  const textureRange = getOrbitTextureScaleRange(shader);

  return {
    featureScale: normalizeOptionalNumber(
      input.featureScale ?? input.sphereFeatureScale ?? input.featureScaleOverride,
      featureRange.min,
      featureRange.max
    ),
    textureScale: normalizeOptionalNumber(
      input.textureScale ?? input.sphereTextureScale ?? input.textureScaleOverride,
      textureRange.min,
      textureRange.max
    ),
    contrast: normalizeOptionalNumber(
      input.contrast ?? input.sphereContrast ?? input.contrastOverride,
      0.2,
      3.0
    ),
    hue: normalizeNumber(
      input.hue ?? input.sphereHue ?? input.hueOverride ?? terrainParams.hue ?? terrainParams.surfaceHue,
      0.0,
      -3.14,
      3.14
    ),
    saturation: normalizeNumber(
      input.saturation ?? input.sphereSaturation ?? input.saturationOverride ?? terrainParams.saturation ?? terrainParams.surfaceSaturation,
      1.0,
      0.0,
      2.5
    )
  };
}

function getOrbitFeatureScaleParam(shader) {
  return shader.params.find((param) => param.key === "featureScale") ??
    shader.params.find((param) => param.key === "terrainScale") ??
    shader.params.find((param) => param.key === "crackScale") ??
    null;
}

function getOrbitFeatureScaleRange(shaderId, shader) {
  const param = getOrbitFeatureScaleParam(shader);

  if (shaderId === "frozen-lake") {
    return { min: 0.1, max: 10.0 };
  }

  if (shaderId === "mountain") {
    return { min: 0.5, max: 350.0 };
  }

  if (shaderId === "rocky") {
    return { min: 0.2, max: 15.0 };
  }

  if (shaderId === "volcanic") {
    return { min: 0.2, max: 50.0 };
  }

  if (shaderId === "efficient-mountains") {
    return { min: 5.0, max: 12.0 };
  }

  if (shaderId === "triwave-ridges") {
    return { min: 0.25, max: 0.60 };
  }

  if (shaderId === "soft-dunes") {
    return { min: 0.25, max: 25.0 };
  }

  if (shaderId === "biome-mountains") {
    return { min: 0.5, max: 12.0 };
  }

  if (shaderId === "turbulent-sea") {
    return { min: 1.0, max: 12.0 };
  }

  return {
    min: param?.min ?? 0.001,
    max: param?.max ?? 10000
  };
}

function getOrbitTextureScaleRange(shader) {
  const param = shader.params.find((candidate) => candidate.key === "textureScale") ?? null;

  return {
    min: param?.min ?? 0.001,
    max: param?.max ?? 10000
  };
}


export function normalizeRingConfig(input = {}) {
  const enabled = Boolean(input.enabled ?? false);

  return {
    enabled,
    innerRadius: normalizeNumber(input.innerRadius ?? input.inner ?? input.ringInnerRadius, 1.35, 1.01, 8.0),
    outerRadius: normalizeNumber(input.outerRadius ?? input.outer ?? input.ringOuterRadius, 2.35, 1.02, 12.0),
    // Rings are locked to the planet equator. Keep legacy fields neutralized
    // so old configs cannot tilt rings away from the axial inclination.
    tilt: 0,
    yaw: 0,
    roll: 0,
    apparentSize: normalizeNumber(input.apparentSize, 1.0, 0.1, 8.0),
    surfaceScale: normalizeNumber(input.surfaceScale, 1.0, 0.1, 8.0),
    orbitScale: normalizeNumber(input.orbitScale, 1.0, 0.1, 8.0),
    orbitWidth: normalizeNumber(input.orbitWidth, 1.0, 0.1, 8.0),
    systemScale: normalizeNumber(input.systemScale, 1.0, 0.1, 8.0),
    brightness: normalizeNumber(input.brightness, 1.25, 0.0, 8.0),
    opacity: normalizeNumber(input.opacity, 0.85, 0.0, 1.0),
    shadowStrength: normalizeNumber(input.shadowStrength, 0.46, 0.0, 1.0),
    shadowSoftness: normalizeNumber(input.shadowSoftness, 0.18, 0.01, 1.0),
    hue: normalizeNumber(input.hue, 0.12, -1.0, 1.0),
    banding: normalizeNumber(input.banding, 1.15, 0.0, 4.0),
    color: normalizeColor(input.color, [0.86, 0.78, 0.62])
  };
}

export function normalizePlanetSurfaceTextureParams(input = {}) {
  return {
    mix: normalizeNumber(input.mix, 0.65, 0.0, 1.0),
    scale: normalizeNumber(input.scale, 1.0, 0.05, 12.0),
    brightness: normalizeNumber(input.brightness, 1.0, 0.1, 3.0),
    contrast: normalizeNumber(input.contrast, 1.0, 0.1, 3.0),
    sharpness: normalizeNumber(input.sharpness, 0.0, 0.0, 2.0)
  };
}

function normalizePlanetTerrainShaderId(value) {
  if (value === "alpine-snow") {
    return "efficient-mountains";
  }

  if (value === "mountain-rivers") {
    return "efficient-mountains";
  }

  if (value === "wind-grass" || value === "seascape") {
    return "none";
  }

  return isTerrainShaderId(value) ? value : "none";
}

function normalizePlanetSurfaceTextureId(value) {
  if (
    value === "rock01" ||
    value === "rock02" ||
    value === "ice01" ||
    value === "mars01" ||
    value === "moon01"
  ) {
    return value;
  }

  return "none";
}

function normalizeVector3(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [
    Number(value[0]) || 0,
    Number(value[1]) || 0,
    Number(value[2]) || 0
  ];
}

function normalizeColor(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback;
  }

  return [
    clamp01(Number(value[0])),
    clamp01(Number(value[1])),
    clamp01(Number(value[2]))
  ];
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeOptionalNumber(value, min, max) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.min(max, Math.max(min, number));
}

function normalizeInteger(value, fallback, min, max) {
  const number = Math.round(Number(value));

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, number));
}

function randomOrbitAngle() {
  return Math.random() * Math.PI * 2;
}

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}